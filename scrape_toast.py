# scrape_toast.py — exact Toast tabs, reliable extraction
import asyncio
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import urlopen

from patchright.async_api import async_playwright

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

# Exact Toast tabs (from the live site)
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

# Extract every item AND its nearest section header (which is a tab name)
EXTRACT_JS = r"""
() => {
    const results = [];
    const seen = new Set();

    // 1. Collect all section headings with their position on the page
    const headings = [];
    document.querySelectorAll('h1, h2, h3, h4, [class*="categoryName"], [class*="CategoryName"], [class*="sectionTitle"]').forEach((h) => {
        const text = (h.textContent || '').trim();
        if (!text || text.length < 3 || text.length > 40) return;
        if (text.includes('$')) return;
        const rect = h.getBoundingClientRect();
        const y = rect.top + window.scrollY;
        headings.push({ text, y });
    });
    headings.sort((a, b) => a.y - b.y);

    // 2. Collect all item cards
    const cards = document.querySelectorAll(
        '[class*="menuItem"], [class*="MenuItem"], [class*="itemCard"], '
        + '[data-testid*="menu-item"], a[href*="/item/"]'
    );

    for (const node of cards) {
        // NAME
        let name = '';
        const nameCands = node.querySelectorAll(
            '[class*="name"], [class*="Name"], [class*="title"], h2, h3, h4, h5'
        );
        for (const c of nameCands) {
            const t = (c.textContent || '').trim();
            if (t && t.length > 1 && t.length < 120 && !t.match(/^\$/)) { name = t; break; }
        }
        if (!name) {
            const full = (node.textContent || '').trim();
            name = full.split('\n')[0].trim().slice(0, 120);
        }
        if (!name || name.length < 2) continue;

        // PRICE
        const fullText = node.textContent || '';
        const pm = fullText.match(/\$\s*(\d+(?:\.\d{2})?)/);
        if (!pm) continue;
        const price = parseFloat(pm[1]);
        if (!price || price <= 0) continue;

        // DESCRIPTION
        let description = '';
        const dcs = node.querySelectorAll(
            '[class*="description"], [class*="Description"], '
            + '[class*="subtitle"], [class*="Subtitle"], p'
        );
        for (const d of dcs) {
            const t = (d.textContent || '').trim();
            if (t.length > 8 && t.length < 500 && t !== name && !t.match(/^\$/)) {
                description = t; break;
            }
        }

        // IMAGE
        let image = '';
        const imgEl = node.querySelector('img');
        if (imgEl) image = imgEl.src || imgEl.getAttribute('data-src') || '';
        if (!image) {
            const bgs = [node, ...node.querySelectorAll('div, span')];
            for (const el of bgs) {
                const bg = (el.style && el.style.backgroundImage) || '';
                const m = bg.match(/url\(["']?(.+?)["']?\)/);
                if (m && m[1]) { image = m[1]; break; }
            }
        }
        if (image && image.startsWith('//')) image = 'https:' + image;

        // URL
        let url = '';
        if (node.tagName === 'A' && node.href) url = node.href;
        if (!url) {
            const l = node.querySelector('a[href*="/item/"], a[href*="/online/"]');
            if (l && l.href) url = l.href;
        }
        if (url && url.startsWith('//')) url = 'https:' + url;
        if (url && url.startsWith('/')) url = 'https://order.toasttab.com' + url;

        // CATEGORY — nearest heading above this card
        const cardY = node.getBoundingClientRect().top + window.scrollY;
        let category = '';
        for (let i = headings.length - 1; i >= 0; i--) {
            if (headings[i].y <= cardY) {
                category = headings[i].text;
                break;
            }
        }

        const key = name.toLowerCase() + '|' + price;
        if (seen.has(key)) continue;
        seen.add(key);

        results.push({ name, title: name, price, description, image, url, category });
    }
    return results;
}
"""


def kill_chrome():
    subprocess.run(["taskkill", "/F", "/IM", "chrome.exe", "/T"],
                   capture_output=True, shell=True)


def find_chrome():
    for p in CHROME_PATHS:
        if Path(p).exists():
            return p
    return None


def launch_chrome(path):
    PROFILE_DIR.mkdir(parents=True, exist_ok=True)
    subprocess.Popen(
        [path, "--remote-debugging-port=9222",
         f"--user-data-dir={PROFILE_DIR}",
         "--no-first-run", "--no-default-browser-check", "--start-maximized"],
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


async def is_cf(page):
    try:
        c = (await page.content()).lower()
        return any(k in c for k in [
            "performing security verification",
            "verify you are human",
            "just a moment",
        ])
    except Exception:
        return False


async def wait_cf(page, timeout=180):
    print("[scrape] Cloudflare — Chrome mein checkbox click karo")
    for _ in range(timeout):
        await page.wait_for_timeout(1000)
        if not await is_cf(page):
            return True
    return False


def normalize_category(raw: str) -> str:
    """Map the raw heading to one of our KNOWN_TABS, or return as-is."""
    if not raw:
        return "Menu"
    r = raw.strip().lower()
    for tab in KNOWN_TABS:
        if tab.lower() == r:
            return tab
    # Fuzzy: check if the heading contains any tab name
    for tab in KNOWN_TABS:
        if tab.lower() in r:
            return tab
    return raw.strip()


async def scrape_one(page, key, url):
    print(f"\n[scrape] {key} -> {url}")
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_timeout(3000)

        if await is_cf(page):
            if not await wait_cf(page, 180):
                return {"ok": False, "items": [], "tabs": []}

        await page.wait_for_timeout(3000)

        # Scroll the whole page so every section loads
        await page.evaluate("""async () => {
            const h = document.body.scrollHeight;
            for (let y = 0; y < h; y += 500) {
                window.scrollTo(0, y);
                await new Promise(r => setTimeout(r, 200));
            }
            window.scrollTo(0, 0);
        }""")
        await page.wait_for_timeout(2500)

        items = await page.evaluate(EXTRACT_JS)
        print(f"[scrape]   raw items: {len(items)}")

        # Normalize categories
        for it in items:
            it["category"] = normalize_category(it.get("category", ""))

        # Count per category
        counts = {}
        for it in items:
            counts[it["category"]] = counts.get(it["category"], 0) + 1
        print(f"[scrape]   categories: {counts}")

        with_img = sum(1 for i in items if i.get("image"))
        with_desc = sum(1 for i in items if i.get("description"))
        with_url = sum(1 for i in items if i.get("url"))
        print(f"[scrape] {key} DONE — {len(items)} items (img:{with_img} desc:{with_desc} url:{with_url})")

        # Only return tabs that actually appeared
        used = [t for t in KNOWN_TABS if t in counts]

        return {
            "ok": True,
            "url": url,
            "tabs": used,
            "items": items,
        }

    except Exception as e:
        print(f"[scrape] {key} FAILED: {e}")
        return {"ok": False, "error": str(e), "items": [], "tabs": []}


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


if __name__ == "__main__":
    asyncio.run(main())