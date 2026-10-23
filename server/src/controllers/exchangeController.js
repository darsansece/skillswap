const { Exchange, Skill, User, Review } = require('../models');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { paginate } = require('../utils/paginate');
const credits = require('../services/credits');
const { addPoints } = require('../services/gamification');
const { notify, emitToUser } = require('../services/notify');
const { getOrCreateConversation } = require('./chatController');
const { POINTS } = require('../config/constants');

const POP = [
  { path: 'requester', select: 'name avatar level stats' },
  { path: 'provider', select: 'name avatar level stats' },
  { path: 'skill', select: 'title category creditsPerHour mode' },
  { path: 'offeredSkill', select: 'title category' },
];

const isParty = (ex, userId) => [String(ex.requester._id || ex.requester), String(ex.provider._id || ex.provider)].includes(String(userId));
const otherParty = (ex, userId) => (String(ex.requester._id || ex.requester) === String(userId) ? (ex.provider._id || ex.provider) : (ex.requester._id || ex.requester));

async function loadExchange(id, user, { allowAdmin = true } = {}) {
  const ex = await Exchange.findById(id);
  if (!ex) throw new AppError('Exchange not found', 404);
  if (!isParty(ex, user._id) && !(allowAdmin && ['admin', 'moderator'].includes(user.role))) throw new AppError('You are not part of this exchange', 403);
  return ex;
}

exports.create = asyncHandler(async (req, res) => {
  const { skillId, type = 'credit', offeredSkillId, hoursRequested = 1, message } = req.body;
  const skill = await Skill.findById(skillId).populate('owner', 'status name');
  if (!skill || skill.status !== 'active') throw new AppError('This skill is not available', 404);
  if (String(skill.owner._id) === String(req.user._id)) throw new AppError('You cannot request your own skill');
  if (skill.owner.status !== 'active') throw new AppError('This mentor is not currently available');
  let offeredSkill;
  if (type === 'swap') {
    if (!skill.acceptsSwap) throw new AppError('This mentor does not accept skill swaps');
    offeredSkill = await Skill.findOne({ _id: offeredSkillId, owner: req.user._id, status: 'active' });
    if (!offeredSkill) throw new AppError('Choose one of your own active skills to offer in the swap');
  } else {
    const needed = Math.ceil(hoursRequested * skill.creditsPerHour);
    if (req.user.credits < needed) throw new AppError(`You need ${needed} credits for this request (you have ${req.user.credits})`);
  }
  const dup = await Exchange.findOne({ requester: req.user._id, skill: skill._id, status: { $in: ['pending', 'accepted'] } });
  if (dup) throw new AppError('You already have an open request for this skill', 409);

  const ex = await Exchange.create({
    requester: req.user._id, provider: skill.owner._id, skill: skill._id, type,
    offeredSkill: offeredSkill && offeredSkill._id, hoursRequested, message,
  });
  await notify(skill.owner._id, { type: 'exchange', title: `New ${type === 'swap' ? 'swap' : 'learning'} request from ${req.user.name}`, body: `For "${skill.title}"`, link: `/exchanges/${ex._id}` });
  res.status(201).json({ exchange: await ex.populate(POP) });
});

exports.list = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const { role, status } = req.query;
  const me = req.user._id;
  const filter = role === 'learner' ? { requester: me } : role === 'mentor' ? { provider: me } : { $or: [{ requester: me }, { provider: me }] };
  if (status) filter.status = status;
  const [items, total] = await Promise.all([
    Exchange.find(filter).populate(POP).sort('-updatedAt').skip(skip).limit(limit),
    Exchange.countDocuments(filter),
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
});

exports.get = asyncHandler(async (req, res) => {
  const ex = await loadExchange(req.params.id, req.user);
  await ex.populate([...POP, { path: 'resources.addedBy', select: 'name' }]);
  res.json({ exchange: ex });
});

exports.respond = asyncHandler(async (req, res) => {
  const ex = await loadExchange(req.params.id, req.user, { allowAdmin: false });
  if (String(ex.provider) !== String(req.user._id)) throw new AppError('Only the mentor can respond to this request', 403);
  if (ex.status !== 'pending') throw new AppError(`Request is already ${ex.status}`);
  const { action, note } = req.body;
  if (!['accept', 'decline'].includes(action)) throw new AppError('Action must be accept or decline');
  if (action === 'accept') {
    if (ex.type === 'credit') {
      const skill = await Skill.findById(ex.skill);
      const amount = Math.ceil(ex.hoursRequested * skill.creditsPerHour);
      await credits.hold(ex.requester, amount, ex._id);
      ex.escrowCredits = amount;
    }
    ex.status = 'accepted';
    await getOrCreateConversation([ex.requester, ex.provider], ex._id);
  } else {
    ex.status = 'declined';
  }
  ex.responseNote = note;
  await ex.save();
  await notify(ex.requester, { type: 'exchange', title: `${req.user.name} ${ex.status} your request`, body: note, link: `/exchanges/${ex._id}` });
  res.json({ exchange: await ex.populate(POP) });
});

exports.cancel = asyncHandler(async (req, res) => {
  const ex = await loadExchange(req.params.id, req.user, { allowAdmin: false });
  if (!['pending', 'accepted'].includes(ex.status)) throw new AppError(`Cannot cancel a ${ex.status} exchange`);
  if (ex.escrowCredits > 0) { await credits.refund(ex.requester, ex.escrowCredits, ex._id); ex.escrowCredits = 0; }
  ex.sessions.forEach((s) => { if (s.status === 'scheduled') s.status = 'cancelled'; });
  ex.status = 'cancelled';
  ex.responseNote = req.body.reason;
  await ex.save();
  await notify(otherParty(ex, req.user._id), { type: 'exchange', title: `${req.user.name} cancelled an exchange`, body: req.body.reason, link: `/exchanges/${ex._id}` });
  res.json({ exchange: await ex.populate(POP) });
});

async function hasConflict(userIds, start, end, excludeSessionId) {
  const exchanges = await Exchange.find({ status: 'accepted', $or: [{ requester: { $in: userIds } }, { provider: { $in: userIds } }] });
  return exchanges.some((e) => e.sessions.some((s) => {
    if (s.status !== 'scheduled' || String(s._id) === String(excludeSessionId)) return false;
    const sStart = new Date(s.startTime).getTime();
    const sEnd = sStart + s.durationMinutes * 60000;
    return start < sEnd && end > sStart;
  }));
}

exports.scheduleSession = asyncHandler(async (req, res) => {
  const ex = await loadExchange(req.params.id, req.user, { allowAdmin: false });
  if (ex.status !== 'accepted') throw new AppError('Sessions can only be scheduled on accepted exchanges');
  const { startTime, durationMinutes = 60, meetingLink, location, agenda, teacher } = req.body;
  const start = new Date(startTime);
  if (Number.isNaN(start.getTime()) || start < new Date()) throw new AppError('Choose a start time in the future');
  const end = start.getTime() + durationMinutes * 60000;
  if (await hasConflict([ex.requester, ex.provider], start.getTime(), end)) throw new AppError('This time overlaps another scheduled session for one of you', 409);
  const plannedMinutes = ex.sessions.filter((s) => s.status !== 'cancelled').reduce((a, s) => a + s.durationMinutes, 0);
  if (ex.type === 'credit' && plannedMinutes + durationMinutes > ex.hoursRequested * 60) {
    throw new AppError(`This exchange covers ${ex.hoursRequested}h; ${Math.max(0, ex.hoursRequested * 60 - plannedMinutes)} minutes remain`);
  }
  let teacherId = ex.provider;
  if (ex.type === 'swap' && teacher && isParty(ex, teacher)) teacherId = teacher;
  ex.sessions.push({ startTime: start, durationMinutes, meetingLink, location, agenda, teacher: teacherId });
  await ex.save();
  const session = ex.sessions[ex.sessions.length - 1];
  await notify(otherParty(ex, req.user._id), { type: 'session', title: 'New session scheduled', body: `${start.toUTCString()} (${durationMinutes} min)`, link: `/exchanges/${ex._id}` });
  res.status(201).json({ session, exchange: await ex.populate(POP) });
});

exports.updateSession = asyncHandler(async (req, res) => {
  const ex = await loadExchange(req.params.id, req.user, { allowAdmin: false });
  const s = ex.sessions.id(req.params.sessionId);
  if (!s) throw new AppError('Session not found', 404);
  if (s.status !== 'scheduled') throw new AppError(`Session is already ${s.status}`);
  if (req.body.status === 'cancelled') {
    s.status = 'cancelled';
  } else {
    if (req.body.startTime) {
      const start = new Date(req.body.startTime);
      if (Number.isNaN(start.getTime()) || start < new Date()) throw new AppError('Choose a start time in the future');
      const dur = req.body.durationMinutes || s.durationMinutes;
      if (await hasConflict([ex.requester, ex.provider], start.getTime(), start.getTime() + dur * 60000, s._id)) throw new AppError('This time overlaps another scheduled session', 409);
      s.startTime = start;
    }
    ['durationMinutes', 'meetingLink', 'location', 'agenda'].forEach((k) => { if (req.body[k] !== undefined) s[k] = req.body[k]; });
  }
  await ex.save();
  await notify(otherParty(ex, req.user._id), { type: 'session', title: req.body.status === 'cancelled' ? 'A session was cancelled' : 'A session was updated', link: `/exchanges/${ex._id}` });
  res.json({ exchange: await ex.populate(POP) });
});

/** Both participants confirm; on second confirmation credits are released and stats awarded. */
exports.confirmSession = asyncHandler(async (req, res) => {
  const ex = await loadExchange(req.params.id, req.user, { allowAdmin: false });
  if (ex.status !== 'accepted') throw new AppError('Exchange is not active');
  const s = ex.sessions.id(req.params.sessionId);
  if (!s) throw new AppError('Session not found', 404);
  if (s.status !== 'scheduled') throw new AppError(`Session is already ${s.status}`);
  if (new Date(s.startTime) > new Date()) throw new AppError('You can confirm a session once it has started');
  if (s.confirmedBy.some((u) => String(u) === String(req.user._id))) throw new AppError('You already confirmed this session');
  s.confirmedBy.push(req.user._id);

  if (s.confirmedBy.length >= 2) {
    s.status = 'completed';
    s.completedAt = new Date();
    const hours = s.durationMinutes / 60;
    const teacherId = s.teacher || ex.provider;
    const learnerId = String(teacherId) === String(ex.provider) ? ex.requester : ex.provider;
    if (ex.type === 'credit') {
      const skill = await Skill.findById(ex.skill);
      const charge = Math.min(ex.escrowCredits, Math.ceil(hours * skill.creditsPerHour));
      if (charge > 0) await credits.release(ex.requester, ex.provider, charge, ex._id, `Taught "${skill.title}" (${s.durationMinutes} min)`);
      ex.escrowCredits -= charge;
      s.creditsCharged = charge;
    }
    await Skill.updateOne({ _id: ex.skill }, { $inc: { sessionsCompleted: 1 } });
    await addPoints(teacherId, POINTS.SESSION_TAUGHT, { sessionsTaught: 1, hoursTaught: hours });
    await addPoints(learnerId, POINTS.SESSION_LEARNED, { sessionsLearned: 1, hoursLearned: hours });
    [ex.requester, ex.provider].forEach((u) => notify(u, { type: 'session', title: 'Session completed', body: 'Leave a review to help the community', link: `/exchanges/${ex._id}` }));
  } else {
    await notify(otherParty(ex, req.user._id), { type: 'session', title: `${req.user.name} confirmed the session took place`, body: 'Confirm it too to complete it', link: `/exchanges/${ex._id}` });
  }
  await ex.save();
  res.json({ exchange: await ex.populate(POP) });
});

exports.complete = asyncHandler(async (req, res) => {
  const ex = await loadExchange(req.params.id, req.user, { allowAdmin: false });
  if (ex.status !== 'accepted') throw new AppError('Only active exchanges can be completed');
  if (ex.sessions.some((s) => s.status === 'scheduled')) throw new AppError('Confirm or cancel all scheduled sessions first');
  if (!ex.sessions.some((s) => s.status === 'completed')) throw new AppError('At least one session must be completed');
  if (ex.escrowCredits > 0) { await credits.refund(ex.requester, ex.escrowCredits, ex._id); ex.escrowCredits = 0; }
  ex.status = 'completed';
  await ex.save();
  await notify(otherParty(ex, req.user._id), { type: 'exchange', title: 'Exchange marked complete', link: `/exchanges/${ex._id}` });
  res.json({ exchange: await ex.populate(POP) });
});

exports.review = asyncHandler(async (req, res) => {
  const ex = await loadExchange(req.params.id, req.user, { allowAdmin: false });
  if (!ex.sessions.some((s) => s.status === 'completed')) throw new AppError('You can review after a session is completed');
  if (ex.reviewedBy.some((u) => String(u) === String(req.user._id))) throw new AppError('You already reviewed this exchange', 409);
  const rating = Number(req.body.rating);
  if (!(rating >= 1 && rating <= 5)) throw new AppError('Rating must be between 1 and 5');
  const reviewee = otherParty(ex, req.user._id);
  const reviewingMentor = String(reviewee) === String(ex.provider);
  const review = await Review.create({ exchange: ex._id, reviewer: req.user._id, reviewee, skill: reviewingMentor ? ex.skill : ex.offeredSkill, rating, comment: req.body.comment });
  await User.updateOne({ _id: reviewee }, { $inc: { 'stats.ratingSum': rating, 'stats.ratingCount': 1 } });
  if (review.skill) await Skill.updateOne({ _id: review.skill }, { $inc: { ratingSum: rating, ratingCount: 1 } });
  ex.reviewedBy.push(req.user._id);
  await ex.save();
  await addPoints(req.user._id, POINTS.REVIEW_GIVEN);
  await addPoints(reviewee, 0); // re-evaluate badges such as top_rated
  await notify(reviewee, { type: 'exchange', title: `${req.user.name} left you a ${rating}★ review`, body: req.body.comment, link: `/users/${reviewee}` });
  res.status(201).json({ review });
});

exports.updateNotes = asyncHandler(async (req, res) => {
  const ex = await loadExchange(req.params.id, req.user, { allowAdmin: false });
  ex.sharedNotes = String(req.body.notes || '').slice(0, 20000);
  await ex.save();
  emitToUser(otherParty(ex, req.user._id), 'notes:update', { exchangeId: ex._id, notes: ex.sharedNotes, by: req.user._id });
  res.json({ notes: ex.sharedNotes });
});

exports.addResource = asyncHandler(async (req, res) => {
  const ex = await loadExchange(req.params.id, req.user, { allowAdmin: false });
  if (!req.body.title || !req.body.url) throw new AppError('Title and URL are required');
  ex.resources.push({ title: req.body.title, url: req.body.url, addedBy: req.user._id });
  await ex.save();
  res.status(201).json({ resources: ex.resources });
});

exports.upcoming = asyncHandler(async (req, res) => {
  const me = req.user._id;
  const exchanges = await Exchange.find({ status: 'accepted', $or: [{ requester: me }, { provider: me }] }).populate(POP);
  const now = Date.now() - 3 * 3600000;
  const sessions = exchanges.flatMap((ex) => ex.sessions
    .filter((s) => s.status === 'scheduled' && new Date(s.startTime).getTime() > now)
    .map((s) => ({ ...s.toObject(), exchangeId: ex._id, skill: ex.skill, with: String(ex.requester._id) === String(me) ? ex.provider : ex.requester })))
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
  res.json({ items: sessions });
});
