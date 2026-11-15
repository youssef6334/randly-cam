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
    // Official placements execute in the page; they are not iframe embeds.
    // Advertising scripts have page-level privileges. Keep keys and private state on the server.
    const placements = {
        native: 'https://bicea.org/21/41a844b9e767c8981fc99be90925b350',
        social: 'https://bicea.org/14/4cd723902c51674b52b1ac4b207c76d4'
    };
    const boot = () => {
        const card = document.getElementById('adContainer');
        const content = document.getElementById('adContent');
        const app = card?.closest('.main-container');
        const toggle = card?.querySelector('[data-ad-toggle]');
        const slot = card?.querySelector('[data-ad-slot]');
        if (!card || !content || !app || !toggle || !slot) return;
        const blocked = new Set();
        document.addEventListener('securitypolicyviolation', event => {
            // Console-only diagnostics: never log visitor identifiers or URL queries.
            let origin = ['inline', 'eval'].includes(event.blockedURI) ? event.blockedURI : '';
            try { if (event.blockedURI.startsWith('https://')) origin = new URL(event.blockedURI).origin; } catch (_) {}
            if (!origin || event.disposition !== 'enforce') return;
            const key = event.effectiveDirective + ' ' + origin;
            if (blocked.size < 10 && !blocked.has(key)) { blocked.add(key); console.warn('[Randly CSP] blocked ' + key); }
        });
        let started = false, filled = false, collapsed = false, noFillTimer;
        const language = () => document.documentElement.lang.split('-')[0] || 'en';
        function labels() {
            const text = copy[language()] || copy.en;
            card.querySelector('[data-ad-label]').textContent = text[0];
            card.querySelector('[data-ad-loading]').textContent = text[1];
            card.setAttribute('aria-label', text[0]);
            toggle.setAttribute('aria-label', text[collapsed ? 3 : 2]);
        }
        function measure() {
            const space = card.hidden ? '0px' : Math.ceil(card.getBoundingClientRect().height + 12) + 'px';
            if (app.style.getPropertyValue('--randly-ad-space') !== space) app.style.setProperty('--randly-ad-space', space);
        }
        function insertScript(kind, parent) {
            const id = 'randly-adsterra-' + kind;
            if (document.getElementById(id)) return;
            const script = document.createElement('script');
            script.id = id;
            script.async = true;
            script.dataset.cfasync = 'false';
            script.dataset.loadState = 'loading';
            script.referrerPolicy = 'strict-origin-when-cross-origin';
            script.src = placements[kind];
            script.addEventListener('load', () => { script.dataset.loadState = 'loaded'; });
            script.addEventListener('error', () => { script.dataset.loadState = 'error'; });
            parent.appendChild(script);
        }
        function detectFill() {
            if (app.hidden || collapsed) return;
            const wasHidden = card.hidden;
            if (wasHidden) card.hidden = false;
            const visible = Array.from(slot.children).some(el =>
                !['SCRIPT','STYLE','LINK'].includes(el.tagName) &&
                (el.children.length || el.textContent.trim()) && el.getBoundingClientRect().height > 0
            );
            if (visible) {
                filled = true; clearTimeout(noFillTimer);
                card.hidden = false; card.dataset.filled = 'true';
                card.querySelector('[data-ad-loading]').hidden = true;
            }
            else if (wasHidden) card.hidden = true;
            measure();
        }
        function loadNative() {
            if (started || app.hidden || collapsed || document.visibilityState === 'hidden') return;
            started = true;
            const host = document.createElement('div');
            host.id = 'container-41a844b9e767c8981fc99be90925b350';
            slot.appendChild(host);
            new MutationObserver(detectFill).observe(slot, {childList:true,subtree:true});
            new ResizeObserver(detectFill).observe(host);
            insertScript('native', content);
            noFillTimer = setTimeout(() => { if (!filled) { card.hidden = true; measure(); } }, 20000);
        }
        function loadSocial() {
            if (document.visibilityState !== 'hidden') insertScript('social', document.body);
        }
        function setCollapsed(value) {
            collapsed = value;
            content.hidden = collapsed;
            toggle.setAttribute('aria-expanded', String(!collapsed));
            card.dataset.collapsed = String(collapsed);
            labels(); measure(); loadNative();
            if (started && !collapsed) detectFill();
        }
        toggle.addEventListener('click', () => setCollapsed(!collapsed));
        window.RandlyAds = Object.freeze({toggle: () => setCollapsed(!collapsed)});
        new ResizeObserver(measure).observe(card);
        new MutationObserver(() => { measure(); loadNative(); if (started) detectFill(); }).observe(app, {attributes:true,attributeFilter:['hidden','style']});
        new MutationObserver(labels).observe(document.documentElement, {attributes:true,attributeFilter:['lang']});
        document.addEventListener('visibilitychange', () => { loadSocial(); loadNative(); });
        // Start on DOM readiness; images and other ad networks must not delay Social Bar.
        loadSocial();
        setCollapsed(false);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
})();
