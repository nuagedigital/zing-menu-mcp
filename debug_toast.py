# debug_toast.py
import asyncio
import json
import subprocess
from pathlib import Path
from urllib.request import urlopen

from patchright.async_api import async_playwright

URL = "https://order.toasttab.com/online/zingsters-4169-cushing-parkway"
DATA_DIR = Path(__file__).parent / "data"
DEBUG_DIR = DATA_DIR / "debug"
PROFILE_DIR = DATA_DIR / "chrome-profile"
CDP_URL = "http://127.0.0.1:9222"
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"


def kill_chrome():
    subprocess.run(["taskkill", "/F", "/IM", "chrome.exe", "/T"],
                   capture_output=True, shell=True)


def launch_chrome():
    PROFILE_DIR.mkdir(parents=True, exist_ok=True)
    subprocess.Popen(
        [CHROME, "--remote-debugging-port=9222",
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


async def main():
    DEBUG_DIR.mkdir(parents=True, exist_ok=True)

    kill_chrome()
    await asyncio.sleep(3)
    launch_chrome()
    if not await wait_debug(20):
        print("debug port not open")
        return

    captured = []

    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp(CDP_URL)
        ctx = browser.contexts[0] if browser.contexts else await browser.new_context()
        page = await ctx.new_page()

        async def on_response(response):
            try:
                url = response.url
                ct = response.headers.get("content-type", "")
                # Capture ALL responses that could be JSON or data
                if not any(x in ct.lower() for x in ["json", "javascript", "text"]):
                    return
                try:
                    text = await response.text()
                except Exception:
                    return
                if len(text) < 300:
                    return
                # Save any response with interesting keywords
                low = text.lower()
                if any(k in low for k in [
                    "menuitem", "menu_item", "menu-group", "menugroup",
                    "category", "itemid", "item_id", "price", "burger",
                    "wrap", "milkshake",
                ]):
                    captured.append({"url": url, "content_type": ct, "body": text})
                    print(f"  CAPTURED ({len(text)} bytes): {url[:100]}")
            except Exception:
                pass

        page.on("response", on_response)

        print("Loading page...")
        await page.goto(URL, wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_timeout(5000)

        # Check for Cloudflare
        content = await page.content()
        if "performing security verification" in content.lower() or "just a moment" in content.lower():
            print("\n>>> CLOUDFLARE DETECTED — Chrome mein checkbox click karo, 60 seconds wait kar raha hoon <<<\n")
            for _ in range(60):
                await page.wait_for_timeout(1000)
                content = await page.content()
                if "performing security verification" not in content.lower() and "just a moment" not in content.lower():
                    print(">>> Cloudflare cleared <<<\n")
                    break

        # Wait for menu
        await page.wait_for_timeout(8000)

        # Try clicking each tab and wait
        print("\nTrying to click tabs...")
        for tab in ["Burgers", "Wraps", "Bowls", "Sides", "Milkshakes", "Drinks", "Sauce", "Kids Menu", "Tender Only"]:
            try:
                clicked = await page.evaluate(f'''
                    () => {{
                        const btns = document.querySelectorAll('button, a, [role="tab"], [role="link"]');
                        for (const el of btns) {{
                            if ((el.textContent || '').trim() === "{tab}") {{
                                el.click();
                                return true;
                            }}
                        }}
                        return false;
                    }}
                ''')
                if clicked:
                    print(f"  clicked: {tab}")
                    await page.wait_for_timeout(2000)
            except Exception as e:
                print(f"  failed: {tab} ({e})")

        await page.wait_for_timeout(3000)

        # Save final HTML
        html = await page.content()
        (DEBUG_DIR / "page.html").write_text(html, encoding="utf-8")
        print(f"\nSaved HTML: {len(html)} bytes -> data/debug/page.html")

        # Save all captured responses
        for i, entry in enumerate(captured):
            safe = entry["url"].replace("https://", "").replace("http://", "").replace("/", "_").replace("?", "_").replace("&", "_")[:80]
            fname = DEBUG_DIR / f"resp_{i:02d}_{safe}.txt"
            fname.write_text(entry["body"], encoding="utf-8")
            print(f"Saved: {fname.name} ({len(entry['body'])} bytes)")

        # Quick stats on the HTML
        print("\n=== HTML ANALYSIS ===")
        print(f"Total HTML length: {len(html)}")

        import re
        # Count occurrences of known item names
        for name in ["Zing-1", "Zing-2", "Smash", "Chicken Wrap", "Biscoff", "Tender"]:
            n = html.lower().count(name.lower())
            print(f"  '{name}' occurrences in HTML: {n}")

        # Look for embedded JSON
        json_scripts = re.findall(r'<script[^>]*type="application/json"[^>]*>(.*?)</script>', html, re.DOTALL)
        print(f"\n  <script type=application/json> blocks: {len(json_scripts)}")
        for i, js in enumerate(json_scripts):
            try:
                parsed = json.loads(js)
                (DEBUG_DIR / f"embedded_json_{i}.json").write_text(
                    json.dumps(parsed, indent=2)[:500000], encoding="utf-8"
                )
                print(f"    Block {i}: parsed OK ({len(js)} bytes)")
            except Exception:
                pass

        # Look for window.__ variables
        window_vars = re.findall(r'window\.(__[A-Z_]+__)\s*=', html)
        print(f"\n  window.__ vars: {sorted(set(window_vars))}")

        # Extract all headings
        headings = re.findall(r'<h[1-4][^>]*>(.*?)</h[1-4]>', html, re.DOTALL)
        clean_headings = [re.sub(r'<[^>]+>', '', h).strip() for h in headings]
        clean_headings = [h for h in clean_headings if 2 < len(h) < 50]
        print(f"\n  Headings in HTML: {clean_headings[:20]}")

        print(f"\n=== SUMMARY ===")
        print(f"Captured {len(captured)} network responses")
        print(f"Saved all debug files to: {DEBUG_DIR}")

        await ctx.close()


asyncio.run(main())
