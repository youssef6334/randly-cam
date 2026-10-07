# -*- coding: utf-8 -*-
import os

# قائمة كل ملفات اللغات بجانب index.html
lang_files = [
    'index.html', 'en.html', 'es.html', 'fr.html', 'de.html',
    'it.html', 'pt.html', 'tr.html', 'ru.html',
    'hi.html', 'id.html', 'zh.html'
]

# السطر النظيف والآمن للـ CSS الذي اعتمدناه للتو
correct_css = '<link rel="stylesheet" href="style.css?v=20261007-0645">'

for filename in lang_files:
    if not os.path.exists(filename):
        continue

    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()

    # إذا كان الملف يحتوي على أي رابط قديم لـ style.css، نقوم باستبداله بالرابط الصحيح النظيف
    # وإن لم يوجد، نقوم بإضافته بسلام داخل الـ <head> بدون المساس بمحتوى الصفحة نهائياً
    if 'href="style.css' in content:
        # استبدال أي سطر قديم يحمل style.css بالسطر النظيف
        lines = content.splitlines()
        new_lines = []
        for line in lines:
            if 'href="style.css' in line or 'media="print"' in line and 'style.css' in line:
                # نضع الرابط النظيف أول مرة ونترك الباقي
                if correct_css not in new_lines:
                    new_lines.append(f"    {correct_css}")
            else:
                new_lines.append(line)
        content = "\n".join(new_lines)
    else:
        # إذا لم يُوجد رابط ستايل، نضيفه قبل إغلاق الـ </head>
        content = content.replace('</head>', f'    {correct_css}\n</head>')

    with open(filename, 'w', encoding='utf-8') as f:
        f.write(content)

    print(f"تمت مراجعة وتعديل الملف بأمان: {filename}")

print("\nتم تحديث جميع الملفات بنجاح دون المساس بمحتواها!")