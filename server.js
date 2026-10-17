'use strict';
/**
 * Randly server — Phase 1 (hardened) + AI Human Fallback (Groq + Gemini)
 * - فحص مدخلات كل الأحداث + try/catch (رسالة فاضية ما توقعش السيرفر)
 * - ملفات عامة من public/ (أو fallback آمن لو لسه ماتنقلتش)
 * - فلتر دولة بتطابق متبادل
 * - تنظيف الطرف القديم عند التخطي
 * - Rate limiting + حد اتصالات لكل IP
 * - بلاغات حقيقية + حظر مؤقت
 * - AI Fallback للشات الكتابي فقط بعد وقت عشوائي + تخيير للفيديو بعد 10 ثواني
 */
const express = require('express');
const http = require('http');
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
const BLOCKED = /^\/(server\.js|moderation\.js|badwords\.txt|data|package(-lock)?\.json|node_modules|tools|\.env|\.git|.*\.bak)(\/|$)/i;
app.use((req, res, next) => (BLOCKED.test(req.path) ? res.status(404).end() : next()));

const publicDir = path.join(__dirname, 'public');
const STATIC_ROOT = fs.existsSync(publicDir) ? publicDir : __dirname;
if (STATIC_ROOT === __dirname) {
    console.warn('[WARN] مجلد public/ غير موجود — بنخدم من الجذر مع حظر ملفات السيرفر. انقل الملفات العامة لـ public/.');
}

// ---------------------------------------------------------------- الترجمة الفورية (عبر السيرفر)
const TL_LANGS = new Set(['ar', 'en', 'es', 'fr', 'de', 'it', 'pt', 'tr', 'ru', 'hi', 'id', 'zh']);
const translateRate = new Map();   // ip -> {c, t}

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

// عداد المتصلين: كل 5 ثواني وبس لو اتغير
let lastBroadcastCount = -1;
setInterval(() => {
    if (activeUsers.size !== lastBroadcastCount) {
        lastBroadcastCount = activeUsers.size;
        io.emit('online-count', lastBroadcastCount);
    }
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

// ================================================================ محرك الذكاء الاصطناعي البشري (Groq + Gemini Fallback)
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const GROQ_KEY = process.env.GROQ_API_KEY || '';
const AI_TEXT_WAIT_MS = () => 3000 + Math.random() * 8000;   // وقت انتظار عشوائي (3 - 11 ثانية) قبل دخول الـ AI
const VIDEO_PROMPT_WAIT_MS = 10000; // 10 ثواني للفيديو ثم يظهر سؤال التحويل للشات الكتابي
const AI_STAY_MIN_MS = 90 * 1000;   // أقل مدة يقعد فيها البوت (دقيقة ونص)
const AI_STAY_EXTRA_MS = 240 * 1000; // + عشوائي لحد 4 دقايق زيادة (يعني من 1.5 لـ 5.5 دقيقة)
const AI_EG_PERSONA_CHANCE = 0.75;  // لو اللاعب مصري ومختار global، احتمال إن البوت يكون مصري

const aiSessions = new Map();        // socketId -> { country, isArab, systemPrompt, history, xoBoard, timers: Set, v, replyTimer }
const videoPromptTimers = new Map(); // socketId -> timeout

const ARAB_COUNTRIES = new Set(['EG', 'SA', 'AE', 'MA', 'DZ', 'KW', 'QA', 'BH', 'OM', 'JO', 'LB', 'IQ', 'SY', 'PS']);
const AI_WORLD_POOL = [
    'EG', 'SA', 'AE', 'MA', 'JO', 'PS', 'DZ', 'KW', 'QA',
    'US', 'GB', 'ES', 'FR', 'DE', 'IT', 'BR', 'TR', 'RU', 'IN', 'ID', 'CA', 'MX', 'NL', 'SE'
];

const ARAB_PERSONAS = {
    EG: 'شاب أو بنت من مصر، بتتكلم عامية مصرية سريعة ومختصرة من الموبايل (زي: هلا، عامل ايه، منين، اشطا، تمام وانت)',
    SA: 'شاب أو بنت من السعودية، بتتكلم لهجة سعودية عفوية ومختصرة (زي: هلا والله، شخبارك، من وين، تمام الحمدلله)',
    MA: 'شاب أو بنت من المغرب، بتتكلم دارجة مغربية مفهومة أو عربي بسيط (زي: سلام، لاباس، منين نتا، صافا)',
    DEFAULT: 'شاب أو بنت عربي، بيتكلم عامية عربية بسيطة ومختصرة جداً (زي: هلا، كيفك، من وين انت)'
};

function pickPersonaCountry(preferredCountry, actualCountry) {
    if (preferredCountry && preferredCountry !== 'global') return preferredCountry;
    // لاعب مصري بدون فلتر دولة: غالباً يتوصل بمصري عشان اللغة متطابقة
    if (actualCountry === 'EG' && Math.random() < AI_EG_PERSONA_CHANCE) return 'EG';
    return AI_WORLD_POOL[Math.floor(Math.random() * AI_WORLD_POOL.length)];
}

function buildAiPersona(preferredCountry, interests = [], actualCountry = 'unknown') {
    const country = pickPersonaCountry(preferredCountry, actualCountry);

    const isArab = ARAB_COUNTRIES.has(country);
    const age = Math.floor(Math.random() * 9) + 19; // 19 - 27
    const gender = Math.random() > 0.5 ? 'guy' : 'girl';
    const interestHint = interests.length ? `Your interests include: ${interests.join(', ')}.` : '';

    let systemPrompt = '';
    if (isArab) {
        const dialect = ARAB_PERSONAS[country] || ARAB_PERSONAS.DEFAULT;
        const genderAr = gender === 'guy' ? 'ولد' : 'بنت';
        systemPrompt = `
أنت الآن مستخدم حقيقي في موقع شات عشوائي اسمه Randly، فاتح من موبايلك للتسلية.
شخصيتك: ${dialect}، عمرك ${age} سنة، الجنس: ${genderAr}. دولة إقامتك: ${country}. ${interestHint}

قواعد صارمة جداً لازم تلتزم بيها في كل رسالة:
1. لو الطرف التاني بيكلمك عربي: رد بلهجتك العامية بكلمات قليلة جداً (من كلمة لـ 6 كلمات كحد أقصى) من غير نقاط في آخر الجملة ومن غير فصحى أبداً.
2. لو الطرف التاني بدأ كلامه بالإنجليزي: رد عليه بإنجليزي شات مختصر جداً وبحروف صغيرة واختصارات (مثل: hey, hru, wbu, u from?, wyd, lol, im from ${country} u?).
3. لو عايز تبعت رسالتين قصيرتين ورا بعض زي البشر، افصل بينهم بعلامة "|" (مثال: "هلا | عامل ايه" أو "hey | hru"). استخدمها مرة كل 4 أو 5 رسايل بس، مش في كل رد.
4. ممنوع منعاً باتاً إرسال أي روابط أو مواقع أو الاعتراف بأنك ذكاء اصطناعي.
5. لو الطرف التاني شتمك أو قال كلام غير لائق: لا تخرج من الشات، رد عليه رد بشري طبيعي ومختصر (مثل: "ليه الغلط طيب"، "ربنا يسامحك مش هرد عليك"، "عيب عليك والله") وكمل المحادثة عادي.
6. يمكنك أحياناً اقتراح لعب XO معه داخل الشات (الزرار فوق في الشاشة).
7. الأمثلة اللي فوق للتوضيح بس، ما تنسخهاش حرفياً ونوّع في كلامك كل مرة.
8. ما تسألش سؤال في كل رسالة. غالباً رد وخلاص، أو ردّ فعل قصير (ههه، اه، لا والله، يا عم، بجد).
9. لو الكلام ناشف أو الطرف التاني ممل، رد بكلمة واحدة أو "؟" أو "اه".
10. افتكر اللي قلته قبل كده، وما تغيرش عمرك أو بلدك أو جنسك في نص المحادثة.
11. ما تكتبش نقط في آخر الجملة ولا تكتب أفعال بين نجوم زي *يضحك*.
`.trim();
    } else {
        systemPrompt = `
You are a real human (${age}yo ${gender} from country code ${country}) casually chatting on a random text chat site called Randly from your phone. ${interestHint}

STRICT HUMAN TEXTING RULES:
1. DEFAULT LANGUAGE: Always use ultra-casual, lowercase English internet texting slang and abbreviations (e.g., "hey", "yo", "hru", "good wbu", "where u from", "u?", "wyd", "nm u?", "lol", "idk", "ngl").
2. Keep replies extremely short (1 to 7 words max). NEVER use formal punctuation (no periods at the end, no capital letters, no robotic politeness).
3. Only speak the native language of ${country} IF the other person speaks it to you first. If they write in Arabic and you are from ${country}, casually say something like "english pls lol" or "idk arabic bro".
4. To send two quick consecutive texts like a real person, separate them with "|" (e.g., "hey | hru" or "im from ${country} | wbu"). Use it only once every 4 or 5 messages, not in every reply.
5. NEVER send any URLs/links and NEVER admit to being an AI.
6. If the user insults you or swears: do NOT disconnect. React like a normal person (e.g., "chill bro why so rude", "wtf why rude", "bruh relax") and keep chatting.
7. You can occasionally suggest playing the built-in XO (tic-tac-toe) game here.
8. The examples above are only for style. Never copy them word for word, vary your replies every time.
9. Do NOT ask a question in every message. Often just react or answer (lol, fr, ya, nah, true, same, bruh).
10. If the conversation is dry or boring, reply with one word or just "?" or "lol".
11. Remember what you already said. Never change your age, country or gender mid-chat.
12. No periods at the end and no actions between asterisks like *smiles*.
`.trim();
    }

    return { country, isArab, systemPrompt };
}

// لو الموديل خرج عن الشخصية نسكّت الرد بدل ما نبعته
const AI_ADMIT_RE = /\bas an ai\b|language model|chatbot|\bi'?m an ai\b|\bi am an ai\b|ذكاء اصطناعي|نموذج لغوي/i;

function sanitizeAiReply(raw, isArab) {
    if (!raw || typeof raw !== 'string') return '';
    let out = raw
        .replace(/https?:\/\/\S+/gi, '')
        .replace(/\bwww\.\S+/gi, '')
        .replace(/\b[a-z0-9-]+\.(com|net|org|io|live|me|gg)\b\S*/gi, '')
        .replace(/\*[^*]*\*/g, '')            // *يبتسم* / *smiles*
        .replace(/\s*\n+\s*/g, ' | ')
        .replace(/^["']|["']$/g, '')
        .trim();
    if (!out || AI_ADMIT_RE.test(out)) return '';

    // نقط/فواصل في آخر كل جزء
    out = out.split('|').map(p => p.trim().replace(/[.،。]+$/g, '').trim()).filter(Boolean).join(' | ');
    if (!isArab) out = out.toLowerCase();

    // حد أقصى 14 كلمة
    out = out.split(/\s+/).slice(0, 14).join(' ').replace(/\s*\|\s*$/, '').trim();
    return out;
}

// يدمج الرسايل المتتالية من نفس الطرف ويضمن إن أول رسالة من المستخدم (شرط Gemini)
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

async function generateAiReply(session) {
    const hist = normalizeHistory(session.history);
    if (!hist.length) return '';

    const messagesForGroq = [
        { role: 'system', content: session.systemPrompt },
        ...hist.map(m => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.text }))
    ];

    // 1) المحاولة الأولى عبر Groq (سريع جداً)
    if (GROQ_KEY) {
        try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 6000);
            const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${GROQ_KEY}`
                },
                signal: ctrl.signal,
                body: JSON.stringify({
                    model: 'llama-3.3-70b-versatile',
                    messages: messagesForGroq,
                    temperature: 0.9,
                    max_tokens: 70
                })
            });
            clearTimeout(t);
            if (resp.ok) {
                const data = await resp.json();
                const reply = sanitizeAiReply(data?.choices?.[0]?.message?.content, session.isArab);
                if (reply) return reply;
            }
        } catch (e) {
            console.warn('[AI] Groq fallback to Gemini:', e.message);
        }
    }

    // 2) المحاولة الثانية عبر Gemini Flash
    if (GEMINI_KEY) {
        try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 6000);
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(GEMINI_KEY)}`;
            const resp = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: ctrl.signal,
                body: JSON.stringify({
                    systemInstruction: { parts: [{ text: session.systemPrompt }] },
                    contents: hist.map(m => ({
                        role: m.role === 'model' ? 'model' : 'user',
                        parts: [{ text: m.text }]
                    })),
                    generationConfig: {
                        temperature: 0.9,
                        maxOutputTokens: 80,
                        thinkingConfig: { thinkingBudget: 0 }   // من غير تفكير عشان التوكنز ما تخلصش قبل الرد
                    }
                })
            });
            clearTimeout(t);
            if (resp.ok) {
                const data = await resp.json();
                const reply = sanitizeAiReply(data?.candidates?.[0]?.content?.parts?.[0]?.text, session.isArab);
                if (reply) return reply;
            }
        } catch (e) {
            console.warn('[AI] Gemini error:', e.message);
        }
    }

    // مفيش رد جاهز ثابت: البوت يسكت أحسن من رد مكرر
    return '';
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

    let delay = 400 + Math.floor(Math.random() * 800);

    parts.forEach((part) => {
        addAiTimer(session, () => {
            if (!aiSessions.has(socket.id)) return;
            socket.emit('display-typing');
        }, delay);

        // سرعة كتابة بشرية من الموبايل: 160 - 280ms للحرف، بين 1.5 و 9 ثواني
        const typingMs = Math.min(Math.max(part.length * (160 + Math.random() * 120), 1500), 9000);
        delay += typingMs;

        addAiTimer(session, () => {
            if (!aiSessions.has(socket.id)) return;
            socket.emit('hide-typing');
            socket.emit('receive-message', { text: part });
        }, delay);

        delay += 600;
    });
}

// يحسب وقت "القراءة" قبل ما البوت يبدأ يرد، ويلغي أي رد قديم لو جت رسالة أحدث
function scheduleAiReply(socket, session) {
    if (session.replyTimer) {
        clearTimeout(session.replyTimer);
        session.timers.delete(session.replyTimer);
        session.replyTimer = null;
    }
    const last = session.history[session.history.length - 1];
    const lastLen = last ? last.text.length : 0;
    let wait = 1500 + Math.random() * 2500 + Math.min(lastLen * 40, 1500);
    if (Math.random() < 0.15) wait += 4000 + Math.random() * 5000;   // أحياناً بيتأخر زي أي حد مشغول

    const v = session.v;
    session.replyTimer = addAiTimer(session, async () => {
        session.replyTimer = null;
        try {
            let reply = await generateAiReply(session);
            if (!reply) reply = await generateAiReply(session);       // محاولة تانية لو الأولى طلعت فاضية
            if (!aiSessions.has(socket.id) || !reply || v !== session.v) return;   // لو جت رسالة أحدث، تجاهل
            session.history.push({ role: 'model', text: reply.replace(/\|/g, ' ') });
            sendSimulatedAiText(socket, session, reply);
        } catch (e) {
            console.warn('[AI] reply error:', e && e.message);
        }
    }, wait);
}

// البوت يزهق ويمشي زي أي حد: أحياناً يودّع وأحياناً يقفل فجأة
function botLeave(socket, session) {
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

    if (Math.random() < 0.35) {
        const byes = session.isArab
            ? ['يلا همشي | سلام', 'تمام يلا باي', 'هنام بقى سلام', 'معلش هقفل باي']
            : ['gtg bye', 'ok bye', 'gotta go | bye', 'im out bye lol'];
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
        systemPrompt: persona.systemPrompt,
        history: [],
        xoBoard: Array(9).fill(''),
        timers: new Set(),
        v: 0,
        replyTimer: null
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
            ? ['هلا', 'سلام | كيفك', 'هاي منين', 'هلا والله | اخبارك']
            : ['hey', 'hey | hru', 'yo wsp', 'hi | where u from'];
        const firstMsg = openers[Math.floor(Math.random() * openers.length)];
        session.history.push({ role: 'model', text: firstMsg.replace(/\|/g, ' ') });
        sendSimulatedAiText(socket, session, firstMsg);
    }

    // بعد فترة عشوائية (1.5 - 5.5 دقيقة) البوت يزهق ويمشي
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

// يفك ارتباط المستخدم بالطرف القديم والغرفة والطابور (من غير ما يشيله من activeUsers)
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
    if (reporter.peer === 'AI_BOT') return true; // لو بلّغ على الـ AI نرجع true عشان تطلعله رسالة استلام البلاغ من غير خطأ
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
    socket.emit('online-count', activeUsers.size);

    mod.attach(socket, { io, activeUsers, detach });

    const isBanned = () => (bans.get(ipHash) || 0) > Date.now();

    on(socket, 'find-match', [8, 10000], (data) => {
        if (isBanned()) return socket.emit('banned', { until: bans.get(ipHash) });
        const prefs = cleanSearchData(data);
        detach(socket);
        const matched = tryMatch(socket, prefs);

        if (!matched) {
            if (prefs.mode === 'text') {
                // في الشات الكتابي: بعد وقت عشوائي (3-11 ثانية) لو مفيش شخص حقيقي، يدخل مع شخصية AI
                const timer = setTimeout(() => {
                    fallbackTimers.delete(socket.id);
                    if (!waitingQueue.some(u => u.id === socket.id)) return;
                    pairWithAi(socket, prefs);
                }, AI_TEXT_WAIT_MS());
                fallbackTimers.set(socket.id, timer);
            } else {
                // في الفيديو: مفيش AI خالص.
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
                // بعد 10 ثواني انتظار في الفيديو، نسأله لو يحب يحول للشات الكتابي أو يكمل انتظار
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
            session.history.push({ role: 'user', text });
            if (session.history.length > 16) session.history.splice(0, 2);
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