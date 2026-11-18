'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..', 'public');
const languages = ['ar', 'en', 'es', 'fr', 'de', 'it', 'pt', 'tr', 'ru', 'hi', 'id', 'zh'];
test('both new guides are discoverable in every language and have working local links', () => {
    for (const lang of languages) for (const slug of ['is-random-video-chat-safe', 'chat-with-people-from-around-the-world']) {
        const file = `post-${slug}-${lang}.html`, html = fs.readFileSync(path.join(root, file), 'utf8');
        assert.match(fs.readFileSync(path.join(root, `blog-${lang}.html`), 'utf8'), new RegExp(file));
        for (const alternate of languages) assert.ok(html.includes(`value="post-${slug}-${alternate}.html"`), file);
        assert.doesNotMatch(html, /@(?:home|safety|world|free|rules|privacy)|\[.*(?:screenshot|Alt text).*\]/i);
        for (const match of html.matchAll(/href="(\/[^"?#]*)(?:[?#][^"]*)?"/g)) {
            const target = match[1] === '/' ? 'index.html' : match[1].slice(1);
            assert.ok(fs.existsSync(path.join(root, target)), `${file}: missing ${target}`);
        }
        if (slug === 'is-random-video-chat-safe') assert.ok([...html.matchAll(/<ol>([\s\S]*?)<\/ol>/g)].some(m => [...m[1].matchAll(/<li>/g)].length === 15), file + ': preserve all fifteen safety rules');
        assert.ok(html.includes('datePublished":"2026-11-18"'));
    }
});
test('chat entry pages load the RTC credential provider before the main client', () => {
    for (const lang of languages) {
        const file = lang === 'ar' ? 'index.html' : `${lang}.html`, html = fs.readFileSync(path.join(root, file), 'utf8');
        assert.ok(html.indexOf('src="/rtc-config.js?') > 0, file);
        assert.ok(html.indexOf('src="/rtc-config.js?') < html.indexOf('src="script.js?'), file);
    }
});
test('the twenty-two countries in the conversation guide can all be selected', () => {
    const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
    const declarations = script.slice(script.indexOf('const FAMOUS_COUNTRY_CODES'), script.indexOf('function populateLanguageSelects'));
    const choices = vm.runInNewContext(declarations + '\nCOUNTRY_CODES');
    for (const code of ['PS', 'EG', 'SA', 'AE', 'MA', 'DZ', 'KW', 'QA', 'BH', 'OM', 'JO', 'LB', 'IQ', 'SY', 'TR', 'FR', 'DE', 'IT', 'ES', 'GB', 'US', 'IN']) assert.ok(choices.includes(code), code);
});
