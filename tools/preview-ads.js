'use strict';
// Local visual fixture: no real ad requests, impressions, camera or chat partners.
process.env.PORT = process.env.PORT || '3097';
process.env.NODE_ENV = 'development';
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const security = require('../security');
const app = express(), root = path.join(__dirname, '..', 'public');
app.use((req, res, next) => { security.headers(req, res); next(); });
app.get('/', (req, res) => {
    const page = req.query.lang === 'en' ? 'en.html' : 'index.html';
    let html = fs.readFileSync(path.join(root, page), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    html = html.replace('</body>', '<script src="/qa-socket.js"></script><script src="/country-display.js"></script><script src="/script.js"></script><script src="/qa-layout.js" defer></script><script src="/ads.js" defer></script></body>');
    res.type('html').send(html);
});
app.get('/qa-socket.js', (req, res) => res.type('js').send('window.io=()=>({on(){},emit(){},disconnect(){}});'));
app.get('/api/ice', (req, res) => res.json({iceServers:[]}));
app.get('/qa-layout.js', (req, res) => res.type('js').send(`
document.addEventListener('DOMContentLoaded',()=>{
    document.getElementById('landingPage').style.display='none';
    document.querySelector('.main-container').hidden=false;
    setReferenceMode('video');
    document.getElementById('videoSection').style.setProperty('display','flex','important');
    document.querySelector('.local-box').style.setProperty('display','block','important');
    document.getElementById('cameraGateMessage')?.classList.add('is-hidden');
    document.getElementById('status').textContent='معاينة التصميم — بدون إعلان حقيقي';
});`));
app.get('/adsterra-frame.html', (req, res) => res.type('html').send('<!doctype html><html><head><link rel="stylesheet" href="/qa-creative.css"></head><body><div><b>Randly</b><span>معاينة موضع الإعلان · Advertisement preview</span><small>مساحة مستقلة عن المحادثة</small></div><script src="/qa-creative.js"></script></body></html>'));
app.get('/qa-creative.css', (req, res) => res.type('css').send('body{margin:0;font:14px Arial;color:#c8d8cf;background:transparent}div{box-sizing:border-box;height:80px;padding:12px 18px;border:1px solid #24473a;border-radius:10px;background:linear-gradient(110deg,#102e22,#13181b);display:flex;gap:18px;align-items:center}b{font-size:24px;color:#26dba0}span{flex:1}small{color:#92a399}@media(max-width:500px){div{gap:10px;padding:10px}b{font-size:20px}small{display:none}span{font-size:11px}}'));
app.get('/qa-creative.js', (req, res) => res.type('js').send("parent.postMessage({type:'randly-ad-layout',filled:true,height:80},location.origin);"));
app.use(express.static(root));
app.listen(Number(process.env.PORT), '127.0.0.1', () => console.log('Ad preview: http://127.0.0.1:' + process.env.PORT));
