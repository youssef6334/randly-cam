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
app.get('/ads.js', (req, res) => res.type('js').send(fs.readFileSync(path.join(root,'ads.js'),'utf8')
    .replace('https://bicea.org/21/41a844b9e767c8981fc99be90925b350','/qa-native.js')
    .replace('https://bicea.org/14/4cd723902c51674b52b1ac4b207c76d4','/qa-social.js')));
app.get('/qa-native.js', (req, res) => res.type('js').send(`
const tile=document.createElement('div');tile.textContent='معاينة موضع الإعلان — بدون إعلان حقيقي';
Object.assign(tile.style,{padding:'24px',background:'#123125',borderRadius:'10px',color:'#bde7d1',textAlign:'center'});
document.getElementById('container-41a844b9e767c8981fc99be90925b350').appendChild(tile);`));
app.get('/qa-social.js', (req, res) => res.type('js').send(`
const panel=document.createElement('aside'),close=document.createElement('button'),label=document.createElement('span');
label.textContent='معاينة إعلان جانبي';close.textContent='×';close.setAttribute('aria-label','إغلاق المعاينة');close.onclick=()=>panel.remove();
Object.assign(panel.style,{position:'fixed',right:'12px',top:'120px',zIndex:9999,background:'#184b39',color:'white',border:'1px solid #3e8b6a',borderRadius:'14px',padding:'12px',display:'flex',gap:'12px',alignItems:'center'});
panel.append(label,close);document.body.appendChild(panel);`));
app.use(express.static(root));
app.listen(Number(process.env.PORT), '127.0.0.1', () => console.log('Ad preview: http://127.0.0.1:' + process.env.PORT));
