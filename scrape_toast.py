# scrape_toast.py — clicks EVERY tab to get ALL items
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

# Extract items visible right now (used after each tab click)
EXTRACT_JS = r"""
() => {
    const results = [];
    const seen = new Set();

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

        const key = name.toLowerCase() + '|' + price;
        if (seen.has(key)) continue;
        seen.add(key);

        results.push({ name, title: name, price, description, image, url });
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


async def click_tab(page, tab_name):
    """Click a tab by its visible text. Try many strategies."""
    strategies = [
        # Exact text
        lambda: page.get_by_role("tab", name=tab_name, exact=True).click(timeout=3000),
        lambda: page.get_by_role("button", name=tab_name, exact=True).click(timeout=3000),
        lambda: page.get_by_role("link", name=tab_name, exact=True).click(timeout=3000),
        # Locator-based
        lambda: page.locator(f'button:has-text("{tab_name}")').first.click(timeout=3000),
        lambda: page.locator(f'a:has-text("{tab_name}")').first.click(timeout=3000),
        lambda: page.locator(f'[role="tab"]:has-text("{tab_name}")').first.click(timeout=3000),
        lambda: page.locator(f'text="{tab_name}"').first.click(timeout=3000),
    ]
    for i, strat in enumerate(strategies):
        try:
            await strat()
            return True
        except Exception:
            continue
    return False


async def scroll_to_load_all(page):
    """Scroll down slowly to trigger lazy loading, then scroll back up."""
    await page.evaluate("""async () => {
        const h = document.body.scrollHeight;
        for (let y = 0; y < h; y += 400) {
            window.scrollTo(0, y);
            await new Promise(r => setTimeout(r, 180));
        }
        // Extra pass to catch any late-loading items
        await new Promise(r => setTimeout(r, 800));
        window.scrollTo(0, 0);
    }""")


async def scrape_one(page, key, url):
    print(f"\n[scrape] {key} -> {url}")
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_timeout(3000)

        if await is_cf(page):
            if not await wait_cf(page, 180):
                return {"ok": False, "items": [], "tabs": []}

        # Wait for initial content
        await page.wait_for_timeout(3000)
        await scroll_to_load_all(page)
        await page.wait_for_timeout(2000)

        all_items = []
        seen_keys = set()
        tabs_found = []

        # -------------- STEP 1: "All" / Featured items (default view) --------------
        print("[scrape]   extracting default view (All/Featured)...")
        initial = await page.evaluate(EXTRACT_JS)
        for it in initial:
            it["category"] = ""  # will assign later if it matches a tab
            k = f"{it['name'].lower()}|{it['price']}"
            if k not in seen_keys:
                seen_keys.add(k)
                all_items.append(it)
        print(f"[scrape]     default view: {len(initial)} items")

        # -------------- STEP 2: Click each tab --------------
        for tab_name in KNOWN_TABS:
            print(f"[scrape]   clicking tab: {tab_name}")

            ok = await click_tab(page, tab_name)
            if not ok:
                print(f"[scrape]     ✗ couldn't click '{tab_name}'")
                continue

            tabs_found.append(tab_name)

            # Wait for content to load, then scroll to trigger lazy items
            await page.wait_for_timeout(2500)
            await scroll_to_load_all(page)
            await page.wait_for_timeout(1500)

            items = await page.evaluate(EXTRACT_JS)

            added = 0
            for it in items:
                it["category"] = tab_name  # assign the clicked tab as category
                k = f"{it['name'].lower()}|{it['price']}"
                if k in seen_keys:
                    # Already seen — but update category if it was blank
                    for existing in all_items:
                        if f"{existing['name'].lower()}|{existing['price']}" == k:
                            if not existing.get("category"):
                                existing["category"] = tab_name
                            break
                    continue
                seen_keys.add(k)
                all_items.append(it)
                added += 1

            print(f"[scrape]     ✓ {tab_name}: {len(items)} items on page, {added} new")

        # -------------- STEP 3: Assign any remaining blank categories --------------
        # Items from the default view that didn't match a tab get "Menu" or "Other"
        blanks = 0
        for it in all_items:
            if not it.get("category"):
                it["category"] = "Other"
                blanks += 1
        if blanks:
            print(f"[scrape]   {blanks} items not in any known tab (tagged 'Other')")

        # -------------- STEP 4: Summary --------------
        counts = {}
        for it in all_items:
            counts[it["category"]] = counts.get(it["category"], 0) + 1

        # Order by KNOWN_TABS
        ordered = {}
        for t in KNOWN_TABS:
            if counts.get(t):
                ordered[t] = counts[t]
        if counts.get("Other"):
            ordered["Other"] = counts["Other"]

        print(f"[scrape]   final categories: {ordered}")

        with_img = sum(1 for i in all_items if i.get("image"))
        with_desc = sum(1 for i in all_items if i.get("description"))
        with_url = sum(1 for i in all_items if i.get("url"))
        print(f"[scrape] {key} DONE — {len(all_items)} items "
              f"(img:{with_img} desc:{with_desc} url:{with_url})")

        # Tabs that actually had items
        used_tabs = [t for t in KNOWN_TABS if counts.get(t)]

        return {
            "ok": True,
            "url": url,
            "tabs": used_tabs,
            "items": all_items,
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

    print(f"\n{'='*60}")
    for loc, data in out["locations"].items():
        items = data.get("items", [])
        counts = {}
        for it in items:
            counts[it["category"]] = counts.get(it["category"], 0) + 1
        print(f"{loc}: {len(items)} items")
        for cat, n in counts.items():
            print(f"    {cat}: {n}")

    total = sum(len(v.get("items", [])) for v in out["locations"].values())
    print(f"\n[done] {total} items -> {OUT_FILE}")


if __name__ == "__main__":
    asyncio.run(main())