const express = require('express');
const app = express();
const http = require('http').createServer(app);
const { Server } = require('socket.io');

// إعداد Socket.io مع السماح بالاتصال من أي مصدر
const io = new Server(http, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.static(__dirname));

let activeUsers = new Map();
let waitingQueue = [];

io.on('connection', (socket) => {
    // تسجيل المستخدم الجديد
    activeUsers.set(socket.id, { room: null, peer: null });
    io.emit('online-count', activeUsers.size);

    // المطابقة
    socket.on('find-match', (data) => {
        waitingQueue = waitingQueue.filter(id => id !== socket.id);

        if (waitingQueue.length > 0) {
            const peerId = waitingQueue.shift();
            const roomId = `room_${socket.id}_${peerId}`;

            socket.join(roomId);
            const peerSocket = io.sockets.sockets.get(peerId);

            if (peerSocket) {
                peerSocket.join(roomId);
                activeUsers.set(socket.id, { room: roomId, peer: peerId });
                activeUsers.set(peerId, { room: roomId, peer: socket.id });

                // توزيع أدوار الـ XO أثناء المطابقة (X و O)
                socket.emit('matched', { isInitiator: true, xoRole: 'X' });
                peerSocket.emit('matched', { isInitiator: false, xoRole: 'O' });
            } else {
                waitingQueue.push(socket.id);
            }
        } else {
            waitingQueue.push(socket.id);
        }
    });

    // WebRTC & Chat
    socket.on('signal', (data) => {
        const user = activeUsers.get(socket.id);
        if (user && user.peer) {
            io.to(user.peer).emit('signal', data);
        }
    });

    socket.on('send-message', (data) => {
        const user = activeUsers.get(socket.id);
        if (user && user.peer) {
            io.to(user.peer).emit('receive-message', data);
        }
    });

    // مؤشر الكتابة (Typing Indicator)
    socket.on('typing', () => {
        const user = activeUsers.get(socket.id);
        if (user && user.peer) io.to(user.peer).emit('display-typing');
    });

    socket.on('stop-typing', () => {
        const user = activeUsers.get(socket.id);
        if (user && user.peer) io.to(user.peer).emit('hide-typing');
    });

    // لعبة XO
    socket.on('xo-move', (data) => {
        const user = activeUsers.get(socket.id);
        if (user && user.peer) io.to(user.peer).emit('xo-receive-move', data);
    });

    // نظام الإبلاغ
    socket.on('submit-report', (data) => {
        // سيتم تسجيل البلاغ هنا في السيرفر بدل إزعاج المستخدم بـ alert
        console.log(`[REPORT] User ${socket.id} reported their peer. Reason: ${data.reason}`);
    });

    // Disconnect
    socket.on('leave-room', () => {
        handleUserDisconnect(socket);
    });

    socket.on('disconnect', () => {
        handleUserDisconnect(socket);
        activeUsers.delete(socket.id);
        io.emit('online-count', activeUsers.size);
    });
});

function handleUserDisconnect(socket) {
    waitingQueue = waitingQueue.filter(id => id !== socket.id);
    const user = activeUsers.get(socket.id);
    if (user && user.peer) {
        io.to(user.peer).emit('peer-disconnected');
        const peerUser = activeUsers.get(user.peer);
        if (peerUser) peerUser.peer = null;
        user.peer = null;
    }
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});