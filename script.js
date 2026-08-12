const socket = io();

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const statusText = document.getElementById('status');
const chatBox = document.getElementById('chatBox');
const msgInput = document.getElementById('msgInput');

let localStream = null;
let peerConnection = null;
let currentPeerId = null;
let isMicOn = true;
let isCamOn = true;
let currentMode = 'video'; // النمط الافتراضي (video / text)

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// ==========================================
// 1. إدارة المظهر (Dark / Light Mode)
// ==========================================
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    if (newTheme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
    
    localStorage.setItem('randly-theme', newTheme);
    updateThemeToggleIcons(newTheme);
}

function updateThemeToggleIcons(theme) {
    const btns = document.querySelectorAll('.theme-toggle');
    btns.forEach(btn => {
        btn.innerText = theme === 'light' ? '☀️' : '🌙';
    });
}

// استعادة المظهر المحفوظ عند التحميل
const savedTheme = localStorage.getItem('randly-theme');
if (savedTheme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    updateThemeToggleIcons('light');
}

// ==========================================
// 2. بدء الجلسة والتحكم بالنمط (Text / Video)
// ==========================================
async function startSession(mode) {
    currentMode = mode;
    const landing = document.getElementById('landingPage');
    const videoSec = document.getElementById('videoSection');
    const chatSec = document.getElementById('chatSection');
    const textControls = document.getElementById('textOnlyControls');
    const interests = document.getElementById('interestsInput').value.trim();

    // إخفاء صفحة البداية
    if (landing) landing.style.display = 'none';

    if (mode === 'text') {
        if (videoSec) videoSec.style.display = 'none';
        if (chatSec) chatSec.style.width = '100%';
        if (textControls) textControls.style.display = 'block';
        if (statusText) statusText.innerText = 'جاهز للبحث (شات كتابي)...';
    } else {
        if (videoSec) videoSec.style.display = 'flex';
        if (chatSec) chatSec.style.width = '';
        if (textControls) textControls.style.display = 'none';
        
        // تشغيل الكاميرا والمايك فقط في نمط الفيديو
        await initCamera();
    }

    // إعلام السيرفر ببدء البحث بالاهتمامات والنمط
    socket.emit('start-session', { mode, interests });
}

function leaveSession() {
    // إغلاق الاتصال الحالي
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    currentPeerId = null;

    // إظهار صفحة البداية مجدداً
    const landing = document.getElementById('landingPage');
    if (landing) landing.style.display = 'flex';
    
    if (chatBox) chatBox.innerHTML = '<div class="msg msg-sys">مرحباً بك! انقر على "التالي" لبدء الشات.</div>';
    if (statusText) statusText.innerText = 'متوقف...';

    socket.emit('leave-session');
}

// ==========================================
// 3. تشغيل الكاميرا وإدارة WebRTC
// ==========================================
async function initCamera() {
    try {
        if (!localStream) {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            if (localVideo) localVideo.srcObject = localStream;
        }
        if (statusText) statusText.innerText = 'جاهز للبحث...';
    } catch (err) {
        console.error('Camera Error:', err);
        if (statusText) statusText.innerText = 'يرجى السماح باستخدام الكاميرا!';
    }
}

socket.on('match', async (data) => {
    if (statusText) statusText.innerText = 'متصل الآن!';
    currentPeerId = data.peerId;

    if (currentMode === 'video') {
        createPeerConnection(data.peerId);

        if (data.createOffer) {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            socket.emit('signal', { to: data.peerId, signal: offer });
        }
    }
});

function createPeerConnection(peerId) {
    if (peerConnection) peerConnection.close();

    peerConnection = new RTCPeerConnection(configuration);

    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }

    peerConnection.ontrack = (event) => {
        if (remoteVideo) remoteVideo.srcObject = event.streams[0];
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('signal', { to: peerId, signal: event.candidate });
        }
    };
}

socket.on('signal', async (data) => {
    if (currentMode !== 'video') return;
    if (!peerConnection) createPeerConnection(data.from);

    if (data.signal.sdp) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.signal));
        if (data.signal.type === 'offer') {
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            socket.emit('signal', { to: data.from, signal: answer });
        }
    } else if (data.signal.candidate) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.signal));
    }
});

// ==========================================
// 4. التحكم في المايك والكاميرا الشات
// ==========================================
function toggleMic() {
    if (!localStream) return;
    isMicOn = !isMicOn;
    localStream.getAudioTracks()[0].enabled = isMicOn;
    const btn = document.getElementById('micBtn');
    if (btn) btn.innerText = isMicOn ? '🎤 المايك' : '🔇 مكتوم';
}

function toggleCam() {
    if (!localStream) return;
    isCamOn = !isCamOn;
    localStream.getVideoTracks()[0].enabled = isCamOn;
    const btn = document.getElementById('camBtn');
    if (btn) btn.innerText = isCamOn ? '📹 الكاميرا' : '📷 معطلة';
}

function sendMsg() {
    if (!msgInput) return;
    const text = msgInput.value.trim();
    if (text && currentPeerId) {
        socket.emit('chat-message', { to: currentPeerId, message: text });
        appendMsg(text, 'msg-me');
        msgInput.value = '';
    }
}

socket.on('chat-message', (data) => {
    appendMsg(data.message, 'msg-peer');
});

function appendMsg(text, className) {
    if (!chatBox) return;
    const msg = document.createElement('div');
    msg.className = 'msg ' + className;
    msg.innerText = text;
    chatBox.appendChild(msg);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function nextUser() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (remoteVideo) remoteVideo.srcObject = null;
    if (chatBox) chatBox.innerHTML = '<div class="msg msg-sys">جاري البحث عن شخص جديد...</div>';
    if (statusText) statusText.innerText = 'جاري البحث...';
    socket.emit('next-user', { mode: currentMode });
}

// ==========================================
// 5. التحديث اللحظي لعدد المتصلين
// ==========================================
socket.on('users-count', (count) => {
    const landingOnline = document.getElementById('landingOnlineCount');
    const headerOnline = document.getElementById('headerOnlineCount');
    if (landingOnline) landingOnline.innerText = count;
    if (headerOnline) headerOnline.innerText = count;
});