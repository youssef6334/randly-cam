const socket = io(window.location.origin, {
    transports: ["websocket"],
    secure: true
});

let currentMode = 'text';
let matchState = 'start'; // 'start' | 'skip' | 'really'
let peerConnection = null;
let localStream = null;

const actionBtn = document.getElementById('actionBtn');
const stopBtn = document.getElementById('stopBtn');
const msgInput = document.getElementById('msgInput');
const sendBtn = document.getElementById('sendBtn');
const chatBox = document.getElementById('chatBox');
const darkModeToggle = document.getElementById('darkModeToggle');

// Dark Mode Toggle
darkModeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    document.body.classList.toggle('light-mode');
    darkModeToggle.textContent = document.body.classList.contains('dark-mode') ? '☀️' : '🌙';
});

// زر التحكم الموحد (Start / Skip / Really)
actionBtn.addEventListener('click', () => {
    if (matchState === 'start') {
        startSearching();
    } else if (matchState === 'skip') {
        // التحويل لوضع Really للتأكيد عند الضغط الأول
        matchState = 'really';
        actionBtn.textContent = 'Really?';
        actionBtn.style.backgroundColor = '#f39c12';
    } else if (matchState === 'really') {
        // تنفيذ التخطي الفعلي والبحث عن شخص جديد
        executeSkip();
    }
});

stopBtn.addEventListener('click', () => {
    resetToStartState();
    socket.emit('leave-room');
});

function startSearching() {
    matchState = 'skip';
    actionBtn.textContent = 'Skip';
    actionBtn.style.backgroundColor = '#e74c3c';
    chatBox.innerHTML = '';
    appendSystemMessage('جاري البحث عن شخص جديد...');
    socket.emit('find-match', { mode: currentMode });
}

function executeSkip() {
    socket.emit('leave-room');
    startSearching();
}

function resetToStartState() {
    matchState = 'start';
    actionBtn.textContent = 'Start';
    actionBtn.style.backgroundColor = '#6c5ce7';
}

// Socket Events & Geo IP Display
socket.on('online-count', (count) => {
    document.getElementById('headerOnlineCount').textContent = count;
});

socket.on('matched', (data) => {
    matchState = 'skip';
    actionBtn.textContent = 'Skip';
    actionBtn.style.backgroundColor = '#e74c3c';
    
    // إظهار الدولة الحقيقية للطرف الآخر الجانبية بناءً على الـ IP
    appendSystemMessage(`✨ You're now chatting with someone new\n 🌍 ${data.peerCountry} (${data.peerCode.toUpperCase()})`);
});

socket.on('peer-disconnected', () => {
    appendSystemMessage('الطرف الآخر غادر المحادثة.');
    matchState = 'skip';
    actionBtn.textContent = 'Skip';
});

// Chat Messaging
sendBtn.addEventListener('click', sendMsg);
msgInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMsg();
});

function sendMsg() {
    const text = msgInput.value.trim();
    if (!text) return;
    appendMessage(text, 'me');
    socket.emit('send-message', { text });
    msgInput.value = '';
}

function appendMessage(text, type) {
    const div = document.createElement('div');
    div.classList.add('msg', type === 'me' ? 'msg-me' : 'msg-other');
    div.textContent = text;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function appendSystemMessage(text) {
    const div = document.createElement('div');
    div.classList.add('msg', 'msg-sys');
    div.innerText = text;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}