const express = require('express');
const app = express();
const http = require('http').createServer(app);
const { Server } = require('socket.io');

const io = new Server(http, { cors: { origin: "*", methods: ["GET", "POST"] } });
app.use(express.static(__dirname));

let activeUsers = new Map();
let waitingQueue = [];

async function getCountryFromIP(req) {
    try {
        let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        if (ip && ip.includes(',')) ip = ip.split(',')[0].trim();
        if (ip === '::1' || ip === '127.0.0.1' || !ip) return { country: 'Unknown', code: '' };
        const response = await fetch(`http://ip-api.com/json/${ip}`);
        const data = await response.json();
        return { country: data.country || 'Unknown', code: (data.countryCode || '').toLowerCase() };
    } catch (e) { return { country: 'Unknown', code: '' }; }
}

io.on('connection', async (socket) => {
    const geo = await getCountryFromIP(socket.request);
    activeUsers.set(socket.id, { room: null, peer: null, country: geo.country, code: geo.code });
    io.emit('online-count', activeUsers.size);

    socket.on('find-match', (data) => {
        waitingQueue = waitingQueue.filter(id => id !== socket.id);
        if (waitingQueue.length > 0) {
            const peerId = waitingQueue.shift();
            const roomId = `room_${socket.id}_${peerId}`;
            socket.join(roomId);
            const peerSocket = io.sockets.sockets.get(peerId);
            if (peerSocket) {
                peerSocket.join(roomId);
                const userA = activeUsers.get(socket.id);
                const userB = activeUsers.get(peerId);
                userA.room = roomId; userA.peer = peerId;
                userB.room = roomId; userB.peer = socket.id;
                socket.emit('matched', { isInitiator: true, peerCountry: userB.country, peerCode: userB.code });
                peerSocket.emit('matched', { isInitiator: false, peerCountry: userA.country, peerCode: userA.code });
            } else { waitingQueue.push(socket.id); }
        } else { waitingQueue.push(socket.id); }
    });

    socket.on('signal', (data) => {
        const user = activeUsers.get(socket.id);
        if (user && user.peer) io.to(user.peer).emit('signal', data);
    });

    socket.on('send-message', (data) => {
        const user = activeUsers.get(socket.id);
        if (user && user.peer) io.to(user.peer).emit('receive-message', data);
    });

    socket.on('game-move', (data) => {
        const user = activeUsers.get(socket.id);
        if (user && user.peer) io.to(user.peer).emit('game-move', data);
    });

    socket.on('leave-room', () => { handleUserDisconnect(socket); });
    socket.on('disconnect', () => { handleUserDisconnect(socket); activeUsers.delete(socket.id); io.emit('online-count', activeUsers.size); });
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
http.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));