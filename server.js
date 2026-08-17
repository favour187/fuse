'use strict';

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const G = require('./game');

const PORT = Number(process.env.PORT) || 3000;
const TICK_HZ = 30;
const DT = 1 / TICK_HZ;

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling'],
  pingInterval: 8000,
  pingTimeout: 15000,
});

const rooms = new Map();
const socketRoom = new Map();

function roomByCode(code) {
  return rooms.get(String(code || '').toUpperCase());
}

function emitRoom(room) {
  io.to(room.code).emit('state', G.serialize(room));
}

function emitLobby(room) {
  io.to(room.code).emit('lobby', G.serialize(room));
}

io.on('connection', (socket) => {
  socket.on('create', (data = {}) => {
    leaveCurrent(socket);
    let code = G.makeCode();
    while (rooms.has(code)) code = G.makeCode();
    const room = G.createRoom(code, socket.id);
    const player = G.addPlayer(room, socket.id, data.name, false);
    if (!player) return socket.emit('errorMsg', 'Could not create room.');
    rooms.set(code, room);
    socket.join(code);
    socketRoom.set(socket.id, code);
    socket.emit('joined', { id: socket.id, code, host: true });
    emitLobby(room);
  });

  socket.on('join', (data = {}) => {
    const code = String(data.code || '').toUpperCase().trim();
    const room = roomByCode(code);
    if (!room) return socket.emit('errorMsg', 'No room with that code.');
    if (room.phase !== 'lobby') return socket.emit('errorMsg', 'That match already started.');
    if (room.players.size >= G.MAX_PLAYERS) return socket.emit('errorMsg', 'Room is full (6).');
    leaveCurrent(socket);
    const player = G.addPlayer(room, socket.id, data.name, false);
    if (!player) return socket.emit('errorMsg', 'Could not join.');
    socket.join(code);
    socketRoom.set(socket.id, code);
    socket.emit('joined', { id: socket.id, code, host: room.hostId === socket.id });
    emitLobby(room);
  });

  socket.on('addBot', () => {
    const room = roomByCode(socketRoom.get(socket.id));
    if (!room || room.hostId !== socket.id) return;
    if (room.phase !== 'lobby') return;
    if (!G.addBot(room)) return socket.emit('errorMsg', 'Cannot add more bots.');
    emitLobby(room);
  });

  socket.on('removeBot', () => {
    const room = roomByCode(socketRoom.get(socket.id));
    if (!room || room.hostId !== socket.id) return;
    const bot = [...room.players.values()].reverse().find((p) => p.isBot);
    if (bot) G.removePlayer(room, bot.id);
    emitLobby(room);
  });

  socket.on('start', () => {
    const room = roomByCode(socketRoom.get(socket.id));
    if (!room || room.hostId !== socket.id) return;
    if (!G.startMatch(room)) return socket.emit('errorMsg', 'Need at least 2 players.');
    io.to(room.code).emit('started');
    emitRoom(room);
  });

  socket.on('rematch', () => {
    const room = roomByCode(socketRoom.get(socket.id));
    if (!room || room.hostId !== socket.id) return;
    if (room.phase !== 'match_over' && room.phase !== 'round_over' && room.phase !== 'lobby') return;
    if (!G.startMatch(room)) return socket.emit('errorMsg', 'Need at least 2 players.');
    io.to(room.code).emit('started');
    emitRoom(room);
  });

  socket.on('toLobby', () => {
    const room = roomByCode(socketRoom.get(socket.id));
    if (!room || room.hostId !== socket.id) return;
    room.phase = 'lobby';
    room.round = 0;
    room.announcement = '';
    for (const p of room.players.values()) {
      p.alive = true;
      p.wins = 0;
    }
    emitLobby(room);
  });

  socket.on('input', (data = {}) => {
    const room = roomByCode(socketRoom.get(socket.id));
    if (!room) return;
    G.setInput(room, socket.id, data);
  });

  socket.on('rename', (data = {}) => {
    const room = roomByCode(socketRoom.get(socket.id));
    if (!room || room.phase !== 'lobby') return;
    const p = room.players.get(socket.id);
    if (!p) return;
    p.name = G.sanitizeName(data.name);
    emitLobby(room);
  });

  socket.on('disconnect', () => {
    leaveCurrent(socket);
  });
});

function leaveCurrent(socket) {
  const code = socketRoom.get(socket.id);
  if (!code) return;
  const room = rooms.get(code);
  socketRoom.delete(socket.id);
  socket.leave(code);
  if (!room) return;
  G.removePlayer(room, socket.id);
  const humans = [...room.players.values()].filter((p) => !p.isBot);
  if (humans.length === 0) {
    rooms.delete(code);
    return;
  }
  if (room.phase !== 'lobby') {
    const aliveHumans = humans.filter((p) => p.alive);
    if (aliveHumans.length + [...room.players.values()].filter((p) => p.isBot && p.alive).length <= 1) {
      /* let the sim resolve next tick */
    }
  }
  if (room.phase === 'lobby') emitLobby(room);
}

setInterval(() => {
  for (const room of rooms.values()) {
    if (room.phase === 'lobby') continue;
    G.tick(room, DT);
    emitRoom(room);
  }
}, 1000 / TICK_HZ);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`FUSE listening on http://0.0.0.0:${PORT}`);
});
