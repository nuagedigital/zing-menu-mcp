# scrape_toast.py — full data scraper with proper categories
import asyncio
import json
import os
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

# Toast page uses category tabs/sections. This captures each section header
# and the items underneath it.
EXTRACT_JS = r"""
() => {
    const results = [];

    // ---- Strategy 1: Walk all menu item cards and find their nearest category header ----
    const cards = document.querySelectorAll(
        '[class*="menuItem"], [class*="MenuItem"], [class*="itemCard"], '
        + '[data-testid*="menu-item"], a[href*="/item/"]'
    );

    // Collect all category header candidates with their document position
    const headers = [];
    document.querySelectorAll('h1, h2, h3, h4, [class*="categoryName"], [class*="CategoryName"], [role="heading"]').forEach((h) => {
        const text = (h.textContent || '').trim();
        if (!text || text.length < 2 || text.length > 50) return;
        if (text.includes('$')) return;
        if (/^menu$/i.test(text)) return;
        // Get Y position
        const rect = h.getBoundingClientRect();
        headers.push({ text, y: rect.top + window.scrollY, el: h });
    });
    // Sort by document position
    headers.sort((a, b) => a.y - b.y);

    const seen = new Set();

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
        const priceMatch = fullText.match(/\$\s*(\d+(?:\.\d{2})?)/);
        if (!priceMatch) return;
        const price = parseFloat(priceMatch[1]);
        if (!price || price <= 0) return;

        // DESCRIPTION
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

        // IMAGE
        let image = '';
        const imgEl = node.querySelector('img');
        if (imgEl) image = imgEl.src || imgEl.getAttribute('data-src') || '';
        if (!image) {
            const bgEls = [node, ...node.querySelectorAll('div, span')];
            for (const el of bgEls) {
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
            const linkEl = node.querySelector('a[href*="/item/"], a[href*="/online/"]');
            if (linkEl && linkEl.href) url = linkEl.href;
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

        // CATEGORY — nearest header ABOVE the card
        const cardRect = node.getBoundingClientRect();
        const cardY = cardRect.top + window.scrollY;
        let category = '';
        for (let i = headers.length - 1; i >= 0; i--) {
            if (headers[i].y < cardY) {
                category = headers[i].text;
                break;
            }
        }
        if (!category) category = 'Menu';

        // DEDUPE
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


def launch_chrome(chrome_path):
    PROFILE_DIR.mkdir(parents=True, exist_ok=True)
    print(f"[setup] Launching Chrome (debug port 9222)")
    subprocess.Popen(
        [
            chrome_path,
            "--remote-debugging-port=9222",
            f"--user-data-dir={PROFILE_DIR}",
            "--no-first-run",
            "--no-default-browser-check",
            "--start-maximized",
        ],
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
    )


async def wait_for_debug_port(timeout=20):
    for i in range(timeout * 2):
        try:
            urlopen(f"{CDP_URL}/json/version", timeout=1)
            print(f"[setup] Debug port ready")
            return True
        except Exception:
            await asyncio.sleep(0.5)
    return False


async def is_cloudflare(page):
    try:
        c = (await page.content()).lower()
        return (
            "performing security verification" in c
            or "verify you are human" in c
            or "just a moment" in c
        )
    except Exception:
        return False


async def wait_cloudflare(page, timeout=180):
    print("[scrape] Cloudflare detected - CLICK THE CHECKBOX in Chrome")
    for i in range(timeout):
        await page.wait_for_timeout(1000)
        if not await is_cloudflare(page):
            print(f"[scrape] Cleared after {i+1}s")
            return True
    return False


async def scrape_one(page, key, url):
    print(f"[scrape] {key} -> {url}")
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_timeout(2000)

        if await is_cloudflare(page):
            if not await wait_cloudflare(page, timeout=180):
                return {"ok": False, "url": url, "error": "Cloudflare blocked", "items": []}

        await page.wait_for_timeout(3000)

        # Scroll through the page to load lazy content
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

        # Count categories
        categories = {}
        for it in items:
            categories[it["category"]] = categories.get(it["category"], 0) + 1

        with_img = sum(1 for i in items if i.get("image"))
        with_desc = sum(1 for i in items if i.get("description"))
        with_url = sum(1 for i in items if i.get("url"))

        print(f"[scrape] {key} OK - {len(items)} items")
        print(f"[scrape]   img:{with_img} desc:{with_desc} url:{with_url}")
        print(f"[scrape]   categories: {list(categories.keys())}")

        return {
            "ok": True,
            "url": url,
            "items": items,
            "categories": list(categories.keys()),
        }
    except Exception as e:
        print(f"[scrape] {key} FAILED: {e}")
        return {"ok": False, "url": url, "error": str(e), "items": []}


async def main():
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    kill_chrome()
    await asyncio.sleep(3)

    chrome_path = find_chrome()
    if not chrome_path:
        print("[setup] ERROR: Chrome not found.")
        return

    launch_chrome(chrome_path)

    if not await wait_for_debug_port(timeout=20):
        print("[setup] ERROR: Chrome debug port never opened.")
        return

    out = {
        "scrapedAt": datetime.now(timezone.utc).isoformat(),
        "locations": {},
    }

    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp(CDP_URL)
        context = browser.contexts[0] if browser.contexts else await browser.new_context()
        page = await context.new_page()

        for key, url in URLS.items():
            out["locations"][key] = await scrape_one(page, key, url)

        await page.close()

    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)

    total = sum(len(v.get("items", [])) for v in out["locations"].values())
    print(f"\n[done] Saved {total} items -> {OUT_FILE}")


if __name__ == "__main__":
    asyncio.run(main())
