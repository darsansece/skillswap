const { Notification } = require('../models');

let io = null;
const setIO = (instance) => { io = instance; };
const getIO = () => io;

async function notify(userId, { type, title, body, link }) {
  const n = await Notification.create({ user: userId, type, title, body, link });
  if (io) io.to(`user:${userId}`).emit('notification', n);
  return n;
}

function emitToUser(userId, event, payload) {
  if (io) io.to(`user:${userId}`).emit(event, payload);
}

module.exports = { notify, setIO, getIO, emitToUser };
