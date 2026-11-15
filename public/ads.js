'use strict';
(() => {
    const copy = {
        ar: ['إعلان', 'جارٍ تحميل الإعلان', 'طي الإعلان', 'عرض الإعلان'],
        en: ['Advertisement', 'Loading advertisement', 'Collapse advertisement', 'Show advertisement'],
        es: ['Publicidad', 'Cargando publicidad', 'Ocultar publicidad', 'Mostrar publicidad'],
        fr: ['Publicité', 'Chargement de la publicité', 'Réduire la publicité', 'Afficher la publicité'],
        de: ['Werbung', 'Werbung wird geladen', 'Werbung einklappen', 'Werbung anzeigen'],
        it: ['Pubblicità', 'Caricamento pubblicità', 'Riduci pubblicità', 'Mostra pubblicità'],
        pt: ['Publicidade', 'Carregando publicidade', 'Recolher publicidade', 'Mostrar publicidade'],
        tr: ['Reklam', 'Reklam yükleniyor', 'Reklamı daralt', 'Reklamı göster'],
        ru: ['Реклама', 'Загрузка рекламы', 'Свернуть рекламу', 'Показать рекламу'],
        hi: ['विज्ञापन', 'विज्ञापन लोड हो रहा है', 'विज्ञापन छोटा करें', 'विज्ञापन दिखाएँ'],
        id: ['Iklan', 'Memuat iklan', 'Tutup iklan', 'Tampilkan iklan'],
        zh: ['广告', '广告加载中', '收起广告', '显示广告']
    };
    const boot = () => {
        const card = document.getElementById('adContainer');
        const content = document.getElementById('adContent');
        const app = card?.closest('.main-container');
        const toggle = card?.querySelector('[data-ad-toggle]');
        const slot = card?.querySelector('[data-ad-slot]');
        if (!card || !content || !app || !toggle || !slot) return;
        let frame = null, filled = false, collapsed = false, noFillTimer;
        const language = () => document.documentElement.lang.split('-')[0] || 'en';
        function labels() {
            const text = copy[language()] || copy.en;
            card.querySelector('[data-ad-label]').textContent = text[0];
            card.querySelector('[data-ad-loading]').textContent = text[1];
            toggle.setAttribute('aria-label', text[collapsed ? 3 : 2]);
            if (frame) frame.title = text[0];
        }
        function measure() {
            const space = card.hidden ? '0px' : Math.ceil(card.getBoundingClientRect().height + 12) + 'px';
            if (app.style.getPropertyValue('--randly-ad-space') !== space) app.style.setProperty('--randly-ad-space', space);
        }
        function load() {
            if (frame || app.hidden || collapsed || card.hidden || document.visibilityState === 'hidden') return;
            frame = document.createElement('iframe');
            frame.className = 'randly-ad-frame';
            frame.title = (copy[language()] || copy.en)[0];
            frame.setAttribute('sandbox', 'allow-scripts allow-popups allow-popups-to-escape-sandbox');
            frame.setAttribute('allow', "camera 'none'; microphone 'none'; geolocation 'none'; payment 'none'; usb 'none'");
            frame.referrerPolicy = 'strict-origin';
            const theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
            frame.src = '/adsterra-frame.html?theme=' + theme + '&lang=' + encodeURIComponent(language());
            slot.appendChild(frame);
            // No refresh loops or artificial ad interactions. Hide an unfilled slot.
            noFillTimer = setTimeout(() => {
                if (!filled) { card.hidden = true; measure(); }
            }, 20000);
        }
        function setCollapsed(value) {
            collapsed = value;
            content.hidden = collapsed;
            toggle.setAttribute('aria-expanded', String(!collapsed));
            card.dataset.collapsed = String(collapsed);
            labels(); measure(); load();
        }
        toggle.addEventListener('click', () => setCollapsed(!collapsed));
        window.RandlyAds = Object.freeze({ toggle: () => setCollapsed(!collapsed) });
        window.addEventListener('message', event => {
            if (!frame || event.source !== frame.contentWindow || event.origin !== 'null') return;
            const data = event.data;
            if (!data || typeof data !== 'object' || data.type !== 'randly-ad-layout' ||
                typeof data.filled !== 'boolean' || !Number.isFinite(data.height) || data.height < 0 || data.height > 1600) return;
            if (data.filled && data.height > 0) {
                filled = true; clearTimeout(noFillTimer); card.hidden = false;
                card.dataset.filled = 'true';
                frame.style.height = Math.max(60, Math.min(1600, Math.ceil(data.height))) + 'px';
                card.querySelector('[data-ad-loading]').hidden = true;
                measure();
            }
        });
        new ResizeObserver(measure).observe(card);
        new MutationObserver(() => { measure(); load(); }).observe(app, { attributes: true, attributeFilter: ['hidden', 'style'] });
        new MutationObserver(labels).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
        document.addEventListener('visibilitychange', load);
        setCollapsed(false);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
})();
