// fix-socketio.js
// إصلاح عاجل: شيل "defer" من socket.io.js بس (لازم يحمل ويشتغل قبل script.js مباشرة)
// باقي السكريبتات هتفضل زي ما هي.
// شغله بـ: node fix-socketio.js

const fs = require('fs');
const path = require('path');

const DIR = __dirname;

const BROKEN = '<script defer src="/socket.io/socket.io.js"></script>';
const FIXED = '<script src="/socket.io/socket.io.js"></script>';

const files = fs.readdirSync(DIR).filter(f => f.endsWith('.html'));

let fixed = 0, skipped = 0;

files.forEach(file => {
  const filePath = path.join(DIR, file);
  let content = fs.readFileSync(filePath, 'utf8');

  if (content.includes(BROKEN)) {
    content = content.replace(BROKEN, FIXED);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ اتصلح: ${file}`);
    fixed++;
  } else {
    console.log(`⏭️  متخطي (مفيش المشكلة فيه): ${file}`);
    skipped++;
  }
});

console.log(`\nخلاص. اتصلح: ${fixed} صفحة | اتخطى: ${skipped} صفحة`);
console.log('socket.io.js هيحمل الآن بشكل طبيعي قبل script.js مباشرة، والشات والعداد لازم يرجعوا يشتغلوا.');
