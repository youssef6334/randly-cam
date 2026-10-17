// remove-unused-scripts.js
// بيشيل نهائياً المكتبات الثقيلة الغير مستخدمة (tensorflow, nsfwjs, mediapipe)
// بعد التأكد إنها مش مستخدمة في script.js خالص.
// شغله بـ: node remove-unused-scripts.js
// (شغله بعد ما شغلت optimize-performance.js قبل كده)

const fs = require('fs');
const path = require('path');

const DIR = __dirname;

// كل الأشكال المحتملة للسطور دي (عادي أو defer) عشان نتأكد نشيلها في أي حالة
const UNUSED_PATTERNS = [
  /<script\s+(defer\s+)?src="https:\/\/cdn\.jsdelivr\.net\/npm\/@tensorflow\/tfjs@3\.11\.0\/dist\/tf\.min\.js"><\/script>\n?/g,
  /<script\s+(defer\s+)?src="https:\/\/cdn\.jsdelivr\.net\/npm\/nsfwjs@2\.4\.1\/dist\/nsfwjs\.min\.js"><\/script>\n?/g,
  /<script\s+(defer\s+)?src="https:\/\/cdn\.jsdelivr\.net\/npm\/@mediapipe\/camera_utils\/camera_utils\.js"\s+crossorigin="anonymous"><\/script>\n?/g,
  /<script\s+(defer\s+)?src="https:\/\/cdn\.jsdelivr\.net\/npm\/@mediapipe\/face_mesh\/face_mesh\.js"\s+crossorigin="anonymous"><\/script>\n?/g,
];

const files = fs.readdirSync(DIR).filter(f => f.endsWith('.html'));

let processed = 0, skipped = 0;

files.forEach(file => {
  const filePath = path.join(DIR, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  UNUSED_PATTERNS.forEach(pattern => {
    if (pattern.test(content)) {
      content = content.replace(pattern, '');
      changed = true;
    }
  });

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ اتشالت منه المكتبات الغير مستخدمة: ${file}`);
    processed++;
  } else {
    console.log(`⏭️  متخطي (مفيش حاجة لتشيلها): ${file}`);
    skipped++;
  }
});

console.log(`\nخلاص. اتنضف: ${processed} صفحة | اتخطى: ${skipped} صفحة`);
console.log('ملحوظة: لو فيه ميزة بتستخدم فلتر وجه ذكي (face detection حقيقي) وكانت واقفة أصلاً، هي هتفضل واقفة زي ما هي، مفيش حاجة اتغيرت غير إن الملفات الميتة اتشالت.');
