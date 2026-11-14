'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const personas = require('../ai-personas');
const make = options => personas.createPersona({ pick: () => 0, ...options });

test('every supported country retains its code without borrowing another country’s city', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'public/country-display.js'), 'utf8');
    const codes = source.match(/new Set\(\('([^']+)'\)/)[1].split(' ');
    assert.equal(codes.length, 249);
    for (const country of codes) {
        const p = make({ preferredCountry: country, locale: 'en' });
        assert.equal(p.country, country); assert.equal(p.kind, 'ai'); assert.ok(p.countryName);
        assert.doesNotThrow(() => personas.localTime(p));
        if (!p.locallyCurated) { assert.equal(p.city, null); assert.equal(p.timeZone, null); assert.equal(p.nativeLanguage, null); }
    }
    const canada = make({ preferredCountry: 'CA', actualCountry: 'EG', locale: 'ar' });
    assert.equal(canada.country, 'CA'); assert.equal(canada.city, 'Toronto'); assert.equal(canada.language, 'ar');
    const unknown = make({ preferredCountry: 'AQ', locale: 'fr' }); assert.equal(unknown.city, null);
});
test('languages and local dialects follow supported profiles without forcing English or stereotypes', () => {
    assert.match(make({ preferredCountry: 'EG', locale: 'ar' }).style, /مصرية/);
    assert.match(make({ preferredCountry: 'SA', locale: 'ar' }).style, /سعودية/);
    assert.match(make({ preferredCountry: 'FR', locale: 'fr' }).style, /French/);
    assert.match(make({ preferredCountry: 'DE', locale: 'de' }).style, /German/);
    assert.match(make({ preferredCountry: 'BR', locale: 'pt' }).style, /Brazilian/);
    assert.match(make({ preferredCountry: 'EG', locale: 'en' }).style, /English/);
    assert.match(personas.styleFor(make({ preferredCountry: 'EG', locale: 'en' }), 'ar'), /مصرية/);
    for (const country of personas.WORLD) for (const locale of personas.LANGUAGES) {
        const p = make({ preferredCountry: country, locale }); assert.equal(p.language, locale); assert.ok(p.name); assert.ok(p.style);
    }
});
test('representative time uses the chosen city and profile data stays immutable', () => {
    const p = make({ preferredCountry: 'US', locale: 'en' });
    assert.equal(p.city, 'Los Angeles'); assert.equal(p.timeZone, 'America/Los_Angeles');
    assert.equal(personas.localTime(p, new Date('2026-01-01T00:00:00Z')), '16:00');
    assert.throws(() => { p.country = 'EG'; }, TypeError);
    assert.equal(make({ preferredCountry: 'ZZ', actualCountry: 'CA' }).country, 'CA');
    assert.equal(make({ preferredCountry: 'global', actualCountry: 'unknown' }).country, 'EG');
});
