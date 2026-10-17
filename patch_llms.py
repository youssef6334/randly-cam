#!/usr/bin/env python3
"""Randly: add public/llms.txt and explicitly allow the main AI crawlers in public/robots.txt.

Run from the project folder:
  python patch_llms.py            (dry-run, changes nothing)
  python patch_llms.py --apply    (writes the files)
Safe to run twice. Existing robots.txt rules are never removed.
"""
import os, sys

APPLY = "--apply" in sys.argv
PUBLIC = "public"
BASE = "https://randly.live"
MARK = "# AI crawlers (added by patch_llms.py)"

LLMS = """# Randly

> Randly (randly.live) is a free random video and text chat website. You open it in a browser (phone or computer), confirm you are 18 or older, and start chatting with a stranger. No account, no registration and no app download. The site is available in 12 languages.

Main features, as described on the site:
- Video chat and text chat with random people
- No registration or app needed; works in a mobile or desktop browser
- Choose a country, or use Global mode to match with anyone
- Optional interest matching
- Optional live message translation between 12 languages in text chat
- Report button, with automatic temporary bans for users who receive repeated reports
- 18+ only; an age confirmation appears before entering
- Free to use, with no paid plan

Randly is an Omegle alternative. Omegle shut down permanently in November 2023 and Randly is an independent site, not the original service.

## Main pages
- [Randly - English home page](https://randly.live/en.html): start a free random video or text chat
- [Randly - Arabic home page](https://randly.live/): the same site in Arabic
- [About Randly](https://randly.live/about-en.html): what the site is and who it is for
- [Chat rules](https://randly.live/rules-en.html): behavior rules and how reports and bans work
- [Privacy policy](https://randly.live/privacy-en.html): how data is handled
- [Terms of service](https://randly.live/terms-en.html): terms of use, including the 18+ requirement

## Guides
- [Blog (English)](https://randly.live/blog-en.html): all guides
- [Best Omegle Alternatives in 2026](https://randly.live/post-omegle-alternative-en.html): what to look for in a random chat site, types of alternatives, safety tips and FAQ
- [Free random video chat, no registration](https://randly.live/post-free-video-chat-en.html): how free random video chat works and what to check before using it

## Optional
- [Spanish home page](https://randly.live/es.html)
- [French home page](https://randly.live/fr.html)
- [German home page](https://randly.live/de.html)
- [Italian home page](https://randly.live/it.html)
- [Portuguese home page](https://randly.live/pt.html)
- [Turkish home page](https://randly.live/tr.html)
- [Russian home page](https://randly.live/ru.html)
- [Hindi home page](https://randly.live/hi.html)
- [Indonesian home page](https://randly.live/id.html)
- [Chinese home page](https://randly.live/zh.html)
- [Blog (Arabic)](https://randly.live/blog-ar.html)
- [Blog (Spanish)](https://randly.live/blog-es.html)
- [Blog (French)](https://randly.live/blog-fr.html)
- [Blog (German)](https://randly.live/blog-de.html)
- [Blog (Italian)](https://randly.live/blog-it.html)
- [Blog (Portuguese)](https://randly.live/blog-pt.html)
- [Blog (Turkish)](https://randly.live/blog-tr.html)
- [Blog (Russian)](https://randly.live/blog-ru.html)
- [Blog (Hindi)](https://randly.live/blog-hi.html)
- [Blog (Indonesian)](https://randly.live/blog-id.html)
- [Blog (Chinese)](https://randly.live/blog-zh.html)
- [Full sitemap](https://randly.live/sitemap.xml)
"""

BOTS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "Claude-User",
        "PerplexityBot", "Perplexity-User", "Google-Extended", "Applebot-Extended", "CCBot", "Amazonbot"]
BLOCK = ["", MARK] + ["User-agent: " + b for b in BOTS] + ["Allow: /", "Disallow: /socket.io/", "Disallow: /api/", "Disallow: /healthz", ""]

def main():
    if not os.path.isdir(PUBLIC):
        sys.exit("ERROR: run this from the project folder (the one that contains 'public').")
    print(("APPLY" if APPLY else "DRY-RUN") + " in " + os.path.abspath(PUBLIC))
    writes = []

    p = os.path.join(PUBLIC, "llms.txt")
    new = LLMS.encode("utf-8")
    old = open(p, "rb").read() if os.path.exists(p) else None
    if old == new:
        print("ok     llms.txt: already up to date")
    else:
        writes.append((p, new)); print(("CHANGE llms.txt  (updated)" if old is not None else "CHANGE llms.txt  (new file)"))

    r = os.path.join(PUBLIC, "robots.txt")
    data = open(r, "rb").read() if os.path.exists(r) else b""
    if MARK.encode() in data:
        print("ok     robots.txt: AI crawlers already added")
    else:
        nl = b"\r\n" if b"\r\n" in data else b"\n"
        text = data.decode("utf-8")
        if text and not text.endswith(("\n", "\r\n")):
            text += nl.decode()
        add = nl.decode().join(BLOCK)
        if "sitemap:" not in text.lower():
            add += nl.decode() + "Sitemap: " + BASE + "/sitemap.xml" + nl.decode()
        writes.append((r, (text + add).encode("utf-8")))
        print("CHANGE robots.txt  (+ AI crawlers group, existing rules kept)")

    if not writes:
        print("\nNothing to do."); return
    if not APPLY:
        print("\nLooks right? Run again with --apply"); return
    for f, d in writes:
        open(f, "wb").write(d)
    print(f"\nDone: {len(writes)} file(s) written. After deploy check: {BASE}/llms.txt and {BASE}/robots.txt")

main()
