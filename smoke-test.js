#!/usr/bin/env node
/**
 * smoke-test.js — اختبار شامل بالمكتبات الحقيقية (express + socket.io).
 * بيشغّل server.js على بورت عشوائي، ويفحص الملفات العامة والأمان والشات والغرف.
 *
 * التشغيل (من جذر المشروع، مرة واحدة للتسطيب):
 *   npm install --save-dev socket.io-client
 *   node smoke-test.js
 *
 * ما بيختبرش: الكاميرا/WebRTC الفعلي، شكل الصفحة، بوابة العمر (دي بتتجرّب في المتصفح).
 */
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

let ioClient;
try { ({ io: ioClient } = require('socket.io-client')); }
catch (e) { console.error('شغّل الأول:  npm install --save-dev socket.io-client'); process.exit(2); }

const PORT = 3100 + Math.floor(Math.random() * 400);
const BASE = `http://127.0.0.1:${PORT}`;
const ORIGIN = `http://localhost:${PORT}`;      // السيرفر بيسمح بيه لما NODE_ENV مش production

const results = [];
const check = (name, ok, extra) => {
  results.push({ name, ok });
  console.log(`${ok ? '✔' : '✗'} ${name}${!ok && extra ? '  -> ' + extra : ''}`);
};

function get(p, opts = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(BASE + p, { method: opts.method || 'GET', headers: opts.headers || {} }, res => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('http timeout ' + p)));
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

function connect(origin = ORIGIN) {
  return new Promise((resolve, reject) => {
    const s = ioClient(BASE, { transports: ['websocket'], extraHeaders: { Origin: origin }, reconnection: false, forceNew: true });
    const t = setTimeout(() => { s.close(); reject(new Error('connect timeout')); }, 4000);
    s.on('connect', () => { clearTimeout(t); resolve(s); });
    s.on('connect_error', e => { clearTimeout(t); s.close(); reject(e); });
  });
}

const once = (s, ev, ms = 4000) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('timeout waiting for "' + ev + '"')), ms);
  s.once(ev, d => { clearTimeout(t); res(d); });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function step(name, fn) {
  try { const r = await fn(); check(name, r !== false); }
  catch (e) { check(name, false, e.message); }
}

(async () => {
  // ---------- تشغيل السيرفر ----------
  const logs = [];
  const srv = spawn(process.execPath, ['server.js'], {
    cwd: __dirname, env: { ...process.env, PORT: String(PORT), NODE_ENV: 'development' }
  });
  srv.stdout.on('data', d => logs.push(String(d)));
  srv.stderr.on('data', d => logs.push(String(d)));
  let exited = false, exitCode = null;
  srv.on('close', (code) => { exited = true; exitCode = code; });   // 'close' بعد ما كل الـ output يتقرا
  srv.on('error', (e) => { logs.push('spawn error: ' + e.message + '\n'); exited = true; });

  const WAIT_MS = 45000;                 // أول تشغيل ممكن يبطّأ (geoip-lite بيحمّل قاعدة بيانات كبيرة)
  const started = await new Promise(resolve => {
    const t0 = Date.now(); let lastNote = 0;
    const iv = setInterval(() => {
      const secs = Math.floor((Date.now() - t0) / 1000);
      if (logs.join('').includes('Server is running')) { clearInterval(iv); resolve(true); }
      else if (exited || Date.now() - t0 > WAIT_MS) { clearInterval(iv); resolve(false); }
      else if (secs >= lastNote + 5) { lastNote = secs; console.log(`... بستنى السيرفر يشتغل (${secs} ثانية)`); }
    }, 200);
  });
  if (!started) {
    const out = logs.join('').trim();
    console.log('');
    check('السيرفر اشتغل', false,
      exited ? `السيرفر وقف لوحده (exit code ${exitCode}).` : `ما طبعش "Server is running" خلال ${WAIT_MS / 1000} ثانية.`);
    console.log('--- ناتج السيرفر ---');
    console.log(out ? out.slice(-1800) : '(مفيش أي ناتج خالص)');
    console.log('--------------------');
    console.log('جرّب تشغّل  node server.js  مباشرة وابعتلي اللي بيظهر.');
    try { srv.kill(); } catch (e) {}
    return finish();
  }
  check('السيرفر اشتغل', true);

  const sockets = [];
  const open = async (o) => { const s = await connect(o); sockets.push(s); return s; };

  try {
    // ---------- الملفات العامة والأمان ----------
    let home;
    await step('GET / → 200 وفيه randly-extra.js و"إخفاء واجهة الشات"', async () => {
      home = await get('/');
      const t = home.body.toString('utf8');
      return home.status === 200 && t.includes('randly-extra.js') && t.includes('main-container" hidden');
    });
    await step('GET /en.html → 200', async () => (await get('/en.html')).status === 200);
    for (const p of ['/server.js', '/package.json', '/node_modules/express/package.json', '/.env', '/patch-languages.js']) {
      await step(`${p} ممنوع (404)`, async () => (await get(p)).status === 404);
    }
    await step('/api/ice بيرجّع iceServers', async () => {
      const r = await get('/api/ice'); const j = JSON.parse(r.body.toString());
      return r.status === 200 && Array.isArray(j.iceServers) && j.iceServers.length >= 1;
    });
    await step('/manifest.webmanifest موجود', async () => (await get('/manifest.webmanifest')).status === 200);
    await step('/sounds/match.wav و/sounds/msg.wav موجودين', async () =>
      (await get('/sounds/match.wav')).status === 200 && (await get('/sounds/msg.wav')).status === 200);
    await step('/robots.txt فيه Sitemap و/sitemap.xml موجود', async () =>
      (await get('/robots.txt')).body.toString().includes('Sitemap') && (await get('/sitemap.xml')).status === 200);
    await step('/healthz شغال', async () => (await get('/healthz')).status === 200);

    // كل الملفات اللي الصفحة الرئيسية بتحمّلها موجودة؟
    await step('كل ملفات (src/href) الصفحة الرئيسية موجودة', async () => {
      const t = home.body.toString('utf8');
      const urls = [...new Set([...t.matchAll(/(?:src|href)="([^"#]+)"/g)].map(m => m[1])
        .filter(u => !/^(https?:|\/\/|mailto:|data:|javascript:)/i.test(u)))];
      const bad = [];
      for (const u of urls) {
        const p = u.startsWith('/') ? u : '/' + u;
        if ((await get(p.split('?')[0])).status !== 200) bad.push(u);
      }
      if (bad.length) throw new Error('ناقص: ' + bad.join(', '));
      return true;
    });

    // كل روابط sitemap.xml موجودة كملفات؟
    await step('كل روابط sitemap.xml موجودة', async () => {
      const x = (await get('/sitemap.xml')).body.toString('utf8');
      const locs = [...x.matchAll(/<loc>https?:\/\/[^/]+\/?([^<]*)<\/loc>/g)].map(m => m[1]);
      const bad = [];
      for (const l of locs) if ((await get('/' + l)).status !== 200) bad.push(l);
      if (bad.length) throw new Error('روابط في الـ sitemap مالهاش ملف: ' + bad.join(', '));
      return true;
    });

    // ---------- الترجمة (من غير نداء Google فعلي) ----------
    await step('/api/translate بيرفض طلب فاسد (400)', async () =>
      (await get('/api/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status === 400);
    await step('/api/translate بيرفض Origin غريب (403)', async () =>
      (await get('/api/translate', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: '{"text":"hi","target":"es"}' })).status === 403);

    // ---------- السوكيت ----------
    await step('سوكيت من Origin غريب بيتحجب', async () => {
      try { const s = await connect('https://evil.example'); s.close(); return false; } catch (e) { return true; }
    });

    const A = await open(), B = await open();
    await step('شات نصي: تطابق بين اتنين', async () => {
      const a = once(A, 'matched'), b = once(B, 'matched');
      A.emit('find-match', { mode: 'text', country: 'global', interests: [] });
      B.emit('find-match', { mode: 'text', country: 'global', interests: [] });
      await Promise.all([a, b]);
    });
    await step('الرسالة بتوصل للطرف التاني', async () => {
      const m = once(B, 'receive-message'); A.emit('send-message', { text: 'hello' });
      return (await m).text === 'hello';
    });
    await step('رسالة طويلة (5000 حرف) بتتقص عند 500', async () => {
      const m = once(B, 'receive-message'); A.emit('send-message', { text: 'x'.repeat(5000) });
      return (await m).text.length === 500;
    });
    await step('التخطي: الطرف القديم بيستلم peer-disconnected', async () => {
      const pd = once(B, 'peer-disconnected');
      A.emit('find-match', { mode: 'text', country: 'global', interests: [] });
      await pd;
    });

    const C = await open();
    let roomId;
    await step('إنشاء غرفة خاصة (room-created)', async () => {
      const rc = once(C, 'room-created'); C.emit('create-room', { mode: 'text' });
      roomId = (await rc).roomId; return /^room_[0-9a-f-]{36}$/.test(roomId);
    });
    const D = await open();
    await step('الصديق بيدخل الغرفة وبيتطابقوا', async () => {
      const mc = once(C, 'matched'), md = once(D, 'matched');
      D.emit('join-saved-room', { roomId, mode: 'text' });
      await Promise.all([mc, md]);
    });
    const E = await open();
    await step('شخص تالت بيترفض من الغرفة الممتلئة', async () => {
      const nf = once(E, 'room-not-found'); E.emit('join-saved-room', { roomId, mode: 'text' }); await nf;
    });
    await step('معرّف غرفة مزيّف بيترفض', async () => {
      const nf = once(E, 'room-not-found'); E.emit('join-saved-room', { roomId: 'room_../../etc/passwd' }); await nf;
    });

    // ---------- مقاومة المدخلات الفاسدة ----------
    const X = await open();
    await step('رسائل فاسدة مبتوقعش السيرفر', async () => {
      const payloads = [undefined, null, 5, 'x', [], {}, { text: {} }, { index: 'a' }, { mode: {}, interests: 'zz', country: 5 }];
      for (const ev of ['find-match', 'join-saved-room', 'submit-report', 'xo-move', 'send-message', 'signal', 'typing', 'create-room'])
        for (const p of payloads) { try { X.emit(ev, p); } catch (e) {} }
      await sleep(500);
      return !exited && (await get('/healthz')).status === 200;
    });
  } catch (e) {
    check('خطأ غير متوقع أثناء الاختبار', false, e.message);
  }

  sockets.forEach(s => { try { s.close(); } catch (e) {} });
  try { srv.kill(); } catch (e) {}
  const errLines = logs.join('').split('\n').filter(l => /\[ERR\]|uncaught|TypeError|ReferenceError/i.test(l));
  if (errLines.length) { console.log('\nأخطاء في لوج السيرفر:'); errLines.slice(0, 8).forEach(l => console.log('  ' + l)); }
  finish();

  function finish() {
    const failed = results.filter(r => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} اختبار نجح` + (failed.length ? ` — ${failed.length} فشل` : ' ✔'));
    setTimeout(() => process.exit(failed.length ? 1 : 0), 300);
  }
})();