#!/usr/bin/env python3
"""
Forces phones/browsers to download the NEW style.css and randly-logo.svg.
Changes only the ?v=... number after style.css and randly-logo.svg in every *.html file
in the current folder (keeps each file's line endings).

Usage (PowerShell, inside the site folder):
    python bump_version.py            # uses the current date/time as the version
    python bump_version.py 20261006b  # or pass your own version text
"""
import re, sys, time
from pathlib import Path

ver = sys.argv[1] if len(sys.argv) > 1 else time.strftime("%Y%m%d-%H%M")
n = 0
for f in sorted(Path(".").glob("*.html")):
    with open(f, encoding="utf-8", newline="") as fh:
        s = fh.read()
    o = s
    s = re.sub(r'(href="(?:/)?style\.css)(\?v=[^"]*)?(")', r'\1?v=%s\3' % ver, s)
    s = re.sub(r'(src="(?:/)?randly-logo\.svg)(\?v=[^"]*)?(")', r'\1?v=%s\3' % ver, s)
    if s != o:
        with open(f, "w", encoding="utf-8", newline="") as fh:
            fh.write(s)
        n += 1
print("version =", ver, "| html files updated:", n)
