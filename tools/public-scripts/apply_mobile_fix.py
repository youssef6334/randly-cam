#!/usr/bin/env python3
"""
Randly mobile fix - applies the same change to every language page.

Usage (from the site folder, or pass the folder):
    python apply_mobile_fix.py            # current folder
    python apply_mobile_fix.py C:\\path\\to\\site

What it does (idempotent - safe to run twice):
  1. Appends the "RANDLY MOBILE FINAL" block (mobile-final.css) to style.css if it is not there yet.
  2. In every *.html page: bumps the style.css ?v= version and adds ?v= to the logo
     (/randly-logo.svg) so phones stop showing a cached/old logo.
  3. Saves a backup of every file it changes in ./backup_before_mobile_fix/
Nothing else is touched (no JS, no SEO tags, no settings code).
"""
import sys, re, shutil
from pathlib import Path

VERSION = "20261006-mobile"
MARK = "RANDLY MOBILE FINAL"
root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
bak = root / "backup_before_mobile_fix"
bak.mkdir(exist_ok=True)

def backup(p: Path):
    dst = bak / p.name
    if not dst.exists():
        shutil.copy2(p, dst)

# 1) CSS
css = root / "style.css"
block = (Path(__file__).parent / "mobile-final.css").read_text(encoding="utf-8")
if not css.exists():
    sys.exit("style.css not found in " + str(root))
def rd(p):  # keep the file's own line endings (CRLF/LF) untouched
    with open(p, encoding="utf-8", newline="") as fh:
        return fh.read()

def wr(p, data):
    with open(p, "w", encoding="utf-8", newline="") as fh:
        fh.write(data)

txt = rd(css)
nl = "\r\n" if "\r\n" in txt else "\n"
block = block.replace("\r\n", "\n").replace("\n", nl)
if MARK in txt:
    print("style.css: block already present - skipped")
else:
    backup(css)
    wr(css, txt.rstrip() + nl + block)
    print("style.css: mobile block appended")

# 2) HTML pages
changed = 0
for f in sorted(root.glob("*.html")):
    s = rd(f)
    o = s
    s = re.sub(r'(href="style\.css)\?v=[^"]*(")', r'\1?v=%s\2' % VERSION, s)
    s = re.sub(r'(src="/randly-logo\.svg)(\?v=[^"]*)?(")', r'\1?v=%s\3' % VERSION, s)
    if s != o:
        backup(f)
        wr(f, s)
        changed += 1
        print("updated:", f.name)
    else:
        print("no change:", f.name)
print("done - %d html files updated. Backups: %s" % (changed, bak))
