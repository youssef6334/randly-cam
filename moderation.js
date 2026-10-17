'use strict';
/**
 * moderation.js — إشراف أوتوماتيك لـ Randly (من غير أي مكتبات إضافية).
 *  - حظر ثابت 48 ساعة (MOD_BAN_HOURS) بـ deviceId + بصمة خفيفة + IP، ومحفوظ في ملف فيعيش بعد restart
 *  - فلتر شتايم على السيرفر: أول شتيمة = حظر
 *  - بلاغات: شتايم/أخرى = 3 مبلّغين مختلفين، عري/عنف = 2 مبلّغين مختلفين
 *  - مفيش أي مراجعة يدوية ومفيش تخزين لنصوص أو صور
 * التركيب: تلات سطور في server.js (بيعملهم apply-moderation.js تلقائي).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BAN_MS = Math.max(1, Number(process.env.MOD_BAN_HOURS || 48)) * 3600e3;
const BAN_IP = process.env.MOD_BAN_IP !== 'false';          // لو بلّغ ناس على داتا الموبايل إن حظرهم ظلم: MOD_BAN_IP=false
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const STORE = path.join(DATA_DIR, 'bans.json');
const WORDS_FILE = path.join(__dirname, 'badwords.txt');

// عدد المبلّغين المختلفين المطلوب. الشتايم (abuse/other) بتتحظر من بلاغ واحد لو السيرفر لاقى الشتيمة فعلاً في رسايل المتبلَّغ عنه (راجع handleReport)،
// والرقم هنا للبلاغات اللي ماتأكدتش (إهانة مش في القايمة): لازم عدد كبير من الناس المختلفين. حط MOD_UNVERIFIED_REPORTS=999 لو عايزها تتقفل عملياً.
const UNVERIFIED = Math.max(2, Number(process.env.MOD_UNVERIFIED_REPORTS || 5));
const THRESH = { abuse: UNVERIFIED, nudity: 2, violence: 2, other: UNVERIFIED };
const VERIFY_MS = 15 * 60e3;       // بنصدّق الشتيمة لو اتبعتت للمبلّغ في آخر 15 دقيقة
const REASONS = new Set(Object.keys(THRESH));
const WINDOW_MS = 24 * 3600e3;
const MIN_PAIR_MS = 4000;          // مينفعش تبلّغ قبل ما تكونوا مع بعض 4 ثواني
const IDENT_WAIT_MS = 2000;        // نستنى deviceId من الكلاينت بحد أقصى ثانيتين
const GATED = new Set(['find-match', 'join-saved-room', 'create-room']);

// ------------------------------------------------------------- مخزن الحظر
let salt = null;
const bans = new Map();            // مفتاح مجزّأ -> وقت انتهاء الحظر
let saveTimer = null;

function saveNow() {
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        const tmp = STORE + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify({ salt, bans: Object.fromEntries(bans) }));
        fs.renameSync(tmp, STORE);
    } catch (e) { console.error('[MOD] save failed:', e.message); }
}
function scheduleSave() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => { saveTimer = null; saveNow(); }, 1500);
    if (saveTimer.unref) saveTimer.unref();
}
function loadStore() {
    try {
        const j = JSON.parse(fs.readFileSync(STORE, 'utf8'));
        salt = j.salt || null;
        const now = Date.now();
        for (const [k, u] of Object.entries(j.bans || {})) if (u > now) bans.set(k, u);
    } catch (e) { /* أول تشغيل */ }
    if (!salt) { salt = crypto.randomBytes(16).toString('hex'); saveNow(); }
}
loadStore();

const hk = (type, v) => type + ':' + crypto.createHmac('sha256', salt).update(String(v)).digest('hex').slice(0, 24);

function expandV6(ip) {
    const [head, tail] = ip.split('::');
    const h = head ? head.split(':') : [];
    if (tail === undefined) return h.length === 8 ? h.map(x => x.padStart(4, '0')) : null;
    const t = tail ? tail.split(':') : [];
    const fill = 8 - h.length - t.length;
    if (fill < 0) return null;
    return [...h, ...Array(fill).fill('0'), ...t].map(x => x.padStart(4, '0'));
}
// IPv4 كما هو، IPv6 نحظر الـ /64 (أول 4 مجموعات) لأن الجهاز الواحد بيغيّر آخر 64 bit
function ipKey(ip) {
    if (!BAN_IP || !ip || ip === 'unknown' || ip === '127.0.0.1' || ip === '::1') return null;
    if (ip.includes(':')) { const p = expandV6(ip); return p ? p.slice(0, 4).join(':') : ip; }
    return ip;
}
function keysOf(sock) {
    const m = sock.data.mod;
    if (m.keys) return m.keys;
    const k = [];
    if (m.did) k.push(hk('d', m.did));
    if (m.fp) k.push(hk('f', m.fp));
    const ik = ipKey(sock.data.ip);
    if (ik) k.push(hk('i', ik));
    return (m.keys = k);
}
// لو أي مفتاح متحظر: بنسري الحظر على deviceId والبصمة بس (مش الـ IP، عشان داتا الموبايل المشتركة ما تتلوّثش)
function activeBan(sock) {
    const now = Date.now();
    const ks = keysOf(sock);
    let until = 0;
    for (const k of ks) { const u = bans.get(k); if (u && u > now && u > until) until = u; }
    if (until) {
        let changed = false;
        for (const k of ks) if (k[0] !== 'i' && (bans.get(k) || 0) < until) { bans.set(k, until); changed = true; }
        if (changed) scheduleSave();
    }
    return until;
}

// ------------------------------------------------------------- فلتر الشتايم
const ARABIC = /[\u0600-\u06FF]/;
const LATIN = /\p{Script=Latin}/u;
const HAN = /\p{Script=Han}/u;
const HAN_ONLY = /[^\p{Script=Han}]/gu;
// توحيد الكتابة: حروف لاتينية بدون علامات (ç=c ñ=n ü=u)، ß=ss، ı=i، ё=е، تشكيل وتطويل عربي، ة=ه، ى=ي، همزات، ँ=ं
function norm(s) {
    let t = String(s).normalize('NFKC').toLowerCase();
    t = t.normalize('NFD').replace(/(\p{Script=Latin})\p{M}+/gu, '$1').normalize('NFC')
        .replace(/ı/g, 'i').replace(/ß/g, 'ss').replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/œ/g, 'oe').replace(/ł/g, 'l').replace(/đ/g, 'd')
        .replace(/ё/g, 'е')
        .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
        .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
        .replace(/\u0901/g, '\u0902');
    // تطويل الحروف: لاتيني/سيريلي أي تكرار يتدمج (fuuuck -> fuck)، وباقي اللغات (عربي/هندي) التكرار 3+ بس يبقى اتنين،
    // عشان الحرف المزدوج الأصلي في كلمة زي "نيكك" ما يتدمجش ويبقى "نيك" (اسم Nick البريء). الصيني مستثنى (妈妈 ≠ 妈).
    return t.replace(/([\p{Script=Latin}\p{Script=Cyrillic}])\1+/gu, '$1').replace(/(\P{Script=Han})\1{2,}/gu, '$1$1');
}
const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't' };
function tokens(text) {
    const raw = norm(text).split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean)
        .map(t => (/\p{L}/u.test(t) && /\d/.test(t)) ? t.replace(/[013457]/g, c => LEET[c]) : t);
    const out = [];
    let run = [];
    const flush = () => { if (run.length >= 3) out.push(run.join('')); else out.push(...run); run = []; };
    for (const t of raw) { if (t.length === 1 && /\p{L}/u.test(t)) run.push(t); else { flush(); out.push(t); } }
    flush();                                              // f.u.c.k -> fuck
    return out;
}
function makeFilter(lines) {
    const single = new Set(), phrases = [], stems = [], han = [];
    for (const line of lines) {
        let w = line.trim();
        if (!w || w[0] === '#') continue;
        if (HAN.test(w)) { const h = norm(w).replace(HAN_ONLY, ''); if (h) han.push(h); continue; }
        if (w.endsWith('*')) {                            // أي كلمة بتبدأ بكده (لغير اللاتيني بس عشان ما نظلمش كلمات بريئة)
            const st = tokens(w.slice(0, -1)).join('');
            if (st.length >= 3 && !LATIN.test(st)) stems.push(st);
            continue;
        }
        const n = tokens(w).join(' ');
        if (!n) continue;
        if (n.includes(' ')) phrases.push(' ' + n + ' '); else single.add(n);
    }
    const PREF = /^[وفبلك]/;
    const variants = t => {                               // بادئات عربية: وكسمك، بعرص...
        const v = [t];
        if (ARABIC.test(t)) { let s = t; for (let i = 0; i < 2 && PREF.test(s) && s.length > 3; i++) { s = s.slice(1); v.push(s); } }
        return v;
    };
    return {
        size: single.size + phrases.length + stems.length + han.length,
        hit(text) {
            const tk = tokens(text);
            for (const t of tk) {
                for (const v of variants(t)) {
                    if (single.has(v)) return true;
                    for (const st of stems) if (v.startsWith(st)) return true;
                }
            }
            if (tk.length) { const joined = ' ' + tk.join(' ') + ' '; for (const p of phrases) if (joined.includes(p)) return true; }
            if (han.length) { const flat = norm(text).replace(HAN_ONLY, ''); if (flat) for (const h of han) if (flat.includes(h)) return true; }
            return false;
        }
    };
}
let filter = makeFilter([]);
try {
    filter = makeFilter(fs.readFileSync(WORDS_FILE, 'utf8').split(/\r?\n/));
    console.log('[MOD] bad words loaded:', filter.size);
} catch (e) { console.warn('[MOD] badwords.txt مش موجود — فلتر الشات مقفول'); }

// ------------------------------------------------------------- الحالة
let CTX = null;                      // { io, activeUsers, detach }
const pairs = new Map();             // socketId -> { peer, at, mode, reported }
const hitsByKey = new Map();         // مفتاح المبلَّغ عليه -> مصفوفة بلاغات مشتركة

setInterval(() => {
    const now = Date.now();
    for (const [k, u] of bans) if (u < now) { bans.delete(k); scheduleSave(); }
    for (const [k, arr] of hitsByKey) if (!arr.some(x => now - x.t < WINDOW_MS)) hitsByKey.delete(k);
}, 10 * 60 * 1000).unref();

function markBanned(sock, until, reason) {
    sock.data.mod.bannedUntil = until;
    try { CTX.detach(sock); } catch (e) { /* ignore */ }
    sock.emit('banned', { until, reason });
}

function banSocket(sock, reason) {
    const until = Date.now() + BAN_MS;
    const ks = keysOf(sock);
    for (const k of ks) if ((bans.get(k) || 0) < until) bans.set(k, until);
    scheduleSave();
    markBanned(sock, until, reason);
    // أجهزة تانية متصلة دلوقتي بنفس الـ deviceId/البصمة/IP (أجهزة البيت)
    for (const s of CTX.io.sockets.sockets.values()) {
        if (s === sock || !s.data.mod) continue;
        if (keysOf(s).some(k => ks.includes(k))) markBanned(s, until, reason);
    }
    console.log('[MOD] ban', reason, new Date(until).toISOString());
}

function handleReport(sock, data) {
    const now = Date.now();
    const m = sock.data.mod;
    m.reports = m.reports.filter(t => now - t < 60000);
    if (m.reports.length >= 6) return;
    m.reports.push(now);

    const reason = data && REASONS.has(data.reason) ? data.reason : 'other';
    const me = CTX.activeUsers.get(sock.id);
    const pr = pairs.get(sock.id);
    if (!me || !me.peer || !pr || pr.peer !== me.peer || now - pr.at < MIN_PAIR_MS || pr.reported) return;
    if ((reason === 'nudity' || reason === 'violence') && pr.mode === 'text') return;   // مفيش فيديو في الشات الكتابي
    const target = CTX.io.sockets.sockets.get(me.peer);
    if (!target || !target.data.mod) return;
    pr.reported = true;

    // شتايم: بلاغ واحد كفاية لو السيرفر شاف بنفسه شتيمة اتبعتت للمبلّغ ده (مفيش حد يقدر يلفّق ده)
    if (reason === 'abuse' || reason === 'other') {
        if (target.data.mod.ring.some(e => e.hit && e.to === sock.id && now - e.t < VERIFY_MS)) {
            for (const k of keysOf(target)) hitsByKey.delete(k);
            banSocket(target, 'chat');
            return;
        }
    }

    const tkeys = keysOf(target), rkeys = keysOf(sock);
    let arr = null;
    for (const k of tkeys) if (hitsByKey.has(k)) { arr = hitsByKey.get(k); break; }
    if (!arr) arr = [];
    for (const k of tkeys) hitsByKey.set(k, arr);
    const fresh = arr.filter(x => now - x.t < WINDOW_MS);
    arr.splice(0, arr.length, ...fresh);
    // نفس المبلّغ (deviceId أو بصمة أو IP) ما يتحسبش مرتين
    if (!arr.some(x => x.keys.some(k => rkeys.includes(k)))) arr.push({ t: now, reason, keys: rkeys });

    if (arr.filter(x => x.reason === reason).length >= THRESH[reason]) {
        for (const k of tkeys) hitsByKey.delete(k);
        banSocket(target, reason);
    } else if (reason === 'nudity' || reason === 'violence') {
        CTX.detach(sock);                                // نقطع فوراً حتى قبل اكتمال التأكيدات
    }
}

function identify(sock, data) {
    const m = sock.data.mod;
    if (m.idDone) return;                                // الهوية بتتثبت مرة واحدة بس في الجلسة
    m.idDone = true;
    const ok = v => typeof v === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(v);
    if (data && ok(data.did)) m.did = data.did;
    if (data && ok(data.fp)) m.fp = data.fp;
    m.keys = null;
    const u = activeBan(sock);
    if (u > m.bannedUntil) { m.bannedUntil = u; try { CTX.detach(sock); } catch (e) {} sock.emit('banned', { until: u }); }
    release(sock);
}

function release(sock) {
    const m = sock.data.mod;
    m.identified = true;
    clearTimeout(m.timer);
    for (const [packet, next] of m.queue.splice(0)) run(sock, packet, next);
}

function run(sock, packet, next) {
    const m = sock.data.mod, ev = packet[0], data = packet[1];
    if (m.bannedUntil > Date.now()) {
        if (GATED.has(ev)) sock.emit('banned', { until: m.bannedUntil });
        if (ev === 'leave-room') return next();
        return;                                          // أي حدث تاني من المحظور بيتبلع
    }
    if (ev === 'send-message' && data && typeof data.text === 'string') {
        // مبنحظرش هنا. بنسجّل بس (من غير النص نفسه) إن الرسالة دي فيها شتيمة وإنها رايحة لمين،
        // وبعدين لو الطرف التاني بلّغ، السيرفر يتأكد من السجل ده قبل ما يحظر.
        const me = CTX.activeUsers.get(sock.id);
        m.ring.push({ t: Date.now(), hit: filter.hit(data.text), to: (me && me.peer) || null });
        if (m.ring.length > 30) m.ring.shift();
    }
    if (ev === 'submit-report') { handleReport(sock, data); return; }
    next();
}

// ------------------------------------------------------------- الواجهة اللي بيستخدمها server.js
function attach(sock, ctx) {
    CTX = ctx;
    const m = sock.data.mod = { did: null, fp: null, keys: null, idDone: false, identified: false, queue: [], bannedUntil: 0, reports: [], ring: [], timer: null };
    m.timer = setTimeout(() => release(sock), IDENT_WAIT_MS);
    const u = activeBan(sock);
    if (u) { m.bannedUntil = u; sock.emit('banned', { until: u }); }
    sock.use((packet, next) => {
        if (packet[0] === 'device-id') { identify(sock, packet[1]); return; }
        if (!m.identified) { if (m.queue.length < 50) m.queue.push([packet, next]); return; }
        run(sock, packet, next);
    });
    sock.on('disconnect', () => { clearTimeout(m.timer); m.queue.length = 0; pairs.delete(sock.id); });
}

function onPair(a, b, mode) {
    const at = Date.now(), md = mode || 'any';
    pairs.set(a.id, { peer: b.id, at, mode: md, reported: false });
    pairs.set(b.id, { peer: a.id, at, mode: md, reported: false });
}

module.exports = { attach, onPair, _t: { norm, tokens, makeFilter, ipKey, expandV6 } };
