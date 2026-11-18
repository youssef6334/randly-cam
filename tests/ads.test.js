'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const security=require('../security'),root=path.join(__dirname,'..','public');
const source=fs.readFileSync(path.join(root,'ads.js'),'utf8');

test('Adsterra script permission is limited to chat routes; inline scripts and eval stay blocked',()=>{
 const headers=url=>{const h={};security.headers({url},{setHeader:(k,v)=>h[k]=v});return h;};
 for(const url of ['/','/en.html','/ar.html','/zh.html?x=1']){
  const h=headers(url),csp=h['Content-Security-Policy'];
  const scripts=csp.split(';').find(x=>x.trim().startsWith('script-src '));
  assert.match(scripts,/https:\/\/bicea\.org/);assert.doesNotMatch(scripts,/unsafe-inline|unsafe-eval|https:\s|\*/);
  assert.match(scripts,/https:\/\/ep2\.adtrafficquality\.google/);
  assert.match(csp,/style-src [^;]*https:\/\/fonts\.googleapis\.com/);
  assert.match(csp,/font-src [^;]*https:\/\/fonts\.gstatic\.com/);
  assert.match(csp,/script-src-attr 'none'/);assert.equal(h['X-Frame-Options'],'DENY');
 }
 for(const url of ['/about.html','/en.html/extra','/adsterra-frame.html']){
  const h=headers(url);assert.doesNotMatch(h['Content-Security-Policy'],/bicea\.org|unsafe-eval|sandbox/);
  assert.equal(h['X-Frame-Options'],'DENY');
 }
 assert.equal(headers('/adsterra-frame.html')['X-Robots-Tag'],'noindex, nofollow');
});

test('all 12 languages use one shared loader, approved codes, and no iframe placement or duplicate legacy loader',()=>{
 const pages=fs.readdirSync(root).filter(f=>f.endsWith('.html')&&fs.readFileSync(path.join(root,f),'utf8').includes('id="landingPage"'));
 assert.equal(pages.length,12);
 for(const file of pages){const html=fs.readFileSync(path.join(root,file),'utf8');
  assert.equal([...html.matchAll(/src="\/ads\.js\?/g)].length,1,file);
  assert.doesNotMatch(html,/effectivecpmnetwork\.com|container-f66aa4|data-handler-click="75da431a9263"/,file);
  assert.equal([...html.matchAll(/id="randly-adsterra-social"/g)].length,1,file);
  assert.match(html,/<script id="randly-adsterra-social"[^>]+src="https:\/\/bicea\.org\/14\/4cd723902c51674b52b1ac4b207c76d4"><\/script>\s*<\/body>/,file);
 }
 assert.match(source,/https:\/\/bicea\.org\/21\/41a844b9e767c8981fc99be90925b350/);
 assert.match(source,/https:\/\/bicea\.org\/14\/4cd723902c51674b52b1ac4b207c76d4/);
 assert.doesNotMatch(source,/createElement\('iframe'\)|postMessage|setInterval|\.click\(|unsafe-eval/);
 assert.doesNotMatch(fs.readFileSync(path.join(root,'adsterra-frame.js'),'utf8'),/bicea\.org|createElement/);
 assert.doesNotMatch(fs.readFileSync(path.join(root,'sitemap.xml'),'utf8'),/adsterra-frame/);
});

function fixture(readyState='complete',visibilityState='visible',embeddedSocial=false){
 const handlers={},observers=[],resizers=[],timers=[],ids=new Map();let writes=0;
 class Element{
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.listeners={};this.textContent='';this.hidden=false;this.height=0;this.style={values:{},getPropertyValue(k){return this.values[k];},setProperty(k,v){this.values[k]=v;writes++;}};}
  appendChild(el){this.children.push(el);if(el.id)ids.set(el.id,el);return el;}
  addEventListener(k,fn){this.listeners[k]=fn;}
  setAttribute(k,v){this[k]=v;}
  getBoundingClientRect(){return {height:app.hidden||card.hidden||content.hidden?0:this.height};}
 }
 const app=new Element(),card=new Element(),content=new Element(),slot=new Element(),toggle=new Element(),label=new Element(),loading=new Element(),body=new Element();
 app.hidden=true;card.height=80;card.closest=()=>app;
 card.querySelector=s=>({'[data-ad-toggle]':toggle,'[data-ad-slot]':slot,'[data-ad-label]':label,'[data-ad-loading]':loading}[s]);
 ids.set('adContainer',card);ids.set('adContent',content);
 if(embeddedSocial){const script=new Element('script');script.id='randly-adsterra-social';body.appendChild(script);}
 const document={readyState,visibilityState,body,documentElement:{lang:'en',dataset:{}},getElementById:id=>ids.get(id),createElement:tag=>new Element(tag),addEventListener:(k,fn)=>handlers[k]=fn};
 const window={addEventListener:(k,fn)=>handlers[k]=fn};
 class MutationObserver{constructor(fn){this.fn=fn;observers.push(this);}observe(target){this.target=target;}}
 class ResizeObserver{constructor(fn){this.fn=fn;resizers.push(this);}observe(target){this.target=target;}}
 vm.runInNewContext(source,{document,window,MutationObserver,ResizeObserver,setTimeout:fn=>{const t={fn,cleared:false};timers.push(t);return t;},clearTimeout:t=>{if(t)t.cleared=true;}});
 return {handlers,observers,resizers,timers,ids,app,card,content,slot,toggle,label,loading,body,document,window,Element,writes:()=>writes,updateApp:()=>observers.find(x=>x.target===app).fn()};
}

test('Social Bar starts at DOM readiness before image/window load, native starts only when chat opens, neither repeats',()=>{
 const f=fixture('interactive');assert.equal(f.body.children.length,1);
 assert.equal(f.handlers.load,undefined,'must not wait for the full window load');
 f.handlers.visibilitychange();f.handlers.visibilitychange();assert.equal(f.body.children.length,1);
 const social=f.ids.get('randly-adsterra-social');assert.match(social.src,/\/14\//);assert.equal(social.dataset.loadState,'loading');
 social.listeners.load();assert.equal(social.dataset.loadState,'loaded');
 assert.equal(f.ids.has('randly-adsterra-native'),false);
 f.app.hidden=false;f.updateApp();f.updateApp();
 assert.equal(f.content.children.length,1);assert.equal(f.slot.children.length,1);assert.equal(f.body.children.length,1);
 const native=f.ids.get('randly-adsterra-native');assert.match(native.src,/\/21\//);
 assert.equal(native.referrerPolicy,'strict-origin-when-cross-origin');
 const writes=f.writes();f.updateApp();assert.equal(f.writes(),writes,'no style/observer feedback loop');
 f.toggle.listeners.click();assert.equal(f.content.hidden,true);assert.equal(f.body.children.length,1,'native collapse must not hide Social Bar');
 f.toggle.listeners.click();assert.equal(f.content.hidden,false);assert.equal(f.content.children.length,1);
});

test('blank responses do not count as filled; late real content restores its card; hidden pages defer loads',()=>{
 const f=fixture('complete','hidden');assert.equal(f.body.children.length,0);
 f.document.visibilityState='visible';f.handlers.visibilitychange();assert.equal(f.body.children.length,1);
 f.app.hidden=false;f.updateApp();const native=f.ids.get('randly-adsterra-native');native.listeners.load();
 assert.equal(f.card.dataset.filled,undefined,'loaded script is not a filled ad');
 f.timers[0].fn();assert.equal(f.card.hidden,true);
 const host=f.slot.children[0],creative=new f.Element();creative.textContent='Fixture creative';host.appendChild(creative);host.height=80;
 f.observers.find(x=>x.target===f.slot).fn();assert.equal(f.card.hidden,false);assert.equal(f.card.dataset.filled,'true');assert.equal(f.loading.hidden,true);
 assert.equal(f.timers[0].cleared,true);
 f.handlers.visibilitychange();assert.equal(f.body.children.length,1);assert.equal(f.content.children.length,1);
});

test('the official embedded Social Bar code is never inserted a second time',()=>{
 const f=fixture('complete','visible',true);
 assert.equal(f.body.children.length,1);
 f.app.hidden=false;f.updateApp();
 for(let i=0;i<10;i++) f.handlers.visibilitychange();
 assert.equal(f.body.children.length,1);
 assert.equal(f.content.children.length,1,'native still loads normally');
});
