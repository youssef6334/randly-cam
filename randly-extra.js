// randly-extra.js — يتحمّل بعد script.js و i18n-extra.js:
//   <script src="script.js"></script><script src="i18n-extra.js"></script><script src="randly-extra.js"></script>
// بوابة العمر، ادعُ صديقك، اقتراحات الاهتمامات، شاشة البحث، زر الإعدادات على الموبايل، وأحداث الاتصال.
(function () {
  'use strict';

  // ---------- 1) ترجمات الميزات الجديدة (12 لغة) ----------
  const K2 = ['ageTitle','ageText','ageAgree','ageLeave','termsLink','bannedMsg','inviteBtn','shareText','roomReady',
    'startBtn','nextBtn','rtcFailed','connLost','connectedTo','trustLine',
    'chip_football','chip_gaming','chip_music','chip_movies','chip_coding','tipFilters'];
  const V2 = {
    ar: ['للبالغين فقط (+18)','Randly مخصص لمن بلغ 18 عاماً أو أكثر. بالضغط على «أوافق» تؤكد أن عمرك 18 عاماً أو أكثر وأنك توافق على القواعد والشروط وسياسة الخصوصية.','أنا 18+ وأوافق','خروج','الشروط والأحكام','تم إيقاف وصولك مؤقتاً بسبب بلاغات متعددة. حاول لاحقاً.','ادعُ صديقك لغرفة خاصة','تعال نتحدث على Randly! اضغط على الرابط للدخول إلى غرفتنا الخاصة:','تم إنشاء الغرفة. شارك الرابط مع صديقك وانتظره هنا (الرابط صالح 72 ساعة).','ابدأ','التالي','تعذر إنشاء اتصال الفيديو. جرّب التخطي إلى شخص آخر.','انقطع الاتصال بالخادم، جاري إعادة المحاولة...','أنت الآن تتحدث مع شخص من','مجاني • بدون تسجيل • +18','كرة القدم','ألعاب','موسيقى','أفلام','برمجة','الدولة والترجمة'],
    en: ['Adults only (18+)','Randly is for people aged 18 or older. By clicking “I agree” you confirm you are 18+ and accept the Rules, Terms and Privacy Policy.',"I'm 18+ and I agree",'Leave','Terms of Service','Your access is temporarily suspended due to multiple reports. Please try again later.','Invite a friend to a private room',"Let's talk on Randly! Open this link to join our private room:",'Room created. Share the link with your friend and wait here (the link is valid for 72 hours).','Start','Next','Could not establish the video connection. Try skipping to someone else.','Connection to the server lost, reconnecting...',"You're now chatting with someone from",'Free • No sign-up • 18+','Football','Gaming','Music','Movies','Coding','Country & translation'],
    es: ['Solo adultos (18+)','Randly es para mayores de 18 años. Al pulsar «Acepto» confirmas que tienes 18 años o más y aceptas las Reglas, los Términos y la Política de Privacidad.','Tengo 18+ y acepto','Salir','Términos y Condiciones','Tu acceso está suspendido temporalmente por varias denuncias. Inténtalo más tarde.','Invita a un amigo a una sala privada','¡Hablemos en Randly! Abre este enlace para entrar en nuestra sala privada:','Sala creada. Comparte el enlace con tu amigo y espera aquí (el enlace es válido 72 horas).','Empezar','Siguiente','No se pudo establecer la conexión de video. Prueba a saltar a otra persona.','Se perdió la conexión con el servidor, reconectando...','Ahora chateas con alguien de','Gratis • Sin registro • 18+','Fútbol','Videojuegos','Música','Películas','Programación','País y traducción'],
    fr: ['Réservé aux adultes (18+)',"Randly est réservé aux personnes de 18 ans ou plus. En cliquant sur « J'accepte », vous confirmez avoir 18 ans ou plus et acceptez les Règles, les Conditions et la Politique de confidentialité.","J'ai 18+ et j'accepte",'Quitter',"Conditions d'utilisation",'Votre accès est suspendu temporairement suite à plusieurs signalements. Réessayez plus tard.','Inviter un ami dans une salle privée','Discutons sur Randly ! Ouvre ce lien pour rejoindre notre salle privée :','Salle créée. Partagez le lien avec votre ami et attendez ici (lien valable 72 heures).','Démarrer','Suivant',"Impossible d'établir la connexion vidéo. Essayez de passer à quelqu'un d'autre.",'Connexion au serveur perdue, reconnexion...','Vous discutez maintenant avec quelqu’un de','Gratuit • Sans inscription • 18+','Football','Jeux vidéo','Musique','Films','Programmation','Pays et traduction'],
    de: ['Nur für Erwachsene (18+)','Randly ist für Personen ab 18 Jahren. Mit „Ich stimme zu“ bestätigst du, dass du mindestens 18 bist und die Regeln, Nutzungsbedingungen und Datenschutzerklärung akzeptierst.','Ich bin 18+ und stimme zu','Verlassen','Nutzungsbedingungen','Dein Zugang ist wegen mehrerer Meldungen vorübergehend gesperrt. Versuche es später erneut.','Freund in privaten Raum einladen','Lass uns auf Randly reden! Öffne diesen Link, um unserem privaten Raum beizutreten:','Raum erstellt. Teile den Link mit deinem Freund und warte hier (Link 72 Stunden gültig).','Starten','Weiter','Die Videoverbindung konnte nicht hergestellt werden. Versuche, zur nächsten Person zu wechseln.','Verbindung zum Server verloren, verbinde neu...','Du chattest jetzt mit jemandem aus','Kostenlos • Ohne Anmeldung • 18+','Fußball','Gaming','Musik','Filme','Programmieren','Land & Übersetzung'],
    it: ['Solo per adulti (18+)','Randly è riservato a chi ha almeno 18 anni. Cliccando su «Accetto» confermi di avere 18 anni o più e accetti Regole, Termini e Informativa sulla privacy.','Ho 18+ e accetto','Esci','Termini e Condizioni','Il tuo accesso è sospeso temporaneamente a causa di più segnalazioni. Riprova più tardi.','Invita un amico in una stanza privata','Parliamo su Randly! Apri questo link per entrare nella nostra stanza privata:','Stanza creata. Condividi il link con il tuo amico e aspetta qui (link valido 72 ore).','Inizia','Avanti',"Impossibile stabilire la connessione video. Prova a passare a un'altra persona.",'Connessione al server persa, riconnessione...','Ora stai chattando con qualcuno da','Gratis • Senza registrazione • 18+','Calcio','Giochi','Musica','Film','Programmazione','Paese e traduzione'],
    pt: ['Somente adultos (18+)','O Randly é para maiores de 18 anos. Ao clicar em «Concordo» você confirma ter 18 anos ou mais e aceita as Regras, os Termos e a Política de Privacidade.','Tenho 18+ e concordo','Sair','Termos e Condições','Seu acesso foi suspenso temporariamente por várias denúncias. Tente novamente mais tarde.','Convide um amigo para uma sala privada','Vamos conversar no Randly! Abra este link para entrar na nossa sala privada:','Sala criada. Compartilhe o link com seu amigo e aguarde aqui (link válido por 72 horas).','Iniciar','Próximo','Não foi possível estabelecer a conexão de vídeo. Tente pular para outra pessoa.','Conexão com o servidor perdida, reconectando...','Você está conversando agora com alguém de','Grátis • Sem cadastro • 18+','Futebol','Games','Música','Filmes','Programação','País e tradução'],
    tr: ['Yalnızca yetişkinler (18+)','Randly 18 yaş ve üzeri içindir. “Kabul ediyorum”a tıklayarak 18 yaşından büyük olduğunuzu ve Kuralları, Şartları ve Gizlilik Politikasını kabul ettiğinizi onaylarsınız.','18+ yaşındayım, kabul ediyorum','Çık','Kullanım Şartları','Birden fazla bildirim nedeniyle erişiminiz geçici olarak durduruldu. Lütfen daha sonra tekrar deneyin.','Arkadaşını özel odaya davet et',"Randly'de konuşalım! Özel odamıza katılmak için bu bağlantıyı aç:",'Oda oluşturuldu. Bağlantıyı arkadaşınla paylaş ve burada bekle (bağlantı 72 saat geçerli).','Başlat','Sonraki','Görüntülü bağlantı kurulamadı. Başka birine geçmeyi dene.','Sunucu bağlantısı koptu, yeniden bağlanılıyor...','Şu an sohbet ettiğin kişinin ülkesi:','Ücretsiz • Kayıt yok • 18+','Futbol','Oyun','Müzik','Film','Yazılım','Ülke ve çeviri'],
    ru: ['Только для взрослых (18+)','Randly предназначен для лиц от 18 лет. Нажимая «Согласен», вы подтверждаете, что вам 18 лет или больше, и принимаете Правила, Условия и Политику конфиденциальности.','Мне 18+, согласен','Выйти','Условия использования','Ваш доступ временно приостановлен из-за нескольких жалоб. Попробуйте позже.','Пригласить друга в приватную комнату','Давай поговорим в Randly! Открой ссылку, чтобы войти в нашу приватную комнату:','Комната создана. Отправьте ссылку другу и ждите здесь (ссылка действует 72 часа).','Начать','Далее','Не удалось установить видеосвязь. Попробуйте перейти к другому собеседнику.','Соединение с сервером потеряно, переподключение...','Вы общаетесь с человеком из:','Бесплатно • Без регистрации • 18+','Футбол','Игры','Музыка','Фильмы','Программирование','Страна и перевод'],
    hi: ['सिर्फ़ वयस्कों के लिए (18+)','Randly 18 वर्ष या उससे अधिक उम्र के लोगों के लिए है। “मैं सहमत हूँ” पर क्लिक करके आप पुष्टि करते हैं कि आपकी उम्र 18+ है और आप नियम, शर्तें व गोपनीयता नीति स्वीकार करते हैं।','मैं 18+ हूँ और सहमत हूँ','बाहर निकलें','नियम एवं शर्तें','कई रिपोर्ट मिलने के कारण आपकी पहुँच अस्थायी रूप से रोक दी गई है। कृपया बाद में कोशिश करें।','दोस्त को निजी रूम में बुलाएँ','चलो Randly पर बात करते हैं! हमारे निजी रूम में आने के लिए यह लिंक खोलो:','रूम बन गया। लिंक दोस्त को भेजें और यहीं इंतज़ार करें (लिंक 72 घंटे वैध है)।','शुरू करें','अगला','वीडियो कनेक्शन नहीं बन पाया। किसी और पर स्किप करके देखें।','सर्वर से कनेक्शन टूट गया, दोबारा जुड़ रहे हैं...','आप अभी इस देश के किसी व्यक्ति से बात कर रहे हैं:','मुफ्त • बिना रजिस्ट्रेशन • 18+','फ़ुटबॉल','गेमिंग','संगीत','फ़िल्में','कोडिंग','देश और अनुवाद'],
    id: ['Khusus dewasa (18+)','Randly untuk usia 18 tahun ke atas. Dengan menekan “Setuju” Anda menyatakan berusia 18+ dan menyetujui Aturan, Ketentuan, dan Kebijakan Privasi.','Saya 18+ dan setuju','Keluar','Syarat & Ketentuan','Akses Anda dihentikan sementara karena beberapa laporan. Coba lagi nanti.','Undang teman ke ruang pribadi','Yuk ngobrol di Randly! Buka tautan ini untuk masuk ke ruang pribadi kita:','Ruang dibuat. Bagikan tautan ke teman Anda dan tunggu di sini (tautan berlaku 72 jam).','Mulai','Berikutnya','Koneksi video gagal dibuat. Coba lewati ke orang lain.','Koneksi ke server terputus, mencoba menyambung lagi...','Anda sekarang mengobrol dengan seseorang dari','Gratis • Tanpa registrasi • 18+','Sepak bola','Game','Musik','Film','Pemrograman','Negara & terjemahan'],
    zh: ['仅限成年人（18+）','Randly 仅供年满 18 岁的用户使用。点击“我同意”即表示您已年满 18 岁，并接受规则、条款和隐私政策。','我已满18岁并同意','离开','服务条款','由于收到多次举报，您的访问已被暂时限制。请稍后再试。','邀请好友进入私人房间','来 Randly 聊天吧！打开此链接加入我们的私人房间：','房间已创建。把链接分享给好友并在这里等待（链接有效期 72 小时）。','开始','下一个','无法建立视频连接。请尝试跳到下一位。','与服务器的连接已断开，正在重连...','你正在和来自以下地区的人聊天：','免费 • 无需注册 • 18+','足球','游戏','音乐','电影','编程','国家与翻译']
  };
  Object.keys(V2).forEach(function (l) {
    translations[l] = translations[l] || {};
    K2.forEach(function (k, i) { translations[l][k] = V2[l][i]; });
  });

  window.CHIP_SLUGS = ['football', 'gaming', 'music', 'movies', 'coding'];

  function store(op, k, v) {
    try { return op === 'get' ? localStorage.getItem(k) : localStorage.setItem(k, v); } catch (e) { return null; }
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  // ---------- 2) بوابة العمر ----------
  function ageOk() { return store('get', 'randly_age_ok') === '1'; }

  function showAgeGate(onOk) {
    if (document.getElementById('ageGate')) return;
    var ov = el('div', 'age-gate'); ov.id = 'ageGate';
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-labelledby', 'ageGateTitle');
    var card = el('div', 'age-card');
    var h = el('h2', null, tr('ageTitle')); h.id = 'ageGateTitle';
    var p = el('p', null, tr('ageText'));
    var links = el('div', 'age-links');
    [['rules.html', 'rulesLink'], ['terms.html', 'termsLink'], ['privacy.html', 'privacyLink']].forEach(function (x) {
      var a = el('a', null, tr(x[1])); a.href = x[0]; a.target = '_blank'; a.rel = 'noopener'; links.appendChild(a);
    });
    var row = el('div', 'age-actions');
    var yes = el('button', 'btn btn-primary-lg', tr('ageAgree'));
    var no = el('button', 'btn btn-secondary-lg', tr('ageLeave'));
    yes.onclick = function () { store('set', 'randly_age_ok', '1'); ov.remove(); onOk(); };
    no.onclick = function () { window.location.href = 'https://www.google.com/'; };
    row.appendChild(yes); row.appendChild(no);
    card.appendChild(h); card.appendChild(p); card.appendChild(links); card.appendChild(row);
    ov.appendChild(card); document.body.appendChild(ov);
    yes.focus();
  }

  var _start = window.startSession;
  window.startSession = function (mode, room) {
    if (ageOk()) return _start(mode, room);
    showAgeGate(function () { _start(mode, room); });
  };

  // ---------- 3) ادعُ صديقك ----------
  window.startFriendRoom = function () { window.startSession('video', '__create__'); };

  function appendInvite(url) {
    var box = el('div', 'msg msg-sys invite-box');
    var t = el('div', null, tr('roomReady'));
    var row = el('div', 'invite-actions');
    var wa = el('a', 'modern-btn invite-btn'); wa.href = 'https://wa.me/?text=' + encodeURIComponent(tr('shareText') + ' ' + url);
    wa.target = '_blank'; wa.rel = 'noopener'; wa.setAttribute('aria-label', 'WhatsApp');
    wa.innerHTML = '<i class="fab fa-whatsapp"></i>';
    var cp = el('button', 'modern-btn invite-btn'); cp.type = 'button'; cp.setAttribute('aria-label', tr('tipLink'));
    cp.innerHTML = '<i class="fas fa-link"></i>';
    cp.onclick = function () {
      navigator.clipboard.writeText(url).then(function () { alert(tr('linkCopied')); }, function () { alert(tr('copyFailed')); });
    };
    row.appendChild(wa); row.appendChild(cp);
    if (navigator.share) {
      var sh = el('button', 'modern-btn invite-btn'); sh.type = 'button'; sh.setAttribute('aria-label', tr('inviteBtn'));
      sh.innerHTML = '<i class="fas fa-share-nodes"></i>';
      sh.onclick = function () { navigator.share({ title: 'Randly', text: tr('shareText'), url: url }).catch(function () {}); };
      row.appendChild(sh);
    }
    box.appendChild(t); box.appendChild(row);
    chatBox.appendChild(box);
  }

  socket.on('room-created', function (data) {
    if (!data || typeof data.roomId !== 'string') return;
    currentRoomId = data.roomId;
    if (skeletonLoader) skeletonLoader.style.display = 'none';
    chatBox.innerHTML = '';
    chatBox.style.display = 'flex';
    if (statusDiv) statusDiv.textContent = tr('roomReady');
    appendInvite(window.location.origin + window.location.pathname + '?room=' + encodeURIComponent(data.roomId) + '&mode=' + currentMode);
  });

  // ---------- 4) أحداث الاتصال ----------
  var hadConnected = false;
  socket.on('connect', function () {
    var inSession = landingPage && getComputedStyle(landingPage).display === 'none';
    if (hadConnected && inSession) nextUser();           // بعد انقطاع: ابدأ بحث جديد
    hadConnected = true;
  });
  socket.on('disconnect', function () {
    if (statusDiv) statusDiv.textContent = tr('connLost');
    clearRemoteVideo();
  });
  socket.on('connect_error', function () { if (statusDiv) statusDiv.textContent = tr('connLost'); });
  socket.on('banned', function () {
    if (skeletonLoader) skeletonLoader.style.display = 'none';
    chatBox.style.display = 'flex';
    if (statusDiv) statusDiv.textContent = '';
    appendSystemMessage(tr('bannedMsg'));
  });
  socket.on('matched', function () {
    try {
      var c = currentPartnerCountry;
      if (c && c !== 'global') {
        var name = new Intl.DisplayNames([document.documentElement.lang || 'en'], { type: 'region' }).of(c.toUpperCase());
        appendSystemMessage(tr('connectedTo') + ' ' + getFlagEmoji(c) + ' ' + name);
      }
      if (currentMode === 'text' && msgInput) msgInput.focus();
    } catch (e) {}
  });

  // ---------- 5) عناصر الواجهة الإضافية (بتتبني بالـ JS عشان كل صفحات اللغات تاخدها من غير تعديل HTML) ----------
  function renderChips() {
    var box = document.querySelector('.interests-box');
    if (!box) return;
    var wrap = document.getElementById('interestChips');
    if (!wrap) { wrap = el('div', 'interest-chips'); wrap.id = 'interestChips'; box.appendChild(wrap); }
    wrap.textContent = '';
    window.CHIP_SLUGS.forEach(function (slug) {
      var b = el('button', 'chip', tr('chip_' + slug)); b.type = 'button';
      b.onclick = function () {
        if (interestsArray.indexOf(slug) === -1 && interestsArray.length < 10) { interestsArray.push(slug); renderInterestTags(); }
      };
      wrap.appendChild(b);
    });
  }

  function buildLanding() {
    var btns = document.querySelector('.start-buttons');
    if (btns && !document.getElementById('inviteFriendBtn')) {
      var b = el('button', 'btn btn-secondary-lg'); b.id = 'inviteFriendBtn'; b.type = 'button';
      b.innerHTML = '<i class="fas fa-user-plus"></i> ';
      var sp = el('span', null, tr('inviteBtn')); sp.setAttribute('data-i18n', 'inviteBtn'); b.appendChild(sp);
      b.onclick = window.startFriendRoom;
      btns.appendChild(b);
      var trust = el('p', 'trust-line', tr('trustLine')); trust.setAttribute('data-i18n', 'trustLine');
      btns.parentNode.insertBefore(trust, btns.nextSibling);
    }
    renderChips();
  }

  function buildFiltersButton() {
    var qa = document.querySelector('.quick-actions');
    if (!qa || document.getElementById('filtersBtn')) return;
    var b = el('button', 'btn-action-icon modern-btn'); b.id = 'filtersBtn'; b.type = 'button';
    b.innerHTML = '<i class="fas fa-sliders"></i>'; b.title = tr('tipFilters'); b.setAttribute('aria-label', tr('tipFilters'));
    b.onclick = function () { var row = document.querySelector('.filter-controls-row'); if (row) row.classList.toggle('show-filters'); };
    qa.insertBefore(b, qa.firstChild);
  }

  function buildSearchOverlay() {
    var box = document.querySelector('.video-box.remote-box');
    if (!box || !skeletonLoader || document.getElementById('searchOverlay')) return;
    var ov = el('div', 'search-overlay'); ov.id = 'searchOverlay'; ov.style.display = 'none';
    ov.appendChild(el('div', 'spinner'));
    var t = el('div', 'search-text', tr('searchingText')); ov.appendChild(t);
    box.appendChild(ov);
    new MutationObserver(function () {
      var searching = skeletonLoader.style.display !== 'none' && currentMode === 'video';
      t.textContent = tr('searchingText');
      ov.style.display = searching ? 'flex' : 'none';
    }).observe(skeletonLoader, { attributes: true, attributeFilter: ['style'] });
  }

  function refreshExtras() {
    var fb = document.getElementById('filtersBtn');
    if (fb) { fb.title = tr('tipFilters'); fb.setAttribute('aria-label', tr('tipFilters')); }
    renderChips();
    renderInterestTags();
    var nb = document.getElementById('nextBtn');
    if (nb && typeof setNextBtn === 'function' && buttonState !== 'really') setNextBtn(buttonState);
  }

  var _apply = window.applyLanguage;
  window.applyLanguage = function () { _apply.apply(this, arguments); refreshExtras(); };

  window.addEventListener('DOMContentLoaded', function () {
    buildLanding(); buildFiltersButton(); buildSearchOverlay(); refreshExtras();
  });
})();
