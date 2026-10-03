// add-favicon-tags.js
// يضيف روابط الـ favicon جوه <head> في كل صفحات HTML بالفولدر
// شغله بـ: node add-favicon-tags.js

const fs = require('fs');
const path = require('path');

const DIR = __dirname;

const FAVICON_TAGS = `<link rel="icon" type="image/x-icon" href="/favicon.ico">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="icon" type="image/png" sizes="192x192" href="/android-chrome-192x192.png">
<link rel="icon" type="image/png" sizes="512x512" href="/android-chrome-512x512.png">
`;

const files = fs.readdirSync(DIR).filter(f => f.endsWith('.html'));

let added = 0, skipped = 0;

files.forEach(file => {
  const filePath = path.join(DIR, file);
  let content = fs.readFileSync(filePath, 'utf8');

  if (content.includes('favicon.ico') || content.includes('favicon-32x32.png')) {
    console.log(`⏭️  متخطي (موجود بالفعل): ${file}`);
    skipped++;
    return;
  }

  if (!content.includes('<head>')) {
    console.log(`⚠️  مفيش <head> في: ${file} — اتخطى`);
    return;
  }

  content = content.replace('<head>', '<head>\n' + FAVICON_TAGS);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`✅ اتضاف الفافيكون في: ${file}`);
  added++;
});

console.log(`\nخلاص. اتضاف في: ${added} صفحة | اتخطى: ${skipped} صفحة`);
