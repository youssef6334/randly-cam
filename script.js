// الاتصال التلقائي بنفس عنوان الموقع الحالي لتجنب مشاكل النطاق
const socket = io(window.location.origin, {
    transports: ["websocket"],
    secure: true
});

// WebRTC Configuration
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
let myGameSymbol = null;
let isMyTurn = false;
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

// --- 1. Cleanup & Reset Functions ---

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

// --- 2. Session Management & Umingle Button Logic ---

async function startSession(mode) {
    currentMode = mode;
    landingPage.style.display = 'none';

    if (mode === 'video') {
        videoSection.style.display = 'flex';
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            if (localVideo) localVideo.srcObject = localStream;
        } catch (err) {
            console.error('Camera access error:', err);
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
    
    // محاكاة جلب الدولة للطرف الآخر
    const countries = [
        { name: 'Egypt', code: 'EG', flag: '🇪🇬' },
        { name: 'United States', code: 'US', flag: '🇺🇸' },
        { name: 'Saudi Arabia', code: 'SA', flag: '🇸🇦' },
        { name: 'Germany', code: 'DE', flag: '🇩🇪' },
        { name: 'France', code: 'FR', flag: '🇫🇷' }
    ];
    const randomCountry = countries[Math.floor(Math.random() * countries.length)];

    appendSystemMessage(`✨ You're now chatting with someone new\n${randomCountry.flag} ${randomCountry.name}`);
    statusDiv.textContent = 'متصل الآن!';

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

// --- 3. WebRTC Setup ---

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

// --- 4. Socket Events ---

socket.on('online-count', (count) => {
    const landingCount = document.getElementById('landingOnlineCount');
    const headerCount = document.getElementById('headerOnlineCount');
    if (landingCount) landingCount.textContent = count;
    if (headerCount) headerCount.textContent = count;
});

socket.on('matched', async (data) => {
    statusDiv.textContent = 'متصل الآن!';

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
    appendMessage(data.text, 'other');
});

// --- 5. Chat & Game Logic ---

function sendMsg() {
    const text = msgInput.value.trim();
    if (!text) return;
    appendMessage(text, 'me');
    socket.emit('send-message', { text: text });
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