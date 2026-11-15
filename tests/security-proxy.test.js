'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const geoip = require('geoip-lite');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { io } = require('socket.io-client');

function loadSecurity(cidrs = '') {
    const context = {
        require, module: { exports: {} }, URL, Buffer,
        process: { env: { NODE_ENV: 'production', TRUSTED_PROXY_CIDRS: cidrs } },
        setInterval: () => ({ unref() {} })
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../security.js'), 'utf8'), context);
    return context.module.exports;
}

test('trusted ingress strips IPv4/IPv6 source ports before GeoIP and rate limiting', () => {
    const security = loadSecurity('127.0.0.1/32,::1/128');
    for (const [header, expected] of [
        ['8.8.8.8:54321', '8.8.8.8'], [' 8.8.8.8 ', '8.8.8.8'],
        ['[2001:4860:4860::8888]:443', '2001:4860:4860::8888'],
        ['2001:4860:4860::8888', '2001:4860:4860::8888'],
        ['[::ffff:8.8.8.8]:54321', '8.8.8.8']
    ]) {
        const ip = security.clientIp({ 'x-forwarded-for': header }, '::ffff:127.0.0.1');
        assert.equal(ip, expected);
        assert.ok(geoip.lookup(ip)?.country, header);
    }
    assert.equal(security.clientIp({ 'x-forwarded-for': '8.8.8.8:12345' }, '::1'), '8.8.8.8');
});

test('forwarded endpoints do not bypass proxy trust or select an attacker-supplied country', () => {
    const untrusted = loadSecurity();
    assert.equal(untrusted.clientIp({ 'x-forwarded-for': '8.8.8.8:443' }, '192.0.2.1'), '192.0.2.1');
    const trusted = loadSecurity('127.0.0.1/32,192.0.2.2/32');
    assert.equal(trusted.clientIp({ 'x-forwarded-for': '1.1.1.1, 8.8.8.8:1234, 192.0.2.2:8080' }, '127.0.0.1'), '8.8.8.8');
    // The nearest untrusted hop terminates the walk even if a forged address precedes it.
    assert.equal(trusted.clientIp({ 'x-forwarded-for': '1.1.1.1, 192.0.2.3:8080' }, '127.0.0.1'), '192.0.2.3');
    for (const invalid of ['8.8.8.8:65536', '8.8.8.8:-1', '[invalid]:443', '8.8.8.8:443junk', 'https://8.8.8.8', '8.8.8.8:1:2']) {
        assert.equal(trusted.clientIp({ 'x-forwarded-for': invalid }, '127.0.0.1'), '127.0.0.1', invalid);
    }
});

test('ingress diagnostics identify internal hops without trusting them or disclosing visitor addresses', () => {
    const security = loadSecurity();
    const headers = { 'x-forwarded-for': '8.8.8.8, 1.1.1.1', 'cf-connecting-ip': '8.8.8.8' };
    const diagnostic = security.ingressDiagnostics(headers, '::ffff:169.254.129.1');
    assert.equal(diagnostic.internalPeer, '169.254.129.1');
    assert.equal(diagnostic.peerTrusted, false);
    assert.equal(diagnostic.trustedProxyConfigured, false);
    assert.equal(diagnostic.forwardedHopCount, 2);
    assert.equal(diagnostic.cloudflareHeaderPresent, true);
    assert.equal(security.clientIp(headers, '169.254.129.1'), '169.254.129.1');
    assert.doesNotMatch(JSON.stringify(diagnostic), /8\.8\.8\.8|1\.1\.1\.1/);
    assert.equal(security.ingressDiagnostics(headers, '8.8.8.8').internalPeer, null);
    assert.equal(security.ingressDiagnostics({}, 'invalid').internalPeer, null);
    const configured = loadSecurity('169.254.129.1/32');
    assert.equal(configured.ingressDiagnostics({}, '169.254.129.1').peerTrusted, true);
});

test('real matches receive the peer country through trusted ingress with source ports', { timeout: 30000 }, async t => {
    const port = 22000 + crypto.randomInt(8000);
    const root = path.join(__dirname, '..');
    const sockets = [];
    const server = spawn(process.execPath, ['server.js'], {
        cwd: root, windowsHide: true,
        env: { ...process.env, NODE_ENV: 'production', PORT: String(port),
            TRUSTED_PROXY_CIDRS: '127.0.0.1/32,::1/128', BEHIND_CLOUDFLARE: 'false',
            DEV_COUNTRY: '', GROQ_API_KEY: '', GEMINI_API_KEY: '', DATA_DIR: path.join(root, '.test-data') }
    });
    t.after(() => { sockets.forEach(s => s.close()); server.kill(); });
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('Country test server startup timeout')), 15000);
        server.on('error', e => { clearTimeout(timer); reject(e); });
        server.on('exit', () => { clearTimeout(timer); reject(Error('Country test server exited')); });
        server.stderr.on('data', () => {});
        server.stdout.on('data', data => { if (String(data).includes('Server is running')) { clearTimeout(timer); resolve(); } });
    });
    function once(socket, event) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(Error('Timeout: ' + event)), 5000);
            socket.once(event, data => { clearTimeout(timer); resolve(data); });
        });
    }
    async function connect(ip) {
        const socket = io(`http://127.0.0.1:${port}`, {
            transports: ['websocket'], reconnection: false, forceNew: true,
            extraHeaders: { Origin: 'https://randly.live', 'X-Forwarded-For': ip + ':54321' }
        });
        sockets.push(socket);
        const connected = once(socket, 'connect');
        await Promise.race([connected, new Promise((_, reject) => socket.once('connect_error', reject))]);
        socket.emit('device-id', { did: crypto.randomUUID(), fp: crypto.randomUUID() });
        return socket;
    }
    const [a, b] = await Promise.all([connect('8.8.8.8'), connect('1.1.1.1')]);
    const ma = once(a, 'matched'), mb = once(b, 'matched');
    const preferences = { mode: 'video', country: 'global', interests: [] };
    a.emit('find-match', preferences); b.emit('find-match', preferences);
    const [matchedA, matchedB] = await Promise.all([ma, mb]);
    assert.equal(matchedA.partnerCountry, geoip.lookup('1.1.1.1').country);
    assert.equal(matchedB.partnerCountry, geoip.lookup('8.8.8.8').country);
    assert.equal(matchedA.partnerType, 'human');
    assert.equal(matchedA.roomId, matchedB.roomId);
});
