// optimize-performance.js
// بيحسّن سرعة الصفحة وإمكانية الوصول من غير ما يغيّر أي شكل أو لون أو تخطيط.
// شغله بـ: node optimize-performance.js

const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const MARKER = '<!-- perf-optimized -->';

// الملفات الخارجية اللي هنأجل تحميلها (نفس الروابط بالظبط زي ما هي في الكود)
const HEAVY_SCRIPTS = [
  '<script src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@3.11.0/dist/tf.min.js"></script>',
  '<script src="https://cdn.jsdelivr.net/npm/nsfwjs@2.4.1/dist/nsfwjs.min.js"></script>',
  '<script src="/socket.io/socket.io.js"></script>',
  '<script src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js" crossorigin="anonymous"></script>',
  '<script src="https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js" crossorigin="anonymous"></script>',
];

const FA_LINK = '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">';

const FA_LINK_OPTIMIZED = `<link rel="preload" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" as="style" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css"></noscript>`;

// قوائم select اللي محتاجة aria-label (علشان قارئ الشاشة بس - مفيش أي تأثير بصري)
const ARIA_LABELS = {
  'id="countrySelect"': 'aria-label="اختيار الدولة"',
  'id="translationLang"': 'aria-label="لغة الترجمة"',
  'id="siteLang"': 'aria-label="اختيار لغة الموقع"',
  'id="landingLangSelect"': 'aria-label="اختيار لغة الموقع"',
};

const files = fs.readdirSync(DIR).filter(f => f.endsWith('.html'));

let processed = 0, skipped = 0;

files.forEach(file => {
  const filePath = path.join(DIR, file);
  let content = fs.readFileSync(filePath, 'utf8');

  if (content.includes(MARKER)) {
    console.log(`⏭️  متخطي (معمول قبل كده): ${file}`);
    skipped++;
    return;
  }

  let changed = false;

  // 1) شيل السكريبتات الثقيلة من مكانها الأصلي في <head>
  let collectedScripts = [];
  HEAVY_SCRIPTS.forEach(tag => {
    if (content.includes(tag)) {
      content = content.replace(tag + '\n', '').replace(tag, '');
      // ضيف defer للنسخة اللي هتترحل تحت
      const deferred = tag.replace('<script src=', '<script defer src=');
      collectedScripts.push(deferred);
      changed = true;
    }
  });

  // 2) حط السكريبتات دي تاني قبل <script src="script.js"> مباشرة (بنفس الترتيب)
  if (collectedScripts.length > 0 && content.includes('<script src="script.js"></script>')) {
    content = content.replace(
      '<script src="script.js"></script>',
      collectedScripts.join('\n') + '\n<script src="script.js"></script>'
    );
  }

  // 3) حوّل Font Awesome لتحميل غير حاجب للعرض
  if (content.includes(FA_LINK)) {
    content = content.replace(FA_LINK, FA_LINK_OPTIMIZED);
    changed = true;
  }

  // 4) ضيف aria-label للقوائم اللي من غيرها
  Object.entries(ARIA_LABELS).forEach(([idAttr, ariaAttr]) => {
    if (content.includes(idAttr) && !content.includes(idAttr + ' ' + ariaAttr)) {
      // تأكد إن مفيش aria-label موجود أصلاً على نفس العنصر
      const regex = new RegExp(idAttr.replace(/"/g, '\\"'));
      const idx = content.search(regex);
      if (idx !== -1) {
        const snippet = content.slice(idx, idx + 150);
        if (!snippet.includes('aria-label')) {
          content = content.replace(idAttr, idAttr + ' ' + ariaAttr);
          changed = true;
        }
      }
    }
  });

  if (changed) {
    // حط علامة إننا عدّلنا الملف ده عشان السكريبت ميشتغلش عليه تاني
    content = content.replace('<head>', '<head>\n' + MARKER);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ اتحسّن: ${file}`);
    processed++;
  } else {
    console.log(`⚠️  مفيش حاجة اتغيرت في: ${file} (شكل الصفحة مختلف عن المتوقع)`);
  }
});

console.log(`\nخلاص. اتحسّن: ${processed} صفحة | اتخطى: ${skipped} صفحة`);
