'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createProvider } = require('../public/rtc-config');

test('ICE configuration refreshes expired TURN credentials and deduplicates concurrent requests', async () => {
    let clock = 1000000000000, calls = 0, finish;
    const request = () => { calls++; return new Promise(resolve => { finish = () => resolve({ ok: true, json: async () => ({ iceServers: [
        { urls: 'stun:stun.example:19302' },
        { urls: 'turn:turn.example:3478?transport=udp', username: `${Math.floor(clock / 1000) + 600}:session`, credential: 'temporary' }
    ] }) }); }); };
    const provider = createProvider(request, () => clock);
    const first = provider.get(), concurrent = provider.get();
    assert.equal(calls, 1); finish();
    const config = await first; assert.equal(await concurrent, config);
    assert.equal(config.iceTransportPolicy, 'all'); assert.equal(config.iceServers.length, 2);
    clock += 539000; assert.equal(await provider.get(), config); assert.equal(calls, 1);
    clock += 2000; const renewed = provider.get(); assert.equal(calls, 2); finish();
    assert.notEqual((await renewed).iceServers[1].username, config.iceServers[1].username);
});

test('network failure never reuses expired TURN credentials and retries after a short backoff', async () => {
    let clock = 1000000000000, calls = 0;
    const provider = createProvider(async () => {
        if (++calls === 1) return { ok: true, json: async () => ({ iceServers: [{ urls: 'turn:turn.example', username: `${Math.floor(clock / 1000) + 600}:s`, credential: 'temporary' }] }) };
        throw new Error('network failure');
    }, () => clock);
    assert.equal((await provider.get()).iceServers.length, 1);
    clock += 600000; const fallback = await provider.get();
    assert.ok(fallback.iceServers.every(s => s.urls.every(u => u.startsWith('stun:'))));
    assert.equal(calls, 2); await provider.get(); assert.equal(calls, 2);
    clock += 10001; await provider.get(); assert.equal(calls, 3);
});
