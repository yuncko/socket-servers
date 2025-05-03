const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// تفعيل socket.io مع السماح لكل المواقع بالاتصال
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('message', (msg) => {
    console.log('Received message:', msg);
    socket.broadcast.emit('message', msg); // يرسل الرسالة لكل المستخدمين الآخرين
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// استماع على البورت الذي توفره Render أو بورت 3000 محليًا
server.listen(process.env.PORT || 3000, () => {
  console.log('Socket.io server is running...');
});