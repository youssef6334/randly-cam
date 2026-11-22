'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.join(__dirname, '..', 'public');
for (const file of fs.readdirSync(root).filter(f => f.endsWith('.html'))) {
    const target = path.join(root, file);
    const original = fs.readFileSync(target, 'utf8');
    let html = original;
    if (/<script src="\/?script\.js(?:\?[^"]*)?"/.test(html) && !html.includes('src="/rtc-config.js')) {
        html = html.replace(/<script src="\/?script\.js(?:\?[^"]*)?"/, '<script src="/rtc-config.js"></script>\n<script src="script.js"');
    }
    if (/<script src="\/?script\.js(?:\?[^"]*)?"/.test(html) && !html.includes('src="/session-state.js')) {
        html = html.replace(/<script src="\/?script\.js(?:\?[^"]*)?"/, '<script src="/session-state.js"></script>\n<script src="script.js"');
    }
    html = html.replace(/\b(src|href)="([^"?]+\.(?:js|css))(?:\?([^"]*))?"/g, (all, attr, url, query) => {
        if (/^(?:https?:)?\/\//.test(url)) return all;
        const local = path.resolve(root, url.replace(/^\//, ''));
        if (!local.startsWith(root + path.sep) || !fs.existsSync(local)) return all;
        const hash = crypto.createHash('sha256').update(fs.readFileSync(local)).digest('hex').slice(0, 12);
        const params = new URLSearchParams((query || '').replace(/&amp;/g, '&'));
        params.set('v', hash);
        return `${attr}="${url}?${params.toString().replace(/&/g, '&amp;')}"`;
    });
    if (html !== original) fs.writeFileSync(target, html);
}
console.log('Updated local asset revisions and loaded RTC configuration before the chat client.');
