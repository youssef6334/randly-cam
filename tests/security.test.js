'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const { spawn } = require('child_process');
const { io } = require('socket.io-client');
const security = require('../security');
const root = path.join(__dirname, '..');
const wait = ms => new Promise(r => setTimeout(r, ms));

test('IP identity ignores forged proxy headers; IPv6 addresses share a /64 budget', () => {
    assert.equal(security.clientIp({ 'x-forwarded-for': '1.2.3.4', 'x-real-ip': '5.6.7.8', 'cf-connecting-ip': '8.8.8.8' }, '::ffff:192.0.2.10'), '192.0.2.10');
    assert.equal(security.rateKey('2001:db8::1'), security.rateKey('2001:db8::ffff'));
    assert.equal(security.rateKey('2001:0db8:0000::1'), security.rateKey('2001:db8::1'));
});
test('bounded limiter rejects floods, expires idle entries and refills deterministically', () => {
    const limiter = new security.Limiter(2);
    assert.ok(limiter.take('a', 2, 60, 1000)); assert.ok(limiter.take('a', 2, 60, 1000));
    assert.equal(limiter.take('a', 2, 60, 1000), false);
    assert.ok(limiter.take('a', 2, 60, 2000)); assert.ok(limiter.take('b', 2, 60, 2000));
    assert.equal(limiter.take('c', 2, 60, 2000), false);
    limiter.prune(400000); assert.equal(limiter.entries.size, 0);
});
test('strict packet schemas reject coercions, nesting, oversized and unknown input', () => {
    for (const p of [['unknown', {}], ['send-message', { text: 'x'.repeat(501) }], ['send-message', { text: {} }], ['send-message', { text: 'hi', html: '<script>' }], ['typing', {}], ['find-match', { mode: {}, country: 'global', interests: [] }], ['signal', { offer: { type: 'offer', sdp: '<script>' } }], ['send-message', { text: 'x' }, () => {}]]) assert.equal(security.validPacket(p), false);
    assert.ok(security.validPacket(['send-message', { text: '<img src=x onerror=alert(1)>&#60;script&#62;' }]));
    assert.ok(security.validPacket(['find-match', { mode: 'text', country: 'global', interests: ['مرحبا', 'music'] }]));
});
test('chat and translated payloads become text nodes and never HTML', () => {
    class Element {
        constructor(tag) { this.tag = tag; this.children = []; this.style = {}; this.classList = { add() {} }; this._text = ''; }
        set textContent(t) { this._text = t; this.children = []; }
        get textContent() { return this._text; }
        set innerHTML(_) { throw new Error('HTML sink used'); }
        appendChild(el) { this.children.push(el); return el; }
    }
    const source = fs.readFileSync(path.join(root, 'public/script.js'), 'utf8');
    const start = source.indexOf('function appendMessage('), end = source.indexOf('\nfunction appendSystemMessage', start);
    const chatBox = new Element('div');
    const context = { chatBox, document: { createElement: tag => new Element(tag) }, tr: () => 'Translation' };
    vm.runInNewContext(source.slice(start, end), context);
    const payload = '<img src=x onerror=alert(1)>&lt;script&gt;';
    context.appendMessage(payload, 'other', payload);
    assert.equal(chatBox.children[0].textContent, payload);
    assert.equal(chatBox.children[0].children[1].textContent, 'Translation: ' + payload);
});

test('production HTTP and Socket.IO hardening with real clients', { timeout: 60000 }, async t => {
    const port = 14000 + crypto.randomInt(10000), base = `http://127.0.0.1:${port}`, origin = 'https://randly.live';
    let logs = '', ready;
    const started = new Promise(resolve => { ready = resolve; });
    const srv = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, NODE_ENV: 'production', PORT: String(port), MAX_CONN_PER_IP: '5', DATA_DIR: path.join(root, '.test-data'), TRUSTED_PROXY_CIDRS: '', BEHIND_CLOUDFLARE: 'false', GEMINI_API_KEY: '', GROQ_API_KEY: '', TURN_URLS: 'turn:turn.example:3478', TURN_SHARED_SECRET: 'integration-test-only-secret', TURN_CREDENTIAL: 'must-not-be-returned' }, windowsHide: true });
    srv.stdout.on('data', d => { logs += d; if (logs.includes('Server is running')) ready(); });
    srv.stderr.on('data', d => { logs += d; });
    srv.on('error', ready);
    const sockets = [];
    t.after(() => { sockets.forEach(s => s.close()); srv.kill(); });
    await Promise.race([started, wait(20000).then(() => { throw Error('Server startup timeout: ' + logs); })]);
    const get = (p, opts = {}) => fetch(base + p, { ...opts, redirect: 'manual' });
    const once = (s, event) => new Promise((resolve, reject) => {
        const timer = setTimeout(() => { s.off(event, handler); reject(Error('Timeout: ' + event)); }, 3500);
        function handler(data) { clearTimeout(timer); resolve(data); }
        s.once(event, handler);
    });
    function connect(headers = { Origin: origin }, transport = 'websocket') {
        return new Promise((resolve, reject) => {
            const s = io(base, { transports: [transport], extraHeaders: headers, reconnection: false, forceNew: true, timeout: 2500 });
            sockets.push(s);
            s.once('connect', () => { s.emit('device-id', { did: crypto.randomUUID(), fp: crypto.randomUUID() }); resolve(s); });
            s.once('connect_error', e => { s.close(); reject(e); });
        });
    }
    await t.test('headers, canonical redirects, CORS and protected filesystem paths', async () => {
        const res = await get('/en.html', { headers: { Origin: origin } });
        assert.equal(res.status, 200);
        assert.equal(res.headers.get('access-control-allow-origin'), origin);
        assert.equal(res.headers.get('x-frame-options'), 'DENY');
        assert.equal(res.headers.get('x-powered-by'), null);
        assert.match(res.headers.get('strict-transport-security'), /max-age=31536000/);
        const csp = res.headers.get('content-security-policy');
        assert.match(csp, /script-src-attr 'none'/); assert.match(csp, /'sha256-/);
        assert.doesNotMatch(csp.split(';').find(x => x.trim().startsWith('script-src ')), /unsafe-inline|unsafe-eval/);
        for (const p of ['/.env', '/%2eenv', '/server.js', '/security.js', '/package.json', '/tools/build-seo.js', '/backup/x.html', '/data/bans.json', '/secret.md', '/style.css.map']) assert.equal((await get(p)).status, 404, p);
        for (const p of ['/ar.html', '/index.html']) { const r = await get(p); assert.equal(r.status, 301); assert.equal(r.headers.get('location'), '/'); }
        for (const o of ['https://evil.example', 'https://www.randly.live', 'null', 'https://randly.live.evil.example']) assert.equal((await get('/api/ice', { headers: { Origin: o } })).status, 403, o);
    });
    await t.test('parser errors do not disclose paths and translation input needs origin', async () => {
        assert.equal((await get('/api/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
        for (const [body, status] of [['{}', 400], ['{invalid', 400], [JSON.stringify({ text: 'x'.repeat(5000), target: 'en' }), 413]]) {
            const r = await get('/api/translate', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body });
            assert.equal(r.status, status); assert.doesNotMatch(await r.text(), /server\.js|SyntaxError|Users|node_modules/);
        }
    });
    await t.test('large compressed assets finish downloading and preserve their content', async () => {
        for (const file of ['script.js', 'style.css', 'sitemap.xml']) {
            const r = await get('/' + file, { headers: { 'Accept-Encoding': 'gzip' }, signal: AbortSignal.timeout(5000) });
            assert.equal(r.status, 200); assert.equal(r.headers.get('content-encoding'), 'gzip');
            assert.equal(await r.text(), fs.readFileSync(path.join(root, 'public', file), 'utf8'));
        }
    });
    await t.test('TURN credentials expire and do not disclose the shared secret or fixed credential', async () => {
        const r = await get('/api/ice', { headers: { Origin: origin } });
        assert.equal(r.headers.get('cache-control'), 'no-store');
        const data = await r.json(), turn = data.iceServers[1];
        assert.ok(turn); assert.match(turn.username, /^\d+:[a-f0-9]+$/);
        const ttl = Number(turn.username.split(':')[0]) - Math.floor(Date.now() / 1000);
        assert.ok(ttl > 590 && ttl <= 600);
        assert.equal(turn.credential, crypto.createHmac('sha1', 'integration-test-only-secret').update(turn.username).digest('base64'));
        assert.doesNotMatch(JSON.stringify(data), /must-not-be-returned|integration-test-only-secret/);
    });
    await t.test('WebSocket and polling reject missing and untrusted origins', async () => {
        await assert.rejects(connect({}));
        await assert.rejects(connect({ Origin: 'https://evil.example' }));
        await assert.rejects(connect({ Origin: 'https://evil.example' }, 'polling'));
    });
    const a = await connect(), b = await connect(), c = await connect();
    let ma, mb, initiator, recipient, meta;
    await t.test('video matching and valid SDP/candidates pass only to the assigned peer', async () => {
        const pa = once(a, 'matched'), pb = once(b, 'matched');
        const prefs = { mode: 'video', country: 'global', interests: [] };
        a.emit('find-match', prefs); b.emit('find-match', prefs);
        [ma, mb] = await Promise.all([pa, pb]);
        assert.equal(ma.roomId, mb.roomId); assert.equal(ma.matchId, mb.matchId);
        initiator = ma.isInitiator ? a : b; recipient = ma.isInitiator ? b : a; meta = { roomId: ma.roomId, matchId: ma.matchId };
        const signal = once(recipient, 'signal');
        initiator.emit('signal', { ...meta, offer: { type: 'offer', sdp: 'v=0\r\ns=test\r\n' } });
        assert.equal((await signal).offer.type, 'offer');
        const reply = once(initiator, 'signal');
        recipient.emit('signal', { ...meta, answer: { type: 'answer', sdp: 'v=0\r\ns=test\r\n' } });
        assert.equal((await reply).answer.type, 'answer');
        const candidate = once(recipient, 'signal');
        initiator.emit('signal', { ...meta, candidate: { candidate: 'candidate:1 1 UDP 1 192.0.2.1 5000 typ host', sdpMid: '0', sdpMLineIndex: 0, usernameFragment: 'test' } });
        assert.ok((await candidate).candidate);
    });
    await t.test('strangers and stale match identifiers cannot inject signaling', async () => {
        let delivered = 0; const handler = () => delivered++;
        recipient.on('signal', handler);
        c.emit('signal', { ...meta, candidate: { candidate: '' } });
        initiator.emit('signal', { ...meta, matchId: crypto.randomUUID(), candidate: { candidate: '' } });
        initiator.emit('signal', { ...meta, offer: { type: 'answer', sdp: 'v=0\r\n' } });
        await wait(200); recipient.off('signal', handler); assert.equal(delivered, 0);
    });
    await t.test('plain multilingual and HTML-looking messages arrive as bounded text', async () => {
        const payload = '<img src=x onerror=alert(1)> مرحباً &lt;script&gt;';
        const p = once(b, 'receive-message'); a.emit('send-message', { text: payload }); assert.equal((await p).text, payload);
        let delivered = false; const handler = () => { delivered = true; }; b.on('receive-message', handler);
        a.emit('send-message', { text: 'x'.repeat(501) }); await wait(150); b.off('receive-message', handler); assert.equal(delivered, false);
    });
    await t.test('leaving removes the previous peer from the room; invitations can be reused', async () => {
        const left = once(b, 'peer-disconnected'); a.emit('leave-room'); await left;
        const pa = once(a, 'matched'), pc = once(c, 'matched');
        a.emit('join-saved-room', { roomId: ma.roomId }); c.emit('join-saved-room', { roomId: ma.roomId });
        const [na, nc] = await Promise.all([pa, pc]);
        assert.equal(na.roomId, nc.roomId); assert.notEqual(na.matchId, ma.matchId);
        let delivered = false; const handler = () => { delivered = true; }; c.on('signal', handler);
        a.emit('signal', { ...meta, candidate: { candidate: '' } }); await wait(100); c.off('signal', handler); assert.equal(delivered, false);
        const nf = once(b, 'room-not-found'); b.emit('join-saved-room', { roomId: ma.roomId }); await nf;
    });
    await t.test('socket connection caps cannot be bypassed by forged IP headers', async () => {
        await connect(); await connect();
        await assert.rejects(connect({ Origin: origin, 'X-Forwarded-For': '203.0.113.6' }));
    });
    await t.test('malformed event floods disconnect their sender', async () => {
        const p = once(c, 'disconnect'); for (let i = 0; i < 12; i++) c.emit('unregistered-event', { nested: {} }); await p;
        assert.equal((await get('/healthz')).status, 200);
    });
    await t.test('HTTP rate limiting survives forged forwarded headers and returns Retry-After', async () => {
        let limited = false;
        for (let i = 0; i < 330; i++) {
            const r = await get('/healthz', { headers: { 'X-Forwarded-For': `203.0.113.${i % 250}` } });
            await r.text();
            if (r.status === 429) { limited = true; assert.ok(r.headers.get('retry-after')); break; }
        }
        assert.ok(limited);
    });
    assert.doesNotMatch(logs, /uncaught|TypeError|ReferenceError/);
});
