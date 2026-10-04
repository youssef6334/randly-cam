#!/usr/bin/env node
/**
 * patch-languages.js — سكريبت واحد مستقل (من غير ملفات JSON إضافية).
 * بيعدّل صفحات HTML بكل اللغات (es, fr, de, it, pt, tr, ru, hi, id, zh) بنفس تعديلات العربي والإنجليزي:
 *   - ترتيب الـ head (charset أول عنصر) وحذف الـ favicon المكرر
 *   - الـ H1 ثابت، وFAQ Schema واحد مطابق للنص الظاهر، وإضافة WebApplication schema
 *   - استبدال ادعاءات الأمان (فلترة/حماية تلقائية) بنص صادق مترجم
 *   - صفحات about: عنوان/وصف/H1 مميزين + حذف جملة "Omegle بقى بفلوس"
 *   - صفحات post-omegle-alternative: إصلاح قائمة الأمان وصف الجدول وإجابة الـ FAQ
 *   - إضافة <script src="randly-extra.js"> ورابط الشروط والأحكام في الفوتر
 *
 * الاستخدام (من جذر المشروع):
 *   node patch-languages.js --dry     # معاينة بس، من غير ما يكتب أي حاجة
 *   node patch-languages.js           # تطبيق
 *   node patch-languages.js ./public  # مسار مختلف
 *   node patch-languages.js --no-backup   # من غير ملفات .bak
 *
 * آمن للتشغيل أكتر من مرة، ومبيلمسش أي صفحة شكلها مختلف عن القالب (بيكتبها في "مراجعة يدوية").
 */
const fs = require('fs');
const path = require('path');

// ============ البيانات (مدمجة) ============
const claims = {
 "ar": {
  "feat4Desc": "ميزة إبلاغ فورية وحظر مؤقت تلقائي للمستخدمين المخالفين لإبقاء المحادثات محترمة.",
  "faq3A": "Randly من أفضل البدائل لموقع أوميغل، حيث يوفر شات فيديو ونصي عشوائي مع الغرباء مجاناً وبدون تسجيل، مع ميزة إبلاغ وحظر مؤقت للمخالفين ومطابقة حسب الاهتمامات.",
  "faq4A": "يوفر Randly ميزة إبلاغ فورية ويحظر تلقائياً بشكل مؤقت المستخدمين الذين يتلقون بلاغات متعددة، ولا يخزّن محادثاتك ولا يطلب منك تسجيل بيانات شخصية. ومع ذلك تحدّث بحذر ولا تشارك معلوماتك الخاصة مع الغرباء.",
  "termsLink": "الشروط والأحكام",
  "onlineNow": "المتصلون الآن"
 },
 "en": {
  "feat4Desc": "An instant report button and automatic temporary bans for violators, to help keep chats respectful.",
  "faq3A": "Randly is one of the best alternatives to Omegle, offering free random video and text chat with strangers with no registration, plus a report feature with temporary bans for violators and interest-based matching.",
  "faq4A": "Randly offers an instant report feature and automatically applies temporary bans to users who receive multiple reports. It does not store your conversations or ask for personal registration. Still, chat with care and never share private information with strangers.",
  "termsLink": "Terms of Service"
 },
 "es": {
  "feat4Desc": "Botón de denuncia instantánea y bloqueos temporales automáticos para quienes infrinjan las normas, para mantener los chats respetuosos.",
  "faq3A": "Randly es una de las mejores alternativas a Omegle: ofrece chat de video y texto aleatorio gratis con extraños, sin registro, con función de denuncia y bloqueos temporales para infractores, y coincidencia por intereses.",
  "faq4A": "Randly ofrece denuncia instantánea y aplica bloqueos temporales automáticos a los usuarios que reciben varias denuncias. No almacena tus conversaciones ni te pide registrar datos personales. Aun así, chatea con cuidado y no compartas información privada con extraños.",
  "termsLink": "Términos"
 },
 "fr": {
  "feat4Desc": "Signalement instantané et blocages temporaires automatiques pour les contrevenants, afin de garder des conversations respectueuses.",
  "faq3A": "Randly est l'une des meilleures alternatives à Omegle : chat vidéo et texte aléatoire gratuit avec des inconnus, sans inscription, avec signalement et blocages temporaires des contrevenants, et mise en relation par centres d'intérêt.",
  "faq4A": "Randly propose un signalement instantané et applique automatiquement des blocages temporaires aux utilisateurs qui reçoivent plusieurs signalements. Il ne stocke pas vos conversations et ne demande aucune inscription de données personnelles. Restez toutefois prudent et ne partagez jamais d'informations privées avec des inconnus.",
  "termsLink": "Conditions d'utilisation"
 },
 "de": {
  "feat4Desc": "Sofort-Meldefunktion und automatische vorübergehende Sperren für Regelverstöße, damit Chats respektvoll bleiben.",
  "faq3A": "Randly ist eine der besten Alternativen zu Omegle: kostenloser zufälliger Video- und Textchat mit Fremden ohne Registrierung, mit Meldefunktion und vorübergehenden Sperren für Regelverstöße sowie Interessen-Matching.",
  "faq4A": "Randly bietet eine Sofort-Meldefunktion und sperrt Nutzer automatisch vorübergehend, wenn sie mehrfach gemeldet werden. Chats werden nicht gespeichert und es ist keine Registrierung persönlicher Daten nötig. Trotzdem gilt: Sei vorsichtig und gib keine privaten Informationen an Fremde weiter.",
  "termsLink": "Nutzungsbedingungen"
 },
 "it": {
  "feat4Desc": "Segnalazione immediata e blocchi temporanei automatici per chi viola le regole, per mantenere le conversazioni rispettose.",
  "faq3A": "Randly è una delle migliori alternative a Omegle: chat video e testo casuale gratuita con sconosciuti, senza registrazione, con segnalazione e blocchi temporanei per chi viola le regole e abbinamento per interessi.",
  "faq4A": "Randly offre la segnalazione immediata e applica automaticamente blocchi temporanei agli utenti che ricevono più segnalazioni. Non memorizza le tue conversazioni e non richiede la registrazione di dati personali. Chatta comunque con prudenza e non condividere informazioni private con gli sconosciuti.",
  "termsLink": "Termini"
 },
 "pt": {
  "feat4Desc": "Denúncia instantânea e bloqueios temporários automáticos para quem violar as regras, para manter as conversas respeitosas.",
  "faq3A": "O Randly é uma das melhores alternativas ao Omegle: chat de vídeo e texto aleatório grátis com estranhos, sem cadastro, com denúncia e bloqueios temporários para infratores e correspondência por interesses.",
  "faq4A": "O Randly oferece denúncia instantânea e aplica bloqueios temporários automáticos a usuários que recebem várias denúncias. Não armazena suas conversas nem exige cadastro de dados pessoais. Mesmo assim, converse com cuidado e nunca compartilhe informações privadas com estranhos.",
  "termsLink": "Termos"
 },
 "tr": {
  "feat4Desc": "Kuralları ihlal edenler için anında bildirim ve otomatik geçici engelleme; sohbetler saygılı kalsın diye.",
  "faq3A": "Randly, kayıt olmadan yabancılarla ücretsiz rastgele görüntülü ve yazılı sohbet sunan, ihlal edenler için bildirim ve geçici engelleme ile ilgi alanına göre eşleştirme özelliği bulunan Omegle'ın en iyi alternatiflerinden biridir.",
  "faq4A": "Randly anında bildirim özelliği sunar ve birden fazla bildirim alan kullanıcıları otomatik olarak geçici süreyle engeller. Sohbetlerinizi saklamaz ve kişisel veri kaydı istemez. Yine de dikkatli olun ve yabancılarla özel bilgilerinizi paylaşmayın.",
  "termsLink": "Kullanım Şartları"
 },
 "ru": {
  "feat4Desc": "Мгновенные жалобы и автоматические временные блокировки нарушителей, чтобы общение оставалось уважительным.",
  "faq3A": "Randly — одна из лучших альтернатив Omegle: бесплатный случайный видео- и текстовый чат с незнакомцами без регистрации, с функцией жалоб и временными блокировками нарушителей, а также подбором по интересам.",
  "faq4A": "В Randly есть мгновенные жалобы, а пользователи, получившие несколько жалоб, автоматически блокируются на время. Мы не храним ваши переписки и не требуем регистрации личных данных. Тем не менее общайтесь осторожно и не делитесь личной информацией с незнакомцами.",
  "termsLink": "Условия использования"
 },
 "hi": {
  "feat4Desc": "नियम तोड़ने वालों के लिए तुरंत रिपोर्ट और स्वचालित अस्थायी ब्लॉक, ताकि चैट सम्मानजनक बनी रहे।",
  "faq3A": "Randly, Omegle के सबसे अच्छे विकल्पों में से एक है: बिना रजिस्ट्रेशन अजनबियों के साथ मुफ्त रैंडम वीडियो और टेक्स्ट चैट, नियम तोड़ने वालों के लिए रिपोर्ट और अस्थायी ब्लॉक की सुविधा, और रुचि-आधारित मिलान के साथ।",
  "faq4A": "Randly तुरंत रिपोर्ट करने की सुविधा देता है और कई रिपोर्ट पाने वाले उपयोगकर्ताओं को स्वचालित रूप से कुछ समय के लिए ब्लॉक कर देता है। यह आपकी बातचीत स्टोर नहीं करता और व्यक्तिगत रजिस्ट्रेशन नहीं माँगता। फिर भी सावधानी से चैट करें और अजनबियों से निजी जानकारी साझा न करें।",
  "termsLink": "नियम एवं शर्तें"
 },
 "id": {
  "feat4Desc": "Laporan instan dan pemblokiran sementara otomatis bagi pelanggar, agar obrolan tetap saling menghormati.",
  "faq3A": "Randly adalah salah satu alternatif terbaik untuk Omegle: video dan text chat acak gratis dengan orang asing tanpa registrasi, dengan fitur laporan dan pemblokiran sementara bagi pelanggar serta pencocokan berdasarkan minat.",
  "faq4A": "Randly menyediakan laporan instan dan otomatis memblokir sementara pengguna yang menerima banyak laporan. Randly tidak menyimpan percakapan Anda dan tidak meminta registrasi data pribadi. Tetap berhati-hati dan jangan bagikan informasi pribadi kepada orang asing.",
  "termsLink": "Syarat & Ketentuan"
 },
 "zh": {
  "feat4Desc": "即时举报功能，并对违规用户自动临时封禁，让聊天保持文明。",
  "faq3A": "Randly 是 Omegle 最好的替代平台之一：无需注册即可与陌生人免费随机视频和文字聊天，提供举报功能和对违规用户的临时封禁，并支持按兴趣匹配。",
  "faq4A": "Randly 提供即时举报功能，并会对收到多次举报的用户自动临时封禁。Randly 不会存储您的聊天记录，也不要求注册个人资料。不过请谨慎聊天，切勿向陌生人透露私人信息。",
  "termsLink": "服务条款"
 }
};
const CONTENT = {
 "es": {
  "aboutP1": "Randly es un sitio gratuito de chat aleatorio de video y texto con personas de todo el mundo. No hay nada que instalar ni cuenta que crear: abre el sitio, elige Chat de Video o Chat de Texto y te conectaremos con alguien que esté en línea ahora.",
  "aboutP4": "Randly es solo para mayores de 18 años. Puedes denunciar a cualquier usuario con un toque, y los usuarios denunciados por varias personas distintas se bloquean automáticamente por un tiempo breve. No grabamos ni almacenamos tus conversaciones y no hace falta cuenta. Ningún sistema de moderación lo detecta todo, así que nunca compartas tu teléfono, dirección ni datos financieros con extraños.",
  "critLi": "Bloqueos temporales automáticos para usuarios que reciben varias denuncias",
  "whyHead": "Privacidad total, sin cuenta",
  "whyLi": "Sin registro y sin conversaciones guardadas; la denuncia instantánea y los bloqueos temporales a infractores ayudan a mantener una comunidad respetuosa.",
  "tableRow": "Denuncias y bloqueos temporales",
  "faqAns1": "Sí: Randly ofrece la misma idea de chat aleatorio de video/texto con extraños, completamente gratis y sin registro, además de una función de denuncia con bloqueos temporales para infractores."
 },
 "fr": {
  "aboutP1": "Randly est un site gratuit de chat vidéo et texte aléatoire avec des personnes du monde entier. Rien à installer et aucun compte à créer : ouvrez le site, choisissez Chat Vidéo ou Chat Texte, et vous êtes mis en relation avec quelqu'un de connecté en ce moment.",
  "aboutP4": "Randly est réservé aux adultes de 18 ans et plus. Vous pouvez signaler n'importe quel utilisateur d'un seul geste, et les utilisateurs signalés par plusieurs personnes différentes sont automatiquement bloqués pour une courte durée. Nous n'enregistrons ni ne stockons vos conversations, et aucun compte n'est requis. Aucune modération n'attrape tout : ne partagez jamais votre téléphone, votre adresse ou vos données financières avec des inconnus.",
  "critLi": "Blocages temporaires automatiques pour les utilisateurs qui reçoivent plusieurs signalements",
  "whyHead": "Confidentialité, sans compte",
  "whyLi": "Sans inscription et sans conversations stockées ; le signalement instantané et les blocages temporaires des contrevenants aident à garder une communauté respectueuse.",
  "tableRow": "Signalement et blocages temporaires",
  "faqAns1": "Oui : Randly propose la même idée de chat vidéo/texte aléatoire avec des inconnus, entièrement gratuit et sans inscription, avec en plus un signalement et des blocages temporaires pour les contrevenants."
 },
 "de": {
  "aboutP1": "Randly ist eine kostenlose Website für zufälligen Video- und Textchat mit Menschen auf der ganzen Welt. Es muss nichts installiert und kein Konto erstellt werden: Website öffnen, Videochat oder Textchat wählen und du wirst mit jemandem verbunden, der gerade online ist.",
  "aboutP4": "Randly ist nur für Erwachsene ab 18 Jahren. Du kannst jeden Nutzer mit einem Tipp melden, und Nutzer, die von mehreren verschiedenen Personen gemeldet werden, werden automatisch kurzzeitig gesperrt. Wir zeichnen deine Gespräche nicht auf und speichern sie nicht; ein Konto ist nicht nötig. Keine Moderation erkennt alles – gib deshalb nie Telefonnummer, Adresse oder Finanzdaten an Fremde weiter.",
  "critLi": "Automatische vorübergehende Sperren für Nutzer mit mehreren Meldungen",
  "whyHead": "Privatsphäre, kein Konto nötig",
  "whyLi": "Keine Anmeldung, keine gespeicherten Chats; Sofort-Meldefunktion und vorübergehende Sperren für Regelverstöße helfen, die Community respektvoll zu halten.",
  "tableRow": "Melden und vorübergehende Sperren",
  "faqAns1": "Ja – Randly bietet dieselbe Idee eines zufälligen Video-/Textchats mit Fremden, völlig kostenlos und ohne Anmeldung, dazu eine Meldefunktion mit vorübergehenden Sperren für Regelverstöße."
 },
 "it": {
  "aboutP1": "Randly è un sito gratuito per chat video e testo casuale con persone di tutto il mondo. Non c'è nulla da installare né un account da creare: apri il sito, scegli Video Chat o Chat Testuale e verrai collegato a qualcuno che è online in questo momento.",
  "aboutP4": "Randly è riservato ai maggiorenni (18+). Puoi segnalare qualsiasi utente con un tocco e gli utenti segnalati da più persone diverse vengono bloccati automaticamente per un breve periodo. Non registriamo né conserviamo le tue conversazioni e non serve alcun account. Nessun sistema di moderazione rileva tutto: non condividere mai telefono, indirizzo o dati finanziari con sconosciuti.",
  "critLi": "Blocchi temporanei automatici per gli utenti che ricevono più segnalazioni",
  "whyHead": "Privacy, nessun account",
  "whyLi": "Nessuna registrazione e nessuna chat salvata; la segnalazione immediata e i blocchi temporanei dei trasgressori aiutano a mantenere una community rispettosa.",
  "tableRow": "Segnalazioni e blocchi temporanei",
  "faqAns1": "Sì: Randly offre la stessa idea di chat video/testo casuale con sconosciuti, completamente gratuita e senza registrazione, con in più segnalazione e blocchi temporanei per chi viola le regole."
 },
 "pt": {
  "aboutP1": "O Randly é um site gratuito de chat aleatório de vídeo e texto com pessoas do mundo todo. Não há nada para instalar nem conta para criar: abra o site, escolha Chat de Vídeo ou Chat de Texto e você será conectado a alguém que está online agora.",
  "aboutP4": "O Randly é apenas para maiores de 18 anos. Você pode denunciar qualquer usuário com um toque, e usuários denunciados por várias pessoas diferentes são bloqueados automaticamente por um curto período. Não gravamos nem armazenamos suas conversas e não é preciso criar conta. Nenhum sistema de moderação pega tudo, por isso nunca compartilhe telefone, endereço ou dados financeiros com estranhos.",
  "critLi": "Bloqueios temporários automáticos para usuários que recebem várias denúncias",
  "whyHead": "Privacidade, sem conta",
  "whyLi": "Sem cadastro e sem conversas armazenadas; a denúncia instantânea e os bloqueios temporários de infratores ajudam a manter a comunidade respeitosa.",
  "tableRow": "Denúncias e bloqueios temporários",
  "faqAns1": "Sim: o Randly oferece a mesma ideia de chat aleatório de vídeo/texto com estranhos, totalmente grátis e sem cadastro, além de denúncia com bloqueios temporários para infratores."
 },
 "tr": {
  "aboutP1": "Randly, dünyanın dört bir yanındaki insanlarla rastgele görüntülü ve yazılı sohbet için ücretsiz bir sitedir. Kurulacak bir şey ve oluşturulacak bir hesap yok: siteyi açın, Görüntülü Sohbet veya Yazılı Sohbet'i seçin ve şu anda çevrimiçi olan biriyle bağlanın.",
  "aboutP4": "Randly yalnızca 18 yaş ve üzeri yetişkinler içindir. Herhangi bir kullanıcıyı tek dokunuşla bildirebilirsiniz; birden fazla farklı kişi tarafından bildirilen kullanıcılar otomatik olarak kısa süreliğine engellenir. Sohbetlerinizi kaydetmeyiz veya saklamayız ve hesap gerekmez. Hiçbir moderasyon her şeyi yakalayamaz; bu yüzden telefon numaranızı, adresinizi veya finansal bilgilerinizi yabancılarla asla paylaşmayın.",
  "critLi": "Birden fazla bildirim alan kullanıcılar için otomatik geçici engelleme",
  "whyHead": "Gizlilik, hesap gerekmez",
  "whyLi": "Kayıt yok, saklanan sohbet yok; anında bildirim ve ihlal edenlere geçici engelleme topluluğun saygılı kalmasına yardımcı olur.",
  "tableRow": "Bildirim ve geçici engelleme",
  "faqAns1": "Evet: Randly, yabancılarla aynı rastgele görüntülü/yazılı sohbet fikrini tamamen ücretsiz ve kayıtsız sunar; ayrıca ihlal edenler için bildirim ve geçici engelleme özelliği vardır."
 },
 "ru": {
  "aboutP1": "Randly — бесплатный сайт для случайного видео- и текстового чата с людьми со всего мира. Ничего не нужно устанавливать и не нужно создавать аккаунт: откройте сайт, выберите видеочат или текстовый чат, и вы окажетесь на связи с тем, кто сейчас онлайн.",
  "aboutP4": "Randly предназначен только для взрослых от 18 лет. Вы можете пожаловаться на любого пользователя одним нажатием, а пользователи, на которых пожаловались несколько разных людей, автоматически блокируются на короткое время. Мы не записываем и не храним ваши переписки, аккаунт не нужен. Никакая модерация не ловит всё, поэтому никогда не сообщайте незнакомцам телефон, адрес или финансовые данные.",
  "critLi": "Автоматические временные блокировки пользователей с несколькими жалобами",
  "whyHead": "Конфиденциальность, без аккаунта",
  "whyLi": "Без регистрации и без хранения переписок; мгновенные жалобы и временные блокировки нарушителей помогают поддерживать уважительное сообщество.",
  "tableRow": "Жалобы и временные блокировки",
  "faqAns1": "Да: Randly предлагает ту же идею случайного видео- и текстового чата с незнакомцами — полностью бесплатно и без регистрации, а также жалобы и временные блокировки нарушителей."
 },
 "hi": {
  "aboutP1": "Randly दुनिया भर के लोगों के साथ रैंडम वीडियो और टेक्स्ट चैट के लिए एक मुफ्त वेबसाइट है। कुछ इंस्टॉल करने या अकाउंट बनाने की ज़रूरत नहीं: साइट खोलें, वीडियो चैट या टेक्स्ट चैट चुनें, और आप अभी ऑनलाइन किसी व्यक्ति से जुड़ जाएंगे।",
  "aboutP4": "Randly सिर्फ़ 18 वर्ष या उससे अधिक उम्र के वयस्कों के लिए है। आप एक टैप में किसी भी उपयोगकर्ता की रिपोर्ट कर सकते हैं, और कई अलग-अलग लोगों द्वारा रिपोर्ट किए गए उपयोगकर्ता कुछ समय के लिए अपने-आप ब्लॉक हो जाते हैं। हम आपकी बातचीत रिकॉर्ड या स्टोर नहीं करते और अकाउंट की ज़रूरत नहीं है। कोई भी मॉडरेशन सब कुछ नहीं पकड़ सकता, इसलिए अजनबियों से अपना फ़ोन नंबर, पता या वित्तीय जानकारी कभी साझा न करें।",
  "critLi": "कई रिपोर्ट पाने वाले उपयोगकर्ताओं के लिए स्वचालित अस्थायी ब्लॉक",
  "whyHead": "गोपनीयता, खाते की ज़रूरत नहीं",
  "whyLi": "कोई रजिस्ट्रेशन नहीं और कोई चैट स्टोर नहीं होती; तुरंत रिपोर्ट और नियम तोड़ने वालों पर अस्थायी ब्लॉक समुदाय को सम्मानजनक बनाए रखने में मदद करते हैं।",
  "tableRow": "रिपोर्ट और अस्थायी ब्लॉक",
  "faqAns1": "हाँ: Randly अजनबियों के साथ वही रैंडम वीडियो/टेक्स्ट चैट का विचार पूरी तरह मुफ्त और बिना रजिस्ट्रेशन देता है, साथ ही नियम तोड़ने वालों के लिए रिपोर्ट और अस्थायी ब्लॉक की सुविधा भी।"
 },
 "id": {
  "aboutP1": "Randly adalah situs gratis untuk video dan text chat acak dengan orang dari seluruh dunia. Tidak ada yang perlu diinstal dan tidak perlu membuat akun: buka situs, pilih Video Chat atau Text Chat, lalu Anda terhubung dengan seseorang yang sedang online.",
  "aboutP4": "Randly hanya untuk dewasa berusia 18 tahun ke atas. Anda dapat melaporkan pengguna mana pun dengan satu ketukan, dan pengguna yang dilaporkan oleh beberapa orang berbeda otomatis diblokir untuk waktu singkat. Kami tidak merekam atau menyimpan percakapan Anda dan tidak perlu akun. Tidak ada moderasi yang menangkap semuanya, jadi jangan pernah membagikan nomor telepon, alamat, atau data keuangan kepada orang asing.",
  "critLi": "Pemblokiran sementara otomatis bagi pengguna yang menerima banyak laporan",
  "whyHead": "Privasi, tanpa akun",
  "whyLi": "Tanpa registrasi dan tanpa percakapan tersimpan; laporan instan dan pemblokiran sementara bagi pelanggar membantu menjaga komunitas tetap saling menghormati.",
  "tableRow": "Laporan & pemblokiran sementara",
  "faqAns1": "Ya: Randly menawarkan ide video/text chat acak dengan orang asing yang sama, sepenuhnya gratis dan tanpa registrasi, ditambah fitur laporan dengan pemblokiran sementara bagi pelanggar."
 },
 "zh": {
  "aboutP1": "Randly 是一个免费网站，可与世界各地的人进行随机视频和文字聊天。无需安装任何软件，也无需创建账号：打开网站，选择视频聊天或文字聊天，即可与当前在线的人连线。",
  "aboutP4": "Randly 仅供年满 18 岁的成年人使用。您可以一键举报任何用户，被多位不同用户举报的用户会被自动临时封禁一小段时间。我们不会录制或存储您的聊天内容，也无需账号。任何审核机制都无法发现所有问题，因此请勿向陌生人透露电话号码、住址或财务信息。",
  "critLi": "对收到多次举报的用户自动临时封禁",
  "whyHead": "保护隐私，无需账号",
  "whyLi": "无需注册，不存储聊天记录；即时举报和对违规者的临时封禁有助于保持社区文明。",
  "tableRow": "举报与临时封禁",
  "faqAns1": "是的：Randly 提供同样的与陌生人随机视频/文字聊天，完全免费且无需注册，并提供举报功能和对违规者的临时封禁。"
 }
};

// ============ تحديد مجلد الصفحات ============
const argDir = process.argv.slice(2).find(a => !a.startsWith('--'));
const candidates = argDir ? [argDir] : [path.join(process.cwd(), 'public'), process.cwd(), path.join(__dirname, 'public'), __dirname];
const dir = path.resolve(candidates.find(d => { try { return fs.readdirSync(d).some(f => f.endsWith('.html')); } catch (e) { return false; } }) || candidates[0]);
const DRY = process.argv.includes('--dry');
const NO_BACKUP = process.argv.includes('--no-backup');
const LANGS = Object.keys(claims);
console.log('المجلد: ' + dir + (DRY ? '  (معاينة فقط)' : ''));
if (!fs.existsSync(path.join(dir, 'randly-extra.js'))) {
  console.log('⚠ تنبيه: randly-extra.js مش موجود في هذا المجلد. لازم تنسخه جنب script.js وإلا الصفحات هتحمّل ملف ناقص.');
}

const ABOUT = {
  ar: ['عن Randly - منصة دردشة فيديو ونص عشوائية مجانية', 'عن Randly: دردشة فيديو ونص عشوائية بدون تسجيل', 'تعرّف على Randly: موقع مجاني للدردشة العشوائية بالفيديو والنص مع أشخاص من حول العالم، بدون تسجيل، مع مطابقة بالاهتمامات واختيار الدولة.'],
  en: ['About Randly - Free Random Video & Text Chat', 'About Randly: Free Random Video and Text Chat Without Sign-Up', 'Learn about Randly: a free random video and text chat with people around the world, no sign-up, with interest matching and country selection.'],
  es: ['Acerca de Randly - Chat aleatorio de video y texto gratis', 'Acerca de Randly: chat aleatorio de video y texto sin registro', 'Conoce Randly: chat aleatorio gratuito de video y texto con personas de todo el mundo, sin registro, con coincidencia por intereses y selección de país.'],
  fr: ['À propos de Randly - Chat vidéo et texte aléatoire gratuit', 'À propos de Randly : chat vidéo et texte aléatoire sans inscription', "Découvrez Randly : chat vidéo et texte aléatoire gratuit avec des personnes du monde entier, sans inscription, avec mise en relation par intérêts et choix du pays."],
  de: ['Über Randly - Kostenloser zufälliger Video- und Textchat', 'Über Randly: zufälliger Video- und Textchat ohne Anmeldung', 'Lerne Randly kennen: kostenloser zufälliger Video- und Textchat mit Menschen weltweit, ohne Anmeldung, mit Interessen-Matching und Länderauswahl.'],
  it: ['Chi siamo - Randly, chat video e testo casuale gratuita', 'Chi è Randly: chat video e testo casuale senza registrazione', 'Scopri Randly: chat video e testo casuale gratuita con persone di tutto il mondo, senza registrazione, con abbinamento per interessi e scelta del paese.'],
  pt: ['Sobre o Randly - Chat aleatório de vídeo e texto grátis', 'Sobre o Randly: chat aleatório de vídeo e texto sem cadastro', 'Conheça o Randly: chat aleatório gratuito de vídeo e texto com pessoas do mundo todo, sem cadastro, com correspondência por interesses e escolha de país.'],
  tr: ['Randly Hakkında - Ücretsiz Rastgele Görüntülü ve Yazılı Sohbet', 'Randly Hakkında: Kayıt Gerektirmeyen Rastgele Sohbet', "Randly'yi tanıyın: dünyanın dört bir yanından insanlarla ücretsiz rastgele görüntülü ve yazılı sohbet; kayıt yok, ilgi alanı eşleştirme ve ülke seçimi var."],
  ru: ['О Randly - бесплатный случайный видео- и текстовый чат', 'О Randly: случайный видео- и текстовый чат без регистрации', 'Узнайте о Randly: бесплатный случайный видео- и текстовый чат с людьми со всего мира, без регистрации, с подбором по интересам и выбором страны.'],
  hi: ['Randly के बारे में - मुफ्त रैंडम वीडियो और टेक्स्ट चैट', 'Randly के बारे में: बिना रजिस्ट्रेशन रैंडम चैट', 'Randly के बारे में जानें: दुनिया भर के लोगों के साथ मुफ्त रैंडम वीडियो और टेक्स्ट चैट, बिना रजिस्ट्रेशन, रुचि-आधारित मिलान और देश चुनने की सुविधा के साथ।'],
  id: ['Tentang Randly - Video dan Text Chat Acak Gratis', 'Tentang Randly: Chat Acak Tanpa Registrasi', 'Kenali Randly: video dan text chat acak gratis dengan orang dari seluruh dunia, tanpa registrasi, dengan pencocokan minat dan pilihan negara.'],
  zh: ['关于 Randly - 免费随机视频和文字聊天', '关于 Randly：无需注册的随机聊天', '了解 Randly：与世界各地的人免费随机视频和文字聊天，无需注册，支持兴趣匹配和国家选择。']
};

const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attrEsc = t => esc(t).replace(/"/g, '&quot;');
const decode = t => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const strip = t => decode(t.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
const ldBlock = o => `<script type="application/ld+json">\n${JSON.stringify(o, null, 2)}\n</script>`;


// ---------- إصلاح بنيوي لصفحات المحتوى بلغات ما اتشافتش (about-xx / post-omegle-alternative-xx) ----------
// بيتطبق بس لو شكل الصفحة مطابق للقالب المعروف (ar/en)، وإلا بيتسجل كـ "مراجعة يدوية" من غير ما يتغير حاجة.
function fixAbout(html, c) {
  const m = html.match(/(<main[^>]*>)([\s\S]*?)(<\/main>)/);
  if (!m) return { html, why: 'مفيش <main>' };
  const inner = m[2];
  if ((inner.match(/<h2\b/g) || []).length !== 5) return { html, why: 'عدد h2 مش 5' };
  const paras = [...inner.matchAll(/<p(?![^>]*\bstyle=)[^>]*>([\s\S]*?)<\/p>/g)];
  if (paras.length !== 6) return { html, why: 'عدد الفقرات مش 6' };
  let out = inner;
  [[0, c.aboutP1], [3, c.aboutP4]].reverse().forEach(([i, text]) => {
    const pm = paras[i];
    out = out.slice(0, pm.index) + pm[0].replace(pm[1], '\n' + esc(text) + '\n') + out.slice(pm.index + pm[0].length);
  });
  return { html: html.replace(m[0], m[1] + out + m[3]) };
}

function fixOmegleAlt(html, c) {
  const uls = [...html.matchAll(/<ul>([\s\S]*?)<\/ul>/g)];
  if (uls.length < 3) return { html, why: 'أقل من 3 قوائم' };
  const lis = u => [...u[1].matchAll(/<li>([\s\S]*?)<\/li>/g)];
  const crit = lis(uls[0]), why = lis(uls[1]);
  if (crit.length !== 5 || why.length !== 5 || !why.every(l => /<strong>/.test(l[1]))) return { html, why: 'شكل القوائم مختلف' };
  const rows = [...html.matchAll(/<tr><td>([\s\S]*?)<\/td><td>([\s\S]*?)<\/td><td>([\s\S]*?)<\/td><\/tr>/g)];
  if (rows.length !== 7 || !rows[2][3].includes('✔')) return { html, why: 'شكل الجدول مختلف' };
  const faq = [...html.matchAll(/<p><strong>([\s\S]*?)<\/strong><br>([\s\S]*?)<\/p>/g)];
  if (faq.length !== 3) return { html, why: 'عدد أسئلة الـ FAQ مش 3' };

  // نطبّق من آخر الصفحة لأولها عشان الـ indexes ما تتغيرش
  const absLi = (ul, li) => ul.index + ul[0].indexOf(li[0]);
  const edits = [
    [faq[0].index, faq[0][0], `<p><strong>${faq[0][1]}</strong><br>${esc(c.faqAns1)}</p>`],
    [rows[2].index, rows[2][0], `<tr><td>${esc(c.tableRow)}</td><td>${rows[2][2]}</td><td>${rows[2][3]}</td></tr>`],
    [absLi(uls[1], why[4]), why[4][0], `<li><strong>${esc(c.whyHead)}</strong> — ${esc(c.whyLi)}</li>`],
    [absLi(uls[0], crit[1]), crit[1][0], `<li>${esc(c.critLi)}</li>`]
  ];
  edits.sort((a, b) => b[0] - a[0]);
  let out = html;
  for (const [idx, oldStr, newStr] of edits) out = out.slice(0, idx) + newStr + out.slice(idx + oldStr.length);

  // JSON-LD للـ FAQ يتبني من النص الظاهر
  const items = [...out.matchAll(/<p><strong>([\s\S]*?)<\/strong><br>([\s\S]*?)<\/p>/g)].map(m => ({ q: strip(m[1]), a: strip(m[2]) }));
  const faqLd = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: items.map(i => ({ '@type': 'Question', name: i.q, acceptedAnswer: { '@type': 'Answer', text: i.a } })) };
  out = out.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, (whole, body) => {
    try { if (JSON.parse(body)['@type'] === 'FAQPage') return ldBlock(faqLd); } catch (e) {}
    return whole;
  });
  return { html: out };
}

const files = fs.readdirSync(dir).filter(f => f.endsWith('.html')).sort();
let changed = 0;
const manual = [];

for (const file of files) {
  const fp = path.join(dir, file);
  const original = fs.readFileSync(fp, 'utf8').replace(/\r\n/g, '\n');
  let html = original;
  const lang = (html.match(/<html[^>]*\blang="([^"]+)"/) || [])[1] || 'en';
  const isApp = /<script src="script\.js"><\/script>/.test(html);
  const log = [];
  const before = () => html;
  const note = (what, prev) => { if (html !== prev) log.push(what); };

  // 1) <meta charset> أول عنصر + شيل أيقونات favicon المكررة
  let prev = before();
  html = html.replace(/\n?<meta charset="UTF-8">\s*/gi, '\n');
  html = html.replace(/<head([^>]*)>\s*/, '<head$1>\n<meta charset="UTF-8">\n');
  html = html.replace(/<link rel="icon" type="image\/png" href="favicon\.png">\s*/g, '');
  html = html.replace(/<link rel="apple-touch-icon" href="favicon\.png">\s*/g, '');
  html = html.replace(/\n{3,}/g, '\n\n');
  note('head', prev);

  // 2) الـ H1 ثابت (من غير data-i18n)
  prev = before();
  html = html.replace(/(<h1\b[^>]*?)\s+data-i18n="[^"]*"/g, '$1');
  note('h1', prev);

  // 3) صفحات التطبيق (الرئيسية بكل اللغات)
  if (isApp) {
    prev = before();
    if (!html.includes('randly-extra.js')) html = html.replace(/(<script src="i18n-extra\.js"><\/script>)/, '$1\n<script src="randly-extra.js"></script>');
    note('randly-extra.js', prev);

    const c = claims[lang];
    if (c) {
      prev = before();
      for (const key of ['feat4Desc', 'faq3A', 'faq4A']) {
        const re = new RegExp(`(<(\\w+)[^>]*\\bdata-i18n="${key}"[^>]*>)([\\s\\S]*?)(</\\2>)`);
        if (!re.test(html)) manual.push(`${file}: مفيش data-i18n="${key}" - الادعاءات فيها محتاجة تعديل يدوي`);
        html = html.replace(re, (m, open, tag, _old, close) => open + esc(c[key]) + close);
      }
      if (lang === 'ar') html = html.replace(/(<span data-i18n="onlineNow">)Online Now(<\/span>)/g, `$1${c.onlineNow}$2`);
      note('safety-claims', prev);
    }

    prev = before();
    html = html.replace(/rgba\(255,\s*255,\s*255,\s*0?\.[12]\)/g, 'var(--border-color)');
    note('light-mode borders', prev);

    // FAQ: شيل الـ Microdata واعمل JSON-LD واحد مطابق للنص الظاهر
    prev = before();
    const sec = html.match(/<section class="faq-section"[\s\S]*?<\/section>/);
    if (sec) {
      let s2 = sec[0].replace(/\s+itemscope\b/g, '').replace(/\s+itemprop="[^"]*"/g, '').replace(/\s+itemtype="[^"]*"/g, '');
      html = html.replace(sec[0], s2);
      const items = [];
      const re = /<h3[^>]*class="faq-question"[^>]*>([\s\S]*?)<\/h3>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/g;
      let m; while ((m = re.exec(s2))) items.push({ q: strip(m[1]), a: strip(m[2]) });
      if (items.length) {
        const faq = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: items.map(i => ({ '@type': 'Question', name: i.q, acceptedAnswer: { '@type': 'Answer', text: i.a } })) };
        let replaced = false;
        html = html.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, (whole, body) => {
          try { if (JSON.parse(body)['@type'] === 'FAQPage') { replaced = true; return ldBlock(faq); } } catch (e) {}
          return whole;
        });
        if (!replaced) html = html.replace('</head>', ldBlock(faq) + '\n</head>');
      }
    }
    note('faq-schema', prev);

    // WebApplication schema (لو مش موجود)
    prev = before();
    if (!/"@type":\s*"WebApplication"/.test(html)) {
      const canon = (html.match(/rel="canonical"[^>]*href="([^"]+)"/) || [])[1] || 'https://randly.live/';
      const desc = decode((html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '');
      html = html.replace('</head>', ldBlock({
        '@context': 'https://schema.org', '@type': 'WebApplication', name: 'Randly', url: canon, inLanguage: lang,
        applicationCategory: 'SocialNetworkingApplication', operatingSystem: 'Web', description: desc,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }
      }) + '\n</head>');
    }
    note('webapp-schema', prev);
  }

  // 4) صفحات المحتوى
  if (!isApp) {
    prev = before();
    html = html.replace(/href="index\.html"/g, 'href="/"');
    note('index.html -> /', prev);
    prev = before();
    html = html.replace(/rgba\(255,\s*255,\s*255,\s*0?\.1\)/g, 'var(--border-color)');
    note('light-mode borders', prev);
  }

  // 5) تباين الأزرار (أبيض على أخضر فاتح)
  prev = before();
  html = html.replace(/background:\s*var\(--accent-purple[^)]*\)(\s*;\s*color:\s*#fff)/g, 'background: var(--accent-strong, #00805f)$1');
  note('button contrast', prev);

  // 6) about: عنوان ووصف و H1 مميزين (فصل عن مقال "بديل أوميغل")
  const am = file.match(/^about(?:-([a-z]{2}))?\.html$/);
  if (am) {
    const al = am[1] || 'ar';
    const t = ABOUT[al];
    if (t) {
      prev = before();
      html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(t[0])}</title>`);
      html = html.replace(/(<meta name="description" content=")[^"]*(")/, `$1${attrEsc(t[2])}$2`);
      html = html.replace(/<h1>[\s\S]*?<\/h1>/, `<h1>${esc(t[1])}</h1>`);
      note('about title/h1/description', prev);
    }
  }

  // 6b) إصلاح بنيوي للمحتوى بلغات تانية
  if (!isApp && CONTENT[lang] && (/^about-[a-z]{2}\.html$/.test(file) || /^post-omegle-alternative-[a-z]{2}\.html$/.test(file))) {
    prev = before();
    const r = /^about-/.test(file) ? fixAbout(html, CONTENT[lang]) : fixOmegleAlt(html, CONTENT[lang]);
    if (r.why) manual.push(`${file}: ما اتعدّلش (${r.why}) - راجعه يدوياً`);
    else html = r.html;
    note('safety/content fix', prev);
  }

  // 7) رابط الشروط والأحكام في الفوتر
  prev = before();
  if (/class="footer-links"/.test(html) && !/terms\.html/.test(html)) {
    const label = (claims[lang] || claims.en).termsLink;
    html = html.replace(/(<a href="(\/?)privacy\.html"[^>]*>[^<]*<\/a>)/, (m, a, slash) =>
      `${a}\n<a href="${slash}terms.html"${isApp ? ' data-i18n="termsLink"' : ''}>${esc(label)}</a>`);
  }
  note('terms link', prev);

  if (html !== original) {
    changed++;
    console.log(`${DRY ? '[dry] ' : ''}✔ ${file}: ${log.join(', ') || 'whitespace'}`);
    if (!DRY) { if (!NO_BACKUP) fs.writeFileSync(fp + '.bak', original); fs.writeFileSync(fp, html); }
  }
}

console.log(`\n${changed} ملف اتعدّل من ${files.length}${DRY ? ' (dry run)' : ''}`);
if (manual.length) {
  console.log('\n⚠ محتاجة مراجعة يدوية:');
  manual.forEach(f => console.log('   - ' + f));
}

// فحص أخير: عبارات ادعاءات أمان مرفوضة (إنجليزي/عربي) في أي صفحة
const RISKY = /automatic (content[- ]filter|protection)|automatic content|أنظمة حماية تلقائية|فلترة تلقائية|الذكاء الاصطناعي|AI moderation|Omegle (now )?(costs|started requiring)|أوميجل بقى بفلوس|بعد ما موقع Omegle بقى محتاج اشتراك/i;
let risky = 0;
for (const f of files) {
  const t = fs.readFileSync(path.join(dir, f), 'utf8');
  const m = t.match(RISKY);
  if (m) { risky++; console.log(`🔎 ${f}: لسه فيها "${m[0]}"`); }
}
if (!risky) console.log('\n✔ مفيش ادعاءات أمان/Omegle مرفوضة باقية (في اللي اتفحص)');