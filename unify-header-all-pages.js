// unify-header-all-pages.js
// يوحّد الهيدر في كل ملفات about-*.html و blog-*.html بنفس تصميم الموقع الأساسي
// الاستخدام: node unify-header-all-pages.js
//
// ملاحظة: السكريبت ده بيدور على نمط معروف (الهيدر القديم القابل للتعرف) ويستبدله.
// لو ملف معين شكله مختلف جداً عن النمط، هيتخطاه ويطلعلك تحذير عشان تظبطه يدوي.

const fs = require('fs');
const path = require('path');

const dir = __dirname;

const LANGS = ['ar', 'en', 'es', 'fr', 'de', 'it', 'pt', 'tr', 'ru', 'hi', 'id', 'zh'];

const NAMES = {
    ar: 'العربية', en: 'English', es: 'Español', fr: 'Français',
    de: 'Deutsch', it: 'Italiano', pt: 'Português', tr: 'Türkçe',
    ru: 'Русский', hi: 'हिन्दी', id: 'Bahasa Indonesia', zh: '中文'
};

const NAV_TEXT = {
    ar: { home: 'الرئيسية', about: 'عن الموقع', blog: 'المدونة' },
    en: { home: 'Home', about: 'About Randly', blog: 'Blog' },
    es: { home: 'Inicio', about: 'Sobre Randly', blog: 'Blog' },
    fr: { home: 'Accueil', about: 'À propos', blog: 'Blog' },
    de: { home: 'Startseite', about: 'Über Randly', blog: 'Blog' },
    it: { home: 'Home', about: 'Chi siamo', blog: 'Blog' },
    pt: { home: 'Início', about: 'Sobre', blog: 'Blog' },
    tr: { home: 'Ana Sayfa', about: 'Hakkında', blog: 'Blog' },
    ru: { home: 'Главная', about: 'О сайте', blog: 'Блог' },
    hi: { home: 'होम', about: 'हमारे बारे में', blog: 'ब्लॉग' },
    id: { home: 'Beranda', about: 'Tentang', blog: 'Blog' },
    zh: { home: '首页', about: '关于我们', blog: '博客' }
};

function homeLink(lang) { return lang === 'ar' ? 'index.html' : `${lang}.html`; }
function aboutLink(lang) { return lang === 'ar' ? 'about.html' : `about-${lang}.html`; }
function blogLink(lang) { return `blog-${lang}.html`; }

function buildHeader(lang, activePage) {
    const t = NAV_TEXT[lang] || NAV_TEXT.en;
    const home = homeLink(lang);
    const about = aboutLink(lang);
    const blog = blogLink(lang);

    const activeStyle = 'color: var(--accent-purple); text-decoration: none; font-size: .9rem; font-weight: bold;';
    const normalStyle = 'color: var(--text-main); text-decoration: none; opacity: .85; font-size: .9rem;';

    const homeStyle = activePage === 'home' ? activeStyle : normalStyle;
    const aboutStyle = activePage === 'about' ? activeStyle : normalStyle;
    const blogStyle = activePage === 'blog' ? activeStyle : normalStyle;

    const options = LANGS.map(code => {
        const value = activePage === 'about' ? aboutLink(code) : blogLink(code);
        const selected = code === lang ? ' selected' : '';
        return `            <option value="${value}"${selected}>${NAMES[code]}</option>`;
    }).join('\n');

    return `<header class="app-header" style="justify-content: space-between;">
    <div class="header-left">
        <a href="${home}" class="logo" style="text-decoration: none;">Randly</a>
    </div>
    <div class="header-right" style="display: flex; align-items: center; gap: 16px;">
        <nav style="display: flex; gap: 14px;">
            <a href="${home}" style="${homeStyle}">${t.home}</a>
            <a href="${about}" style="${aboutStyle}">${t.about}</a>
            <a href="${blog}" style="${blogStyle}">${t.blog}</a>
        </nav>
        <select class="site-lang-select" onchange="window.location.href=this.value">
${options}
        </select>
    </div>
</header>`;
}

function extractLangFromAboutFile(file) {
    if (file === 'about.html') return 'ar';
    const m = file.match(/^about-([a-z]{2})\.html$/i);
    return m ? m[1].toLowerCase() : null;
}

function extractLangFromBlogFile(file) {
    const m = file.match(/^blog-([a-z]{2})\.html$/i);
    return m ? m[1].toLowerCase() : null;
}

const scrollFixSnippet = `<style>
  html, body { overflow: auto !important; height: auto !important; min-height: 100%; }
</style>
</head>`;

function ensureScrollFix(content) {
    if (content.includes('overflow: auto !important')) return content;
    if (!content.includes('</head>')) return content;
    const idx = content.lastIndexOf('</head>');
    return content.slice(0, idx) + scrollFixSnippet + content.slice(idx + '</head>'.length);
}

const files = fs.readdirSync(dir).filter(f => /\.html$/i.test(f));

let fixed = 0, skipped = 0, warnings = [];

files.forEach(file => {
    let lang = null, activePage = null;

    if (file === 'about.html' || /^about-[a-z]{2}\.html$/i.test(file)) {
        lang = extractLangFromAboutFile(file);
        activePage = 'about';
    } else if (/^blog-[a-z]{2}\.html$/i.test(file)) {
        lang = extractLangFromBlogFile(file);
        activePage = 'blog';
    } else {
        return; // مش about ولا blog، نتخطاه
    }

    if (!lang || !NAV_TEXT[lang]) {
        warnings.push(`⚠️  Unknown language for file, skipped: ${file}`);
        skipped++;
        return;
    }

    let content = fs.readFileSync(path.join(dir, file), 'utf8');
    let changed = false;

    // النمط الأول: هيدر about.html القديم (مربع لغة عائم بعد body مباشرة)
    const aboutPattern = /<div style="position: absolute; top: 20px; left: 20px; z-index: 100;">[\s\S]*?<\/select>\s*<\/div>/;
    // النمط التاني: هيدر blog-en.html القديم (<header class="blog-header">...</header>)
    const blogPattern = /<header class="blog-header">[\s\S]*?<\/header>/;

    if (activePage === 'about' && aboutPattern.test(content)) {
        content = content.replace(aboutPattern, buildHeader(lang, 'about'));
        // تصغير الهامش العلوي للـ main بما إن الهيدر بقى عادي مش عائم
        content = content.replace(/margin:\s*80px\s*auto\s*40px/i, 'margin: 40px auto');
        changed = true;
    } else if (activePage === 'blog' && blogPattern.test(content)) {
        content = content.replace(blogPattern, buildHeader(lang, 'blog'));
        changed = true;
    } else if (content.includes('class="app-header"')) {
        console.log(`⏭️  Already unified, skipped: ${file}`);
        skipped++;
        return;
    } else {
        warnings.push(`⚠️  Pattern not found, please check manually: ${file}`);
        skipped++;
        return;
    }

    content = ensureScrollFix(content);
    fs.writeFileSync(path.join(dir, file), content, 'utf8');
    console.log(`✅ Unified header: ${file}`);
    fixed++;
});

console.log(`\nDone. Fixed: ${fixed}, Skipped: ${skipped}, Total HTML files scanned: ${files.length}`);
if (warnings.length) {
    console.log('\n--- Warnings ---');
    warnings.forEach(w => console.log(w));
}
