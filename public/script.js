const socket = io(window.location.origin, {
    transports: ["websocket"],
    secure: true
});

let rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};
// السيرفر بيرجّع STUN + TURN (من متغيرات البيئة). لو فشل نكمل بالـ STUN الافتراضي
fetch('/api/ice').then(r => r.json()).then(d => {
    if (d && Array.isArray(d.iceServers) && d.iceServers.length) rtcConfig = { iceServers: d.iceServers };
}).catch(() => {});

let localStream = null;
let peerConnection = null;
let currentMode = 'text';
let isMicMuted = false;
let isCamOff = false;
let buttonState = 'start';
let currentRoomId = null;
let currentPartnerCountry = null;
let pendingCandidates = [];
let skipConfirmTimer = null;


// العناصر الأساسية
const landingPage = document.getElementById('landingPage');
const remoteVideo = document.getElementById('remoteVideo');
const localVideo = document.getElementById('localVideo');
const chatBox = document.getElementById('chatBox');
const msgInput = document.getElementById('msgInput');
const statusDiv = document.getElementById('status');
const countrySelect = document.getElementById('countrySelect');
const videoSection = document.getElementById('videoSection');
const skeletonLoader = document.getElementById('skeletonLoader');
const typingIndicator = document.getElementById('typingIndicator');
const cameraGateMessage = document.getElementById('cameraGateMessage');

function setCameraGate(visible) {
    if (cameraGateMessage) cameraGateMessage.classList.toggle('is-hidden', !visible);
}

function waitForCameraPreview() {
    if (!localVideo || localVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        setCameraGate(false);
        return Promise.resolve(true);
    }

    return new Promise(resolve => {
        const timeout = setTimeout(() => {
            localVideo.removeEventListener('loadeddata', onReady);
            resolve(false);
        }, 3000);
        function onReady() {
            clearTimeout(timeout);
            setCameraGate(false);
            resolve(true);
        }
        localVideo.addEventListener('loadeddata', onReady, { once: true });
    });
}

// --- نظام اهتمامات الـ Tags (مثل Omegle) ---
let interestsArray = [];

// --- قائمة اللغات المدعومة (المصدر الوحيد - أي select بتاع لغة في الموقع بيتملأ من هنا) ---
const LANGS = [
    { code: 'ar', label: 'العربية' },
    { code: 'en', label: 'English' },
    { code: 'es', label: 'Español' },
    { code: 'fr', label: 'Français' },
    { code: 'de', label: 'Deutsch' },
    { code: 'it', label: 'Italiano' },
    { code: 'pt', label: 'Português' },
    { code: 'tr', label: 'Türkçe' },
    { code: 'ru', label: 'Русский' },
    { code: 'hi', label: 'हिन्दी' },
    { code: 'id', label: 'Indonesia' },
    { code: 'zh', label: '中文' }
];

// --- قائمة أكواد الدول (ISO 3166-1 alpha-2) - الأسماء بتتولد تلقائي بلغة المستخدم عبر Intl.DisplayNames ---
// الدول الأشهر عالمياً بترتيب ثابت في الأول، والباقي بعدها أبجدياً حسب اسمها المترجم
const FAMOUS_COUNTRY_CODES = [
    "US","GB","AE","SA","FR","DE","CN","JP","IT","ES","RU","IN","BR",
    "CA","AU","KR","TR","EG","MX","QA","KW","NL","SE","CH"
];
const REMAINING_COUNTRY_CODES = [
    "AF","AL","AD","AO","AG","AM","AT","AZ","BS","BD","BB","BY","BE","BZ","BJ","BT",
    "BO","BA","BW","BN","BG","BF","BI","KH","CM","CV","CF","TD","CL","CO","KM","CG","CD",
    "CR","CI","HR","CU","CY","CZ","DK","DJ","DM","DO","DZ","EC","SV","GQ","ER","EE","SZ","ET","FJ","FI",
    "GA","GM","GE","GH","GR","GD","GT","GN","GW","GY","HT","HN","HU","IS","IR","IQ",
    "IE","ID","JM","JO","KZ","KE","KI","KP","KG","LA","LV","LB","LS","LR","LY","LI",
    "LT","LU","MG","MW","MY","MV","ML","MT","MH","MR","MA","MU","FM","MD","MC","MN","ME","MZ","MM",
    "NA","NR","NP","NZ","NI","NE","NG","MK","NO","OM","PK","PW","PA","PG","PY","PE","PH","PL","PT",
    "PS","RO","RW","KN","LC","VC","WS","SM","ST","SN","RS","SC","SL","SG","SK","SI","SB",
    "SO","ZA","SS","LK","SD","SR","SY","TW","TJ","TZ","TH","TL","TG","TO","TT","TN",
    "TM","TV","UG","UA","UY","UZ","VU","VE","VN","YE","ZM","ZW","HK","MO"
];
const COUNTRY_CODES = [...FAMOUS_COUNTRY_CODES, ...REMAINING_COUNTRY_CODES];

function populateLanguageSelects() {
    const selects = document.querySelectorAll('.site-lang-select');
    selects.forEach(sel => {
        const current = sel.value;
        sel.innerHTML = '';
        LANGS.forEach(l => {
            const opt = document.createElement('option');
            opt.value = l.code;
            opt.textContent = l.label;
            sel.appendChild(opt);
        });
        const htmlLang = document.documentElement.lang || 'ar';
        sel.value = current || htmlLang;
    });
}

function populateCountrySelects() {
    const selects = document.querySelectorAll('#countrySelect');
    if (!selects.length) return;
    const currentLang = document.documentElement.lang || 'ar';
    const t = translations[currentLang] || translations['en'];
    let regionNames;
    try {
        regionNames = new Intl.DisplayNames([currentLang], { type: 'region' });
    } catch (e) {
        regionNames = null;
    }

    selects.forEach(sel => {
        const current = sel.value || 'global';
        sel.innerHTML = '';

        const globalOpt = document.createElement('option');
        globalOpt.value = 'global';
        globalOpt.textContent = t?.matchGlobal || '🌐 Global (Smart Match)';
        sel.appendChild(globalOpt);

        const famousSet = new Set(FAMOUS_COUNTRY_CODES);
        const items = COUNTRY_CODES.map((code, idx) => {
            let name = code;
            if (regionNames) {
                try { name = regionNames.of(code) || code; } catch (e) { name = code; }
            }
            return { code, name, isFamous: famousSet.has(code), originalIndex: idx };
        }).sort((a, b) => {
            // الدول الأشهر تفضل فوق بنفس الترتيب المحدد، والباقي أبجدياً حسب الاسم المترجم
            if (a.isFamous && b.isFamous) return a.originalIndex - b.originalIndex;
            if (a.isFamous) return -1;
            if (b.isFamous) return 1;
            return a.name.localeCompare(b.name, currentLang);
        });

        items.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item.code;
            opt.textContent = `${getFlagEmoji(item.code)} ${item.name}`;
            sel.appendChild(opt);
        });

        sel.value = current;
    });
}

function updateControlLabels() {
    const labels = {
        ar: { share: 'مشاركة', report: 'إبلاغ', end: 'إنهاء' },
        en: { share: 'Share', report: 'Report', end: 'End' },
        es: { share: 'Enlace', report: 'Reportar', end: 'Salir' },
        fr: { share: 'Lien', report: 'Signaler', end: 'Quitter' },
        de: { share: 'Teilen', report: 'Melden', end: 'Ende' },
        it: { share: 'Link', report: 'Segnala', end: 'Esci' },
        pt: { share: 'Link', report: 'Denunciar', end: 'Sair' },
        tr: { share: 'Paylaş', report: 'Bildir', end: 'Bitir' },
        ru: { share: 'Ссылка', report: 'Жалоба', end: 'Выйти' },
        hi: { share: 'साझा', report: 'रिपोर्ट', end: 'बंद' },
        id: { share: 'Bagikan', report: 'Lapor', end: 'Akhiri' },
        zh: { share: '分享', report: '举报', end: '结束' }
    };
    const current = labels[document.documentElement.lang] || labels.en;
    document.querySelectorAll('[data-control-label]').forEach(el => {
        el.textContent = current[el.dataset.controlLabel] || '';
    });
    const settingsPanel = document.getElementById('settingsPanel');
    if (settingsPanel) {
        const settingsText = {
            ar: ['الإعدادات', 'المطابقة الذكية وترجمة الشات', 'إغلاق الإعدادات'],
            en: ['Settings', 'Smart Match and chat translation', 'Close settings']
        }[document.documentElement.lang] || ['Settings', 'Smart Match and chat translation', 'Close settings'];
        settingsPanel.querySelector('[data-settings-title]').textContent = settingsText[0];
        settingsPanel.querySelector('[data-settings-hint]').textContent = settingsText[1];
        settingsPanel.querySelector('.rl-settings-close').setAttribute('aria-label', settingsText[2]);
    }
}

function setupReferenceLayout() {
    const app = document.querySelector('.main-container');
    const header = app?.querySelector(':scope > .app-header');
    const content = app?.querySelector(':scope > .content-wrapper');
    const video = document.getElementById('videoSection');
    const chat = document.getElementById('chatSection');
    if (!app || !header || !content || !video || !chat) return;

    app.classList.add('rl-app');
    header.classList.add('rl-top');
    const brand = header.querySelector('.header-left');
    const actions = header.querySelector('.header-right');
    brand?.classList.add('rl-brand');
    actions?.classList.add('rl-top-actions');

    if (actions && !actions.querySelector('.rl-top-row2')) {
        const row2 = document.createElement('div');
        row2.className = 'rl-top-row2';
        const language = actions.querySelector('.site-lang-select')?.closest('label, .select-wrapper') || actions.querySelector('.site-lang-select');
        const online = actions.querySelector('.online-badge-modern');
        if (language) {
            language.classList.add('rl-lang-wrap');
            row2.appendChild(language);
        }
        if (online) {
            online.classList.add('rl-pill');
            online.querySelector('[data-i18n="onlineNow"]')?.classList.add('rl-online-text');
            row2.appendChild(online);
        }
        actions.appendChild(row2);
    }
    actions.querySelector('.site-lang-select')?.classList.add('rl-lang');

    const media = chat.querySelector('.rl-media');
    const dock = chat.querySelector('.rl-dock');
    const remoteBox = video.querySelector('.remote-box');
    const localBox = video.querySelector('.local-box');
    if (!dock || !remoteBox || !localBox) return;

    content.classList.add('rl-vid-wrap');
    video.classList.add('rl-stage-col');
    chat.classList.add('rl-side');

    let stage = video.querySelector('.rl-stage');
    if (!stage) {
        stage = document.createElement('div');
        stage.className = 'rl-stage';
        video.insertBefore(stage, video.firstChild);
        stage.append(remoteBox, localBox);
    }
    if (media && media.parentElement !== video) video.appendChild(media);
    media?.classList.add('rl-media--center');

    let messages = chat.querySelector(':scope > .rl-msgs');
    if (!messages) {
        messages = document.createElement('div');
        messages.className = 'rl-msgs';
        const movable = Array.from(chat.children).filter(child =>
            child !== dock && !child.classList.contains('filter-controls-row')
        );
        movable.forEach(child => messages.appendChild(child));
        chat.insertBefore(messages, chat.firstChild);
    }
    if (dock.parentElement !== chat) chat.appendChild(dock);
    const filterRow = chat.querySelector(':scope > .filter-controls-row') || messages.querySelector('.filter-controls-row');
    if (filterRow) {
        let panel = document.getElementById('settingsPanel');
        if (!panel) {
            panel = document.createElement('section');
            panel.id = 'settingsPanel';
            panel.className = 'rl-settings-panel';
            panel.hidden = true;
            panel.setAttribute('role', 'dialog');
            panel.setAttribute('aria-modal', 'true');
            panel.innerHTML = `
                <div class="rl-settings-card">
                    <div class="rl-settings-head">
                        <h2 data-settings-title>Settings</h2>
                        <button type="button" class="rl-settings-close" aria-label="Close settings">×</button>
                    </div>
                    <p class="rl-settings-hint" data-settings-hint>Smart Match and chat translation</p>
                </div>`;
            document.body.appendChild(panel);
        }
        const card = panel.querySelector('.rl-settings-card');
        const settingsText = {
            ar: ['الإعدادات', 'المطابقة الذكية وترجمة الشات', 'إغلاق الإعدادات'],
            en: ['Settings', 'Smart Match and chat translation', 'Close settings']
        }[document.documentElement.lang] || ['Settings', 'Smart Match and chat translation', 'Close settings'];
        card.querySelector('[data-settings-title]').textContent = settingsText[0];
        card.querySelector('[data-settings-hint]').textContent = settingsText[1];
        card.querySelector('.rl-settings-close').setAttribute('aria-label', settingsText[2]);
        if (filterRow.parentElement !== card) card.appendChild(filterRow);
    }
    const settingsButton = document.getElementById('btn-settings') || document.getElementById('filtersBtn');
    if (settingsButton) {
        settingsButton.id = 'btn-settings';
        settingsButton.setAttribute('aria-label', 'Settings');
        settingsButton.setAttribute('title', 'Settings');
    }
    dock.querySelectorAll('[data-control-label]').forEach(label => label.classList.add('rl-label'));
    setReferenceMode(currentMode);
}

function closeSettingsPanel() {
    const panel = document.getElementById('settingsPanel');
    if (!panel) return;
    panel.hidden = true;
    document.getElementById('btn-settings')?.focus();
}

function openSettingsPanel() {
    const panel = document.getElementById('settingsPanel');
    if (!panel) return;
    panel.hidden = false;
    panel.querySelector('.rl-settings-close')?.focus();
}

function setReferenceMode(mode) {
    const content = document.querySelector('.content-wrapper');
    if (!content) return;
    content.classList.toggle('rl-text-mode', mode === 'text');
    content.classList.toggle('rl-video-mode', mode === 'video');
}

document.addEventListener('DOMContentLoaded', () => {
    setupReferenceLayout();
    document.addEventListener('click', event => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target.closest('#btn-settings')) {
            openSettingsPanel();
        } else if (target.closest('.rl-settings-close')) {
            closeSettingsPanel();
        } else if (target.id === 'settingsPanel') {
            closeSettingsPanel();
        }
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') closeSettingsPanel();
    });
    const savedTheme = localStorage.getItem('randly_theme');
    if (savedTheme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        const themeBtns = document.querySelectorAll('.theme-toggle');
    themeBtns.forEach(btn => {
        const knob = btn.querySelector('.switch-knob');
        if (knob) knob.textContent = '☀️';
    });
    }

    const muteBtn = document.getElementById('muteBtn');
    if (muteBtn) setControlIcon('muteBtn', isSoundMuted, '#i-volume', '#i-volume-off', 'Mute speaker', 'Unmute speaker');
    updateControlLabels();

    if (videoSection) videoSection.style.setProperty('display', 'none', 'important');
    const localBox = document.querySelector('.video-box.local-box');
    if (localBox) localBox.style.setProperty('display', 'none', 'important');
    setCameraGate(true);

    // تفاعل حقل الـ Tags
    const interestTagInput = document.getElementById('interestTagInput');
    if (interestTagInput) {
        interestTagInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                const val = interestTagInput.value.trim().replace(/,/g, '').slice(0, 30);
                if (val && !interestsArray.includes(val) && interestsArray.length < 10) {
                    interestsArray.push(val);
                    renderInterestTags();
                }
                interestTagInput.value = '';
            } else if (e.key === 'Backspace' && interestTagInput.value === '' && interestsArray.length > 0) {
                interestsArray.pop();
                renderInterestTags();
            }
        });

    }
    populateLanguageSelects();
    populateCountrySelects();
});

function interestLabel(v) {
    try {
        if (window.CHIP_SLUGS && window.CHIP_SLUGS.indexOf(v) !== -1 && typeof tr === 'function') return tr('chip_' + v);
    } catch (e) {}
    return v;
}

function renderInterestTags() {
    const container = document.getElementById('interestsTagsContainer');
    const interestTagInput = document.getElementById('interestTagInput');
    if (!container || !interestTagInput) return;
    container.querySelectorAll('.interest-tag').forEach(tag => tag.remove());
    interestsArray.forEach((interest, index) => {
        const tagEl = document.createElement('div');
        tagEl.className = 'interest-tag';
        const label = document.createElement('span');
        label.textContent = interestLabel(interest) + ' ✕';   // textContent: مفيش HTML injection
        tagEl.appendChild(label);
        tagEl.onclick = (e) => {
            e.stopPropagation();
            interestsArray.splice(index, 1);
            renderInterestTags();
        };
        container.insertBefore(tagEl, interestTagInput);
    });
}

// --- إعدادات الأصوات ---
const matchSound = new Audio('/sounds/match.wav');
const msgSound = new Audio('/sounds/msg.wav');
let isSoundMuted = localStorage.getItem('randly_sound_muted') === 'true';

function setControlIcon(id, off, onIcon, offIcon, onLabel, offLabel) {
    const button = document.getElementById(id);
    if (!button) return;
    const icon = button.querySelector('use');
    button.classList.toggle('is-off', off);
    if (icon) icon.setAttribute('href', off ? offIcon : onIcon);
    button.setAttribute('aria-label', off ? offLabel : onLabel);
}

socket.on('online-count', (count) => {
    const landingCount = document.getElementById('landingOnlineCount');
    const headerCount = document.getElementById('headerOnlineCount');
    if (landingCount) landingCount.textContent = count;
    if (headerCount) headerCount.textContent = count;
});

socket.on('connect', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const savedRoom = urlParams.get('room');
    if (savedRoom) {
        currentMode = urlParams.get('mode') || 'text';
        window.history.pushState({}, document.title, window.location.pathname);
        startSession(currentMode, savedRoom);
    }
});

// --- Smart Match: السيرفر بيبعت الحدث ده لو محدش من الدولة المطلوبة اتلاقى خلال المهلة، وبيوسّع البحث عالميًا ---
socket.on('no-country-match', () => {
    const currentLang = document.documentElement.lang || 'ar';
    const t = translations[currentLang] || translations['en'];
    if (statusDiv) statusDiv.textContent = t.searchingText || 'Searching...';
    appendSystemMessage(t.noCountryMatchMsg || 'No one from your selected country is online right now — connecting you with someone from anywhere.');
});

function toggleSoundMute() {
    isSoundMuted = !isSoundMuted;
    localStorage.setItem('randly_sound_muted', isSoundMuted);
    if (remoteVideo) remoteVideo.muted = isSoundMuted;
    setControlIcon('muteBtn', isSoundMuted, '#i-volume', '#i-volume-off', 'Mute speaker', 'Unmute speaker');
}

function toggleTheme() {
    const htmlElement = document.documentElement;
    const currentTheme = htmlElement.getAttribute('data-theme');
    const themeBtns = document.querySelectorAll('.theme-toggle');
    if (currentTheme === 'light') {
        htmlElement.removeAttribute('data-theme');
        themeBtns.forEach(btn => {
            const knob = btn.querySelector('.switch-knob');
            if (knob) knob.textContent = '🌙';
        });
        localStorage.setItem('randly_theme', 'dark');
    } else {
        htmlElement.setAttribute('data-theme', 'light');
        themeBtns.forEach(btn => {
            const knob = btn.querySelector('.switch-knob');
            if (knob) knob.textContent = '☀️';
        });
        localStorage.setItem('randly_theme', 'light');
    }
}

let isAdCollapsed = false;
function toggleAd() {
    var adContent = document.getElementById("adContent");
    var adContainer = document.getElementById("adContainer");
    var arrow = document.getElementById("arrowIcon");
    isAdCollapsed = !isAdCollapsed;
    if (isAdCollapsed) {
        adContent.style.display = "none";
        if (adContainer) adContainer.style.height = "24px";
        arrow.innerHTML = "▼";
    } else {
        adContent.style.display = "flex";
        if (adContainer) adContainer.style.height = "auto";
        arrow.innerHTML = "▲";
    }
}

function saveRoomLink() {
    if (!currentRoomId) {
        alert(tr('needConnected'));
        return;
    }
    const url = `${window.location.origin}${window.location.pathname}?room=${currentRoomId}&mode=${currentMode}`;
    if (navigator.share) {
        navigator.share({ title: 'Randly', text: tr('shareText'), url: url }).catch(() => {});
        return;
    }
    navigator.clipboard.writeText(url).then(() => {
        alert(tr('linkCopied'));
    }).catch(err => {
        console.error('copy failed', err);
        alert(tr('copyFailed'));
    });
}

let typingTimer;
if (msgInput) {
    msgInput.addEventListener('input', () => {
        socket.emit('typing');
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => socket.emit('stop-typing'), 1000);
    });
}
socket.on('display-typing', () => { if(typingIndicator) typingIndicator.style.display = 'block'; });
socket.on('hide-typing', () => { if(typingIndicator) typingIndicator.style.display = 'none'; });

function clearRemoteVideo() {
    if (remoteVideo) {
        if (remoteVideo.srcObject) {
            remoteVideo.srcObject.getTracks().forEach(track => track.stop());
            remoteVideo.srcObject = null;
        }
        remoteVideo.removeAttribute('src');
        remoteVideo.load();
    }
    if (peerConnection) {
        peerConnection.ontrack = null;
        peerConnection.onicecandidate = null;
        peerConnection.close();
        peerConnection = null;
    }
    const flagElement = document.getElementById('remoteUserFlag');
    if (flagElement) flagElement.textContent = '';
    const nameElement = document.getElementById('remoteUserCountryName');
    if (nameElement) nameElement.textContent = '';
        const textInfoBoxClear = document.getElementById('textChatPartnerInfo');
    if (textInfoBoxClear) textInfoBoxClear.style.display = 'none';
    currentPartnerCountry = null;
    pendingCandidates = [];
}

function toggleMic() {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        isMicMuted = !isMicMuted;
        audioTrack.enabled = !isMicMuted;
        const micBtn = document.getElementById('micBtn');
        if (micBtn) {
            setControlIcon('micBtn', isMicMuted, '#i-mic', '#i-mic-off', 'Mute microphone', 'Unmute microphone');
        }
    }
}

function toggleCam() {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        isCamOff = !isCamOff;
        videoTrack.enabled = !isCamOff;
        const camBtn = document.getElementById('camBtn');
        if (camBtn) {
            setControlIcon('camBtn', isCamOff, '#i-video', '#i-video-off', 'Turn off camera', 'Turn on camera');
        }
        setCameraGate(isCamOff);
    }
}

async function startSession(mode, specificRoomId = null) {
    currentMode = mode;
    setupReferenceLayout();
    setReferenceMode(mode);
    buttonState = 'skip';          // كان بيفضل 'start' فالضغطة الأولى كانت بتفتح الكاميرا مرتين
    setNextBtn('skip');
    if (landingPage) landingPage.style.display = 'none';
    const mainBox = document.querySelector('.main-container');
    if (mainBox) mainBox.hidden = false;      // واجهة الشات مخفية عن الزواحف لحد ما الجلسة تبدأ
    const videoOnlyBtns = document.querySelectorAll('.video-only-btn');
    const localBox = document.querySelector('.video-box.local-box');

    if (mode === 'video') {
        if (videoSection) videoSection.style.setProperty('display', 'flex', 'important');
        if (localBox) localBox.style.setProperty('display', 'flex', 'important');
        videoOnlyBtns.forEach(btn => btn.classList.remove('d-none'));
        try {
            if (!localStream) localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            if (localVideo) {
                localVideo.srcObject = localStream;
            }
            if (!await waitForCameraPreview()) {
                appendSystemMessage(tr('cameraRequired'));
                if (statusDiv) statusDiv.textContent = tr('cameraRequired');
                return;
            }
        } catch (err) {
            appendSystemMessage(tr('cameraError'));
            setCameraGate(true);
            if (statusDiv) statusDiv.textContent = tr('cameraRequired');
            return;
        }
    } else {
        if (videoSection) videoSection.style.setProperty('display', 'none', 'important');
        if (localBox) localBox.style.setProperty('display', 'none', 'important');
        videoOnlyBtns.forEach(btn => btn.classList.add('d-none'));
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
        }
        if (localVideo) {
            localVideo.srcObject = null;
        }
        setCameraGate(true);
    }

    if (specificRoomId) {
        joinSpecificRoom(specificRoomId);
    } else {
        nextUser();
    }
}

function setNextBtn(state) {
    const btn = document.getElementById('nextBtn');
    if (!btn) return;
    const key = state === 'really' ? 'really' : (state === 'start' ? 'startBtn' : 'nextBtn');
    btn.textContent = '';
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('class', 'rl-ico');
    icon.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#i-next');
    icon.appendChild(use);
    const span = document.createElement('span');
    span.setAttribute('data-i18n', key);
    span.textContent = tr(key);
    btn.appendChild(icon);
    btn.appendChild(span);
}

function handleMainButton() {
    clearTimeout(skipConfirmTimer);
    if (buttonState === 'start') {
        startSession(currentMode);
    } else if (buttonState === 'skip') {
        // خطوة تأكيد ضد الضغط بالغلط: لو ما اتأكدتش خلال 3 ثواني الزر يرجع لوضعه
        buttonState = 'really';
        setNextBtn('really');
        skipConfirmTimer = setTimeout(() => {
            if (buttonState === 'really') { buttonState = 'skip'; setNextBtn('skip'); }
        }, 3000);
    } else if (buttonState === 'really') {
        nextUser();
        buttonState = 'skip';
        setNextBtn('skip');
    }
}

function nextUser() {
    clearTimeout(skipConfirmTimer);
    if (buttonState === 'really') { buttonState = 'skip'; setNextBtn('skip'); }
    clearRemoteVideo();
    if(chatBox) chatBox.innerHTML = '';
    currentRoomId = null;
    if(chatBox) chatBox.style.display = 'none';
    if(skeletonLoader) skeletonLoader.style.display = 'block';
    const currentLang = document.documentElement.lang || 'ar';
    if(statusDiv) statusDiv.textContent = translations[currentLang]?.searchingText || 'Searching...';

    const selectedCountry = countrySelect ? countrySelect.value : 'global';

    // إرسال مصفوفة اهتمامات الـ Tags للسيرفر
    socket.emit('find-match', {
        mode: currentMode,
        interests: interestsArray,
        country: selectedCountry
    });
}

function joinSpecificRoom(roomId) {
    clearRemoteVideo();
    if(chatBox) chatBox.innerHTML = '';
    if(chatBox) chatBox.style.display = 'none';
    if(skeletonLoader) skeletonLoader.style.display = 'block';
    if(statusDiv) statusDiv.textContent = tr('joiningRoom');
    if (roomId === '__create__') {      // غرفة خاصة جديدة (ميزة ادعُ صديقك)
        socket.emit('create-room', { mode: currentMode });
        return;
    }
    socket.emit('join-saved-room', { roomId: roomId, mode: currentMode });
}

function leaveSession() {
    clearRemoteVideo();
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    if (landingPage) landingPage.style.display = 'flex';
    const mainBoxLeave = document.querySelector('.main-container');
    if (mainBoxLeave) mainBoxLeave.hidden = true;
    if (videoSection) videoSection.style.setProperty('display', 'none', 'important');
    const localBox = document.querySelector('.video-box.local-box');
    if (localBox) localBox.style.setProperty('display', 'none', 'important');
    buttonState = 'start';
    currentRoomId = null;
    clearTimeout(skipConfirmTimer);
    setNextBtn('start');
    window.history.pushState({}, document.title, window.location.pathname);
    socket.emit('leave-room');
}

function reportUser() {
    socket.emit('submit-report', { reason: 'Inappropriate behavior' });
    alert(tr('reported'));
}

let myGameSymbol = null;
let isMyTurn = false;
let xoBoard = ['', '', '', '', '', '', '', '', ''];

function requestGame() {
    const overlay = document.getElementById('gameBoardOverlay');
    if (overlay) overlay.style.display = 'flex';
}

function closeGame() {
    const overlay = document.getElementById('gameBoardOverlay');
    if (overlay) overlay.style.display = 'none';
}

function resetXOBoard() {
    xoBoard = ['', '', '', '', '', '', '', '', ''];
    document.querySelectorAll('.xo-cell').forEach(cell => cell.textContent = '');
    const currentLang = document.documentElement.lang || 'ar';
    const t = translations[currentLang] || translations['en'];
    const gameStatus = document.getElementById('gameStatusText');
    if(gameStatus) gameStatus.textContent = isMyTurn ? `${t.turnText} ( ${myGameSymbol} )` : tr('waitTurn');
}

function makeMove(cellIndex) {
    if (!isMyTurn || xoBoard[cellIndex] !== '') return;
    xoBoard[cellIndex] = myGameSymbol;
    document.querySelectorAll('.xo-cell')[cellIndex].textContent = myGameSymbol;
    isMyTurn = false;
    const gameStatus = document.getElementById('gameStatusText');
    if(gameStatus) gameStatus.textContent = tr('waitTurn');
    socket.emit('xo-move', { index: cellIndex, symbol: myGameSymbol });
}

socket.on('xo-receive-move', (data) => {
    xoBoard[data.index] = data.symbol;
    document.querySelectorAll('.xo-cell')[data.index].textContent = data.symbol;
    isMyTurn = true;
    const currentLang = document.documentElement.lang || 'ar';
    const t = translations[currentLang] || translations['en'];
    const gameStatus = document.getElementById('gameStatusText');
    if(gameStatus) gameStatus.textContent = `${t.turnText} ( ${myGameSymbol} )`;
});

function createPeerConnection() {
    peerConnection = new RTCPeerConnection(rtcConfig);
    let streamToSend = localStream;

    if (streamToSend && currentMode === 'video') {
        streamToSend.getTracks().forEach(track => {
            peerConnection.addTrack(track, streamToSend);
        });
    }

    peerConnection.ontrack = (event) => {
        if (remoteVideo && event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
        }
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('signal', { candidate: event.candidate });
        }
    };

    peerConnection.onconnectionstatechange = () => {
        if (peerConnection && peerConnection.connectionState === 'failed') {
            appendSystemMessage(tr('rtcFailed'));
        }
    };
}

async function flushPendingCandidates() {
    const list = pendingCandidates;
    pendingCandidates = [];
    for (const c of list) {
        try { await peerConnection.addIceCandidate(new RTCIceCandidate(c)); } catch (e) { console.warn('ICE', e); }
    }
}

function getFlagEmoji(countryCode) {
    if (!countryCode || countryCode === 'global') return '🌐';
    return countryCode.toUpperCase().replace(/./g, char => String.fromCodePoint(char.charCodeAt(0) + 127397));
}

socket.on('matched', async (data) => {
    const currentLang = document.documentElement.lang || 'ar';
    if(statusDiv) statusDiv.textContent = translations[currentLang]?.connectedStatus || 'Connected!';
    currentRoomId = data.roomId;
    if(skeletonLoader) skeletonLoader.style.display = 'none';
    if(chatBox) chatBox.style.display = 'flex';
    if (!isSoundMuted) matchSound.play().catch(()=>{});

    currentPartnerCountry = data.partnerCountry || 'global';
    const flagElement = document.getElementById('remoteUserFlag');
    const nameElement = document.getElementById('remoteUserCountryName');

    if (flagElement) {
        flagElement.textContent = getFlagEmoji(currentPartnerCountry);
    }
    const textFlagEl = document.getElementById('textFlagIcon');
const textNameEl = document.getElementById('textCountryName');
const textInfoBox = document.getElementById('textChatPartnerInfo');
if (textInfoBox) textInfoBox.style.display = 'block';
if (textFlagEl) textFlagEl.textContent = getFlagEmoji(currentPartnerCountry);
if (textNameEl) {
    if (currentPartnerCountry === 'global') {
        textNameEl.textContent = translations[currentLang]?.matchGlobal || '';
    } else {
        try {
            const rn = new Intl.DisplayNames([currentLang], { type: 'region' });
            textNameEl.textContent = rn.of(currentPartnerCountry.toUpperCase());
        } catch(e) { textNameEl.textContent = ''; }
    }
}
    if (nameElement) {
        if (currentPartnerCountry === 'global') {
            nameElement.textContent = translations[currentLang]?.matchGlobal || 'عالمي (Smart Match)';
        } else {
            try {
                const regionNames = new Intl.DisplayNames([currentLang], { type: 'region' });
                nameElement.textContent = '- ' + regionNames.of(currentPartnerCountry.toUpperCase());
            } catch (e) {
                nameElement.textContent = '';
            }
        }
    }

    myGameSymbol = data.xoRole;
    isMyTurn = (myGameSymbol === 'X');
    resetXOBoard();

    if (currentMode === 'video') {
        if (!peerConnection) createPeerConnection();   // ممكن يكون اتعمل بسبب offer وصل بدري
        if (data.isInitiator) {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            socket.emit('signal', { offer: offer });
        }
    }
});

socket.on('room-not-found', () => {
    alert(tr('roomNotFound'));
    leaveSession();
});

socket.on('signal', async (data) => {
    try {
        if (data.offer) {
            if (!peerConnection) createPeerConnection();
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
            await flushPendingCandidates();
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            socket.emit('signal', { answer: answer });
        } else if (data.answer) {
            if (peerConnection) {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
                await flushPendingCandidates();
            }
        } else if (data.candidate) {
            // الـ candidate قبل setRemoteDescription بيتحط في طابور بدل ما يرمي خطأ
            if (peerConnection && peerConnection.remoteDescription) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            } else {
                if (pendingCandidates.length < 100) pendingCandidates.push(data.candidate);
            }
        }
    } catch (err) {
        console.error('signal error', err);
    }
});

socket.on('peer-disconnected', () => {
    clearRemoteVideo();
    if(statusDiv) statusDiv.textContent = tr('disconnected');
    appendSystemMessage(tr('partnerLeft'));
});

socket.on('receive-message', async (data) => {
    if (!isSoundMuted) msgSound.play().catch(()=>{});
    const translationLangEl = document.getElementById('translationLang');
    const targetLang = translationLangEl ? translationLangEl.value : 'none';
    let translatedText = null;

    if (targetLang !== 'none' && data.text) {
        try {
            // الترجمة عبر السيرفر (بيحدّ المعدل ويدعم API رسمي)
            const response = await fetch('/api/translate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: data.text, target: targetLang })
            });
            if (!response.ok) throw new Error('translate ' + response.status);
            const result = await response.json();
            if (result && typeof result.text === 'string') translatedText = result.text;
        } catch (error) {
            console.error("خطأ في الترجمة الفورية:", error);
            translatedText = tr('translateFailed');
        }
    }

    appendMessage(data.text, 'other', translatedText);
    if(typingIndicator) typingIndicator.style.display = 'none';
});

function sendMsg() {
    if(!msgInput) return;
    const text = msgInput.value.trim();
    if (!text) return;
    appendMessage(text, 'me');
    socket.emit('send-message', { text: text });
    socket.emit('stop-typing');
    msgInput.value = '';
}

function appendMessage(text, type, translatedText = null) {
    if(!chatBox) return;
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('msg', type === 'me' ? 'msg-me' : 'msg-other');
    const safeText = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");

    if (translatedText) {
        const safeTrans = translatedText.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        msgDiv.innerHTML = `${safeText} <br><small style="color:var(--accent-purple); display:block; margin-top:5px; font-size:11px; font-weight:bold;">${tr('translationLabel')}: ${safeTrans}</small>`;
    } else {
        msgDiv.textContent = text;
    }
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function appendSystemMessage(text) {
    if(!chatBox) return;
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('msg', 'msg-sys');
    msgDiv.style.whiteSpace = 'pre-line';
    msgDiv.textContent = text;
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// --- نظام الترجمة (الـ 12 لغة كاملة) ---
const translations = {
    ar: {
        siteTitle: "Randly - شات فيديو ورسائل عشوائي مع الغرباء",
        logoTitle: "Randly 🎲",
        landingSub: "تحدث مع أناس عشوائيين حول العالم بكل أمان وسرعة!",
        onlineNow: "المتصلون الآن",
        interestsPlaceholder: "أدخل اهتماماتك (مثال: كرة قدم، برمجة)...",
        videoChatBtn: "شات فيديو",
        textChatBtn: "شات كتابي",
        feat1Title: "بدون تسجيل (Anonymous)",
        feat1Desc: "ابدأ الدردشة فوراً بضغطة زر وبدون الحاجة لإنشاء حساب، خصوصيتك في أمان.",
        feat2Title: "تطابق بالاهتمامات",
        feat2Desc: "أضف المواضيع التي تحبها وسيتم ربطك بأشخاص يشاركونك نفس الشغف.",
        feat3Title: "مجتمع عالمي",
        feat3Desc: "آلاف المستخدمين من جميع أنحاء العالم متصلون على مدار الساعة ليلاً ونهاراً.",
        feat4Title: "بيئة آمنة",
        feat4Desc: "ميزة إبلاغ فورية وحظر مؤقت تلقائي للمستخدمين المخالفين لإبقاء المحادثات محترمة.",
        faqTitle: "الأسئلة الشائعة",
        faq1Q: "هل موقع Randly مجاني؟",
        faq1A: "نعم، يمكنك الدردشة والتواصل مع الغرباء عبر الفيديو أو النص مجاناً تماماً وبدون أي رسوم خفية.",
        faq2Q: "هل يمكنني استخدام Randly على الهاتف؟",
        faq2A: "بالتأكيد! الموقع مصمم ليعمل بسلاسة تامة على جميع أجهزة الموبايل الذكية.",
        faq3Q: "ما هو أفضل بديل لموقع Omegle بعد إغلاقه؟",
        faq3A: "Randly من أفضل البدائل لموقع أوميغل، حيث يوفر شات فيديو ونصي عشوائي مع الغرباء مجاناً وبدون تسجيل، مع ميزة إبلاغ وحظر مؤقت للمخالفين ومطابقة حسب الاهتمامات.",
        faq4Q: "هل موقع Randly آمن للاستخدام؟",
        faq4A: "يوفر Randly ميزة إبلاغ فورية ويحظر تلقائياً بشكل مؤقت المستخدمين الذين يتلقون بلاغات متعددة، ولا يخزّن محادثاتك ولا يطلب منك تسجيل بيانات شخصية. ومع ذلك تحدّث بحذر ولا تشارك معلوماتك الخاصة مع الغرباء.",
        faq5Q: "كيف يعمل الشات العشوائي في Randly؟",
        faq5A: "ما عليك سوى الضغط على \"شات فيديو\" أو \"شات كتابي\"، وسيقوم الموقع بربطك تلقائياً بشخص عشوائي متصل الآن؛ يمكنك التخطي للشخص التالي في أي وقت بضغطة زر.",
        faq6Q: "هل يمكنني اختيار دولة الشخص الذي أتحدث معه؟",
        faq6A: "نعم، يوفر Randly فلتر لاختيار دولة معينة للتحدث مع أشخاص منها، أو استخدام وضع \"عالمي\" للتطابق مع أي شخص حول العالم.",
        faq7Q: "ما هو الحد الأدنى للعمر لاستخدام Randly؟",
        faq7A: "يجب أن يكون عمر المستخدم 18 عاماً أو أكثر لاستخدام موقع Randly، وفقاً للشروط والأحكام الخاصة بالموقع.",
        faq8Q: "هل يترجم Randly الرسائل تلقائياً بين اللغات؟",
        faq8A: "نعم، يمكنك تفعيل الترجمة الفورية لرسائل الشات الكتابي واختيار لغتك المفضلة من قائمة الترجمة.",
        rights: "جميع الحقوق محفوظة.",
        rulesLink: "القواعد",
        privacyLink: "سياسة الخصوصية",
        contactLink: "تواصل معنا",
        aboutLink: "عن الموقع",
        visitor: "زائر",
        remoteUser: "الطرف الآخر",
        youUser: "أنت",
        connectedStatus: "متصل الآن!",
        searchingText: "جاري البحث عن شخص عشوائي...",
        welcomeMsg: "مرحباً بك! انقر على Start لبدء الشات.",
        typingText: "الطرف الآخر يكتب الآن...",
        matchGlobal: "🌐 عالمي (Smart Match)",
        noTranslation: "بدون ترجمة",
        msgPlaceholder: "اكتب رسالتك",
        skipStartBtn: "تخطي / Start",
        turnText: "دورك الآن",
        noCountryMatchMsg: "مفيش حد من دولتك متصل دلوقتي، هنوصلك بأي شخص تاني حول العالم.",
        showFaceMessage: "اظهر وجهك أمام الكاميرا للعثور على شخص والتواصل معه",
        cameraRequired: "لازم تسمح بالكاميرا وتظهر وجهك قبل بدء المحادثة."
    },
    en: {
        siteTitle: "Randly - Random Video & Text Chat with Strangers",
        logoTitle: "Randly 🎲",
        landingSub: "Talk to random people around the world safely and fast!",
        onlineNow: "Online now",
        interestsPlaceholder: "Enter interests (e.g. football, coding)...",
        videoChatBtn: "Video Chat",
        textChatBtn: "Text Chat",
        feat1Title: "No Registration (Anonymous)",
        feat1Desc: "Start chatting instantly with one click, no account needed, your privacy is secure.",
        feat2Title: "Interest Matching",
        feat2Desc: "Add your favorite topics and get matched with people sharing your passion.",
        feat3Title: "Global Community",
        feat3Desc: "Thousands of users worldwide connected around the clock day and night.",
        feat4Title: "Safe Environment",
        feat4Desc: "An instant report button and automatic temporary bans for violators, to help keep chats respectful.",
        faqTitle: "FAQ",
        faq1Q: "Is Randly free?",
        faq1A: "Yes, you can chat with strangers via video or text completely free with no hidden fees.",
        faq2Q: "Can I use Randly on mobile?",
        faq2A: "Sure! The site is fully responsive and works smoothly on all mobile devices.",
        faq3Q: "What is the best alternative to Omegle now that it has shut down?",
        faq3A: "Randly is one of the best alternatives to Omegle, offering free random video and text chat with strangers with no registration, plus a report feature with temporary bans for violators and interest-based matching.",
        faq4Q: "Is Randly safe to use?",
        faq4A: "Randly offers an instant report feature and automatically applies temporary bans to users who receive multiple reports. It does not store your conversations or ask for personal registration. Still, chat with care and never share private information with strangers.",
        faq5Q: "How does random chat work on Randly?",
        faq5A: "Just click \"Video Chat\" or \"Text Chat\" and you'll be instantly connected with a random person online now; you can skip to the next person anytime with one click.",
        faq6Q: "Can I choose the country of the person I talk to?",
        faq6A: "Yes, Randly offers a filter to match with people from a specific country, or use \"Global\" mode to match with anyone worldwide.",
        faq7Q: "What is the minimum age to use Randly?",
        faq7A: "Users must be 18 years or older to use Randly, in accordance with the site's Terms of Service.",
        faq8Q: "Does Randly automatically translate messages between languages?",
        faq8A: "Yes, you can enable instant translation for text chat messages and choose your preferred language from the translation menu.",
        rights: "All rights reserved.",
        rulesLink: "Rules",
        privacyLink: "Privacy Policy",
        contactLink: "Contact Us",
        aboutLink: "About Us",
        visitor: "Visitor",
        remoteUser: "Stranger",
        youUser: "You",
        connectedStatus: "Connected!",
        searchingText: "Searching for a random person...",
        welcomeMsg: "Welcome! Click Start to begin chatting.",
        typingText: "Stranger is typing...",
        matchGlobal: "🌐 Global (Smart Match)",
        noTranslation: "No Translation",
        msgPlaceholder: "Type a message",
        skipStartBtn: "Skip / Start",
        turnText: "Your turn",
        noCountryMatchMsg: "No one from your selected country is online right now — connecting you with someone from anywhere.",
        showFaceMessage: "Show your face to find a match and start chatting",
        cameraRequired: "Allow camera access and show your face before starting."
    },
    es: {
        siteTitle: "Randly - Chat aleatorio de video y texto",
        logoTitle: "Randly 🎲",
        landingSub: "¡Habla con personas aleatorias de todo el mundo de forma segura!",
        onlineNow: "En línea",
        interestsPlaceholder: "Ingrese intereses...",
        videoChatBtn: "Chat de Video",
        textChatBtn: "Chat de Texto",
        feat1Title: "Sin Registro (Anónimo)",
        feat1Desc: "Comienza a chatear al instante sin crear una cuenta.",
        feat2Title: "Coincidencia por Intereses",
        feat2Desc: "Conéctate con personas que comparten tu pasión.",
        feat3Title: "Comunidad Global",
        feat3Desc: "Miles de usuarios conectados las 24 horas.",
        feat4Title: "Entorno Seguro",
        feat4Desc: "Botón de denuncia instantánea y bloqueos temporales automáticos para quienes infrinjan las normas, para mantener los chats respetuosos.",
        faqTitle: "Preguntas Frecuentes",
        faq1Q: "¿Es Randly gratis?",
        faq1A: "Sí, puedes chatear completamente gratis.",
        faq2Q: "¿Puedo usarlo en el móvil?",
        faq2A: "¡Claro! Funciona perfectamente en dispositivos móviles.",
        faq3Q: "¿Cuál es la mejor alternativa a Omegle ahora que ha cerrado?",
        faq3A: "Randly es una de las mejores alternativas a Omegle: ofrece chat de video y texto aleatorio gratis con extraños, sin registro, con función de denuncia y bloqueos temporales para infractores, y coincidencia por intereses.",
        faq4Q: "¿Es seguro usar Randly?",
        faq4A: "Randly ofrece denuncia instantánea y aplica bloqueos temporales automáticos a los usuarios que reciben varias denuncias. No almacena tus conversaciones ni te pide registrar datos personales. Aun así, chatea con cuidado y no compartas información privada con extraños.",
        faq5Q: "¿Cómo funciona el chat aleatorio en Randly?",
        faq5A: "Solo haz clic en \"Chat de Video\" o \"Chat de Texto\" y serás conectado al instante con una persona al azar conectada ahora; puedes saltar a la siguiente persona en cualquier momento con un clic.",
        faq6Q: "¿Puedo elegir el país de la persona con la que hablo?",
        faq6A: "Sí, Randly ofrece un filtro para conectarte con personas de un país específico, o usar el modo \"Global\" para conectarte con cualquier persona del mundo.",
        faq7Q: "¿Cuál es la edad mínima para usar Randly?",
        faq7A: "Los usuarios deben tener 18 años o más para usar Randly, de acuerdo con los Términos y Condiciones del sitio.",
        faq8Q: "¿Randly traduce los mensajes automáticamente entre idiomas?",
        faq8A: "Sí, puedes activar la traducción instantánea para los mensajes del chat de texto y elegir tu idioma preferido en el menú de traducción.",
        rights: "Todos los derechos reservados.",
        rulesLink: "Reglas",
        privacyLink: "Privacidad",
        contactLink: "Contacto",
        aboutLink: "Sobre Nosotros",
        visitor: "Visitante",
        remoteUser: "Extraño",
        youUser: "Tú",
        connectedStatus: "¡Conectado!",
        searchingText: "Buscando persona aleatoria...",
        welcomeMsg: "¡Bienvenido! Haz clic en Start.",
        typingText: "Escribiendo...",
        matchGlobal: "🌐 Mundial (Smart Match)",
        noTranslation: "Sin Traducción",
        msgPlaceholder: "Escribe un mensaje",
        skipStartBtn: "Saltar / Start",
        turnText: "Tu turno",
        noCountryMatchMsg: "No hay nadie de tu país conectado ahora mismo — te conectaremos con alguien de cualquier parte del mundo."
    },
    fr: {
        siteTitle: "Randly - Chat vidéo et texte aléatoire",
        logoTitle: "Randly 🎲",
        landingSub: "Parlez à des inconnus du monde entier en toute sécurité !",
        onlineNow: "En ligne",
        interestsPlaceholder: "Entrez vos centres d'intérêt...",
        videoChatBtn: "Chat Vidéo",
        textChatBtn: "Chat Texte",
        feat1Title: "Sans Inscription (Anonyme)",
        feat1Desc: "Commencez à chatter instantanément sans compte.",
        feat2Title: "Correspondance par Intérêts",
        feat2Desc: "Trouvez des personnes partageant vos passions.",
        feat3Title: "Communauté Mondiale",
        feat3Desc: "Des milliers d'utilisateurs connectés 24h/24.",
        feat4Title: "Environnement Sûr",
        feat4Desc: "Signalement instantané et blocages temporaires automatiques pour les contrevenants, afin de garder des conversations respectueuses.",
        faqTitle: "FAQ",
        faq1Q: "Randly est-il gratuit ?",
        faq1A: "Oui, discutez entièrement gratuitement.",
        faq2Q: "Puis-je l'utiliser sur mobile ?",
        faq2A: "Bien sûr ! Fonctionne parfaitement sur mobile.",
        faq3Q: "Quelle est la meilleure alternative à Omegle depuis sa fermeture ?",
        faq3A: "Randly est l'une des meilleures alternatives à Omegle : chat vidéo et texte aléatoire gratuit avec des inconnus, sans inscription, avec signalement et blocages temporaires des contrevenants, et mise en relation par centres d'intérêt.",
        faq4Q: "Randly est-il sûr à utiliser ?",
        faq4A: "Randly propose un signalement instantané et applique automatiquement des blocages temporaires aux utilisateurs qui reçoivent plusieurs signalements. Il ne stocke pas vos conversations et ne demande aucune inscription de données personnelles. Restez toutefois prudent et ne partagez jamais d'informations privées avec des inconnus.",
        faq5Q: "Comment fonctionne le chat aléatoire sur Randly ?",
        faq5A: "Cliquez simplement sur \"Chat Vidéo\" ou \"Chat Texte\" et vous serez instantanément connecté à une personne aléatoire en ligne ; vous pouvez passer à la personne suivante à tout moment en un clic.",
        faq6Q: "Puis-je choisir le pays de la personne à qui je parle ?",
        faq6A: "Oui, Randly propose un filtre pour se connecter avec des personnes d'un pays spécifique, ou utiliser le mode \"Mondial\" pour être mis en relation avec n'importe qui dans le monde.",
        faq7Q: "Quel est l'âge minimum pour utiliser Randly ?",
        faq7A: "Les utilisateurs doivent avoir 18 ans ou plus pour utiliser Randly, conformément aux Conditions d'Utilisation du site.",
        faq8Q: "Randly traduit-il automatiquement les messages entre les langues ?",
        faq8A: "Oui, vous pouvez activer la traduction instantanée pour les messages du chat texte et choisir votre langue préférée dans le menu de traduction.",
        rights: "Tous droits réservés.",
        rulesLink: "Règles",
        privacyLink: "Confidentialité",
        contactLink: "Contact",
        aboutLink: "À Propos",
        visitor: "Visiteur",
        remoteUser: "Inconnu",
        youUser: "Vous",
        connectedStatus: "Connecté !",
        searchingText: "Recherche d'une personne...",
        welcomeMsg: "Bienvenue ! Cliquez sur Start.",
        typingText: "Écrit...",
        matchGlobal: "🌐 Mondial (Smart Match)",
        noTranslation: "Sans Traduction",
        msgPlaceholder: "Écrivez un message",
        skipStartBtn: "Passer / Start",
        turnText: "À vous",
        noCountryMatchMsg: "Personne de votre pays n'est connecté en ce moment — nous vous connectons avec quelqu'un du monde entier."
    },
    de: {
        siteTitle: "Randly - Zufälliger Video- und Text-Chat",
        logoTitle: "Randly 🎲",
        landingSub: "Sicher mit Fremden weltweit chatten!",
        onlineNow: "Online",
        interestsPlaceholder: "Interessen eingeben...",
        videoChatBtn: "Video-Chat",
        textChatBtn: "Text-Chat",
        feat1Title: "Ohne Registrierung",
        feat1Desc: "Sofort und anonym chatten.",
        feat2Title: "Interessen-Matching",
        feat2Desc: "Finde Gleichgesinnte.",
        feat3Title: "Globale Community",
        feat3Desc: "Tausende Nutzer rund um die Uhr.",
        feat4Title: "Sichere Umgebung",
        feat4Desc: "Sofort-Meldefunktion und automatische vorübergehende Sperren für Regelverstöße, damit Chats respektvoll bleiben.",
        faqTitle: "FAQ",
        faq1Q: "Ist Randly kostenlos?",
        faq1A: "Ja, völlig kostenlos.",
        faq2Q: "Auch auf dem Handy?",
        faq2A: "Ja, läuft reibungslos auf Mobilgeräten.",
        faq3Q: "Was ist die beste Alternative zu Omegle, nachdem es geschlossen wurde?",
        faq3A: "Randly ist eine der besten Alternativen zu Omegle: kostenloser zufälliger Video- und Textchat mit Fremden ohne Registrierung, mit Meldefunktion und vorübergehenden Sperren für Regelverstöße sowie Interessen-Matching.",
        faq4Q: "Ist Randly sicher in der Nutzung?",
        faq4A: "Randly bietet eine Sofort-Meldefunktion und sperrt Nutzer automatisch vorübergehend, wenn sie mehrfach gemeldet werden. Chats werden nicht gespeichert und es ist keine Registrierung persönlicher Daten nötig. Trotzdem gilt: Sei vorsichtig und gib keine privaten Informationen an Fremde weiter.",
        faq5Q: "Wie funktioniert der Zufallschat auf Randly?",
        faq5A: "Klicke einfach auf \"Videochat\" oder \"Textchat\", und du wirst sofort mit einer zufälligen Person verbunden, die gerade online ist; du kannst jederzeit mit einem Klick zur nächsten Person wechseln.",
        faq6Q: "Kann ich das Land der Person auswählen, mit der ich spreche?",
        faq6A: "Ja, Randly bietet einen Filter, um mit Personen aus einem bestimmten Land verbunden zu werden, oder du nutzt den Modus \"Global\", um mit jedem weltweit gematcht zu werden.",
        faq7Q: "Was ist das Mindestalter für die Nutzung von Randly?",
        faq7A: "Nutzer müssen mindestens 18 Jahre alt sein, um Randly gemäß den Nutzungsbedingungen der Seite zu verwenden.",
        faq8Q: "Übersetzt Randly Nachrichten automatisch zwischen Sprachen?",
        faq8A: "Ja, du kannst die sofortige Übersetzung für Textchat-Nachrichten aktivieren und deine bevorzugte Sprache aus dem Übersetzungsmenü wählen.",
        rights: "Alle Rechte vorbehalten.",
        rulesLink: "Regeln",
        privacyLink: "Datenschutz",
        contactLink: "Kontakt",
        aboutLink: "Über Uns",
        visitor: "Besucher",
        remoteUser: "Fremder",
        youUser: "Du",
        connectedStatus: "Verbunden!",
        searchingText: "Suche nach Person...",
        welcomeMsg: "Willkommen! Start klicken.",
        typingText: "Schreibt...",
        matchGlobal: "🌐 Weltweit (Smart Match)",
        noTranslation: "Keine Übersetzung",
        msgPlaceholder: "Nachricht",
        skipStartBtn: "Weiter / Start",
        turnText: "Du bist dran",
        noCountryMatchMsg: "Gerade ist niemand aus deinem Land online — wir verbinden dich mit jemandem von überall."
    },
    it: {
        siteTitle: "Randly - Chat video e testo casuale",
        logoTitle: "Randly 🎲",
        landingSub: "Parla con estranei in tutto il mondo in sicurezza!",
        onlineNow: "Online",
        interestsPlaceholder: "Inserisci interessi...",
        videoChatBtn: "Video Chat",
        textChatBtn: "Chat Testuale",
        feat1Title: "Senza Registrazione",
        feat1Desc: "Inizia subito in modo anonimo.",
        feat2Title: "Abbinamento per Interessi",
        feat2Desc: "Trova persone con la tua stessa passione.",
        feat3Title: "Comunità Globale",
        feat3Desc: "Migliaia di utenti connessi 24 ore su 24.",
        feat4Title: "Ambiente Sicuro",
        feat4Desc: "Segnalazione immediata e blocchi temporanei automatici per chi viola le regole, per mantenere le conversazioni rispettose.",
        faqTitle: "FAQ",
        faq1Q: "Randly è gratuito?",
        faq1A: "Sì, completamente gratuito.",
        faq2Q: "Posso usarlo da cellulare?",
        faq2A: "Certo! Funziona perfettamente su dispositivi mobili.",
        faq3Q: "Qual è la migliore alternativa a Omegle ora che ha chiuso?",
        faq3A: "Randly è una delle migliori alternative a Omegle: chat video e testo casuale gratuita con sconosciuti, senza registrazione, con segnalazione e blocchi temporanei per chi viola le regole e abbinamento per interessi.",
        faq4Q: "È sicuro usare Randly?",
        faq4A: "Randly offre la segnalazione immediata e applica automaticamente blocchi temporanei agli utenti che ricevono più segnalazioni. Non memorizza le tue conversazioni e non richiede la registrazione di dati personali. Chatta comunque con prudenza e non condividere informazioni private con gli sconosciuti.",
        faq5Q: "Come funziona la chat casuale su Randly?",
        faq5A: "Basta cliccare su \"Video Chat\" o \"Chat Testuale\" e sarai connesso istantaneamente con una persona casuale online in quel momento; puoi passare alla persona successiva in qualsiasi momento con un clic.",
        faq6Q: "Posso scegliere il paese della persona con cui parlo?",
        faq6A: "Sì, Randly offre un filtro per connettersi con persone di un paese specifico, oppure usare la modalità \"Globale\" per essere abbinati a chiunque nel mondo.",
        faq7Q: "Qual è l'età minima per usare Randly?",
        faq7A: "Gli utenti devono avere almeno 18 anni per usare Randly, in conformità con i Termini e Condizioni del sito.",
        faq8Q: "Randly traduce automaticamente i messaggi tra le lingue?",
        faq8A: "Sì, puoi attivare la traduzione istantanea per i messaggi della chat testuale e scegliere la tua lingua preferita dal menu di traduzione.",
        rights: "Tutti i diritti riservati.",
        rulesLink: "Regole",
        privacyLink: "Privacy",
        contactLink: "Contatti",
        aboutLink: "Chi Siamo",
        visitor: "Visitatore",
        remoteUser: "Estraneo",
        youUser: "Tu",
        connectedStatus: "Connesso!",
        searchingText: "Ricerca in corso...",
        welcomeMsg: "Benvenuto! Clicca Start.",
        typingText: "Sta scrivendo...",
        matchGlobal: "🌐 Globale (Smart Match)",
        noTranslation: "Senza Traduzione",
        msgPlaceholder: "Scrivi un messaggio",
        skipStartBtn: "Salta / Start",
        turnText: "Tuo turno",
        noCountryMatchMsg: "Nessuno dal tuo paese è online in questo momento — ti connetteremo con qualcuno da qualsiasi parte del mondo."
    },
    pt: {
        siteTitle: "Randly - Chat de vídeo e texto aleatório",
        logoTitle: "Randly 🎲",
        landingSub: "Fale com estranhos em todo o mundo com segurança!",
        onlineNow: "Online",
        interestsPlaceholder: "Digite interesses...",
        videoChatBtn: "Chat de Vídeo",
        textChatBtn: "Chat de Texto",
        feat1Title: "Sem Registro (Anônimo)",
        feat1Desc: "Comece a conversar instantaneamente.",
        feat2Title: "Correspondência por Interesses",
        feat2Desc: "Conecte-se com pessoas que compartilham sua paixão.",
        feat3Title: "Comunidade Global",
        feat3Desc: "Milhares de usuários conectados 24 horas por dia.",
        feat4Title: "Ambiente Seguro",
        feat4Desc: "Denúncia instantânea e bloqueios temporários automáticos para quem violar as regras, para manter as conversas respeitosas.",
        faqTitle: "FAQ",
        faq1Q: "O Randly é gratuito?",
        faq1A: "Sim, totalmente gratuito.",
        faq2Q: "Posso usar no celular?",
        faq2A: "Com certeza! Funciona perfeitamente em dispositivos móveis.",
        faq3Q: "Qual é a melhor alternativa ao Omegle agora que ele foi encerrado?",
        faq3A: "O Randly é uma das melhores alternativas ao Omegle: chat de vídeo e texto aleatório grátis com estranhos, sem cadastro, com denúncia e bloqueios temporários para infratores e correspondência por interesses.",
        faq4Q: "É seguro usar o Randly?",
        faq4A: "O Randly oferece denúncia instantânea e aplica bloqueios temporários automáticos a usuários que recebem várias denúncias. Não armazena suas conversas nem exige cadastro de dados pessoais. Mesmo assim, converse com cuidado e nunca compartilhe informações privadas com estranhos.",
        faq5Q: "Como funciona o chat aleatório no Randly?",
        faq5A: "Basta clicar em \"Chat de Vídeo\" أو \"Chat de Texto\" e você será conectado instantaneamente a uma pessoa aleatória online agora; você pode pular para a próxima pessoa a qualquer momento com um clique.",
        faq6Q: "Posso escolher o país da pessoa com quem estou falando?",
        faq6A: "Sim, o Randly oferece um filtro para se conectar com pessoas de um país específico, ou usar o modo \"Global\" para se conectar com qualquer pessoa no mundo.",
        faq7Q: "Qual é a idade mínima para usar o Randly?",
        faq7A: "Os usuários devem ter 18 anos ou mais para usar o Randly, de acordo com os Termos e Condições do site.",
        faq8Q: "O Randly traduz mensagens automaticamente entre idiomas?",
        faq8A: "Sim, você pode ativar a tradução instantânea para mensagens do chat de texto e escolher seu idioma preferido no menu de tradução.",
        rights: "Todos os direitos reservados.",
        rulesLink: "Regras",
        privacyLink: "Privacidade",
        contactLink: "Contato",
        aboutLink: "Sobre Nós",
        visitor: "Visitante",
        remoteUser: "Estranho",
        youUser: "Você",
        connectedStatus: "Conectado!",
        searchingText: "Procurando pessoa...",
        welcomeMsg: "Bem-vindo! Clique em Start.",
        typingText: "Digitando...",
        matchGlobal: "🌐 Global (Smart Match)",
        noTranslation: "Sem Tradução",
        msgPlaceholder: "Digite uma mensagem",
        skipStartBtn: "Pular / Start",
        turnText: "Sua vez",
        noCountryMatchMsg: "Ninguém do seu país está online agora — vamos te conectar com alguém de qualquer lugar do mundo."
    },
    tr: {
        siteTitle: "Randly - Yabancılarla Ücretsiz Rastgele Görüntülü Sohbet",
        logoTitle: "Randly 🎲",
        landingSub: "Dünyanın her yerinden rastgele insanlarla güvenli ve hızlı bir şekilde sohbet edin!",
        onlineNow: "Şu anda çevrimiçi",
        interestsPlaceholder: "İlgi alanlarınızı girin...",
        videoChatBtn: "Görüntülü Sohbet",
        textChatBtn: "Yazılı Sohbet",
        feat1Title: "Anonim - Kayıt Gerekmez",
        feat1Desc: "Tek tıkla anında sohbete başlayın, hesap gerekmez.",
        feat2Title: "İlgi Alanına Göre Eşleşme",
        feat2Desc: "Tutkunuzu paylaşan insanlarla eşleşin.",
        feat3Title: "Küresel Topluluk",
        feat3Desc: "Binlerce kullanıcı 7/24 çevrimiçi.",
        feat4Title: "Güvenli Ortam",
        feat4Desc: "Kuralları ihlal edenler için anında bildirim ve otomatik geçici engelleme; sohbetler saygılı kalsın diye.",
        faqTitle: "Sıkça Sorulan Sorular",
        faq1Q: "Randly ücretsiz mi?",
        faq1A: "Evet, tamamen ücretsiz sohbet edebilirsiniz.",
        faq2Q: "Telefonumda kullanabilir miyim?",
        faq2A: "Kesinlikle! Mobil cihazlarda sorunsuz çalışır.",
        faq3Q: "Omegle kapandıktan sonra en iyi alternatif nedir?",
        faq3A: "Randly, kayıt olmadan yabancılarla ücretsiz rastgele görüntülü ve yazılı sohbet sunan, ihlal edenler için bildirim ve geçici engelleme ile ilgi alanına göre eşleştirme özelliği bulunan Omegle'ın en iyi alternatiflerinden biridir.",
        faq4Q: "Randly kullanmak güvenli mi?",
        faq4A: "Randly anında bildirim özelliği sunar ve birden fazla bildirim alan kullanıcıları otomatik olarak geçici süreyle engeller. Sohbetlerinizi saklamaz ve kişisel veri kaydı istemez. Yine de dikkatli olun ve yabancılarla özel bilgilerinizi paylaşmayın.",
        faq5Q: "Randly'de rastgele sohbet nasıl çalışır?",
        faq5A: "Sadece \"Görüntülü Sohbet\" veya \"Yazılı Sohbet\"e tıklayın, anında şu anda çevrimiçi olan rastgele bir kişiyle bağlanırsınız; istediğiniz zaman tek tıkla bir sonraki kişiye geçebilirsiniz.",
        faq6Q: "Konuştuğum kişinin ülkesini seçebilir miyim?",
        faq6A: "Evet, Randly belirli bir ülkeden insanlarla bağlanmak için bir filtre sunar veya dünyadaki herkesle eşleşmek için \"Küresel\" modunu kullanabilirsiniz.",
        faq7Q: "Randly kullanmak için minimum yaş nedir?",
        faq7A: "Kullanıcıların, sitenin Kullanım Şartları'na göre Randly'yi kullanmak için 18 yaşında veya daha büyük olması gerekir.",
        faq8Q: "Randly mesajları diller arasında otomatik olarak çevirir mi?",
        faq8A: "Evet, yazılı sohbet mesajları için anında çeviriyi etkinleştirebilir ve çeviri menüsünden tercih ettiğiniz dili seçebilirsiniz.",
        rights: "Tüm hakları saklıdır.",
        rulesLink: "Kurallar",
        privacyLink: "Gizlilik Politikası",
        contactLink: "Bize Ulaşın",
        aboutLink: "Hakkımızda",
        visitor: "Misafir",
        remoteUser: "Yabancı",
        youUser: "Sen",
        connectedStatus: "Bağlandı!",
        searchingText: "Rastgele bir kişi aranıyor...",
        welcomeMsg: "Hoş geldiniz! Sohbete başlamak için Start'a tıklayın.",
        typingText: "Yabancı yazıyor...",
        matchGlobal: "🌐 Küresel (Akıllı Eşleştirme)",
        noTranslation: "Çeviri yok",
        msgPlaceholder: "Mesaj yazın",
        skipStartBtn: "Geç / Başlat",
        turnText: "Sıra sende",
        noCountryMatchMsg: "Şu anda ülkenizden kimse çevrimiçi değil — sizi dünyanın herhangi bir yerinden biriyle bağlıyoruz."
    },
    ru: {
        siteTitle: "Randly - Бесплатный Случайный Видеочат с Незнакомцами",
        logoTitle: "Randly 🎲",
        landingSub: "Общайтесь со случайными людьми со всего мира безопасно и быстро!",
        onlineNow: "Сейчас онлайн",
        interestsPlaceholder: "Введите свои интересы...",
        videoChatBtn: "Видеочат",
        textChatBtn: "Текстовый чат",
        feat1Title: "Анонимно - Без Регистрации",
        feat1Desc: "Начните общение мгновенно одним кликом.",
        feat2Title: "Подбор по Интересам",
        feat2Desc: "Находите людей, разделяющих вашу страсть.",
        feat3Title: "Глобальное Сообщество",
        feat3Desc: "Тысячи пользователей онлайн 24/7.",
        feat4Title: "Безопасная Среда",
        feat4Desc: "Мгновенные жалобы и автоматические временные блокировки нарушителей, чтобы общение оставалось уважительным.",
        faqTitle: "Часто Задаваемые Вопросы",
        faq1Q: "Randly бесплатный?",
        faq1A: "Да, полностью бесплатно.",
        faq2Q: "Могу ли я использовать на телефоне?",
        faq2A: "Конечно! Плавно работает на мобильных устройствах.",
        faq3Q: "Какая лучшая альтернатива Omegle после его закрытия?",
        faq3A: "Randly — одна из лучших альтернатив Omegle: бесплатный случайный видео- и текстовый чат с незнакомцами без регистрации, с функцией жалоб и временными блокировками нарушителей, а также подбором по интересам.",
        faq4Q: "Безопасно ли использовать Randly?",
        faq4A: "В Randly есть мгновенные жалобы, а пользователи, получившие несколько жалоб, автоматически блокируются на время. Мы не храним ваши переписки и не требуем регистрации личных данных. Тем не менее общайтесь осторожно и не делитесь личной информацией с незнакомцами.",
        faq5Q: "Как работает случайный чат на Randly?",
        faq5A: "Просто нажмите \"Видеочат\" или \"Текстовый чат\", и вы мгновенно подключитесь к случайному человеку, находящемуся сейчас онлайн; вы можете пропустить и перейти к следующему человеку в любой момент одним кликом.",
        faq6Q: "Могу ли я выбрать страну собеседника?",
        faq6A: "Да, Randly предлагает фильтр для подключения к людям из определённой страны, или можно использовать режим \"Глобально\" для подключения к кому угодно в мире.",
        faq7Q: "Какой минимальный возраст для использования Randly?",
        faq7A: "Пользователи должны быть не моложе 18 лет для использования Randly в соответствии с Условиями использования сайта.",
        faq8Q: "Переводит ли Randly сообщения автоматически между языками?",
        faq8A: "Да, вы можете включить мгновенный перевод для сообщений текстового чата и выбрать предпочитаемый язык в меню перевода.",
        rights: "Все права защищены.",
        rulesLink: "Правила",
        privacyLink: "Политика Конфиденциальности",
        contactLink: "Связаться с нами",
        aboutLink: "О нас",
        visitor: "Гость",
        remoteUser: "Незнакомец",
        youUser: "Вы",
        connectedStatus: "Подключено!",
        searchingText: "Поиск случайного человека...",
        welcomeMsg: "Добро пожаловать! Нажмите Start.",
        typingText: "Незнакомец печатает...",
        matchGlobal: "🌐 Глобально (Умный Подбор)",
        noTranslation: "Без перевода",
        msgPlaceholder: "Введите сообщение",
        skipStartBtn: "Пропустить / Начать",
        turnText: "Ваш ход",
        noCountryMatchMsg: "Сейчас никого из вашей страны нет онлайн — мы подключим вас с кем-то из любой точки мира."
    },
    hi: {
        siteTitle: "Randly - अजनबियों के साथ मुफ्त रैंडम वीडियो चैट",
        logoTitle: "Randly 🎲",
        landingSub: "दुनिया भर के रैंडम लोगों के साथ सुरक्षित और तेज़ी से चैट करें!",
        onlineNow: "अभी ऑनलाइन",
        interestsPlaceholder: "अपनी रुचियाँ दर्ज करें...",
        videoChatBtn: "वीडियो चैट",
        textChatBtn: "टेक्स्ट चैट",
        feat1Title: "गुमनाम - बिना रजिस्ट्रेशन",
        feat1Desc: "एक क्लिक में तुरंत चैट शुरू करें।",
        feat2Title: "रुचि के अनुसार मिलान",
        feat2Desc: "अपना जुनून साझा करने वाले लोगों से जुड़ें।",
        feat3Title: "वैश्विक समुदाय",
        feat3Desc: "हजारों उपयोगकर्ता 24/7 ऑनलाइन।",
        feat4Title: "सुरक्षित वातावरण",
        feat4Desc: "नियम तोड़ने वालों के लिए तुरंत रिपोर्ट और स्वचालित अस्थायी ब्लॉक, ताकि चैट सम्मानजनक बनी रहे।",
        faqTitle: "अक्सर पूछे जाने वाले सवाल",
        faq1Q: "क्या Randly मुफ्त है?",
        faq1A: "हाँ, पूरी तरह से मुफ्त।",
        faq2Q: "क्या मैं फोन पर इस्तेमाल कर सकता हूँ?",
        faq2A: "बिल्कुल! मोबाइल डिवाइस पर सुचारू रूप से काम करता है।",
        faq3Q: "Omegle बंद होने के बाद इसका सबसे अच्छा विकल्प क्या है?",
        faq3A: "Randly, Omegle के सबसे अच्छे विकल्पों में से एक है: बिना रजिस्ट्रेशन अजनबियों के साथ मुफ्त रैंडम वीडियो और टेक्स्ट चैट, नियम तोड़ने वालों के लिए रिपोर्ट और अस्थायी ब्लॉक की सुविधा, और रुचि-आधारित मिलान के साथ।",
        faq4Q: "क्या Randly का उपयोग करना सुरक्षित है?",
        faq4A: "Randly तुरंत रिपोर्ट करने की सुविधा देता है और कई रिपोर्ट पाने वाले उपयोगकर्ताओं को स्वचालित रूप से कुछ समय के लिए ब्लॉक कर देता है। यह आपकी बातचीत स्टोर नहीं करता और व्यक्तिगत रजिस्ट्रेशन नहीं माँगता। फिर भी सावधानी से चैट करें और अजनबियों से निजी जानकारी साझा न करें।",
        faq5Q: "Randly पर रैंडम चैट कैसे काम करता है?",
        faq5A: "बस \"वीडियो चैट\" या \"टेक्स्ट चैट\" पर क्लिक करें, और आप तुरंत ऑनलाइन मौजूद किसी रैंडम व्यक्ति से जुड़ जाएंगे; आप किसी भी समय एक क्लिक में अगले व्यक्ति पर स्किप कर सकते हैं।",
        faq6Q: "क्या मैं उस व्यक्ति का देश चुन सकता हूँ जिससे मैं बात कर रहा हूँ?",
        faq6A: "हाँ, Randly किसी विशेष देश के लोगों से जुड़ने के लिए एक फ़िल्टर देता है, या आप \"वैश्विक\" मोड का उपयोग कर सकते हैं।",
        faq7Q: "Randly का उपयोग करने के लिए न्यूनतम आयु क्या है?",
        faq7A: "साइट की नियम एवं शर्तों के अनुसार, Randly का उपयोग करने के लिए उपयोगकर्ता की आयु 18 वर्ष या उससे अधिक होनी चाहिए।",
        faq8Q: "क्या Randly भाषाओं के बीच संदेशों का स्वचालित रूप से अनुवाद करता है?",
        faq8A: "हाँ, आप टेक्स्ट चैट संदेशों के लिए तुरंत अनुवाद सक्षम कर सकते हैं और अनुवाद मेनू से अपनी पसंदीदा भाषा चुन सकते हैं।",
        rights: "सर्वाधिकार सुरक्षित।",
        rulesLink: "नियम",
        privacyLink: "गोपनीयता नीति",
        contactLink: "हमसे संपर्क करें",
        aboutLink: "हमारे बारे में",
        visitor: "अतिथि",
        remoteUser: "अजनबी",
        youUser: "आप",
        connectedStatus: "कनेक्ट हो गया!",
        searchingText: "रैंडम व्यक्ति खोजा जा रहा है...",
        welcomeMsg: "स्वागत है! Start पर क्लिक करें।",
        typingText: "अजनबी टाइप कर रहा है...",
        matchGlobal: "🌐 वैश्विक (स्मार्ट मिलान)",
        noTranslation: "कोई अनुवाद नहीं",
        msgPlaceholder: "मैसेज लिखें",
        skipStartBtn: "स्किप / शुरू करें",
        turnText: "आपकी बारी",
        noCountryMatchMsg: "अभी आपके देश से कोई ऑनलाइन नहीं है — हम आपको दुनिया में कहीं से भी किसी से जोड़ रहे हैं।"
    },
    id: {
        siteTitle: "Randly - Video Chat Acak Gratis dengan Orang Asing",
        logoTitle: "Randly 🎲",
        landingSub: "Ngobrol dengan orang acak dari seluruh dunia dengan aman dan cepat!",
        onlineNow: "Online sekarang",
        interestsPlaceholder: "Masukkan minat Anda...",
        videoChatBtn: "Video Chat",
        textChatBtn: "Text Chat",
        feat1Title: "Anonim - Tanpa Registrasi",
        feat1Desc: "Mulai ngobrol langsung dengan satu klik.",
        feat2Title: "Pencocokan Berdasarkan Minat",
        feat2Desc: "Terhubung dengan orang yang memiliki minat sama.",
        feat3Title: "Komunitas Global",
        feat3Desc: "Ribuan pengguna online 24/7.",
        feat4Title: "Lingkungan Aman",
        feat4Desc: "Laporan instan dan pemblokiran sementara otomatis bagi pelanggar, agar obrolan tetap saling menghormati.",
        faqTitle: "Pertanyaan yang Sering Diajukan",
        faq1Q: "Apakah Randly gratis?",
        faq1A: "Ya, sepenuhnya gratis.",
        faq2Q: "Bisakah saya gunakan di ponsel?",
        faq2A: "Tentu saja! Berjalan lancar di perangkat mobile.",
        faq3Q: "Apa alternatif terbaik untuk Omegle setelah ditutup?",
        faq3A: "Randly adalah salah satu alternatif terbaik untuk Omegle: video dan text chat acak gratis dengan orang asing tanpa registrasi, dengan fitur laporan dan pemblokiran sementara bagi pelanggar serta pencocokan berdasarkan minat.",
        faq4Q: "Apakah aman menggunakan Randly?",
        faq4A: "Randly menyediakan laporan instan dan otomatis memblokir sementara pengguna yang menerima banyak laporan. Randly tidak menyimpan percakapan Anda dan tidak meminta registrasi data pribadi. Tetap berhati-hati dan jangan bagikan informasi pribadi kepada orang asing.",
        faq5Q: "Bagaimana cara kerja chat acak di Randly?",
        faq5A: "Cukup klik \"Video Chat\" أو \"Text Chat\", dan Anda akan langsung terhubung dengan orang acak yang sedang online; Anda bisa lewati ke orang berikutnya kapan saja dengan satu klik.",
        faq6Q: "Bisakah saya memilih negara orang yang saya ajak bicara?",
        faq6A: "Ya, Randly menyediakan filter untuk terhubung dengan orang dari negara tertentu, atau gunakan mode \"Global\" untuk terhubung dengan siapa saja di seluruh dunia.",
        faq7Q: "Berapa usia minimum untuk menggunakan Randly?",
        faq7A: "Pengguna harus berusia 18 tahun atau lebih untuk menggunakan Randly, sesuai dengan Syarat dan Ketentuan situs.",
        faq8Q: "Apakah Randly menerjemahkan pesan secara otomatis antar bahasa?",
        faq8A: "Ya, Anda bisa mengaktifkan terjemahan instan untuk pesan text chat dan memilih bahasa pilihan Anda dari menu terjemahan.",
        rights: "Semua hak dilindungi.",
        rulesLink: "Aturan",
        privacyLink: "Kebijakan Privasi",
        contactLink: "Hubungi Kami",
        aboutLink: "Tentang Kami",
        visitor: "Tamu",
        remoteUser: "Orang Asing",
        youUser: "Anda",
        connectedStatus: "Terhubung!",
        searchingText: "Mencari orang secara acak...",
        welcomeMsg: "Selamat datang! Klik Start.",
        typingText: "Orang asing sedang mengetik...",
        matchGlobal: "🌐 Global (Pencocokan Cerdas)",
        noTranslation: "Tanpa terjemahan",
        msgPlaceholder: "Ketik pesan",
        skipStartBtn: "Lewati / Mulai",
        turnText: "Giliran Anda",
        noCountryMatchMsg: "Belum ada orang dari negara Anda yang online sekarang — kami akan menghubungkan Anda dengan seseorang dari mana saja."
    },
    zh: {
        siteTitle: "Randly - 与陌生人免费随机视频聊天",
        logoTitle: "Randly 🎲",
        landingSub: "安全快速地与来自世界各地的随机用户聊天！",
        onlineNow: "当前在线",
        interestsPlaceholder: "输入您的兴趣...",
        videoChatBtn: "视频聊天",
        textChatBtn: "文字聊天",
        feat1Title: "匿名 - 无需注册",
        feat1Desc: "一键即刻开始聊天。",
        feat2Title: "兴趣匹配",
        feat2Desc: "与志同道合的人建立联系。",
        feat3Title: "全球社区",
        feat3Desc: "数千名用户全天候在线。",
        feat4Title: "安全环境",
        feat4Desc: "即时举报功能，并对违规用户自动临时封禁，让聊天保持文明。",
        faqTitle: "常见问题",
        faq1Q: "Randly 是免费的吗？",
        faq1A: "是的，完全免费。",
        faq2Q: "我可以在手机上使用吗？",
        faq2A: "当然可以！在移动设备上流畅运行。",
        faq3Q: "Omegle 关闭后，最好的替代平台是什么？",
        faq3A: "Randly 是 Omegle 最好的替代平台之一：无需注册即可与陌生人免费随机视频和文字聊天，提供举报功能和对违规用户的临时封禁，并支持按兴趣匹配。",
        faq4Q: "使用 Randly 安全吗？",
        faq4A: "Randly 提供即时举报功能，并会对收到多次举报的用户自动临时封禁。Randly 不会存储您的聊天记录，也不要求注册个人资料。不过请谨慎聊天，切勿向陌生人透露私人信息。",
        faq5Q: "Randly 上的随机聊天是如何运作的？",
        faq5A: "只需点击\"视频聊天\"或\"文字聊天\"，您就会立即与当前在线的随机用户连接；您可以随时一键跳到下一位用户。",
        faq6Q: "我可以选择与我聊天的对方所在的国家吗？",
        faq6A: "可以，Randly 提供筛选功能，让您与特定国家的人连接，或使用\"全球\"模式与世界各地的任何人匹配。",
        faq7Q: "使用 Randly 的最低年龄是多少？",
        faq7A: "根据网站的服务条款，用户必须年满 18 岁才能使用 Randly。",
        faq8Q: "Randly 会自动在不同语言之间翻译消息吗？",
        faq8A: "可以，您可以为文字聊天消息启用即时翻译，并从翻译菜单中选择您偏好的语言。",
        rights: "版权所有。",
        rulesLink: "规则",
        privacyLink: "隐私政策",
        contactLink: "联系我们",
        aboutLink: "关于我们",
        visitor: "访客",
        remoteUser: "陌生人",
        youUser: "你",
        connectedStatus: "已连接！",
        searchingText: "正在寻找随机用户...",
        welcomeMsg: "欢迎！点击 Start 开始聊天。",
        typingText: "陌生人正在输入...",
        matchGlobal: "🌐 全球（智能匹配）",
        noTranslation: "不翻译",
        msgPlaceholder: "输入消息",
        skipStartBtn: "跳过 / 开始",
        turnText: "轮到你了",
        noCountryMatchMsg: "目前没有来自您所在国家的在线用户 — 我们将为您匹配世界各地的任何人。"
    }
};

function changeGlobalLanguage(lang) {
    if (!translations[lang]) lang = 'ar';
    const htmlRoot = document.getElementById('htmlRoot') || document.documentElement;

    if (lang === 'ar') {
        htmlRoot.setAttribute('dir', 'rtl');
        htmlRoot.setAttribute('lang', 'ar');
    } else {
        htmlRoot.setAttribute('dir', 'ltr');
        htmlRoot.setAttribute('lang', lang);
    }

    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[lang] && translations[lang][key]) {
            el.textContent = translations[lang][key];
        }
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (translations[lang] && translations[lang][key]) {
            el.setAttribute('placeholder', translations[lang][key]);
        }
    });

    if (currentPartnerCountry) {
        const nameElement = document.getElementById('remoteUserCountryName');
        if (nameElement) {
            if (currentPartnerCountry === 'global') {
                nameElement.textContent = translations[lang]?.matchGlobal || 'عالمي (Smart Match)';
            } else {
                try {
                    const regionNames = new Intl.DisplayNames([lang], { type: 'region' });
                    nameElement.textContent = '- ' + regionNames.of(currentPartnerCountry.toUpperCase());
                } catch (e) {
                    nameElement.textContent = '';
                }
            }
        }
    }

    populateLanguageSelects();
    populateCountrySelects();

    const landingSelect = document.getElementById('landingLangSelect');
    const siteLangSelect = document.getElementById('siteLang');
    if (landingSelect) landingSelect.value = lang;
    if (siteLangSelect) siteLangSelect.value = lang;

    localStorage.setItem('randly_lang', lang);
}

// تهيئة اللغة بتتم في i18n-extra.js من <html lang> (من غير اكتشاف لغة المتصفح، عشان الصفحة تفضل بلغتها الثابتة)
