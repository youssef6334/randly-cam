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

// طابور الانتظار يخزن كائنات تحتوي على (id, interests, mode, country)
let waitingQueue = [];

// نظام حفظ الغرف لمدة 72 ساعة
let savedRooms = new Map();
const ROOM_EXPIRY = 72 * 60 * 60 * 1000; // 72 ساعة بالمللي ثانية

// دالة تنظيف تلقائية تشتغل كل ساعة تمسح الغرف المنتهية للحفاظ على أداء السيرفر
setInterval(() => {
    const now = Date.now();
    for (let [roomId, roomData] of savedRooms.entries()) {
        if (now - roomData.createdAt > ROOM_EXPIRY) {
            savedRooms.delete(roomId);
        }
    }
}, 60 * 60 * 1000); 

io.on('connection', (socket) => {
    // تسجيل المستخدم الجديد
    activeUsers.set(socket.id, { room: null, peer: null });
    io.emit('online-count', activeUsers.size);

    // المطابقة المبنية على الاهتمامات والدولة
    socket.on('find-match', (data) => {
        // إزالة المستخدم من الطابور لو كان موجود بالفعل
        waitingQueue = waitingQueue.filter(u => u.id !== socket.id);

        let matchIndex = -1;
        const myInterests = data.interests || [];
        const myCountry = data.country || 'global'; // الدولة المختارة أو عالمي كافتراضي

        // دالة مساعدة لفحص تطابق الدول (لو حد فيهم اختار عالمي، يطابق أي حد عشان مفيش حد ينتظر كتير)
        const isCountryMatch = (c1, c2) => {
            return c1 === 'global' || c2 === 'global' || c1 === c2;
        };

        // 1. البحث عن تطابق في الاهتمامات، الدولة، ونوع الشات (فيديو/نص)
        if (myInterests.length > 0) {
            matchIndex = waitingQueue.findIndex(u => 
                u.mode === data.mode && 
                isCountryMatch(myCountry, u.country) &&
                u.interests && u.interests.some(interest => myInterests.includes(interest))
            );
        }

        // 2. إذا لم نجد تطابق في الاهتمامات، نبحث عن تطابق في الدولة ونوع الشات فقط
        if (matchIndex === -1) {
            matchIndex = waitingQueue.findIndex(u => 
                u.mode === data.mode &&
                isCountryMatch(myCountry, u.country)
            );
        }

        if (matchIndex !== -1) {
            // سحب المستخدم المتطابق من الطابور
            const peerData = waitingQueue.splice(matchIndex, 1)[0];
            const peerId = peerData.id;

            // إنشاء ID مميز للغرفة لدعم ميزة الحفظ
            const roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            socket.join(roomId);
            const peerSocket = io.sockets.sockets.get(peerId);

            if (peerSocket) {
                peerSocket.join(roomId);
                activeUsers.set(socket.id, { room: roomId, peer: peerId });
                activeUsers.set(peerId, { room: roomId, peer: socket.id });

                // حفظ بيانات الغرفة 
                savedRooms.set(roomId, {
                    createdAt: Date.now(),
                    mode: data.mode
                });

                // إرسال الـ roomId للعميل عشان يقدر ينسخه
                socket.emit('matched', { isInitiator: true, xoRole: 'X', roomId: roomId });
                peerSocket.emit('matched', { isInitiator: false, xoRole: 'O', roomId: roomId });
            } else {
                // لو الطرف التاني فصل فجأة، نرجع المستخدم الحالي للطابور
                waitingQueue.push({ id: socket.id, interests: myInterests, mode: data.mode, country: myCountry });
            }
        } else {
            // لا يوجد أحد، نضع المستخدم في الطابور
            waitingQueue.push({ id: socket.id, interests: myInterests, mode: data.mode, country: myCountry });
        }
    });

    // الانضمام لغرفة محفوظة (72 ساعة)
    socket.on('join-saved-room', (data) => {
        const { roomId, mode } = data;
        
        if (savedRooms.has(roomId)) {
            socket.join(roomId);
            
            const userInfo = activeUsers.get(socket.id);
            if (userInfo) userInfo.room = roomId;

            const clientsInRoom = io.sockets.adapter.rooms.get(roomId);
            
            // لو الغرفة بقى فيها 2، نربطهم ببعض
            if (clientsInRoom && clientsInRoom.size === 2) {
                const clientsArr = Array.from(clientsInRoom);
                const peerId = clientsArr.find(id => id !== socket.id);
                
                if (peerId) {
                    activeUsers.set(socket.id, { room: roomId, peer: peerId });
                    activeUsers.get(peerId).peer = socket.id;

                    socket.emit('matched', { isInitiator: true, xoRole: 'X', roomId: roomId });
                    io.to(peerId).emit('matched', { isInitiator: false, xoRole: 'O', roomId: roomId });
                }
            }
            // لو المستخدم الأول بس هو اللي دخل، هيفضل منتظر لحد ما التاني يفتح الرابط
        } else {
            socket.emit('room-not-found');
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
        console.log(`[REPORT] User ${socket.id} reported their peer. Reason: ${data.reason}`);
    });

    // Disconnect & Leave
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
    // مسح المستخدم من طابور الانتظار 
    waitingQueue = waitingQueue.filter(u => u.id !== socket.id);
    
    const user = activeUsers.get(socket.id);
    if (user) {
        if (user.peer) {
            io.to(user.peer).emit('peer-disconnected');
            const peerUser = activeUsers.get(user.peer);
            if (peerUser) peerUser.peer = null;
            user.peer = null;
        }
        if (user.room) {
            socket.leave(user.room);
            user.room = null;
        }
    }
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});