#!/usr/bin/env python3
"""
Appends a CSS patch file to style.css (once). Keeps the file's line endings. Makes a backup first.

Usage (PowerShell, from the site folder):
    python apply_css_patch.py fix-input-color.css "RANDLY INPUT TEXT COLOR FIX"
"""
import sys, shutil
from pathlib import Path

if len(sys.argv) < 3:
    sys.exit('usage: python apply_css_patch.py <patch.css> "<marker text inside the patch>"')
patch, mark = Path(sys.argv[1]), sys.argv[2]
css = Path("style.css")
if not css.exists():
    sys.exit("style.css not found here - cd into the site folder first")

def rd(p):
    with open(p, encoding="utf-8", newline="") as fh:
        return fh.read()

txt = rd(css)
if mark in txt:
    sys.exit("already applied - nothing to do")
nl = "\r\n" if "\r\n" in txt else "\n"
block = rd(patch).replace("\r\n", "\n").replace("\n", nl)
bak = Path("backup_before_mobile_fix"); bak.mkdir(exist_ok=True)
shutil.copy2(css, bak / ("style.before-" + patch.stem + ".css"))
with open(css, "w", encoding="utf-8", newline="") as fh:
    fh.write(txt.rstrip() + nl + block)
print("applied:", patch.name)
