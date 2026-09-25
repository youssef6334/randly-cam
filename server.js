const express = require('express');
const app = express();
const http = require('http').createServer(app);
const { Server } = require('socket.io');
const geoip = require('geoip-lite'); 

// إعداد Socket.io مع السماح بالاتصال من أي مصدر
const io = new Server(http, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// تفعيل قراءة الملفات الثابتة (مثل index.html, rules.html, privacy.html, terms.html وغيرها)
app.use(express.static(__dirname));

let activeUsers = new Map();

// طابور الانتظار يخزن كائنات تحتوي على (id, interests, mode, searchCountry, actualCountry)
let waitingQueue = [];

// نظام حفظ الغرف لمدة 72 ساعة
let savedRooms = new Map();
const ROOM_EXPIRY = 72 * 60 * 60 * 1000; 

setInterval(() => {
    const now = Date.now();
    for (let [roomId, roomData] of savedRooms.entries()) {
        if (now - roomData.createdAt > ROOM_EXPIRY) {
            savedRooms.delete(roomId);
        }
    }
}, 60 * 60 * 1000); 

io.on('connection', (socket) => {
    // --- قراءة الـ IP الحقيقي وتخطي حماية الاستضافات ---
    let clientIp = socket.handshake.headers['x-forwarded-for'] || 
                   socket.handshake.headers['cf-connecting-ip'] || 
                   socket.handshake.headers['x-real-ip'] || 
                   socket.handshake.address;
                   
    if (clientIp) {
        clientIp = clientIp.split(',')[0].trim();
        if (clientIp.startsWith('::ffff:')) {
            clientIp = clientIp.substring(7);
        }
    }
    
    // لو بنعمل تست على نفس الجهاز (Localhost)
    if (!clientIp || clientIp === '127.0.0.1' || clientIp === '::1') {
        clientIp = '197.35.0.0'; // IP مصري للتجربة
    }

    const geo = geoip.lookup(clientIp);
    const actualCountry = geo ? geo.country : 'global';

    // تسجيل المستخدم الجديد
    activeUsers.set(socket.id, { room: null, peer: null, actualCountry: actualCountry });
    io.emit('online-count', activeUsers.size);

    // المطابقة المبنية على الاهتمامات والدولة
    socket.on('find-match', (data) => {
        waitingQueue = waitingQueue.filter(u => u.id !== socket.id);

        let matchIndex = -1;
        const myInterests = data.interests || [];
        const searchCountry = data.country || 'global'; 
        const myActualCountry = activeUsers.get(socket.id).actualCountry; 

        const isCountryMatch = (c1, c2) => {
            return c1 === 'global' || c2 === 'global' || c1 === c2;
        };

        if (myInterests.length > 0) {
            matchIndex = waitingQueue.findIndex(u => 
                u.mode === data.mode && 
                isCountryMatch(searchCountry, u.searchCountry) &&
                u.interests && u.interests.some(interest => myInterests.includes(interest))
            );
        }

        if (matchIndex === -1) {
            matchIndex = waitingQueue.findIndex(u => 
                u.mode === data.mode &&
                isCountryMatch(searchCountry, u.searchCountry)
            );
        }

        if (matchIndex !== -1) {
            const peerData = waitingQueue.splice(matchIndex, 1)[0];
            const peerId = peerData.id;
            const roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            socket.join(roomId);
            const peerSocket = io.sockets.sockets.get(peerId);

            if (peerSocket) {
                peerSocket.join(roomId);
                activeUsers.get(socket.id).room = roomId;
                activeUsers.get(socket.id).peer = peerId;
                activeUsers.get(peerId).room = roomId;
                activeUsers.get(peerId).peer = socket.id;

                savedRooms.set(roomId, {
                    createdAt: Date.now(),
                    mode: data.mode
                });

                socket.emit('matched', { 
                    isInitiator: true, 
                    xoRole: 'X', 
                    roomId: roomId,
                    partnerCountry: peerData.actualCountry 
                });
                
                peerSocket.emit('matched', { 
                    isInitiator: false, 
                    xoRole: 'O', 
                    roomId: roomId,
                    partnerCountry: myActualCountry 
                });
            } else {
                waitingQueue.push({ id: socket.id, interests: myInterests, mode: data.mode, searchCountry: searchCountry, actualCountry: myActualCountry });
            }
        } else {
            waitingQueue.push({ id: socket.id, interests: myInterests, mode: data.mode, searchCountry: searchCountry, actualCountry: myActualCountry });
        }
    });

    // الانضمام لغرفة محفوظة
    socket.on('join-saved-room', (data) => {
        const { roomId, mode } = data;
        
        if (savedRooms.has(roomId)) {
            socket.join(roomId);
            const userInfo = activeUsers.get(socket.id);
            if (userInfo) userInfo.room = roomId;

            const clientsInRoom = io.sockets.adapter.rooms.get(roomId);
            if (clientsInRoom && clientsInRoom.size === 2) {
                const clientsArr = Array.from(clientsInRoom);
                const peerId = clientsArr.find(id => id !== socket.id);
                
                if (peerId) {
                    activeUsers.get(socket.id).peer = peerId;
                    activeUsers.get(peerId).peer = socket.id;

                    const myActualCountry = activeUsers.get(socket.id).actualCountry;
                    const peerActualCountry = activeUsers.get(peerId).actualCountry;

                    socket.emit('matched', { isInitiator: true, xoRole: 'X', roomId: roomId, partnerCountry: peerActualCountry });
                    io.to(peerId).emit('matched', { isInitiator: false, xoRole: 'O', roomId: roomId, partnerCountry: myActualCountry });
                }
            }
        } else {
            socket.emit('room-not-found');
        }
    });

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

    socket.on('typing', () => {
        const user = activeUsers.get(socket.id);
        if (user && user.peer) io.to(user.peer).emit('display-typing');
    });

    socket.on('stop-typing', () => {
        const user = activeUsers.get(socket.id);
        if (user && user.peer) io.to(user.peer).emit('hide-typing');
    });

    socket.on('xo-move', (data) => {
        const user = activeUsers.get(socket.id);
        if (user && user.peer) io.to(user.peer).emit('xo-receive-move', data);
    });

    socket.on('submit-report', (data) => {
        console.log(`[REPORT] User ${socket.id} reported their peer. Reason: ${data.reason}`);
    });

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