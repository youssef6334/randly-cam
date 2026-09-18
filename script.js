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
let buttonState = 'start'; // 'start', 'skip', 'really'
let currentRoomId = null; // لتخزين ID الغرفة الحالية

// Elements
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

// --- إعدادات الأصوات (Sound Effects) ---
const matchSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
const msgSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3');
let isSoundMuted = localStorage.getItem('randly_sound_muted') === 'true';

// تهيئة الثيم والأصوات عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('randly_theme');
    if (savedTheme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        const themeBtn = document.querySelector('.theme-toggle');
        if (themeBtn) themeBtn.textContent = '☀️';
    }
    
    // تحديث أيقونة الصوت
    const muteBtn = document.getElementById('muteBtn');
    if (muteBtn) {
        muteBtn.innerHTML = isSoundMuted ? '<i class="fas fa-volume-mute"></i>' : '<i class="fas fa-volume-up"></i>';
    }
});

// --- التأكد من اكتمال اتصال السوكيت قبل محاولة دخول الغرفة المحفوظة ---
socket.on('connect', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const savedRoom = urlParams.get('room');
    if (savedRoom) {
        currentMode = urlParams.get('mode') || 'text';
        window.history.pushState({}, document.title, window.location.pathname);
        startSession(currentMode, savedRoom); 
    }
});

// --- دوال التحكم في الواجهة (Mute, Theme, Ad) ---
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

// --- ميزة حفظ ونسخ رابط الغرفة ---
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

// --- مؤشر الكتابة ---
let typingTimer;
if (msgInput) {
    msgInput.addEventListener('input', () => {
        socket.emit('typing');
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => socket.emit('stop-typing'), 1000);
    });
}
socket.on('display-typing', () => typingIndicator.style.display = 'block');
socket.on('hide-typing', () => typingIndicator.style.display = 'none');

// --- إدارة الفيديو والمايك ---
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

// --- بدء وإدارة الجلسات ---
async function startSession(mode, specificRoomId = null) {
    currentMode = mode;
    landingPage.style.display = 'none';

    if (mode === 'video') {
        videoSection.style.display = 'flex';
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            if (localVideo) localVideo.srcObject = localStream;
        } catch (err) {
            appendSystemMessage('تعذر الوصول للكاميرا والمايكروفون.');
        }
    } else {
        videoSection.style.display = 'none';
    }

    if (specificRoomId) {
        joinSpecificRoom(specificRoomId);
    } else {
        nextUser();
    }
}

function handleMainButton() {
    const btn = document.getElementById('nextBtn');
    if (buttonState === 'start') {
        startSession(currentMode);
        buttonState = 'skip';
        btn.innerHTML = '<i class="fas fa-forward"></i> Skip';
    } else if (buttonState === 'skip') {
        buttonState = 'really';
        btn.innerHTML = '<i class="fas fa-question-circle"></i> Really?';
    } else if (buttonState === 'really') {
        nextUser();
        buttonState = 'skip';
        btn.innerHTML = '<i class="fas fa-forward"></i> Skip';
    }
}

function nextUser() {
    clearRemoteVideo();
    chatBox.innerHTML = '';
    currentRoomId = null;
    
    chatBox.style.display = 'none';
    skeletonLoader.style.display = 'block';
    statusDiv.textContent = 'جاري البحث...';

    const interestsVal = document.getElementById('interestsInput').value;
    const interestsArray = interestsVal.split(',').map(i => i.trim()).filter(i => i !== '');
    const selectedCountry = countrySelect.value;

    socket.emit('find-match', {
        mode: currentMode,
        interests: interestsArray, 
        country: selectedCountry
    });
}

function joinSpecificRoom(roomId) {
    clearRemoteVideo();
    chatBox.innerHTML = '';
    chatBox.style.display = 'none';
    skeletonLoader.style.display = 'block';
    statusDiv.textContent = 'جاري الانضمام للغرفة المحفوظة...';
    
    socket.emit('join-saved-room', { roomId: roomId, mode: currentMode });
}

function leaveSession() {
    clearRemoteVideo();
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    landingPage.style.display = 'flex';
    buttonState = 'start';
    currentRoomId = null;
    const btn = document.getElementById('nextBtn');
    if (btn) btn.innerHTML = '<i class="fas fa-play"></i> Start';
    
    window.history.pushState({}, document.title, window.location.pathname);
    socket.emit('leave-room');
}

// --- تأثيرات وماسكات الوجه ---
let isMaskOn = false;
let maskAnimationId;

function toggleMask() {
    if (!localStream) return;
    isMaskOn = !isMaskOn;
    
    const maskBtn = document.getElementById('maskBtn');
    const maskCanvas = document.getElementById('maskCanvas');
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
            const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
            if (sender) sender.replaceTrack(canvasTrack);
        }
    } else {
        maskCanvas.style.display = 'none';
        cancelAnimationFrame(maskAnimationId);
        
        if (peerConnection && localStream) {
            const videoTrack = localStream.getVideoTracks()[0];
            const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
            if (sender) sender.replaceTrack(videoTrack);
        }
    }
}

function reportUser() {
    socket.emit('submit-report', { reason: 'Inappropriate behavior' });
    alert("تم تسجيل الإبلاغ عن هذا المستخدم.");
}

// --- لعبة XO أونلاين ---
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
    document.getElementById('gameStatusText').textContent = isMyTurn ? 'دورك الآن ( ' + myGameSymbol + ' )' : 'انتظر دورك...';
}

function makeMove(cellIndex) {
    if (!isMyTurn || xoBoard[cellIndex] !== '') return;
    
    xoBoard[cellIndex] = myGameSymbol;
    document.querySelectorAll('.xo-cell')[cellIndex].textContent = myGameSymbol;
    isMyTurn = false;
    document.getElementById('gameStatusText').textContent = 'انتظر دورك...';
    
    socket.emit('xo-move', { index: cellIndex, symbol: myGameSymbol });
}

socket.on('xo-receive-move', (data) => {
    xoBoard[data.index] = data.symbol;
    document.querySelectorAll('.xo-cell')[data.index].textContent = data.symbol;
    isMyTurn = true;
    document.getElementById('gameStatusText').textContent = 'دورك الآن ( ' + myGameSymbol + ' )';
});

// --- WebRTC Setup ---
function createPeerConnection() {
    peerConnection = new RTCPeerConnection(rtcConfig);
    
    let streamToSend = localStream;
    if (isMaskOn) {
        const maskCanvas = document.getElementById('maskCanvas');
        streamToSend = maskCanvas.captureStream(30);
        if (localStream.getAudioTracks().length > 0) {
            streamToSend.addTrack(localStream.getAudioTracks()[0]);
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

// --- Socket Events ---
socket.on('online-count', (count) => {
    const landingCount = document.getElementById('landingOnlineCount');
    const headerCount = document.getElementById('headerOnlineCount');
    if (landingCount) landingCount.textContent = count;
    if (headerCount) headerCount.textContent = count;
});

socket.on('matched', async (data) => {
    statusDiv.textContent = 'متصل الآن!';
    currentRoomId = data.roomId; // حفظ الـ ID من السيرفر
    
    skeletonLoader.style.display = 'none';
    chatBox.style.display = 'flex'; 
    
    if (!isSoundMuted) matchSound.play().catch(()=>{});

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
    statusDiv.textContent = 'انقطع الاتصال';
    appendSystemMessage('الطرف الآخر غادر المحادثة.');
});

// --- ترجمة الرسائل الواردة ---
socket.on('receive-message', async (data) => {
    if (!isSoundMuted) msgSound.play().catch(()=>{});
    
    const targetLang = document.getElementById('translationLang').value;
    let translatedText = null;

    // استخدام Google Translate API (المجاني) لتجنب الليمت
    if (targetLang !== 'none' && data.text) {
        try {
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(data.text)}`;
            const response = await fetch(url);
            const result = await response.json();
            
            if (result && result[0] && result[0][0]) {
                translatedText = result[0].map(item => item[0]).join(''); // تجميع النص لو كان طويل
            }
        } catch (error) {
            console.error("خطأ في الترجمة الفورية:", error);
            translatedText = "(فشل في الترجمة)";
        }
    }

    appendMessage(data.text, 'other', translatedText);
    typingIndicator.style.display = 'none';
});

// --- Chat Logic ---
function sendMsg() {
    const text = msgInput.value.trim();
    if (!text) return;
    
    appendMessage(text, 'me');
    socket.emit('send-message', { text: text });
    socket.emit('stop-typing');
    msgInput.value = '';
}

function appendMessage(text, type, translatedText = null) {
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
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('msg', 'msg-sys');
    msgDiv.style.whiteSpace = 'pre-line';
    msgDiv.textContent = text;
    chatBox.appendChild(msgDiv);
}