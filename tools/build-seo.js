'use strict';
// Deterministic metadata and language clusters from the actual public pages.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', 'public');
const base = 'https://randly.live';
const langs = ['ar', 'en', 'es', 'fr', 'de', 'it', 'pt', 'tr', 'ru', 'hi', 'id', 'zh'];
const copy = {
    ar: ['شات فيديو عشوائي مجاني ومجهول مع الغرباء | Randly', 'تحدث مع الغرباء حول العالم عبر شات فيديو عشوائي ودردشة نصية مجانية بدون تسجيل. اكتشف فلاتر الدول والاهتمامات على Randly. للبالغين 18 عاماً فأكثر.', 'أدلة الدردشة العشوائية والتحدث مع الغرباء', 'دردشة عشوائية مجانية بدون تسجيل'],
    en: ['Free Anonymous Random Video Chat | Talk to Strangers - Randly', 'Talk to strangers worldwide with free anonymous random video chat and text chat. No sign-up. Explore country and interest filters on Randly. Adults 18+.', 'Random Chat Guides: Video Chat & Talking to Strangers', 'Free Random Chat Without Sign-Up'],
    es: ['Videochat aleatorio gratis y anónimo con extraños | Randly', 'Habla con desconocidos del mundo con videochat aleatorio y chat de texto gratis, sin registro. Filtros de país e intereses en Randly. Solo mayores de 18 años.', 'Guías de chat aleatorio y conversaciones con desconocidos', 'Chat aleatorio gratis sin registro'],
    fr: ['Chat vidéo aléatoire gratuit et anonyme | Randly', 'Parlez à des inconnus du monde entier par chat vidéo aléatoire et texte gratuit, sans inscription. Filtres par pays et intérêts sur Randly. Adultes de 18 ans et plus.', 'Guides du chat aléatoire pour parler à des inconnus', 'Chat aléatoire gratuit sans inscription'],
    de: ['Kostenloser anonymer Zufalls-Videochat mit Fremden | Randly', 'Sprich mit Fremden weltweit im kostenlosen zufälligen Video- und Textchat ohne Anmeldung. Entdecke Länder- und Interessenfilter bei Randly. Ab 18 Jahren.', 'Ratgeber für Zufallschats und Gespräche mit Fremden', 'Kostenloser Zufallschat ohne Anmeldung'],
    it: ['Videochat casuale gratis e anonima con sconosciuti | Randly', 'Parla con sconosciuti nel mondo con videochat casuale e chat di testo gratis, senza registrazione. Filtri per paese e interessi su Randly. Solo maggiorenni.', 'Guide alla chat casuale per parlare con sconosciuti', 'Chat casuale gratis senza registrazione'],
    pt: ['Chat de vídeo aleatório grátis e anônimo | Randly', 'Converse com desconhecidos do mundo todo por vídeo e texto grátis, sem cadastro. Explore filtros de país e interesses no Randly. Para maiores de 18 anos.', 'Guias de chat aleatório para conversar com desconhecidos', 'Chat aleatório grátis sem cadastro'],
    tr: ['Ücretsiz anonim rastgele görüntülü sohbet | Randly', 'Dünyanın her yerinden yabancılarla ücretsiz rastgele görüntülü ve yazılı sohbet et. Kayıt gerekmez. Randly ülke ve ilgi alanı filtreleri sunar. Yalnızca 18 yaş ve üzeri.', 'Rastgele sohbet ve yabancılarla konuşma rehberleri', 'Kayıtsız ücretsiz rastgele sohbet'],
    ru: ['Бесплатный анонимный случайный видеочат | Randly', 'Общайтесь с незнакомцами со всего мира в бесплатном случайном видео- и текстовом чате без регистрации. Фильтры стран и интересов на Randly. Только для взрослых 18+.', 'Руководства по случайному чату и общению с незнакомцами', 'Бесплатный случайный чат без регистрации'],
    hi: ['मुफ़्त गुमनाम रैंडम वीडियो चैट | Randly', 'Randly पर दुनिया भर के अजनबियों से मुफ़्त रैंडम वीडियो और टेक्स्ट चैट करें। रजिस्ट्रेशन की ज़रूरत नहीं। देश और रुचि फ़िल्टर उपलब्ध हैं। केवल 18 वर्ष से अधिक के लिए।', 'रैंडम चैट और अजनबियों से बात करने की गाइड', 'बिना रजिस्ट्रेशन मुफ़्त रैंडम चैट'],
    id: ['Video Chat Acak Gratis dan Anonim dengan Orang Asing | Randly', 'Ngobrol dengan orang asing di seluruh dunia lewat video dan teks acak gratis tanpa daftar. Jelajahi filter negara dan minat di Randly. Khusus dewasa 18 tahun ke atas.', 'Panduan Chat Acak dan Mengobrol dengan Orang Asing', 'Chat Acak Gratis Tanpa Daftar'],
    zh: ['免费匿名随机视频聊天，与陌生人交谈 | Randly', '在 Randly 与世界各地的陌生人免费随机视频和文字聊天，无需注册。探索国家和兴趣筛选功能，结识新朋友。仅限年满18周岁的成年人使用。', '随机聊天与陌生人交谈指南', '无需注册的免费随机聊天']
};
// Update this date only when the homepage editorial content actually changes.
const homeModified = '2026-11-22';
const homeDescriptions = require('./home-copy.json');
const guideIntro = {
    ar: ['أدلة الدردشة العشوائية على Randly.live', 'Randly.live موقع للدردشة العشوائية بالفيديو والنص للبالغين من عمر 18 عامًا، دون إنشاء حساب. تعرّف على طريقة البدء، وقارن خيارات الدردشة، واقرأ خطوات حماية خصوصيتك عند التحدث مع أشخاص من حول العالم.'],
    en: ['Explore random chat on Randly.live', 'Randly.live offers free random video and text chat for adults 18+, with no sign-up. These guides explain how to start, compare chat options and protect your privacy while talking to people around the world.'],
    es: ['Guías de chat aleatorio en Randly.live', 'Randly.live ofrece videochat aleatorio y chat de texto gratis para mayores de 18 años, sin registro. Aprende a empezar, compara opciones y descubre cómo proteger tu privacidad al hablar con personas de todo el mundo.'],
    fr: ['Les guides du chat aléatoire sur Randly.live', 'Randly.live propose un chat vidéo aléatoire et un chat texte gratuits, sans inscription, pour les adultes de 18 ans et plus. Ces guides expliquent comment commencer, comparer les options et protéger sa vie privée en parlant à des personnes du monde entier.'],
    de: ['Ratgeber für Zufallschats auf Randly.live', 'Randly.live bietet Erwachsenen ab 18 Jahren kostenlosen zufälligen Video- und Textchat ohne Anmeldung. Diese Ratgeber erklären den Einstieg, vergleichen Chatmöglichkeiten und zeigen, wie du beim Gespräch mit Menschen aus aller Welt deine Privatsphäre schützt.'],
    it: ['Guide alla chat casuale su Randly.live', 'Randly.live offre videochat casuale e chat di testo gratuite, senza registrazione, per maggiorenni. Scopri come iniziare, confronta le opzioni e leggi come proteggere la tua privacy mentre parli con persone di tutto il mondo.'],
    pt: ['Guias de chat aleatório no Randly.live', 'O Randly.live oferece chat de vídeo aleatório e conversa por texto grátis, sem cadastro, para maiores de 18 anos. Veja como começar, compare as opções e aprenda a proteger sua privacidade ao conversar com pessoas do mundo todo.'],
    tr: ['Randly.live rastgele sohbet rehberleri', 'Randly.live, 18 yaş ve üzerindeki yetişkinler için üyelik gerektirmeyen ücretsiz rastgele görüntülü ve yazılı sohbet sunar. Nasıl başlayacağınızı öğrenin, sohbet seçeneklerini karşılaştırın ve dünyanın farklı yerlerinden insanlarla konuşurken gizliliğinizi koruyun.'],
    ru: ['Руководства по случайному чату на Randly.live', 'Randly.live предлагает бесплатный случайный видео- и текстовый чат без регистрации для взрослых от 18 лет. Узнайте, как начать общение, сравнить варианты чата и защитить свою приватность в разговорах с людьми из разных стран.'],
    hi: ['Randly.live पर रैंडम चैट की गाइड', 'Randly.live पर 18 वर्ष या उससे अधिक उम्र के वयस्क बिना रजिस्ट्रेशन के मुफ़्त रैंडम वीडियो और टेक्स्ट चैट कर सकते हैं। इन गाइड में शुरुआत करने, चैट के विकल्प समझने और दुनिया भर के लोगों से बात करते समय अपनी निजता सुरक्षित रखने के तरीके जानें।'],
    id: ['Panduan chat acak di Randly.live', 'Randly.live menyediakan video chat acak dan obrolan teks gratis tanpa pendaftaran untuk orang dewasa berusia 18 tahun ke atas. Pelajari cara memulai, bandingkan pilihan chat, dan lindungi privasi saat berbicara dengan orang dari berbagai negara.'],
    zh: ['Randly.live 随机聊天指南', 'Randly.live 为年满18周岁的成年人提供免费随机视频聊天和文字聊天，无需注册。这些指南介绍如何开始聊天、比较不同选择，以及在与世界各地的人交谈时保护个人隐私。']
};
for (const lang of langs) copy[lang][0] = 'Randly — ' + copy[lang][0].replace(/\s*[|\-]\s*Randly$/, '');
const escape = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const decode = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const url = file => base + (file === 'index.html' ? '/' : '/' + file);
const files = fs.readdirSync(root).filter(f => f.endsWith('.html') && !['ar.html', 'adsterra-frame.html'].includes(f) && !f.startsWith('google'));
const pages = files.map(file => {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    const lang = html.match(/<html[^>]*\blang="([^"]+)"/i)?.[1];
    if (!langs.includes(lang)) throw new Error('Missing language: ' + file);
    const home = file === 'index.html' || langs.includes(file.slice(0, -5));
    const family = home ? 'home' : file.replace(/-(ar|en|es|fr|de|it|pt|tr|ru|hi|id|zh)\.html$/, '.html');
    return { file, html, lang, home, family };
});
for (const p of pages) {
    const { file, lang, home, family } = p;
    let html = p.html;
    let title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
    let desc = decode(html.match(/<meta\b[^>]*name="description"[^>]*content="([^"]*)"[^>]*>/i)?.[1] || '');
    if (home) { title = copy[lang][0]; desc = copy[lang][1]; }
    else if (family === 'blog.html') { title = copy[lang][2] + ' | Randly'; desc = copy[lang][2] + '. ' + copy[lang][3] + ' | Randly.'; }
    else if (!title.includes('Randly')) title += ' | Randly';
    if (!desc) desc = title;
    html = html.replace(/<title([^>]*)>[\s\S]*?<\/title>/i, `<title$1>${escape(title)}</title>`);
    if (home) {
        html = html.replace(/<h1([^>]*)>[\s\S]*?<\/h1>/i, `<h1$1>${escape(title.replace(/\s*[|\-]\s*Randly$/, ''))}</h1>`);
        for (const [key, value] of Object.entries(homeDescriptions[lang])) {
            const re = new RegExp('(<p\\b[^>]*data-i18n="' + key + '"[^>]*>)[\\s\\S]*?(</p>)', 'i');
            html = html.replace(re, (_, open, close) => open + escape(value) + close);
        }
        html = html.replace(/(<h2\b[^>]*data-i18n="feat1Title"[^>]*>)[\s\S]*?(<\/h2>)/i, `$1${escape(copy[lang][3])}$2`);
        html = html.replace(/\s*<!-- home-guides:start -->[\s\S]*?<!-- home-guides:end -->\s*/g, '\n');
        const slugs = ['free-video-chat', 'omegle-alternative', 'randly-vs-ome-tv', 'is-random-video-chat-safe', 'chat-with-people-from-around-the-world'];
        const links = slugs.map(slug => {
            const guide = pages.find(q => q.file === `post-${slug}-${lang}.html`);
            if (!guide) throw new Error(`Missing homepage guide: ${slug}/${lang}`);
            const heading = decode(guide.html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)[1].replace(/<[^>]*>/g, ''));
            return `<li><a href="/post-${slug}-${lang}.html">${escape(heading)}</a></li>`;
        }).join('\n');
        const guides = `<!-- home-guides:start -->\n<section class="home-guides" aria-labelledby="homeGuidesHeading"><h2 id="homeGuidesHeading">${escape(guideIntro[lang][0])}</h2><p>${escape(guideIntro[lang][1])}</p><ul>${links}</ul></section>\n<!-- home-guides:end -->\n`;
        html = html.replace('<section class="faq-section">', guides + '<section class="faq-section">');
    } else if (family === 'blog.html') html = html.replace(/<h1([^>]*)>[\s\S]*?<\/h1>/i, `<h1$1>${escape(copy[lang][2])}</h1>`);
    // Replace managed tags as one block so there is exactly one source of truth.
    html = html.replace(/<meta\b[^>]*(?:name="(?:description|robots|twitter:[^"]+)"|property="og:[^"]+")[^>]*>\s*/gi, '');
    html = html.replace(/<link\b(?=[^>]*rel="(?:canonical|alternate)")[^>]*>\s*/gi, '');
    const siblings = pages.filter(q => q.family === family);
    const fallback = siblings.find(q => q.lang === 'en') || siblings[0];
    const image = base + '/og-image.jpg';
    const tags = [
        `<meta name="description" content="${escape(desc)}">`,
        '<meta name="robots" content="index, follow, max-image-preview:large">',
        `<link rel="canonical" href="${url(file)}">`,
        ...siblings.map(q => `<link rel="alternate" hreflang="${q.lang}" href="${url(q.file)}">`),
        `<link rel="alternate" hreflang="x-default" href="${url(fallback.file)}">`,
        `<meta property="og:type" content="${file.startsWith('post-') ? 'article' : 'website'}">`,
        '<meta property="og:site_name" content="Randly">',
        `<meta property="og:title" content="${escape(title)}">`, `<meta property="og:description" content="${escape(desc)}">`,
        `<meta property="og:url" content="${url(file)}">`, `<meta property="og:image" content="${image}">`,
        `<meta property="og:image:alt" content="${escape(title)}">`,
        '<meta name="twitter:card" content="summary_large_image">', `<meta name="twitter:title" content="${escape(title)}">`,
        `<meta name="twitter:description" content="${escape(desc)}">`, `<meta name="twitter:image" content="${image}">`,
        `<meta name="twitter:image:alt" content="${escape(title)}">`
    ];
    const locales = { ar: 'ar_AR', en: 'en_US', es: 'es_ES', fr: 'fr_FR', de: 'de_DE', it: 'it_IT', pt: 'pt_BR', tr: 'tr_TR', ru: 'ru_RU', hi: 'hi_IN', id: 'id_ID', zh: 'zh_CN' };
    tags.push(`<meta property="og:locale" content="${locales[lang]}">`, ...siblings.filter(q => q.lang !== lang).map(q => `<meta property="og:locale:alternate" content="${locales[q.lang]}">`));
    html = html.replace(/<script\b[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>\s*/gi, block => {
        const data = JSON.parse(block.replace(/^[\s\S]*?>/, '').replace(/<\/script>[\s\S]*$/, ''));
        if (data['@graph'] || ['WebApplication', 'WebSite', 'WebPage'].includes(data['@type'])) return '';
        if (data['@type'] === 'Article' || data['@type'] === 'BlogPosting') { data.mainEntityOfPage = url(file); data.headline = title; }
        return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>\n`;
    });
    const appId = base + '/#app';
    const graph = {
        '@context': 'https://schema.org', '@graph': [
            { '@type': 'WebSite', '@id': base + '/#website', name: 'Randly', alternateName: 'randly.live', url: base + '/', inLanguage: langs },
            { '@type': 'WebApplication', '@id': appId, name: 'Randly', url: base + '/', applicationCategory: 'SocialNetworkingApplication', operatingSystem: 'Web', browserRequirements: 'Requires JavaScript and WebRTC for video chat', isAccessibleForFree: true, inLanguage: langs, image, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } },
            { '@type': 'WebPage', '@id': url(file) + '#webpage', url: url(file), name: title, description: desc, inLanguage: lang, isPartOf: { '@id': base + '/#website' }, about: { '@id': appId }, ...(home ? { mainEntity: { '@id': appId }, dateModified: homeModified } : {}) }
        ]
    };
    tags.push(`<script type="application/ld+json">${JSON.stringify(graph).replace(/</g, '\\u003c')}</script>`);
    html = html.replace(/\s*<!-- managed-seo -->\s*/g, '\n').replace('</head>', '\n<!-- managed-seo -->\n' + tags.join('\n') + '\n</head>');
    fs.writeFileSync(path.join(root, file), html);
}
const sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' + pages.map(p => {
    const siblings = pages.filter(q => q.family === p.family), fallback = siblings.find(q => q.lang === 'en') || siblings[0];
    const modified = p.home ? homeModified : p.html.match(/<meta property="article:modified_time" content="(\d{4}-\d{2}-\d{2})"/)?.[1];
    return `  <url>\n    <loc>${url(p.file)}</loc>\n` + (modified ? `    <lastmod>${modified}</lastmod>\n` : '') + [...siblings.map(q => `    <xhtml:link rel="alternate" hreflang="${q.lang}" href="${url(q.file)}"/>`), `    <xhtml:link rel="alternate" hreflang="x-default" href="${url(fallback.file)}"/>`].join('\n') + '\n  </url>';
}).join('\n') + '\n</urlset>\n';
fs.writeFileSync(path.join(root, 'sitemap.xml'), sitemap);
fs.writeFileSync(path.join(root, 'robots.txt'), 'User-agent: *\nAllow: /\nDisallow: /socket.io/\nDisallow: /api/\nDisallow: /healthz\n\nSitemap: https://randly.live/sitemap.xml\n');
let script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
for (const lang of langs) {
    const re = new RegExp(`(${lang}: \\{\\s*siteTitle: )"[^"\\n]*"`);
    script = script.replace(re, (_, prefix) => prefix + JSON.stringify(copy[lang][0]));
}
fs.writeFileSync(path.join(root, 'script.js'), script);
for (const file of ['script.js', 'i18n-extra.js']) {
    const labels = fs.readFileSync(path.join(root, file), 'utf8');
    const declaration = file === 'script.js' ? 'const translations = {' : 'const NEW_LANGS = {';
    const at = labels.indexOf(declaration);
    if (at < 0) throw new Error('Missing translation dictionary: ' + file);
    let dictionary = labels.slice(at);
    for (const lang of langs) {
        const block = new RegExp('(^[ \\t]*' + lang + ':\\s*\\{)([\\s\\S]*?)(^[ \\t]*\\},?)', 'm');
        dictionary = dictionary.replace(block, (_, open, body, close) => {
            for (const [key, value] of Object.entries(homeDescriptions[lang])) {
                const field = new RegExp('(\\b' + key + ':\\s*)"[^"\\r\\n]*"');
                if (!field.test(body)) throw new Error('Missing home label: ' + file + '/' + lang + '/' + key);
                body = body.replace(field, (_, prefix) => prefix + JSON.stringify(value));
            }
            return open + body + close;
        });
    }
    fs.writeFileSync(path.join(root, file), labels.slice(0, at) + dictionary);
}
console.log(`Updated ${pages.length} canonical pages in ${langs.length} languages.`);
