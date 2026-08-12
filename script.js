const socket = io(window.location.origin, { transports: ["websocket"], secure: true });
let matchState = 'start';
let myGameSymbol = null;
let isMyTurn = false;

const nextBtn = document.getElementById('nextBtn');
const chatBox = document.getElementById('chatBox');
const countrySelect = document.getElementById('countrySelect');

// منطق زر Start / Skip / Really
if (nextBtn) {
    nextBtn.addEventListener('click', () => {
        if (matchState === 'start') {
            matchState = 'skip';
            nextBtn.textContent = 'Skip';
            nextBtn.className = 'btn-start-main btn-skip';
            startMatching();
        } else if (matchState === 'skip') {
            matchState = 'really';
            nextBtn.textContent = 'Really?';
            nextBtn.className = 'btn-start-main btn-really';
        } else if (matchState === 'really') {
            socket.emit('leave-room');
            matchState = 'skip';
            nextBtn.textContent = 'Skip';
            nextBtn.className = 'btn-start-main btn-skip';
            startMatching();
        }
    });
}

function startMatching() {
    if (chatBox) chatBox.innerHTML = '';
    const selectedCountry = countrySelect ? countrySelect.value : '';
    socket.emit('find-match', { country: selectedCountry });
}

socket.on('matched', (data) => {
    if (chatBox && data.peerCountry) {
        chatBox.innerHTML += `<div class="msg msg-sys">تم الاتصال بشخص من: 🌍 ${data.peerCountry}</div>`;
    }
    myGameSymbol = data.isInitiator ? 'X' : 'O';
    isMyTurn = data.isInitiator;
});

function makeMove(index) {
    if (!isMyTurn) return;
    const cells = document.querySelectorAll('.xo-cell');
    if (cells[index].textContent !== '') return;
    cells[index].textContent = myGameSymbol;
    isMyTurn = false;
    socket.emit('game-move', { index, symbol: myGameSymbol });
}

socket.on('game-move', (data) => {
    const cells = document.querySelectorAll('.xo-cell');
    if (cells[data.index]) {
        cells[data.index].textContent = (data.symbol === 'X' ? 'O' : 'X');
    }
    isMyTurn = true;
});

function closeGame() {
    const overlay = document.getElementById('gameBoardOverlay');
    if (overlay) overlay.style.display = 'none';
}

function sendMsg() {
    const msgInput = document.getElementById('msgInput');
    if (!msgInput || !msgInput.value.trim()) return;
    const text = msgInput.value;
    socket.emit('send-message', text);
    if (chatBox) {
        chatBox.innerHTML += `<div class="msg my-msg">${text}</div>`;
    }
    msgInput.value = '';
}

socket.on('receive-message', (text) => {
    if (chatBox) {
        chatBox.innerHTML += `<div class="msg peer-msg">${text}</div>`;
    }
});