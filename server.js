const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*", // السماح بالاتصال من أي جهاز أو متصفح
        methods: ["GET", "POST"]
    }
});

app.use(express.static(__dirname));

let activeUsers = new Map(); // لتخزين جميع المتصلين بالمنصة
let waitingQueue = [];      // قائمة انتظار المطابقة

io.on('connection', (socket) => {
    // 1. تسجيل المستخدم الجديد وتحديث عداد المتصلين للجميع فوراً
    activeUsers.set(socket.id, { room: null, peer: null });
    io.emit('online-count', activeUsers.size);

    // 2. طلب البحث عن شات ومطابقة
    socket.on('find-match', (data) => {
        // تنظيف المستخدم من قائمة الانتظار إن كان مضافاً سابقاً
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

    // 3. تمرير إشارات WebRTC بين الطرفين
    socket.on('signal', (data) => {
        const user = activeUsers.get(socket.id);
        if (user && user.peer) {
            io.to(user.peer).emit('signal', data);
        }
    });

    // 4. إرسال وتلقي رسائل الشات
    socket.on('send-message', (data) => {
        const user = activeUsers.get(socket.id);
        if (user && user.peer) {
            io.to(user.peer).emit('receive-message', data);
        }
    });

    // 5. لعبة XO
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

    // 6. عند مغادرة الجلسة
    socket.on('leave-room', () => {
        handleUserDisconnect(socket);
    });

    // 7. عند إغلاق الصفحة أو انقطاع الاتصال
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
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});