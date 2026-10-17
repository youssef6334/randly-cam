/**
 * add-blog-link.js
 * يضيف رابط "Blog" لفوتر كل صفحات اللغات دفعة واحدة.
 *
 * طريقة الاستخدام:
 *   1. حط الملف ده في نفس فولدر المشروع (جنب index.html, en.html...).
 *   2. شغّل:  node add-blog-link.js
 *   3. يطلّع لك تقرير بكل ملف: اتعدل / متخطي (لو كان معدّل قبل كده) / مش لاقيه.
 *
 * الفكرة: بيدوّر على رابط "Contact Us / تواصل معنا" (mailto:contact@randly.live)
 * جوه كل صفحة، ويضيف رابط البلوج قبله مباشرة بنفس اللغة.
 */

const fs = require('fs');
const path = require('path');

// name: [فايل الصفحة, فايل البلوج المقابل, نص رابط البلوج بلغة الصفحة]
const PAGES = {
  'index.html': ['blog-ar.html', 'المدونة'],
  'en.html':    ['blog-en.html', 'Blog'],
  'es.html':    ['blog-es.html', 'Blog'],
  'fr.html':    ['blog-fr.html', 'Blog'],
  'de.html':    ['blog-de.html', 'Blog'],
  'it.html':    ['blog-it.html', 'Blog'],
  'pt.html':    ['blog-pt.html', 'Blog'],
  'tr.html':    ['blog-tr.html', 'Blog'],
  'ru.html':    ['blog-ru.html', 'Блог'],
  'hi.html':    ['blog-hi.html', 'ब्लॉग'],
  'id.html':    ['blog-id.html', 'Blog'],
  'zh.html':    ['blog-zh.html', '博客'],
};

const CONTACT_RE = /<a\s+href=["']mailto:contact@randly\.live["'][^>]*>.*?<\/a>/i;

let changed = 0, skipped = 0, missing = 0;

for (const [page, [blogFile, label]] of Object.entries(PAGES)) {
  const filePath = path.join(__dirname, page);

  if (!fs.existsSync(filePath)) {
    console.log(`❌ مش لاقي الملف: ${page}`);
    missing++;
    continue;
  }

  let html = fs.readFileSync(filePath, 'utf8');

  // لو رابط البلوج موجود بالفعل، متلمسش الملف
  if (html.includes(blogFile)) {
    console.log(`⏭️  متخطي (رابط البلوج موجود أصلاً): ${page}`);
    skipped++;
    continue;
  }

  const match = html.match(CONTACT_RE);
  if (!match) {
    console.log(`⚠️  مش لاقي رابط "Contact" في: ${page} — راجعه يدوي`);
    missing++;
    continue;
  }

  const blogLink = `<a href="${blogFile}">${label}</a>\n`;
  html = html.replace(CONTACT_RE, blogLink + match[0]);

  fs.writeFileSync(filePath, html, 'utf8');
  console.log(`✅ اتعدل: ${page}  →  أضيف رابط ${blogFile}`);
  changed++;
}

console.log(`\nالنتيجة: ${changed} اتعدلوا، ${skipped} متخطيين، ${missing} محتاجين مراجعة يدوية.`);