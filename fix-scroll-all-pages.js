// fix-scroll-all-pages.js
// يصلح مشكلة السكرول (overflow: hidden) في كل ملفات about-*.html و blog-*.html
// الاستخدام: node fix-scroll-all-pages.js

const fs = require('fs');
const path = require('path');

const dir = __dirname;
const files = fs.readdirSync(dir).filter(f =>
    /^(about|blog)(-[a-z]{2})?\.html$/i.test(f) || f === 'about.html'
);

const fixSnippet = `<style>
  html, body { overflow: auto !important; height: auto !important; min-height: 100%; }
</style>
</head>`;

let fixedCount = 0;
let skippedCount = 0;

files.forEach(file => {
    const filePath = path.join(dir, file);
    let content = fs.readFileSync(filePath, 'utf8');

    // لو الإصلاح موجود بالفعل، متعملش حاجة
    if (content.includes('overflow: auto !important')) {
        console.log(`⏭️  Skipped (already fixed): ${file}`);
        skippedCount++;
        return;
    }

    if (!content.includes('</head>')) {
        console.log(`⚠️  No </head> found, skipped: ${file}`);
        skippedCount++;
        return;
    }

    // استبدال آخر </head> في الملف (لو فيه أكتر من واحدة بالغلط ناخد الأخيرة)
    const lastHeadIndex = content.lastIndexOf('</head>');
    content = content.slice(0, lastHeadIndex) + fixSnippet + content.slice(lastHeadIndex + '</head>'.length);

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Fixed: ${file}`);
    fixedCount++;
});

console.log(`\nDone. Fixed: ${fixedCount}, Skipped: ${skippedCount}, Total scanned: ${files.length}`);