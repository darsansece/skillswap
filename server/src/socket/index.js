const { Server } = require('socket.io');
const { userFromToken } = require('../middleware/auth');
const { User, Conversation, Exchange } = require('../models');
const { setIO } = require('../services/notify');
const { createMessage } = require('../controllers/chatController');

const online = new Map(); // userId -> socket count

function initSocket(httpServer) {
  const io = new Server(httpServer, { cors: { origin: process.env.CLIENT_URL || '*' } });
  setIO(io);

  io.use(async (socket, next) => {
    try {
      const user = await userFromToken(socket.handshake.auth.token);
      if (user.status !== 'active') return next(new Error('Account not active'));
      socket.user = user;
      return next();
    } catch (e) { return next(new Error('Unauthorized')); }
  });

  io.on('connection', (socket) => {
    const uid = String(socket.user._id);
    socket.join(`user:${uid}`);
    online.set(uid, (online.get(uid) || 0) + 1);
    io.emit('presence', { userId: uid, online: true });

    socket.on('presence:list', (ids, cb) => { if (typeof cb === 'function') cb((ids || []).filter((id) => online.has(String(id)))); });

    socket.on('message:send', async ({ conversationId, text, attachment }, cb) => {
      try {
        const convo = await Conversation.findById(conversationId);
        if (!convo || !convo.participants.some((p) => String(p) === uid)) throw new Error('Not a participant');
        const msg = await createMessage(convo, socket.user, text, attachment);
        if (cb) cb({ ok: true, message: msg });
      } catch (e) { if (cb) cb({ ok: false, error: e.message }); }
    });

    socket.on('typing', async ({ conversationId, typing }) => {
      const convo = await Conversation.findById(conversationId).catch(() => null);
      if (!convo || !convo.participants.some((p) => String(p) === uid)) return;
      convo.participants.filter((p) => String(p) !== uid).forEach((p) => io.to(`user:${p}`).emit('typing', { conversationId, userId: uid, name: socket.user.name, typing: !!typing }));
    });

    // Collaborative session notes: live-broadcast keystrokes to the other participant (persisted via REST)
    socket.on('notes:edit', async ({ exchangeId, notes }) => {
      const ex = await Exchange.findById(exchangeId).catch(() => null);
      if (!ex || ![String(ex.requester), String(ex.provider)].includes(uid)) return;
      const other = String(ex.requester) === uid ? ex.provider : ex.requester;
      io.to(`user:${other}`).emit('notes:update', { exchangeId, notes, by: uid, live: true });
    });

    socket.on('disconnect', async () => {
      const n = (online.get(uid) || 1) - 1;
      if (n <= 0) {
        online.delete(uid);
        io.emit('presence', { userId: uid, online: false });
        await User.updateOne({ _id: uid }, { lastSeen: new Date() }).catch(() => null);
      } else online.set(uid, n);
    });
  });
  return io;
}

module.exports = { initSocket, online };
