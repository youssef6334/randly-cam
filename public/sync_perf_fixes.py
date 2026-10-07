import os
import re

# قائمة ملفات اللغات الـ 11
lang_files = [
    'en.html', 'es.html', 'fr.html', 'de.html',
    'it.html', 'pt.html', 'tr.html', 'ru.html',
    'hi.html', 'id.html', 'zh.html'
]

# كود السكربتات المحدث في أسفل الصفحة
new_scripts_block = """    <!-- سكربتات الموقع الأساسية مع خاصية defer -->
    <script src="/socket.io/socket.io.js" defer></script>
    <script src="script.js?v=20261005-v32-header-settings-2" defer></script>
    <script src="i18n-extra.js?v=20261005-controls" defer></script>
    <script src="randly-extra.js?v=20261005-v31-2" defer></script>

    <!-- تحميل إعلانات AdSense و Adsterra بعد اكتمال الصفحة والتفاعل -->
    <script>
      function loadDelayedAds() {
        if (window.adsLoaded) return;
        window.adsLoaded = true;

        var adsense = document.createElement('script');
        adsense.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3125079750975955";
        adsense.crossOrigin = "anonymous";
        adsense.async = true;
        document.head.appendChild(adsense);

        var adsterra = document.createElement('script');
        adsterra.async = true;
        adsterra.setAttribute('data-cfasync', 'false');
        adsterra.src = "https://pl30790288.effectivecpmnetwork.com/af/01/4f/af014f7d78a0555fd804897f8175cc44.js";
        (document.getElementById('adContent') || document.body).appendChild(adsterra);
      }

      ['touchstart', 'scroll', 'mousemove', 'keydown'].forEach(function(e) {
        window.addEventListener(e, loadDelayedAds, { once: true, passive: true });
      });
      window.addEventListener('load', function() {
        setTimeout(loadDelayedAds, 3500);
      });
    </script>
</body>"""

for filename in lang_files:
    if not os.path.exists(filename):
        print(f"File not found, skipping: {filename}")
        continue

    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. إزالة كود AdSense من الـ head
    content = re.sub(
        r'<script\s+async\s+src="https://pagead2\.googlesyndication\.com/pagead/js/adsbygoogle\.js\?client=ca-pub-3125079750975955"[^>]*>\s*</script>',
        '',
        content
    )

    # 2. تحديث استدعاء style.css و preload
    style_pattern = r'<link\s+rel="stylesheet"\s+href="style\.css\?v=[^"]+">'
    replacement_style = """<link rel="preload" href="style.css?v=20261007-0645" as="style">
    <link rel="stylesheet" href="style.css?v=20261007-0645">"""
    
    if '<link rel="preload" href="style.css' not in content:
        content = re.sub(style_pattern, replacement_style, content, count=1)

    # 3. استبدال السكربتات القديمة قبل </body> بالسكربتات الجديدة المحسنة
    old_scripts_pattern = r'<script\s+src="/socket\.io/socket\.io\.js">.*?</script>\s*</body>'
    content = re.sub(old_scripts_pattern, new_scripts_block, content, flags=re.DOTALL)

    with open(filename, 'w', encoding='utf-8') as f:
        f.write(content)

    print(f"Successfully updated: {filename}")

print("\nDone! All language files have been updated.")