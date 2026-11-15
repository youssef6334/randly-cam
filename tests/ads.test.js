'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const security = require('../security');
const root = path.join(__dirname, '..', 'public');

test('only the sandboxed ad document has a flexible script policy', () => {
    const headers = url => {
        const result = {};
        security.headers({ url }, { setHeader: (k, v) => { result[k] = v; } });
        return result;
    };
    const main = headers('/en.html'), ad = headers('/adsterra-frame.html?v=test');
    assert.equal(main['X-Frame-Options'], 'DENY');
    assert.doesNotMatch(main['Content-Security-Policy'].split(';').find(x => x.trim().startsWith('script-src ')), /unsafe-inline|unsafe-eval/);
    assert.match(main['Content-Security-Policy'], /frame-src 'self'/);
    assert.equal(ad['X-Robots-Tag'], 'noindex, nofollow');
    assert.equal(ad['X-Frame-Options'], 'SAMEORIGIN');
    assert.match(ad['Permissions-Policy'], /camera=\(\), microphone=\(\)/);
    const sandbox = ad['Content-Security-Policy'].split(';').find(x => x.trim().startsWith('sandbox '));
    assert.match(sandbox, /allow-scripts/);
    assert.doesNotMatch(sandbox, /allow-same-origin|allow-top-navigation|allow-forms/);
    assert.match(ad['Content-Security-Policy'], /frame-ancestors 'self'/);
    assert.doesNotMatch(headers('/adsterra-frame.html/extra')['Content-Security-Policy'], /unsafe-eval/);
    const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
    assert.doesNotMatch(sitemap, /adsterra-frame/);
});

test('all 12 chat pages use one shared ad loader and current approved placements', () => {
    const pages = fs.readdirSync(root).filter(f => f.endsWith('.html') && fs.readFileSync(path.join(root, f), 'utf8').includes('id="landingPage"'));
    assert.equal(pages.length, 12);
    for (const file of pages) {
        const html = fs.readFileSync(path.join(root, file), 'utf8');
        assert.equal([...html.matchAll(/src="\/ads\.js\?/g)].length, 1, file);
        assert.equal([...html.matchAll(/data-ad-toggle\b/g)].length, 1, file);
        assert.doesNotMatch(html, /bicea\.org|effectivecpmnetwork\.com|container-f66aa4|data-handler-click="75da431a9263"/, file);
    }
    const frame = fs.readFileSync(path.join(root, 'adsterra-frame.js'), 'utf8');
    assert.match(frame, /https:\/\/bicea\.org\/21\/41a844b9e767c8981fc99be90925b350/);
    assert.match(frame, /https:\/\/bicea\.org\/14\/4cd723902c51674b52b1ac4b207c76d4/);
    assert.doesNotMatch(frame, /f66aa4bb|af014f7d|setInterval|\.click\(/);
});

test('ads load once after entering chat, ignore forged sizing messages, collapse and hide no-fill', () => {
    const handlers = {}, observers = [], timers = [];
    let writes = 0;
    const styleValues = {};
    const app = { hidden: true, style: { getPropertyValue: k => styleValues[k], setProperty: (k,v) => { styleValues[k] = v; writes++; } } };
    const label = {}, loading = {}, content = { hidden: false };
    const toggle = { setAttribute() {}, addEventListener: (event, fn) => { handlers.toggle = fn; } };
    const slot = { children: [], appendChild(el) { this.children.push(el); } };
    const card = { hidden: false, dataset: {}, closest: () => app, getBoundingClientRect: () => ({height:80}), querySelector: s => ({'[data-ad-toggle]':toggle, '[data-ad-slot]':slot, '[data-ad-label]':label, '[data-ad-loading]':loading}[s]) };
    const document = {
        readyState:'complete', visibilityState:'visible', documentElement: {lang:'en',dataset:{}},
        getElementById: id => ({adContainer:card,adContent:content}[id]),
        addEventListener: (event, fn) => { handlers[event] = fn; },
        createElement: () => ({style:{},contentWindow:{},attrs:{},setAttribute(k,v){this.attrs[k]=v;}})
    };
    const window = { addEventListener: (event, fn) => { handlers[event] = fn; } };
    class MutationObserver { constructor(fn) { this.fn=fn; observers.push(this); } observe() {} }
    vm.runInNewContext(fs.readFileSync(path.join(root,'ads.js'),'utf8'), {window,document,MutationObserver,ResizeObserver:class {observe(){}},setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout:()=>{}});
    assert.equal(slot.children.length, 0, 'landing page must not load ads');
    app.hidden=false; observers[0].fn(); observers[0].fn();
    assert.equal(slot.children.length,1);
    assert.equal(writes,1, 'same measurement must not trigger style observer loops');
    const frame=slot.children[0];
    assert.doesNotMatch(frame.attrs.sandbox,/allow-same-origin|allow-top-navigation/);
    assert.match(frame.attrs.allow,/camera 'none'/);
    const good={source:frame.contentWindow,origin:'null',data:{type:'randly-ad-layout',filled:true,height:100}};
    for(const bad of [{...good,source:{}},{...good,origin:'https://evil.example'},{...good,data:{...good.data,height:Infinity}},{...good,data:{...good.data,height:2000}}]) handlers.message(bad);
    assert.equal(frame.style.height,undefined);
    timers[0](); assert.equal(card.hidden,true,'unfilled ads must release their space');
    assert.equal(styleValues['--randly-ad-space'],'0px');
    handlers.message(good); assert.equal(frame.style.height,'100px'); assert.equal(loading.hidden,true);
    assert.equal(card.hidden,false,'a late legitimate fill may restore the slot');
    handlers.toggle(); assert.equal(content.hidden,true);
    handlers.toggle(); assert.equal(content.hidden,false); assert.equal(slot.children.length,1);
    timers[0](); assert.equal(card.hidden,false,'a filled slot stays visible');
});
