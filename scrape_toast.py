# scrape_toast.py — captures Toast category tabs + items
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

# Step 1: grab category tabs
EXTRACT_TABS_JS = r"""
() => {
    const tabs = [];
    // Toast nav tabs usually sit in a horizontal bar. Try several selectors.
    const cand = document.querySelectorAll(
        'nav a, [role="tab"], [class*="category"], [class*="Category"], '
        + '[class*="tab"], [class*="Tab"] a, [class*="menuNav"] a, '
        + '[class*="navigation"] a, header a'
    );
    const seen = new Set();
    cand.forEach((el) => {
        const t = (el.textContent || '').trim();
        if (!t) return;
        if (t.length < 2 || t.length > 30) return;
        if (t.includes('$')) return;
        if (/^(menu|order|cart|checkout|login|home|search|view cart|add|back)$/i.test(t)) return;
        if (seen.has(t.toLowerCase())) return;
        seen.add(t.toLowerCase());
        tabs.push(t);
    });
    return tabs;
}
"""

# Step 2: grab items, assigned to nearest tab when scrolled
EXTRACT_JS = r"""
() => {
    const results = [];
    const seen = new Set();

    // Collect tab positions if present in DOM
    const tabEls = document.querySelectorAll(
        '[role="tab"], nav a, [class*="category"], [class*="Category"]'
    );
    const tabPositions = [];
    tabEls.forEach((el) => {
        const t = (el.textContent || '').trim();
        if (!t || t.length < 2 || t.length > 30) return;
        if (t.includes('$')) return;
        const r = el.getBoundingClientRect();
        tabPositions.push({ text: t, y: r.top + window.scrollY });
    });
    tabPositions.sort((a, b) => a.y - b.y);

    // Also collect heading positions as fallback
    const headings = [];
    document.querySelectorAll('h1, h2, h3, h4').forEach((h) => {
        const t = (h.textContent || '').trim();
        if (!t || t.length < 2 || t.length > 50) return;
        if (t.includes('$')) return;
        const r = h.getBoundingClientRect();
        headings.push({ text: t, y: r.top + window.scrollY });
    });
    headings.sort((a, b) => a.y - b.y);

    const cards = document.querySelectorAll(
        '[class*="menuItem"], [class*="MenuItem"], [class*="itemCard"], '
        + '[data-testid*="menu-item"], a[href*="/item/"]'
    );

    cards.forEach((node) => {
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
        if (!name || name.length < 2) return;

        // PRICE
        const fullText = node.textContent || '';
        const pm = fullText.match(/\$\s*(\d+(?:\.\d{2})?)/);
        if (!pm) return;
        const price = parseFloat(pm[1]);
        if (!price || price <= 0) return;

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
        if (url && url.startsWith('/')) url = 'https://order.toasttab.com' + url;

        // CATEGORY — nearest heading above the card
        const cardY = node.getBoundingClientRect().top + window.scrollY;
        let category = 'Menu';
        for (let i = headings.length - 1; i >= 0; i--) {
            if (headings[i].y < cardY) { category = headings[i].text; break; }
        }

        const key = name.toLowerCase() + '|' + price;
        if (seen.has(key)) return;
        seen.add(key);

        results.push({ name, title: name, price, description, image, category, url });
    });

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
            urlopen(f"{CDP_URL}/json/version", timeout=1); return True
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
    print("[scrape] Cloudflare - CLICK THE CHECKBOX")
    for _ in range(timeout):
        await page.wait_for_timeout(1000)
        if not await is_cf(page):
            return True
    return False


async def scrape_one(page, key, url):
    print(f"[scrape] {key} -> {url}")
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_timeout(2000)
        if await is_cf(page):
            if not await wait_cf(page, 180):
                return {"ok": False, "items": [], "tabs": []}

        await page.wait_for_timeout(3000)

        # Grab tab names
        tabs = await page.evaluate(EXTRACT_TABS_JS)
        print(f"[scrape]   tabs: {tabs}")

        # Scroll fully to load everything
        await page.evaluate("""async () => {
            const h = document.body.scrollHeight;
            for (let y = 0; y < h; y += 600) {
                window.scrollTo(0, y);
                await new Promise(r => setTimeout(r, 200));
            }
            window.scrollTo(0, 0);
        }""")
        await page.wait_for_timeout(2000)

        items = await page.evaluate(EXTRACT_JS)

        # Build categories dict from tabs (preserving order)
        cat_counts = {}
        for it in items:
            cat_counts[it["category"]] = cat_counts.get(it["category"], 0) + 1

        with_img = sum(1 for i in items if i.get("image"))
        with_desc = sum(1 for i in items if i.get("description"))
        with_url = sum(1 for i in items if i.get("url"))
        print(f"[scrape]   {len(items)} items (img:{with_img} desc:{with_desc} url:{with_url})")
        print(f"[scrape]   item categories: {list(cat_counts.keys())}")

        return {
            "ok": True,
            "url": url,
            "tabs": tabs,       # ← Toast nav tab names in order
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
        print("[setup] ERROR: Chrome not found."); return

    launch_chrome(chrome)
    if not await wait_debug(20):
        print("[setup] ERROR: Debug port not open."); return

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
