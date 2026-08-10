const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// تقديم الملفات الإستاتيكية (HTML, CSS, JS) من المجلد الحالي
app.use(express.static(__dirname));

let waitingQueue = [];

io.on('connection', (socket) => {
    console.log('مستخدم جديد اتصل:', socket.id);

    // عند إرسال طلب البحث عن شخص جديد
    socket.on('next-user', () => {
        addToQueue(socket);
    });

    // إرسال إشارات WebRTC بين الطرفين
    socket.on('signal', (data) => {
        io.to(data.to).emit('signal', { from: socket.id, signal: data.signal });
    });

    // إرسال الرسائل النصية
    socket.on('chat-message', (data) => {
        io.to(data.to).emit('chat-message', { message: data.message });
    });

    // عند قطع الاتصال
    socket.on('disconnect', () => {
        console.log('مستخدم قطع الاتصال:', socket.id);
        waitingQueue = waitingQueue.filter(id => id !== socket.id);
    });

    // إضافة المستخدم لقائمة الانتظار تلقائياً عند أول دخول
    addToQueue(socket);
});

function addToQueue(socket) {
    // التأكد من عدم تكرار المستخدم في الطابور
    waitingQueue = waitingQueue.filter(id => id !== socket.id);

    if (waitingQueue.length > 0) {
        // سحب أول شخص منتظر وتوصيل الاثنين ببعض
        const peerId = waitingQueue.shift();
        socket.emit('match', { peerId: peerId, createOffer: true });
        io.to(peerId).emit('match', { peerId: socket.id, createOffer: false });
    } else {
        // إضافة المستخدم لطابور الانتظار
        waitingQueue.push(socket.id);
    }
}

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`السيرفر شغال بنجاح على: http://localhost:${PORT}`);
});