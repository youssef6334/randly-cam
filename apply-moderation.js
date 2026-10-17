#!/usr/bin/env node
/**
 * apply-moderation.js — بيركّب الإشراف الأوتوماتيك على موقعك.
 *   node apply-moderation.js --check     # يفحص بس من غير ما يكتب أي حاجة
 *   node apply-moderation.js             # يطبّق (وبيعمل نسخة .bak قبل أي تعديل)
 *   node apply-moderation.js --no-backup
 * بيعدّل: server.js (4 مواضع) + صفحات HTML اللي فيها randly-extra.js (سطر واحد في كل صفحة).
 * آمن للتشغيل أكتر من مرة، ولو أي موضع في server.js مش لاقيه بالظبط بيقف من غير ما يعدّل حاجة.
 * شغّله من الفولدر اللي فيه server.js. الملفات moderation.js و badwords.txt لازم تبقى جنب server.js،
 * و moderation-client.js لازم تبقى جنب script.js (في public/ لو عندك public/).
 */
const fs = require('fs');
const path = require('path');

const CHECK = process.argv.includes('--check');
const NO_BACKUP = process.argv.includes('--no-backup');
const root = process.cwd();
const serverPath = path.join(root, 'server.js');
if (!fs.existsSync(serverPath)) { console.error('✗ مش لاقي server.js هنا. شغّل السكريبت من فولدر المشروع.'); process.exit(1); }

const publicDir = fs.existsSync(path.join(root, 'public')) ? path.join(root, 'public') : root;
let problems = 0;

function readLF(p) { const raw = fs.readFileSync(p, 'utf8'); return { text: raw.replace(/\r\n/g, '\n'), crlf: raw.includes('\r\n') }; }
function write(p, text, crlf) {
  if (CHECK) return;
  const orig = fs.readFileSync(p, 'utf8');
  if (!NO_BACKUP) fs.writeFileSync(p + '.bak', orig);
  fs.writeFileSync(p, crlf ? text.replace(/\n/g, '\r\n') : text);
}

// ---------- 1) الملفات الجديدة موجودة؟ ----------
[['moderation.js', root], ['badwords.txt', root], ['moderation-client.js', publicDir]].forEach(([f, d]) => {
  if (fs.existsSync(path.join(d, f))) console.log('✔ ' + f + ' موجود في ' + (path.relative(root, d) || '.'));
  else { problems++; console.log('✗ ' + f + ' مش موجود في ' + d + ' — انسخه هناك الأول'); }
});

// ---------- 2) server.js ----------
const sv = readLF(serverPath);
let s = sv.text;
const edits = [
  {
    name: 'require moderation',
    done: /require\('\.\/moderation'\)/,
    anchor: "const geoip = require('geoip-lite');",
    replace: "const geoip = require('geoip-lite');\nconst mod = require('./moderation');"
  },
  {
    name: 'منع نشر الملفات الجديدة',
    done: /moderation\\\.js\|badwords/,
    anchor: String.raw`const BLOCKED = /^\/(server\.js|package(-lock)?\.json|node_modules|tools|\.env|\.git|.*\.bak)(\/|$)/i;`,
    replace: String.raw`const BLOCKED = /^\/(server\.js|moderation\.js|badwords\.txt|data|package(-lock)?\.json|node_modules|tools|\.env|\.git|.*\.bak)(\/|$)/i;`
  },
  {
    name: 'mod.onPair في pair()',
    done: /mod\.onPair\(/,
    anchor: "    if (mode) savedRooms.set(roomId, { createdAt: Date.now(), mode });",
    replace: "    if (mode) savedRooms.set(roomId, { createdAt: Date.now(), mode });\n    mod.onPair(socketA, socketB, mode);"
  },
  {
    name: 'mod.attach في connection',
    done: /mod\.attach\(/,
    anchor: "    const isBanned = () => (bans.get(ipHash) || 0) > Date.now();",
    replace: "    mod.attach(socket, { io, activeUsers, detach });   // إشراف أوتوماتيك (الحظر + فلتر الشات + البلاغات)\n\n    const isBanned = () => (bans.get(ipHash) || 0) > Date.now();"
  }
];
let serverChanged = false, serverBlocked = false;
for (const e of edits) {
  if (e.done.test(s)) { console.log('✔ server.js: ' + e.name + ' (متطبّق قبل كده)'); continue; }
  const n = s.split(e.anchor).length - 1;
  if (n !== 1) { serverBlocked = true; problems++; console.log('✗ server.js: ' + e.name + ' — مش لاقي السطر ده بالظبط (' + n + ' مرة). السكريبت مش هيعدّل server.js.'); continue; }
  console.log((CHECK ? '… ' : '✔ ') + 'server.js: ' + e.name);
  s = s.replace(e.anchor, () => e.replace);
  serverChanged = true;
}
if (serverChanged && !serverBlocked) write(serverPath, s, sv.crlf);
else if (serverChanged && serverBlocked) console.log('⚠ server.js ما اتعدّلش خالص لأن واحد من المواضع ناقص. ابعتلي ملفك وأظبطه.');

// ---------- 3) صفحات HTML ----------
const VER = '2';   // بنرفعه كل ما moderation-client.js يتغيّر عشان المتصفحات تحمّل النسخة الجديدة
const TAG = '<script src="moderation-client.js?v=' + VER + '"></script>';
const pages = fs.readdirSync(publicDir).filter(f => f.endsWith('.html')).sort();
let patched = 0, already = 0, skipped = 0;
for (const f of pages) {
  const p = path.join(publicDir, f);
  const h = readLF(p);
  if (!/randly-extra\.js/.test(h.text)) { skipped++; continue; }          // مش صفحة تطبيق
  if (/moderation-client\.js/.test(h.text)) {
    const cur = (h.text.match(/moderation-client\.js\?v=(\w+)/) || [])[1];
    if (cur === VER) { already++; continue; }
    write(p, h.text.replace(/moderation-client\.js(\?v=\w+)?/, 'moderation-client.js?v=' + VER), h.crlf);   // تحديث رقم النسخة
    patched++; console.log((CHECK ? '… ' : '✔ ') + f + ' (تحديث رقم النسخة)'); continue;
  }
  const re = /(<script src="randly-extra\.js[^"]*"><\/script>)/;
  if (!re.test(h.text)) { problems++; console.log('✗ ' + f + ': شكل سطر randly-extra.js مختلف، ضيف السطر ده بإيدك بعده: ' + TAG); continue; }
  write(p, h.text.replace(re, (m) => m + '\n' + TAG), h.crlf);
  patched++;
  console.log((CHECK ? '… ' : '✔ ') + f);
}
console.log('\nصفحات HTML: ' + patched + ' ' + (CHECK ? 'محتاجة تعديل' : 'اتعدّلت') + '، ' + already + ' متطبّقة قبل كده، ' + skipped + ' مش صفحات تطبيق.');
console.log(problems ? '\n⚠ فيه ' + problems + ' حاجة محتاجة انتباه (فوق).' : '\n✔ تمام.');
if (!CHECK && !problems) {
  console.log('\nمتغيرات البيئة المطلوبة على السيرفر:');
  console.log('  BEHIND_CLOUDFLARE=true      (لازم، عشان الـ IP الحقيقي)');
  console.log('  DATA_DIR=<مسار دائم>        (فيه bans.json؛ على Azure مثلاً D:\\home\\data أو /home/data)');
  console.log('  MOD_BAN_HOURS=48            (اختياري، 48 هي الافتراضي)');
}
process.exitCode = problems ? 1 : 0;
