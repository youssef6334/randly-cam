// sync-header-redesign.js
// Run once with: node sync-header-redesign.js
// Applies the same header/UI redesign changes made to index.html
// (modern theme toggle, green online badge, no "Visitor" label,
// text-chat country info box, aboutLink footer link) to all other
// language pages. Safe to run multiple times — skips files/parts
// that are already updated.

const fs = require('fs');
const path = require('path');

// language code -> language html file + about page file
const LANG_FILES = [
  { code: 'en', file: 'en.html', about: 'about-en.html' },
  { code: 'es', file: 'es.html', about: 'about-es.html' },
  { code: 'fr', file: 'fr.html', about: 'about-fr.html' },
  { code: 'de', file: 'de.html', about: 'about-de.html' },
  { code: 'it', file: 'it.html', about: 'about-it.html' },
  { code: 'pt', file: 'pt.html', about: 'about-pt.html' },
  { code: 'tr', file: 'tr.html', about: 'about-tr.html' },
  { code: 'ru', file: 'ru.html', about: 'about-ru.html' },
  { code: 'hi', file: 'hi.html', about: 'about-hi.html' },
  { code: 'id', file: 'id.html', about: 'about-id.html' },
  { code: 'zh', file: 'zh.html', about: 'about-zh.html' },
];

function log(file, msg) {
  console.log(`  [${file}] ${msg}`);
}

function processFile({ file, about }) {
  const filePath = path.join(__dirname, file);
  if (!fs.existsSync(filePath)) {
    log(file, '! file not found, skipped');
    return;
  }
  let c = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // 1) Replace old landing-page language-select block with the new full header
  //    (reuses the existing <select> markup so options/selected stay correct)
  const oldLandingBlockRe = /<div style="position: absolute; top: 20px; right: 20px; z-index: 100;">([\s\S]*?)<\/div>\s*/;
  const selectRe = /<select id="landingLangSelect"[\s\S]*?<\/select>/;
  if (oldLandingBlockRe.test(c)) {
    const selectMatch = c.match(selectRe);
    const selectMarkup = selectMatch ? selectMatch[0] : '';
    const newHeader =
`<header class="app-header">
<div class="header-left">
<div class="logo">Randly</div>
</div>
<div class="header-right" style="display: flex; align-items: center; gap: 10px;">
${selectMarkup}
<span class="online-badge-modern">
<span class="online-dot"></span>
<span data-i18n="onlineNow">Online Now</span>: <span id="landingOnlineCount">0</span>+
</span>
<button class="theme-switch-btn theme-toggle" onclick="toggleTheme()" aria-label="Toggle dark/light mode"><span class="switch-knob">🌙</span></button>
</div>
</header>
`;
    c = c.replace(oldLandingBlockRe, newHeader);
    changed = true;
    log(file, '✓ replaced landing header block');
  } else {
    log(file, '- landing header block not found (already updated?)');
  }

  // 2) Remove the old online-counter div inside the landing card (now shown in header instead)
  const oldCounterRe = /<div class="online-counter">[\s\S]*?<\/div>\s*/;
  if (oldCounterRe.test(c)) {
    c = c.replace(oldCounterRe, '');
    changed = true;
    log(file, '✓ removed old landing online-counter');
  }

  // 3) Remove the "Visitor" user-display-name span in the chat header
  const visitorRe = /<span class="user-display-name" id="userDisplayName">[\s\S]*?<\/span>\s*/;
  if (visitorRe.test(c)) {
    c = c.replace(visitorRe, '');
    changed = true;
    log(file, '✓ removed Visitor label');
  }

  // 4) Chat-header online badge -> modern green badge
  const oldBadgeRe = /<span class="online-badge"[\s\S]*?<span id="headerOnlineCount"[^>]*>0<\/span>\s*<\/span>/;
  if (oldBadgeRe.test(c)) {
    c = c.replace(
      oldBadgeRe,
      `<span class="online-badge-modern">\n<span class="online-dot"></span>\n<span data-i18n="onlineNow">Online Now</span>: <span id="headerOnlineCount">0</span>+\n</span>`
    );
    changed = true;
    log(file, '✓ modernized chat-header online badge');
  }

  // 5) Chat-header theme toggle button -> switch style
  const oldThemeBtnRe = /<button class="btn-icon theme-toggle" onclick="toggleTheme\(\)"[^>]*>🌙<\/button>/;
  if (oldThemeBtnRe.test(c)) {
    c = c.replace(
      oldThemeBtnRe,
      `<button class="theme-switch-btn theme-toggle" onclick="toggleTheme()" aria-label="Toggle dark/light mode"><span class="switch-knob">🌙</span></button>`
    );
    changed = true;
    log(file, '✓ modernized chat-header theme toggle');
  }

  // 6) Insert text-chat partner info box after the status bar
  const statusBarRe = /(<div class="status-bar" id="status" data-i18n="connectedStatus">[^<]*<\/div>\s*)/;
  if (statusBarRe.test(c) && !c.includes('id="textChatPartnerInfo"')) {
    c = c.replace(
      statusBarRe,
      `$1<div id="textChatPartnerInfo" style="display: none; text-align: center; padding: 4px 10px; font-size: 13px; color: #ffd700; font-weight: bold;">\n<span id="textFlagIcon"></span> <span id="textCountryName"></span>\n</div>\n`
    );
    changed = true;
    log(file, '✓ added text-chat partner info box');
  }

  // 7) Add aboutLink to footer (next to rules/privacy/contact)
  const contactLinkRe = /(<a href="mailto:contact@randly\.live" data-i18n="contactLink">[^<]*<\/a>)/;
  if (contactLinkRe.test(c) && !c.includes('data-i18n="aboutLink"')) {
    c = c.replace(contactLinkRe, `<a href="${about}" data-i18n="aboutLink">About</a>\n$1`);
    changed = true;
    log(file, `✓ added aboutLink (-> ${about}) to footer`);
  }

  if (changed) {
    fs.writeFileSync(filePath, c, 'utf8');
    log(file, '>>> saved');
  } else {
    log(file, 'no changes made (already up to date)');
  }
}

console.log('Syncing header redesign to all language pages...\n');
LANG_FILES.forEach(processFile);
console.log('\nDone. Review each file, then commit and push.');
