/*
 * make-blog-index.js
 * ------------------
 * بيحوّل كل blog-xx.html من "مقال واحد" إلى "صفحة مدونة بكروت":
 *   1) المقال الحالي بيتنقل إلى post-omegle-alternative-xx.html (مع زر رجوع للمدونة)
 *   2) blog-xx.html بيتعمل من جديد كصفحة كروت (عنوان + ملخص + اقرأ المزيد + تاريخ)
 *
 * الاستخدام (من فولدر المشروع):
 *   node make-blog-index.js ar     -> لغة واحدة بس (جرّب بيها الأول)
 *   node make-blog-index.js        -> كل اللغات
 *
 * آمن للتشغيل أكتر من مرة: لو الصفحة اتحوّلت قبل كده بيتخطاها.
 */
const fs = require('fs');

const DOMAIN = 'https://randly.live';
const SLUG = 'omegle-alternative';

const L = {
  ar: { locale: 'ar-u-nu-latn', blog: 'المدونة', more: 'اقرأ المزيد', back: 'رجوع للمدونة', arrow: '→', desc: 'مقالات ونصائح عن الشات العشوائي والتعرف على أصدقاء جدد بأمان على Randly.' },
  en: { locale: 'en-US', blog: 'Blog', more: 'Read more', back: 'Back to blog', arrow: '←', desc: 'Articles and tips about random chat and meeting new people safely on Randly.' },
  es: { locale: 'es-ES', blog: 'Blog', more: 'Leer más', back: 'Volver al blog', arrow: '←', desc: 'Artículos y consejos sobre chat aleatorio y cómo conocer gente nueva de forma segura en Randly.' },
  fr: { locale: 'fr-FR', blog: 'Blog', more: 'Lire la suite', back: 'Retour au blog', arrow: '←', desc: 'Articles et conseils sur le chat aléatoire et les rencontres en ligne en toute sécurité sur Randly.' },
  de: { locale: 'de-DE', blog: 'Blog', more: 'Weiterlesen', back: 'Zurück zum Blog', arrow: '←', desc: 'Artikel und Tipps zum Zufalls-Chat und zum sicheren Kennenlernen neuer Leute auf Randly.' },
  it: { locale: 'it-IT', blog: 'Blog', more: 'Leggi di più', back: 'Torna al blog', arrow: '←', desc: 'Articoli e consigli sulla chat casuale e su come conoscere nuove persone in sicurezza su Randly.' },
  pt: { locale: 'pt-BR', blog: 'Blog', more: 'Leia mais', back: 'Voltar ao blog', arrow: '←', desc: 'Artigos e dicas sobre chat aleatório e como conhecer pessoas novas com segurança no Randly.' },
  tr: { locale: 'tr-TR', blog: 'Blog', more: 'Devamını oku', back: 'Bloga dön', arrow: '←', desc: "Randly'de rastgele sohbet ve yeni insanlarla güvenle tanışma hakkında makaleler ve ipuçları." },
  ru: { locale: 'ru-RU', blog: 'Блог', more: 'Читать далее', back: 'Назад в блог', arrow: '←', desc: 'Статьи и советы о случайном чате и безопасном знакомстве с новыми людьми на Randly.' },
  hi: { locale: 'hi-IN', blog: 'ब्लॉग', more: 'और पढ़ें', back: 'ब्लॉग पर वापस जाएँ', arrow: '←', desc: 'Randly पर रैंडम चैट और नए लोगों से सुरक्षित मिलने के बारे में लेख और सुझाव।' },
  id: { locale: 'id-ID', blog: 'Blog', more: 'Baca selengkapnya', back: 'Kembali ke blog', arrow: '←', desc: 'Artikel dan tips tentang obrolan acak dan cara bertemu orang baru dengan aman di Randly.' },
  zh: { locale: 'zh-CN', blog: '博客', more: '阅读更多', back: '返回博客', arrow: '←', desc: '关于随机聊天以及在 Randly 上安全结识新朋友的文章和技巧。' },
};

const swap = (s) => s.replace(/blog-([a-z]{2})\.html/g, `post-${SLUG}-$1.html`);

const INDEX_CSS = `
html,body{overflow:auto!important;height:auto!important;min-height:100%}
/* كل الألوان من متغيرات موقعك (style.css) عشان تتناسق معاه تلقائيًا */
.blog-wrap{max-width:900px;margin:30px auto 10px;padding:0 16px;color:var(--text-main)}
.blog-wrap h1{text-align:center;font-size:2rem;margin:20px 0 28px;color:var(--text-main)}
.blog-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:18px}
.blog-card{display:flex;flex-direction:column;background:var(--bg-card);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:20px;transition:border-color .15s,transform .15s}
.blog-card:hover{border-color:var(--accent-purple);transform:translateY(-2px)}
.blog-card h2{font-size:1.1rem;line-height:1.6;margin:0 0 10px}
.blog-card h2 a{color:var(--accent-purple);text-decoration:none}
.blog-card p{color:var(--text-main);opacity:.8;line-height:1.8;margin:0 0 12px;flex:1;font-size:.95rem}
.blog-more{color:var(--accent-purple);font-weight:bold;text-decoration:none}
.blog-more:hover{text-decoration:underline}
.blog-card time{display:block;margin-top:12px;font-size:.8rem;opacity:.55}
.app-footer{text-align:center;padding:26px 16px 36px}
.footer-links a{margin:0 8px;color:var(--text-main);text-decoration:none;opacity:.8}
`;

const BACK_CSS = `.blog-back{display:inline-block;margin-bottom:10px;color:var(--accent-purple);text-decoration:none;font-weight:bold}.blog-back:hover{text-decoration:underline}`;

function convert(lang) {
  const t = L[lang];
  const blogFile = `blog-${lang}.html`;
  const postFile = `post-${SLUG}-${lang}.html`;

  if (!fs.existsSync(blogFile)) return console.log(`- ${lang}: ${blogFile} مش موجود، اتخطى`);
  const html = fs.readFileSync(blogFile, 'utf8');
  if (html.includes('blog-grid')) return console.log(`- ${lang}: متحوّل قبل كده، اتخطى`);

  const pick = (re) => (html.match(re) || [])[1];
  const title = (pick(/<h1[^>]*>([\s\S]*?)<\/h1>/) || '').trim();
  const desc = pick(/<meta name="description" content="([^"]*)"/) || '';
  const date = pick(/"datePublished":\s*"([^"]+)"/) || '2026-10-01';
  const header = (html.match(/<header[\s\S]*?<\/header>/) || [''])[0];
  const footer = (html.match(/<footer[\s\S]*?<\/footer>/) || [''])[0];
  const dir = pick(/<html[^>]*dir="(\w+)"/) || 'ltr';
  const links = (html.match(/<link rel="(?:canonical|alternate)"[^>]*>/g) || []).join('\n');
  if (!title || !header) return console.log(`- ${lang}: ما لقيتش h1 أو header، اتخطى (راجع الملف)`);

  /* 1) ملف المقال */
  let post = html;
  post = post.replace(/<link rel="(?:canonical|alternate)"[^>]*>/g, swap);
  post = post.replace(/<meta property="og:url"[^>]*>/, swap);
  post = post.replace(/"mainEntityOfPage":\s*"[^"]*"/, swap);
  post = post.replace(/<select class="site-lang-select"[\s\S]*?<\/select>/, swap);
  post = post.replace('<div class="blog-article">',
    `<div class="blog-article">\n<a class="blog-back" href="${blogFile}">${t.arrow} ${t.back}</a>`);
  post = post.replace('</head>', `<style>${BACK_CSS}</style>\n</head>`);
  if (!fs.existsSync(postFile)) fs.writeFileSync(postFile, post);

  /* 2) صفحة الكروت */
  const excerpt = desc.length > 150 ? desc.slice(0, 150).trimEnd() + '…' : desc;
  const dateStr = new Date(date + 'T00:00:00Z').toLocaleDateString(t.locale,
    { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

  const index = `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${t.blog} - Randly</title>
<meta name="description" content="${t.desc}">
${links}
<link rel="stylesheet" href="style.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
<style>${INDEX_CSS}</style>
</head>
<body>

${header}

<main class="blog-wrap">
<h1>${t.blog}</h1>
<div class="blog-grid">

<!-- ===== كارت مقال ===== (لمقال جديد: انسخ الـ article كله تحت وغيّر الرابط والعنوان والملخص والتاريخ) -->
<article class="blog-card">
<h2><a href="${postFile}">${title}</a></h2>
<p>${excerpt} <a class="blog-more" href="${postFile}">${t.more}</a></p>
<time datetime="${date}">${dateStr}</time>
</article>
<!-- ===== نهاية الكارت ===== -->

</div>
</main>

${footer}

</body>
</html>
`;
  fs.writeFileSync(blogFile, index);
  console.log(`✔ ${lang}: اتعمل ${blogFile} (كروت) + ${postFile} (المقال)`);
}

function addToSitemap(langs) {
  if (!fs.existsSync('sitemap.xml')) return console.log('(sitemap.xml مش موجود، ضيف روابط المقالات فيه يدويًا)');
  let xml = fs.readFileSync('sitemap.xml', 'utf8');
  let added = 0;
  for (const lang of langs) {
    const loc = `${DOMAIN}/post-${SLUG}-${lang}.html`;
    if (!fs.existsSync(`post-${SLUG}-${lang}.html`) || xml.includes(loc)) continue;
    xml = xml.replace('</urlset>', `  <url><loc>${loc}</loc></url>\n</urlset>`);
    added++;
  }
  fs.writeFileSync('sitemap.xml', xml);
  console.log(`sitemap.xml: اتضاف ${added} رابط`);
}

const arg = process.argv[2];
const langs = arg ? [arg] : Object.keys(L);
if (arg && !L[arg]) { console.log('لغة غير معروفة:', arg); process.exit(1); }
langs.forEach(convert);
addToSitemap(langs);