'use strict';
/**
 * Randly server — Phase 1 (hardened)
 * - فحص مدخلات كل الأحداث + try/catch (رسالة فاضية ما توقعش السيرفر)
 * - ملفات عامة من public/ (أو fallback آمن لو لسه ماتنقلتش)
 * - فلتر دولة بتطابق متبادل
 * - تنظيف الطرف القديم عند التخطي
 * - Rate limiting + حد اتصالات لكل IP
 * - بلاغات حقيقية + حظر مؤقت
 */
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { Server } = require('socket.io');
const geoip = require('geoip-lite');

const app = express();
const server = http.createServer(app);

// ---------------------------------------------------------------- الإعدادات
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ||
    'https://randly.live,https://www.randly.live')
    .split(',').map(s => s.trim()).filter(Boolean);
if (!IS_PROD) ALLOWED_ORIGINS.push('http://localhost:' + PORT, 'http://127.0.0.1:' + PORT);

const LIMITS = {
    MAX_MSG_LEN: 500,
    MAX_INTERESTS: 10,
    MAX_INTEREST_LEN: 30,
    MAX_CONN_PER_IP: 15,
    MAX_SIGNAL_BYTES: 20 * 1024,
    MAX_VIOLATIONS: 8           // بعدها السوكيت يتفصل
};
const COUNTRY_FALLBACK_MS = 10000;                 // Smart Match
const ROOM_EXPIRY = 72 * 60 * 60 * 1000;           // الغرف المحفوظة
const REPORT_THRESHOLD = Number(process.env.REPORT_THRESHOLD || 3);   // عدد مبلّغين مختلفين
const REPORT_WINDOW_MS = 60 * 60 * 1000;
const BAN_MS = Number(process.env.BAN_MINUTES || 15) * 60 * 1000;
const IP_HASH_SALT = process.env.IP_HASH_SALT || crypto.randomBytes(16).toString('hex');
const DEV_COUNTRY = process.env.DEV_COUNTRY || null; // للتجربة المحلية فقط، مثال: DEV_COUNTRY=EG

// ---------------------------------------------------------------- Express
app.disable('x-powered-by');

app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
    next();
});

// منع نشر ملفات السيرفر حتى لو لسه الملفات في نفس المجلد
const BLOCKED = /^\/(server\.js|package(-lock)?\.json|node_modules|tools|\.env|\.git|.*\.bak)(\/|$)/i;
app.use((req, res, next) => (BLOCKED.test(req.path) ? res.status(404).end() : next()));

const publicDir = path.join(__dirname, 'public');
const STATIC_ROOT = fs.existsSync(publicDir) ? publicDir : __dirname;
if (STATIC_ROOT === __dirname) {
    console.warn('[WARN] مجلد public/ غير موجود — بنخدم من الجذر مع حظر ملفات السيرفر. انقل الملفات العامة لـ public/.');
}

// STUN + TURN (من متغيرات البيئة: TURN_URLS="turn:host:3478,turns:host:5349" TURN_USERNAME TURN_CREDENTIAL)
app.get('/api/ice', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const iceServers = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
    if (process.env.TURN_URLS && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
        iceServers.push({
            urls: process.env.TURN_URLS.split(',').map(x => x.trim()).filter(Boolean),
            username: process.env.TURN_USERNAME,
            credential: process.env.TURN_CREDENTIAL
        });
    }
    res.json({ iceServers });
});

app.get('/healthz', (req, res) => res.json({ ok: true, online: activeUsers.size }));

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
    maxHttpBufferSize: 64 * 1024,
    cors: { origin: ALLOWED_ORIGINS, methods: ['GET', 'POST'] },
    // WebSocket لا يخضع لـ CORS في المتصفح، فنفحص Origin بإيدينا
    allowRequest(req, cb) {
        const origin = req.headers.origin;
        cb(null, !origin || ALLOWED_ORIGINS.includes(origin));
    }
});

// ---------------------------------------------------------------- الحالة (في الذاكرة)
const activeUsers = new Map();      // socketId -> {room, peer, actualCountry, ipHash, xoRole}
let waitingQueue = [];              // {id, interests, mode, searchCountry, actualCountry}
const savedRooms = new Map();       // roomId -> {createdAt, mode}
const fallbackTimers = new Map();   // socketId -> timeout
const ipConnections = new Map();    // ip -> عدد الاتصالات
const reportsByHash = new Map();    // reportedHash -> Map(reporterHash -> time)
const bans = new Map();             // ipHash -> bannedUntil
const reportLog = [];               // آخر 500 بلاغ

setInterval(() => {
    const now = Date.now();
    for (const [id, r] of savedRooms) if (now - r.createdAt > ROOM_EXPIRY) savedRooms.delete(id);
    for (const [h, until] of bans) if (until < now) bans.delete(h);
    for (const [h, m] of reportsByHash) {
        for (const [rep, t] of m) if (now - t > REPORT_WINDOW_MS) m.delete(rep);
        if (!m.size) reportsByHash.delete(h);
    }
}, 60 * 1000).unref();

// عداد المتصلين: كل 5 ثواني وبس لو اتغير (بدل بث عند كل اتصال/انقطاع)
let lastBroadcastCount = -1;
setInterval(() => {
    if (activeUsers.size !== lastBroadcastCount) {
        lastBroadcastCount = activeUsers.size;
        io.emit('online-count', lastBroadcastCount);
    }
}, 5000).unref();

// ---------------------------------------------------------------- أدوات مساعدة
// مصدر الـ IP:
//  - BEHIND_CLOUDFLARE=true  -> نثق في cf-connecting-ip
//  - غير كده (مثلاً Azure App Service لوحده) -> نثق في "آخر" عنوان في X-Forwarded-For
//    (الأول قابل للتزوير من أي مستخدم، الأخير هو اللي أضافه Azure)
const BEHIND_CLOUDFLARE = process.env.BEHIND_CLOUDFLARE === 'true';
const TRUSTED_HOPS = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS || 1)); // عدد البروكسيات الموثوقة قدام السيرفر
let warnedCf = false;

function normalizeIp(raw) {
    let ip = String(raw || '').trim();
    if (ip.startsWith('::ffff:')) ip = ip.slice(7);
    const bracketed = ip.match(/^\[([^\]]+)\](?::\d+)?$/);          // [::1]:1234
    if (bracketed) return bracketed[1];
    const withPort = ip.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);   // 1.2.3.4:5678 (Azure بيضيف البورت)
    return withPort ? withPort[1] : ip;
}

function getClientIp(socket) {
    const h = socket.handshake.headers;
    if (BEHIND_CLOUDFLARE && h['cf-connecting-ip']) return normalizeIp(h['cf-connecting-ip']) || 'unknown';
    if (!BEHIND_CLOUDFLARE && h['cf-connecting-ip'] && !warnedCf) {
        warnedCf = true;
        console.warn('[WARN] وصل هيدر cf-connecting-ip لكن BEHIND_CLOUDFLARE مش true. لو أنت فعلاً خلف Cloudflare فعّله، وإلا هيتحسب كل الزوار كأنهم IP واحد.');
    }
    const xff = h['x-forwarded-for'];
    if (xff) {
        const parts = String(xff).split(',').map(normalizeIp).filter(Boolean);
        if (parts.length) return parts[Math.max(0, parts.length - TRUSTED_HOPS)];
    }
    return normalizeIp(h['x-real-ip'] || socket.handshake.address) || 'unknown';
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

// الواجهة بتفهم 'global' بس كقيمة "مش معروف"
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

// غلاف موحّد: rate limit + try/catch لكل حدث
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
    return { mode, country, interests: cleanInterests(data.interests) };
}

// تطابق متبادل: كل طرف لازم يقبل الدولة الفعلية للتاني
const accepts = (wanted, otherActual) => wanted === 'global' || wanted === otherActual;
const mutualCountry = (a, b) =>
    accepts(a.searchCountry, b.actualCountry) && accepts(b.searchCountry, a.actualCountry);

function removeFromQueue(id) { waitingQueue = waitingQueue.filter(u => u.id !== id); }

function clearFallback(id) {
    const t = fallbackTimers.get(id);
    if (t) { clearTimeout(t); fallbackTimers.delete(id); }
}

// يفك ارتباط المستخدم بالطرف القديم والغرفة والطابور (من غير ما يشيله من activeUsers)
function detach(socket) {
    clearFallback(socket.id);
    removeFromQueue(socket.id);
    const user = activeUsers.get(socket.id);
    if (!user) return;
    if (user.peer) {
        io.to(user.peer).emit('peer-disconnected');
        const peerUser = activeUsers.get(user.peer);
        if (peerUser) peerUser.peer = null;
        user.peer = null;
    }
    if (user.room) { socket.leave(user.room); user.room = null; }
    user.xoRole = null;
}

function pair(socketA, socketB, roomId, mode) {
    const a = activeUsers.get(socketA.id);
    const b = activeUsers.get(socketB.id);
    socketA.join(roomId);
    socketB.join(roomId);
    a.room = b.room = roomId;
    a.peer = socketB.id;
    b.peer = socketA.id;
    a.xoRole = 'X';
    b.xoRole = 'O';
    if (mode) savedRooms.set(roomId, { createdAt: Date.now(), mode });
    socketA.emit('matched', { isInitiator: true, xoRole: 'X', roomId, partnerCountry: publicCountry(b.actualCountry) });
    socketB.emit('matched', { isInitiator: false, xoRole: 'O', roomId, partnerCountry: publicCountry(a.actualCountry) });
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
        if (!peerSocket || !activeUsers.has(peerData.id)) continue;  // مدخل قديم، جرّب اللي بعده

        clearFallback(peerData.id);
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
    if (!reporter || !reporter.peer) return;
    const reported = activeUsers.get(reporter.peer);
    if (!reported) return;

    const now = Date.now();
    reportLog.push({ t: now, reason, reporter: reporter.ipHash, reported: reported.ipHash });
    if (reportLog.length > 500) reportLog.shift();
    console.log('[REPORT]', JSON.stringify({ reason, reporter: reporter.ipHash, reported: reported.ipHash }));

    const m = reportsByHash.get(reported.ipHash) || new Map();
    m.set(reporter.ipHash, now);                      // مبلّغ واحد = بلاغ واحد
    reportsByHash.set(reported.ipHash, m);
    const recent = [...m.values()].filter(t => now - t <= REPORT_WINDOW_MS).length;
    if (recent >= REPORT_THRESHOLD) {
        bans.set(reported.ipHash, now + BAN_MS);
        reportsByHash.delete(reported.ipHash);
        const target = io.sockets.sockets.get(reporter.peer);
        if (target) { target.emit('banned', { until: now + BAN_MS }); detach(target); }
        console.log('[BAN]', reported.ipHash, 'until', new Date(now + BAN_MS).toISOString());
    }
}

// ---------------------------------------------------------------- الاتصالات
io.use((socket, next) => {
    const ip = getClientIp(socket);
    if ((ipConnections.get(ip) || 0) >= LIMITS.MAX_CONN_PER_IP) return next(new Error('too_many_connections'));
    socket.data.ip = ip;
    next();
});

io.on('connection', (socket) => {
    const ip = socket.data.ip;
    ipConnections.set(ip, (ipConnections.get(ip) || 0) + 1);

    const ipHash = hashIp(ip);
    activeUsers.set(socket.id, {
        room: null, peer: null, actualCountry: lookupCountry(ip), ipHash, xoRole: null
    });
    socket.emit('online-count', activeUsers.size);

    const isBanned = () => (bans.get(ipHash) || 0) > Date.now();

    on(socket, 'find-match', [8, 10000], (data) => {
        if (isBanned()) return socket.emit('banned', { until: bans.get(ipHash) });
        const prefs = cleanSearchData(data);
        detach(socket);                                   // نفك الطرف القديم الأول
        const matched = tryMatch(socket, prefs);

        if (!matched && prefs.country !== 'global') {
            const timer = setTimeout(() => {
                fallbackTimers.delete(socket.id);
                if (!waitingQueue.some(u => u.id === socket.id)) return;
                removeFromQueue(socket.id);
                socket.emit('no-country-match');
                tryMatch(socket, { ...prefs, country: 'global' });
            }, COUNTRY_FALLBACK_MS);
            fallbackTimers.set(socket.id, timer);
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
        // الغرفة ممتلئة: نستخدم نفس حدث الواجهة الحالي (room-not-found) لحد ما نضيف رسالة مخصصة
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

    // غرفة خاصة جديدة (ميزة "ادعُ صديقك"): المنشئ بيستنى جوه الغرفة لحد ما صاحبه يفتح الرابط
    on(socket, 'create-room', [5, 60000], (data) => {
        if (isBanned()) return socket.emit('banned', { until: bans.get(ipHash) });
        if (savedRooms.size > 20000) return;
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
        if (!user || !user.peer || !isObj(data)) return;
        const out = {};
        for (const k of ['offer', 'answer', 'candidate']) if (isObj(data[k])) out[k] = data[k];
        if (!Object.keys(out).length) return;
        if (JSON.stringify(out).length > LIMITS.MAX_SIGNAL_BYTES) return;
        io.to(user.peer).emit('signal', out);
    });

    on(socket, 'send-message', [10, 5000], (data) => {
        const user = activeUsers.get(socket.id);
        if (!user || !user.peer || !isObj(data) || typeof data.text !== 'string') return;
        const text = data.text.trim().slice(0, LIMITS.MAX_MSG_LEN);
        if (text) io.to(user.peer).emit('receive-message', { text });
    });

    on(socket, 'typing', [20, 5000], () => {
        const user = activeUsers.get(socket.id);
        if (user && user.peer) io.to(user.peer).emit('display-typing');
    });

    on(socket, 'stop-typing', [20, 5000], () => {
        const user = activeUsers.get(socket.id);
        if (user && user.peer) io.to(user.peer).emit('hide-typing');
    });

    on(socket, 'xo-move', [20, 10000], (data) => {
        const user = activeUsers.get(socket.id);
        if (!user || !user.peer || !user.xoRole || !isObj(data)) return;
        const index = data.index;
        if (!Number.isInteger(index) || index < 0 || index > 8) return;
        // الرمز بيجي من السيرفر، مش من العميل
        io.to(user.peer).emit('xo-receive-move', { index, symbol: user.xoRole });
    });

    on(socket, 'submit-report', [3, 60000], (data) => {
        const reason = isObj(data) && typeof data.reason === 'string' ? data.reason.slice(0, 200) : 'unspecified';
        registerReport(socket.id, reason);
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
process.on('unhandledRejection', (r) => console.error('[unhandledRejection]', r));
process.on('uncaughtException', (err) => {
    console.error('[uncaughtException]', err);
    // مع PM2 أو systemd الأفضل إعادة التشغيل: EXIT_ON_UNCAUGHT=true
    if (process.env.EXIT_ON_UNCAUGHT === 'true') process.exit(1);
});

function shutdown() {
    console.log('Shutting down...');
    io.close(() => server.close(() => process.exit(0)));
    setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// على Azure Windows (iisnode) الـ PORT بيبقى اسم pipe مش رقم
const onListen = () => console.log(`Server is running on ${PORT}`);
if (Number.isNaN(Number(PORT))) server.listen(PORT, onListen);
else server.listen(Number(PORT), '0.0.0.0', onListen);