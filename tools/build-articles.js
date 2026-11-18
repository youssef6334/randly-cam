'use strict';
// Editorial Markdown is kept outside public; HTML reuses the site's existing shell.
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const publicDir = path.join(root, 'public');
const languages = ['ar', 'en', 'es', 'fr', 'de', 'it', 'pt', 'tr', 'ru', 'hi', 'id', 'zh'];
const slugs = ['is-random-video-chat-safe', 'chat-with-people-from-around-the-world'];
const date = '2026-11-18';
const ui = {
    ar: ['العودة إلى المدونة', 'في هذا الدليل', 'اقرأ أيضًا', 'ابدأ الدردشة', 'إعداد فريق Randly'],
    en: ['Back to the blog', 'In this guide', 'Read also', 'Start chatting', 'By the Randly team'],
    es: ['Volver al blog', 'En esta guía', 'También te puede interesar', 'Empezar a chatear', 'Equipo de Randly'],
    fr: ['Retour au blog', 'Dans ce guide', 'À lire aussi', 'Commencer une discussion', 'Équipe Randly'],
    de: ['Zurück zum Blog', 'In diesem Ratgeber', 'Weitere Ratgeber', 'Chat starten', 'Randly-Redaktion'],
    it: ['Torna al blog', 'In questa guida', 'Leggi anche', 'Inizia a chattare', 'Redazione Randly'],
    pt: ['Voltar ao blog', 'Neste guia', 'Leia também', 'Começar a conversar', 'Equipe Randly'],
    tr: ['Bloga dön', 'Bu rehberde', 'İlgili yazılar', 'Sohbete başla', 'Randly ekibi'],
    ru: ['Вернуться в блог', 'В этом руководстве', 'Читайте также', 'Начать общение', 'Редакция Randly'],
    hi: ['ब्लॉग पर वापस जाएँ', 'इस गाइड में', 'यह भी पढ़ें', 'चैट शुरू करें', 'Randly टीम'],
    id: ['Kembali ke blog', 'Dalam panduan ini', 'Baca juga', 'Mulai mengobrol', 'Tim Randly'],
    zh: ['返回博客', '本篇目录', '相关阅读', '开始聊天', 'Randly 编辑团队']
};
const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function inline(text) {
    return escape(text).replace(/\[([^\]]+)\]\(([^\s)]+)\)/g, (_, label, href) => {
        if (!/^(?:https:\/\/|\/(?!\/)|#|[a-z0-9-]+\.html(?:#.*)?$)/i.test(href)) throw new Error('Unsafe editorial link');
        return `<a href="${href}">${label}</a>`;
    }).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}
function parse(source, lang) {
    const match = source.replace(/\r/g, '').match(/^---\n([\s\S]+?)\n---\n([\s\S]*)$/);
    if (!match) throw new Error('Missing editorial metadata');
    const metadata = Object.fromEntries(match[1].split('\n').map(line => {
        const at = line.indexOf(': ');
        if (at < 1) throw new Error('Invalid metadata');
        return [line.slice(0, at), line.slice(at + 2).trim()];
    }));
    for (const key of ['title', 'description', 'summary']) if (!metadata[key]) throw new Error('Missing ' + key);
    let html = '', paragraph = [], list = null, counter = 0;
    const toc = [];
    const flushParagraph = () => { if (paragraph.length) html += `<p>${inline(paragraph.join(' '))}</p>\n`; paragraph = []; };
    const closeList = () => { if (list) html += `</${list}>\n`; list = null; };
    const replaceLinks = text => text.replace(/@home/g, lang === 'ar' ? '/' : `/${lang}.html`)
        .replace(/@safety/g, `/post-is-random-video-chat-safe-${lang}.html`)
        .replace(/@world/g, `/post-chat-with-people-from-around-the-world-${lang}.html`)
        .replace(/@free/g, `/post-free-video-chat-${lang}.html`)
        .replace(/@alternatives/g, `/post-omegle-alternative-${lang}.html`)
        .replace(/@comparison/g, `/post-randly-vs-ome-tv-${lang}.html`)
        .replace(/@rules/g, lang === 'ar' ? '/rules.html' : '/rules-en.html')
        .replace(/@privacy/g, lang === 'ar' ? '/privacy.html' : '/privacy-en.html');
    for (const line of replaceLinks(match[2]).split('\n')) {
        if (!line.trim()) { flushParagraph(); closeList(); continue; }
        const heading = line.match(/^(#{2,3}) (.+)$/);
        if (heading) {
            flushParagraph(); closeList();
            const id = `section-${++counter}`;
            html += `<h${heading[1].length} id="${id}">${inline(heading[2])}</h${heading[1].length}>\n`;
            if (heading[1].length === 2) toc.push({ id, text: heading[2] });
            continue;
        }
        const item = line.match(/^(?:([-*])|\d+\.) (.+)$/);
        if (item) {
            flushParagraph(); const type = item[1] ? 'ul' : 'ol';
            if (list !== type) { closeList(); list = type; html += `<${type}>\n`; }
            html += `<li>${inline(item[2])}</li>\n`; continue;
        }
        closeList(); paragraph.push(line.trim());
    }
    flushParagraph(); closeList();
    return { ...metadata, html, toc };
}
const articles = [];
for (const lang of languages) for (const slug of slugs) {
    const source = fs.readFileSync(path.join(root, 'content', 'articles', slug, `${lang}.md`), 'utf8');
    articles.push({ lang, slug, ...parse(source, lang) });
}
for (const article of articles) {
    const { lang, slug, title, description, html: body, toc } = article;
    const file = `post-${slug}-${lang}.html`;
    const template = fs.readFileSync(path.join(publicDir, `post-randly-vs-ome-tv-${lang}.html`), 'utf8');
    const marker = template.indexOf('<div class="blog-article">');
    if (marker < 0) throw new Error('Article shell missing: ' + lang);
    let shell = template.slice(0, marker);
    shell = shell.replace(/<title[^>]*>[\s\S]*?<\/title>/, `<title>${escape(title)}</title>`)
        .replace(/(<meta name="description" content=")[^"]*(")/, `$1${escape(description)}$2`)
        .replace(/(<meta property="article:(?:published|modified)_time" content=")[^"]*(")/g, `$1${date}$2`)
        .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\s*/g, '');
    shell = shell.replace(/(<option value=")[^"]+("(?: selected)?>(?:[\s\S]*?)<\/option>)/g, (all, before, after) => {
        const optionLang = all.match(/value="[^"]+-(ar|en|es|fr|de|it|pt|tr|ru|hi|id|zh)\.html"/)?.[1];
        return optionLang ? `${before}post-${slug}-${optionLang}.html${after}` : all;
    });
    const schema = { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: title, description,
        inLanguage: lang, datePublished: date, dateModified: date, mainEntityOfPage: `https://randly.live/${file}`,
        author: { '@type': 'Organization', name: 'Randly', url: 'https://randly.live/' },
        publisher: { '@type': 'Organization', name: 'Randly', url: 'https://randly.live/',
            logo: { '@type': 'ImageObject', url: 'https://randly.live/randly-logo-512.png' } }, image: 'https://randly.live/og-image.jpg' };
    shell = shell.replace('</head>', `<link rel="stylesheet" href="/article.css?v=20261118">\n<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>\n</head>`);
    const footer = template.slice(template.indexOf('<footer class="app-footer">'));
    const other = articles.find(a => a.lang === lang && a.slug !== slug);
    const locale = lang === 'pt' ? 'pt-BR' : lang;
    const displayDate = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Africa/Cairo' }).format(new Date(`${date}T12:00:00Z`));
    const home = lang === 'ar' ? '/' : `/${lang}.html`;
    const firstSection = body.indexOf('<h2');
    const introduction = firstSection >= 0 ? body.slice(0, firstSection) : '';
    const sections = firstSection >= 0 ? body.slice(firstSection) : body;
    const content = `<main class="blog-article editorial-guide" id="article-content">
<a class="blog-back" href="/blog-${lang}.html">${ui[lang][0]}</a>
<h1>${escape(title)}</h1>
<p class="updated"><span>${ui[lang][4]}</span> · <time datetime="${date}">${escape(displayDate)}</time> · <bdi>18+</bdi></p>
${introduction}
<details class="article-toc"><summary>${ui[lang][1]}</summary><nav aria-label="${ui[lang][1]}"><ol>${toc.map(h => `<li><a href="#${h.id}">${escape(h.text)}</a></li>`).join('')}</ol></nav></details>
${sections}
<p><a class="blog-cta" href="${home}">${ui[lang][3]}</a></p>
<aside class="article-related"><h2>${ui[lang][2]}</h2><a href="/post-${other.slug}-${lang}.html">${escape(other.title)}</a></aside>
</main>\n`;
    fs.writeFileSync(path.join(publicDir, file), shell + content + footer);
}
for (const lang of languages) {
    const file = path.join(publicDir, `blog-${lang}.html`);
    let html = fs.readFileSync(file, 'utf8').replace(/\n?<!-- localized-guides:start -->[\s\S]*?<!-- localized-guides:end -->\n?/g, '');
    const displayDate = new Intl.DateTimeFormat(lang === 'pt' ? 'pt-BR' : lang, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Africa/Cairo' }).format(new Date(`${date}T12:00:00Z`));
    const cards = articles.filter(a => a.lang === lang).map(a => `<article class="blog-card"><h2><a href="post-${a.slug}-${lang}.html">${escape(a.title)}</a></h2><p>${escape(a.summary)}</p><time datetime="${date}">${escape(displayDate)}</time></article>`).join('\n');
    html = html.replace('<div class="blog-grid">', `<div class="blog-grid">\n<!-- localized-guides:start -->\n${cards}\n<!-- localized-guides:end -->\n`);
    fs.writeFileSync(file, html);
    for (const oldSlug of ['free-video-chat', 'omegle-alternative', 'randly-vs-ome-tv']) {
        const oldFile = path.join(publicDir, `post-${oldSlug}-${lang}.html`);
        let oldHtml = fs.readFileSync(oldFile, 'utf8').replace(/<ul><!-- new-guides-links:start -->[\s\S]*?<!-- new-guides-links:end --><\/ul>/g, '').replace(/<ul><\/ul>/g, '');
        const links = `<ul><!-- new-guides-links:start -->${articles.filter(a => a.lang === lang).map(a => `<li><a href="/post-${a.slug}-${lang}.html">${escape(a.title)}</a></li>`).join('')}<!-- new-guides-links:end --></ul>`;
        oldHtml = oldHtml.replace('</aside>', links + '</aside>');
        if (lang !== 'ar') oldHtml = oldHtml.replace(/href="https:\/\/randly\.live\/"/g, `href="/${lang}.html"`);
        fs.writeFileSync(oldFile, oldHtml);
    }
}
console.log(`Built ${articles.length} editorial guides and updated ${languages.length} blog indexes.`);
