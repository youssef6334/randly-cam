'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.join(__dirname, '..', 'public');
const handlers = new Map();
for (const file of fs.readdirSync(root).filter(f => f.endsWith('.html'))) {
    let html = fs.readFileSync(path.join(root, file), 'utf8');
    // Legacy direct loaders are replaced by the sandboxed adsterra-frame integration.
    html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, block => block.includes('effectivecpmnetwork.com') ? '' : block);
    // A normal stylesheet does not need an inline onload script.
    html = html.replace(/<link\b[^>]*onload="this.onload=null;this.rel='stylesheet'"[^>]*>/g, tag => tag.replace('rel="preload"', 'rel="stylesheet"').replace(/\s+as="style"/, '').replace(/\s+onload="[^"]*"/, ''));
    html = html.replace(/\s(on\w+)\s*=\s*(["'])(.*?)\2/gs, (_, attr, quote, body) => {
        const id = crypto.createHash('sha256').update(attr + ':' + body).digest('hex').slice(0, 12);
        handlers.set(id, { event: attr.slice(2), body });
        return ` data-handler-${attr.slice(2)}="${id}"`;
    });
    // Keep already migrated handlers when this script is run again.
    if (html.includes('data-handler-') && !html.includes('/page-actions.js')) html = html.replace('</body>', '<script src="/page-actions.js?v=20261114" defer></script>\n</body>');
    fs.writeFileSync(path.join(root, file), html);
}
if (handlers.size) {
    const destination = path.join(root, 'page-actions.js');
    const existing = fs.existsSync(destination) ? fs.readFileSync(destination, 'utf8') : "'use strict';\n// Generated from audited static HTML handlers; never evaluates user input.\n";
    const js = existing + [...handlers].filter(([id, h]) => !existing.includes(`data-handler-${h.event}="${id}"`)).map(([id, h]) => `document.querySelectorAll('[data-handler-${h.event}="${id}"]').forEach(function (element) {\n    element.addEventListener(${JSON.stringify(h.event)}, function (event) { ${h.body}; });\n});`).join('\n') + '\n';
    fs.writeFileSync(path.join(root, 'page-actions.js'), js);
}
console.log(`Migrated ${handlers.size} distinct inline handlers; removed legacy direct ad loaders.`);
