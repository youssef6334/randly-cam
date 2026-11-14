'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const { io } = require('socket.io-client');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

test('AI session lifecycle through real Socket.IO clients', { timeout: 50000 }, async t => {
    const port = 27000 + crypto.randomInt(5000), root = path.join(__dirname, '..');
    const base = `http://127.0.0.1:${port}`, sockets = [];
    const srv = spawn(process.execPath, ['server.js'], { cwd: root, windowsHide: true, env: { ...process.env,
        NODE_ENV: 'production', PORT: String(port), DATA_DIR: path.join(root, '.test-data', 'ai-integration'),
        AI_WAIT_MS: '1000', GEMINI_API_KEY: '', GROQ_API_KEY: '', AI_HEALTH_TOKEN: 'test-ai-health', TRUSTED_PROXY_CIDRS: '' } });
    let logs = '';
    const ready = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('Server startup timeout')), 15000);
        srv.stdout.on('data', d => { logs += d; if (logs.includes('Server is running')) { clearTimeout(timer); resolve(); } });
        srv.stderr.on('data', d => { logs += d; });
        srv.once('error', e => { clearTimeout(timer); reject(e); });
    });
    t.after(() => { sockets.forEach(s => s.close()); srv.kill(); });
    await ready;
    const once = (s, event, ms = 5000) => new Promise((resolve, reject) => {
        const listener = data => { clearTimeout(timer); resolve(data); };
        const timer = setTimeout(() => { s.off(event, listener); reject(Error('Timeout: ' + event)); }, ms);
        s.once(event, listener);
    });
    const connect = () => new Promise((resolve, reject) => {
        const s = io(base, { transports: ['websocket'], extraHeaders: { Origin: 'https://randly.live' }, forceNew: true, reconnection: false });
        sockets.push(s); s.once('connect_error', reject);
        s.once('connect', () => { s.emit('device-id', { did: crypto.randomUUID(), fp: crypto.randomUUID() }); resolve(s); });
    });
    const a = await connect();
    const messages = []; a.on('receive-message', m => messages.push(m));
    let first;
    await t.test('AI metadata identifies its fictional country and scoped session', async () => {
        const matched = once(a, 'matched'); a.emit('find-match', { mode: 'text', country: 'CA', locale: 'ar', interests: [] });
        first = await matched; assert.equal(first.partnerType, 'ai'); assert.equal(first.countryKind, 'fictional');
        assert.equal(first.partnerCountry, 'CA'); assert.match(first.matchId, /^[0-9a-f-]{36}$/);
        const greeting = await once(a, 'receive-message'); assert.match(greeting.text, /أهلاً/);
        assert.match(greeting.text, /ذكاء اصطناعي/);
        assert.equal(greeting.matchId, first.matchId); assert.equal(greeting.roomId, first.roomId);
    });
    await t.test('memory and honest identity work during a provider outage without skipping', async () => {
        let reply = once(a, 'receive-message'); a.emit('send-message', { text: 'My name is Alice.' }); await reply;
        reply = once(a, 'receive-message'); a.emit('send-message', { text: 'What is my name?' }); assert.match((await reply).text, /Alice/);
        const before = first.matchId;
        let skipped = false; const handler = () => { skipped = true; }; a.on('peer-disconnected', handler);
        reply = once(a, 'receive-message'); a.emit('send-message', { text: 'Are you AI?' });
        const identity = await reply; assert.match(identity.text, /AI/); assert.equal(identity.matchId, before);
        assert.equal(skipped, false); a.off('peer-disconnected', handler);
    });
    let second;
    await t.test('skip cancels queued replies and starts a new AI session without old memory', async () => {
        a.emit('send-message', { text: 'What is my name?' });
        const matched = once(a, 'matched'); a.emit('find-match', { mode: 'text', country: 'BR', locale: 'pt', interests: [] });
        second = await matched; assert.notEqual(second.matchId, first.matchId); assert.equal(second.partnerCountry, 'BR');
        const greeting = await once(a, 'receive-message'); assert.equal(greeting.matchId, second.matchId); assert.match(greeting.text, /Oi!/);
        const reply = once(a, 'receive-message'); a.emit('send-message', { text: 'What is my name?' });
        const answer = await reply; assert.doesNotMatch(answer.text, /Alice/); assert.equal(answer.matchId, second.matchId);
        const currentMessages = messages.filter(m => m.matchId === second.matchId);
        assert.ok(currentMessages.every(m => !m.text.includes('Alice')));
    });
    await t.test('changing chat language updates deterministic replies and the AI game still works', async () => {
        a.emit('chat-language', { locale: 'fr' }); await wait(30);
        const reply = once(a, 'receive-message'); a.emit('send-message', { text: 'Tu es une IA ?' });
        assert.match((await reply).text, /personnage.*IA/);
        const move = once(a, 'xo-receive-move'); a.emit('xo-move', { index: 0, symbol: 'X' });
        const played = await move; assert.equal(played.symbol, 'O'); assert.ok(played.index >= 1 && played.index <= 8);
    });
    await t.test('moving to a real person removes AI state and queued messages', async () => {
        const b = await connect(), pa = once(a, 'matched'), pb = once(b, 'matched');
        a.emit('send-message', { text: 'Are you AI?' });
        const prefs = { mode: 'video', country: 'global', locale: 'en', interests: [] };
        a.emit('find-match', prefs); b.emit('find-match', prefs);
        const [ma, mb] = await Promise.all([pa, pb]);
        assert.equal(ma.partnerType, 'human'); assert.equal(mb.partnerType, 'human'); assert.equal(ma.matchId, mb.matchId);
        let leaked = false; const handler = data => { if (data.partnerType === 'ai') leaked = true; };
        a.on('receive-message', handler); await wait(1200); a.off('receive-message', handler); assert.equal(leaked, false);
        const reply = once(b, 'receive-message'); a.emit('send-message', { text: 'Hello, real peer.' });
        assert.equal((await reply).text, 'Hello, real peer.');
    });
    await t.test('private modules remain inaccessible and health reveals configuration only', async () => {
        for (const url of ['/ai-chat.js', '/ai-personas.js']) assert.equal((await fetch(base + url)).status, 404);
        assert.equal((await fetch(base + '/api/ai-health?token=test-ai-health')).status, 404);
        const res = await fetch(base + '/api/ai-health', { headers: { 'x-health-token': 'test-ai-health' } });
        assert.deepEqual(await res.json(), { configured: false, providers: { groq: false, gemini: false } });
    });
    assert.doesNotMatch(logs, /uncaught|TypeError|ReferenceError/);
});
