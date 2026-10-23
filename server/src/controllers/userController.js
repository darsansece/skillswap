const { User, Skill, Review, Certificate } = require('../models');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { paginate, escapeRegex } = require('../utils/paginate');
const { selfView } = require('./authController');
const { notify } = require('../services/notify');

const EDITABLE = ['name', 'avatar', 'headline', 'bio', 'location', 'languages', 'timezone', 'skillsWanted', 'interests', 'availability', 'socialLinks'];

exports.updateProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  EDITABLE.forEach((k) => { if (req.body[k] !== undefined) user[k] = req.body[k]; });
  await user.save();
  res.json({ user: selfView(user) });
});

exports.getPublicProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user || user.status === 'banned') throw new AppError('User not found', 404);
  const [skills, reviews, certificates] = await Promise.all([
    Skill.find({ owner: user._id, status: 'active' }).sort('-createdAt'),
    Review.find({ reviewee: user._id }).populate('reviewer', 'name avatar').populate('skill', 'title').sort('-createdAt').limit(20),
    Certificate.find({ user: user._id, revoked: false }).select('skillName level score code issuedAt'),
  ]);
  const endorsementSummary = {};
  user.endorsements.forEach((e) => { endorsementSummary[e.skill] = (endorsementSummary[e.skill] || 0) + 1; });
  res.json({ user: user.toPublic(), skills, reviews, certificates, endorsements: endorsementSummary });
});

exports.searchUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const filter = { status: 'active' };
  if (req.query.q) filter.name = { $regex: escapeRegex(req.query.q), $options: 'i' };
  const [items, total] = await Promise.all([
    User.find(filter).select('name avatar headline location level stats points').sort('-points').skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
});

// Portfolio
exports.addPortfolio = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  user.portfolio.push({ title: req.body.title, description: req.body.description, url: req.body.url, skill: req.body.skill });
  await user.save();
  res.status(201).json({ portfolio: user.portfolio });
});

exports.updatePortfolio = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  const item = user.portfolio.id(req.params.itemId);
  if (!item) throw new AppError('Portfolio item not found', 404);
  ['title', 'description', 'url', 'skill'].forEach((k) => { if (req.body[k] !== undefined) item[k] = req.body[k]; });
  await user.save();
  res.json({ portfolio: user.portfolio });
});

exports.deletePortfolio = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  const item = user.portfolio.id(req.params.itemId);
  if (!item) throw new AppError('Portfolio item not found', 404);
  item.deleteOne();
  await user.save();
  res.json({ portfolio: user.portfolio });
});

exports.endorse = asyncHandler(async (req, res) => {
  if (String(req.params.id) === String(req.user._id)) throw new AppError('You cannot endorse yourself');
  const skill = String(req.body.skill || '').trim();
  if (!skill) throw new AppError('Skill name is required');
  const user = await User.findById(req.params.id);
  if (!user) throw new AppError('User not found', 404);
  if (user.endorsements.some((e) => e.skill === skill && String(e.by) === String(req.user._id))) throw new AppError('You already endorsed this skill', 409);
  user.endorsements.push({ skill, by: req.user._id });
  await user.save();
  await notify(user._id, { type: 'system', title: `${req.user.name} endorsed you for ${skill}`, link: `/users/${user._id}` });
  res.status(201).json({ message: 'Endorsed' });
});

exports.toggleBookmark = asyncHandler(async (req, res) => {
  const skill = await Skill.findById(req.params.skillId);
  if (!skill) throw new AppError('Skill not found', 404);
  const user = await User.findById(req.user._id);
  const i = user.bookmarks.findIndex((b) => String(b) === String(skill._id));
  if (i >= 0) user.bookmarks.splice(i, 1); else user.bookmarks.push(skill._id);
  await user.save();
  res.json({ bookmarked: i < 0, bookmarks: user.bookmarks });
});

exports.getBookmarks = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).populate({ path: 'bookmarks', populate: { path: 'owner', select: 'name avatar' } });
  res.json({ items: user.bookmarks.filter((b) => b && b.status !== 'removed') });
});
