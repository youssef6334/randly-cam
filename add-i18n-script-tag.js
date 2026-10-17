/**
 * add-i18n-script-tag.js
 * يضيف <script src="i18n-extra.js"></script> بعد <script src="script.js"></script>
 * في كل صفحات اللغات الـ12 دفعة واحدة.
 *
 * شرط: يكون ملف i18n-extra.js موجود في نفس الفولدر (حمّله قبل كده).
 * شغّل:  node add-i18n-script-tag.js
 */
const fs = require('fs');
const path = require('path');

const PAGES = ['index.html','en.html','es.html','fr.html','de.html','it.html',
               'pt.html','tr.html','ru.html','hi.html','id.html','zh.html'];

let added = 0, skipped = 0, missing = 0;

for (const page of PAGES) {
  const filePath = path.join(__dirname, page);
  if (!fs.existsSync(filePath)) { console.log(`❌ مش لاقي: ${page}`); missing++; continue; }

  let html = fs.readFileSync(filePath, 'utf8');

  if (html.includes('i18n-extra.js')) {
    console.log(`⏭️  متخطي (مضاف أصلاً): ${page}`);
    skipped++;
    continue;
  }

  const re = /(<script\s+src=["']script\.js["']\s*>\s*<\/script>)/i;
  if (!re.test(html)) {
    console.log(`⚠️  مش لاقي <script src="script.js"> في: ${page} — ضيفه يدوي`);
    missing++;
    continue;
  }

  html = html.replace(re, `$1\n<script src="i18n-extra.js"></script>`);
  fs.writeFileSync(filePath, html, 'utf8');
  console.log(`✅ اتضاف: ${page}`);
  added++;
}

console.log(`\nالنتيجة: ${added} اتضافوا، ${skipped} متخطيين، ${missing} محتاجين إضافة يدوية.`);