/**
 * fix-blog-link-id.js
 * يضيف id="footerBlogLink" لرابط المدونة اللي اتضاف قبل كده في فوتر كل صفحة،
 * عشان i18n-extra.js يقدر يترجم نصه ويظبط رابطه لما المستخدم يغيّر اللغة من القايمة.
 *
 * شغّله مرة واحدة بس، بعد ما شغّلت add-blog-link.js من قبل:
 *   node fix-blog-link-id.js
 */
const fs = require('fs');
const path = require('path');

const PAGES = ['index.html','en.html','es.html','fr.html','de.html','it.html',
               'pt.html','tr.html','ru.html','hi.html','id.html','zh.html'];

let fixed = 0, skipped = 0, missing = 0;

for (const page of PAGES) {
  const filePath = path.join(__dirname, page);
  if (!fs.existsSync(filePath)) { console.log(`❌ مش لاقي: ${page}`); missing++; continue; }

  let html = fs.readFileSync(filePath, 'utf8');

  if (html.includes('id="footerBlogLink"')) {
    console.log(`⏭️  متخطي (معمول فيه الإصلاح أصلاً): ${page}`);
    skipped++;
    continue;
  }

  const re = /<a\s+href=["']\/?(blog-[a-z]{2}\.html)["']>([^<]*)<\/a>/i;
  const m = html.match(re);
  if (!m) {
    console.log(`⚠️  مش لاقي رابط البلوج في: ${page} — راجعه يدوي`);
    missing++;
    continue;
  }

  const replacement = `<a href="/${m[1]}" id="footerBlogLink">${m[2]}</a>`;
  html = html.replace(re, replacement);
  fs.writeFileSync(filePath, html, 'utf8');
  console.log(`✅ اتصلح: ${page}`);
  fixed++;
}

console.log(`\nالنتيجة: ${fixed} اتصلحوا، ${skipped} متخطيين، ${missing} محتاجين مراجعة.`);