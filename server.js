'use strict';
/**
 * Randly server — hardened signaling and session-based AI chat
 */
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { Server } = require('socket.io');
const geoip = require('geoip-lite');
const mod = require('./moderation');
const security = require('./security');

const app = express();
app.disable('x-powered-by');
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) throw new Error('Missing public directory');
security.prepareHeaders(publicDir);
app.use((req, res, next) => {
    security.headers(req, res, publicDir);
    const origin = req.headers.origin;
    if (origin && !security.originAllowed(origin)) return res.status(403).end();
    if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.vary('Origin');
    }
    const ip = security.rateKey(security.clientIp(req.headers, req.socket.remoteAddress));
    if (!security.rates.take('http:' + ip, 300, 300)) {
        res.setHeader('Retry-After', '60'); return res.status(429).end();
    }
    if (req.path.startsWith('/api/')) {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Robots-Tag', 'noindex, nofollow');
        if ((req.method !== 'GET' && !security.originAllowed(origin)) || req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).end();
        if (!security.rates.take('api:' + ip, 40, 40) || !security.rates.take('api:global', 200, 200)) {
            res.setHeader('Retry-After', '60'); return res.status(429).json({ error: 'rate' });
        }
    }
    if (req.method === 'OPTIONS') {
        if (!security.originAllowed(origin)) return res.status(403).end();
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        return res.status(204).end();
    }
    if (req.path === '/index.html' || req.path === '/ar.html') return res.redirect(301, '/');
    next();
});

// Maintained streaming compression honors backpressure and client disconnects.
app.use(require('compression')({ threshold: 1024 }));

const server = http.createServer(app);
server.headersTimeout = 15000;
server.requestTimeout = 20000;
server.keepAliveTimeout = 5000;
server.maxHeadersCount = 64;
server.maxConnections = 3000;

// ---------------------------------------------------------------- الإعدادات
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

const ALLOWED_ORIGINS = [...security.origins];

const LIMITS = {
    MAX_MSG_LEN: 500,
    MAX_INTERESTS: 10,
    MAX_INTEREST_LEN: 30,
    MAX_CONN_PER_IP: Math.min(25, Math.max(1, Number(process.env.MAX_CONN_PER_IP) || 8)),
    MAX_SIGNAL_BYTES: 20 * 1024,
    MAX_VIOLATIONS: 8
};
const COUNTRY_FALLBACK_MS = 10000;
const ROOM_EXPIRY = 72 * 60 * 60 * 1000;
const REPORT_THRESHOLD = Number(process.env.REPORT_THRESHOLD || 3);
const REPORT_WINDOW_MS = 60 * 60 * 1000;
const BAN_MS = Number(process.env.BAN_MINUTES || 15) * 60 * 1000;
const IP_HASH_SALT = process.env.IP_HASH_SALT || crypto.randomBytes(16).toString('hex');
const DEV_COUNTRY = process.env.DEV_COUNTRY || null;

// ---------------------------------------------------------------- Express
app.disable('x-powered-by');

const BLOCKED = /^\/(server\.js|security\.js|ai-(chat|personas)\.js|moderation\.js|badwords\.txt|data|package(-lock)?\.json|node_modules|tools|\.env|\.git|.*\.bak)(\/|$)/i;
// ملفات تطوير/نسخ احتياطية ما تتخدمش أبداً حتى لو اتحطت جوه public/ بالغلط
const BLOCKED_ANYWHERE = /\.(py|bak|sh|md|log|tmp|orig)$|\/backup[^/]*\/|\/review\d*\.txt$/i;
app.use((req, res, next) => ((BLOCKED.test(req.path) || BLOCKED_ANYWHERE.test(req.path)) ? res.status(404).end() : next()));

const STATIC_ROOT = publicDir;

// ---------------------------------------------------------------- الترجمة الفورية (عبر السيرفر)
const TL_LANGS = new Set(['ar', 'en', 'es', 'fr', 'de', 'it', 'pt', 'tr', 'ru', 'hi', 'id', 'zh']);
const translateRate = new Map();

app.use('/api', express.json({ limit: '4kb' }));
app.post('/api/translate', async (req, res) => {
    try {
        const origin = req.headers.origin;
        if (origin && !ALLOWED_ORIGINS.includes(origin)) return res.status(403).json({ error: 'origin' });

        const ip = ipFromHeaders(req.headers, req.socket && req.socket.remoteAddress);
        const now = Date.now();
        const r = translateRate.get(ip) || { c: 0, t: now };
        if (now - r.t > 60000) { r.c = 0; r.t = now; }
        r.c++; translateRate.set(ip, r);
        if (r.c > 40) return res.status(429).json({ error: 'rate' });

        const body = req.body || {};
        const text = security.text(body.text, LIMITS.MAX_MSG_LEN) ? body.text.trim() : '';
        const target = typeof body.target === 'string' ? body.target : '';
        if (!isObj(body) || Object.keys(body).some(k => !['text', 'target'].includes(k)) || !text || !TL_LANGS.has(target)) return res.status(400).json({ error: 'bad_request' });
        if (typeof fetch !== 'function') return res.status(501).json({ error: 'no_fetch' });

        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 5000);
        let out = '';
        try {
            if (process.env.GOOGLE_TRANSLATE_API_KEY) {
                const resp = await fetch('https://translation.googleapis.com/language/translate/v2?key=' + encodeURIComponent(process.env.GOOGLE_TRANSLATE_API_KEY), {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
                    body: JSON.stringify({ q: text, target, format: 'text' })
                });
                if (!resp.ok) throw new Error('upstream ' + resp.status);
                const data = await resp.json();
                out = data && data.data && data.data.translations && data.data.translations[0] && data.data.translations[0].translatedText || '';
            } else {
                const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&dt=t&tl=' + encodeURIComponent(target) + '&q=' + encodeURIComponent(text);
                const resp = await fetch(url, { signal: ctrl.signal });
                if (!resp.ok) throw new Error('upstream ' + resp.status);
                const data = await resp.json();
                out = Array.isArray(data && data[0]) ? data[0].map(x => x && x[0] || '').join('') : '';
            }
        } finally { clearTimeout(timer); }
        if (typeof out !== 'string' || !out || out.length > 4000) return res.status(502).json({ error: 'empty' });
        res.setHeader('Cache-Control', 'no-store');
        res.json({ text: out });
    } catch (err) {
        console.error('[ERR] translate upstream request failed');
        res.status(502).json({ error: 'upstream' });
    }
});
setInterval(() => { const n = Date.now(); for (const [k, v] of translateRate) if (n - v.t > 120000) translateRate.delete(k); }, 120000).unref();

// STUN + TURN
app.get('/api/ice', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const iceServers = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
    if (process.env.TURN_URLS && process.env.TURN_SHARED_SECRET) {
        const username = `${Math.floor(Date.now() / 1000) + 600}:${crypto.randomBytes(12).toString('hex')}`;
        iceServers.push({
            urls: process.env.TURN_URLS.split(',').map(x => x.trim()).filter(x => /^turns?:[^\s]+$/.test(x)),
            username,
            credential: crypto.createHmac('sha1', process.env.TURN_SHARED_SECRET).update(username).digest('base64')
        });
    }
    res.json({ iceServers });
});

app.get('/healthz', (req, res) => res.json({ ok: true, online: activeUsers.size }));

app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    let decoded;
    try { decoded = decodeURIComponent(req.path); } catch (_) { return res.status(400).end(); }
    if (decoded.split('/').some(x => x.startsWith('.')) || BLOCKED.test(decoded) || BLOCKED_ANYWHERE.test(decoded)
        || !/\.(html|js|css|png|jpg|jpeg|webp|svg|ico|wav|webmanifest|txt|xml)$/i.test(decoded) && decoded !== '/') return res.status(404).end();
    next();
});
app.use(express.static(STATIC_ROOT, {
    index: 'index.html',
    dotfiles: 'ignore',
    setHeaders(res, filePath) {
        const ext = path.extname(filePath).toLowerCase();
        if (ext === '.html') res.setHeader('Cache-Control', 'no-cache');
        else if (ext === '.js' || ext === '.css') res.setHeader('Cache-Control', 'public, max-age=3600');
        else res.setHeader('Cache-Control', 'public, max-age=604800');
    }
}));

// ---------------------------------------------------------------- Socket.io
const io = new Server(server, {
    maxHttpBufferSize: 24 * 1024,
    perMessageDeflate: false,
    connectTimeout: 10000,
    cors: { origin: ALLOWED_ORIGINS, methods: ['GET', 'POST'] },
    allowRequest(req, cb) {
        const origin = req.headers.origin;
        const ip = security.rateKey(security.clientIp(req.headers, req.socket.remoteAddress));
        cb(null, security.originAllowed(origin) && security.rates.take('handshake:' + ip, 15, 30)
            && io.engine.clientsCount < 2000);
    }
});
io.engine.use((req, res, next) => {
    security.headers(req, res, publicDir);
    if (!security.originAllowed(req.headers.origin)) { res.writeHead(403); res.end(); return; }
    const ip = security.rateKey(security.clientIp(req.headers, req.socket.remoteAddress));
    if (!security.rates.take('engine:' + ip, 120, 1200)) { res.writeHead(429, { 'Retry-After': '60' }); res.end(); return; }
    next();
});

// ---------------------------------------------------------------- الحالة (في الذاكرة)
const activeUsers = new Map();
let waitingQueue = [];
const savedRooms = new Map();
const fallbackTimers = new Map();
const ipConnections = new Map();
const reportsByHash = new Map();
const bans = new Map();
const reportLog = [];

setInterval(() => {
    const now = Date.now();
    for (const [id, r] of savedRooms) if (now - r.createdAt > ROOM_EXPIRY) savedRooms.delete(id);
    for (const [h, until] of bans) if (until < now) bans.delete(h);
    for (const [h, m] of reportsByHash) {
        for (const [rep, t] of m) if (now - t > REPORT_WINDOW_MS) m.delete(rep);
        if (!m.size) reportsByHash.delete(h);
    }
}, 60 * 1000).unref();
// عداد المتصلين الذكي: يتحرك بنعومة بين 2000 و 6000 + أول رقم على اليمين يمثل العدد الحقيقي
let fakeBaseTens = 240 + Math.floor(Math.random() * 200); // يبدأ بين 2400 و 4400
function getDisplayOnlineCount() {
    const real = activeUsers.size;
    return (fakeBaseTens * 10) + real;
}

setInterval(() => {
    const step = (Math.floor(Math.random() * 5) - 2); // يتحرك -20 أو -10 أو 0 أو +10 أو +20
    fakeBaseTens = Math.min(595, Math.max(201, fakeBaseTens + step));
    io.emit('online-count', getDisplayOnlineCount());
}, 5000).unref();

// ---------------------------------------------------------------- أدوات مساعدة
function ipFromHeaders(h, address) {
    return security.clientIp(h, address);
}

function getClientIp(socket) {
    return ipFromHeaders(socket.handshake.headers, socket.handshake.address);
}

function hashIp(ip) {
    return crypto.createHmac('sha256', IP_HASH_SALT).update(ip).digest('hex').slice(0, 16);
}

function lookupCountry(ip) {
    if ((ip === '127.0.0.1' || ip === '::1' || ip === 'unknown') && DEV_COUNTRY) return DEV_COUNTRY;
    try {
        const geo = geoip.lookup(ip);
        return geo && /^[A-Z]{2}$/.test(geo.country) ? geo.country : 'unknown';
    } catch (e) { return 'unknown'; }
}

const publicCountry = c => (c && c !== 'unknown' ? c : 'global');

function allow(socket, key, max, windowMs) {
    const now = Date.now();
    const rl = socket.data.rl || (socket.data.rl = {});
    const e = rl[key] || (rl[key] = { c: 0, t: now });
    if (now - e.t > windowMs) { e.c = 0; e.t = now; }
    e.c++;
    if (e.c > max) {
        socket.data.violations = (socket.data.violations || 0) + 1;
        if (socket.data.violations >= LIMITS.MAX_VIOLATIONS) socket.disconnect(true);
        return false;
    }
    return true;
}

function on(socket, event, limit, handler) {
    socket.on(event, (...args) => {
        try {
            if (limit && !allow(socket, event, limit[0], limit[1])) return;
            handler(...args);
        } catch (err) {
            console.error(`[ERR] event=${event}`, err && err.message);
        }
    });
}

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);

function cleanInterests(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const item of raw) {
        if (typeof item !== 'string') continue;
        const v = item.trim().toLowerCase().slice(0, LIMITS.MAX_INTEREST_LEN);
        if (v && !out.includes(v)) out.push(v);
        if (out.length >= LIMITS.MAX_INTERESTS) break;
    }
    return out;
}

function cleanSearchData(data) {
    if (!isObj(data)) data = {};
    const mode = data.mode === 'video' ? 'video' : 'text';
    const country = typeof data.country === 'string' && /^[A-Z]{2}$/.test(data.country) ? data.country : 'global';
    return { mode, country, interests: cleanInterests(data.interests), locale: aiPersonas.language(data.locale) };
}

const accepts = (wanted, otherActual) => wanted === 'global' || wanted === otherActual;
const mutualCountry = (a, b) =>
    accepts(a.searchCountry, b.actualCountry) && accepts(b.searchCountry, a.actualCountry);

function removeFromQueue(id) { waitingQueue = waitingQueue.filter(u => u.id !== id); }

function clearFallback(id) {
    const t = fallbackTimers.get(id);
    if (t) { clearTimeout(t); fallbackTimers.delete(id); }
}

// ---------------------------------------------------------------- AI session orchestration (private modules)
const aiChat = require('./ai-chat');
const aiPersonas = require('./ai-personas');
const cleanKey = value => String(value || '').trim().replace(/^["']|["']$/g, '').trim();
const AI_TEXT_WAIT_MS = () => Math.min(30000, Math.max(1000, Number(process.env.AI_WAIT_MS) || 6000));
const VIDEO_PROMPT_WAIT_MS = 10000;
const AI_SESSION_MS = 20 * 60 * 1000;
const aiSessions = new Map();
const videoPromptTimers = new Map();
const aiEngine = aiChat.createEngine({ allowRequest: () => security.rates.take('ai:global', 20, 60) });

const AI_HEALTH_TOKEN = cleanKey(process.env.AI_HEALTH_TOKEN);
function healthTokenOk(req) {
    if (!AI_HEALTH_TOKEN) return false;
    const given = String(req.headers['x-health-token'] || '');
    return crypto.timingSafeEqual(crypto.createHash('sha256').update(given).digest(), crypto.createHash('sha256').update(AI_HEALTH_TOKEN).digest());
}
app.get('/api/ai-health', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!healthTokenOk(req)) return res.status(404).end();
    // Configuration status only. No billable diagnostic requests or key lengths.
    res.json({ configured: aiEngine.configured, providers: aiEngine.providerStatus() });
});

function addAiTimer(session, fn, ms, reply = false) {
    const timer = setTimeout(() => {
        session.timers.delete(timer); session.replyTimers.delete(timer);
        if (session.closed) return;
        Promise.resolve().then(fn).catch(() => {});
    }, ms);
    session.timers.add(timer);
    if (reply) session.replyTimers.add(timer);
    return timer;
}
function clearReplyTimers(socket, session) {
    for (const timer of session.replyTimers) { clearTimeout(timer); session.timers.delete(timer); }
    session.replyTimers.clear();
    if (session.controller) session.controller.abort();
    socket.emit('hide-typing');
}
function clearAiSession(socketId) {
    const session = aiSessions.get(socketId);
    if (session) { aiChat.closeSession(session); aiSessions.delete(socketId); }
    const timer = videoPromptTimers.get(socketId);
    if (timer) { clearTimeout(timer); videoPromptTimers.delete(socketId); }
}
function aiSessionCurrent(socket, session) {
    return socket.connected && !session.closed && aiSessions.get(socket.id) === session
        && activeUsers.get(socket.id)?.peer === 'AI_BOT';
}
function sendAiText(socket, session, fullText) {
    let reply = aiChat.sanitizeReply(fullText);
    if (!reply || !aiSessionCurrent(socket, session)) return;
    const identity = aiChat.COPY[session.language][0];
    if (!session.disclosed && !reply.startsWith(identity)) reply = aiChat.sanitizeReply(identity + ' ' + reply);
    const revision = session.revision;
    socket.emit('display-typing');
    addAiTimer(session, () => {
        if (!aiSessionCurrent(socket, session) || session.revision !== revision) return;
        if (!aiChat.commitReply(session, reply, revision)) return;
        session.disclosed = true;
        socket.emit('hide-typing');
        const user = activeUsers.get(socket.id);
        socket.emit('receive-message', { text: reply, roomId: user.room, matchId: user.matchId, partnerType: 'ai' });
    }, Math.min(1800, 180 + reply.length * 10), true);
}
function scheduleAiReply(socket, session) {
    const revision = session.revision;
    socket.emit('display-typing');
    addAiTimer(session, async () => {
        if (!aiSessionCurrent(socket, session) || revision !== session.revision) return;
        let reply;
        try { reply = await aiEngine.generate(session); }
        catch (_) { reply = aiChat.COPY[session.language][2]; }
        if (!aiSessionCurrent(socket, session) || revision !== session.revision) return;
        if (reply) sendAiText(socket, session, reply);
        else socket.emit('hide-typing');
    }, 200, true);
}
function botLeave(socket, session) {
    if (!aiSessionCurrent(socket, session)) return;
    clearAiSession(socket.id);
    const user = activeUsers.get(socket.id);
    user.peer = null; user.room = null; user.matchId = null; user.xoRole = null;
    socket.emit('hide-typing'); socket.emit('peer-disconnected');
}
function pairWithAi(socket, prefs) {
    const user = activeUsers.get(socket.id);
    if (!socket.connected || !user) return;
    removeFromQueue(socket.id); clearFallback(socket.id); clearAiSession(socket.id);
    const persona = aiPersonas.createPersona({ preferredCountry: prefs.country, actualCountry: user.actualCountry, locale: user.locale || prefs.locale, interests: prefs.interests });
    user.room = 'room_' + crypto.randomUUID(); user.matchId = crypto.randomUUID(); user.peer = 'AI_BOT'; user.xoRole = 'X'; user.mode = 'text';
    const session = aiChat.createSession(persona);
    session.isArab = persona.language === 'ar';
    aiSessions.set(socket.id, session);
    socket.emit('matched', { isInitiator: false, xoRole: 'X', roomId: user.room, matchId: user.matchId,
        partnerType: 'ai', partnerName: persona.name, partnerCountry: publicCountry(persona.country), countryKind: 'fictional' });
    sendAiText(socket, session, aiChat.COPY[session.language][1]);
    addAiTimer(session, () => botLeave(socket, session), AI_SESSION_MS);
}

const XO_LINES = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
];
function checkXoWinner(b) {
    for (const [a, c, d] of XO_LINES) {
        if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
    }
    return b.every(Boolean) ? 'draw' : null;
}
function pickSmartXoMove(b) {
    const empty = b.map((v, i) => v === '' ? i : -1).filter(i => i !== -1);
    if (!empty.length) return -1;
    for (const i of empty) { b[i] = 'O'; if (checkXoWinner(b) === 'O') { b[i] = ''; return i; } b[i] = ''; }
    if (Math.random() < 0.8) {
        for (const i of empty) { b[i] = 'X'; if (checkXoWinner(b) === 'X') { b[i] = ''; return i; } b[i] = ''; }
    }
    if (b[4] === '' && Math.random() < 0.7) return 4;
    return empty[Math.floor(Math.random() * empty.length)];
}
// ================================================================ نهاية محرك الذكاء الاصطناعي

function detach(socket) {
    clearFallback(socket.id);
    clearAiSession(socket.id);
    removeFromQueue(socket.id);
    const user = activeUsers.get(socket.id);
    if (!user) return;
    if (user.peer) {
        if (user.peer !== 'AI_BOT') {
            io.to(user.peer).emit('peer-disconnected');
            const peerUser = activeUsers.get(user.peer);
            if (peerUser) {
                const peerSocket = io.sockets.sockets.get(user.peer);
                if (peerSocket && peerUser.room) peerSocket.leave(peerUser.room);
                peerUser.peer = null; peerUser.room = null; peerUser.matchId = null; peerUser.xoRole = null;
            }
        }
        user.peer = null;
    }
    if (user.room) { socket.leave(user.room); user.room = null; }
    user.xoRole = null;
    user.matchId = null;
}

function pair(socketA, socketB, roomId, mode) {
    clearAiSession(socketA.id);
    clearAiSession(socketB.id);
    const a = activeUsers.get(socketA.id);
    const b = activeUsers.get(socketB.id);
    socketA.join(roomId);
    socketB.join(roomId);
    a.room = b.room = roomId;
    a.peer = socketB.id;
    b.peer = socketA.id;
    a.xoRole = 'X';
    b.xoRole = 'O';
    mode = mode || savedRooms.get(roomId)?.mode || 'text';
    a.mode = b.mode = mode;
    a.matchId = b.matchId = crypto.randomUUID();
    a.initiator = true; b.initiator = false;
    a.offerSent = b.offerSent = a.answerSent = b.answerSent = false;
    if (mode && savedRooms.size < 20000 && !savedRooms.has(roomId)) savedRooms.set(roomId, { createdAt: Date.now(), mode });
    mod.onPair(socketA, socketB, mode);
    socketA.emit('matched', { isInitiator: true, xoRole: 'X', roomId, matchId: a.matchId, partnerType: 'human', partnerCountry: publicCountry(b.actualCountry) });
    socketB.emit('matched', { isInitiator: false, xoRole: 'O', roomId, matchId: b.matchId, partnerType: 'human', partnerCountry: publicCountry(a.actualCountry) });
}

function tryMatch(socket, prefs) {
    removeFromQueue(socket.id);
    const me = activeUsers.get(socket.id);
    if (!me) return false;
    const meView = { searchCountry: prefs.country, actualCountry: me.actualCountry };
    const compatible = u => u.id !== socket.id && u.mode === prefs.mode && mutualCountry(meView, u);

    for (let guard = 0; guard < 50; guard++) {
        let idx = -1;
        if (prefs.interests.length) {
            idx = waitingQueue.findIndex(u => compatible(u) && u.interests.some(i => prefs.interests.includes(i)));
        }
        if (idx === -1) idx = waitingQueue.findIndex(compatible);
        if (idx === -1) break;

        const peerData = waitingQueue.splice(idx, 1)[0];
        const peerSocket = io.sockets.sockets.get(peerData.id);
        if (!peerSocket || !activeUsers.has(peerData.id)) continue;

        clearFallback(peerData.id);
        clearAiSession(peerData.id);
        pair(socket, peerSocket, `room_${crypto.randomUUID()}`, prefs.mode);
        return true;
    }

    waitingQueue.push({
        id: socket.id, interests: prefs.interests, mode: prefs.mode,
        searchCountry: prefs.country, actualCountry: me.actualCountry
    });
    return false;
}

function registerReport(reporterId, reason) {
    const reporter = activeUsers.get(reporterId);
    if (!reporter || !reporter.peer) return false;
    if (reporter.peer === 'AI_BOT') return true;
    const reported = activeUsers.get(reporter.peer);
    if (!reported) return false;

    const now = Date.now();
    reportLog.push({ t: now, reason, reporter: reporter.ipHash, reported: reported.ipHash });
    if (reportLog.length > 500) reportLog.shift();
    console.log('[REPORT]', JSON.stringify({ reason, reporter: reporter.ipHash, reported: reported.ipHash }));

    const m = reportsByHash.get(reported.ipHash) || new Map();
    m.set(reporter.ipHash, now);
    reportsByHash.set(reported.ipHash, m);
    const recent = [...m.values()].filter(t => now - t <= REPORT_WINDOW_MS).length;
    if (recent >= REPORT_THRESHOLD) {
        bans.set(reported.ipHash, now + BAN_MS);
        reportsByHash.delete(reported.ipHash);
        const target = io.sockets.sockets.get(reporter.peer);
        if (target) { target.emit('banned', { until: now + BAN_MS }); detach(target); }
        console.log('[BAN]', reported.ipHash, 'until', new Date(now + BAN_MS).toISOString());
    }
    return true;
}

// ---------------------------------------------------------------- الاتصالات
io.use((socket, next) => {
    const ip = getClientIp(socket);
    if ((ipConnections.get(security.rateKey(ip)) || 0) >= LIMITS.MAX_CONN_PER_IP) return next(new Error('too_many_connections'));
    socket.data.ip = ip;
    next();
});

io.on('connection', (socket) => {
    const ip = security.rateKey(socket.data.ip);
    if ((ipConnections.get(ip) || 0) >= LIMITS.MAX_CONN_PER_IP) return socket.disconnect(true);
    ipConnections.set(ip, (ipConnections.get(ip) || 0) + 1);

    const ipHash = hashIp(ip);
    activeUsers.set(socket.id, {
        room: null, peer: null, actualCountry: lookupCountry(socket.data.ip), ipHash, xoRole: null
    });
    socket.emit('online-count', getDisplayOnlineCount());

    // Validate and throttle before moderation, its queue and its text filter.
    socket.use((packet, next) => {
        const valid = security.rates.take('events:' + ip, 240, 1200)
            && allow(socket, 'all-packets', 400, 60000) && security.validPacket(packet);
        if (!valid) {
            socket.data.badPackets = (socket.data.badPackets || 0) + 1;
            if (socket.data.badPackets >= 8) socket.disconnect(true);
            return;
        }
        if ((bans.get(ipHash) || 0) > Date.now() && packet[0] !== 'leave-room') return;
        if (['find-match', 'create-room', 'join-saved-room'].includes(packet[0]) && !security.rates.take('matches:' + ip, 15, 30)) return;
        if (packet[0] === 'send-message' && !security.rates.take('messages:' + ip, 12, 60)) return;
        next();
    });
    mod.attach(socket, { io, activeUsers, detach });

    const isBanned = () => (bans.get(ipHash) || 0) > Date.now();

    on(socket, 'find-match', [8, 10000], (data) => {
        if (isBanned()) return socket.emit('banned', { until: bans.get(ipHash) });
        const prefs = cleanSearchData(data);
        if (data.locale) activeUsers.get(socket.id).locale = prefs.locale;
        detach(socket);
        const matched = tryMatch(socket, prefs);

        if (!matched) {
            if (prefs.mode === 'text') {
                const timer = setTimeout(() => {
                    fallbackTimers.delete(socket.id);
                    if (!waitingQueue.some(u => u.id === socket.id)) return;
                    pairWithAi(socket, prefs);
                }, AI_TEXT_WAIT_MS());
                fallbackTimers.set(socket.id, timer);
            } else {
                if (prefs.country !== 'global') {
                    const timer = setTimeout(() => {
                        fallbackTimers.delete(socket.id);
                        if (!waitingQueue.some(u => u.id === socket.id)) return;
                        removeFromQueue(socket.id);
                        socket.emit('no-country-match');
                        tryMatch(socket, { ...prefs, country: 'global' });
                    }, COUNTRY_FALLBACK_MS);
                    fallbackTimers.set(socket.id, timer);
                }
                const vTimer = setTimeout(() => {
                    videoPromptTimers.delete(socket.id);
                    if (waitingQueue.some(u => u.id === socket.id && u.mode === 'video')) {
                        socket.emit('video-wait-prompt');
                    }
                }, VIDEO_PROMPT_WAIT_MS);
                videoPromptTimers.set(socket.id, vTimer);
            }
        }
    });

    on(socket, 'join-saved-room', [5, 10000], (data) => {
        if (isBanned()) return socket.emit('banned', { until: bans.get(ipHash) });
        const roomId = isObj(data) && typeof data.roomId === 'string' ? data.roomId : '';
        if (!/^room_[A-Za-z0-9_-]{8,64}$/.test(roomId) || !savedRooms.has(roomId)) {
            return socket.emit('room-not-found');
        }
        detach(socket);
        const members = io.sockets.adapter.rooms.get(roomId);
        if (members && members.size >= 2) return socket.emit('room-not-found');

        socket.join(roomId);
        const me = activeUsers.get(socket.id);
        me.room = roomId;

        const after = io.sockets.adapter.rooms.get(roomId);
        if (after && after.size === 2) {
            const peerId = [...after].find(id => id !== socket.id);
            const peerSocket = peerId && io.sockets.sockets.get(peerId);
            if (peerSocket && activeUsers.has(peerId)) pair(socket, peerSocket, roomId, null);
        }
    });

    on(socket, 'create-room', [5, 60000], (data) => {
        if (isBanned()) return socket.emit('banned', { until: bans.get(ipHash) });
        if (savedRooms.size >= 20000) return;
        const mode = isObj(data) && data.mode === 'video' ? 'video' : 'text';
        detach(socket);
        const roomId = `room_${crypto.randomUUID()}`;
        savedRooms.set(roomId, { createdAt: Date.now(), mode });
        socket.join(roomId);
        activeUsers.get(socket.id).room = roomId;
        socket.emit('room-created', { roomId });
    });

    on(socket, 'signal', [300, 10000], (data) => {
        const user = activeUsers.get(socket.id);
        if (!user || !user.peer || user.peer === 'AI_BOT' || !isObj(data)) return;
        const peer = activeUsers.get(user.peer);
        if (user.mode !== 'video' || !peer || peer.peer !== socket.id || peer.room !== user.room
            || data.roomId !== user.room || data.matchId !== user.matchId || peer.matchId !== user.matchId) return;
        if (data.offer) {
            if (!user.initiator || user.offerSent) return;
            user.offerSent = true;
        }
        if (data.answer) {
            if (user.initiator || !peer.offerSent || user.answerSent) return;
            user.answerSent = true;
        }
        const out = { roomId: user.room, matchId: user.matchId };
        for (const k of ['offer', 'answer', 'candidate']) if (data[k]) out[k] = data[k];
        io.to(user.peer).emit('signal', out);
    });

    on(socket, 'send-message', [10, 5000], (data) => {
        const user = activeUsers.get(socket.id);
        if (!user || !user.peer || !isObj(data) || typeof data.text !== 'string') return;
        const text = data.text.trim();
        if (!text) return;

        if (user.peer === 'AI_BOT') {
            const session = aiSessions.get(socket.id);
            if (!session) return;
            clearReplyTimers(socket, session);
            if (!aiChat.startTurn(session, text)) return;
            session.isArab = session.language === 'ar';
            scheduleAiReply(socket, session);
            return;
        }

        io.to(user.peer).emit('receive-message', { text });
    });

    on(socket, 'typing', [20, 5000], () => {
        const user = activeUsers.get(socket.id);
        if (user && user.peer && user.peer !== 'AI_BOT') io.to(user.peer).emit('display-typing');
    });

    on(socket, 'chat-language', [8, 10000], (data) => {
        const user = activeUsers.get(socket.id);
        if (!user) return;
        user.locale = data.locale;
        const session = aiSessions.get(socket.id);
        if (!session || session.language === data.locale) return;
        const pending = session.replyTimers.size > 0 || !!session.controller;
        clearReplyTimers(socket, session);
        session.language = data.locale; session.isArab = data.locale === 'ar'; session.revision++;
        if (pending && session.history.at(-1)?.role === 'user') scheduleAiReply(socket, session);
    });

    on(socket, 'stop-typing', [20, 5000], () => {
        const user = activeUsers.get(socket.id);
        if (user && user.peer && user.peer !== 'AI_BOT') io.to(user.peer).emit('hide-typing');
    });

    on(socket, 'xo-move', [20, 10000], (data) => {
        const user = activeUsers.get(socket.id);
        if (!user || !user.peer || !user.xoRole || !isObj(data)) return;
        const index = data.index;
        if (!Number.isInteger(index) || index < 0 || index > 8) return;

        if (user.peer === 'AI_BOT') {
            const session = aiSessions.get(socket.id);
            if (!session) return;
            if (session.xoPending) return;
            if (checkXoWinner(session.xoBoard)) session.xoBoard = Array(9).fill('');
            if (session.xoBoard[index] !== '') return;

            session.xoBoard[index] = 'X';
            const winAfterUser = checkXoWinner(session.xoBoard);
            if (winAfterUser) {
                sendAiText(socket, session, aiChat.gameReply(session, winAfterUser));
                session.xoBoard = Array(9).fill('');
                return;
            }

            session.xoPending = true;
            addAiTimer(session, () => {
                if (!aiSessions.has(socket.id)) return;
                session.xoPending = false;
                const aiIdx = pickSmartXoMove(session.xoBoard);
                if (aiIdx === -1) return;
                session.xoBoard[aiIdx] = 'O';
                socket.emit('xo-receive-move', { index: aiIdx, symbol: 'O' });

                const winAfterAi = checkXoWinner(session.xoBoard);
                if (winAfterAi) {
                    sendAiText(socket, session, aiChat.gameReply(session, winAfterAi));
                    session.xoBoard = Array(9).fill('');
                }
            }, 1200 + Math.floor(Math.random() * 700));
            return;
        }

        io.to(user.peer).emit('xo-receive-move', { index, symbol: user.xoRole });
    });

    on(socket, 'submit-report', [3, 60000], (data) => {
        const reason = isObj(data) && typeof data.reason === 'string' ? data.reason.slice(0, 200) : 'unspecified';
        if (registerReport(socket.id, reason)) socket.emit('report-received');
    });

    on(socket, 'leave-room', [10, 10000], () => detach(socket));

    socket.on('disconnect', () => {
        try {
            detach(socket);
            activeUsers.delete(socket.id);
            const n = (ipConnections.get(ip) || 1) - 1;
            if (n <= 0) ipConnections.delete(ip); else ipConnections.set(ip, n);
        } catch (err) { console.error('[ERR] disconnect', err && err.message); }
    });
});

// ---------------------------------------------------------------- شبكة الأمان
app.use((req, res) => res.status(404).type('text').send('Not found'));
app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = err.type === 'entity.too.large' ? 413 : (err instanceof SyntaxError || err.status === 400 ? 400 : 500);
    res.status(status).json({ error: status === 500 ? 'internal_error' : 'invalid_request' });
});
process.on('unhandledRejection', (r) => console.error('[unhandledRejection]', r));
process.on('uncaughtException', (err) => {
    console.error('[uncaughtException]', err);
    if (process.env.EXIT_ON_UNCAUGHT === 'true') process.exit(1);
});

function shutdown() {
    console.log('Shutting down...');
    io.close(() => server.close(() => process.exit(0)));
    setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

const onListen = () => console.log(`Server is running on ${PORT}`);
if (Number.isNaN(Number(PORT))) server.listen(PORT, onListen);
else server.listen(Number(PORT), '0.0.0.0', onListen);
