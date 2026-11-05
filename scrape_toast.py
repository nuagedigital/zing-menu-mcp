# -*- coding: utf-8 -*-
"""Scrape Zingsters Toast menus and refresh product image URLs automatically."""
import asyncio
import io
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import urlopen

from patchright.async_api import async_playwright
from patchright.sync_api import sync_playwright

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

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
TAB_ORDER = ["Burgers", "Wraps", "Bowls", "Sides", "Milkshakes", "Drinks", "Sauce", "Kids Menu", "Tender Only"]
MIN_ITEMS_PER_LOCATION = int(os.environ.get("MIN_ITEMS_PER_LOCATION", "20"))
CF_WAIT_SECONDS = int(os.environ.get("CF_WAIT_SECONDS", "180"))


def clean_str(value):
    if not isinstance(value, str):
        return value
    return value.replace("\ufffd", "").replace("\u2014", "-").replace("\u2013", "-").strip()


def find_chrome():
    for path in CHROME_PATHS:
        if Path(path).exists():
            return path
    for path in (shutil.which("chrome"), shutil.which("google-chrome"),
                 shutil.which("chromium"), shutil.which("chromium-browser")):
        if path and Path(path).exists():
            return path
    try:
        with sync_playwright() as p:
            path = p.chromium.executable_path
            if path and Path(path).exists():
                return path
    except Exception:
        pass
    for base in (Path.home() / ".cache" / "ms-playwright",
                 Path.home() / ".local" / "share" / "ms-playwright",
                 Path.home() / "AppData" / "Local" / "ms-playwright",
                 Path("C:/ms-playwright")):
        if base.exists():
            for pattern in ("**/chrome.exe", "**/chromium.exe", "**/chrome-win/chrome.exe"):
                matches = sorted(base.glob(pattern))
                if matches:
                    return str(matches[0])
    return None


EXTRACT_JS = r"""
() => {
    const KNOWN = ["Burgers","Wraps","Bowls","Sides","Milkshakes","Drinks","Sauce","Kids Menu","Tender Only"];
    const headings = [];
    document.querySelectorAll('h1, h2, h3, h4, h5, [role="heading"]').forEach(h => {
        const text = (h.textContent || '').trim();
        if (!text || text.length < 3 || text.length > 40 || text.includes('$')) return;
        const y = h.getBoundingClientRect().top + window.scrollY;
        const category = KNOWN.find(t => t.toLowerCase() === text.toLowerCase()) || '';
        headings.push({text, y, category, tag: h.tagName});
    });
    headings.sort((a, b) => a.y - b.y);

    function validImage(url) {
        if (!url || typeof url !== 'string') return '';
        url = url.trim();
        if (!url || url.startsWith('data:') || url.startsWith('blob:')) return '';
        try {
            const resolved = new URL(url, document.baseURI);
            if (!['http:', 'https:'].includes(resolved.protocol)) return '';
            return resolved.href;
        } catch (_) { return ''; }
    }

    function imageFrom(node) {
        const candidates = [];
        const add = (value) => {
            const url = validImage(value);
            if (url && /cloudfront\.net|toasttab|\.jpe?g(?:\?|$)|\.png(?:\?|$)|\.webp(?:\?|$)/i.test(url)) {
                candidates.push(url);
            }
        };
        for (const img of node.querySelectorAll('img')) {
            for (const attr of ['srcset', 'data-srcset']) {
                const srcset = img.getAttribute(attr) || '';
                for (const entry of srcset.split(',')) add(entry.trim().split(/\s+/)[0]);
            }
            for (const src of [img.currentSrc, img.getAttribute('src'),
                img.getAttribute('data-src'), img.getAttribute('data-lazy-src'),
                img.getAttribute('data-original')]) add(src);
        }
        for (const el of [node, ...node.querySelectorAll('div, span, picture')]) {
            const bg = window.getComputedStyle(el).backgroundImage || '';
            const match = bg.match(/url\(["']?(.+?)["']?\)/);
            if (match) add(match[1]);
        }
        // Toast CDN URLs are signed: choose the best *existing* URL; never edit its resize path.
        const size = url => {
            const m = url.match(/resize:(?:fit|fill|cover):(\d+):(\d+)/i);
            return m ? Math.min(+m[1], +m[2]) : 0;
        };
        candidates.sort((a, b) => size(b) - size(a));
        return candidates[0] || '';
    }

    const items = [];
    const index = new Map();
    const cardSelectors = '[class*="menuItem"], [class*="MenuItem"], [class*="itemCard"], '
        + '[data-testid*="menu-item"], a[href*="/item/"]';
    document.querySelectorAll(cardSelectors).forEach(node => {
        let name = '';
        const nameCands = node.querySelectorAll('[class*="name"], [class*="Name"], h3, h4, h5, [class*="title"]');
        for (const c of nameCands) {
            const t = (c.textContent || '').trim();
            if (t && t.length > 1 && t.length < 120 && !/^\$/.test(t)) { name = t; break; }
        }
        if (!name) name = (node.textContent || '').trim().split('\n')[0].trim().slice(0, 120);
        if (!name || name.length < 2) return;
        const fullText = node.textContent || '';
        const pm = fullText.match(/\$\s*(\d+(?:\.\d{2})?)/);
        if (!pm) return;
        const price = parseFloat(pm[1]);
        if (!price || price <= 0) return;
        let description = '';
        for (const d of node.querySelectorAll('[class*="description"], [class*="Description"], p')) {
            const t = (d.textContent || '').trim();
            if (t.length > 8 && t.length < 500 && t !== name && !/^\$/.test(t)) {
                description = t; break;
            }
        }
        const image = imageFrom(node);
        let url = '';
        if (node.tagName === 'A' && node.href) url = node.href;
        if (!url) {
            const a = node.querySelector('a[href*="/item/"], a');
            if (a && a.href) url = a.href;
        }
        if (url) {
            try { url = new URL(url, document.baseURI).href; } catch (_) { url = ''; }
        }
        const itemY = node.getBoundingClientRect().top + window.scrollY;
        let category = '';
        for (let i = headings.length - 1; i >= 0; i--) {
            if (headings[i].y <= itemY && headings[i].category) {
                category = headings[i].category; break;
            }
        }
        const key = (url && url.includes('/item') ? url : name.toLowerCase() + '|' + price);
        const item = {name, price, description, image, url, category};
        if (index.has(key)) {
            const old = items[index.get(key)];
            // Nested card selectors may describe the same item. Prefer richer data.
            if (!old.image && item.image) old.image = item.image;
            if (!old.description && item.description) old.description = item.description;
            if (!old.category && item.category) old.category = item.category;
        } else {
            index.set(key, items.length);
            items.push(item);
        }
    });
    return {headings_found: headings.map(h => ({text:h.text, tag:h.tag, cat:h.category})), items};
}
"""


def kill_chrome():
    if os.name == "nt" and os.environ.get("KILL_CHROME", "1") == "1":
        subprocess.run(["taskkill", "/F", "/IM", "chrome.exe", "/T"],
                       capture_output=True, shell=False)


def launch_chrome(path):
    PROFILE_DIR.mkdir(parents=True, exist_ok=True)
    args = [path, "--remote-debugging-port=9222", f"--user-data-dir={PROFILE_DIR}",
            "--no-first-run", "--no-default-browser-check", "--start-maximized"]
    kwargs = {}
    if os.name == "nt":
        kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
    subprocess.Popen(args, **kwargs)


async def wait_debug(timeout=20):
    for _ in range(timeout * 2):
        try:
            with urlopen(f"{CDP_URL}/json/version", timeout=1) as response:
                if response.status == 200:
                    return True
        except Exception:
            await asyncio.sleep(0.5)
    return False


async def is_cf(page):
    try:
        content = (await page.content()).lower()
        return any(term in content for term in (
            "performing security verification", "verify you are human", "just a moment"))
    except Exception:
        return False


async def wait_cf(page, timeout=180):
    print("[scrape] Cloudflare verification detected")
    for _ in range(timeout):
        await page.wait_for_timeout(1000)
        if not await is_cf(page):
            return True
    return False


async def scroll_all(page):
    # Scroll repeatedly to load images and menu cards which use IntersectionObserver.
    await page.evaluate("""async () => {
        const pause = ms => new Promise(r => setTimeout(r, ms));
        let previousHeight = 0;
        for (let pass = 0; pass < 3; pass++) {
            const height = document.body.scrollHeight;
            for (let y = 0; y < height; y += 350) {
                window.scrollTo(0, y);
                await pause(130);
            }
            await pause(650);
            if (height === previousHeight) break;
            previousHeight = height;
        }
        window.scrollTo(0, 0);
        await pause(750);
    }""")
    # Allow pending lazy image requests to settle, without requiring every analytics request.
    try:
        await page.wait_for_load_state("networkidle", timeout=10000)
    except Exception:
        pass


async def scrape_one(page, key, url):
    print(f"\n[scrape] {key} -> {url}")
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_timeout(3000)
        if await is_cf(page) and not await wait_cf(page, CF_WAIT_SECONDS):
            return {"ok": False, "error": "Cloudflare verification timeout", "items": [], "tabs": []}
        await page.wait_for_timeout(3000)
        for tab in TAB_ORDER:
            try:
                await page.evaluate("""tab => {
                    const els = document.querySelectorAll('button, a, [role="tab"]');
                    for (const el of els) {
                        if ((el.textContent || '').trim() === tab) { el.click(); return true; }
                    }
                    return false;
                }""", tab)
                await page.wait_for_timeout(800)
            except Exception:
                pass
        await scroll_all(page)
        await page.wait_for_timeout(1500)
        result = await page.evaluate(EXTRACT_JS)
        raw_items = result.get("items", [])
        print(f"[scrape] raw items: {len(raw_items)}")
        final_items = []
        for item in raw_items:
            if not item.get("category"):
                name = (item.get("name") or "").lower()
                if any(t in name for t in ("burger", "smash", "zing")):
                    item["category"] = "Burgers"
                elif "wrap" in name:
                    item["category"] = "Wraps"
                elif any(t in name for t in ("bowl", "platter", "salad")):
                    item["category"] = "Bowls"
                elif any(t in name for t in ("fries", "coleslaw")):
                    item["category"] = "Sides"
                elif "shake" in name:
                    item["category"] = "Milkshakes"
                elif any(t in name for t in ("lemonade", "drink", "cola", "sprite", "water")):
                    item["category"] = "Drinks"
                elif "sauce" in name:
                    item["category"] = "Sauce"
                elif any(t in name for t in ("kids", "slider", "juice")):
                    item["category"] = "Kids Menu"
                elif "tender" in name:
                    item["category"] = "Tender Only"
                else:
                    continue
            for field in ("name", "description", "category"):
                item[field] = clean_str(item.get(field, ""))
            final_items.append(item)
        if len(final_items) >= MIN_ITEMS_PER_LOCATION:
            await refresh_detail_images(page, final_items)
        if len(final_items) < MIN_ITEMS_PER_LOCATION:
            return {"ok": False, "error": f"Only {len(final_items)} items scraped; minimum {MIN_ITEMS_PER_LOCATION}",
                    "items": [], "tabs": []}
        counts = {}
        for item in final_items:
            cat = item["category"]
            counts[cat] = counts.get(cat, 0) + 1
        used_tabs = [tab for tab in TAB_ORDER if counts.get(tab)]
        with_images = sum(bool(item.get("image")) for item in final_items)
        print(f"[scrape] {key}: {len(final_items)} items, {with_images} images; categories {counts}")
        return {"ok": True, "url": url, "tabs": used_tabs, "items": final_items}
    except Exception as exc:
        message = clean_str(str(exc))
        print(f"[scrape] {key} FAILED: {message}")
        return {"ok": False, "error": message, "items": [], "tabs": []}


# Toast sometimes renders a stale thumbnail on the menu card while the item
# detail dialog has the newly published image. Check detail views for every item.
DETAIL_IMAGES = os.environ.get("DETAIL_IMAGES", "1") == "1"
DETAIL_WAIT_MS = int(os.environ.get("DETAIL_WAIT_MS", "350"))


DETAIL_IMAGE_JS = r"""() => {
  const candidates = [...document.querySelectorAll(
    '[role="dialog"] img, [aria-modal="true"] img, [data-testid*="modal"] img, [class*="Modal"] img, [class*="modal"] img'
  )];
  const scored = candidates.flatMap(img => {
    const rect = img.getBoundingClientRect();
    if (rect.width * rect.height <= 5000) return [];
    const urls = [img.currentSrc, img.getAttribute('src'), img.getAttribute('data-src')];
    for (const attr of ['srcset', 'data-srcset']) {
      for (const entry of (img.getAttribute(attr) || '').split(','))
        urls.push(entry.trim().split(/\s+/)[0]);
    }
    return urls.filter(src => src && /cloudfront\.net|toasttab/i.test(src))
      .map(src => ({src, area: rect.width * rect.height,
        size: +(src.match(/resize:(?:fit|fill|cover):(\d+):(\d+)/i) || [0,0])[1]}));
  });
  scored.sort((a,b) => b.size - a.size || b.area - a.area);
  return scored.length ? scored[0].src : '';
}"""


# Detail-page fallback for Toast items that navigate instead of opening a dialog.
# The image must be a large, visible Toast CDN image inside the product view.
DETAIL_PAGE_IMAGE_JS = r"""() => {
  const roots = [...document.querySelectorAll('main, [role="main"], [role="dialog"]')];
  const root = roots.find(el => /\$\s*\d/.test(el.innerText || '')) || document.querySelector('main');
  if (!root) return '';
  const candidates = [...root.querySelectorAll('img')].flatMap(img => {
    const r = img.getBoundingClientRect();
    if (r.width * r.height < 20000) return [];
    const urls = [img.currentSrc, img.getAttribute('src')];
    for (const attr of ['srcset', 'data-srcset']) {
      for (const entry of (img.getAttribute(attr) || '').split(','))
        urls.push(entry.trim().split(/\s+/)[0]);
    }
    return urls.filter(src => src && /cloudfront\.net/.test(src) && /\/plain\//.test(src))
      .map(src => ({src, area: r.width * r.height,
        size: +(src.match(/resize:(?:fit|fill|cover):(\d+):(\d+)/i) || [0,0])[1]}));
  });
  candidates.sort((a,b) => b.size - a.size || b.area - a.area);
  return candidates.length ? candidates[0].src : '';
}"""


async def refresh_detail_images(page, items):
    """Prefer the current Toast detail image; retain card image if unverified."""
    if not DETAIL_IMAGES:
        return
    changed = checked = 0
    detail_page = await page.context.new_page()
    try:
        for item in items:
            item_url = (item.get("url") or "").split("?", 1)[0]
            if "/item-" not in item_url:
                continue
            fresh_url = ""
            try:
                # First try Toast's product overlay.
                opened = await page.evaluate("""url => {
                    const link = [...document.querySelectorAll('a[href*="/item-"]')]
                        .find(a => a.href.split('?')[0] === url);
                    if (!link) return false;
                    link.scrollIntoView({block:'center'});
                    link.click();
                    return true;
                }""", item_url)
                if opened:
                    await page.wait_for_timeout(DETAIL_WAIT_MS)
                    if "/item-" not in page.url:
                        fresh_url = await page.evaluate(DETAIL_IMAGE_JS)
                        await page.keyboard.press("Escape")
                    else:
                        await page.go_back(wait_until="domcontentloaded", timeout=30000)
                        await page.wait_for_timeout(350)
                if not fresh_url:
                    # A separate item page can contain a newer image than the card.
                    await detail_page.goto(item_url, wait_until="domcontentloaded", timeout=30000)
                    await detail_page.wait_for_timeout(900)
                    if not await is_cf(detail_page):
                        fresh_url = await detail_page.evaluate(DETAIL_PAGE_IMAGE_JS)
                if fresh_url:
                    checked += 1
                    selected = best_image(fresh_url, item.get("image") or "")
                    if toast_asset_id(selected) != toast_asset_id(item.get("image") or ""):
                        print(f"[detail-images] IMAGE ASSET UPDATED {item.get('name')}")
                        changed += 1
                    item["image"] = selected
                else:
                    print(f"[detail-images] NO VERIFIED IMAGE {item.get('name')}; keeping card URL")
            except Exception as exc:
                print(f"[detail-images] {item.get('name')}: skipped ({str(exc)[:120]})")
                try:
                    if "/item-" in page.url:
                        await page.go_back(wait_until="domcontentloaded", timeout=30000)
                    else:
                        await page.keyboard.press("Escape")
                except Exception:
                    pass
    finally:
        await detail_page.close()
    print(f"[detail-images] verified {checked} detail images; replaced {changed} URLs")


def toast_asset_id(url):
    """Identify original Toast image independent of signed CDN URL or resize."""
    if not url or '/plain/' not in url:
        return None
    return url.split('/plain/', 1)[1].split('?', 1)[0]


def image_resolution(url):
    """Approximate smallest requested CDN dimension; zero means unknown."""
    match = re.search(r'/resize:(?:fit|fill|cover):(\d+):(\d+)', url or '', re.I)
    return min(int(match.group(1)), int(match.group(2))) if match else 0


def best_image(new_url, old_url):
    """Keep a known higher-res signed URL when the underlying image is unchanged."""
    if not new_url:
        return old_url or ''
    if not old_url:
        return new_url
    new_asset, old_asset = toast_asset_id(new_url), toast_asset_id(old_url)
    if new_asset and old_asset and new_asset == old_asset:
        return old_url if image_resolution(old_url) > image_resolution(new_url) else new_url
    return new_url


def item_key(item):
    # Toast item URL is a stronger identity than a potentially edited name/price.
    url = item.get("url") or ""
    if "/item" in url:
        return ("url", url.split("?", 1)[0])
    return ("name", (item.get("name") or "").strip().casefold())


def preserve_missing_images(current, previous):
    """Keep prior images only when fresh scraping returned no image for an item."""
    old_items = previous.get("items", []) if isinstance(previous, dict) else []
    old_by_key = {item_key(item): item for item in old_items}
    old_by_name = {(item.get("name") or "").strip().casefold(): item for item in old_items}
    updated = 0
    retained = 0
    for item in current.get("items", []):
        old = old_by_key.get(item_key(item)) or old_by_name.get((item.get("name") or "").strip().casefold())
        if not old:
            continue
        fresh_image = item.get("image") or ""
        old_image = old.get("image") or ""
        if fresh_image:
            selected = best_image(fresh_image, old_image)
            item["image"] = selected
            if toast_asset_id(fresh_image) != toast_asset_id(old_image) and fresh_image != old_image:
                updated += 1
                print(f"[images] IMAGE ASSET UPDATED {item.get('name')}")
            elif selected == old_image and selected != fresh_image:
                print(f"[images] PRESERVED HIGHER RESOLUTION {item.get('name')}: {image_resolution(old_image)}px")
        elif old_image:
            item["image"] = old_image
            retained += 1
    return updated, retained


def load_previous():
    if not OUT_FILE.exists():
        return {"locations": {}}
    try:
        with OUT_FILE.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, ValueError) as exc:
        print(f"[warning] Existing JSON cannot be read: {exc}")
        return {"locations": {}}


def save_json_atomic(data):
    temp_file = OUT_FILE.with_suffix(".json.tmp")
    with temp_file.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2, ensure_ascii=False)
    temp_file.replace(OUT_FILE)


def upload_wordpress(data):
    wp_url = os.environ.get("WP_URL", "")
    wp_secret = os.environ.get("WP_SECRET", "")
    if not wp_url or not wp_secret:
        print("[upload] Skipped (WP_URL/WP_SECRET not set)")
        return
    total = sum(len(loc.get("items", [])) for loc in data["locations"].values())
    print(f"[upload] Sending {total} items to WordPress")
    try:
        request = urllib.request.Request(
            wp_url,
            data=json.dumps(data, ensure_ascii=False).encode("utf-8"),
            method="POST",
            headers={"Content-Type": "application/json; charset=utf-8", "x-upload-secret": wp_secret},
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            result = json.loads(response.read().decode("utf-8-sig"))
            print(f"[upload] WordPress: {result.get('message')}; items: {result.get('items')}")
    except urllib.error.HTTPError as exc:
        print(f"[upload] Rejected: {exc.code}; {exc.read().decode('utf-8', errors='replace')[:300]}")
    except Exception as exc:
        print(f"[upload] Failed: {clean_str(str(exc))}")


async def main():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    previous = load_previous()
    kill_chrome()
    await asyncio.sleep(3)
    chrome = find_chrome()
    if not chrome:
        raise RuntimeError("Chrome/Chromium not found")
    launch_chrome(chrome)
    if not await wait_debug(20):
        raise RuntimeError("Chrome debugging port did not open")

    out = {"scrapedAt": datetime.now(timezone.utc).isoformat(), "locations": {}}
    async with async_playwright() as playwright:
        browser = await playwright.chromium.connect_over_cdp(CDP_URL)
        # A NEW context per run avoids persisted browser cache, cookies and stale DOM state.
        context = await browser.new_context(service_workers="block")
        try:
            for key, url in URLS.items():
                page = await context.new_page()
                try:
                    fresh = await scrape_one(page, key, url)
                finally:
                    await page.close()
                old = previous.get("locations", {}).get(key, {})
                if fresh.get("ok"):
                    updated, retained = preserve_missing_images(fresh, old)
                    print(f"[images] {key}: {updated} changed image assets; {retained} missing images retained")
                    out["locations"][key] = fresh
                elif old.get("ok") and old.get("items"):
                    print(f"[warning] {key}: scrape failed; preserving last successful menu")
                    out["locations"][key] = old
                else:
                    raise RuntimeError(f"{key}: scrape failed and no previous valid menu exists: {fresh.get('error')}")
        finally:
            await context.close()
            await browser.close()

    save_json_atomic(out)
    for key, location in out["locations"].items():
        print(f"[done] {key}: {len(location.get('items', []))} items")
    upload_wordpress(out)
    print(f"[done] Saved {OUT_FILE}")


if __name__ == "__main__":
    asyncio.run(main())
