import os
import re

# التأكد من وجود ملف index.html كمصدر أساسي
if not os.path.exists("index.html"):
    print("Error: index.html not found! Make sure you are inside the 'public' directory.")
    exit(1)

with open("index.html", "r", encoding="utf-8") as f:
    index_content = f.read()

# 1. استخراج بلوك الخطوط والـ CSS من index.html
head_match = re.search(
    r'(<!-- تحميل مسبق للخطوط.*?</noscript>)', 
    index_content, 
    re.DOTALL
)

if not head_match:
    # نمط بديل في حال اختلاف التعليق
    head_match = re.search(
        r'(<link rel="preload" href="style\.css.*?</noscript>)', 
        index_content, 
        re.DOTALL
    )

new_head_block = head_match.group(1) if head_match else None

# 2. استخراج بلوك السكربتات بالكامل قبل </body> من index.html
scripts_match = re.search(
    r'((?:<script.*?</script>\s*)+)\s*</body>', 
    index_content, 
    re.DOTALL
)
new_scripts_block = scripts_match.group(1).strip() if scripts_match else None

if not new_head_block or not new_scripts_block:
    print("Warning: Could not extract all target blocks automatically from index.html.")
    print("Please ensure index.html contains the recent CSS and script updates.")
    exit(1)

# قائمة ملفات اللغات الـ 11
lang_files = [
    'en.html', 'es.html', 'fr.html', 'de.html',
    'it.html', 'pt.html', 'tr.html', 'ru.html',
    'hi.html', 'id.html', 'zh.html'
]

for filename in lang_files:
    if not os.path.exists(filename):
        print(f"Skipping (not found): {filename}")
        continue

    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()

    # أ) إزالة أي كود قديم لـ AdSense في الـ head
    content = re.sub(
        r'<script\s+async\s+src="https://pagead2\.googlesyndication\.com/pagead/js/adsbygoogle\.js\?client=ca-pub-3125079750975955"[^>]*>\s*</script>',
        '',
        content
    )

    # ب) استبدال استدعاء style.css وما يجاوره بالبلوك الجديد
    old_css_pattern = r'(?:<link rel="preload" href="style\.css.*?</noscript>|<link\s+rel="stylesheet"\s+href="style\.css\?v=[^"]+">)'
    if re.search(old_css_pattern, content, re.DOTALL):
        content = re.sub(old_css_pattern, new_head_block, content, count=1, flags=re.DOTALL)

    # ج) استبدال السكربتات في أسفل الصفحة بالبلوك الجديد كاملاً
    old_scripts_pattern = r'(?:<!--.*?-->\s*)?<script.*?</script>\s*</body>'
    replacement = f"{new_scripts_block}\n</body>"
    content = re.sub(old_scripts_pattern, replacement, content, flags=re.DOTALL)

    with open(filename, 'w', encoding='utf-8') as f:
        f.write(content)

    print(f"Updated successfully: {filename}")

print("\nDone! All 11 language files are now perfectly synced with index.html.")