const { Skill, User, Review } = require('../models');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { paginate, escapeRegex } = require('../utils/paginate');
const { CATEGORIES, LEVELS, POINTS } = require('../config/constants');
const { addPoints } = require('../services/gamification');

const FIELDS = ['title', 'description', 'category', 'level', 'tags', 'mode', 'location', 'creditsPerHour', 'acceptsSwap', 'yearsExperience'];
const pick = (body) => FIELDS.reduce((o, k) => (body[k] !== undefined ? { ...o, [k]: body[k] } : o), {});

const SORTS = { newest: '-createdAt', rating: '-ratingSum', popular: '-sessionsCompleted', 'credits-asc': 'creditsPerHour', 'credits-desc': '-creditsPerHour' };

exports.meta = (req, res) => res.json({ categories: CATEGORIES, levels: LEVELS, modes: ['online', 'in-person', 'both'] });

exports.list = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const { q, category, level, mode, maxCredits, swap, verified, owner, tag } = req.query;
  const filter = { status: 'active' };
  if (q) {
    const rx = { $regex: escapeRegex(q), $options: 'i' };
    filter.$or = [{ title: rx }, { description: rx }, { tags: String(q).toLowerCase() }];
  }
  if (category) filter.category = category;
  if (level) filter.level = level;
  if (mode) filter.mode = mode === 'online' ? { $in: ['online', 'both'] } : mode === 'in-person' ? { $in: ['in-person', 'both'] } : mode;
  if (maxCredits !== undefined && maxCredits !== '') filter.creditsPerHour = { $lte: Number(maxCredits) };
  if (swap === 'true') filter.acceptsSwap = true;
  if (verified === 'true') filter['verification.status'] = 'verified';
  if (owner) filter.owner = owner;
  if (tag) filter.tags = String(tag).toLowerCase();

  const banned = await User.find({ status: { $ne: 'active' } }).select('_id');
  if (banned.length && !owner) filter.owner = { $nin: banned.map((b) => b._id) };

  const [items, total] = await Promise.all([
    Skill.find(filter).populate('owner', 'name avatar level stats location').sort(SORTS[req.query.sort] || '-createdAt').skip(skip).limit(limit),
    Skill.countDocuments(filter),
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
});

exports.get = asyncHandler(async (req, res) => {
  const skill = await Skill.findById(req.params.id).populate('owner', 'name avatar headline level stats location availability languages');
  if (!skill || skill.status === 'removed') throw new AppError('Skill not found', 404);
  if (!req.user || String(req.user._id) !== String(skill.owner._id)) {
    await Skill.updateOne({ _id: skill._id }, { $inc: { views: 1 } });
  }
  const reviews = await Review.find({ skill: skill._id }).populate('reviewer', 'name avatar').sort('-createdAt').limit(20);
  const related = await Skill.find({ _id: { $ne: skill._id }, category: skill.category, status: 'active' }).populate('owner', 'name avatar').limit(4);
  res.json({ skill, reviews, related });
});

exports.create = asyncHandler(async (req, res) => {
  const skill = await Skill.create({ ...pick(req.body), owner: req.user._id });
  const count = await Skill.countDocuments({ owner: req.user._id });
  if (count <= 5) await addPoints(req.user._id, POINTS.SKILL_LISTED);
  res.status(201).json({ skill });
});

async function ownSkill(req) {
  const skill = await Skill.findById(req.params.id);
  if (!skill || skill.status === 'removed') throw new AppError('Skill not found', 404);
  if (String(skill.owner) !== String(req.user._id) && req.user.role !== 'admin') throw new AppError('You can only modify your own skills', 403);
  return skill;
}

exports.update = asyncHandler(async (req, res) => {
  const skill = await ownSkill(req);
  Object.assign(skill, pick(req.body));
  if (req.body.status && ['active', 'paused'].includes(req.body.status)) skill.status = req.body.status;
  await skill.save();
  res.json({ skill });
});

exports.remove = asyncHandler(async (req, res) => {
  const skill = await ownSkill(req);
  skill.status = 'removed';
  await skill.save();
  res.json({ message: 'Skill removed' });
});

exports.requestVerification = asyncHandler(async (req, res) => {
  const skill = await ownSkill(req);
  if (skill.verification.status === 'verified') throw new AppError('Skill is already verified');
  if (!req.body.evidence) throw new AppError('Please provide evidence (links to work, certificates, etc.)');
  skill.verification = { status: 'pending', evidence: req.body.evidence };
  await skill.save();
  res.json({ skill });
});

exports.mine = asyncHandler(async (req, res) => {
  const items = await Skill.find({ owner: req.user._id, status: { $ne: 'removed' } }).sort('-createdAt');
  res.json({ items });
});

/** Perfect swaps: users who offer something I want AND want something I offer. */
exports.swapMatches = asyncHandler(async (req, res) => {
  const { recommendPeople } = require('../services/ai');
  const people = await recommendPeople(req.user, 20);
  res.json({ items: people.filter((p) => p.mutual) });
});

exports.categoryStats = asyncHandler(async (req, res) => {
  const rows = await Skill.aggregate([{ $match: { status: 'active' } }, { $group: { _id: '$category', count: { $sum: 1 } } }]);
  res.json({ items: CATEGORIES.map((c) => ({ category: c, count: (rows.find((r) => r._id === c) || {}).count || 0 })) });
});
