// moderation-client.js — يتحمّل بعد randly-extra.js:
//   <script src="randly-extra.js"></script><script src="moderation-client.js"></script>
// بيعمل: هوية الجهاز، نافذة البلاغ، رسالة الحظر بالوقت المتبقي، وفحص عري اختياري (بيتحمّل وقت الفيديو بس).
(function () {
  'use strict';

  // ---------- ترجمات (12 لغة) ----------
  var K = ['repTitle', 'repAbuse', 'repNudity', 'repViolence', 'repOther', 'repCancel', 'repThanks', 'banLeft'];
  var V = {
    ar: ['سبب الإبلاغ', 'شتائم أو إساءة', 'عُري أو محتوى جنسي', 'سلاح أو عنف', 'سبب آخر', 'إلغاء', 'شكراً! تم استلام بلاغك.', 'الوقت المتبقي على رفع الإيقاف: {t}'],
    en: ['Why are you reporting?', 'Insults or harassment', 'Nudity or sexual content', 'Weapons or violence', 'Something else', 'Cancel', 'Thank you! Your report has been received.', 'Time left until access is restored: {t}'],
    es: ['¿Por qué denuncias?', 'Insultos o acoso', 'Desnudez o contenido sexual', 'Armas o violencia', 'Otro motivo', 'Cancelar', '¡Gracias! Hemos recibido tu denuncia.', 'Tiempo restante hasta recuperar el acceso: {t}'],
    fr: ['Motif du signalement', 'Insultes ou harcèlement', 'Nudité ou contenu sexuel', 'Armes ou violence', 'Autre motif', 'Annuler', 'Merci ! Votre signalement a bien été reçu.', 'Temps restant avant le rétablissement de l’accès : {t}'],
    de: ['Warum meldest du?', 'Beleidigungen oder Belästigung', 'Nacktheit oder sexuelle Inhalte', 'Waffen oder Gewalt', 'Anderer Grund', 'Abbrechen', 'Danke! Deine Meldung ist eingegangen.', 'Verbleibende Zeit bis zur Freischaltung: {t}'],
    it: ['Motivo della segnalazione', 'Insulti o molestie', 'Nudità o contenuti sessuali', 'Armi o violenza', 'Altro motivo', 'Annulla', 'Grazie! La tua segnalazione è stata ricevuta.', 'Tempo rimasto prima del ripristino dell’accesso: {t}'],
    pt: ['Motivo da denúncia', 'Insultos ou assédio', 'Nudez ou conteúdo sexual', 'Armas ou violência', 'Outro motivo', 'Cancelar', 'Obrigado! Sua denúncia foi recebida.', 'Tempo restante até o acesso ser restaurado: {t}'],
    tr: ['Bildirim nedeni', 'Hakaret veya taciz', 'Çıplaklık veya cinsel içerik', 'Silah veya şiddet', 'Başka bir neden', 'İptal', 'Teşekkürler! Bildiriminiz alındı.', 'Erişimin yeniden açılmasına kalan süre: {t}'],
    ru: ['Причина жалобы', 'Оскорбления или домогательства', 'Обнажённое тело или сексуальный контент', 'Оружие или насилие', 'Другая причина', 'Отмена', 'Спасибо! Ваша жалоба получена.', 'Осталось до восстановления доступа: {t}'],
    hi: ['रिपोर्ट का कारण', 'गाली-गलौज या उत्पीड़न', 'नग्नता या यौन सामग्री', 'हथियार या हिंसा', 'कोई और कारण', 'रद्द करें', 'धन्यवाद! आपकी रिपोर्ट मिल गई है।', 'पहुँच बहाल होने में बचा समय: {t}'],
    id: ['Alasan melapor', 'Hinaan atau pelecehan', 'Ketelanjangan atau konten seksual', 'Senjata atau kekerasan', 'Alasan lain', 'Batal', 'Terima kasih! Laporan Anda sudah diterima.', 'Sisa waktu hingga akses dipulihkan: {t}'],
    zh: ['举报原因', '辱骂或骚扰', '裸露或色情内容', '武器或暴力', '其他原因', '取消', '谢谢！我们已收到你的举报。', '距离恢复访问还剩：{t}']
  };
  Object.keys(V).forEach(function (l) {
    translations[l] = translations[l] || {};
    K.forEach(function (k, i) { translations[l][k] = V[l][i]; });
  });

  // ---------- هوية الجهاز ----------
  function rnd(n) {
    var a = new Uint8Array(n), s = '';
    (window.crypto || window.msCrypto).getRandomValues(a);
    for (var i = 0; i < n; i++) s += (a[i] % 36).toString(36);
    return s;
  }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function ckGet(k) { var m = document.cookie.match(new RegExp('(?:^|; )' + k + '=([^;]*)')); return m ? m[1] : null; }
  function ckSet(k, v) { document.cookie = k + '=' + v + '; max-age=63072000; path=/; SameSite=Lax; Secure'; }

  var did = lsGet('randly_did') || ckGet('randly_did');
  if (!did || !/^[A-Za-z0-9_-]{6,64}$/.test(did)) did = rnd(24);
  lsSet('randly_did', did); ckSet('randly_did', did);       // نكتبه في الاتنين: لو مسح واحد التاني يرجّعه

  // بصمة خفيفة (مرة واحدة، ميلي ثواني): مش مكتبة، مجرد hash لخصائص الجهاز
  function cyrb53(s) {
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0, c; i < s.length; i++) { c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }
  function fingerprint() {
    try {
      var parts = [screen.width + 'x' + screen.height + 'x' + screen.colorDepth, navigator.hardwareConcurrency || 0,
        navigator.platform || '', navigator.language || '', new Date().getTimezoneOffset(), navigator.maxTouchPoints || 0];
      try { parts.push(Intl.DateTimeFormat().resolvedOptions().timeZone); } catch (e) {}
      try {
        var c = document.createElement('canvas'); c.width = 120; c.height = 30;
        var x = c.getContext('2d'); x.textBaseline = 'top'; x.font = '14px Arial'; x.fillStyle = '#f60'; x.fillRect(8, 2, 60, 20);
        x.fillStyle = '#069'; x.fillText('Randly,fp 1', 2, 4); parts.push(c.toDataURL());
        var gl = document.createElement('canvas').getContext('webgl'), ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
        if (ext) parts.push(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
      } catch (e) {}
      return cyrb53(parts.join('|')) + cyrb53(parts.reverse().join('#'));
    } catch (e) { return ''; }
  }
  var fp = fingerprint();

  function sendIdentity() { socket.emit('device-id', { did: did, fp: fp }); }
  socket.on('connect', sendIdentity);
  if (socket.connected) sendIdentity();

  // ---------- الحظر ----------
  function fmtLeft(ms) {
    var m = Math.max(1, Math.round(ms / 60000)), h = Math.floor(m / 60);
    return h > 0 ? h + 'h ' + (m % 60) + 'm' : m + 'm';
  }
  function banLeftText(until) { return tr('banLeft').replace('{t}', fmtLeft(until - Date.now())); }
  function banUntil() { var u = Number(lsGet('randly_ban_until') || 0); return u > Date.now() ? u : 0; }

  socket.on('banned', function (d) {
    var until = d && Number(d.until);
    if (!until || until <= Date.now()) return;
    lsSet('randly_ban_until', String(until));
    clearRemoteVideo();
    document.querySelectorAll('#remoteVideo').forEach(function (v) { v.style.filter = ''; });
    appendSystemMessage(banLeftText(until));
  });

  var _start = window.startSession;
  window.startSession = function () {
    var u = banUntil();
    if (u) { alert(tr('bannedMsg') + '\n' + banLeftText(u)); return; }   // مجرد راحة للمستخدم؛ السيرفر هو الحَكَم
    return _start.apply(this, arguments);
  };

  // ---------- نافذة البلاغ ----------
  function closeReport() { var o = document.getElementById('reportOverlay'); if (o) o.remove(); }

  window.reportUser = function () {
    if (!currentRoomId || document.getElementById('reportOverlay')) return;
    var ov = document.createElement('div');
    ov.id = 'reportOverlay';
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
    ov.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px';
    var card = document.createElement('div');
    card.style.cssText = 'background:var(--bg-card,#222);color:var(--text-main,#fff);border:1px solid var(--border-color,#444);border-radius:14px;padding:18px;max-width:340px;width:100%;display:flex;flex-direction:column;gap:10px';
    var h = document.createElement('div'); h.textContent = tr('repTitle'); h.style.cssText = 'font-weight:700;font-size:16px'; card.appendChild(h);

    [['abuse', 'repAbuse'], ['nudity', 'repNudity'], ['violence', 'repViolence'], ['other', 'repOther']].forEach(function (r) {
      var b = document.createElement('button');
      b.type = 'button'; b.textContent = tr(r[1]);
      b.style.cssText = 'padding:12px;border-radius:10px;border:1px solid var(--border-color,#444);background:transparent;color:inherit;font-size:15px;cursor:pointer';
      b.onclick = function () {
        socket.emit('submit-report', { reason: r[0] });
        closeReport();
        nextUser();                                   // نكمل لشخص جديد
        appendSystemMessage(tr('repThanks'));         // الرسالة بتظهر في المحادثة الجديدة
      };
      card.appendChild(b);
    });
    var c = document.createElement('button');
    c.type = 'button'; c.textContent = tr('repCancel');
    c.style.cssText = 'padding:10px;border-radius:10px;border:none;background:transparent;color:inherit;opacity:.7;cursor:pointer';
    c.onclick = closeReport; card.appendChild(c);
    ov.appendChild(card);
    ov.addEventListener('click', function (e) { if (e.target === ov) closeReport(); });
    document.body.appendChild(ov);
  };
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeReport(); });

  // ---------- فحص العري على جهاز المستخدم ----------
  // شغّال تلقائي. بيتحمّل أول ما فيديو يبدأ بس (مش في الصفحة الرئيسية)، وكل الملفات من موقعك أنت:
  //   /vendor/tf.min.js و /vendor/nsfwjs.min.js و /models/nsfw/model.json  (بيجهّزهم setup-nsfw.js)
  // لو الملفات مش موجودة بيسكت ومبيعملش حاجة. مفيش صور بتتبعت للسيرفر خالص، بس كلمة "بلاغ عري".
  var NSFW = Object.assign({ enabled: true, tfUrl: '/vendor/tf.min.js', libUrl: '/vendor/nsfwjs.min.js', modelDir: '/models/nsfw/', interval: 5000, threshold: 0.7, consecutive: 2 }, window.RANDLY_NSFW || {});
  var model = null, loading = false, failed = false, strikes = 0, flagged = false;

  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = src; s.async = true; s.onload = res; s.onerror = rej; document.head.appendChild(s);
    });
  }
  // بنقرا model.json بنفسنا عشان نعرف نوع الموديل (layers/graph) وحجم الصورة اللي بيستناها، من غير ما نخمّن
  function inspectModel(j) {
    var type = j && j.format === 'graph-model' ? 'graph' : 'layers', size = 224;
    try {
      if (type === 'layers') {
        var layers = j.modelTopology.model_config.config.layers, shp = layers[0].config.batch_input_shape || layers[0].config.batchInputShape;
        if (shp && shp[1] > 0) size = shp[1];
      } else {
        var ins = j.signature.inputs, first = ins[Object.keys(ins)[0]], dim = first.tensorShape.dim;
        var h = Number(dim[1].size); if (h > 0) size = h;
      }
    } catch (e) {}
    return { type: type, size: size };
  }
  window.__randlyInspectModel = inspectModel;      // للاختبار

  function ensureModel() {
    if (model || loading || failed || !NSFW.enabled) return;
    loading = true;
    fetch(NSFW.modelDir + 'model.json', { cache: 'force-cache' }).then(function (r) { if (!r.ok) throw new Error('no model'); return r.json(); })
      .then(function (j) {
        var info = inspectModel(j);
        return loadScript(NSFW.tfUrl).then(function () { return loadScript(NSFW.libUrl); }).then(function () {
          var opts = { size: info.size };
          if (info.type === 'graph') opts.type = 'graph';
          return window.nsfwjs.load(NSFW.modelDir, opts);
        });
      })
      .then(function (m) { model = m; loading = false; setInterval(scan, NSFW.interval); })
      .catch(function () { failed = true; loading = false; });          // الملفات مش موجودة: نسكت ونكمل من غير فحص
  }
  function scan() {
    var v = document.getElementById('remoteVideo');
    if (!model || flagged || document.hidden || currentMode !== 'video' || !v || !v.srcObject || v.readyState < 2 || v.paused) return;
    model.classify(v, 5).then(function (p) {
      var s = 0;
      p.forEach(function (x) { if (x.className === 'Porn' || x.className === 'Hentai') s += x.probability; });
      strikes = s >= NSFW.threshold ? strikes + 1 : 0;
      if (strikes >= NSFW.consecutive) {                // قراءتين ورا بعض عشان نقلل الغلط
        flagged = true; v.style.filter = 'blur(30px)';
        socket.emit('submit-report', { reason: 'nudity', auto: true });
        setTimeout(function () { nextUser(); }, 800);
      }
    }).catch(function () {});
  }
  socket.on('matched', function () {
    flagged = false; strikes = 0;
    var v = document.getElementById('remoteVideo'); if (v) v.style.filter = '';
    if (currentMode === 'video') ensureModel();
  });
  socket.on('peer-disconnected', function () {
    flagged = false; strikes = 0;
    var v = document.getElementById('remoteVideo'); if (v) v.style.filter = '';
  });
})();
