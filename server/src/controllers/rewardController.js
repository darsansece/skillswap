const { User, CreditTransaction } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { paginate } = require('../utils/paginate');
const credits = require('../services/credits');
const { BADGES, LEVEL_THRESHOLDS } = require('../config/constants');
const { BADGE_RULES } = require('../services/gamification');

exports.wallet = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate({ ...req.query, limit: req.query.limit || 20 });
  const [user, items, total, all] = await Promise.all([
    User.findById(req.user._id).select('credits heldCredits'),
    CreditTransaction.find({ user: req.user._id }).sort('-createdAt').skip(skip).limit(limit),
    CreditTransaction.countDocuments({ user: req.user._id }),
    CreditTransaction.find({ user: req.user._id }).select('amount type'),
  ]);
  const totalEarned = all.filter((t) => t.amount > 0 && t.type !== 'escrow_refund').reduce((a, t) => a + t.amount, 0);
  const outflow = all.filter((t) => t.amount < 0).reduce((a, t) => a - t.amount, 0);
  const refunded = all.filter((t) => t.type === 'escrow_refund').reduce((a, t) => a + t.amount, 0);
  const totalSpent = outflow - refunded - user.heldCredits;
  res.json({ balance: user.credits, held: user.heldCredits, totalEarned, totalSpent, items, total, page });
});

exports.transfer = asyncHandler(async (req, res) => {
  const { toUserId, amount, note } = req.body;
  const to = await User.findById(toUserId);
  if (!to || to.status !== 'active') throw new AppError('Recipient not found', 404);
  await credits.transfer(req.user._id, to._id, Number(amount), note);
  const me = await User.findById(req.user._id).select('credits');
  res.json({ balance: me.credits });
});

exports.progress = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  const next = LEVEL_THRESHOLDS[user.level] ?? null;
  const current = LEVEL_THRESHOLDS[user.level - 1] || 0;
  const earnedKeys = new Set(user.badges.map((b) => b.key));
  res.json({
    points: user.points, level: user.level, loginStreak: user.loginStreak,
    nextLevelAt: next, currentLevelAt: current,
    levelProgress: next ? Math.round(((user.points - current) / (next - current)) * 100) : 100,
    badges: BADGES.map((b) => ({ ...b, earned: earnedKeys.has(b.key), awardedAt: (user.badges.find((x) => x.key === b.key) || {}).awardedAt, automatic: !!BADGE_RULES[b.key] })),
  });
});

exports.leaderboard = asyncHandler(async (req, res) => {
  const by = { points: '-points', teaching: '-stats.sessionsTaught', hours: '-stats.hoursTaught' }[req.query.by] || '-points';
  const items = await User.find({ status: 'active', role: { $ne: 'admin' } }).select('name avatar points level stats badges').sort(by).limit(Math.min(50, Number(req.query.limit) || 20));
  const myRank = (await User.countDocuments({ status: 'active', role: { $ne: 'admin' }, points: { $gt: req.user.points } })) + 1;
  res.json({ items, myRank });
});
