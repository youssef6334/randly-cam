#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
patch_ui_tweaks.py - three small UI fixes:
 1) chat: removes the duplicated small "Searching..." line at the top (keeps the bold one with the hourglass)
 2) video: hides the word "You" on your own small camera preview
 3) camera message: fixes the "??" that appears instead of the emoji above "Show your face..." and the broken
    "Show your face..." text in hi/ru/zh (pages saved with broken characters)

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
FACE_TEXT = {
    "hi": "\u092e\u0948\u091a \u0916\u094b\u091c\u0928\u0947 \u0914\u0930 \u091a\u0948\u091f \u0936\u0941\u0930\u0942 \u0915\u0930\u0928\u0947 \u0915\u0947 \u0932\u093f\u090f \u0905\u092a\u0928\u093e \u091a\u0947\u0939\u0930\u093e \u0926\u093f\u0916\u093e\u090f\u0901",
    "ru": "\u041f\u043e\u043a\u0430\u0436\u0438\u0442\u0435 \u043b\u0438\u0446\u043e, \u0447\u0442\u043e\u0431\u044b \u043d\u0430\u0439\u0442\u0438 \u0441\u043e\u0431\u0435\u0441\u0435\u0434\u043d\u0438\u043a\u0430 \u0438 \u043d\u0430\u0447\u0430\u0442\u044c \u043e\u0431\u0449\u0435\u043d\u0438\u0435",
    "zh": "\u5c55\u793a\u4f60\u7684\u8138\u90e8\u5373\u53ef\u5bfb\u627e\u5339\u914d\u5e76\u5f00\u59cb\u804a\u5929",
}
FACE_RE = re.compile(r'(<span data-i18n="showFaceMessage">)[^<]*\?\?[^<]*(</span>)')
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
        new = t; notes = []
        if EMOJI_BAD in new:
            new = new.replace(EMOJI_BAD, EMOJI_OK); notes.append("emoji")
        code = os.path.basename(p)[:-5]
        if code in FACE_TEXT and FACE_RE.search(new):
            new = FACE_RE.sub(lambda m: m.group(1) + FACE_TEXT[code] + m.group(2), new); notes.append("text")
        if new != t:
            writes.append((p, new)); print("CHANGE " + os.path.basename(p) + "  (fixed: " + ", ".join(notes) + ")"); fixed += 1
        t = new
        body = re.sub(r"<(script|style)[\s\S]*?</\1>", "", t)
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