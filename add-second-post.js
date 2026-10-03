const fs = require('fs');
const path = require('path');

// بيانات المقال الثاني مترجمة للـ 12 لغة
const postsData = {
  ar: {
    title: 'شات فيديو عشوائي مجاني بدون تسجيل 2026: دليلك الكامل',
    desc: 'ابدأ شات فيديو عشوائي مجاني مع غرباء بدون تسجيل أو تحميل تطبيق، مع اختيار الدولة والترجمة الفورية مجاناً…',
    more: 'اقرأ المزيد',
    dateText: '3 أكتوبر 2026',
    dateVal: '2026-10-03'
  },
  en: {
    title: 'Free Random Video Chat Without Registration 2026: The Complete Guide',
    desc: 'Start a free random video chat with strangers without registration or app download. Free country filter and instant translation…',
    more: 'Read more',
    dateText: 'October 3, 2026',
    dateVal: '2026-10-03'
  },
  es: {
    title: 'Chat de Vídeo Aleatorio Gratis Sin Registro 2026: Guía Completa',
    desc: 'Inicia un chat de vídeo aleatorio gratis con desconocidos sin registrarte ni descargar apps, con filtro de país y traducción…',
    more: 'Leer más',
    dateText: '3 de octubre de 2026',
    dateVal: '2026-10-03'
  },
  fr: {
    title: 'Chat Vidéo Aléatoire Gratuit Sans Inscription 2026 : Le Guide Complet',
    desc: 'Démarrez un chat vidéo aléatoire gratuit avec des inconnus sans inscription ni téléchargement d’application, avec filtre par pays…',
    more: 'Lire la suite',
    dateText: '3 octobre 2026',
    dateVal: '2026-10-03'
  },
  de: {
    title: 'Kostenloser Zufalls-Videochat Ohne Registrierung 2026: Der Komplette Leitfaden',
    desc: 'Starten Sie einen kostenlosen Zufalls-Videochat mit Fremden ohne Registrierung oder App-Download, mit Länderfilter und Übersetzung…',
    more: 'Mehr lesen',
    dateText: '3. Oktober 2026',
    dateVal: '2026-10-03'
  },
  it: {
    title: 'Video Chat Casuale Gratis Senza Registrazione 2026: Guida Completa',
    desc: 'Avvia una video chat casuale gratuita con sconosciuti senza registrazione né download di app, con selezione del paese e traduzione…',
    more: 'Leggi di più',
    dateText: '3 ottobre 2026',
    dateVal: '2026-10-03'
  },
  pt: {
    title: 'Chat de Vídeo Aleatório Grátis Sem Registro 2026: Guia Completo',
    desc: 'Inicie um chat de vídeo aleatório gratuito com estranhos sem registro ou download de app, com filtro de país e tradução instantânea…',
    more: 'Leia mais',
    dateText: '3 de outubro de 2026',
    dateVal: '2026-10-03'
  },
  tr: {
    title: 'Kayıtsız Ücretsiz Rastgele Görüntülü Sohbet 2026: Tam Rehber',
    desc: 'Kayıt olmadan veya uygulama indirmeden yabancılarla ücretsiz rastgele görüntülü sohbet başlatın, ülke seçimi ve anında çeviriyle…',
    more: 'Daha fazla oku',
    dateText: '3 Ekim 2026',
    dateVal: '2026-10-03'
  },
  ru: {
    title: 'Бесплатный случайный видеочат без регистрации 2026: Полное руководство',
    desc: 'Начните бесплатный случайный видеочат с незнакомцами без регистрации и скачивания приложений, с выбором страны и мгновенным переводом…',
    more: 'Читать далее',
    dateText: '3 октября 2026 г.',
    dateVal: '2026-10-03'
  },
  hi: {
    title: 'बिना पंजीकरण के मुफ्त यादृच्छिक वीडियो चैट 2026: पूरी गाइड',
    desc: 'बिना किसी पंजीकरण या ऐप डाउनलोड के अजनबियों के साथ मुफ्त वीडियो चैट शुरू करें, देश चयन और त्वरित अनुवाद के साथ…',
    more: 'और पढ़ें',
    dateText: '3 अक्टूबर, 2026',
    dateVal: '2026-10-03'
  },
  id: {
    title: 'Video Chat Acak Gratis Tanpa Registrasi 2026: Panduan Lengkap',
    desc: 'Mulai obrolan video acak gratis dengan orang asing tanpa pendaftaran atau mengunduh aplikasi, dengan filter negara dan terjemahan…',
    more: 'Baca selengkapnya',
    dateText: '3 Oktober 2026',
    dateVal: '2026-10-03'
  },
  zh: {
    title: '2026 无需注册的免费随机视频聊天：完整指南',
    desc: '无需注册或下载应用程序即可与陌生人开始免费随机视频聊天，支持国家筛选和即时翻译…',
    more: '阅读更多',
    dateText: '2026年10月3日',
    dateVal: '2026-10-03'
  }
};

// إنشاء قالب الكارت
function generateCard(lang, data) {
  const postUrl = `post-free-video-chat-${lang}.html`;
  return `<!-- ===== كارت المقال الثاني ===== -->
<article class="blog-card">
<h2><a href="${postUrl}">${data.title}</a></h2>
<p>${data.desc} <a class="blog-more" href="${postUrl}">${data.more}</a></p>
<time datetime="${data.dateVal}">${data.dateText}</time>
</article>
<!-- ===== نهاية الكارت ===== -->`;
}

// تنفيذ الإضافة على جميع ملفات blog-*.html
Object.keys(postsData).forEach(lang => {
  const fileName = `blog-${lang}.html`;
  const filePath = path.join(__dirname, fileName);

  if (!fs.existsSync(filePath)) {
    console.warn(`[!] الملف غير موجود: ${fileName}`);
    return;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  const postTargetUrl = `post-free-video-chat-${lang}.html`;

  // منع التكرار في حال تشغيل السكريبت أكثر من مرة
  if (content.includes(postTargetUrl)) {
    console.log(`[-] المقال مضاف مسبقاً في: ${fileName}`);
    return;
  }

  const cardHtml = generateCard(lang, postsData[lang]);

  // إدراج المقال الجديد داخل الـ blog-grid كأول مقال
  if (content.includes('<div class="blog-grid">')) {
    content = content.replace(
      '<div class="blog-grid">',
      `<div class="blog-grid">\n\n${cardHtml}`
    );
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`[✓] تم إضافة المقال بنجاح إلى: ${fileName}`);
  } else {
    console.error(`[X] لم يتم العثور على div.blog-grid في الملف: ${fileName}`);
  }
});