'use strict';
// Public placement codes only. The scripts execute in a sandboxed ad document.
(() => {
    const placements = {
        native: { src: 'https://bicea.org/21/41a844b9e767c8981fc99be90925b350', container: 'container-41a844b9e767c8981fc99be90925b350' },
        social: { src: 'https://bicea.org/14/4cd723902c51674b52b1ac4b207c76d4' }
    };
    const params = new URLSearchParams(location.search);
    document.documentElement.dataset.theme = params.get('theme') === 'light' ? 'light' : 'dark';
    const language = params.get('lang');
    if (/^(ar|en|es|fr|de|it|pt|tr|ru|hi|id|zh)$/.test(language || '')) document.documentElement.lang = language;
    const host = document.getElementById('randly-ad-native');
    host.id = placements.native.container;
    let last = '', timer;
    const parentOrigin = location.origin;
    function report() {
        clearTimeout(timer);
        timer = setTimeout(() => {
            const visible = Array.from(document.body.children).filter(el =>
                !['SCRIPT', 'STYLE', 'LINK'].includes(el.tagName) && (el.children.length || el.textContent.trim()) &&
                el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0
            );
            const height = Math.ceil(Math.max(0, ...visible.map(el => el.getBoundingClientRect().bottom + scrollY)));
            const payload = { type: 'randly-ad-layout', height: Math.min(1600, height), filled: visible.length > 0 };
            const signature = JSON.stringify(payload);
            if (signature !== last) { last = signature; parent.postMessage(payload, parentOrigin); }
        }, 80);
    }
    new MutationObserver(report).observe(document.body, { childList: true, subtree: true, attributes: true });
    new ResizeObserver(report).observe(document.body);
    for (const placement of Object.values(placements)) {
        const script = document.createElement('script');
        script.async = true;
        script.dataset.cfasync = 'false';
        script.referrerPolicy = 'strict-origin';
        script.src = placement.src;
        script.addEventListener('load', report);
        script.addEventListener('error', report);
        document.body.appendChild(script);
    }
    report();
    setTimeout(report, 15000);
})();
