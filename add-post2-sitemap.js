// add-post2-sitemap.js
// يضيف روابط مقال "post-free-video-chat" الى sitemap.xml
// شغله بـ: node add-post2-sitemap.js

const fs = require('fs');
const path = require('path');

const sitemapPath = path.join(__dirname, 'sitemap.xml');

if (!fs.existsSync(sitemapPath)) {
  console.error('❌ مش لاقي sitemap.xml في نفس الفولدر. تأكد إنك حاطط السكريبت جنب الملف.');
  process.exit(1);
}

let sitemap = fs.readFileSync(sitemapPath, 'utf8');

// =======================================================
// ضيف هنا أي لغة خلصتها للمقال ده (post-free-video-chat-XX.html)
// دلوقتي متوفر: ar, en فقط. لو عملت لغة جديدة زيد سطر هنا.
// =======================================================
const LANGS_DONE = ['ar','en','es','fr','de','it','pt','tr','ru','hi','id','zh'];
// مثال لما تخلص باقي اللغات:
// const LANGS_DONE = ['ar','en','es','fr','de','it','pt','tr','ru','hi','id','zh'];

const SLUG = 'post-free-video-chat';
const TODAY = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

let added = 0;
let skipped = 0;

LANGS_DONE.forEach(lang => {
  const url = `https://randly.live/${SLUG}-${lang}.html`;

  if (sitemap.includes(`<loc>${url}</loc>`)) {
    console.log(`⏭️  متخطي (موجود بالفعل): ${url}`);
    skipped++;
    return;
  }

  const entry = `  <url>
    <loc>${url}</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>monthly</changefreq>
  </url>
`;

  sitemap = sitemap.replace('</urlset>', entry + '</urlset>');
  console.log(`✅ اتضاف: ${url}`);
  added++;
});

fs.writeFileSync(sitemapPath, sitemap, 'utf8');

console.log(`\nخلاص. اتضاف: ${added} | اتخطى: ${skipped}`);
console.log('لما تخلص باقي اللغات للمقال ده، زود أسماءها في مصفوفة LANGS_DONE فوق وشغل السكريبت تاني.');