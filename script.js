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
let isSharingScreen = false;
let currentMode = 'video';

// AI Moderation Variables
let nsfwModel = null;
let aiCheckInterval = null;

// Mini-Game (XO) Variables
let mySymbol = null;
let currentTurn = null;
let gameBoard = Array(9).fill(null);

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// Load AI Model for NSFW Detection (باستخدام رابط موديل مباشر ومستقر)
async function loadAIModel() {
    try {
        console.log('جاري تحميل نموذج الذكاء الاصطناعي لفحص المحتوى...');
        const modelUrl = 'https://unpkg.com/nsfwjs@2.4.1/models/quantized/';
        nsfwModel = await nsfwjs.load(modelUrl);
        console.log('تم تحميل نموذج الذكاء الاصطناعي بنجاح!');
    } catch (err) {
        console.error('خطأ في تحميل نموذج الذكاء الاصطناعي:', err);
    }
}
loadAIModel();

// Theme Management
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
    btns.forEach(btn => btn.innerText = theme === 'light' ? '☀️' : '🌙');
}

const savedTheme = localStorage.getItem('randly-theme');
if (savedTheme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    updateThemeToggleIcons('light');
}

// Session Controls
async function startSession(mode) {
    currentMode = mode;
    const landing = document.getElementById('landingPage');
    const videoSec = document.getElementById('videoSection');
    const chatSec = document.getElementById('chatSection');
    const textControls = document.getElementById('textOnlyControls');
    const interests = document.getElementById('interestsInput').value.trim();

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
        await initCamera();
    }

    socket.emit('start-session', { mode, interests });
}

function leaveSession() {
    if (aiCheckInterval) clearInterval(aiCheckInterval);
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    currentPeerId = null;
    closeGame();

    const landing = document.getElementById('landingPage');
    if (landing) landing.style.display = 'flex';
    if (chatBox) chatBox.innerHTML = '<div class="msg msg-sys">مرحباً بك! انقر على "التالي" لبدء الشات.</div>';
    if (statusText) statusText.innerText = 'متوقف...';

    socket.emit('leave-session');
}

// Camera & AI Scanning
async function initCamera() {
    try {
        if (!localStream) {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            if (localVideo) localVideo.srcObject = localStream;
        }
        if (statusText) statusText.innerText = 'جاهز للبحث...';

        startAICameraScan();
    } catch (err) {
        console.error('Camera Error:', err);
        if (statusText) statusText.innerText = 'يرجى السماح باستخدام الكاميرا!';
    }
}

function startAICameraScan() {
    if (aiCheckInterval) clearInterval(aiCheckInterval);

    aiCheckInterval = setInterval(async () => {
        if (nsfwModel && localVideo && localStream && isCamOn) {
            try {
                const predictions = await nsfwModel.classify(localVideo);
                
                // نسبة الثقة محددة بـ 0.90 (90%)
                const unsafe = predictions.find(p => 
                    (p.className === 'Porn' || p.className === 'Hentai' || p.className === 'Sexy') && p.probability > 0.90
                );

                if (unsafe) {
                    console.warn('تم اكتشاف محتوى غير لائق:', unsafe);
                    alert('تم حظرك تلقائياً بواسطة الذكاء الاصطناعي بسبب عرض محتوى غير لائق!');
                    socket.emit('ai-auto-ban');
                    leaveSession();
                }
            } catch (e) {
                // Ignore transient frame grab errors
            }
        }
    }, 3000);
}

// WebRTC Signaling
socket.on('match', async (data) => {
    if (statusText) statusText.innerText = 'متصل الآن!';
    currentPeerId = data.peerId;
    closeGame();

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

// Screen Sharing
async function toggleScreenShare() {
    if (currentMode !== 'video' || !peerConnection) return;

    try {
        if (!isSharingScreen) {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const screenTrack = screenStream.getVideoTracks()[0];
            
            const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
            if (sender) sender.replaceTrack(screenTrack);

            if (localVideo) localVideo.srcObject = screenStream;
            isSharingScreen = true;

            screenTrack.onended = () => stopScreenShare();
            document.getElementById('screenBtn').innerText = '🛑 إيقاف المشاركة';
        } else {
            stopScreenShare();
        }
    } catch (err) {
        console.error('Screen sharing error:', err);
    }
}

function stopScreenShare() {
    if (!isSharingScreen) return;
    const videoTrack = localStream.getVideoTracks()[0];
    const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
    if (sender) sender.replaceTrack(videoTrack);

    if (localVideo) localVideo.srcObject = localStream;
    isSharingScreen = false;
    document.getElementById('screenBtn').innerText = '🖥️ الشاشة';
}

// Media Controls
function toggleMic() {
    if (!localStream) return;
    isMicOn = !isMicOn;
    localStream.getAudioTracks()[0].enabled = isMicOn;
    document.getElementById('micBtn').innerText = isMicOn ? '🎤 المايك' : '🔇 مكتوم';
}

function toggleCam() {
    if (!localStream) return;
    isCamOn = !isCamOn;
    localStream.getVideoTracks()[0].enabled = isCamOn;
    document.getElementById('camBtn').innerText = isCamOn ? '📹 الكاميرا' : '📷 معطلة';
}

// Messaging
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
    closeGame();
    if (chatBox) chatBox.innerHTML = '<div class="msg msg-sys">جاري البحث عن شخص جديد...</div>';
    if (statusText) statusText.innerText = 'جاري البحث...';
    socket.emit('next-user', { mode: currentMode });
}

// Report & Ban
function reportUser() {
    if (!currentPeerId) {
        alert('لا يوجد شخص متصل للإبلاغ عنه حالياً!');
        return;
    }

    if (confirm('هل أنت تأكد من الإبلاغ عن هذا الشخص بسبب إساءة؟ سيتم حظره لمدة 24 ساعة.')) {
        socket.emit('report-user', { targetId: currentPeerId });
        alert('تم إرسال البلاغ وسيتم معالجته فوراً.');
        nextUser();
    }
}

socket.on('banned', (data) => {
    alert(data.reason);
    window.location.reload();
});

// Mini-Game (XO) Logic
function requestGame() {
    if (!currentPeerId) return alert('يجب أن تكون متصلاً بشخص أولاً!');
    socket.emit('game-request', { to: currentPeerId });
    appendMsg('أرسلت طلب لعب XO...', 'msg-sys');
}

socket.on('game-request', (data) => {
    if (confirm('الطرف الثاني يدعوك للعب XO، هل تقبل؟')) {
        socket.emit('game-accept', { to: data.from });
        initGame('O', false);
    }
});

socket.on('game-start', (data) => {
    initGame('X', true);
});

function initGame(symbol, isMyTurn) {
    mySymbol = symbol;
    currentTurn = isMyTurn;
    gameBoard = Array(9).fill(null);

    const overlay = document.getElementById('gameBoardOverlay');
    if (overlay) overlay.style.display = 'block';

    const cells = document.querySelectorAll('.xo-cell');
    cells.forEach(cell => cell.innerText = '');

    updateGameStatus();
}

function updateGameStatus() {
    const status = document.getElementById('gameStatusText');
    if (status) {
        status.innerText = currentTurn ? `دورك أنت (${mySymbol})` : `دور الطرف الثاني...`;
    }
}

function makeMove(index) {
    if (!currentTurn || gameBoard[index] || !currentPeerId) return;

    gameBoard[index] = mySymbol;
    const cells = document.querySelectorAll('.xo-cell');
    cells[index].innerText = mySymbol;

    currentTurn = false;
    updateGameStatus();

    socket.emit('game-move', { to: currentPeerId, index, symbol: mySymbol });
    checkGameWinner();
}

socket.on('game-move', (data) => {
    gameBoard[data.index] = data.symbol;
    const cells = document.querySelectorAll('.xo-cell');
    cells[data.index].innerText = data.symbol;

    currentTurn = true;
    updateGameStatus();
    checkGameWinner();
});

function checkGameWinner() {
    const wins = [
        [0,1,2], [3,4,5], [6,7,8],
        [0,3,6], [1,4,7], [2,5,8],
        [0,4,8], [2,4,6]
    ];

    for (let win of wins) {
        const [a,b,c] = win;
        if (gameBoard[a] && gameBoard[a] === gameBoard[b] && gameBoard[a] === gameBoard[c]) {
            alert(gameBoard[a] === mySymbol ? '🎉 مبروك! فزت باللعبة!' : '😔 للأسف، خسرت اللعبة!');
            return;
        }
    }

    if (!gameBoard.includes(null)) {
        alert('تعادل! 🤝');
    }
}

function closeGame() {
    const overlay = document.getElementById('gameBoardOverlay');
    if (overlay) overlay.style.display = 'none';
}

socket.on('users-count', (count) => {
    const landingOnline = document.getElementById('landingOnlineCount');
    const headerOnline = document.getElementById('headerOnlineCount');
    if (landingOnline) landingOnline.innerText = count;
    if (headerOnline) headerOnline.innerText = count;
});