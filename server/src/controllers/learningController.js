const crypto = require('crypto');
const { Assessment, Attempt, Certificate, Goal, User } = require('../models');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { paginate, escapeRegex } = require('../utils/paginate');
const { addPoints, awardBadge } = require('../services/gamification');
const { notify } = require('../services/notify');
const { POINTS } = require('../config/constants');

const isStaff = (u) => ['admin', 'moderator'].includes(u.role);
const stripAnswers = (a) => {
  const o = a.toObject();
  o.questions = o.questions.map(({ correctIndex, explanation, ...q }) => q);
  return o;
};

// ---------- Assessments ----------
exports.listAssessments = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const filter = { status: 'published' };
  if (req.query.status && isStaff(req.user)) filter.status = req.query.status;
  if (req.query.mine === 'true') { delete filter.status; filter.createdBy = req.user._id; }
  if (req.query.q) filter.$or = [{ title: { $regex: escapeRegex(req.query.q), $options: 'i' } }, { skillName: { $regex: escapeRegex(req.query.q), $options: 'i' } }];
  if (req.query.category) filter.category = req.query.category;
  if (req.query.level) filter.level = req.query.level;
  const [items, total] = await Promise.all([
    Assessment.find(filter).select('-questions.correctIndex -questions.explanation').populate('createdBy', 'name').sort('-createdAt').skip(skip).limit(limit),
    Assessment.countDocuments(filter),
  ]);
  const myAttempts = await Attempt.find({ user: req.user._id, assessment: { $in: items.map((i) => i._id) }, submittedAt: { $exists: true } }).select('assessment score passed');
  res.json({
    items: items.map((a) => {
      const mine = myAttempts.filter((t) => String(t.assessment) === String(a._id));
      return { ...a.toObject(), questionCount: a.questions.length, questions: undefined, myBest: mine.length ? Math.max(...mine.map((m) => m.score)) : null, myPassed: mine.some((m) => m.passed), myAttempts: mine.length };
    }),
    total, page, pages: Math.ceil(total / limit),
  });
});

exports.getAssessment = asyncHandler(async (req, res) => {
  const a = await Assessment.findById(req.params.id).populate('createdBy', 'name');
  if (!a) throw new AppError('Assessment not found', 404);
  const owner = String(a.createdBy._id) === String(req.user._id);
  if (a.status !== 'published' && !owner && !isStaff(req.user)) throw new AppError('Assessment not found', 404);
  res.json({ assessment: owner || isStaff(req.user) ? a : stripAnswers(a) });
});

function validateQuestions(questions) {
  if (!Array.isArray(questions) || questions.length < 1) throw new AppError('Add at least one question');
  questions.forEach((q, i) => {
    if (!q.prompt || !Array.isArray(q.options) || q.options.length < 2) throw new AppError(`Question ${i + 1} needs a prompt and at least 2 options`);
    if (!(q.correctIndex >= 0 && q.correctIndex < q.options.length)) throw new AppError(`Question ${i + 1} has an invalid correct answer`);
  });
}

exports.createAssessment = asyncHandler(async (req, res) => {
  const { title, skillName, category, level, description, questions, passingScore, timeLimitMinutes, maxAttempts } = req.body;
  validateQuestions(questions);
  const a = await Assessment.create({
    title, skillName, category, level, description, questions, passingScore, timeLimitMinutes, maxAttempts,
    createdBy: req.user._id, status: isStaff(req.user) ? 'published' : 'pending_review',
  });
  res.status(201).json({ assessment: a });
});

exports.updateAssessment = asyncHandler(async (req, res) => {
  const a = await Assessment.findById(req.params.id);
  if (!a) throw new AppError('Assessment not found', 404);
  if (String(a.createdBy) !== String(req.user._id) && !isStaff(req.user)) throw new AppError('Not allowed', 403);
  if (req.body.questions) validateQuestions(req.body.questions);
  ['title', 'skillName', 'category', 'level', 'description', 'questions', 'passingScore', 'timeLimitMinutes', 'maxAttempts'].forEach((k) => { if (req.body[k] !== undefined) a[k] = req.body[k]; });
  if (req.body.status) {
    if (['published', 'archived'].includes(req.body.status) && !isStaff(req.user) && req.body.status === 'published') throw new AppError('Only moderators can publish', 403);
    a.status = req.body.status;
  } else if (!isStaff(req.user)) a.status = 'pending_review';
  await a.save();
  res.json({ assessment: a });
});

exports.startAttempt = asyncHandler(async (req, res) => {
  const a = await Assessment.findById(req.params.id);
  if (!a || a.status !== 'published') throw new AppError('Assessment not available', 404);
  if (String(a.createdBy) === String(req.user._id)) throw new AppError('You cannot take your own assessment');
  const used = await Attempt.countDocuments({ assessment: a._id, user: req.user._id, submittedAt: { $exists: true } });
  if (used >= a.maxAttempts) throw new AppError(`You have used all ${a.maxAttempts} attempts`);
  let attempt = await Attempt.findOne({ assessment: a._id, user: req.user._id, submittedAt: { $exists: false } });
  if (!attempt) attempt = await Attempt.create({ assessment: a._id, user: req.user._id, startedAt: new Date() });
  res.status(201).json({ attempt, assessment: stripAnswers(a), attemptsLeft: a.maxAttempts - used });
});

exports.submitAttempt = asyncHandler(async (req, res) => {
  const attempt = await Attempt.findOne({ _id: req.params.attemptId, user: req.user._id });
  if (!attempt) throw new AppError('Attempt not found', 404);
  if (attempt.submittedAt) throw new AppError('This attempt was already submitted');
  const a = await Assessment.findById(attempt.assessment);
  const answers = Array.isArray(req.body.answers) ? req.body.answers.map((x) => (x === null || x === undefined ? -1 : Number(x))) : [];
  const elapsedMin = (Date.now() - attempt.startedAt.getTime()) / 60000;
  const late = a.timeLimitMinutes && elapsedMin > a.timeLimitMinutes + 1;
  const total = a.questions.reduce((s, q) => s + q.points, 0);
  const earned = late ? 0 : a.questions.reduce((s, q, i) => s + (answers[i] === q.correctIndex ? q.points : 0), 0);
  attempt.answers = answers;
  attempt.score = Math.round((earned / total) * 100);
  attempt.passed = attempt.score >= a.passingScore;
  attempt.submittedAt = new Date();
  await attempt.save();

  let certificate = null;
  if (attempt.passed) {
    certificate = await Certificate.findOne({ user: req.user._id, assessment: a._id, revoked: false });
    if (!certificate) {
      certificate = await Certificate.create({ user: req.user._id, assessment: a._id, skillName: a.skillName, level: a.level, score: attempt.score, code: crypto.randomBytes(6).toString('hex').toUpperCase() });
      const user = await User.findById(req.user._id);
      await awardBadge(user, 'certified');
      await addPoints(user, POINTS.ASSESSMENT_PASSED);
      await notify(req.user._id, { type: 'system', title: `Certificate earned: ${a.skillName}`, body: `Verification code ${certificate.code}`, link: '/learn' });
    }
  }
  res.json({
    attempt, certificate, late,
    review: a.questions.map((q, i) => ({ prompt: q.prompt, options: q.options, yourAnswer: answers[i], correctIndex: q.correctIndex, correct: answers[i] === q.correctIndex, explanation: q.explanation })),
  });
});

exports.myAttempts = asyncHandler(async (req, res) => {
  const items = await Attempt.find({ user: req.user._id, submittedAt: { $exists: true } }).populate('assessment', 'title skillName level').sort('-submittedAt');
  res.json({ items });
});

// ---------- Certificates ----------
exports.myCertificates = asyncHandler(async (req, res) => {
  res.json({ items: await Certificate.find({ user: req.user._id }).sort('-issuedAt') });
});

exports.verifyCertificate = asyncHandler(async (req, res) => {
  const c = await Certificate.findOne({ code: String(req.params.code).toUpperCase() }).populate('user', 'name');
  if (!c) throw new AppError('No certificate found with this code', 404);
  res.json({ valid: !c.revoked, certificate: { holder: c.user && c.user.name, skillName: c.skillName, level: c.level, score: c.score, issuedAt: c.issuedAt, code: c.code, revoked: c.revoked } });
});

// ---------- Goals & progress ----------
exports.listGoals = asyncHandler(async (req, res) => {
  res.json({ items: await Goal.find({ user: req.user._id }).sort('-createdAt') });
});

exports.createGoal = asyncHandler(async (req, res) => {
  const { skillName, targetLevel, targetDate, milestones = [], notes } = req.body;
  const goal = await Goal.create({ user: req.user._id, skillName, targetLevel, targetDate, notes, milestones: milestones.filter(Boolean).map((m) => (typeof m === 'string' ? { title: m } : m)) });
  res.status(201).json({ goal });
});

async function ownGoal(req) {
  const goal = await Goal.findOne({ _id: req.params.id, user: req.user._id });
  if (!goal) throw new AppError('Goal not found', 404);
  return goal;
}

exports.updateGoal = asyncHandler(async (req, res) => {
  const goal = await ownGoal(req);
  ['skillName', 'targetLevel', 'targetDate', 'notes', 'status'].forEach((k) => { if (req.body[k] !== undefined) goal[k] = req.body[k]; });
  if (req.body.addMilestone) goal.milestones.push({ title: req.body.addMilestone });
  if (req.body.toggleMilestone) {
    const m = goal.milestones.id(req.body.toggleMilestone);
    if (!m) throw new AppError('Milestone not found', 404);
    m.done = !m.done; m.doneAt = m.done ? new Date() : undefined;
  }
  if (req.body.logHours) goal.hoursLogged += Math.max(0, Number(req.body.logHours));
  if (goal.milestones.length && goal.milestones.every((m) => m.done) && goal.status === 'active') goal.status = 'completed';
  await goal.save();
  res.json({ goal });
});

exports.deleteGoal = asyncHandler(async (req, res) => {
  const goal = await ownGoal(req);
  await goal.deleteOne();
  res.json({ ok: true });
});
