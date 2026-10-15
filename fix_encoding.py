# fix_encoding.py
from pathlib import Path

f = Path("scrape_toast.py")
raw = f.read_bytes()

# Try multiple decodings
for enc in ["utf-8", "latin-1", "cp1252"]:
    try:
        text = raw.decode(enc)
        print(f"Decoded OK with {enc}")
        break
    except UnicodeDecodeError as e:
        print(f"Failed with {enc}: {e}")
        continue
else:
    print("Could not decode. Trying to strip bad bytes...")
    text = raw.decode("utf-8", errors="ignore")

# Remove BOM if present
if text.startswith("\ufeff"):
    text = text[1:]

# Fix common encoding artifacts
text = text.replace("\x97", "-")   # em dash
text = text.replace("\u2014", "-")  # em dash
text = text.replace("\u2013", "-")  # en dash
text = text.replace("\u2018", "'")
text = text.replace("\u2019", "'")
text = text.replace("\u201c", '"')
text = text.replace("\u201d", '"')

# Ensure UTF-8 declaration at top
if not text.startswith("# -*- coding: utf-8"):
    text = "# -*- coding: utf-8 -*-\n" + text

# Save as UTF-8 (no BOM)
f.write_text(text, encoding="utf-8")

print("Done. File saved as UTF-8.")
print(f"First line: {text.splitlines()[0]}")
print(f"Second line: {text.splitlines()[1]}")
