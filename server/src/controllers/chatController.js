const { Conversation, Message, User } = require('../models');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { emitToUser, notify } = require('../services/notify');

async function getOrCreateConversation(userIds, exchangeId) {
  const ids = userIds.map(String);
  let convo = await Conversation.findOne({ participants: { $all: ids, $size: ids.length } });
  if (!convo) convo = await Conversation.create({ participants: ids, exchange: exchangeId });
  return convo;
}
exports.getOrCreateConversation = getOrCreateConversation;

async function loadConvo(id, userId) {
  const convo = await Conversation.findById(id);
  if (!convo) throw new AppError('Conversation not found', 404);
  if (!convo.participants.some((p) => String(p) === String(userId))) throw new AppError('Not a participant', 403);
  return convo;
}

exports.start = asyncHandler(async (req, res) => {
  const { userId } = req.body;
  if (String(userId) === String(req.user._id)) throw new AppError('You cannot message yourself');
  const other = await User.findById(userId);
  if (!other || other.status === 'banned') throw new AppError('User not found', 404);
  const convo = await getOrCreateConversation([req.user._id, userId]);
  res.status(201).json({ conversation: await convo.populate('participants', 'name avatar lastSeen') });
});

exports.list = asyncHandler(async (req, res) => {
  const convos = await Conversation.find({ participants: req.user._id }).populate('participants', 'name avatar lastSeen').sort('-updatedAt');
  const unread = await Promise.all(convos.map((c) => Message.countDocuments({ conversation: c._id, sender: { $ne: req.user._id }, readBy: { $ne: req.user._id } })));
  res.json({ items: convos.map((c, i) => ({ ...c.toObject(), unread: unread[i] })) });
});

exports.messages = asyncHandler(async (req, res) => {
  await loadConvo(req.params.id, req.user._id);
  const before = req.query.before ? new Date(req.query.before) : new Date(Date.now() + 1000);
  const items = await Message.find({ conversation: req.params.id, createdAt: { $lt: before } }).sort('-createdAt').limit(50).populate('sender', 'name avatar');
  res.json({ items: items.reverse() });
});

async function createMessage(convo, sender, text, attachment) {
  if (!text && !(attachment && attachment.url)) throw new AppError('Message cannot be empty');
  const msg = await Message.create({ conversation: convo._id, sender: sender._id, text, attachment, readBy: [sender._id] });
  convo.lastMessage = { text: text || attachment.name, sender: sender._id, at: msg.createdAt };
  await convo.save();
  await msg.populate('sender', 'name avatar');
  convo.participants.forEach((p) => emitToUser(p, 'message:new', { conversationId: convo._id, message: msg }));
  return msg;
}
exports.createMessage = createMessage;

exports.send = asyncHandler(async (req, res) => {
  const convo = await loadConvo(req.params.id, req.user._id);
  const msg = await createMessage(convo, req.user, req.body.text, req.body.attachment);
  const { getIO } = require('../services/notify');
  const io = getIO();
  for (const p of convo.participants) {
    if (String(p) === String(req.user._id)) continue;
    const online = io && io.sockets.adapter.rooms.get(`user:${p}`);
    if (!online) await notify(p, { type: 'message', title: `New message from ${req.user.name}`, body: (req.body.text || '').slice(0, 80), link: `/messages/${convo._id}` });
  }
  res.status(201).json({ message: msg });
});

exports.markRead = asyncHandler(async (req, res) => {
  const convo = await loadConvo(req.params.id, req.user._id);
  await Message.updateMany({ conversation: convo._id, readBy: { $ne: req.user._id } }, { $push: { readBy: req.user._id } });
  convo.participants.forEach((p) => emitToUser(p, 'message:read', { conversationId: convo._id, userId: req.user._id }));
  res.json({ ok: true });
});
