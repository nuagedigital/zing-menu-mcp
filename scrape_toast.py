# -*- coding: utf-8 -*-
import sys, io
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# scrape_toast.py - FINAL
import asyncio
import json
import os
import shutil
import subprocess
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import urlopen

from patchright.async_api import async_playwright
from patchright.sync_api import sync_playwright

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

TAB_ORDER = [
    "Burgers", "Wraps", "Bowls", "Sides", "Milkshakes",
    "Drinks", "Sauce", "Kids Menu", "Tender Only",
]


def clean_str(s):
    """Remove invalid unicode chars."""
    if not isinstance(s, str):
        return s
    return s.replace('\ufffd', '').replace('\u2014', '-').replace('\u2013', '-').strip()


def find_chrome():
    """Find a browser that can be launched for CDP debugging.

    GitHub Actions installs the browser through Patchright/Playwright rather than a
    system Chrome install, so checking only the default Windows Chrome paths is
    not enough.
    """
    for p in CHROME_PATHS:
        if Path(p).exists():
            return p

    for exe in (shutil.which("chrome"), shutil.which("google-chrome"), shutil.which("chromium"), shutil.which("chromium-browser")):
        if exe and Path(exe).exists():
            return exe

    try:
        with sync_playwright() as p:
            exe = p.chromium.executable_path
            if exe and Path(exe).exists():
                return exe
    except Exception:
        pass

    for base in (
        Path.home() / ".cache" / "ms-playwright",
        Path.home() / ".local" / "share" / "ms-playwright",
        Path.home() / "AppData" / "Local" / "ms-playwright",
        Path("C:/ms-playwright"),
    ):
        if not base.exists():
            continue
        for pattern in ("**/chrome.exe", "**/chromium.exe", "**/chrome-win/chrome.exe"):
            matches = sorted(base.glob(pattern))
            if matches:
                return str(matches[0])

    return None


EXTRACT_JS = r"""
() => {
    const KNOWN = ["Burgers","Wraps","Bowls","Sides","Milkshakes","Drinks","Sauce","Kids Menu","Tender Only"];

    const headings = [];
    document.querySelectorAll('h1, h2, h3, h4, h5, [role="heading"]').forEach((h) => {
        const text = (h.textContent || '').trim();
        if (!text || text.length < 3 || text.length > 40) return;
        if (text.includes('$')) return;
        const rect = h.getBoundingClientRect();
        const y = rect.top + window.scrollY;
        const lower = text.toLowerCase();
        let matchedCategory = '';
        for (const tab of KNOWN) {
            if (tab.toLowerCase() === lower) { matchedCategory = tab; break; }
        }
        headings.push({ text, y, category: matchedCategory, tag: h.tagName });
    });
    headings.sort((a, b) => a.y - b.y);

    const items = [];
    const seen = new Set();

    const cardSelectors =
        '[class*="menuItem"], [class*="MenuItem"], [class*="itemCard"], '
        + '[data-testid*="menu-item"], a[href*="/item/"]';

    document.querySelectorAll(cardSelectors).forEach((node) => {
        let name = '';
        const nameCands = node.querySelectorAll(
            '[class*="name"], [class*="Name"], h3, h4, h5, [class*="title"]'
        );
        for (const c of nameCands) {
            const t = (c.textContent || '').trim();
            if (t && t.length > 1 && t.length < 120 && !t.match(/^\$/)) {
                name = t; break;
            }
        }
        if (!name) {
            const full = (node.textContent || '').trim();
            name = full.split('\n')[0].trim().slice(0, 120);
        }
        if (!name || name.length < 2) return;

        const fullText = node.textContent || '';
        const pm = fullText.match(/\$\s*(\d+(?:\.\d{2})?)/);
        if (!pm) return;
        const price = parseFloat(pm[1]);
        if (!price || price <= 0) return;

        let description = '';
        const dcs = node.querySelectorAll(
            '[class*="description"], [class*="Description"], p'
        );
        for (const d of dcs) {
            const t = (d.textContent || '').trim();
            if (t.length > 8 && t.length < 500 && t !== name && !t.match(/^\$/)) {
                description = t; break;
            }
        }

        let image = '';
        const imgEl = node.querySelector('img');
        if (imgEl) image = imgEl.src || imgEl.getAttribute('data-src') || '';
        if (!image) {
            for (const el of [node, ...node.querySelectorAll('div, span')]) {
                const bg = (el.style && el.style.backgroundImage) || '';
                const m = bg.match(/url\(["']?(.+?)["']?\)/);
                if (m && m[1]) { image = m[1]; break; }
            }
        }
        if (image && image.startsWith('//')) image = 'https:' + image;

        let url = '';
        if (node.tagName === 'A' && node.href) url = node.href;
        if (!url) {
            const a = node.querySelector('a[href*="/item/"], a');
            if (a && a.href) url = a.href;
        }
        if (url && url.startsWith('//')) url = 'https:' + url;
        if (url && url.startsWith('/')) url = 'https://order.toasttab.com' + url;

        const itemY = node.getBoundingClientRect().top + window.scrollY;
        let category = '';
        for (let i = headings.length - 1; i >= 0; i--) {
            if (headings[i].y <= itemY && headings[i].category) {
                category = headings[i].category;
                break;
            }
        }

        const key = name.toLowerCase() + '|' + price;
        if (seen.has(key)) return;
        seen.add(key);

        items.push({ name, price, description, image, url, category });
    });

    return { headings_found: headings.map(h => ({ text: h.text, tag: h.tag, cat: h.category })), items };
}
"""


def kill_chrome():
    subprocess.run(["taskkill", "/F", "/IM", "chrome.exe", "/T"],
                   capture_output=True, shell=True)


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
            "performing security verification", "verify you are human", "just a moment",
        ])
    except Exception:
        return False


async def wait_cf(page, timeout=180):
    print("[scrape] Cloudflare - click the checkbox")
    for _ in range(timeout):
        await page.wait_for_timeout(1000)
        if not await is_cf(page):
            return True
    return False


async def scroll_all(page):
    await page.evaluate("""async () => {
        const h = document.body.scrollHeight;
        for (let y = 0; y < h; y += 400) {
            window.scrollTo(0, y);
            await new Promise(r => setTimeout(r, 180));
        }
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

        await page.wait_for_timeout(3000)

        for tab in TAB_ORDER:
            try:
                await page.evaluate(f'''
                    () => {{
                        const els = document.querySelectorAll('button, a, [role="tab"]');
                        for (const el of els) {{
                            if ((el.textContent || '').trim() === "{tab}") {{
                                el.click();
                                return true;
                            }}
                        }}
                        return false;
                    }}
                ''')
                await page.wait_for_timeout(1000)
            except Exception:
                pass

        await scroll_all(page)
        await page.wait_for_timeout(2500)

        result = await page.evaluate(EXTRACT_JS)
        raw_items = result.get("items", [])

        print(f"[scrape]   raw items: {len(raw_items)}")

        counts = {}
        for it in raw_items:
            cat = it.get("category") or "Other"
            counts[cat] = counts.get(cat, 0) + 1
        print(f"[scrape]   category counts: {counts}")

        final_items = []
        for it in raw_items:
            if not it.get("category"):
                name_low = (it.get("name") or "").lower()
                if any(k in name_low for k in ["burger", "smash", "zing"]):
                    it["category"] = "Burgers"
                elif "wrap" in name_low:
                    it["category"] = "Wraps"
                elif any(k in name_low for k in ["bowl", "platter", "salad"]):
                    it["category"] = "Bowls"
                elif any(k in name_low for k in ["fries", "coleslaw"]):
                    it["category"] = "Sides"
                elif "shake" in name_low:
                    it["category"] = "Milkshakes"
                elif any(k in name_low for k in ["lemonade", "drink", "cola", "sprite", "water"]):
                    it["category"] = "Drinks"
                elif "sauce" in name_low:
                    it["category"] = "Sauce"
                elif any(k in name_low for k in ["kids", "slider", "juice"]):
                    it["category"] = "Kids Menu"
                elif "tender" in name_low:
                    it["category"] = "Tender Only"
                else:
                    continue

            # CLEAN the item fields
            it['name'] = clean_str(it.get('name', ''))
            it['description'] = clean_str(it.get('description', ''))
            it['category'] = clean_str(it.get('category', ''))

            final_items.append(it)

        final_counts = {}
        for it in final_items:
            c = it["category"]
            final_counts[c] = final_counts.get(c, 0) + 1

        ordered = {t: final_counts.get(t, 0) for t in TAB_ORDER if final_counts.get(t)}
        print(f"[scrape]   FINAL categories: {ordered}")

        with_img = sum(1 for i in final_items if i.get("image"))
        with_desc = sum(1 for i in final_items if i.get("description"))

        print(f"[scrape] {key} DONE - {len(final_items)} items "
              f"(img:{with_img} desc:{with_desc})")

        used_tabs = [t for t in TAB_ORDER if final_counts.get(t)]

        return {"ok": True, "url": url, "tabs": used_tabs, "items": final_items}

    except Exception as e:
        # Make error safe for printing
        err_msg = clean_str(str(e))
        print(f"[scrape] {key} FAILED: {err_msg}")
        return {"ok": False, "error": err_msg, "items": [], "tabs": []}


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
        print(f"\n{loc}: {len(items)} items")
        for tab in TAB_ORDER:
            n = counts.get(tab, 0)
            mark = "OK" if n else "--"
            print(f"   {mark} {tab}: {n}")

    total = sum(len(v.get("items", [])) for v in out["locations"].values())

    WP_URL = os.environ.get("WP_URL", "")
    WP_SECRET = os.environ.get("WP_SECRET", "")

    if WP_URL and WP_SECRET:
        print(f"\n[upload] Sending {total} items to WordPress")
        try:
            payload = json.dumps(out, ensure_ascii=False).encode("utf-8")
            req = urllib.request.Request(
                WP_URL,
                data=payload,
                method="POST",
                headers={
                    "Content-Type": "application/json; charset=utf-8",
                    "x-upload-secret": WP_SECRET,
                },
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                raw = resp.read().decode("utf-8-sig")
                result = json.loads(raw)
                print(f"[upload] WordPress: {result.get('message')}")
                print(f"[upload] Items: {result.get('items')}")
        except urllib.error.HTTPError as e:
            print(f"[upload] Rejected: {e.code}")
            print(f"[upload] {e.read().decode('utf-8', errors='replace')[:300]}")
        except Exception as e:
            print(f"[upload] Failed: {clean_str(str(e))}")
    else:
        print("[upload] Skipped (WP_URL/WP_SECRET not set - local mode)")

    print(f"\n[done] {total} items -> {OUT_FILE}")


if __name__ == "__main__":
    asyncio.run(main())
