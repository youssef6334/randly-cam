#!/usr/bin/env python3
"""
Adds a row of plain <a href> links to all 12 language pages in the footer of each language page
(index.html, en.html, es.html, fr.html, de.html, it.html, pt.html, tr.html, ru.html, hi.html, id.html, zh.html).
Google follows real links much better than a <select> menu. No JavaScript, no images.

Run inside the site folder (public):
    python add_lang_links.py           # dry run: shows what would change
    python add_lang_links.py --apply   # applies
Safe to run twice (it skips pages that already have the row).
"""
import re, sys
from pathlib import Path

LANGS = [("ar", "العربية", "/"), ("en", "English", "/en.html"), ("es", "Español", "/es.html"),
         ("fr", "Français", "/fr.html"), ("de", "Deutsch", "/de.html"), ("it", "Italiano", "/it.html"),
         ("pt", "Português", "/pt.html"), ("tr", "Türkçe", "/tr.html"), ("ru", "Русский", "/ru.html"),
         ("hi", "हिन्दी", "/hi.html"), ("id", "Bahasa Indonesia", "/id.html"), ("zh", "中文", "/zh.html")]
FILES = {"index.html": "ar", **{c + ".html": c for c, _, _ in LANGS if c != "ar"}}
PAT = re.compile(r'(<footer class="app-footer">.*?<div class="footer-links">.*?</div>)', re.S)

def row(cur, nl):
    items = []
    for c, name, href in LANGS:
        if c == cur:
            items.append('<a href="%s" hreflang="%s" lang="%s" aria-current="page">%s</a>' % (href, c, c, name))
        else:
            items.append('<a href="%s" hreflang="%s" lang="%s">%s</a>' % (href, c, c, name))
    return nl + '<nav class="footer-langs" aria-label="Languages">' + nl + nl.join(items) + nl + '</nav>'

apply = "--apply" in sys.argv
n = 0
for fn, cur in FILES.items():
    f = Path(fn)
    if not f.exists():
        print("missing:", fn); continue
    raw = f.read_bytes().decode("utf-8")
    nl = "\r\n" if "\r\n" in raw else "\n"
    if "footer-langs" in raw:
        print("already done:", fn); continue
    if len(PAT.findall(raw)) != 1:
        print("!! footer not found in the expected shape (not touched):", fn); continue
    new = PAT.sub(lambda m: m.group(1) + row(cur, nl), raw, count=1)
    print(("changed:" if apply else "would change:"), fn)
    n += 1
    if apply:
        f.write_bytes(new.encode("utf-8"))
print("pages %s: %d" % ("changed" if apply else "that would change", n))
if not apply: print("(dry run - add --apply to apply)")
