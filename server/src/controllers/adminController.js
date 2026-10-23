const { User, Skill, Post, Comment, Message, Review, Report, AuditLog, Announcement, Assessment, Certificate } = require('../models');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { paginate, escapeRegex } = require('../utils/paginate');
const audit = require('../services/audit');
const credits = require('../services/credits');
const { notify } = require('../services/notify');

// ---------- Reporting (any user) ----------
const TARGETS = { user: User, skill: Skill, post: Post, comment: Comment, message: Message, review: Review };

exports.createReport = asyncHandler(async (req, res) => {
  const { targetType, targetId, reason, details } = req.body;
  const Model = TARGETS[targetType];
  if (!Model) throw new AppError('Invalid target type');
  if (!(await Model.exists({ _id: targetId }))) throw new AppError('Reported content not found', 404);
  const dup = await Report.findOne({ reporter: req.user._id, targetType, targetId, status: 'open' });
  if (dup) throw new AppError('You already reported this', 409);
  const report = await Report.create({ reporter: req.user._id, targetType, targetId, reason, details });
  res.status(201).json({ report });
});

// ---------- Users ----------
exports.listUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate({ ...req.query, limit: req.query.limit || 20 });
  const filter = {};
  if (req.query.q) { const rx = { $regex: escapeRegex(req.query.q), $options: 'i' }; filter.$or = [{ name: rx }, { email: rx }]; }
  if (req.query.role) filter.role = req.query.role;
  if (req.query.status) filter.status = req.query.status;
  const [items, total] = await Promise.all([
    User.find(filter).select('name email role status suspendedUntil credits points level createdAt emailVerified stats warnings').sort('-createdAt').skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
});

async function applyUserAction(actor, userId, action, { days, reason } = {}) {
  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found', 404);
  if (user.role === 'admin' && actor.role !== 'admin') throw new AppError('Moderators cannot act on admins', 403);
  if (String(user._id) === String(actor._id)) throw new AppError('You cannot moderate your own account');
  if (action === 'warn') {
    user.warnings.push({ reason, by: actor._id });
    await notify(user._id, { type: 'moderation', title: 'You received a warning from the moderators', body: reason });
  } else if (action === 'suspend') {
    user.status = 'suspended';
    user.suspendedUntil = new Date(Date.now() + (Number(days) || 7) * 86400000);
    user.refreshTokenHash = undefined;
  } else if (action === 'ban') {
    if (actor.role !== 'admin') throw new AppError('Only admins can ban users', 403);
    user.status = 'banned';
    user.refreshTokenHash = undefined;
  } else if (action === 'activate') {
    user.status = 'active'; user.suspendedUntil = undefined;
  } else throw new AppError('Unknown action');
  await user.save();
  await audit(actor._id, `user.${action}`, 'user', user._id, { days, reason });
  return user;
}

exports.moderateUser = asyncHandler(async (req, res) => {
  const user = await applyUserAction(req.user, req.params.id, req.body.action, req.body);
  res.json({ user: { _id: user._id, status: user.status, suspendedUntil: user.suspendedUntil, warnings: user.warnings.length } });
});

exports.setRole = asyncHandler(async (req, res) => {
  const { role } = req.body;
  if (!['user', 'moderator', 'admin'].includes(role)) throw new AppError('Invalid role');
  if (String(req.params.id) === String(req.user._id)) throw new AppError('You cannot change your own role');
  const user = await User.findById(req.params.id);
  if (!user) throw new AppError('User not found', 404);
  user.role = role;
  await user.save();
  await audit(req.user._id, 'user.role', 'user', user._id, { role });
  res.json({ user: { _id: user._id, role: user.role } });
});

exports.adjustCredits = asyncHandler(async (req, res) => {
  const amount = parseInt(req.body.amount, 10);
  if (!amount) throw new AppError('Amount must be a non-zero integer');
  const user = await User.findById(req.params.id);
  if (!user) throw new AppError('User not found', 404);
  if (user.credits + amount < 0) throw new AppError('Balance cannot go below zero');
  await credits.grant(user._id, amount, 'admin_adjustment', req.body.reason || 'Admin adjustment');
  await audit(req.user._id, 'credits.adjust', 'user', user._id, { amount, reason: req.body.reason });
  res.json({ credits: user.credits + amount });
});

// ---------- Skill verification ----------
exports.verificationQueue = asyncHandler(async (req, res) => {
  const items = await Skill.find({ 'verification.status': 'pending' }).populate('owner', 'name email').sort('updatedAt');
  res.json({ items });
});

exports.reviewVerification = asyncHandler(async (req, res) => {
  const { decision, note } = req.body;
  if (!['verified', 'rejected'].includes(decision)) throw new AppError('Decision must be verified or rejected');
  const skill = await Skill.findById(req.params.id);
  if (!skill || skill.verification.status !== 'pending') throw new AppError('No pending verification for this skill', 404);
  skill.verification.status = decision;
  skill.verification.note = note;
  skill.verification.reviewedBy = req.user._id;
  skill.verification.reviewedAt = new Date();
  await skill.save();
  await notify(skill.owner, { type: 'moderation', title: `Skill verification ${decision}: ${skill.title}`, body: note, link: `/skills/${skill._id}` });
  await audit(req.user._id, `skill.${decision}`, 'skill', skill._id, { note });
  res.json({ skill });
});

// ---------- Reports queue ----------
exports.listReports = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate({ ...req.query, limit: req.query.limit || 20 });
  const filter = { status: req.query.status || 'open' };
  if (req.query.targetType) filter.targetType = req.query.targetType;
  const [items, total] = await Promise.all([
    Report.find(filter).populate('reporter', 'name').populate('resolvedBy', 'name').sort('-createdAt').skip(skip).limit(limit),
    Report.countDocuments(filter),
  ]);
  const withTargets = await Promise.all(items.map(async (r) => {
    const Model = TARGETS[r.targetType];
    const t = await Model.findById(r.targetId).lean();
    let preview = '';
    let ownerId = null;
    if (t) {
      preview = t.title || t.text || t.body || t.comment || t.name || '';
      ownerId = r.targetType === 'user' ? t._id : (t.owner || t.author || t.sender || t.reviewer);
    }
    return { ...r.toObject(), target: { preview: String(preview).slice(0, 200), ownerId, exists: !!t } };
  }));
  res.json({ items: withTargets, total, page });
});

async function removeContent(type, id) {
  if (type === 'skill') return Skill.updateOne({ _id: id }, { status: 'removed' });
  if (type === 'post') return Post.updateOne({ _id: id }, { status: 'hidden' });
  if (type === 'comment') return Comment.updateOne({ _id: id }, { status: 'hidden' });
  if (type === 'message') return Message.updateOne({ _id: id }, { text: '[removed by moderator]', attachment: null });
  if (type === 'review') return Review.deleteOne({ _id: id });
  return null;
}

exports.resolveReport = asyncHandler(async (req, res) => {
  const report = await Report.findById(req.params.id);
  if (!report) throw new AppError('Report not found', 404);
  if (report.status !== 'open') throw new AppError('Report already handled');
  const { action = 'none', note, days } = req.body;
  const Model = TARGETS[report.targetType];
  const target = await Model.findById(report.targetId).lean();
  const ownerId = target && (report.targetType === 'user' ? target._id : (target.owner || target.author || target.sender || target.reviewer));
  if (action === 'dismiss') {
    report.status = 'dismissed';
    report.action = 'none';
  } else {
    if (action === 'content_removed') await removeContent(report.targetType, report.targetId);
    else if (action === 'user_warned') await applyUserAction(req.user, ownerId, 'warn', { reason: note || `Report: ${report.reason}` });
    else if (action === 'user_suspended') await applyUserAction(req.user, ownerId, 'suspend', { days, reason: note });
    else if (action === 'user_banned') await applyUserAction(req.user, ownerId, 'ban', { reason: note });
    else if (action !== 'none') throw new AppError('Unknown action');
    report.status = 'resolved';
    report.action = action;
  }
  report.resolvedBy = req.user._id;
  report.resolutionNote = note;
  report.resolvedAt = new Date();
  await report.save();
  await Report.updateMany({ targetType: report.targetType, targetId: report.targetId, status: 'open' }, { status: report.status, action: report.action, resolvedBy: req.user._id, resolvedAt: new Date(), resolutionNote: 'Resolved with duplicate report' });
  await audit(req.user._id, `report.${report.status}`, report.targetType, report.targetId, { action, note });
  await notify(report.reporter, { type: 'moderation', title: 'Your report has been reviewed', body: report.status === 'resolved' ? 'Action was taken. Thank you.' : 'No violation was found.' });
  res.json({ report });
});

// ---------- Assessment review ----------
exports.assessmentQueue = asyncHandler(async (req, res) => {
  res.json({ items: await Assessment.find({ status: 'pending_review' }).populate('createdBy', 'name') });
});

exports.reviewAssessment = asyncHandler(async (req, res) => {
  const a = await Assessment.findById(req.params.id);
  if (!a) throw new AppError('Assessment not found', 404);
  a.status = req.body.decision === 'publish' ? 'published' : 'draft';
  await a.save();
  await notify(a.createdBy, { type: 'moderation', title: `Assessment "${a.title}" ${a.status === 'published' ? 'published' : 'returned for changes'}`, body: req.body.note });
  await audit(req.user._id, `assessment.${a.status}`, 'assessment', a._id);
  res.json({ assessment: a });
});

exports.revokeCertificate = asyncHandler(async (req, res) => {
  const c = await Certificate.findById(req.params.id);
  if (!c) throw new AppError('Certificate not found', 404);
  c.revoked = true;
  await c.save();
  await audit(req.user._id, 'certificate.revoke', 'certificate', c._id, { reason: req.body.reason });
  res.json({ certificate: c });
});

// ---------- Audit & announcements ----------
exports.auditLog = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate({ ...req.query, limit: req.query.limit || 30 });
  const [items, total] = await Promise.all([
    AuditLog.find().populate('actor', 'name role').sort('-createdAt').skip(skip).limit(limit),
    AuditLog.countDocuments(),
  ]);
  res.json({ items, total, page });
});

exports.listAnnouncements = asyncHandler(async (req, res) => {
  res.json({ items: await Announcement.find({ active: true }).sort('-createdAt').limit(5) });
});

exports.createAnnouncement = asyncHandler(async (req, res) => {
  if (!req.body.title) throw new AppError('Title is required');
  const a = await Announcement.create({ title: req.body.title, body: req.body.body, createdBy: req.user._id });
  await audit(req.user._id, 'announcement.create', 'announcement', a._id);
  res.status(201).json({ announcement: a });
});

exports.deactivateAnnouncement = asyncHandler(async (req, res) => {
  await Announcement.updateOne({ _id: req.params.id }, { active: false });
  res.json({ ok: true });
});
