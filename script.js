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

// تهيئة الثيم عند تحميل الصفحة (LocalStorage)
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('randly_theme');
    if (savedTheme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        const themeBtn = document.querySelector('.theme-toggle');
        if (themeBtn) themeBtn.textContent = '☀️';
    }
    
    // ضبط أيقونة الصوت
    const muteBtn = document.getElementById('muteBtn');
    if (muteBtn) muteBtn.textContent = isSoundMuted ? '🔇' : '🔊';
});

// دالة كتم الصوت
function toggleSoundMute() {
    isSoundMuted = !isSoundMuted;
    localStorage.setItem('randly_sound_muted', isSoundMuted);
    const muteBtn = document.getElementById('muteBtn');
    if (muteBtn) muteBtn.textContent = isSoundMuted ? '🔇' : '🔊';
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

// مؤشر الكتابة (Typing Indicator)
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

// نسخ الرابط
function copyRoomLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
        // يتم النسخ في صمت دون التأثير على الواجهة
    });
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

async function startSession(mode) {
    currentMode = mode;
    landingPage.style.display = 'none';

    if (mode === 'video') {
        videoSection.style.display = 'flex';
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            if (localVideo) localVideo.srcObject = localStream;
        } catch (err) {
            appendSystemMessage('تعذر الوصول للكاميرا.');
        }
    } else {
        videoSection.style.display = 'none';
    }
    nextUser();
}

function handleMainButton() {
    const btn = document.getElementById('nextBtn');
    if (buttonState === 'start') {
        startSession(currentMode);
        buttonState = 'skip';
        btn.textContent = 'Skip';
    } else if (buttonState === 'skip') {
        buttonState = 'really';
        btn.textContent = 'Really?';
    } else if (buttonState === 'really') {
        nextUser();
        buttonState = 'skip';
        btn.textContent = 'Skip';
    }
}

function nextUser() {
    clearRemoteVideo();
    chatBox.innerHTML = '';
    
    // إظهار شاشة التحميل (Skeleton)
    chatBox.style.display = 'none';
    skeletonLoader.style.display = 'block';
    
    statusDiv.textContent = 'جاري البحث...';

    const interests = document.getElementById('interestsInput').value;
    const selectedCountry = countrySelect.value;

    socket.emit('find-match', {
        mode: currentMode,
        interests: interests,
        country: selectedCountry
    });
}

function leaveSession() {
    clearRemoteVideo();
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    landingPage.style.display = 'flex';
    buttonState = 'start';
    const btn = document.getElementById('nextBtn');
    if (btn) btn.textContent = 'Start';
    socket.emit('leave-room');
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
            micBtn.style.borderColor = isMicMuted ? '#ff4d4d' : 'transparent';
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
            camBtn.style.borderColor = isCamOff ? '#ff4d4d' : 'transparent';
        }
    }
}

// نظام الإبلاغ المطور
function reportUser() {
    socket.emit('submit-report', { reason: 'Inappropriate behavior' });
    console.log("تم تسجيل الإبلاغ على السيرفر.");
}

// --- لعبة XO أونلاين عبر Socket.io ---
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
    if (localStream && currentMode === 'video') {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
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
    
    // إخفاء شاشة التحميل وإظهار الشات
    skeletonLoader.style.display = 'none';
    chatBox.style.display = 'flex'; // تأكد إن هذا هو الـ display الافتراضي للـ CSS بتاعك
    
    // تشغيل صوت المطابقة
    if (!isSoundMuted) matchSound.play().catch(()=>{});

    // إعداد أدوار الـ XO
    myGameSymbol = data.xoRole;
    isMyTurn = (myGameSymbol === 'X'); // X يبدأ دائمًا
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
    appendSystemMessage('الطرف الآخر غادر.');
});

socket.on('receive-message', (data) => {
    // تشغيل صوت الرسالة
    if (!isSoundMuted) msgSound.play().catch(()=>{});
    appendMessage(data.text, 'other');
    // إخفاء مؤشر الكتابة بمجرد استلام الرسالة
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

function appendMessage(text, type) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('msg', type === 'me' ? 'msg-me' : 'msg-other');
    msgDiv.textContent = text;
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