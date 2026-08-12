const express = require('express');
const app = express();
const http = require('http').createServer(app);
const { Server } = require('socket.io');

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
    // تسجيل جديد وتحديث العداد فوراً
    activeUsers.set(socket.id, { room: null, peer: null });
    io.emit('online-count', activeUsers.size);

    // طلب مطابقة
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

                socket.emit('matched', { isInitiator: true });
                peerSocket.emit('matched', { isInitiator: false });
            } else {
                waitingQueue.push(socket.id);
            }
        } else {
            waitingQueue.push(socket.id);
        }
    });

    // WebRTC Signals
    socket.on('signal', (data) => {
        const user = activeUsers.get(socket.id);
        if (user && user.peer) {
            io.to(user.peer).emit('signal', data);
        }
    });

    // Chat
    socket.on('send-message', (data) => {
        const user = activeUsers.get(socket.id);
        if (user && user.peer) {
            io.to(user.peer).emit('receive-message', data);
        }
    });

    // XO Game
    socket.on('game-request', () => {
        const user = activeUsers.get(socket.id);
        if (user && user.peer) {
            socket.emit('game-start', { symbol: 'X', isMyTurn: true });
            io.to(user.peer).emit('game-start', { symbol: 'O', isMyTurn: false });
        }
    });

    socket.on('game-move', (data) => {
        const user = activeUsers.get(socket.id);
        if (user && user.peer) {
            io.to(user.peer).emit('game-move', data);
        }
    });

    // Disconnection handlers
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

// التوافق مع Railway و Render (0.0.0.0 binding)
const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});