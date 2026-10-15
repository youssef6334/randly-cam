#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
patch_ui_tweaks.py - three small UI fixes:
 1) chat: removes the duplicated small "Searching..." line at the top (keeps the bold one with the hourglass)
 2) video: hides the word "You" on your own small camera preview
 3) camera message: fixes the "??" that appears instead of the emoji above "Show your face..." (pages saved with a broken emoji)

Run from the project folder (the one that contains the public folder):
    python patch_ui_tweaks.py            # dry-run: shows what would change, writes nothing
    python patch_ui_tweaks.py --apply    # writes the changes
Optional: --public path\\to\\public
Safe to run twice. If code is not found exactly it stops and changes nothing.
"""
import argparse, glob, os, re, sys

SCRIPT_EDITS = [
 ("    if (statusDiv) statusDiv.textContent = t.searchingText || 'Searching...';\n",
  "    if (statusDiv) statusDiv.textContent = '';\n"),
 ("    if(statusDiv) statusDiv.textContent = translations[currentLang]?.searchingText || 'Searching...';\n",
  "    if(statusDiv) statusDiv.textContent = '';\n"),
]
CSS_MARK = "/* Randly UI tweaks */"
CSS_ADD = (
 "\n\n/* Randly UI tweaks */\n"
 ".video-box.local-box .video-label { display: none !important; }\n"
 ".status-bar:empty { display: none; }\n"
)
EMOJI_BAD = '<span class="camera-gate-emoji">??</span>'
EMOJI_OK = '<span class="camera-gate-emoji">\U0001F4F7</span>'

def read(p): return open(p, "rb").read().decode("utf-8")
def write(p, t): open(p, "wb").write(t.encode("utf-8"))

def crlf_apply(text, fn):
    crlf = "\r\n" in text
    s = fn(text.replace("\r\n", "\n"))
    return s.replace("\n", "\r\n") if (crlf and s is not None) else s

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--public")
    a = ap.parse_args()
    pub = a.public or next((d for d in ("public", ".") if os.path.exists(os.path.join(d, "script.js"))), None)
    if not pub:
        print("ERROR: script.js not found. Run from the project folder or use --public path"); sys.exit(1)
    print(("APPLY" if a.apply else "DRY-RUN") + " in " + os.path.abspath(pub))
    writes, bad = [], 0

    # 1) script.js
    p = os.path.join(pub, "script.js"); t = read(p); s = t.replace("\r\n", "\n")
    if all(old not in s for old, _ in SCRIPT_EDITS):
        print("ok     script.js: already patched")
    else:
        for old, new in SCRIPT_EDITS:
            if old in s:
                if s.count(old) != 1:
                    print("ERROR  script.js: line found more than once:\n      " + old.strip()[:90]); bad += 1; break
                s = s.replace(old, new, 1)
        else:
            if any(old in s for old, _ in SCRIPT_EDITS):
                print("ERROR  script.js: only part of the expected code was found (file differs from my copy)"); bad += 1
            else:
                writes.append((p, s.replace("\n", "\r\n") if "\r\n" in t else s)); print("CHANGE script.js")

    # 2) style.css
    p = os.path.join(pub, "style.css")
    if not os.path.exists(p): print("ERROR  style.css not found"); bad += 1
    else:
        t = read(p)
        if CSS_MARK in t: print("ok     style.css: already patched")
        else:
            nl = "\r\n" if "\r\n" in t else "\n"
            writes.append((p, t.rstrip() + CSS_ADD.replace("\n", nl) + nl)); print("CHANGE style.css")

    # 3) html pages
    fixed = other = 0
    for p in sorted(glob.glob(os.path.join(pub, "*.html"))):
        t = read(p)
        if EMOJI_BAD in t:
            writes.append((p, t.replace(EMOJI_BAD, EMOJI_OK))); print("CHANGE " + os.path.basename(p) + "  (emoji fixed)"); fixed += 1
        body = re.sub(r"<(script|style)[\s\S]*?</\1>", "", t.replace(EMOJI_BAD, ""))
        txt = re.sub(r"<[^>]+>", " ", body)
        if "??" in txt:
            other += 1; print("NOTE   " + os.path.basename(p) + ": has other '??' in visible text (maybe more broken emoji) - tell me")
    if not fixed: print("ok     html: no broken camera emoji found")

    if bad:
        print("\nNothing was written because of the problem(s) above."); sys.exit(1)
    if a.apply:
        for p, t in writes: write(p, t)
        print(f"\n{len(writes)} file(s) written. Now: git add . / git commit / git push")
    elif writes:
        print("\nLooks right? Run again with --apply")

if __name__ == "__main__":
    main()
