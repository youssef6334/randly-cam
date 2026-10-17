// defer-ads.js
// بيأجل تحميل سكريبتات الإعلانات (Adsterra) لحد ما الصفحة تخلص تحميل،
// من غير ما يغيّر مكانهم أو شكلهم أو طريقة ظهورهم خالص.
// شغله بـ: node defer-ads.js

const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const MARKER = 'ads-deferred-by-script';

const files = fs.readdirSync(DIR).filter(f => f.endsWith('.html'));

let processed = 0, skipped = 0;

// أي سطر <script ...src="....effectivecpmnetwork.com...."...></script>
// هنحوله لتحميل مؤجل بعد اكتمال تحميل الصفحة (window load)
const AD_SCRIPT_REGEX = /<script\b([^>]*?)\bsrc="(https:\/\/pl\d+\.effectivecpmnetwork\.com\/[^"]+)"([^>]*)><\/script>/g;

files.forEach(file => {
  const filePath = path.join(DIR, file);
  let content = fs.readFileSync(filePath, 'utf8');

  if (content.includes(MARKER)) {
    console.log(`⏭️  متخطي (معمول قبل كده): ${file}`);
    skipped++;
    return;
  }

  let count = 0;
  content = content.replace(AD_SCRIPT_REGEX, (match, before, url) => {
    count++;
    return `<script>/* ${MARKER} */
window.addEventListener('load', function() {
  var s = document.createElement('script');
  s.async = true;
  s.setAttribute('data-cfasync', 'false');
  s.src = "${url}";
  (document.getElementById('adContent') || document.body).appendChild(s);
});
</script>`;
  });

  if (count > 0) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ اتأجل ${count} إعلان في: ${file}`);
    processed++;
  } else {
    console.log(`⏭️  مفيش إعلانات اتلقت في: ${file}`);
    skipped++;
  }
});

console.log(`\nخلاص. اتعدّل: ${processed} صفحة | اتخطى: ${skipped} صفحة`);
console.log('الإعلان هيفضل في نفس المكان بالظبط، بس هيتحمل بعد ما باقي الصفحة تخلص.');
