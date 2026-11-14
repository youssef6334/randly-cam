#!/usr/bin/env python3
"""
Delays ONLY the Google AdSense script (about 220KiB) so it no longer competes with the page
at first load. It loads on the first touch/click/scroll/key, or 4 seconds after the page loads.
Site scripts (socket.io, script.js ...) are NOT touched.

Run inside the site folder (public):
    python delay_adsense.py           # dry run: lists files, changes nothing
    python delay_adsense.py --apply   # applies
"""
import re, sys
from pathlib import Path

PAT = re.compile(
    r'<script\s+async\s+src="https://pagead2\.googlesyndication\.com/pagead/js/adsbygoogle\.js\?client=(ca-pub-\d+)"\s*'
    r'crossorigin="anonymous"\s*></script>')

def block(client, nl):
    js = ('<script>/* adsense-delayed */\n'
          '(function(){var d=false;function go(){if(d)return;d=true;var s=document.createElement("script");'
          's.async=true;s.crossOrigin="anonymous";'
          's.src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=%s";'
          'document.head.appendChild(s);}\n'
          '["touchstart","mousedown","keydown","scroll"].forEach(function(e){addEventListener(e,go,{once:true,passive:true});});\n'
          'addEventListener("load",function(){setTimeout(go,4000);});})();\n'
          '</script>') % client
    return js.replace("\n", nl)

apply = "--apply" in sys.argv
changed = skipped = 0
for f in sorted(Path(".").glob("*.html")):
    raw = f.read_bytes().decode("utf-8")
    nl = "\r\n" if "\r\n" in raw else "\n"
    if "adsense-delayed" in raw:
        print("already done:", f.name); continue
    m = PAT.findall(raw)
    if len(m) != 1:
        if "adsbygoogle.js" in raw:
            print("!! has AdSense but unexpected format (not touched):", f.name); skipped += 1
        continue
    new = PAT.sub(lambda mo: block(mo.group(1), nl), raw, count=1)
    print(("changed:" if apply else "would change:"), f.name)
    changed += 1
    if apply:
        f.write_bytes(new.encode("utf-8"))
print("files %s: %d | not touched (unexpected format): %d" % ("changed" if apply else "that would change", changed, skipped))
if not apply: print("(dry run - add --apply to apply)")
