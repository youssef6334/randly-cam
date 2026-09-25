const socket = io(window.location.origin, {
    transports: ["websocket"],
    secure: true
});

const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

let localStream = null;
let peerConnection = null;
let currentMode = 'text'; 
let isMicMuted = false;
let isCamOff = false;
let buttonState = 'start'; 
let currentRoomId = null; 
let currentPartnerCountry = null; 

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

// --- نظام اهتمامات الـ Tags (مثل Omegle) ---
let interestsArray = [];

document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('randly_theme');
    if (savedTheme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        const themeBtn = document.querySelector('.theme-toggle');
        if (themeBtn) themeBtn.textContent = '☀️';
    }
    
    const muteBtn = document.getElementById('muteBtn');
    if (muteBtn) {
        muteBtn.innerHTML = isSoundMuted ? '<i class="fas fa-volume-mute"></i>' : '<i class="fas fa-volume-up"></i>';
    }

    if (videoSection) videoSection.style.setProperty('display', 'none', 'important');
    const localBox = document.querySelector('.video-box.local-box');
    if (localBox) localBox.style.setProperty('display', 'none', 'important');

    // تفاعل حقل الـ Tags
    const interestTagInput = document.getElementById('interestTagInput');
    if (interestTagInput) {
        interestTagInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                const val = interestTagInput.value.trim().replace(/,/g, '');
                if (val && !interestsArray.includes(val)) {
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
});

function renderInterestTags() {
    const container = document.getElementById('interestsTagsContainer');
    const interestTagInput = document.getElementById('interestTagInput');
    if (!container || !interestTagInput) return;
    
    container.querySelectorAll('.interest-tag').forEach(tag => tag.remove());
    
    interestsArray.forEach((interest, index) => {
        const tagEl = document.createElement('div');
        tagEl.className = 'interest-tag';
        tagEl.style.cssText = 'background: var(--accent-purple, #8a2be2); color: #fff; padding: 4px 10px; border-radius: 15px; display: inline-flex; align-items: center; gap: 6px; font-size: 13px; margin: 2px;';
        tagEl.innerHTML = `<span>${interest} ✕</span>`;
        tagEl.onclick = (e) => {
            e.stopPropagation();
            interestsArray.splice(index, 1);
            renderInterestTags();
        };
        container.insertBefore(tagEl, interestTagInput);
    });
}

// --- إعدادات الأصوات ---
const matchSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
const msgSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3');
let isSoundMuted = localStorage.getItem('randly_sound_muted') === 'true';

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

function toggleSoundMute() {
    isSoundMuted = !isSoundMuted;
    localStorage.setItem('randly_sound_muted', isSoundMuted);
    const muteBtn = document.getElementById('muteBtn');
    if (muteBtn) {
        muteBtn.innerHTML = isSoundMuted ? '<i class="fas fa-volume-mute"></i>' : '<i class="fas fa-volume-up"></i>';
    }
}

function toggleTheme() {
    const htmlElement = document.documentElement;
    const currentTheme = htmlElement.getAttribute('data-theme');
    const themeBtn = document.querySelector('.theme-toggle');

    if (currentTheme === 'light') {
        htmlElement.removeAttribute('data-theme');
        if (themeBtn) themeBtn.textContent = '🌙';
        localStorage.setItem('randly_theme', 'dark');
    } else {
        htmlElement.setAttribute('data-theme', 'light');
        if (themeBtn) themeBtn.textContent = '☀️';
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
        alert('يجب أن تكون متصلاً بشخص أولاً لتتمكن من نسخ رابط الغرفة!');
        return;
    }
    const url = `${window.location.origin}${window.location.pathname}?room=${currentRoomId}&mode=${currentMode}`;
    navigator.clipboard.writeText(url).then(() => {
        alert('✅ تم نسخ رابط الغرفة بنجاح!\nصلاحية الغرفة 72 ساعة، شارك الرابط مع صديقك للدخول.');
    }).catch(err => {
        console.error('فشل في نسخ الرابط', err);
        alert('عذراً، حدث خطأ أثناء نسخ الرابط.');
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
    currentPartnerCountry = null;
}

function toggleMic() {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        isMicMuted = !isMicMuted;
        audioTrack.enabled = !isMicMuted;
        const micBtn = document.getElementById('micBtn');
        if (micBtn) {
            micBtn.style.opacity = isMicMuted ? '0.5' : '1';
            micBtn.style.color = isMicMuted ? 'var(--accent-red)' : 'var(--text-main)';
            micBtn.innerHTML = isMicMuted ? '<i class="fas fa-microphone-slash"></i>' : '<i class="fas fa-microphone"></i>';
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
            camBtn.style.opacity = isCamOff ? '0.5' : '1';
            camBtn.style.color = isCamOff ? 'var(--accent-red)' : 'var(--text-main)';
            camBtn.innerHTML = isCamOff ? '<i class="fas fa-video-slash"></i>' : '<i class="fas fa-video"></i>';
        }
    }
}

async function startSession(mode, specificRoomId = null) {
    currentMode = mode;
    if (landingPage) landingPage.style.display = 'none';

    const videoOnlyBtns = document.querySelectorAll('.video-only-btn');
    const localBox = document.querySelector('.video-box.local-box');

    if (mode === 'video') {
        if (videoSection) videoSection.style.setProperty('display', 'flex', 'important');
        if (localBox) localBox.style.setProperty('display', 'flex', 'important');
        videoOnlyBtns.forEach(btn => btn.classList.remove('d-none'));

        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            if (localVideo) localVideo.srcObject = localStream;
        } catch (err) {
            appendSystemMessage('تعذر الوصول للكاميرا والمايكروفون.');
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
    }

    if (specificRoomId) {
        joinSpecificRoom(specificRoomId);
    } else {
        nextUser();
    }
}

function handleMainButton() {
    const btn = document.getElementById('nextBtn');
    const currentLang = document.documentElement.lang || 'ar';
    const t = translations[currentLang] || translations['en'];

    if (buttonState === 'start') {
        startSession(currentMode);
        buttonState = 'skip';
        if(btn) btn.innerHTML = `<i class="fas fa-forward"></i> ${t.skipStartBtn}`;
    } else if (buttonState === 'skip') {
        buttonState = 'really';
        if(btn) btn.innerHTML = '<i class="fas fa-question-circle"></i> Really?';
    } else if (buttonState === 'really') {
        nextUser();
        buttonState = 'skip';
        if(btn) btn.innerHTML = `<i class="fas fa-forward"></i> ${t.skipStartBtn}`;
    }
}

function nextUser() {
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
    if(statusDiv) statusDiv.textContent = 'جاري الانضمام للغرفة...';
    
    socket.emit('join-saved-room', { roomId: roomId, mode: currentMode });
}

function leaveSession() {
    clearRemoteVideo();
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    if (landingPage) landingPage.style.display = 'flex';
    
    if (videoSection) videoSection.style.setProperty('display', 'none', 'important');
    const localBox = document.querySelector('.video-box.local-box');
    if (localBox) localBox.style.setProperty('display', 'none', 'important');

    buttonState = 'start';
    currentRoomId = null;
    const btn = document.getElementById('nextBtn');
    const currentLang = document.documentElement.lang || 'ar';
    const t = translations[currentLang] || translations['en'];
    if (btn) btn.innerHTML = `<i class="fas fa-forward"></i> ${t.skipStartBtn}`;
    
    window.history.pushState({}, document.title, window.location.pathname);
    socket.emit('leave-room');
}

let isMaskOn = false;
let maskAnimationId;

function toggleMask() {
    if (!localStream) return;
    isMaskOn = !isMaskOn;
    
    const maskBtn = document.getElementById('maskBtn');
    const maskCanvas = document.getElementById('maskCanvas');
    if(!maskCanvas) return;
    const ctx = maskCanvas.getContext('2d');
    
    if (maskBtn) {
        maskBtn.style.opacity = isMaskOn ? '1' : '0.5';
        maskBtn.style.color = isMaskOn ? 'var(--accent-purple)' : 'var(--text-main)';
    }

    if (isMaskOn) {
        maskCanvas.style.display = 'block';
        maskCanvas.width = localVideo.videoWidth || 640;
        maskCanvas.height = localVideo.videoHeight || 480;
        
        function drawEffect() {
            if (!isMaskOn) return;
            ctx.drawImage(localVideo, 0, 0, maskCanvas.width, maskCanvas.height);
            ctx.fillStyle = "rgba(138, 43, 226, 0.2)";
            ctx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
            
            ctx.font = "bold 24px Arial";
            ctx.fillStyle = "#fff";
            ctx.shadowColor = "rgba(0,0,0,0.5)";
            ctx.shadowBlur = 4;
            ctx.fillText("✨ Randly Filter", 20, 40);

            maskAnimationId = requestAnimationFrame(drawEffect);
        }
        drawEffect();
        
        if (peerConnection) {
            const canvasStream = maskCanvas.captureStream(30);
            const canvasTrack = canvasStream.getVideoTracks()[0];
            const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender) sender.replaceTrack(canvasTrack);
        }
    } else {
        maskCanvas.style.display = 'none';
        cancelAnimationFrame(maskAnimationId);
        
        if (peerConnection && localStream) {
            const videoTrack = localStream.getVideoTracks()[0];
            const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender) sender.replaceTrack(videoTrack);
        }
    }
}

function reportUser() {
    socket.emit('submit-report', { reason: 'Inappropriate behavior' });
    alert("تم تسجيل الإبلاغ عن هذا المستخدم.");
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
    if(gameStatus) gameStatus.textContent = isMyTurn ? `${t.turnText} ( ${myGameSymbol} )` : 'انتظر دورك...';
}

function makeMove(cellIndex) {
    if (!isMyTurn || xoBoard[cellIndex] !== '') return;
    
    xoBoard[cellIndex] = myGameSymbol;
    document.querySelectorAll('.xo-cell')[cellIndex].textContent = myGameSymbol;
    isMyTurn = false;
    const gameStatus = document.getElementById('gameStatusText');
    if(gameStatus) gameStatus.textContent = 'انتظر دورك...';
    
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
    if (isMaskOn) {
        const maskCanvas = document.getElementById('maskCanvas');
        if(maskCanvas) {
            streamToSend = maskCanvas.captureStream(30);
            if (localStream && localStream.getAudioTracks().length > 0) {
                streamToSend.addTrack(localStream.getAudioTracks()[0]);
            }
        }
    }

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
        createPeerConnection();
        if (data.isInitiator) {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            socket.emit('signal', { offer: offer });
        }
    }
});

socket.on('room-not-found', () => {
    alert("هذه الغرفة انتهت صلاحيتها أو غير موجودة.");
    leaveSession();
});

socket.on('signal', async (data) => {
    if (data.offer) {
        if (!peerConnection) createPeerConnection();
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('signal', { answer: answer });
    } else if (data.answer) {
        if (peerConnection) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        }
    } else if (data.candidate) {
        if (peerConnection) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    }
});

socket.on('peer-disconnected', () => {
    clearRemoteVideo();
    if(statusDiv) statusDiv.textContent = 'انقطع الاتصال';
    appendSystemMessage('الطرف الآخر غادر المحادثة.');
});

socket.on('receive-message', async (data) => {
    if (!isSoundMuted) msgSound.play().catch(()=>{});
    
    const translationLangEl = document.getElementById('translationLang');
    const targetLang = translationLangEl ? translationLangEl.value : 'none';
    let translatedText = null;

    if (targetLang !== 'none' && data.text) {
        try {
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(data.text)}`;
            const response = await fetch(url);
            const result = await response.json();
            
            if (result && result[0] && result[0][0]) {
                translatedText = result[0].map(item => item[0]).join(''); 
            }
        } catch (error) {
            console.error("خطأ في الترجمة الفورية:", error);
            translatedText = "(فشل في الترجمة)";
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
        msgDiv.innerHTML = `${safeText} <br><small style="color:var(--accent-purple); display:block; margin-top:5px; font-size:11px; font-weight:bold;">ترجمة: ${safeTrans}</small>`;
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
}

// --- نظام الترجمة ---
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
        feat4Desc: "أنظمة حماية تلقائية وميزات للإبلاغ لضمان بقاء المحادثات نظيفة ومحترمة.",
        faqTitle: "الأسئلة الشائعة",
        faq1Q: "هل موقع Randly مجاني؟",
        faq1A: "نعم، يمكنك الدردشة والتواصل مع الغرباء عبر الفيديو أو النص مجاناً تماماً وبدون أي رسوم خفية.",
        faq2Q: "هل يمكنني استخدام Randly على الهاتف؟",
        faq2A: "بالتأكيد! الموقع مصمم ليعمل بسلاسة تامة على جميع أجهزة الموبايل الذكية.",
        rights: "جميع الحقوق محفوظة.",
        rulesLink: "القواعد",
        privacyLink: "سياسة الخصوصية",
        contactLink: "تواصل معنا",
        visitor: "زائر",
        remoteUser: "الطرف الآخر",
        youUser: "أنت",
        connectedStatus: "متصل الآن!",
        searchingText: "جاري البحث عن شخص عشوائي...",
        welcomeMsg: "مرحباً بك! انقر على Start لبدء الشات.",
        typingText: "الطرف الآخر يكتب الآن...",
        matchGlobal: "🌐 عالمي (Smart Match)",
        noTranslation: "بدون ترجمة",
        msgPlaceholder: "اكتب رسالتك هنا...",
        skipStartBtn: "تخطي / Start",
        turnText: "دورك الآن"
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
        feat4Desc: "Automatic protection systems and report features to keep chats clean.",
        faqTitle: "FAQ",
        faq1Q: "Is Randly free?",
        faq1A: "Yes, you can chat with strangers via video or text completely free with no hidden fees.",
        faq2Q: "Can I use Randly on mobile?",
        faq2A: "Sure! The site is fully responsive and works smoothly on all mobile devices.",
        rights: "All rights reserved.",
        rulesLink: "Rules",
        privacyLink: "Privacy Policy",
        contactLink: "Contact Us",
        visitor: "Visitor",
        remoteUser: "Stranger",
        youUser: "You",
        connectedStatus: "Connected!",
        searchingText: "Searching for a random person...",
        welcomeMsg: "Welcome! Click Start to begin chatting.",
        typingText: "Stranger is typing...",
        matchGlobal: "🌐 Global (Smart Match)",
        noTranslation: "No Translation",
        msgPlaceholder: "Type your message here...",
        skipStartBtn: "Skip / Start",
        turnText: "Your turn"
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
        feat4Desc: "Sistemas de protección automática.",
        faqTitle: "Preguntas Frecuentes",
        faq1Q: "¿Es Randly gratis?",
        faq1A: "Sí, puedes chatear completamente gratis.",
        faq2Q: "¿Puedo usarlo en el móvil?",
        faq2A: "¡Claro! Funciona perfectamente en dispositivos móviles.",
        rights: "Todos los derechos reservados.",
        rulesLink: "Reglas",
        privacyLink: "Privacidad",
        contactLink: "Contacto",
        visitor: "Visitante",
        remoteUser: "Extraño",
        youUser: "Tú",
        connectedStatus: "¡Conectado!",
        searchingText: "Buscando persona aleatoria...",
        welcomeMsg: "¡Bienvenido! Haz clic en Start.",
        typingText: "Escribiendo...",
        matchGlobal: "🌐 Mundial (Smart Match)",
        noTranslation: "Sin Traducción",
        msgPlaceholder: "Escribe tu mensaje...",
        skipStartBtn: "Saltar / Start",
        turnText: "Tu turno"
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
        feat4Desc: "Systèmes de protection automatique.",
        faqTitle: "FAQ",
        faq1Q: "Randly est-il gratuit ?",
        faq1A: "Oui, discutez entièrement gratuitement.",
        faq2Q: "Puis-je l'utiliser sur mobile ?",
        faq2A: "Bien sûr ! Fonctionne parfaitement sur mobile.",
        rights: "Tous droits réservés.",
        rulesLink: "Règles",
        privacyLink: "Confidentialité",
        contactLink: "Contact",
        visitor: "Visiteur",
        remoteUser: "Inconnu",
        youUser: "Vous",
        connectedStatus: "Connecté !",
        searchingText: "Recherche d'une personne...",
        welcomeMsg: "Bienvenue ! Cliquez sur Start.",
        typingText: "Écrit...",
        matchGlobal: "🌐 Mondial (Smart Match)",
        noTranslation: "Sans Traduction",
        msgPlaceholder: "Écrivez votre message...",
        skipStartBtn: "Passer / Start",
        turnText: "À vous"
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
        feat4Desc: "Automatisierter Schutz.",
        faqTitle: "FAQ",
        faq1Q: "Ist Randly kostenlos?",
        faq1A: "Ja, völlig kostenlos.",
        faq2Q: "Auch auf dem Handy?",
        faq2A: "Ja, läuft reibungslos auf Mobilgeräten.",
        rights: "Alle Rechte vorbehalten.",
        rulesLink: "Regeln",
        privacyLink: "Datenschutz",
        contactLink: "Kontakt",
        visitor: "Besucher",
        remoteUser: "Fremder",
        youUser: "Du",
        connectedStatus: "Verbunden!",
        searchingText: "Suche nach Person...",
        welcomeMsg: "Willkommen! Start klicken.",
        typingText: "Schreibt...",
        matchGlobal: "🌐 Weltweit (Smart Match)",
        noTranslation: "Keine Übersetzung",
        msgPlaceholder: "Nachricht schreiben...",
        skipStartBtn: "Weiter / Start",
        turnText: "Du bist dran"
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
        feat4Desc: "Sistemi di protezione automatica.",
        faqTitle: "FAQ",
        faq1Q: "Randly è gratuito?",
        faq1A: "Sì, completamente gratuito.",
        faq2Q: "Posso usarlo da cellulare?",
        faq2A: "Certo! Funziona perfettamente su dispositivi mobili.",
        rights: "Tutti i diritti riservati.",
        rulesLink: "Regole",
        privacyLink: "Privacy",
        contactLink: "Contatti",
        visitor: "Visitatore",
        remoteUser: "Estraneo",
        youUser: "Tu",
        connectedStatus: "Connesso!",
        searchingText: "Ricerca in corso...",
        welcomeMsg: "Benvenuto! Clicca Start.",
        typingText: "Sta scrivendo...",
        matchGlobal: "🌐 Globale (Smart Match)",
        noTranslation: "Senza Traduzione",
        msgPlaceholder: "Scrivi un messaggio...",
        skipStartBtn: "Salta / Start",
        turnText: "Tuo turno"
    },
    pt: {
        siteTitle: "Randly - Chat de vídeo e texto aléatoire",
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
        feat4Desc: "Sistemas de proteção automática.",
        faqTitle: "FAQ",
        faq1Q: "O Randly é gratuito?",
        faq1A: "Sim, totalmente gratuito.",
        faq2Q: "Posso usar no celular?",
        faq2A: "Com certeza! Funciona perfeitamente em dispositivos móveis.",
        rights: "Todos os direitos reservados.",
        rulesLink: "Regras",
        privacyLink: "Privacidade",
        contactLink: "Contato",
        visitor: "Visitante",
        remoteUser: "Estranho",
        youUser: "Você",
        connectedStatus: "Conectado!",
        searchingText: "Procurando pessoa...",
        welcomeMsg: "Bem-vindo! Clique em Start.",
        typingText: "Digitando...",
        matchGlobal: "🌐 Global (Smart Match)",
        noTranslation: "Sem Tradução",
        msgPlaceholder: "Digite sua mensagem...",
        skipStartBtn: "Pular / Start",
        turnText: "Sua vez"
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

    const landingSelect = document.getElementById('landingLangSelect');
    const siteLangSelect = document.getElementById('siteLang');
    if (landingSelect) landingSelect.value = lang;
    if (siteLangSelect) siteLangSelect.value = lang;

    localStorage.setItem('randly_lang', lang);
}

window.addEventListener('DOMContentLoaded', () => {
    let savedLang = localStorage.getItem('randly_lang');
    if (!savedLang) {
        const browserLang = navigator.language || navigator.userLanguage;
        const shortLang = browserLang ? browserLang.split('-')[0] : 'ar';
        savedLang = translations[shortLang] ? shortLang : 'en';
    }
    changeGlobalLanguage(savedLang);
});