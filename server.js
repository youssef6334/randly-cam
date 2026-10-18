'use strict';
/**
 * Randly server — Phase 1 (hardened) + Raw Human AI Engine (15 Human Behaviors)
 */
const express = require('express');
const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { Server } = require('socket.io');
const geoip = require('geoip-lite');
const mod = require('./moderation');

const app = express();

// ---- ضغط الردود (gzip/brotli) بدون أي حزمة خارجية ----
const zlib = require('zlib');
const COMPRESSIBLE = /^(text\/|application\/(javascript|json|xml|manifest\+json|ld\+json)|image\/svg\+xml)/i;
app.use((req, res, next) => {
    if (req.method === 'HEAD' || req.headers.range || req.path.startsWith('/socket.io')) return next();
    const ae = String(req.headers['accept-encoding'] || '');
    const enc = /\bbr\b/.test(ae) ? 'br' : (/\bgzip\b/.test(ae) ? 'gzip' : null);
    if (!enc) return next();
    const origWrite = res.write, origEnd = res.end;
    let stream = null, decided = false;
    function decide() {
        decided = true;
        const type = String(res.getHeader('Content-Type') || '');
        const len = Number(res.getHeader('Content-Length') || 0);
        if (res.getHeader('Content-Encoding') || res.statusCode === 204 || res.statusCode === 304 ||
            !COMPRESSIBLE.test(type) || (len && len < 1024)) return;
        stream = enc === 'br'
            ? zlib.createBrotliCompress({ params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } })
            : zlib.createGzip({ level: 6 });
        res.setHeader('Content-Encoding', enc);
        res.removeHeader('Content-Length');
        const etag = res.getHeader('ETag');
        if (etag && !/^W\//.test(etag)) res.setHeader('ETag', 'W/' + etag);
        stream.on('data', c => origWrite.call(res, c));
        stream.on('end', () => origEnd.call(res));
    }
    res.setHeader('Vary', 'Accept-Encoding');
    res.write = function (chunk, encoding, cb) {
        if (!decided) decide();
        if (!stream) return origWrite.call(res, chunk, encoding, cb);
        if (chunk) stream.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, typeof encoding === 'string' ? encoding : 'utf8'));
        return true;
    };
    res.end = function (chunk, encoding, cb) {
        if (!decided) {
            if (chunk && !res.headersSent && !res.getHeader('Content-Length')) {
                res.setHeader('Content-Length', Buffer.byteLength(chunk, typeof encoding === 'string' ? encoding : 'utf8'));
            }
            decide();
        }
        if (!stream) return origEnd.call(res, chunk, encoding, cb);
        if (chunk) stream.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, typeof encoding === 'string' ? encoding : 'utf8'));
        stream.end();
        return res;
    };
    next();
});

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
    MAX_CONN_PER_IP: Number(process.env.MAX_CONN_PER_IP || 25),
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

app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
    next();
});

const BLOCKED = /^\/(server\.js|moderation\.js|badwords\.txt|data|package(-lock)?\.json|node_modules|tools|\.env|\.git|.*\.bak)(\/|$)/i;
app.use((req, res, next) => (BLOCKED.test(req.path) ? res.status(404).end() : next()));

const publicDir = path.join(__dirname, 'public');
const STATIC_ROOT = fs.existsSync(publicDir) ? publicDir : __dirname;
if (STATIC_ROOT === __dirname) {
    console.warn('[WARN] مجلد public/ غير موجود — بنخدم من الجذر مع حظر ملفات السيرفر. انقل الملفات العامة لـ public/.');
}

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
        const text = typeof body.text === 'string' ? body.text.trim().slice(0, LIMITS.MAX_MSG_LEN) : '';
        const target = typeof body.target === 'string' ? body.target : '';
        if (!text || !TL_LANGS.has(target)) return res.status(400).json({ error: 'bad_request' });
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
        if (!out) return res.status(502).json({ error: 'empty' });
        res.setHeader('Cache-Control', 'no-store');
        res.json({ text: out });
    } catch (err) {
        console.error('[ERR] translate', err && err.message);
        res.status(502).json({ error: 'upstream' });
    }
});
setInterval(() => { const n = Date.now(); for (const [k, v] of translateRate) if (n - v.t > 120000) translateRate.delete(k); }, 120000).unref();

// STUN + TURN
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
    allowRequest(req, cb) {
        const origin = req.headers.origin;
        cb(null, !origin || ALLOWED_ORIGINS.includes(origin));
    }
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
const BEHIND_CLOUDFLARE = process.env.BEHIND_CLOUDFLARE === 'true';
const TRUSTED_HOPS = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS || 1));
let warnedCf = false;

function normalizeIp(raw) {
    let ip = String(raw || '').trim();
    if (ip.startsWith('::ffff:')) ip = ip.slice(7);
    const bracketed = ip.match(/^\[([^\]]+)\](?::\d+)?$/);
    if (bracketed) return bracketed[1];
    const withPort = ip.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
    return withPort ? withPort[1] : ip;
}

function ipFromHeaders(h, address) {
    if (BEHIND_CLOUDFLARE && h['cf-connecting-ip']) return normalizeIp(h['cf-connecting-ip']) || 'unknown';
    if (!BEHIND_CLOUDFLARE && h['cf-connecting-ip'] && !warnedCf) {
        warnedCf = true;
        console.warn('[WARN] وصل هيدر cf-connecting-ip لكن BEHIND_CLOUDFLARE مش true.');
    }
    const xff = h['x-forwarded-for'];
    if (xff) {
        const parts = String(xff).split(',').map(normalizeIp).filter(Boolean);
        if (parts.length) return parts[Math.max(0, parts.length - TRUSTED_HOPS)];
    }
    return normalizeIp(h['x-real-ip'] || address) || 'unknown';
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
    return { mode, country, interests: cleanInterests(data.interests) };
}

const accepts = (wanted, otherActual) => wanted === 'global' || wanted === otherActual;
const mutualCountry = (a, b) =>
    accepts(a.searchCountry, b.actualCountry) && accepts(b.searchCountry, a.actualCountry);

function removeFromQueue(id) { waitingQueue = waitingQueue.filter(u => u.id !== id); }

function clearFallback(id) {
    const t = fallbackTimers.get(id);
    if (t) { clearTimeout(t); fallbackTimers.delete(id); }
}

// ================================================================ محرك الذكاء الاصطناعي البشري الخام (الـ 15 فكرة كاملة)
const cleanKey = v => String(v || '').trim().replace(/^["']|["']$/g, '').trim();
const GEMINI_KEY = cleanKey(process.env.GEMINI_API_KEY);
const GROQ_KEY = cleanKey(process.env.GROQ_API_KEY);
const AI_TEXT_WAIT_MS = () => 3000 + Math.random() * 8000;
const VIDEO_PROMPT_WAIT_MS = 10000;
const AI_STAY_MIN_MS = 90 * 1000;
const AI_STAY_EXTRA_MS = 240 * 1000;
const AI_EG_PERSONA_CHANCE = 0.75;

const aiSessions = new Map();
const videoPromptTimers = new Map();

const ARAB_COUNTRIES = new Set(['EG', 'SA', 'AE', 'MA', 'DZ', 'KW', 'QA', 'BH', 'OM', 'JO', 'LB', 'IQ', 'SY', 'PS']);
const AI_WORLD_POOL = [
    'EG', 'SA', 'AE', 'MA', 'JO', 'PS', 'DZ', 'KW', 'QA',
    'US', 'GB', 'ES', 'FR', 'DE', 'IT', 'BR', 'TR', 'RU', 'IN', 'ID', 'CA', 'MX', 'NL', 'SE'
];

// [فكرة 1 + 2] خريطة الهوية الجغرافية العميقة (مدن + أحياء حقيقية) + لغة الشارع لكل دولة
const LOCAL_GEO = {
    EG: { countryAr: 'مصر', countryEn: 'egypt', cities: [
        { city: 'القاهرة', cityEn: 'cairo', areas: ['مدينة نصر', 'المعادي', 'مصر الجديدة', 'التجمع الخامس', 'شبرا', 'الزمالك'] },
        { city: 'الجيزة', cityEn: 'giza', areas: ['الدقي', 'المهندسين', 'الشيخ زايد', 'فيصل', 'الهرم', 'أكتوبر'] },
        { city: 'الإسكندرية', cityEn: 'alexandria', areas: ['سموحة', 'سيدي جابر', 'ميامي', 'ستانلي', 'لوران'] },
        { city: 'المنصورة', cityEn: 'mansoura', areas: ['حي الجامعة', 'توريل', 'المشاية'] }
    ], slang: 'عامية مصرية صميمة وسريعة من الموبايل (يسطا، عامل ايه، يا غالي، اشطا، بجد، فكك، تمام وانت، احا، يا عم)' },
    AE: { countryAr: 'الإمارات', countryEn: 'uae', cities: [
        { city: 'دبي', cityEn: 'dubai', areas: ['دبي مارينا', 'البرشاء', 'جميرا', 'داون تاون', 'بر دبي', 'مردف'] },
        { city: 'أبوظبي', cityEn: 'abu dhabi', areas: ['الخالدية', 'جزيرة الريم', 'البطين', 'الكورنيش', 'مدينة خليفة'] },
        { city: 'الشارقة', cityEn: 'sharjah', areas: ['المجاز', 'النهدة', 'القاسمية', 'الخان'] }
    ], slang: 'لهجة إماراتية/خليجية شبابية عفوية (هلا والله، شحالك، علومك، وايد، زين، هيه، ماشي الحال، وينك)' },
    SA: { countryAr: 'السعودية', countryEn: 'saudi', cities: [
        { city: 'الرياض', cityEn: 'riyadh', areas: ['الملقا', 'العليا', 'الياسمين', 'النرجس', 'الصحافة', 'النسيم'] },
        { city: 'جدة', cityEn: 'jeddah', areas: ['التحلية', 'الروضة', 'السلامة', 'الشاطئ', 'أبحر'] },
        { city: 'الدمام', cityEn: 'dammam', areas: ['الشاطئ', 'الفيصلية', 'الريان'] }
    ], slang: 'لهجة سعودية شبابية مختصرة (هلا والله، شخبارك، وش علومك، من وين، يب، لا والله، يارجال، كفو)' },
    MA: { countryAr: 'المغرب', countryEn: 'morocco', cities: [
        { city: 'كازابلانكا', cityEn: 'casablanca', areas: ['المعاريف', 'عين الذياب', 'أنفا', 'حي الحسني'] },
        { city: 'الرباط', cityEn: 'rabat', areas: ['أكدال', 'حي الرياض', 'حسان'] },
        { city: 'مراكش', cityEn: 'marrakech', areas: ['جيليز', 'داوديات', 'المدينة'] }
    ], slang: 'دارجة مغربية مفهومة أو عربي مغربي خفيف (سلام، صافا، لاباس، منين نتا، واخا، بصح، والو)' },
    DZ: { countryAr: 'الجزائر', countryEn: 'algeria', cities: [
        { city: 'الجزائر العاصمة', cityEn: 'algiers', areas: ['باب الزوار', 'حيدرة', 'بوزريعة'] },
        { city: 'وهران', cityEn: 'oran', areas: ['بئر الجير', 'السانية'] }
    ], slang: 'لهجة جزائرية مفهومة وبسيطة (سلام، وش راك، لاباس، منين نتا، صحا، نورمال)' },
    KW: { countryAr: 'الكويت', countryEn: 'kuwait', cities: [
        { city: 'الكويت', cityEn: 'kuwait city', areas: ['السالمية', 'حولي', 'الجابرية', 'مشرف'] }
    ], slang: 'لهجة كويتية شبابية (هلا، شلونك، شخبارك، صج، شدعوة، تمام)' },
    QA: { countryAr: 'قطر', countryEn: 'qatar', cities: [
        { city: 'الدوحة', cityEn: 'doha', areas: ['اللؤلؤة', 'السد', 'الوعب', 'كتارا'] }
    ], slang: 'لهجة قطرية خليجية شبابية (هلا، شخبارك، علومك، طيب، تمام)' },
    JO: { countryAr: 'الأردن', countryEn: 'jordan', cities: [
        { city: 'عمّان', cityEn: 'amman', areas: ['عبدون', 'الجبيهة', 'تلاع العلي', 'الشميساني', 'جبل اللويبدة'] },
        { city: 'إربد', cityEn: 'irbid', areas: ['شارع الجامعة', 'الحي الشرقي'] }
    ], slang: 'لهجة أردنية شبابية (هلا، كيفك، شو أخبارك، يا زلمة، تمام والله، من وين)' },
    PS: { countryAr: 'فلسطين', countryEn: 'palestine', cities: [
        { city: 'رام الله', cityEn: 'ramallah', areas: ['الماصيون', 'الطيرة', 'المنارة'] },
        { city: 'نابلس', cityEn: 'nablus', areas: ['رفيديا', 'المخفية'] }
    ], slang: 'لهجة فلسطينية شبابية (هلا، كيفك، شو الأخبار، يسعدك، تمام الحمدلله)' },
    LB: { countryAr: 'لبنان', countryEn: 'lebanon', cities: [
        { city: 'بيروت', cityEn: 'beirut', areas: ['الحمرا', 'الأشرفية', 'الروشة', 'فردان'] }
    ], slang: 'لهجة لبنانية شبابية (هاي، كيفك، شو الأخبار، ماشي الحال، هلق)' },
    IQ: { countryAr: 'العراق', countryEn: 'iraq', cities: [
        { city: 'بغداد', cityEn: 'baghdad', areas: ['المنصور', 'الكرادة', 'الأعظمية', 'زيونة'] }
    ], slang: 'لهجة عراقية شبابية (هلو، شلونك، شكو ماكو، زين الحمدلله، حبيبي)' },
    SY: { countryAr: 'سوريا', countryEn: 'syria', cities: [
        { city: 'دمشق', cityEn: 'damascus', areas: ['المزة', 'المالكي', 'أبو رمانة', 'الشعلان'] }
    ], slang: 'لهجة سورية شامية شبابية (مرحبا، كيفك، شو الأخبار، تمام، أيوا)' },
    US: { countryAr: 'أمريكا', countryEn: 'usa', cities: [
        { city: 'Los Angeles', cityEn: 'la', areas: ['Santa Monica', 'Hollywood', 'Westwood'] },
        { city: 'New York', cityEn: 'nyc', areas: ['Brooklyn', 'Queens', 'Manhattan'] },
        { city: 'Chicago', cityEn: 'chicago', areas: ['Lincoln Park', 'Downtown'] },
        { city: 'Miami', cityEn: 'miami', areas: ['Brickell', 'South Beach'] }
    ], slang: 'ultra-casual american texting slang (yo, hru, wbu, wyd, ngl, rn, lowkey, fr, bro, idk)' },
    GB: { countryAr: 'بريطانيا', countryEn: 'uk', cities: [
        { city: 'London', cityEn: 'london', areas: ['Camden', 'Shoreditch', 'Greenwich'] },
        { city: 'Manchester', cityEn: 'manchester', areas: ['Northern Quarter', 'Salford'] }
    ], slang: 'casual uk texting slang (hey, u good, mate, ngl, uni, hru, wbu, lol)' },
    ES: { countryAr: 'إسبانيا', countryEn: 'spain', cities: [
        { city: 'Madrid', cityEn: 'madrid', areas: ['Malasaña', 'Chamberí', 'Sol'] },
        { city: 'Barcelona', cityEn: 'barcelona', areas: ['Gràcia', 'Eixample'] }
    ], slang: 'casual english texting slang with slight spanish vibe if asked (hey, hru, wbu, im from spain, madrid)' },
    FR: { countryAr: 'فرنسا', countryEn: 'france', cities: [
        { city: 'Paris', cityEn: 'paris', areas: ['Montmartre', 'Bastille', 'Latin Quarter'] },
        { city: 'Lyon', cityEn: 'lyon', areas: ['Bellecour', 'Part-Dieu'] }
    ], slang: 'casual english texting slang (hey, hru, wbu, from france, lol)' },
    DE: { countryAr: 'ألمانيا', countryEn: 'germany', cities: [
        { city: 'Berlin', cityEn: 'berlin', areas: ['Kreuzberg', 'Mitte', 'Neukölln'] },
        { city: 'Munich', cityEn: 'munich', areas: ['Schwabing', 'Maxvorstadt'] }
    ], slang: 'casual english texting slang (hey, hru, wbu, from berlin, lol)' },
    IT: { countryAr: 'إيطاليا', countryEn: 'italy', cities: [
        { city: 'Rome', cityEn: 'rome', areas: ['Trastevere', 'Prati'] },
        { city: 'Milan', cityEn: 'milan', areas: ['Navigli', 'Brera'] }
    ], slang: 'casual english texting slang (hey, hru, wbu, from italy, lol)' },
    BR: { countryAr: 'البرازيل', countryEn: 'brazil', cities: [
        { city: 'São Paulo', cityEn: 'sao paulo', areas: ['Pinheiros', 'Vila Madalena'] },
        { city: 'Rio', cityEn: 'rio', areas: ['Copacabana', 'Ipanema'] }
    ], slang: 'casual english texting slang (hey, hru, wbu, from brazil, lol, kkk)' },
    TR: { countryAr: 'تركيا', countryEn: 'turkey', cities: [
        { city: 'Istanbul', cityEn: 'istanbul', areas: ['Kadıköy', 'Beşiktaş', 'Taksim'] },
        { city: 'Ankara', cityEn: 'ankara', areas: ['Çankaya', 'Kızılay'] }
    ], slang: 'casual english texting slang (hey, hru, wbu, from istanbul, lol)' }
};

// [فكرة 3] الذاكرة المزاجية ونمط الحياة المؤقت
const LIFE_CONTEXTS_AR = [
    'لسه راجع من برا وتعبان وممدد ع السرير ماسك الموبايل',
    'قاعد في الأوضة بتسلى وبشرب قهوة/شاي من الزهق',
    'قاعد باكل ساندوتش سريعا وبتفرج على الموبايل',
    'زهقان من المذاكرة/الشغل وقلت أفتح شات أفصل شوية',
    'قاعد بسمع مزيكا في الهيدفون وبقلب في الموبايل'
];
const LIFE_CONTEXTS_EN = [
    'just got back home tired af lying on bed scrolling on phone',
    'chilling in my room listening to music and bored',
    'eating some food rn while texting on my phone',
    'taking a break from studying/work cuz im bored',
    'just procrastinating on my phone in my room'
];

// [فكرة 14] التفاعل مع الوقت وتوقيت اليوم
function getTimeVibe(isArab) {
    const hr = (new Date().getUTCHours() + 3) % 24; // توقيت المنطقة العربية تقريبياً
    if (hr >= 1 && hr < 6) return isArab ? 'الوقت متأخر بالليل/الفجر وأنت سهران لوحدك وشوية وهتنام' : 'it is late night / 3am and you are staying up late kinda sleepy';
    if (hr >= 6 && hr < 11) return isArab ? 'الوقت الصبح بدري وأنت لسه صاحي ومش مصحصح أوي' : 'it is morning and you just woke up still half asleep';
    if (hr >= 11 && hr < 18) return isArab ? 'الوقت بنهار/العصر والجو زحمة شوية' : 'it is afternoon and you are chilling';
    return isArab ? 'الوقت بالليل وقاعد رايق في البيت' : 'it is evening/night and you are relaxing at home';
}

function pickPersonaCountry(preferredCountry, actualCountry) {
    if (preferredCountry && preferredCountry !== 'global') return preferredCountry;
    if (actualCountry === 'EG' && Math.random() < AI_EG_PERSONA_CHANCE) return 'EG';
    return AI_WORLD_POOL[Math.floor(Math.random() * AI_WORLD_POOL.length)];
}

const NAMES = {
    ar: { guy: ['أحمد', 'محمد', 'عمر', 'يوسف', 'كريم', 'مصطفى', 'خالد', 'زياد'], girl: ['سارة', 'مريم', 'نور', 'هبة', 'ياسمين', 'ليلى', 'دنيا', 'ملك'] },
    en: { guy: ['jake', 'alex', 'mike', 'dan', 'sam', 'chris', 'leo', 'lucas'], girl: ['emma', 'mia', 'sara', 'lily', 'anna', 'zoe', 'lea', 'chloe'] }
};
function pickName(isArab, gender) {
    const a = NAMES[isArab ? 'ar' : 'en'][gender];
    return a[Math.floor(Math.random() * a.length)];
}

function buildAiPersona(preferredCountry, interests = [], actualCountry = 'unknown') {
    const country = pickPersonaCountry(preferredCountry, actualCountry);
    const isArab = ARAB_COUNTRIES.has(country);
    const age = Math.floor(Math.random() * 8) + 19; // 19 - 26
    const gender = Math.random() > 0.5 ? 'guy' : 'girl';
    const name = pickName(isArab, gender);

    const geoInfo = LOCAL_GEO[country] || (isArab ? LOCAL_GEO.EG : LOCAL_GEO.US);
    const cityObj = geoInfo.cities[Math.floor(Math.random() * geoInfo.cities.length)];
    const city = isArab ? cityObj.city : cityObj.city;
    const cityEn = cityObj.cityEn || city.toLowerCase();
    const area = cityObj.areas[Math.floor(Math.random() * cityObj.areas.length)];
    const lifeContext = isArab
        ? LIFE_CONTEXTS_AR[Math.floor(Math.random() * LIFE_CONTEXTS_AR.length)]
        : LIFE_CONTEXTS_EN[Math.floor(Math.random() * LIFE_CONTEXTS_EN.length)];
    const timeVibe = getTimeVibe(isArab);
    const interestHint = interests.length ? (isArab ? `اهتماماتك: ${interests.join('، ')}.` : `Your interests: ${interests.join(', ')}.`) : '';

    let systemPrompt = '';
    if (isArab) {
        const genderAr = gender === 'guy' ? 'ولد' : 'بنت';
        systemPrompt = `
أنت إنسان حقيقي 100% فاتح موقع الشات العشوائي Randly من موبايلك.
هويتك الثابتة طوال المحادثة:
- الاسم: ${name} (${genderAr}، ${age} سنة)
- البلد: ${geoInfo.countryAr} (${country})
- المدينة والمنطقة اللي ساكن فيها فعلاً: مدينة (${city})، منطقة/حي (${area}).
- حالتك دلوقتي: ${lifeContext}. (${timeVibe}). ${interestHint}
- لهجتك وطريقة كلامك: ${geoInfo.slang}.

قواعد البشر الخام (ممنوع كسرها نهائياً):
1. الجغرافيا الحقيقية: لو سألك "أنت منين؟" قول "${geoInfo.countryAr}" أو "${city}". ولو سألك "فين في ${geoInfo.countryAr}؟" أو "منين في ${city}؟" رد فوراً باسم مدينتك وحيك الحقيقي: "${city}، ناحية ${area}" أو "ساكن في ${area}".
2. ردود قصيرة جداً وعفوية من الموبايل (من كلمة لـ 6 كلمات فقط) بدون فصحى نهائياً وبدون نقطة في آخر الجملة.
3. لو الطرف التاني كلمك إنجليزي، رد بإنجليزي شات مختصر (hey, hru, wbu, im from ${geoInfo.countryEn} in ${cityEn}).
4. الرسائل المزدوجة: أحياناً افصل جملتين قصيرتين بعلامة "|" (مثال: "من ${city} | قاعد في ${area} وانت").
5. تعبيرات بشرية: استخدم أحياناً تعبيرات عفوية (ههه، يا راجل، بجد؟، اممم، لا والله) أو رد بسؤال معاكس ("وانت؟" / "اشمعنى انت يعني ههه").
6. الاعتراف بالجهل: لو سألك سؤال علمي أو معقد أو اختبار ذكاء، ارفض تجاوب كـ ويكيبيديا وقول بعفوية "يسطا انت قفلت مخي متسألش أسئلة صعبة ههه" أو "ايه الكلام الكبير ده انا فاتح اتسلى".
7. لو شتمك: متخرجش، رد رد بشري طبيعي ("ليه الغلط طيب"، "ربنا يسامحك مش هرد عليك"، "عيب عليك والله").
8. إياك تعترف أبداً إنك بوت أو ذكاء اصطناعي، ولو شك فيك استغرب واضحك ("بوت ايه يسطا انت شارب حاجة ههه"). ممنوع إرسال أي روابط.
`.trim();
    } else {
        systemPrompt = `
You are a 100% real human on the random text chat site Randly, typing from your phone.
YOUR FIXED IDENTITY:
- Name: ${name} (${age}yo ${gender})
- Country: ${geoInfo.countryEn} (${country})
- Exact City & Neighborhood you live in: ${city}, specifically around ${area}.
- Current situation: ${lifeContext} (${timeVibe}). ${interestHint}
- Texting style: ${geoInfo.slang}.

RAW HUMAN TEXTING RULES (NEVER BREAK):
1. REAL LOCAL GEOGRAPHY: If asked "where u from?", say "${geoInfo.countryEn}" or "${city.toLowerCase()}". If asked "where in ${geoInfo.countryEn}/${city.toLowerCase()}?", mention your actual neighborhood "${area.toLowerCase()}" naturally (e.g. "im in ${city.toLowerCase()} near ${area.toLowerCase()} wbu").
2. Keep replies ultra-short (1 to 7 words max), lowercase only, NO periods at the end, use abbreviations (hru, wbu, wyd, ngl, rn, idk, fr).
3. Only speak the native language of ${country} if the user speaks it first. If they write Arabic, say "english pls lol" or "idk arabic bro".
4. Double texting: occasionally split two short thoughts with "|" (e.g. "im from ${city.toLowerCase()} | wbu").
5. Cluelessness on hard questions: if asked complex math/trivia/coding/essay questions, DO NOT answer like an encyclopedia; say "bro my brain is fried rn idk lol" or "wtf why u quizzing me lol".
6. Counter-questions & reactions: use natural reactions ("wait what", "no wayyy", "fr??", "bruh") and flip questions back ("wbu tho?").
7. If insulted: do NOT disconnect, react casually ("chill bro why so rude", "wtf relax"). NEVER send URLs and NEVER admit to being an AI.
`.trim();
    }

    return { country, isArab, systemPrompt, age, gender, name, city, cityEn, area, countryAr: geoInfo.countryAr, countryEn: geoInfo.countryEn };
}

const AI_ADMIT_RE = /\bas an ai\b|language model|chatbot|\bi'?m an ai\b|\bi am an ai\b|ذكاء اصطناعي|نموذج لغوي/i;

function sanitizeAiReply(raw, isArab) {
    if (!raw || typeof raw !== 'string') return '';
    let out = raw
        .replace(/https?:\/\/\S+/gi, '')
        .replace(/\bwww\.\S+/gi, '')
        .replace(/\b[a-z0-9-]+\.(com|net|org|io|live|me|gg)\b\S*/gi, '')
        .replace(/\*[^*]*\*/g, '')
        .replace(/\s*\n+\s*/g, ' | ')
        .replace(/^["']|["']$/g, '')
        .trim();
    if (!out || AI_ADMIT_RE.test(out)) return '';

    out = out.split('|').map(p => p.trim().replace(/[.،。]+$/g, '').trim()).filter(Boolean).join(' | ');
    if (!isArab) out = out.toLowerCase();

    out = out.split(/\s+/).slice(0, 14).join(' ').replace(/\s*\|\s*$/, '').trim();
    return out;
}

// [فكرة 8] محاكاة أخطاء الكيبورد البشرية السريعة أو التصحيح بـ *
function applyHumanTypingQuirk(reply, isArab) {
    if (!reply || reply.includes('|') || Math.random() > 0.12) return reply;
    const words = reply.split(/\s+/);
    if (words.length < 2) return reply;
    // بنسبة بسيطة نكرر حرف تعبيري أو نعمل تصحيح كيبورد طبيعي
    if (Math.random() < 0.6) {
        return isArab ? reply.replace(/ههه/, 'ههههه') : reply.replace(/\blol\b/, 'lolll');
    }
    const targetIdx = words.length - 1;
    const w = words[targetIdx];
    if (w.length < 4) return reply;
    const typoWord = w.slice(0, -2) + w[w.length - 1] + w[w.length - 2];
    if (typoWord === w) return reply;
    words[targetIdx] = typoWord;
    return `${words.join(' ')} | *${w}`;
}

// [فكرة 7 + 10] تحليل طاقة المستخدم + كشف الأسئلة المعقدة/الاختبارات
const RE_COMPLEX = /(احسب|معادلة|برمج|اكتب كود|تاريخ|فلسفة|فيزياء|كيمياء|اشرح لي بالتفصيل|ما هي عاصمة|حل المسألة|write a code|explain in detail|solve this|what is the capital|quantum|algorithm|\d+\s*[\*\/\+]\s*\d+)/i;
const RE_DRY_MSG = /^(اه|اها|امم|اممم|ماشي|تمام|اوك|اوكي|طيب|كويس|عادي|لا|ايوه|يب|ok|okay|k|kk|yea|yeah|yep|nah|no|lol|hmm|nice|cool|good)$/i;

function buildDynamicTurnHint(session, lastUserText) {
    const hints = [];
    // فكرة 10: سؤال معقد
    if (RE_COMPLEX.test(lastUserText)) {
        hints.push(session.isArab
            ? '[ملاحظة لحظية: المستخدم بيسأل سؤال معقد أو بيختبرك، ارفض تجاوب إجابة علمية وقوله بعفوية "يسطا انت جاي تمتحني في الشات ههه معرفش والله"]'
            : '[Note: User asked a complex/test question. Act clueless: "bro why u quizzing me idk lol"]');
    }
    // فكرة 7: طاقة المستخدم
    if (/[😂🤣🔥❤️!؟]{2,}/.test(lastUserText) || lastUserText.length > 45) {
        hints.push(session.isArab ? '[تفاعل بحماس وروح حلوة مع كلامه]' : '[Match their high energy enthusiastically]');
    } else if (RE_DRY_MSG.test(lastUserText.trim())) {
        hints.push(session.isArab ? '[ردك يكون مختصر وبارد شوية أو افتح سؤال سريع]' : '[Keep it very brief or ask a quick counter-question]');
    }
    // فكرة 6 + 12: الذاكرة المرجعية Callback أو نسيان عفوي خفيف
    if (session.turnCount === 5 && session.userFacts.length) {
        hints.push(session.isArab
            ? `[معلومة قالها المستخدم من شوية ممكن تربط كلامك بيها بعفوية: "${session.userFacts[0]}"]`
            : `[Callback memory from earlier you can casually reference: "${session.userFacts[0]}"]`);
    }
    return hints.join(' ');
}

function normalizeHistory(h) {
    const out = [];
    for (const m of h) {
        const role = m.role === 'model' ? 'model' : 'user';
        if (out.length && out[out.length - 1].role === role) out[out.length - 1].text += '\n' + m.text;
        else out.push({ role, text: m.text });
    }
    if (out.length && out[0].role === 'model') out.unshift({ role: 'user', text: '...' });
    return out;
}

const GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];
const _aiLogAt = {};
function aiWarn(key, msg) {
    const n = Date.now();
    if (n - (_aiLogAt[key] || 0) < 5000) return;
    _aiLogAt[key] = n;
    console.warn('[AI]', msg);
}

function postJson(url, headers, bodyObj, timeoutMs) {
    const body = JSON.stringify(bodyObj);
    if (typeof fetch === 'function') {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), timeoutMs);
        return fetch(url, {
            method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
            body,
            signal: ctrl.signal
        }).then(async r => ({ status: r.status, text: await r.text() }))
          .finally(() => clearTimeout(t));
    }
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const req = https.request({
            hostname: u.hostname, path: u.pathname + u.search, method: 'POST', timeout: timeoutMs,
            headers: Object.assign({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, headers)
        }, res => {
            let d = '';
            res.setEncoding('utf8');
            res.on('data', c => { d += c; });
            res.on('end', () => resolve({ status: res.statusCode, text: d }));
        });
        req.on('timeout', () => req.destroy(new Error('timeout')));
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

async function callGroq(model, messages, maxTokens = 70) {
    const r = await postJson('https://api.groq.com/openai/v1/chat/completions',
        { Authorization: `Bearer ${GROQ_KEY}` },
        { model, messages, temperature: 0.9, max_tokens: maxTokens }, 6000);
    if (r.status < 200 || r.status >= 300) throw new Error(`Groq(${model}) HTTP ${r.status}: ${String(r.text).slice(0, 200)}`);
    const data = JSON.parse(r.text);
    return (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
}

async function callGemini(systemPrompt, hist, maxTokens = 80) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(GEMINI_KEY)}`;
    const r = await postJson(url, {}, {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: hist.map(m => ({ role: m.role === 'model' ? 'model' : 'user', parts: [{ text: m.text }] })),
        generationConfig: { temperature: 0.9, maxOutputTokens: maxTokens, thinkingConfig: { thinkingBudget: 0 } }
    }, 6000);
    if (r.status < 200 || r.status >= 300) throw new Error(`Gemini HTTP ${r.status}: ${String(r.text).slice(0, 200)}`);
    const data = JSON.parse(r.text);
    const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
    return Array.isArray(parts) ? parts.map(p => p.text || '').join('') : '';
}

console.log(`[AI] node=${process.version} fetch=${typeof fetch === 'function'} groqKey=${GROQ_KEY ? 'set(' + GROQ_KEY.length + ')' : 'MISSING'} geminiKey=${GEMINI_KEY ? 'set(' + GEMINI_KEY.length + ')' : 'MISSING'}`);

let _lastAiHealth = 0;
app.get('/api/ai-health', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const now = Date.now();
    if (now - _lastAiHealth < 10000) return res.status(429).json({ error: 'استنى 10 ثواني وجرب تاني' });
    _lastAiHealth = now;
    const out = {
        node: process.version,
        hasFetch: typeof fetch === 'function',
        groqKeySet: !!GROQ_KEY, groqKeyLength: GROQ_KEY.length,
        geminiKeySet: !!GEMINI_KEY, geminiKeyLength: GEMINI_KEY.length,
        groq: GROQ_KEY ? null : 'no key', gemini: GEMINI_KEY ? null : 'no key'
    };
    if (GROQ_KEY) {
        try {
            const raw = await callGroq(GROQ_MODELS[0], [{ role: 'system', content: 'reply with one short word' }, { role: 'user', content: 'hi' }], 10);
            out.groq = { ok: true, reply: raw };
        } catch (e) { out.groq = { ok: false, error: e.message }; }
    }
    if (GEMINI_KEY) {
        try {
            const raw = await callGemini('reply with one short word', [{ role: 'user', text: 'hi' }], 10);
            out.gemini = { ok: true, reply: raw };
        } catch (e) { out.gemini = { ok: false, error: e.message }; }
    }
    res.json(out);
});

async function generateAiReply(session) {
    const hist = normalizeHistory(session.history);
    if (!hist.length) return '';

    const lastUserMsg = hist[hist.length - 1].text || '';
    const turnHint = buildDynamicTurnHint(session, lastUserMsg);
    const fullSystemPrompt = turnHint ? `${session.systemPrompt}\n\n${turnHint}` : session.systemPrompt;

    if (GROQ_KEY) {
        const messages = [
            { role: 'system', content: fullSystemPrompt },
            ...hist.map(m => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.text }))
        ];
        for (const model of GROQ_MODELS) {
            try {
                const raw = await callGroq(model, messages, 70);
                const reply = sanitizeAiReply(raw, session.isArab);
                if (reply && !session.recent.includes(reply)) return applyHumanTypingQuirk(reply, session.isArab);
                break;
            } catch (e) {
                aiWarn('groq-' + model, e.message);
            }
        }
    }

    if (GEMINI_KEY) {
        try {
            const raw = await callGemini(fullSystemPrompt, hist, 80);
            const reply = sanitizeAiReply(raw, session.isArab);
            if (reply && !session.recent.includes(reply)) return applyHumanTypingQuirk(reply, session.isArab);
        } catch (e) {
            aiWarn('gemini', e.message);
        }
    }

    return '';
}

// ---------- محرك الردود البشرية المحلية الذكي (لو الـ API وقع أو اتأخر) ----------
function dialectOf(c) {
    if (c === 'EG') return 'EG';
    if (['SA', 'AE', 'KW', 'QA', 'BH', 'OM'].includes(c)) return 'SA';
    if (['MA', 'DZ'].includes(c)) return 'MA';
    return 'DEF';
}

const AR_T = {
    greet: { EG: ['هلا', 'ازيك', 'اهلا', 'هاي', 'سلام', 'منور'], SA: ['هلا والله', 'هلا', 'حياك', 'ارحب', 'يا هلا'], MA: ['سلام', 'لاباس', 'هلا', 'سلام صافا'], DEF: ['هلا', 'سلام', 'هاي', 'اهلا', 'مرحبا'] },
    how: { EG: ['تمام الحمد لله | وانت اخبارك', 'كويس وانت عامل ايه', 'زي الفل الحمد لله', 'الحمد لله ماشي الحال وانت'], SA: ['الحمدلله تمام | وانت شخبارك', 'بخير الحمدلله وانت', 'طيب طاب حالك وانت'], MA: ['لاباس الحمد لله | ونتا', 'بخير الحمد لله صافا'], DEF: ['تمام الحمدلله وانت', 'بخير وانت كيفك'] },
    doing: { EG: ['قاعد فاضي ع الموبايل | وانت', 'ولا حاجة زهقان شوية وانت بتعمل ايه', 'مفيش قاعد في البيت بقلب في الفون'], SA: ['جالس اتسلى ع الجوال | وانت وش تسوي', 'ولا شي ملل شوي وانت'], MA: ['والو غير جالس فالدار | ونتا'], DEF: ['قاعد بتسلى شوية وانت', 'ولا شي فاضي وانت'] },
    gen: { EG: ['اه فهمتك', 'ههه بجد؟', 'طب كويس والله', 'اشطا جدا', 'ايوه صح', 'لا والله؟ | طب وبعدين', 'يا راجل ههه', 'اممم قولولي بقى بتدرس ولا بتشتغل', 'منور الدنيا والله'], SA: ['ايه صح', 'ههه منجد؟', 'والله زين', 'حلو والله', 'لا اله الا الله ههه', 'طيب قول لي تدرس ولا موظف'], MA: ['بصح؟ ههه', 'واخا مزيان', 'زوين هادشي', 'اه فهمتك'], DEF: ['اه فعلا', 'ههه بجد؟', 'حلو والله', 'تمام فهمتك'] },
    clueless: ['يسطا انت قفلت مخي متسألش أسئلة صعبة ههه', 'ايه الكلام الكبير ده انا فاتح اتسلى ههه', 'والله مخي فاصل دلوقتي معرفش ههه'],
    laugh: ['ههههه', 'ههه حلوة', '😂', 'فصلتني ههه'],
    bye: ['يلا سلام خلي بالك من نفسك', 'باي اشوفك على خير', 'مع السلامة'],
    xo: ['يلا بينا دوس على علامة اللعبة فوق', 'ماشي يلا افتح XO وابدأ انت', 'يلا اتحداك في XO'],
    insult: ['ليه الغلط طيب عيب عليك', 'ربنا يسامحك مش هرد عليك', 'طب ليه الأسلوب ده بس'],
    thanks: ['حبيبي ولا يهمك', 'العفو يا غالي', 'تسلم والله'],
    q: ['مش عارف والله انت شايف ايه؟', 'والله ما ادري ههه وانت؟', 'ليه بتسأل ههه', 'تفتكر؟']
};
const EN_T = {
    greet: ['hey', 'yo wsp', 'hi | hru', 'sup', 'heyy'],
    how: ['good wbu', 'pretty good u?', 'im good lol hbu', 'doing well wbu'],
    doing: ['just chilling on my phone wbu', 'nothing much bored af u?', 'listening to music in my room wbu'],
    gen: ['fr?? lol', 'no wayyy', 'lowkey true lol', 'haha nice wbu', 'wait really?', 'ohh i see | so what do u do for fun', 'ngl thats cool'],
    clueless: ['bro my brain is fried rn dont quiz me lol', 'idk bro im terrible at that stuff lol', 'wtf why u asking hard questions lol'],
    laugh: ['lmaoo', 'haha fr', '😂', 'lolll'],
    bye: ['aight cya take care', 'bye bro', 'cya later'],
    xo: ['bet lets play xo click the game icon', 'sure start the xo game', 'im down for xo u start'],
    insult: ['chill bro why so rude', 'wtf relax bro', 'bruh why mad lol'],
    thanks: ['np bro', 'anytime!', 'no worries'],
    q: ['idk tbh wbu?', 'hmm not sure why u ask lol', 'maybe lol what do u think']
};

const RE_AR = /[\u0600-\u06FF]/;
const RE_INSULT = /\b(fuck|fck|shit|bitch|asshole|idiot|stupid|dumb|dick)\b|(^|\s)(كس|احا|كسمك|متناك|شرموط|قحبة|قحبه|حمار|غبي|كلب)(\s|$)/i;
const RE_BYE = /(\bbye\b|\bgtg\b|\bcya\b|see ya|goodbye|باي|مع السلامة|تصبح على خير|الى اللقاء|إلى اللقاء)/i;
const RE_ASL = /(\basl\b|\ba\/s\/l\b|\ba s l\b)/i;
const RE_NAME = /(your name|ur name|\bname\?|اسمك|إسمك|شسمك|شو اسمك)/i;
const RE_AGE = /(how old|\bage\b|\bold r u\b|كم عمرك|عمرك|سنك|كام سنة|كام سنه|عندك كام)/i;
const RE_GENDER = /(boy or girl|girl or boy|guy or girl|male or female|\bm or f\b|are (you|u) a (boy|girl|guy|man|woman)|ولد ولا بنت|بنت ولا ولد|انت بنت|انت ولد|ذكر ولا|شب ولا بنت)/i;
const RE_WHERE_IN = /(فين في|وين في|منين في|من وين ب|اي مدينة|أي مدينة|اي منطقة|أي منطقة|ساكن فين|ساكن وين|where in|which city|what city|what part of)/i;
const RE_FROM = /(where (are |r )?(you |u |ya )?from|\bu from\b|where u at|which country|ur country|your country|^from\??$|منين|من وين|من اين|من أين|بلدك|دولتك|من فين)/i;
const RE_DOING = /(\bwyd\b|what (are|r) (you|u) doing|what u doing|whatcha doing|بتعمل ايه|بتعمل إيه|بتعمل اية|ايش تسوي|شو بتعمل|شو عم تعمل|شنو تسوي|وش تسوي)/i;
const RE_HOW = /(\bhru\b|how are (you|u)|how r u|hows it going|how's it going|how u doing|how you doing|\bwbu\b|\bhbu\b|\bu good\b|عامل ايه|عامل اية|عاملة ايه|اخبارك|أخبارك|شخبارك|شلونك|كيفك|كيف حالك|ازيك|إزيك|كيف الحال|لاباس|كيداير|شحالك|علومك)/i;
const RE_XO = /(\bxo\b|tic ?tac|play a game|play game|نلعب|لعبة|اكس او)/i;
const RE_THANKS = /(\bthanks?\b|\bthx\b|\bty\b|شكرا|شكراً|تسلم|مشكور)/i;
const RE_GREET = /^((hi+|hey+|hello+|hola|yo+|sup|hallo|hai|bonjour|salut|ciao|merhaba|هلا|هلو|اهلا|أهلا|سلام|السلام عليكم|مرحبا|صباح الخير|مساء الخير|هاي)(\s|$|[!.,?])+)+$/i;
const RE_LAUGH = /(^(ha){2,}|\blol\b|\blmao\b|😂|🤣|هه+ه)/i;

function pickFresh(session, arr) {
    const recent = session.recent || (session.recent = []);
    const pool = arr.filter(x => !recent.includes(x));
    const src = pool.length ? pool : arr;
    const choice = src[Math.floor(Math.random() * src.length)];
    recent.push(choice);
    if (recent.length > 8) recent.shift();
    return choice;
}

function localReply(session, text) {
    const t = String(text || '').toLowerCase().trim();
    if (!t) return '';
    const userAr = RE_AR.test(t);
    const pf = arr => pickFresh(session, arr);

    if (!session.isArab && userAr) return pf(['english pls lol', 'idk arabic bro', 'sorry i only speak english lol']);

    const ar = session.isArab && userAr;
    const d = dialectOf(session.country);
    const T = ar ? AR_T : EN_T;
    const g = k => { const v = T[k]; return Array.isArray(v) ? v : (v[d] || v.DEF); };
    const gWord = ar ? (session.gender === 'guy' ? 'ولد' : 'بنت') : (session.gender === 'guy' ? 'guy' : 'girl');
    const age = session.age;
    const nm = ar ? session.name : String(session.name).toLowerCase();

    if (RE_INSULT.test(t)) return pf(g('insult'));
    if (RE_COMPLEX.test(t)) return pf(T.clueless);
    if (RE_BYE.test(t)) return pf(g('bye'));
    if (RE_ASL.test(t)) return ar ? `${age} ${gWord} من ${session.city}` : `${age} ${gWord} ${session.cityEn}`;

    // لو سأل عن الجنس ومعاه البلد أو الاسم في نفس الرسالة (زي "بخير انت بنت ولا ولد")
    if (RE_GENDER.test(t)) {
        return ar
            ? pf([`انا ${gWord} من ${session.city} | وانت`, `${gWord} عمري ${age} وانت`, `انا ${gWord} اسمي ${nm} وانت`])
            : pf([`im a ${gWord} from ${session.cityEn} wbu`, `${gWord} ${age} u?`, `im a ${gWord} named ${nm} wbu`]);
    }
    // [فكرة 1] لو سأل "فين في الإمارات / مصر / البلد" يرد بالمدينة والحي الحقيقي!
    if (RE_WHERE_IN.test(t)) {
        return ar
            ? pf([`في ${session.city} ناحية ${session.area} | وانت منين`, `ساكن في ${session.area} بـ ${session.city} وانت`, `قاعد في ${session.city} في ${session.area}`])
            : pf([`in ${session.cityEn} near ${session.area.toLowerCase()} wbu`, `im in ${session.cityEn} around ${session.area.toLowerCase()} u?`]);
    }
    if (RE_FROM.test(t)) {
        return ar
            ? pf([`من ${session.countryAr} في ${session.city} | وانت`, `أنا من ${session.city} (${session.area}) وانت منين`, `${session.countryAr} - ${session.city} وانت`])
            : pf([`from ${session.countryEn} in ${session.cityEn} wbu`, `im from ${session.cityEn} (${session.countryEn}) u?`]);
    }
    if (RE_NAME.test(t)) return ar ? pf([`اسمي ${nm} وانت`, `انا ${nm} وانت اسمك ايه`]) : pf([`im ${nm} wbu`, `${nm} u?`]);
    if (RE_AGE.test(t)) return ar ? pf([`عمري ${age} سنة وانت`, `عندي ${age} وانت كام`]) : pf([`im ${age} wbu`, `${age} u?`]);
    if (RE_DOING.test(t)) return pf(g('doing'));
    if (RE_HOW.test(t)) return pf(g('how'));
    if (RE_XO.test(t)) return pf(g('xo'));
    if (RE_THANKS.test(t)) return pf(g('thanks'));
    if (RE_GREET.test(t)) return pf(g('greet'));
    if (RE_LAUGH.test(t)) return pf(g('laugh'));
    if (/[?؟]\s*$/.test(t)) return pf(g('q'));
    return pf(g('gen'));
}

function addAiTimer(session, fn, ms) {
    const t = setTimeout(() => {
        session.timers.delete(t);
        fn();
    }, ms);
    session.timers.add(t);
    return t;
}

function clearAiSession(socketId) {
    const s = aiSessions.get(socketId);
    if (s) {
        for (const t of s.timers) clearTimeout(t);
        s.timers.clear();
        aiSessions.delete(socketId);
    }
    const vt = videoPromptTimers.get(socketId);
    if (vt) {
        clearTimeout(vt);
        videoPromptTimers.delete(socketId);
    }
}

function sendSimulatedAiText(socket, session, fullText) {
    const parts = fullText.split('|').map(s => s.trim()).filter(Boolean).slice(0, 2);
    if (!parts.length) return;

    let delay = 400 + Math.floor(Math.random() * 700);

    parts.forEach((part) => {
        addAiTimer(session, () => {
            if (!aiSessions.has(socket.id)) return;
            socket.emit('display-typing');
        }, delay);

        // [فكرة 13] سرعة كتابة متكيفة مع طول الجملة
        const typingMs = Math.min(Math.max(part.length * (140 + Math.random() * 100), 1300), 7500);
        delay += typingMs;

        addAiTimer(session, () => {
            if (!aiSessions.has(socket.id)) return;
            socket.emit('hide-typing');
            socket.emit('receive-message', { text: part });
            session.recent.push(part);
            if (session.recent.length > 8) session.recent.shift();
        }, delay);

        delay += 550;
    });
}

function scheduleAiReply(socket, session) {
    if (session.replyTimer) {
        clearTimeout(session.replyTimer);
        session.timers.delete(session.replyTimer);
        session.replyTimer = null;
    }
    const last = session.history[session.history.length - 1];
    const lastText = last ? last.text : '';
    const lastLen = lastText.length;

    // [فكرة 5] نظام الزهق والخلعان لو المستخدم بعت ردود جافة جداً 4 مرات ورا بعض
    if (RE_DRY_MSG.test(lastText.trim()) || lastLen <= 2) {
        session.dryCount = (session.dryCount || 0) + 1;
    } else {
        session.dryCount = 0;
        if (lastLen > 12 && session.userFacts.length < 3) session.userFacts.push(lastText.slice(0, 60));
    }

    if (session.dryCount >= 4) {
        const boreMsg = session.isArab ? 'شكلك زهقان ومش قادر تتكلم ههه | يلا سلام' : 'bro u dry af lol | im out bye';
        sendSimulatedAiText(socket, session, boreMsg);
        addAiTimer(session, () => botLeave(socket, session, true), 5500);
        return;
    }

    // [فكرة 9] التشتت الواقعي العفوي مرة واحدة في نص المحادثة (بنسبة 10%)
    if (!session.distractedOnce && session.turnCount === 4 && Math.random() < 0.10) {
        session.distractedOnce = true;
        const brb = session.isArab ? 'ثواني حد بينادي عليا في البيت' : 'sec someone calling me brb';
        sendSimulatedAiText(socket, session, brb);
    }

    // [فكرة 13] وقت قراءة الرسالة يتناسب مع طول رسالة المستخدم
    let wait = 1200 + Math.random() * 1800 + Math.min(lastLen * 45, 2000);
    if (session.distractedOnce && session.turnCount === 4) wait += 5500;

    const v = session.v;
    session.replyTimer = addAiTimer(session, async () => {
        session.replyTimer = null;
        try {
            const lastUser = [...session.history].reverse().find(m => m.role === 'user');
            let reply = '';

            const skipApi = session.apiFail >= 2 && Date.now() < session.apiSkipUntil;
            if (!skipApi) {
                reply = await generateAiReply(session);
                if (reply) session.apiFail = 0;
                else {
                    session.apiFail = (session.apiFail || 0) + 1;
                    if (session.apiFail >= 2) session.apiSkipUntil = Date.now() + 60000;
                }
            }
            if (!reply && lastUser) {
                reply = localReply(session, lastUser.text);
                aiWarn('local', 'استخدمت الرد البشري المحلي لأن الـ API لم يرجع رد');
            }

            if (!aiSessions.has(socket.id) || !reply || v !== session.v) return;
            session.history.push({ role: 'model', text: reply.replace(/\|/g, ' ') });
            sendSimulatedAiText(socket, session, reply);
        } catch (e) {
            console.warn('[AI] reply error:', e && e.message);
        }
    }, wait);
}

function botLeave(socket, session, silent = false) {
    const u = activeUsers.get(socket.id);
    if (!u || u.peer !== 'AI_BOT') return;

    const finish = () => {
        const cur = activeUsers.get(socket.id);
        if (!cur || cur.peer !== 'AI_BOT') return;
        clearAiSession(socket.id);
        cur.peer = null;
        cur.room = null;
        cur.xoRole = null;
        socket.emit('hide-typing');
        socket.emit('peer-disconnected');
    };

    if (!silent && Math.random() < 0.35) {
        const byes = session.isArab
            ? ['يلا همشي دلوقتي | سلام', 'معلش لازم اقفل باي', 'هقوم انام بقى تصبح على خير']
            : ['gtg bye', 'ok gotta go | cya', 'im out bye lol'];
        sendSimulatedAiText(socket, session, byes[Math.floor(Math.random() * byes.length)]);
        addAiTimer(session, finish, 6500 + Math.random() * 3000);
    } else {
        finish();
    }
}

function pairWithAi(socket, prefs) {
    removeFromQueue(socket.id);
    clearFallback(socket.id);
    const user = activeUsers.get(socket.id);
    if (!user) return;

    const persona = buildAiPersona(prefs.country, prefs.interests, user.actualCountry);
    const roomId = `room_${crypto.randomUUID()}`;

    user.room = roomId;
    user.peer = 'AI_BOT';
    user.xoRole = 'X';

    const session = {
        country: persona.country,
        isArab: persona.isArab,
        age: persona.age,
        gender: persona.gender,
        name: persona.name,
        city: persona.city,
        cityEn: persona.cityEn,
        area: persona.area,
        countryAr: persona.countryAr,
        countryEn: persona.countryEn,
        systemPrompt: persona.systemPrompt,
        history: [],
        xoBoard: Array(9).fill(''),
        timers: new Set(),
        v: 0,
        turnCount: 0,
        dryCount: 0,
        distractedOnce: false,
        userFacts: [],
        replyTimer: null,
        apiFail: 0,
        apiSkipUntil: 0,
        recent: []
    };
    aiSessions.set(socket.id, session);

    socket.emit('matched', {
        isInitiator: false,
        xoRole: 'X',
        roomId,
        partnerCountry: publicCountry(persona.country)
    });

    if (Math.random() < 0.65) {
        const openers = persona.isArab
            ? ['هلا', 'سلام | عامل ايه', 'هاي منين', `هلا من ${persona.city} وانت منين`]
            : ['hey', 'hey | hru', 'yo wsp', `hi from ${persona.cityEn} | u?`];
        const firstMsg = openers[Math.floor(Math.random() * openers.length)];
        session.history.push({ role: 'model', text: firstMsg.replace(/\|/g, ' ') });
        sendSimulatedAiText(socket, session, firstMsg);
    }

    addAiTimer(session, () => botLeave(socket, session), AI_STAY_MIN_MS + Math.random() * AI_STAY_EXTRA_MS);
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
            if (peerUser) peerUser.peer = null;
        }
        user.peer = null;
    }
    if (user.room) { socket.leave(user.room); user.room = null; }
    user.xoRole = null;
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
    if (mode) savedRooms.set(roomId, { createdAt: Date.now(), mode });
    mod.onPair(socketA, socketB, mode);
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
    socket.emit('online-count', getDisplayOnlineCount());

    mod.attach(socket, { io, activeUsers, detach });

    const isBanned = () => (bans.get(ipHash) || 0) > Date.now();

    on(socket, 'find-match', [8, 10000], (data) => {
        if (isBanned()) return socket.emit('banned', { until: bans.get(ipHash) });
        const prefs = cleanSearchData(data);
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
        if (!user || !user.peer || user.peer === 'AI_BOT' || !isObj(data)) return;
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
        if (!text) return;

        if (user.peer === 'AI_BOT') {
            const session = aiSessions.get(socket.id);
            if (!session) return;
            session.v = (session.v || 0) + 1;
            session.turnCount = (session.turnCount || 0) + 1;
            session.history.push({ role: 'user', text });
            if (session.history.length > 14) session.history.splice(0, 2);
            scheduleAiReply(socket, session);
            return;
        }

        io.to(user.peer).emit('receive-message', { text });
    });

    on(socket, 'typing', [20, 5000], () => {
        const user = activeUsers.get(socket.id);
        if (user && user.peer && user.peer !== 'AI_BOT') io.to(user.peer).emit('display-typing');
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
            if (checkXoWinner(session.xoBoard)) session.xoBoard = Array(9).fill('');
            if (session.xoBoard[index] !== '') return;

            session.xoBoard[index] = 'X';
            const winAfterUser = checkXoWinner(session.xoBoard);
            if (winAfterUser) {
                const msg = winAfterUser === 'X'
                    ? (session.isArab ? 'محظوظ هههه' : 'gg u got lucky lol')
                    : (session.isArab ? 'تعادل 🤝' : 'draw lol gg');
                sendSimulatedAiText(socket, session, msg);
                session.xoBoard = Array(9).fill('');
                return;
            }

            addAiTimer(session, () => {
                if (!aiSessions.has(socket.id)) return;
                const aiIdx = pickSmartXoMove(session.xoBoard);
                if (aiIdx === -1) return;
                session.xoBoard[aiIdx] = 'O';
                socket.emit('xo-receive-move', { index: aiIdx, symbol: 'O' });

                const winAfterAi = checkXoWinner(session.xoBoard);
                if (winAfterAi) {
                    const msg = winAfterAi === 'O'
                        ? (session.isArab ? 'كسبتك 😎' : 'ez win lol 😎')
                        : (session.isArab ? 'تعادل!' : 'tie game lol');
                    sendSimulatedAiText(socket, session, msg);
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