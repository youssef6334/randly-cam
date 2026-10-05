# Randly 1.2.0

## التركيب
1. نسخة احتياطية من مشروعك.
2. انسخ الملفات فوق المشروع (كل ملفات الواجهة جوه `public/`، بما فيها `sounds/` الجديد).
3. `npm install`
4. `node patch-languages.js --dry` ثم `node patch-languages.js` (يعدّل صفحات اللغات الـ10).
5. `node server.js` وجرّب محلياً.

## متغيرات البيئة (Azure > Environment variables)
| الاسم | القيمة |
|---|---|
| NODE_ENV | production |
| ALLOWED_ORIGINS | https://randly.live,https://www.randly.live,https://<app>.azurewebsites.net |
| BEHIND_CLOUDFLARE | true (بس لو النطاق ماشي عبر Cloudflare) |
| TURN_URLS / TURN_USERNAME / TURN_CREDENTIAL | بيانات TURN |
| GOOGLE_TRANSLATE_API_KEY | اختياري: Cloud Translation الرسمي (من غيره بيستخدم endpoint غير رسمي) |
| MAX_CONN_PER_IP | اختياري، الافتراضي 25 |
| REPORT_THRESHOLD / BAN_MINUTES | اختياري: 3 بلاغات / 15 دقيقة |
| EXIT_ON_UNCAUGHT | true لو الاستضافة بتعيد التشغيل تلقائياً |

Azure: Web sockets = On، Always On، وinstance واحد.

## ملاحظات
- عداد المتصلين مخفي لو أقل من 3 (غيّر `MIN_ONLINE_BADGE` في `public/randly-extra.js`).
- أصوات الإشعارات `public/sounds/*.wav` مولّدة محلياً، استبدلها بأي ملفات بنفس الأسماء.
- صفحات القوانين: عربي + إنجليزي. باقي اللغات بتفتح الإنجليزي.
