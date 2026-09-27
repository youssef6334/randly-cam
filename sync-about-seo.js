const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://randly.live';

// خريطة: ملف الصفحة الرئيسية -> ملف about بتاعه + نص رابط الفوتر بلغته
const aboutPages = [
  { main: 'index.html', about: 'about.html', hreflang: 'ar', label: 'عن الموقع' },
  { main: 'en.html', about: 'about-en.html', hreflang: 'en', label: 'About' },
  { main: 'es.html', about: 'about-es.html', hreflang: 'es', label: 'Acerca de' },
  { main: 'fr.html', about: 'about-fr.html', hreflang: 'fr', label: 'À propos' },
  { main: 'de.html', about: 'about-de.html', hreflang: 'de', label: 'Über uns' },
  { main: 'it.html', about: 'about-it.html', hreflang: 'it', label: 'Chi siamo' },
  { main: 'pt.html', about: 'about-pt.html', hreflang: 'pt', label: 'Sobre' },
  { main: 'tr.html', about: 'about-tr.html', hreflang: 'tr', label: 'Hakkında' },
  { main: 'ru.html', about: 'about-ru.html', hreflang: 'ru', label: 'О нас' },
  { main: 'hi.html', about: 'about-hi.html', hreflang: 'hi', label: 'हमारे बारे में' },
  { main: 'id.html', about: 'about-id.html', hreflang: 'id', label: 'Tentang' },
  { main: 'zh.html', about: 'about-zh.html', hreflang: 'zh', label: '关于我们' }
];

// ============ 1) إضافة hreflang لكل ملفات about ============
function buildHreflangBlock() {
  let block = '\n';
  aboutPages.forEach(p => {
    block += `<link rel="alternate" hreflang="${p.hreflang}" href="${BASE_URL}/${p.about}">\n`;
  });
  block += `<link rel="alternate" hreflang="x-default" href="${BASE_URL}/about.html">\n`;
  return block;
}

aboutPages.forEach(p => {
  const filePath = path.join(__dirname, p.about);
  if (!fs.existsSync(filePath)) {
    console.log(`⏭️  ${p.about} skipped (not found)`);
    return;
  }

  let content = fs.readFileSync(filePath, 'utf8');

  // نشيل أي hreflang قديم بتاع about لو موجود (تشغيل تاني للسكريبت من غير تكرار)
  content = content.replace(/(<link rel="alternate" hreflang="[a-z-]+" href="https:\/\/randly\.live\/about[^"]*">\n?)+/g, '');

  const canonicalRegex = /(<link rel="canonical" href="https:\/\/randly\.live\/about[^"]*">)/;
  if (canonicalRegex.test(content)) {
    content = content.replace(canonicalRegex, `$1${buildHreflangBlock()}`);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ hreflang updated in ${p.about}`);
  } else {
    console.log(`⚠️  canonical tag not found in ${p.about}, hreflang not added`);
  }
});

// ============ 2) تحديث sitemap.xml ============
const sitemapPath = path.join(__dirname, 'sitemap.xml');
if (fs.existsSync(sitemapPath)) {
  let sitemap = fs.readFileSync(sitemapPath, 'utf8');

  aboutPages.forEach(p => {
    const url = `${BASE_URL}/${p.about}`;
    const urlTag = `<url><loc>${url}</loc></url>`;
    if (!sitemap.includes(url)) {
      sitemap = sitemap.replace('</urlset>', `  ${urlTag}\n</urlset>`);
      console.log(`✅ Added to sitemap: ${p.about}`);
    } else {
      console.log(`⏭️  ${p.about} already in sitemap`);
    }
  });

  fs.writeFileSync(sitemapPath, sitemap, 'utf8');
} else {
  console.log('⚠️  sitemap.xml not found');
}

// ============ 3) إضافة رابط About في فوتر كل صفحة رئيسية ============
aboutPages.forEach(p => {
  const filePath = path.join(__dirname, p.main);
  if (!fs.existsSync(filePath)) {
    console.log(`⏭️  ${p.main} skipped (not found)`);
    return;
  }

  let content = fs.readFileSync(filePath, 'utf8');

  if (content.includes(`href="${p.about}"`)) {
    console.log(`⏭️  About link already exists in ${p.main}`);
    return;
  }

  // نحط رابط About بعد رابط privacy.html في الفوتر
  const privacyLinkRegex = /(<a href="privacy\.html"[^>]*>[^<]*<\/a>)/;
  if (privacyLinkRegex.test(content)) {
    content = content.replace(
      privacyLinkRegex,
      `$1\n<a href="${p.about}">${p.label}</a>`
    );
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ About link added to ${p.main}`);
  } else {
    console.log(`⚠️  privacy.html link not found in footer of ${p.main}`);
  }
});

console.log('\n🎉 خلصت! راجع الملفات بـ git diff قبل ما تعمل commit و push.');