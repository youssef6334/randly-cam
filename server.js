const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// تقديم الملفات الإستاتيكية (HTML, CSS, JS) من المجلد الحالي
app.use(express.static(__dirname));

// طوابير الانتظار مقسمة حسب النمط (video / text)
let queues = {
    video: [],
    text: []
};

// خريطة لتخزين بيانات كل مستخدم (النمط والاهتمامات)
const usersData = new Map();

io.on('connection', (socket) => {
    console.log('مستخدم جديد اتصل:', socket.id);
    broadcastUserCount();

    // عند اختيار النمط وبدء الجلسة من الشاشة الرئيسية
    socket.on('start-session', (data) => {
        const mode = data.mode || 'video';
        const interests = parseInterests(data.interests);

        usersData.set(socket.id, { mode, interests });
        findMatch(socket, mode);
    });

    // عند طلب شخص جديد (زر التالي)
    socket.on('next-user', (data) => {
        const mode = data?.mode || usersData.get(socket.id)?.mode || 'video';
        findMatch(socket, mode);
    });

    // عند مغادرة الجلسة والعودة للرئيسية
    socket.on('leave-session', () => {
        removeFromQueues(socket.id);
        usersData.delete(socket.id);
    });

    // إرسال إشارات WebRTC
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
        removeFromQueues(socket.id);
        usersData.delete(socket.id);
        broadcastUserCount();
    });
});

// دالة المطابقة الذكية
function findMatch(socket, mode) {
    removeFromQueues(socket.id);

    const currentUser = usersData.get(socket.id) || { mode, interests: [] };
    const queue = queues[mode] || queues.video;

    if (queue.length > 0) {
        let matchedIndex = -1;

        // 1. محاولة البحث عن شريك يشارك اهتماماً واحداً على الأقل
        if (currentUser.interests.length > 0) {
            matchedIndex = queue.findIndex(peerId => {
                const peerData = usersData.get(peerId);
                if (!peerData) return false;
                return peerData.interests.some(interest => currentUser.interests.includes(interest));
            });
        }

        // 2. إذا لم يجد اهتماماً مشتركاً، خذ أول شخص في الطابور
        if (matchedIndex === -1) {
            matchedIndex = 0;
        }

        const peerId = queue.splice(matchedIndex, 1)[0];

        socket.emit('match', { peerId: peerId, createOffer: true });
        io.to(peerId).emit('match', { peerId: socket.id, createOffer: false });
    } else {
        // إضافة المستخدم لطابور الانتظار للنمط المحدد
        queue.push(socket.id);
    }
}

// إزالة المستخدم من جميع الطوابير
function removeFromQueues(socketId) {
    queues.video = queues.video.filter(id => id !== socketId);
    queues.text = queues.text.filter(id => id !== socketId);
}

// تحويل نص الاهتمامات إلى مصفوفة كلمات
function parseInterests(rawText) {
    if (!rawText || typeof rawText !== 'string') return [];
    return rawText
        .split(',')
        .map(i => i.trim().toLowerCase())
        .filter(i => i.length > 0);
}

// بث عدد المستخدمين المتصلين حالياً للجميع
function broadcastUserCount() {
    io.emit('users-count', io.engine.clientsCount);
}

// تحديد البورت والربط مع 0.0.0.0 لدعم شبكة Railway
const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`السيرفر شغال بنجاح على البورت: ${PORT}`);
});