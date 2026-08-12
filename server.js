const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

let queues = {
    video: [],
    text: []
};

const usersData = new Map();
// قائمة المحظورين { "IP_ADDRESS": expiration_timestamp }
const bannedIPs = new Map();

// Middleware للتحقق من الـ IP المحظور عند الدخول
io.use((socket, next) => {
    const clientIP = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
    const banUntil = bannedIPs.get(clientIP);

    if (banUntil) {
        if (Date.now() < banUntil) {
            const hoursLeft = Math.ceil((banUntil - Date.now()) / (1000 * 60 * 60));
            return next(new Error(`أنت محظور من استخدام الخدمة لمدة ${hoursLeft} ساعة بسبب البلاغات.`));
        } else {
            bannedIPs.delete(clientIP); // انقضاء مدة الحظر
        }
    }
    next();
});

io.on('connection', (socket) => {
    console.log('مستخدم جديد اتصل:', socket.id);
    broadcastUserCount();

    socket.on('start-session', (data) => {
        const mode = data.mode || 'video';
        const interests = parseInterests(data.interests);
        usersData.set(socket.id, { mode, interests });
        findMatch(socket, mode);
    });

    socket.on('next-user', (data) => {
        const mode = data?.mode || usersData.get(socket.id)?.mode || 'video';
        findMatch(socket, mode);
    });

    socket.on('leave-session', () => {
        removeFromQueues(socket.id);
        usersData.delete(socket.id);
    });

    socket.on('signal', (data) => {
        io.to(data.to).emit('signal', { from: socket.id, signal: data.signal });
    });

    socket.on('chat-message', (data) => {
        io.to(data.to).emit('chat-message', { message: data.message });
    });

    // معالجة البلاغات والحظر الزمني
    socket.on('report-user', (data) => {
        const targetSocket = io.sockets.sockets.get(data.targetId);
        if (targetSocket) {
            const targetIP = targetSocket.handshake.headers['x-forwarded-for'] || targetSocket.handshake.address;
            const banDuration = 24 * 60 * 60 * 1000; // 24 ساعة
            bannedIPs.set(targetIP, Date.now() + banDuration);

            targetSocket.emit('banned', { reason: 'تم حظرك لمدة 24 ساعة بسبب تلقي بلاغ عن إساءة.' });
            targetSocket.disconnect(true);
        }
    });

    // أحداث لعبة XO
    socket.on('game-request', (data) => {
        io.to(data.to).emit('game-request', { from: socket.id });
    });

    socket.on('game-accept', (data) => {
        io.to(data.to).emit('game-start', { from: socket.id });
    });

    socket.on('game-move', (data) => {
        io.to(data.to).emit('game-move', data);
    });

    socket.on('disconnect', () => {
        removeFromQueues(socket.id);
        usersData.delete(socket.id);
        broadcastUserCount();
    });
});

function findMatch(socket, mode) {
    removeFromQueues(socket.id);
    const currentUser = usersData.get(socket.id) || { mode, interests: [] };
    const queue = queues[mode] || queues.video;

    if (queue.length > 0) {
        let matchedIndex = -1;
        if (currentUser.interests.length > 0) {
            matchedIndex = queue.findIndex(peerId => {
                const peerData = usersData.get(peerId);
                return peerData && peerData.interests.some(i => currentUser.interests.includes(i));
            });
        }

        if (matchedIndex === -1) matchedIndex = 0;
        const peerId = queue.splice(matchedIndex, 1)[0];

        socket.emit('match', { peerId: peerId, createOffer: true });
        io.to(peerId).emit('match', { peerId: socket.id, createOffer: false });
    } else {
        queue.push(socket.id);
    }
}

function removeFromQueues(socketId) {
    queues.video = queues.video.filter(id => id !== socketId);
    queues.text = queues.text.filter(id => id !== socketId);
}

function parseInterests(rawText) {
    if (!rawText || typeof rawText !== 'string') return [];
    return rawText.split(',').map(i => i.trim().toLowerCase()).filter(i => i.length > 0);
}

function broadcastUserCount() {
    io.emit('users-count', io.engine.clientsCount);
}

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`السيرفر شغال بنجاح على البورت: ${PORT}`);
});