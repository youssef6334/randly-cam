#!/usr/bin/env python3
"""
Replaces the header logo <img ... class="brand-logo" ...> with the logo drawn INLINE in the page
(no external file => no cache / missing-file / deploy problems). Works on every *.html in the
current folder, keeps line endings, and is safe to run twice.

Usage (PowerShell, inside the site folder):
    python inline_logo.py
"""
import re
from pathlib import Path

SVG = ('<svg class="brand-logo" width="28" height="28" viewBox="0 0 64 64" role="img" aria-hidden="true" focusable="false">'
       '<rect width="64" height="64" rx="15" fill="#12b886"/>'
       '<path d="M18 22V54M18 22H29a8.5 8.5 0 0 1 0 17H18M29 39L38 54" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>'
       '<g transform="rotate(12 51 15)"><rect x="42" y="6" width="18" height="18" rx="4.5" fill="#ffd43b"/>'
       '<circle cx="46.5" cy="10.5" r="1.9" fill="#04251b"/><circle cx="51" cy="15" r="1.9" fill="#04251b"/>'
       '<circle cx="55.5" cy="19.5" r="1.9" fill="#04251b"/></g></svg>')
pat = re.compile(r'<img\b[^>]*class="brand-logo"[^>]*>')
n = 0
for f in sorted(Path(".").glob("*.html")):
    with open(f, encoding="utf-8", newline="") as fh:
        s = fh.read()
    s2, k = pat.subn(SVG, s)
    if k:
        with open(f, "w", encoding="utf-8", newline="") as fh:
            fh.write(s2)
        n += 1
        print("updated:", f.name, "(%d logo)" % k)
print("done - %d files updated" % n)
