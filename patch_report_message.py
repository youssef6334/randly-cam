#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
patch_report_message.py - shows a green "Thank you! Your report has been received."
message inside the chat (12 languages) after a user presses Report, instead of the browser alert.

The message appears only when the SERVER confirms it recorded the report (i.e. the user
really was connected to someone). Ban rules are NOT touched.

Run from the project folder (the one that holds server.js and the public folder):
    python patch_report_message.py            # dry-run: shows what would change
    python patch_report_message.py --apply    # writes the changes
Optional: --server path\\to\\server.js  --script path\\to\\script.js
Safe to run twice. If a piece of code is not found exactly, it stops and changes nothing.
"""
import argparse, os, sys

# ------------------------------------------------------------------ server.js
SERVER_EDITS = [
 ("    if (!reporter || !reporter.peer) return;\n    const reported = activeUsers.get(reporter.peer);\n    if (!reported) return;\n",
  "    if (!reporter || !reporter.peer) return false;\n    const reported = activeUsers.get(reporter.peer);\n    if (!reported) return false;\n"),
 ("        console.log('[BAN]', reported.ipHash, 'until', new Date(now + BAN_MS).toISOString());\n    }\n}\n",
  "        console.log('[BAN]', reported.ipHash, 'until', new Date(now + BAN_MS).toISOString());\n    }\n    return true;\n}\n"),
 ("        registerReport(socket.id, reason);\n",
  "        if (registerReport(socket.id, reason)) socket.emit('report-received');\n"),
]
SERVER_DONE = "socket.emit('report-received')"

# ------------------------------------------------------------------ script.js
OLD_REPORT = "function reportUser() {\n    socket.emit('submit-report', { reason: 'Inappropriate behavior' });\n    alert(tr('reported'));\n}\n"
NEW_REPORT = r"""function reportUser() {
    socket.emit('submit-report', { reason: 'Inappropriate behavior' });
}

// رسالة تأكيد البلاغ داخل الشات (تظهر فقط بعد ما السيرفر يؤكد إنه سجّل البلاغ)
const REPORT_THANKS = {
    ar: 'شكراً لك! تم استلام بلاغك.',
    en: 'Thank you! Your report has been received.',
    es: '¡Gracias! Hemos recibido tu reporte.',
    fr: 'Merci ! Votre signalement a bien été reçu.',
    de: 'Danke! Deine Meldung ist eingegangen.',
    it: 'Grazie! La tua segnalazione è stata ricevuta.',
    pt: 'Obrigado! Sua denúncia foi recebida.',
    tr: 'Teşekkürler! Bildiriminiz alındı.',
    ru: 'Спасибо! Ваша жалоба получена.',
    hi: 'धन्यवाद! आपकी रिपोर्ट मिल गई है।',
    id: 'Terima kasih! Laporan Anda sudah kami terima.',
    zh: '谢谢！我们已收到你的举报。'
};

socket.on('report-received', function () {
    if (!chatBox) return;
    const last = chatBox.lastElementChild;
    if (last && last.classList.contains('msg-report-ok')) { chatBox.scrollTop = chatBox.scrollHeight; return; }
    if (!document.getElementById('reportOkStyle')) {
        const st = document.createElement('style');
        st.id = 'reportOkStyle';
        st.textContent = '.msg.msg-report-ok{align-self:stretch;max-width:100%;text-align:center;font-weight:600;font-size:.85rem;' +
            'color:var(--accent);background:rgba(0,184,148,.12);border:1px solid var(--accent);border-radius:10px}';
        document.head.appendChild(st);
    }
    const lang = document.documentElement.lang || 'ar';
    const box = document.createElement('div');
    box.classList.add('msg', 'msg-sys', 'msg-report-ok');
    box.textContent = '🛡️ ' + (REPORT_THANKS[lang] || REPORT_THANKS.en);
    chatBox.appendChild(box);
    chatBox.scrollTop = chatBox.scrollHeight;
});
"""
SCRIPT_DONE = "socket.on('report-received'"


def read(p):
    return open(p, "rb").read().decode("utf-8")

def write(p, t):
    open(p, "wb").write(t.encode("utf-8"))

def patch(text, edits, done_marker):
    crlf = "\r\n" in text
    s = text.replace("\r\n", "\n")
    if done_marker in s:
        return text, "already"
    for old, new in edits:
        if s.count(old) != 1:
            return text, "anchor not found exactly once:\n      " + old.strip().splitlines()[0][:90]
        s = s.replace(old, new, 1)
    return (s.replace("\n", "\r\n") if crlf else s), "changed"

def find(cands):
    for c in cands:
        if os.path.exists(c): return c
    return None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--server"); ap.add_argument("--script")
    a = ap.parse_args()
    server = a.server or find(["server.js", os.path.join("..", "server.js")])
    script = a.script or find([os.path.join("public", "script.js"), "script.js"])
    print(("APPLY" if a.apply else "DRY-RUN"))
    bad = 0
    jobs = [("server.js", server, SERVER_EDITS, SERVER_DONE), ("script.js", script, [(OLD_REPORT, NEW_REPORT)], SCRIPT_DONE)]
    results = []
    for name, path, edits, marker in jobs:
        if not path or not os.path.exists(path):
            print(f"ERROR {name}: file not found (use --{name.split('.')[0]} path)"); bad += 1; continue
        new, st = patch(read(path), edits, marker)
        if st == "changed":
            print(f"CHANGE {path}" + ("" if a.apply else "  (dry-run, not written)")); results.append((path, new))
        elif st == "already":
            print(f"ok     {path}: already patched")
        else:
            print(f"ERROR  {path}: {st}\n      -> file left untouched; send me this file"); bad += 1
    if bad:
        print("\nNothing was written because of the problem(s) above."); sys.exit(1)
    if a.apply:
        for p, t in results: write(p, t)
        print(f"\n{len(results)} file(s) written. Restart the server (git push deploys it).")
    elif results:
        print("\nLooks right? Run again with --apply")

if __name__ == "__main__":
    main()
