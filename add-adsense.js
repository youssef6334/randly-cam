const fs = require('fs');
const path = require('path');

const adSenseScript = `    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3125079750975955" crossorigin="anonymous"></script>\n`;

// قراءة جميع ملفات المجلد الحالي
const files = fs.readdirSync(__dirname);

files.forEach(file => {
    if (path.extname(file) === '.html') {
        const filePath = path.join(__dirname, file);
        let content = fs.readFileSync(filePath, 'utf8');

        // التأكد من عدم وجود الكود مسبقاً لعدم تكراره
        if (content.includes('ca-pub-3125079750975955')) {
            console.log(`⚠️ موجود بالفعل في: ${file}`);
            return;
        }

        // إضافة الكود قبل إغلاق </head>
        if (content.includes('</head>')) {
            content = content.replace('</head>', `${adSenseScript}</head>`);
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`✅ تمت الإضافة بنجاح في: ${file}`);
        }
    }
});