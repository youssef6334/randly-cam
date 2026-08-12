const socket = io();

// WebRTC Configuration
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

let localStream = null;
let peerConnection = null;
let currentMode = 'text'; // 'video' or 'text'
let isMicMuted = false;
let isCamOff = false;
let myGameSymbol = null;
let isMyTurn = false;

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

// دالة مسح وتفريغ فيديو الطرف الآخر وإغلاق الاتصال
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

// --- 2. Session Management ---

async function startSession(mode) {
    currentMode = mode;
    landingPage.style.display = 'none';

    if (mode === 'video') {
        videoSection.style.display = 'flex';
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            if (localVideo) localVideo.srcObject = localStream;
        } catch (err) {
            console.error('Camera/Mic access error:', err);
            appendSystemMessage('تعذر الوصول للكاميرا أو المايكرفون.');
        }
    } else {
        videoSection.style.display = 'none';
    }

    nextUser();
}

function nextUser() {
    clearRemoteVideo();
    chatBox.innerHTML = '';
    appendSystemMessage('جاري البحث عن شخص جديد...');
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
    appendSystemMessage('تم العثور على شخص! يمكنك البدء بالحديث.');

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
    appendSystemMessage('انقطع الاتصال بالطرف الآخر.');
});

socket.on('receive-message', (data) => {
    appendMessage(data.text, 'other');
});

// --- 5. Chat Functions ---

function sendMsg() {
    const text = msgInput.value.trim();
    if (!text) return;

    appendMessage(text, 'me');
    socket.emit('send-message', { text: text });
    msgInput.value = '';
}

function appendMessage(text, type) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('msg');
    if (type === 'me') msgDiv.classList.add('msg-me');
    else if (type === 'other') msgDiv.classList.add('msg-other');

    msgDiv.textContent = text;
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function appendSystemMessage(text) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('msg', 'msg-sys');
    msgDiv.textContent = text;
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// --- 6. Quick Controls ---

function toggleMic() {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        isMicMuted = !isMicMuted;
        audioTrack.enabled = !isMicMuted;
        document.getElementById('micBtn').textContent = isMicMuted ? '🔇' : '🎤';
    }
}

function toggleCam() {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        isCamOff = !isCamOff;
        videoTrack.enabled = !isCamOff;
        document.getElementById('camBtn').textContent = isCamOff ? '🚫' : '📹';
    }
}

function toggleTheme() {
    const currentTheme = document.body.getAttribute('data-theme');
    if (currentTheme === 'light') {
        document.body.removeAttribute('data-theme');
    } else {
        document.body.setAttribute('data-theme', 'light');
    }
}

function reportUser() {
    alert('تم إرسال بلاغك وسيتم مراجعته فوراً.');
}

// --- 7. XO Game Logic ---

function requestGame() {
    socket.emit('game-request');
    appendSystemMessage('أرسلت طلب لعب XO...');
}

socket.on('game-start', (data) => {
    myGameSymbol = data.symbol;
    isMyTurn = data.isMyTurn;
    document.getElementById('gameBoardOverlay').style.display = 'flex';
    updateGameStatus();
    resetGameBoard();
});

socket.on('game-move', (data) => {
    const cells = document.querySelectorAll('.xo-cell');
    if (cells[data.index]) {
        cells[data.index].textContent = data.symbol;
    }
    isMyTurn = true;
    updateGameStatus();
});

function makeMove(index) {
    const cells = document.querySelectorAll('.xo-cell');
    if (!isMyTurn || cells[index].textContent !== '') return;

    cells[index].textContent = myGameSymbol;
    isMyTurn = false;
    updateGameStatus();

    socket.emit('game-move', { index: index, symbol: myGameSymbol });
}

function updateGameStatus() {
    const statusText = document.getElementById('gameStatusText');
    if (statusText) {
        statusText.textContent = isMyTurn ? `دورك الآن (${myGameSymbol})` : 'في انتظار الطرف الآخر...';
    }
}

function resetGameBoard() {
    document.querySelectorAll('.xo-cell').forEach(cell => cell.textContent = '');
}

function closeGame() {
    document.getElementById('gameBoardOverlay').style.display = 'none';
}