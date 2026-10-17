#!/usr/bin/env python3
"""Randly: make the text-chat message area fill the screen on phones.

Cause: on phones, `.chat-box { max-height: 24dvh }` also applied to the text-chat box,
so only a small strip was visible even though the screen had plenty of empty space.

What it does:
  1) appends one small CSS block to public/style.css (shared by all 12 languages)
  2) bumps the `style.css?v=...` cache-buster in every public/*.html so phones load the new CSS

Run from the project folder:
  python patch_chat_fill.py            (dry-run, changes nothing)
  python patch_chat_fill.py --apply    (writes the changes)
Safe to run twice.
"""
import glob, os, re, sys

APPLY = "--apply" in sys.argv
PUBLIC = "public"
MARK = "/* Randly chat-fill fix */"
VERSION = "20261018-chatfill"
CSS = """
/* Randly chat-fill fix */
@media (max-width: 899.98px) {
    .rl-text-mode > #chatSection > .rl-msgs > .chat-box {
        flex: 1 1 0;
        min-height: 0;
        max-height: none;
    }
}
"""

def main():
    if not os.path.isdir(PUBLIC):
        sys.exit("ERROR: run this from the project folder (the one that contains 'public').")
    print(("APPLY" if APPLY else "DRY-RUN") + " in " + os.path.abspath(PUBLIC))
    writes = []

    p = os.path.join(PUBLIC, "style.css")
    data = open(p, "rb").read()
    if MARK.encode() in data:
        print("ok     style.css: already patched")
    else:
        nl = b"\r\n" if b"\r\n" in data else b"\n"
        add = CSS.replace("\n", nl.decode()).encode()
        if not data.endswith(nl):
            add = nl + add
        writes.append((p, data + add))
        print("CHANGE style.css  (+ chat-fill block)")

    rx = re.compile(rb"style\.css\?v=[^\"'\s>]*")
    new = ("style.css?v=" + VERSION).encode()
    n = 0
    for f in sorted(glob.glob(os.path.join(PUBLIC, "*.html"))):
        d = open(f, "rb").read()
        if not rx.search(d):
            continue
        nd = rx.sub(new, d)
        if nd != d:
            writes.append((f, nd)); n += 1
    print(("CHANGE " if n else "ok     ") + f"{n} html page(s): style.css version -> {VERSION}")

    if not writes:
        print("\nNothing to do."); return
    if not APPLY:
        print("\nLooks right? Run again with --apply"); return
    for f, d in writes:
        open(f, "wb").write(d)
    print(f"\nDone: {len(writes)} file(s) updated.")

main()
