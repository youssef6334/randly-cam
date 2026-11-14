#!/usr/bin/env python3
"""
Removes the DUPLICATE footer link "About" (the one WITHOUT data-i18n) when a footer has two
links to the About page. Keeps the translated one (data-i18n="aboutLink").
Only touches footers that have exactly 2 about-links where exactly 1 has data-i18n.
Everything else is left untouched. Keeps each file's line endings.

Usage (PowerShell, inside the site folder):
    python dedupe_about.py          # shows what it WOULD change (dry run)
    python dedupe_about.py --apply  # really changes the files
"""
import re, sys
from pathlib import Path

apply = "--apply" in sys.argv
DIV = re.compile(r'(<div class="footer-links">)(.*?)(</div>)', re.S)
A = re.compile(r'[ \t]*<a\b[^>]*\bhref="/?about[^"]*"[^>]*>.*?</a>[ \t]*(?:\r?\n)?', re.S | re.I)

changed = []
for f in sorted(Path(".").glob("*.html")):
    with open(f, encoding="utf-8", newline="") as fh:
        s = fh.read()

    def fix(m):
        inner = m.group(2)
        links = list(A.finditer(inner))
        if len(links) != 2:
            return m.group(0)
        plain = [l for l in links if "data-i18n" not in l.group(0)]
        if len(plain) != 1:
            return m.group(0)
        l = plain[0]
        return m.group(1) + inner[:l.start()] + inner[l.end():] + m.group(3)

    new = DIV.sub(fix, s)
    if new != s:
        changed.append(f.name)
        if apply:
            with open(f, "w", encoding="utf-8", newline="") as fh:
                fh.write(new)

print(("CHANGED" if apply else "WOULD CHANGE"), len(changed), "file(s):")
for n in changed:
    print("  ", n)
if not apply:
    print("Nothing was modified. Run with --apply to apply.")
