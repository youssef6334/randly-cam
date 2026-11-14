'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const country = require('../public/country-display');

function element() {
    return { textContent: '', hidden: true, style: {}, classList: { add() {} }, setAttribute() {} };
}
function partnerElements() {
    return { videoFlag: element(), textFlag: element(), videoName: element(), textName: element() };
}

test('country codes are normalized and malformed or unsupported input has a safe fallback', () => {
    assert.equal(country.normalize(' eg '), 'EG');
    for (const value of [null, undefined, {}, [], 123, 'ZZ', 'EU', 'UK', 'en-US', '<script>', '__proto__', 'global', 'unknown']) {
        assert.equal(country.normalize(value), 'global');
        assert.equal(country.emoji(value), '🌐');
    }
    // Valid country codes are preserved, including those without a sprite tile.
    for (const code of ['AR', 'CO', 'IL', 'VA', 'AX']) assert.equal(country.normalize(code), code);
});

test('country flags use stable tiles and switching partners clears the previous image', () => {
    const flag = element();
    country.renderFlag(flag, 'US');
    assert.equal(flag.style.backgroundPosition, '0px 0px');
    assert.match(flag.style.backgroundImage, /flags-sprite\.webp/);
    assert.equal(flag.textContent, ''); assert.equal(flag.hidden, false);
    country.renderFlag(flag, 'EG');
    assert.equal(flag.style.backgroundPosition, '-84px -28px');
    country.renderFlag(flag, 'unknown');
    assert.equal(flag.style.backgroundImage, '');
    assert.equal(flag.style.backgroundPosition, '');
    assert.equal(flag.textContent, '🌐');
    country.renderFlag(flag, 'AR');
    assert.equal(flag.style.backgroundImage, ''); assert.equal(flag.textContent, '🇦🇷');
});

test('video and text labels stay aligned with the same partner across language changes', () => {
    const elements = partnerElements();
    country.renderPartner('eg', 'ar', elements);
    assert.equal(elements.videoName.textContent, 'مصر');
    assert.equal(elements.textName.textContent, elements.videoName.textContent);
    assert.equal(elements.videoFlag.style.backgroundPosition, elements.textFlag.style.backgroundPosition);
    country.renderPartner('EG', 'en', elements);
    assert.equal(elements.videoName.textContent, 'Egypt');
    assert.equal(elements.textName.textContent, 'Egypt');
    country.renderPartner('US', 'en', elements);
    assert.equal(elements.textName.textContent, 'United States');
    assert.equal(elements.videoFlag.style.backgroundPosition, '0px 0px');
    country.renderPartner(null, 'ar', elements);
    assert.equal(elements.textName.textContent, 'الدولة غير معروفة');
    assert.equal(elements.videoFlag.style.backgroundImage, '');
    assert.doesNotThrow(() => country.renderPartner('EG', 'invalid_locale', elements));
    assert.equal(elements.textName.textContent, 'EG');
});

test('all chat languages load the country renderer before chat code', () => {
    const root = path.join(__dirname, '..', 'public');
    const files = fs.readdirSync(root).filter(f => f.endsWith('.html') && fs.readFileSync(path.join(root, f), 'utf8').includes('id="landingPage"'));
    assert.equal(files.length, 12);
    for (const file of files) {
        const html = fs.readFileSync(path.join(root, file), 'utf8');
        assert.ok(html.indexOf('src="/country-display.js') < html.indexOf('src="script.js'), file);
        assert.equal([...html.matchAll(/src="\/country-display\.js/g)].length, 1, file);
    }
});

test('chat refresh uses the partner country and leaving clears both displays before the next match', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'public/script.js'), 'utf8');
    const refresh = source.slice(source.indexOf('function refreshPartnerCountry('), source.indexOf("socket.on('matched'"));
    const clear = source.slice(source.indexOf('function clearRemoteVideo('), source.indexOf('function toggleMic('));
    const nodes = { remoteUserFlag: element(), remoteUserCountryName: element(), textFlagIcon: element(), textCountryName: element() };
    const context = {
        RandlyCountry: country, document: { documentElement: { lang: 'en' }, getElementById: id => nodes[id] || null },
        currentPartnerCountry: 'EG', currentMatchId: 'previous-match', remoteVideo: null, peerConnection: null,
        pendingCandidates: [], countrySelect: { value: 'US' }
    };
    vm.runInNewContext(refresh + '\n' + clear, context);
    context.refreshPartnerCountry();
    assert.equal(nodes.textCountryName.textContent, 'Egypt');
    assert.equal(nodes.remoteUserFlag.style.backgroundPosition, '-84px -28px');
    context.clearRemoteVideo();
    assert.equal(context.currentPartnerCountry, null);
    for (const flag of [nodes.remoteUserFlag, nodes.textFlagIcon]) {
        assert.equal(flag.hidden, true); assert.equal(flag.style.backgroundImage, ''); assert.equal(flag.textContent, '');
    }
    assert.equal(nodes.textCountryName.textContent, ''); assert.equal(nodes.remoteUserCountryName.textContent, '');
    context.currentPartnerCountry = 'CA'; context.refreshPartnerCountry('ar');
    assert.equal(nodes.textCountryName.textContent, 'كندا');
    assert.equal(nodes.textFlagIcon.hidden, false); assert.equal(nodes.remoteUserFlag.hidden, false);
});
