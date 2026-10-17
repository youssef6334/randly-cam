#!/usr/bin/env node
/**
 * setup-nsfw.js — بيجهّز فحص العري. شغّله مرة واحدة على جهازك (محتاج إنترنت و Node و npm):
 *     node setup-nsfw.js
 * بينزّل مكتبتي tfjs و nsfwjs من npm في فولدر مؤقت، وبينسخ منهم 3 حاجات لموقعك:
 *     public/vendor/tf.min.js
 *     public/vendor/nsfwjs.min.js
 *     public/models/nsfw/   (model.json + ملفات الأوزان)
 * وبعدين بيمسح الفولدر المؤقت. الملفات دي بتتحمّل عند اللي يبدأ فيديو بس (مش في الصفحة الرئيسية).
 * خيارات:  --from <فولدر>   استخدم node_modules جاهزة بدل ما تنزّل  (للتجربة)
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = process.cwd();
const publicDir = fs.existsSync(path.join(root, 'public')) ? path.join(root, 'public') : root;
const fromIdx = process.argv.indexOf('--from');
const tmp = path.join(root, '.nsfw-tmp');
const nm = fromIdx > -1 ? path.resolve(process.argv[fromIdx + 1]) : path.join(tmp, 'node_modules');

function walk(dir, cb) {
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const e of ents) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, cb); else cb(p); }
}
function find(dir, pred) { const out = []; walk(dir, p => { if (pred(p)) out.push(p); }); return out; }
const mb = f => (fs.statSync(f).size / 1048576).toFixed(1) + ' MB';
function fail(msg) { console.error('\n✗ ' + msg); cleanup(); process.exit(1); }
function cleanup() { if (fromIdx === -1) try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} }

if (fromIdx === -1) {
  console.log('… بنزّل tfjs و nsfwjs من npm (ممكن ياخد دقيقة)');
  fs.mkdirSync(tmp, { recursive: true });
  try {
    execSync('npm install --no-audit --no-fund --prefix "' + tmp + '" @tensorflow/tfjs nsfwjs', { stdio: 'inherit' });
  } catch (e) { fail('npm فشل. اتأكد إن عندك إنترنت وإن npm شغّال، وجرّب تاني.'); }
}
if (!fs.existsSync(nm)) fail('مش لاقي node_modules في: ' + nm);

// 1) tf.min.js
let tf = find(path.join(nm, '@tensorflow', 'tfjs'), p => path.basename(p) === 'tf.min.js');
tf = tf.find(p => p.split(path.sep).slice(-2)[0] === 'dist') || tf[0];
if (!tf) fail('مش لاقي tf.min.js جوه @tensorflow/tfjs.');

// 2) nsfwjs.min.js (نسخة المتصفح الجاهزة)
const lib = find(path.join(nm, 'nsfwjs'), p => path.basename(p) === 'nsfwjs.min.js')[0];
if (!lib) {
  const dist = find(path.join(nm, 'nsfwjs'), p => /dist/.test(p) && /\.js$/.test(p)).slice(0, 15).map(p => path.relative(nm, p));
  fail('النسخة اللي اتنزلت من nsfwjs مفيهاش nsfwjs.min.js.\nالملفات اللي لقيتها في dist:\n  ' + (dist.join('\n  ') || '(مفيش)') + '\nابعتلي القايمة دي وأظبطلك السكريبت.');
}

// 3) الموديل: فولدر فيه model.json (نفضّل mobilenet)
const models = find(path.join(nm, 'nsfwjs'), p => path.basename(p) === 'model.json');
if (!models.length) fail('مش لاقي model.json جوه حزمة nsfwjs.\nنزّل فولدر الموديل بإيدك من صفحة المشروع على GitHub (infinitered/nsfwjs، فولدر models) وحطه في ' + path.join(publicDir, 'models', 'nsfw') + ' وبعدين شغّل الموقع.');
const pick = models.find(p => /mobilenet/i.test(p)) || models[0];
const modelSrc = path.dirname(pick);

// نسخ
const vend = path.join(publicDir, 'vendor'), mdir = path.join(publicDir, 'models', 'nsfw');
fs.mkdirSync(vend, { recursive: true });
fs.mkdirSync(mdir, { recursive: true });
fs.copyFileSync(tf, path.join(vend, 'tf.min.js'));
fs.copyFileSync(lib, path.join(vend, 'nsfwjs.min.js'));
let n = 0;
for (const f of fs.readdirSync(modelSrc)) { const s = path.join(modelSrc, f); if (fs.statSync(s).isFile()) { fs.copyFileSync(s, path.join(mdir, f)); n++; } }

console.log('\n✔ تمام:');
console.log('  ' + path.relative(root, path.join(vend, 'tf.min.js')) + '  (' + mb(path.join(vend, 'tf.min.js')) + ')');
console.log('  ' + path.relative(root, path.join(vend, 'nsfwjs.min.js')) + '  (' + mb(path.join(vend, 'nsfwjs.min.js')) + ')');
console.log('  ' + path.relative(root, mdir) + '/  (' + n + ' ملف، من ' + path.relative(nm, modelSrc) + ')');
console.log('\nانشر الملفات دي مع الموقع. الفحص هيشتغل أول ما حد يبدأ فيديو.');
console.log('نصيحة: في Cloudflare أضف Cache Rule تخلي /vendor/* و /models/* مخزّنة (Cache everything)، عشان سيرفرك ما يتحمّلش تحميل الملفات الكبيرة لكل زائر جديد.');
cleanup();
