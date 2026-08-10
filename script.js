const socket = io();

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const statusText = document.getElementById('status');
const chatBox = document.getElementById('chatBox');
const msgInput = document.getElementById('msgInput');

let localStream;
let peerConnection;
let currentPeerId = null;
let isMicOn = true;
let isCamOn = true;

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// تشغيل الكاميرا والمايك
async function initCamera() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        if (statusText) statusText.innerText = 'جاهز للبحث';
    } catch (err) {
        console.error('Camera Error:', err);
        if (statusText) statusText.innerText = 'يرجى السماح باستخدام الكاميرا!';
    }
}
initCamera();

socket.on('match', async (data) => {
    if (statusText) statusText.innerText = 'متصل الآن!';
    currentPeerId = data.peerId;
    createPeerConnection(data.peerId);

    if (data.createOffer) {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('signal', { to: data.peerId, signal: offer });
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
        remoteVideo.srcObject = event.streams[0];
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('signal', { to: peerId, signal: event.candidate });
        }
    };
}

socket.on('signal', async (data) => {
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
    remoteVideo.srcObject = null;
    chatBox.innerHTML = '<div class="msg msg-sys">جاري البحث عن شخص جديد...</div>';
    if (statusText) statusText.innerText = 'جاري البحث...';
    socket.emit('next-user');
}