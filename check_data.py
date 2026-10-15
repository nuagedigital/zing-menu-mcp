import json
from pathlib import Path

f = Path(__file__).parent / "data" / "toast-menu.json"
d = json.load(open(f, encoding="utf-8"))
locs = d.get("locations", {})
print(f"scraped at: {d.get('scrapedAt', '?')}")
print()
for key, data in locs.items():
    items = data.get("items", [])
    cats = sorted(set(i.get("category", "?") for i in items))
    print(f"== {key} ==")
    print(f"   {len(items)} items total")
    print(f"   categories: {cats}")
    print()
