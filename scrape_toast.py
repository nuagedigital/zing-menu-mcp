# scrape_toast.py — exact Toast tabs, reliable extraction
import asyncio
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import urlopen

from patchright.async_api import async_playwright

# ------------------------------------------------------------------
# CONFIG
# ------------------------------------------------------------------
URLS = {
    "fremont": "https://order.toasttab.com/online/zingsters-4169-cushing-parkway",
    "palo_alto": "https://order.toasttab.com/online/zingsters-2-220-university-ave-b",
}

DATA_DIR = Path(__file__).parent / "data"
OUT_FILE = DATA_DIR / "toast-menu.json"
PROFILE_DIR = DATA_DIR / "chrome-profile"

CHROME_PATHS = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
]

CDP_URL = "http://127.0.0.1:9222"

# Exact Toast tabs (used to normalize any messy heading text)
KNOWN_TABS = [
    "Burgers",
    "Wraps",
    "Bowls",
    "Sides",
    "Milkshakes",
    "Drinks",
    "Sauce",
    "Kids Menu",
    "Tender Only",
]

# Extra headings to ignore (page chrome, not real categories)
IGNORED_HEADINGS = {
    "featured items",
    "menu",
    "popular",
    "specials",
    "skip to main content",
    "zingsters",
    "buy gift cards",
    "search",
    "cart",
    "checkout",
}

# ------------------------------------------------------------------
# JS — extract items + their nearest section header
# ------------------------------------------------------------------
EXTRACT_JS = r"""
() => {
    const results = [];
    const seen = new Set();

    // 1. Collect section headings with their Y position
    const headingSelectors = 'h1, h2, h3, h4, [class*="categoryName"], [class*="CategoryName"], [class*="sectionTitle"], [class*="section-header"], [class*="groupName"]';
    const headings = [];
    document.querySelectorAll(headingSelectors).forEach((h) => {
        const text = (h.textContent || '').trim();
        if (!text) return;
        if (text.length < 3 || text.length > 40) return;
        if (text.includes('$')) return;
        const rect = h.getBoundingClientRect();
        const y = rect.top + window.scrollY;
        headings.push({ text, y });
    });
    headings.sort((a, b) => a.y - b.y);

    // 2. Collect item cards
    const cardSelectors =
        '[class*="menuItem"], [class*="MenuItem"], [class*="itemCard"], '
        + '[data-testid*="menu-item"], a[href*="/item/"]';
    const cards = document.querySelectorAll(cardSelectors);

    for (const node of cards) {
        // ---- NAME ----
        let name = '';
        const nameCands = node.querySelectorAll(
            '[class*="name"], [class*="Name"], [class*="title"], h2, h3, h4, h5'
        );
        for (const c of nameCands) {
            const t = (c.textContent || '').trim();
            if (t && t.length > 1 && t.length < 120 && !t.match(/^\$/)) {
                name = t;
                break;
            }
        }
        if (!name) {
            const full = (node.textContent || '').trim();
            name = full.split('\n')[0].trim().slice(0, 120);
        }
        if (!name || name.length < 2) continue;

        // ---- PRICE ----
        const fullText = node.textContent || '';
        const pm = fullText.match(/\$\s*(\d+(?:\.\d{2})?)/);
        if (!pm) continue;
        const price = parseFloat(pm[1]);
        if (!price || price <= 0) continue;

        // ---- DESCRIPTION ----
        let description = '';
        const descCands = node.querySelectorAll(
            '[class*="description"], [class*="Description"], '
            + '[class*="subtitle"], [class*="Subtitle"], p'
        );
        for (const d of descCands) {
            const t = (d.textContent || '').trim();
            if (t.length > 8 && t.length < 500 && t !== name && !t.match(/^\$/)) {
                description = t;
                break;
            }
        }

        // ---- IMAGE ----
        let image = '';
        const imgEl = node.querySelector('img');
        if (imgEl) {
            image = imgEl.src || imgEl.getAttribute('data-src') || '';
        }
        if (!image) {
            const candidates = [node, ...node.querySelectorAll('div, span')];
            for (const el of candidates) {
                const bg = (el.style && el.style.backgroundImage) || '';
                const m = bg.match(/url\(["']?(.+?)["']?\)/);
                if (m && m[1]) { image = m[1]; break; }
            }
        }
        if (image && image.startsWith('//')) image = 'https:' + image;

        // ---- URL ----
        let url = '';
        if (node.tagName === 'A' && node.href) url = node.href;
        if (!url) {
            const l = node.querySelector('a[href*="/item/"], a[href*="/online/"]');
            if (l && l.href) url = l.href;
        }
        if (!url) {
            let p = node.parentElement;
            for (let i = 0; i < 4 && p; i++) {
                if (p.tagName === 'A' && p.href) { url = p.href; break; }
                p = p.parentElement;
            }
        }
        if (url && url.startsWith('//')) url = 'https:' + url;
        if (url && url.startsWith('/')) url = 'https://order.toasttab.com' + url;

        // ---- CATEGORY (nearest heading above) ----
        const cardY = node.getBoundingClientRect().top + window.scrollY;
        let category = '';
        for (let i = headings.length - 1; i >= 0; i--) {
            if (headings[i].y <= cardY) {
                category = headings[i].text;
                break;
            }
        }

        // ---- DEDUPE ----
        const key = name.toLowerCase() + '|' + price;
        if (seen.has(key)) continue;
        seen.add(key);

        results.push({ name, title: name, price, description, image, url, category });
    }

    return results;
}
"""


# ------------------------------------------------------------------
# HELPERS
# ------------------------------------------------------------------
def kill_chrome():
    subprocess.run(
        ["taskkill", "/F", "/IM", "chrome.exe", "/T"],
        capture_output=True,
        shell=True,
    )


def find_chrome():
    for p in CHROME_PATHS:
        if Path(p).exists():
            return p
    return None


def launch_chrome(path):
    PROFILE_DIR.mkdir(parents=True, exist_ok=True)
    subprocess.Popen(
        [
            path,
            "--remote-debugging-port=9222",
            f"--user-data-dir={PROFILE_DIR}",
            "--no-first-run",
            "--no-default-browser-check",
            "--start-maximized",
        ],
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
    )


async def wait_debug(timeout=20):
    for _ in range(timeout * 2):
        try:
            urlopen(f"{CDP_URL}/json/version", timeout=1)
            return True
        except Exception:
            await asyncio.sleep(0.5)
    return False


async def is_cloudflare(page):
    try:
        c = (await page.content()).lower()
        return any(k in c for k in [
            "performing security verification",
            "verify you are human",
            "just a moment",
        ])
    except Exception:
        return False


async def wait_cloudflare(page, timeout=180):
    print("[scrape] Cloudflare detected — click the checkbox in Chrome")
    for _ in range(timeout):
        await page.wait_for_timeout(1000)
        if not await is_cloudflare(page):
            print("[scrape] Cloudflare cleared")
            return True
    return False


def normalize_category(raw: str) -> str:
    """Map raw heading text to one of the known tabs, or drop it."""
    if not raw:
        return ""
    r = raw.strip().lower()

    # Ignore page chrome headings
    if r in IGNORED_HEADINGS:
        return ""

    # Exact match
    for tab in KNOWN_TABS:
        if tab.lower() == r:
            return tab

    # Fuzzy — heading contains a known tab name
    for tab in KNOWN_TABS:
        if tab.lower() in r:
            return tab

    # Unknown heading — keep it but tag as "Other" so it doesn't pollute tabs
    return ""


# ------------------------------------------------------------------
# SCRAPE ONE LOCATION
# ------------------------------------------------------------------
async def scrape_one(page, key, url):
    print(f"\n[scrape] {key} -> {url}")
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_timeout(3000)

        if await is_cloudflare(page):
            if not await wait_cloudflare(page, 180):
                return {"ok": False, "items": [], "tabs": []}

        await page.wait_for_timeout(3000)

        # Scroll entire page so lazy sections load
        await page.evaluate("""async () => {
            const h = document.body.scrollHeight;
            for (let y = 0; y < h; y += 500) {
                window.scrollTo(0, y);
                await new Promise(r => setTimeout(r, 200));
            }
            window.scrollTo(0, 0);
        }""")
        await page.wait_for_timeout(2500)

        raw_items = await page.evaluate(EXTRACT_JS)
        print(f"[scrape]   raw items: {len(raw_items)}")

        # Normalize categories, drop items without a recognized category
        items = []
        dropped = 0
        for it in raw_items:
            cat = normalize_category(it.get("category", ""))
            if not cat:
                dropped += 1
                continue
            it["category"] = cat
            items.append(it)

        if dropped:
            print(f"[scrape]   dropped {dropped} items without a valid category")

        # Category counts
        counts = {}
        for it in items:
            counts[it["category"]] = counts.get(it["category"], 0) + 1

        ordered_counts = {t: counts.get(t, 0) for t in KNOWN_TABS if counts.get(t, 0)}
        print(f"[scrape]   categories: {ordered_counts}")

        with_img = sum(1 for i in items if i.get("image"))
        with_desc = sum(1 for i in items if i.get("description"))
        with_url = sum(1 for i in items if i.get("url"))

        print(f"[scrape] {key} DONE — {len(items)} items "
              f"(img:{with_img} desc:{with_desc} url:{with_url})")

        # Only return tabs that actually have items
        used_tabs = [t for t in KNOWN_TABS if counts.get(t)]

        return {
            "ok": True,
            "url": url,
            "tabs": used_tabs,
            "items": items,
        }

    except Exception as e:
        print(f"[scrape] {key} FAILED: {e}")
        return {"ok": False, "error": str(e), "items": [], "tabs": []}


# ------------------------------------------------------------------
# MAIN
# ------------------------------------------------------------------
async def main():
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    kill_chrome()
    await asyncio.sleep(3)

    chrome = find_chrome()
    if not chrome:
        print("[setup] ERROR: Chrome not found.")
        return

    launch_chrome(chrome)

    if not await wait_debug(20):
        print("[setup] ERROR: debug port not open.")
        return

    out = {
        "scrapedAt": datetime.now(timezone.utc).isoformat(),
        "locations": {},
    }

    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp(CDP_URL)
        ctx = browser.contexts[0] if browser.contexts else await browser.new_context()
        page = await ctx.new_page()

        for key, url in URLS.items():
            out["locations"][key] = await scrape_one(page, key, url)

        await page.close()

    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)

    total = sum(len(v.get("items", [])) for v in out["locations"].values())
    print(f"\n[done] {total} items -> {OUT_FILE}")

    # Summary
    for loc, data in out["locations"].items():
        tabs = data.get("tabs", [])
        print(f"  {loc}: {len(data.get('items', []))} items across {len(tabs)} tabs → {tabs}")


if __name__ == "__main__":
    asyncio.run(main())