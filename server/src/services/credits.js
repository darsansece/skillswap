const { User, CreditTransaction } = require('../models');
const AppError = require('../utils/AppError');
const { notify } = require('./notify');

async function log(userId, amount, type, description, exchange) {
  const u = await User.findById(userId).select('credits');
  return CreditTransaction.create({ user: userId, amount, type, description, exchange, balanceAfter: u ? u.credits : undefined });
}

/** Credit a user's wallet. */
async function grant(userId, amount, type, description, exchange) {
  await User.updateOne({ _id: userId }, { $inc: { credits: amount } });
  await log(userId, amount, type, description, exchange);
  if (amount > 0 && type !== 'signup_bonus') {
    await notify(userId, { type: 'credit', title: `+${amount} credits`, body: description, link: '/wallet' });
  }
}

/** Atomically move credits from available balance into escrow. Fails if insufficient. */
async function hold(userId, amount, exchangeId) {
  if (amount <= 0) return;
  // Conditional update is atomic: it only matches if the balance is sufficient.
  const res = await User.updateOne(
    { _id: userId, credits: { $gte: amount } },
    { $inc: { credits: -amount, heldCredits: amount } },
  );
  if (!res.modifiedCount) throw new AppError(`Insufficient credits: ${amount} required`, 400);
  await log(userId, -amount, 'escrow_hold', 'Credits held for exchange', exchangeId);
}

/** Release escrowed credits from learner to teacher. */
async function release(fromId, toId, amount, exchangeId, description) {
  if (amount <= 0) return;
  await User.updateOne({ _id: fromId }, { $inc: { heldCredits: -amount } });
  await log(fromId, 0, 'escrow_release', `${amount} escrowed credits paid out`, exchangeId);
  await grant(toId, amount, 'earned_teaching', description || 'Earned for teaching a session', exchangeId);
}

/** Return escrowed credits to the learner. */
async function refund(userId, amount, exchangeId) {
  if (amount <= 0) return;
  await User.updateOne({ _id: userId }, { $inc: { heldCredits: -amount, credits: amount } });
  await log(userId, amount, 'escrow_refund', 'Escrowed credits refunded', exchangeId);
}

/** Peer-to-peer gift/tip of credits. */
async function transfer(fromId, toId, amount, note) {
  if (String(fromId) === String(toId)) throw new AppError('Cannot transfer credits to yourself');
  if (!Number.isInteger(amount) || amount <= 0) throw new AppError('Amount must be a positive whole number');
  const res = await User.updateOne({ _id: fromId, credits: { $gte: amount } }, { $inc: { credits: -amount } });
  if (!res.modifiedCount) throw new AppError('Insufficient credits', 400);
  const sender = await User.findById(fromId).select('name');
  await log(fromId, -amount, 'transfer', `Sent ${amount} credits${note ? `: ${note}` : ''}`);
  await grant(toId, amount, 'transfer', `Received ${amount} credits from ${sender.name}${note ? `: ${note}` : ''}`);
}

module.exports = { grant, hold, release, refund, transfer };
