// i18n-extra.js  — حمّله بعد script.js مباشرة:  <script src="script.js"></script><script src="i18n-extra.js"></script>
// يضيف: 5 لغات ناقصة (hi, id, ru, tr, zh) + رسائل الشات/الفيديو لكل الـ12 لغة + قايمة اللغات الموحدة.

(function () {
  // ---------- 1) اللغات الخمس الناقصة (كل المفاتيح) ----------
  const NEW_LANGS = {
    tr: {
      siteTitle: "Randly - Yabancılarla Rastgele Görüntülü ve Yazılı Sohbet", logoTitle: "Randly 🎲",
      landingSub: "Dünyanın dört bir yanından rastgele insanlarla güvenli ve hızlı sohbet et!",
      onlineNow: "Şu an çevrimiçi", interestsPlaceholder: "İlgi alanlarını yaz (örn. futbol, kodlama)...",
      videoChatBtn: "Görüntülü Sohbet", textChatBtn: "Yazılı Sohbet",
      feat1Title: "Kayıt Yok (Anonim)", feat1Desc: "Hesap açmadan tek tıkla hemen sohbete başla, gizliliğin güvende.",
      feat2Title: "İlgi Alanına Göre Eşleşme", feat2Desc: "Sevdiğin konuları ekle, aynı tutkuyu paylaşan kişilerle eşleş.",
      feat3Title: "Küresel Topluluk", feat3Desc: "Dünyanın her yerinden binlerce kullanıcı gece gündüz çevrimiçi.",
      feat4Title: "Güvenli Ortam", feat4Desc: "Kuralları ihlal edenler için anında bildirim ve otomatik geçici engelleme; sohbetler saygılı kalsın diye.",
      faqTitle: "Sık Sorulan Sorular", faq1Q: "Randly ücretsiz mi?",
      faq1A: "Evet, yabancılarla görüntülü veya yazılı sohbet tamamen ücretsizdir, gizli ücret yoktur.",
      faq2Q: "Randly'yi telefonda kullanabilir miyim?", faq2A: "Elbette! Site tüm mobil cihazlarda sorunsuz çalışır.",
      rights: "Tüm hakları saklıdır.", rulesLink: "Kurallar", privacyLink: "Gizlilik Politikası", contactLink: "İletişim",
      visitor: "Ziyaretçi", remoteUser: "Yabancı", youUser: "Sen", connectedStatus: "Bağlandı!",
      searchingText: "Rastgele biri aranıyor...", welcomeMsg: "Hoş geldin! Sohbete başlamak için Start'a tıkla.",
      typingText: "Karşı taraf yazıyor...", matchGlobal: "🌐 Dünya geneli (Smart Match)", noTranslation: "Çeviri yok",
      msgPlaceholder: "Mesajını buraya yaz...", skipStartBtn: "Geç / Start", turnText: "Sıra sende"
    },
    ru: {
      siteTitle: "Randly — случайный видео- и текстовый чат с незнакомцами", logoTitle: "Randly 🎲",
      landingSub: "Общайтесь со случайными людьми по всему миру — безопасно и быстро!",
      onlineNow: "Сейчас онлайн", interestsPlaceholder: "Введите интересы (например, футбол, программирование)...",
      videoChatBtn: "Видеочат", textChatBtn: "Текстовый чат",
      feat1Title: "Без регистрации (анонимно)", feat1Desc: "Начните общение одним нажатием, без аккаунта — ваша конфиденциальность под защитой.",
      feat2Title: "Подбор по интересам", feat2Desc: "Добавьте любимые темы, и мы найдём собеседников с такими же увлечениями.",
      feat3Title: "Глобальное сообщество", feat3Desc: "Тысячи пользователей со всего мира онлайн круглосуточно.",
      feat4Title: "Безопасная среда", feat4Desc: "Мгновенные жалобы и автоматические временные блокировки нарушителей, чтобы общение оставалось уважительным.",
      faqTitle: "Частые вопросы", faq1Q: "Randly бесплатный?",
      faq1A: "Да, видео- и текстовое общение с незнакомцами полностью бесплатно, без скрытых платежей.",
      faq2Q: "Можно ли пользоваться Randly на телефоне?", faq2A: "Конечно! Сайт адаптирован и отлично работает на всех мобильных устройствах.",
      rights: "Все права защищены.", rulesLink: "Правила", privacyLink: "Политика конфиденциальности", contactLink: "Связаться с нами",
      visitor: "Гость", remoteUser: "Незнакомец", youUser: "Вы", connectedStatus: "Подключено!",
      searchingText: "Ищем случайного собеседника...", welcomeMsg: "Добро пожаловать! Нажмите Start, чтобы начать чат.",
      typingText: "Собеседник печатает...", matchGlobal: "🌐 Весь мир (Smart Match)", noTranslation: "Без перевода",
      msgPlaceholder: "Введите сообщение...", skipStartBtn: "Далее / Start", turnText: "Ваш ход"
    },
    hi: {
      siteTitle: "Randly - अजनबियों के साथ रैंडम वीडियो और टेक्स्ट चैट", logoTitle: "Randly 🎲",
      landingSub: "दुनिया भर के अनजान लोगों से सुरक्षित और तेज़ी से बात करें!",
      onlineNow: "अभी ऑनलाइन", interestsPlaceholder: "अपनी रुचियाँ लिखें (जैसे फ़ुटबॉल, कोडिंग)...",
      videoChatBtn: "वीडियो चैट", textChatBtn: "टेक्स्ट चैट",
      feat1Title: "बिना रजिस्ट्रेशन (गुमनाम)", feat1Desc: "खाता बनाए बिना एक क्लिक में चैट शुरू करें, आपकी प्राइवेसी सुरक्षित है।",
      feat2Title: "रुचि के आधार पर मैच", feat2Desc: "अपने पसंदीदा विषय जोड़ें और समान शौक वाले लोगों से जुड़ें।",
      feat3Title: "वैश्विक समुदाय", feat3Desc: "दुनिया भर के हज़ारों यूज़र्स दिन-रात ऑनलाइन रहते हैं।",
      feat4Title: "सुरक्षित माहौल", feat4Desc: "नियम तोड़ने वालों के लिए तुरंत रिपोर्ट और स्वचालित अस्थायी ब्लॉक, ताकि चैट सम्मानजनक बनी रहे।",
      faqTitle: "अक्सर पूछे जाने वाले प्रश्न", faq1Q: "क्या Randly मुफ़्त है?",
      faq1A: "हाँ, अजनबियों के साथ वीडियो या टेक्स्ट चैट पूरी तरह मुफ़्त है, कोई छिपा शुल्क नहीं।",
      faq2Q: "क्या मैं Randly को मोबाइल पर इस्तेमाल कर सकता हूँ?", faq2A: "बिल्कुल! साइट सभी मोबाइल डिवाइस पर आसानी से चलती है।",
      rights: "सर्वाधिकार सुरक्षित।", rulesLink: "नियम", privacyLink: "गोपनीयता नीति", contactLink: "संपर्क करें",
      visitor: "आगंतुक", remoteUser: "अजनबी", youUser: "आप", connectedStatus: "कनेक्ट हो गया!",
      searchingText: "किसी अजनबी को खोजा जा रहा है...", welcomeMsg: "स्वागत है! चैट शुरू करने के लिए Start दबाएँ।",
      typingText: "अजनबी टाइप कर रहा है...", matchGlobal: "🌐 पूरी दुनिया (Smart Match)", noTranslation: "अनुवाद नहीं",
      msgPlaceholder: "यहाँ अपना संदेश लिखें...", skipStartBtn: "स्किप / Start", turnText: "आपकी बारी"
    },
    id: {
      siteTitle: "Randly - Obrolan Video & Teks Acak dengan Orang Asing", logoTitle: "Randly 🎲",
      landingSub: "Ngobrol dengan orang acak di seluruh dunia dengan aman dan cepat!",
      onlineNow: "Online sekarang", interestsPlaceholder: "Masukkan minat (mis. sepak bola, coding)...",
      videoChatBtn: "Video Chat", textChatBtn: "Chat Teks",
      feat1Title: "Tanpa Daftar (Anonim)", feat1Desc: "Mulai ngobrol seketika dengan satu klik, tanpa akun, privasimu aman.",
      feat2Title: "Pencocokan Minat", feat2Desc: "Tambahkan topik favoritmu dan terhubung dengan orang yang punya minat sama.",
      feat3Title: "Komunitas Global", feat3Desc: "Ribuan pengguna dari seluruh dunia online siang dan malam.",
      feat4Title: "Lingkungan Aman", feat4Desc: "Laporan instan dan pemblokiran sementara otomatis bagi pelanggar, agar obrolan tetap saling menghormati.",
      faqTitle: "Pertanyaan Umum", faq1Q: "Apakah Randly gratis?",
      faq1A: "Ya, kamu bisa ngobrol dengan orang asing lewat video atau teks sepenuhnya gratis tanpa biaya tersembunyi.",
      faq2Q: "Bisakah saya memakai Randly di ponsel?", faq2A: "Tentu! Situs ini responsif dan berjalan lancar di semua perangkat seluler.",
      rights: "Hak cipta dilindungi.", rulesLink: "Aturan", privacyLink: "Kebijakan Privasi", contactLink: "Hubungi Kami",
      visitor: "Pengunjung", remoteUser: "Orang Asing", youUser: "Kamu", connectedStatus: "Terhubung!",
      searchingText: "Mencari orang acak...", welcomeMsg: "Selamat datang! Klik Start untuk mulai ngobrol.",
      typingText: "Lawan bicara sedang mengetik...", matchGlobal: "🌐 Seluruh dunia (Smart Match)", noTranslation: "Tanpa terjemahan",
      msgPlaceholder: "Ketik pesanmu di sini...", skipStartBtn: "Lewati / Start", turnText: "Giliranmu"
    },
    zh: {
      siteTitle: "Randly - 与陌生人随机视频和文字聊天", logoTitle: "Randly 🎲",
      landingSub: "安全、快速地与世界各地的陌生人聊天！",
      onlineNow: "当前在线", interestsPlaceholder: "输入兴趣（例如：足球、编程）...",
      videoChatBtn: "视频聊天", textChatBtn: "文字聊天",
      feat1Title: "无需注册（匿名）", feat1Desc: "无需账号，一键即可开始聊天，隐私有保障。",
      feat2Title: "兴趣匹配", feat2Desc: "添加你喜欢的话题，与志趣相投的人配对。",
      feat3Title: "全球社区", feat3Desc: "来自世界各地的数千名用户昼夜在线。",
      feat4Title: "安全环境", feat4Desc: "即时举报功能，并对违规用户自动临时封禁，让聊天保持文明。",
      faqTitle: "常见问题", faq1Q: "Randly 免费吗？", faq1A: "是的，视频或文字聊天完全免费，没有任何隐藏费用。",
      faq2Q: "可以在手机上使用 Randly 吗？", faq2A: "当然可以！网站适配所有移动设备，运行流畅。",
      rights: "版权所有。", rulesLink: "规则", privacyLink: "隐私政策", contactLink: "联系我们",
      visitor: "访客", remoteUser: "陌生人", youUser: "你", connectedStatus: "已连接！",
      searchingText: "正在寻找随机用户...", welcomeMsg: "欢迎！点击 Start 开始聊天。",
      typingText: "对方正在输入...", matchGlobal: "🌐 全球（Smart Match）", noTranslation: "不翻译",
      msgPlaceholder: "在此输入消息...", skipStartBtn: "跳过 / Start", turnText: "轮到你了"
    }
  };

  // ---------- 2) رسائل الشات/الفيديو/التلميحات لكل الـ12 لغة ----------
  const K = ["cameraError","joiningRoom","needConnected","linkCopied","copyFailed","really","reported","waitTurn",
             "roomNotFound","disconnected","partnerLeft","translateFailed","translationLabel",
             "tipMic","tipCam","tipFx","tipSound","tipLink","tipReport","tipLeave"];
  const V = {
    ar: ["تعذر الوصول للكاميرا والمايكروفون.","جاري الانضمام للغرفة...","يجب أن تكون متصلاً بشخص أولاً لتتمكن من نسخ رابط الغرفة!","✅ تم نسخ رابط الغرفة بنجاح!\nصلاحية الغرفة 72 ساعة، شارك الرابط مع صديقك للدخول.","عذراً، حدث خطأ أثناء نسخ الرابط.","متأكد؟","تم تسجيل الإبلاغ عن هذا المستخدم.","انتظر دورك...","هذه الغرفة انتهت صلاحيتها أو غير موجودة.","انقطع الاتصال","الطرف الآخر غادر المحادثة.","(فشل في الترجمة)","ترجمة","المايكروفون","الكاميرا","مؤثرات الوجه","الصوت","نسخ رابط الغرفة","إبلاغ","مغادرة"],
    en: ["Could not access the camera and microphone.","Joining the room...","You need to be connected to someone first to copy the room link!","✅ Room link copied!\nThe room is valid for 72 hours. Share the link with your friend to join.","Sorry, something went wrong while copying the link.","Really?","This user has been reported.","Wait for your turn...","This room has expired or does not exist.","Disconnected","The other person left the chat.","(translation failed)","Translation","Mic","Camera","Face effects","Sound","Copy room link","Report","Leave"],
    es: ["No se pudo acceder a la cámara y al micrófono.","Uniéndose a la sala...","¡Primero debes estar conectado con alguien para copiar el enlace de la sala!","✅ ¡Enlace de la sala copiado!\nLa sala es válida durante 72 horas. Comparte el enlace con tu amigo para entrar.","Lo sentimos, ocurrió un error al copiar el enlace.","¿Seguro?","Se ha denunciado a este usuario.","Espera tu turno...","Esta sala ha caducado o no existe.","Desconectado","La otra persona abandonó el chat.","(error de traducción)","Traducción","Micrófono","Cámara","Efectos faciales","Sonido","Copiar enlace de la sala","Denunciar","Salir"],
    fr: ["Impossible d'accéder à la caméra et au micro.","Connexion à la salle...","Vous devez d'abord être connecté à quelqu'un pour copier le lien de la salle !","✅ Lien de la salle copié !\nLa salle est valable 72 heures. Partagez le lien avec votre ami pour la rejoindre.","Désolé, une erreur est survenue lors de la copie du lien.","Vraiment ?","Cet utilisateur a été signalé.","Attendez votre tour...","Cette salle a expiré ou n'existe pas.","Déconnecté","L'autre personne a quitté le chat.","(échec de la traduction)","Traduction","Micro","Caméra","Effets du visage","Son","Copier le lien de la salle","Signaler","Quitter"],
    de: ["Kamera und Mikrofon sind nicht verfügbar.","Raum wird betreten...","Du musst zuerst mit jemandem verbunden sein, um den Raumlink zu kopieren!","✅ Raumlink kopiert!\nDer Raum ist 72 Stunden gültig. Teile den Link mit deinem Freund.","Beim Kopieren des Links ist ein Fehler aufgetreten.","Wirklich?","Dieser Nutzer wurde gemeldet.","Warte, bis du dran bist...","Dieser Raum ist abgelaufen oder existiert nicht.","Verbindung getrennt","Die andere Person hat den Chat verlassen.","(Übersetzung fehlgeschlagen)","Übersetzung","Mikrofon","Kamera","Gesichtseffekte","Ton","Raumlink kopieren","Melden","Verlassen"],
    it: ["Impossibile accedere a fotocamera e microfono.","Ingresso nella stanza...","Devi prima essere connesso con qualcuno per copiare il link della stanza!","✅ Link della stanza copiato!\nLa stanza è valida per 72 ore. Condividi il link con il tuo amico per entrare.","Spiacenti, si è verificato un errore durante la copia del link.","Davvero?","Questo utente è stato segnalato.","Aspetta il tuo turno...","Questa stanza è scaduta o non esiste.","Disconnesso","L'altra persona ha lasciato la chat.","(traduzione non riuscita)","Traduzione","Microfono","Fotocamera","Effetti viso","Audio","Copia link della stanza","Segnala","Esci"],
    pt: ["Não foi possível acessar a câmera e o microfone.","Entrando na sala...","Você precisa estar conectado a alguém para copiar o link da sala!","✅ Link da sala copiado!\nA sala é válida por 72 horas. Compartilhe o link com seu amigo para entrar.","Desculpe, ocorreu um erro ao copiar o link.","Tem certeza?","Este usuário foi denunciado.","Aguarde a sua vez...","Esta sala expirou ou não existe.","Desconectado","A outra pessoa saiu do chat.","(falha na tradução)","Tradução","Microfone","Câmera","Efeitos de rosto","Som","Copiar link da sala","Denunciar","Sair"],
    tr: ["Kamera ve mikrofona erişilemedi.","Odaya katılınıyor...","Oda bağlantısını kopyalamak için önce biriyle bağlantıda olmalısın!","✅ Oda bağlantısı kopyalandı!\nOda 72 saat geçerlidir. Katılması için bağlantıyı arkadaşınla paylaş.","Üzgünüz, bağlantı kopyalanırken bir hata oluştu.","Emin misin?","Bu kullanıcı bildirildi.","Sıranı bekle...","Bu odanın süresi dolmuş veya oda mevcut değil.","Bağlantı kesildi","Karşı taraf sohbetten ayrıldı.","(çeviri başarısız)","Çeviri","Mikrofon","Kamera","Yüz efektleri","Ses","Oda bağlantısını kopyala","Bildir","Ayrıl"],
    ru: ["Не удалось получить доступ к камере и микрофону.","Вход в комнату...","Чтобы скопировать ссылку на комнату, сначала нужно подключиться к собеседнику!","✅ Ссылка на комнату скопирована!\nКомната действует 72 часа. Отправьте ссылку другу, чтобы он присоединился.","Извините, при копировании ссылки произошла ошибка.","Точно?","Жалоба на этого пользователя отправлена.","Дождитесь своей очереди...","Срок действия комнаты истёк, или она не существует.","Соединение разорвано","Собеседник покинул чат.","(не удалось перевести)","Перевод","Микрофон","Камера","Эффекты лица","Звук","Копировать ссылку на комнату","Пожаловаться","Выйти"],
    hi: ["कैमरा और माइक्रोफ़ोन तक पहुँच नहीं मिल सकी।","रूम में शामिल हो रहे हैं...","रूम लिंक कॉपी करने के लिए पहले किसी से जुड़ना ज़रूरी है!","✅ रूम लिंक कॉपी हो गया!\nरूम 72 घंटे तक मान्य है। शामिल होने के लिए लिंक अपने दोस्त को भेजें।","माफ़ कीजिए, लिंक कॉपी करते समय त्रुटि हुई।","पक्का?","इस यूज़र की रिपोर्ट दर्ज कर ली गई है।","अपनी बारी का इंतज़ार करें...","यह रूम समाप्त हो चुका है या मौजूद नहीं है।","कनेक्शन टूट गया","दूसरे व्यक्ति ने चैट छोड़ दी।","(अनुवाद विफल रहा)","अनुवाद","माइक्रोफ़ोन","कैमरा","फ़ेस इफ़ेक्ट","आवाज़","रूम लिंक कॉपी करें","रिपोर्ट करें","बाहर निकलें"],
    id: ["Tidak dapat mengakses kamera dan mikrofon.","Bergabung ke ruang...","Kamu harus terhubung dengan seseorang dulu untuk menyalin tautan ruang!","✅ Tautan ruang berhasil disalin!\nRuang berlaku selama 72 jam. Bagikan tautan ke temanmu agar bisa bergabung.","Maaf, terjadi kesalahan saat menyalin tautan.","Yakin?","Pengguna ini telah dilaporkan.","Tunggu giliranmu...","Ruang ini sudah kedaluwarsa atau tidak ada.","Terputus","Lawan bicara telah meninggalkan obrolan.","(terjemahan gagal)","Terjemahan","Mikrofon","Kamera","Efek wajah","Suara","Salin tautan ruang","Laporkan","Keluar"],
    zh: ["无法访问摄像头和麦克风。","正在加入房间...","需要先与某人连接，才能复制房间链接！","✅ 房间链接已复制！\n房间有效期为 72 小时，把链接分享给朋友即可加入。","抱歉，复制链接时出错。","确定吗？","已举报该用户。","请等待你的回合...","该房间已过期或不存在。","连接已断开","对方已离开聊天。","（翻译失败）","翻译","麦克风","摄像头","面部特效","声音","复制房间链接","举报","离开"]
  };

  // دمج بدل الاستبدال: عشان مفاتيح الـ FAQ (faq3..faq8) الموجودة في script.js ما تضيعش
  Object.keys(NEW_LANGS).forEach(l => { translations[l] = Object.assign({}, translations[l] || {}, NEW_LANGS[l]); });
  Object.keys(V).forEach(l => {
    translations[l] = translations[l] || {};
    K.forEach((k, i) => { translations[l][k] = V[l][i]; });
  });
  // تصحيح: عنوان البرتغالي كان فيه كلمة فرنسية (aléatoire)
  translations.pt.siteTitle = "Randly - Chat aleatório de vídeo e texto com estranhos";
})();

// ---------- 3) قايمة اللغات الموحدة (12 لغة) ----------
const RANDLY_LANGS = [
  ['ar', 'العربية'], ['en', 'English'], ['es', 'Español'], ['fr', 'Français'],
  ['de', 'Deutsch'], ['it', 'Italiano'], ['pt', 'Português'], ['tr', 'Türkçe'],
  ['ru', 'Русский'], ['hi', 'हिन्दी'], ['id', 'Bahasa Indonesia'], ['zh', '中文']
];
let randlyLangReady = false;

// نصوص رابط "المدونة" بكل لغة (مستقلة عن translations[lang] القديم)
const BLOG_LABELS = {
  ar: 'المدونة', en: 'Blog', es: 'Blog', fr: 'Blog', de: 'Blog', it: 'Blog', pt: 'Blog',
  tr: 'Blog', ru: 'Блог', hi: 'ब्लॉग', id: 'Blog', zh: '博客'
};

const CAMERA_MESSAGES = {
  ar: ['اظهر وجهك أمام الكاميرا للعثور على شخص والتواصل معه', 'لازم تسمح بالكاميرا وتظهر وجهك قبل بدء المحادثة.'],
  en: ['Show your face to find a match and start chatting', 'Allow camera access and show your face before starting.'],
  es: ['Muestra tu cara para encontrar una persona y empezar a chatear', 'Permite el acceso a la cámara y muestra tu cara antes de empezar.'],
  fr: ['Montrez votre visage pour trouver quelqu’un et commencer à discuter', 'Autorisez l’accès à la caméra et montrez votre visage avant de commencer.'],
  de: ['Zeige dein Gesicht, um eine Verbindung zu finden und zu chatten', 'Erlaube den Kamerazugriff und zeige dein Gesicht, bevor du beginnst.'],
  it: ['Mostra il tuo volto per trovare una persona e iniziare a chattare', 'Consenti l’accesso alla fotocamera e mostra il tuo volto prima di iniziare.'],
  pt: ['Mostre seu rosto para encontrar alguém e começar a conversar', 'Permita o acesso à câmera e mostre seu rosto antes de começar.'],
  tr: ['Eşleşmek ve sohbete başlamak için yüzünü göster', 'Başlamadan önce kamera erişimine izin ver ve yüzünü göster.'],
  ru: ['Покажите лицо, чтобы найти собеседника и начать общение', 'Разрешите доступ к камере и покажите лицо перед началом.'],
  hi: ['मैच खोजने और चैट शुरू करने के लिए अपना चेहरा दिखाएँ', 'शुरू करने से पहले कैमरा एक्सेस की अनुमति दें और अपना चेहरा दिखाएँ।'],
  id: ['Tampilkan wajah Anda untuk menemukan pasangan dan mulai mengobrol', 'Izinkan akses kamera dan tampilkan wajah Anda sebelum memulai.'],
  zh: ['展示你的脸部即可寻找匹配并开始聊天', '开始前请允许摄像头访问并展示你的脸部。']
};
Object.entries(CAMERA_MESSAGES).forEach(([lang, [showFaceMessage, cameraRequired]]) => {
  if (typeof translations !== 'undefined' && translations[lang]) {
    translations[lang].showFaceMessage = showFaceMessage;
    translations[lang].cameraRequired = cameraRequired;
  }
});

// ترجمة أي رسالة ديناميكية حسب لغة الصفحة الحالية
function tr(key) {
  const l = document.documentElement.lang || 'ar';
  return (translations[l] && translations[l][key]) || translations.en[key] || key;
}

function fillLangSelects(current) {
  ['landingLangSelect', 'siteLang'].forEach(id => {
    const s = document.getElementById(id);
    if (!s) return;
    s.innerHTML = RANDLY_LANGS.map(([c, n]) => `<option value="${c}"${c === current ? ' selected' : ''}>${n}</option>`).join('');
  });
  const tl = document.getElementById('translationLang');
  if (tl) {
    const keep = tl.value || 'none';
    tl.innerHTML = '<option value="none" data-i18n="noTranslation">' + tr('noTranslation') + '</option>' +
      RANDLY_LANGS.map(([c, n]) => `<option value="${c}">${n}</option>`).join('');
    tl.value = keep;
  }
}

function applyLanguage(lang, initial) {
  const t = translations[lang];
  const root = document.documentElement;
  root.setAttribute('lang', lang);
  root.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');

  document.querySelectorAll('[data-i18n]').forEach(el => {
    let key = el.getAttribute('data-i18n');
    if (el.tagName === 'H1') { if (initial) return; key = 'siteTitle'; } // نخلي H1 الثابت (للسيو) زي ما هو أول تحميل
    if (t[key]) el.textContent = t[key];
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const k = el.getAttribute('data-i18n-placeholder');
    if (t[k]) el.setAttribute('placeholder', t[k]);
  });

  // تلميحات الأزرار
  const tips = { micBtn: 'tipMic', camBtn: 'tipCam', muteBtn: 'tipSound', copyLinkBtn: 'tipLink' };
  Object.keys(tips).forEach(id => { const el = document.getElementById(id); if (el) el.title = t[tips[id]]; });
  const rep = document.querySelector('[onclick="reportUser()"]'); if (rep) rep.title = t.tipReport;
  const lv = document.querySelector('.btn-close-chat'); if (lv) lv.title = t.tipLeave;
  if (typeof updateControlLabels === 'function') updateControlLabels();

  // رابط "المدونة/Blog" في الفوتر: يتحدث نصه ورابطه مع تغيير اللغة
  const blogLink = document.getElementById('footerBlogLink');
  if (blogLink) {
    blogLink.textContent = BLOG_LABELS[lang] || 'Blog';
    blogLink.setAttribute('href', lang === 'ar' ? '/blog-ar.html' : '/blog-' + lang + '.html');
  }

  // أسماء الدول تتترجم تلقائياً بلغة الصفحة
  try {
    const names = new Intl.DisplayNames([lang], { type: 'region' });
    document.querySelectorAll('#countrySelect option').forEach(o => {
      if (/^[A-Z]{2}$/.test(o.value)) o.textContent = getFlagEmoji(o.value) + ' ' + names.of(o.value);
    });
    const nameEl = document.getElementById('remoteUserCountryName');
    if (nameEl && currentPartnerCountry && currentPartnerCountry !== 'global') {
      nameEl.textContent = '- ' + names.of(currentPartnerCountry.toUpperCase());
    }
  } catch (e) {}

  ['landingLangSelect', 'siteLang'].forEach(id => { const s = document.getElementById(id); if (s) s.value = lang; });

  if (!initial) {
    document.title = t.siteTitle;
    localStorage.setItem('randly_lang', lang);
  }
}

// بديل changeGlobalLanguage: من الصفحة الرئيسية يفتح صفحة اللغة، ومن جوه الشات يغيّر مكانه
function changeGlobalLanguage(lang) {
  if (!translations[lang]) lang = 'en';
  const landing = document.getElementById('landingPage');
  const onLanding = landing && getComputedStyle(landing).display !== 'none';
  if (randlyLangReady && onLanding && lang !== document.documentElement.lang) {
    localStorage.setItem('randly_lang', lang);
    location.href = lang === 'ar' ? '/' : '/' + lang + '.html';
    return;
  }
  applyLanguage(lang, false);
}

// لغة الصفحة تتحدد من <html lang> بتاعها (مش من localStorage) — يشتغل بعد مستمع script.js
window.addEventListener('DOMContentLoaded', () => {
  const pageLang = translations[document.documentElement.lang] ? document.documentElement.lang : 'en';
  fillLangSelects(pageLang);
  applyLanguage(pageLang, true);
  randlyLangReady = true;
});