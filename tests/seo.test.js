'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', 'public');
const base = 'https://randly.live';
const files = fs.readdirSync(root).filter(f => f.endsWith('.html') && !['ar.html', 'adsterra-frame.html'].includes(f) && !f.startsWith('google'));
test('all canonical pages have reciprocal language clusters, one canonical and valid metadata', () => {
    assert.equal(files.length, 102);
    const pages = files.map(file => {
        const html = fs.readFileSync(path.join(root, file), 'utf8');
        const canonical = [...html.matchAll(/<link rel="canonical" href="([^"]+)"/g)];
        assert.equal(canonical.length, 1, file);
        const url = base + (file === 'index.html' ? '/' : '/' + file); assert.equal(canonical[0][1], url);
        for (const re of [/<title\b/g, /<meta name="description"/g, /<meta property="og:url"/g, /<meta name="twitter:card"/g, /<h1\b/g]) assert.equal([...html.matchAll(re)].length, 1, file + ': ' + re);
        assert.match(html, /<h2\b/, file);
        assert.doesNotMatch(html, /\son(?:click|change|load|keydown)\s*=/i, file);
        assert.doesNotMatch(html, /effectivecpmnetwork\.com/, file);
        const schemas = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
        assert.ok(schemas.some(s => s['@graph']?.some(n => n['@type'] === 'WebApplication')), file);
        const alternates = [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map(m => [m[1], m[2]]);
        const lang = html.match(/<html[^>]*lang="([^"]+)"/)[1];
        assert.equal(alternates.find(([l]) => l === lang)?.[1], url, file);
        assert.ok(alternates.some(([l]) => l === 'x-default'), file);
        for (const [, u] of alternates) {
            assert.ok(u.startsWith(base + '/')); const target = u === base + '/' ? 'index.html' : u.slice(base.length + 1);
            assert.ok(files.includes(target), file + ': missing ' + target);
        }
        return { url, alternates };
    });
    for (const p of pages) for (const [, u] of p.alternates) {
        const q = pages.find(x => x.url === u); assert.deepEqual(q.alternates, p.alternates, p.url + ' -> ' + u);
    }
    const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
    assert.equal(new Set(locs).size, 102); assert.deepEqual(locs.sort(), pages.map(p => p.url).sort());
    assert.doesNotMatch(sitemap, /index\.html|\/ar\.html|google7|#/);
    assert.match(fs.readFileSync(path.join(root, 'robots.txt'), 'utf8'), /Sitemap: https:\/\/randly.live\/sitemap.xml/);
});
