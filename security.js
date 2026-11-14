'use strict';
const net = require('net');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const production = process.env.NODE_ENV === 'production';
const port = process.env.PORT || 3000;
const origins = new Set(['https://randly.live']);
if (!production) {
    origins.add(`http://localhost:${port}`);
    origins.add(`http://127.0.0.1:${port}`);
}
const originAllowed = origin => typeof origin === 'string' && origins.has(origin);
const trusted = new net.BlockList();
for (const entry of (process.env.TRUSTED_PROXY_CIDRS || '').split(',').filter(Boolean)) {
    const [address, prefix] = entry.trim().split('/');
    const family = net.isIP(address);
    if (!family) throw new Error('Invalid TRUSTED_PROXY_CIDRS');
    if (prefix === undefined) trusted.addAddress(address, family === 4 ? 'ipv4' : 'ipv6');
    else trusted.addSubnet(address, Number(prefix), family === 4 ? 'ipv4' : 'ipv6');
}
function normalizeIp(value) {
    if (typeof value !== 'string') return '';
    let ip = value.trim();
    if (ip.startsWith('::ffff:') && net.isIP(ip.slice(7)) === 4) ip = ip.slice(7);
    if (!net.isIP(ip)) return '';
    return net.isIP(ip) === 6 ? new URL(`http://[${ip}]`).hostname.slice(1, -1) : ip;
}
function isTrusted(ip) {
    return !!ip && trusted.check(ip, net.isIP(ip) === 4 ? 'ipv4' : 'ipv6');
}
function clientIp(headers, address) {
    let ip = normalizeIp(address);
    if (!isTrusted(ip)) return ip || 'unknown';
    // Only enable this when the trusted ingress overwrites this header and the
    // origin is firewalled against direct access (documented in DEPLOY.md).
    if (process.env.BEHIND_CLOUDFLARE === 'true') {
        const cf = normalizeIp(headers['cf-connecting-ip']);
        if (cf) return cf;
    }
    const chain = typeof headers['x-forwarded-for'] === 'string'
        ? headers['x-forwarded-for'].split(',').slice(-16) : [];
    for (let i = chain.length - 1; i >= 0 && isTrusted(ip); i--) {
        const next = normalizeIp(chain[i]);
        if (!next) break;
        ip = next;
    }
    return ip || 'unknown';
}
function rateKey(ip) {
    if (net.isIP(ip) !== 6) return ip;
    const [head, tail] = ip.split('::');
    const h = head ? head.split(':') : [];
    const t = tail ? tail.split(':') : [];
    const parts = tail === undefined ? h : [...h, ...Array(8 - h.length - t.length).fill('0'), ...t];
    return parts.slice(0, 4).map(x => x.padStart(4, '0')).join(':') + '::/64';
}
// Bounded token buckets: reconnecting does not reset per-IP budgets and a flood
// of distinct addresses cannot grow the map without limit. Fail closed at cap.
class Limiter {
    constructor(capacity = 20000) { this.entries = new Map(); this.capacity = capacity; }
    take(key, burst, perMinute, now = Date.now()) {
        let e = this.entries.get(key);
        if (!e) {
            if (this.entries.size >= this.capacity) return false;
            e = { tokens: burst, at: now }; this.entries.set(key, e);
        }
        e.tokens = Math.min(burst, e.tokens + Math.max(0, now - e.at) * perMinute / 60000);
        e.at = now;
        if (e.tokens < 1) return false;
        e.tokens--; return true;
    }
    prune(now = Date.now()) {
        for (const [k, e] of this.entries) if (now - e.at > 300000) this.entries.delete(k);
    }
}
const rates = new Limiter();
setInterval(() => rates.prune(), 60000).unref();
const object = v => !!v && typeof v === 'object' && !Array.isArray(v) && !Buffer.isBuffer(v);
const exact = (v, keys) => object(v) && Object.keys(v).every(k => keys.includes(k));
const text = (v, max) => typeof v === 'string' && v.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v);
const room = v => typeof v === 'string' && /^room_[0-9a-f-]{36}$/.test(v);
const match = v => typeof v === 'string' && /^[0-9a-f-]{36}$/.test(v);
function validSignal(v) {
    if (!exact(v, ['roomId', 'matchId', 'offer', 'answer', 'candidate']) || !room(v.roomId) || !match(v.matchId)) return false;
    const keys = ['offer', 'answer', 'candidate'].filter(k => v[k] !== undefined);
    if (keys.length !== 1 || Buffer.byteLength(JSON.stringify(v)) > 20480) return false;
    const kind = keys[0], s = v[kind];
    if (kind !== 'candidate') return exact(s, ['type', 'sdp']) && s.type === kind && text(s.sdp, 18000) && s.sdp.startsWith('v=0\r\n');
    return exact(s, ['candidate', 'sdpMid', 'sdpMLineIndex', 'usernameFragment']) && text(s.candidate, 2048)
        && (s.candidate === '' || s.candidate.startsWith('candidate:'))
        && (s.sdpMid == null || text(s.sdpMid, 64))
        && (s.sdpMLineIndex == null || (Number.isInteger(s.sdpMLineIndex) && s.sdpMLineIndex >= 0 && s.sdpMLineIndex <= 32))
        && (s.usernameFragment == null || text(s.usernameFragment, 256));
}
function validPacket(packet) {
    const [event, data] = packet;
    if (typeof event !== 'string' || packet.length > 2) return false;
    if (['typing', 'stop-typing', 'leave-room'].includes(event)) return data === undefined;
    if (event === 'device-id') return exact(data, ['did', 'fp']) && ['did', 'fp'].every(k => typeof data[k] === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(data[k]));
    if (event === 'signal') return validSignal(data);
    const locales = ['ar', 'en', 'es', 'fr', 'de', 'it', 'pt', 'tr', 'ru', 'hi', 'id', 'zh'];
    if (event === 'chat-language') return exact(data, ['locale']) && locales.includes(data.locale);
    if (event === 'send-message') return exact(data, ['text']) && text(data.text, 500) && !!data.text.trim();
    if (event === 'submit-report') return exact(data, ['reason', 'auto']) && ['abuse', 'nudity', 'violence', 'other'].includes(data.reason) && (data.auto === undefined || typeof data.auto === 'boolean');
    if (event === 'xo-move') return exact(data, ['index', 'symbol']) && Number.isInteger(data.index) && data.index >= 0 && data.index <= 8 && (data.symbol === undefined || ['X', 'O'].includes(data.symbol));
    if (event === 'create-room') return exact(data, ['mode']) && ['video', 'text'].includes(data.mode);
    if (event === 'join-saved-room') return exact(data, ['roomId', 'mode']) && room(data.roomId) && (data.mode === undefined || ['video', 'text'].includes(data.mode));
    if (event === 'find-match') return exact(data, ['mode', 'country', 'interests', 'locale']) && ['video', 'text'].includes(data.mode)
        && (data.locale === undefined || locales.includes(data.locale))
        && (data.country === 'global' || (typeof data.country === 'string' && /^[A-Z]{2}$/.test(data.country)))
        && Array.isArray(data.interests) && data.interests.length <= 10 && data.interests.every(x => text(x, 30));
    return false;
}
const hashCache = new Map();
function prepareHeaders(publicDir) {
    hashCache.clear();
    for (const filename of fs.readdirSync(publicDir).filter(f => /^[\w-]+\.html$/.test(f))) {
        const html = fs.readFileSync(path.join(publicDir, filename), 'utf8');
        const hashes = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
            .filter(m => !/\bsrc\s*=/i.test(m[1]))
            .map(m => "'sha256-" + crypto.createHash('sha256').update(m[2].replace(/\r\n/g, '\n')).digest('base64') + "'");
        hashCache.set(filename, hashes);
    }
}
function headers(req, res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(), payment=(), usb=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    if (production) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    const pathname = (req.url || '/').split('?')[0];
    const filename = pathname === '/' ? 'index.html' : pathname.slice(1);
    const hashes = hashCache.get(filename) || [];
    res.setHeader('Content-Security-Policy', [
        "default-src 'self'", "base-uri 'none'", "object-src 'none'", "frame-ancestors 'none'", "form-action 'self'",
        `script-src 'self' ${hashes.join(' ')} https://pagead2.googlesyndication.com https://www.googletagservices.com https://www.google.com https://www.gstatic.com`,
        "script-src-attr 'none'", "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
        "font-src 'self' https://cdnjs.cloudflare.com", "img-src 'self' data: https://*.googlesyndication.com https://*.doubleclick.net https://www.google.com",
        "media-src 'self' blob:", "connect-src 'self' https://randly.live wss://randly.live https://*.googlesyndication.com https://*.doubleclick.net https://www.google.com",
        "frame-src https://*.googlesyndication.com https://*.doubleclick.net https://www.google.com",
        "worker-src 'self' blob:", ...(production ? ['upgrade-insecure-requests'] : [])
    ].join('; '));
}
module.exports = { origins, originAllowed, clientIp, rateKey, rates, Limiter, validPacket, validSignal, text, headers, prepareHeaders };
