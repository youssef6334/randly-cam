/**
 * add-blog-sitemap.js
 * يضيف روابط صفحات البلوج الـ12 لملف sitemap.xml دفعة واحدة.
 *
 * طريقة الاستخدام:
 *   1. حط الملف ده في نفس فولدر المشروع (جنب sitemap.xml).
 *   2. شغّل:  node add-blog-sitemap.js
 *   3. يطلّع لك تقرير: كام رابط اتضاف / كام كان موجود أصلاً.
 */

const fs = require('fs');
const path = require('path');

const SITE = 'https://randly.live';
const BLOG_PAGES = [
  'blog-ar.html', 'blog-en.html', 'blog-es.html', 'blog-fr.html',
  'blog-de.html', 'blog-it.html', 'blog-pt.html', 'blog-tr.html',
  'blog-ru.html', 'blog-hi.html', 'blog-id.html', 'blog-zh.html',
];

const sitemapPath = path.join(__dirname, 'sitemap.xml');

if (!fs.existsSync(sitemapPath)) {
  console.log('❌ مش لاقي ملف sitemap.xml في نفس الفولدر.');
  process.exit(1);
}

let xml = fs.readFileSync(sitemapPath, 'utf8');

const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

let added = 0, skipped = 0;
let newEntries = '';

for (const page of BLOG_PAGES) {
  const url = `${SITE}/${page}`;
  if (xml.includes(url)) {
    console.log(`⏭️  موجود أصلاً: ${page}`);
    skipped++;
    continue;
  }
  newEntries += `  <url>\n    <loc>${url}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n  </url>\n`;
  console.log(`✅ هيتضاف: ${page}`);
  added++;
}

if (added === 0) {
  console.log('\nمفيش حاجة تتضاف، كل روابط البلوج موجودة بالفعل في sitemap.xml.');
  process.exit(0);
}

if (xml.includes('</urlset>')) {
  xml = xml.replace('</urlset>', newEntries + '</urlset>');
} else {
  // لو الملف فاضي أو مش بالشكل القياسي، اعمل sitemap بسيط وحطه
  xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${newEntries}</urlset>\n`;
}

fs.writeFileSync(sitemapPath, xml, 'utf8');

console.log(`\nالنتيجة: ${added} رابط اتضاف، ${skipped} كان موجود. sitemap.xml اتحدّث.`);