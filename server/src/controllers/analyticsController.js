const { User, Skill, Exchange, Review, CreditTransaction, Post, Report, Certificate, Attempt, Goal } = require('../models');
const asyncHandler = require('../utils/asyncHandler');

const dayKey = (d) => new Date(d).toISOString().slice(0, 10);
function bucket(docs, days, field = 'createdAt', valueFn = () => 1) {
  const map = {};
  for (let i = days - 1; i >= 0; i -= 1) map[dayKey(Date.now() - i * 86400000)] = 0;
  docs.forEach((d) => { const k = dayKey(d[field]); if (k in map) map[k] += valueFn(d); });
  return Object.entries(map).map(([date, value]) => ({ date, value }));
}

/** Personal dashboard for the logged-in member. */
exports.me = asyncHandler(async (req, res) => {
  const me = req.user._id;
  const days = Math.min(90, Number(req.query.days) || 30);
  const since = new Date(Date.now() - days * 86400000);
  const [user, exchanges, txs, certs, goals, attempts, reviews, skills] = await Promise.all([
    User.findById(me),
    Exchange.find({ $or: [{ requester: me }, { provider: me }] }).populate('skill', 'title category'),
    CreditTransaction.find({ user: me, createdAt: { $gte: since } }),
    Certificate.countDocuments({ user: me, revoked: false }),
    Goal.find({ user: me }),
    Attempt.find({ user: me, submittedAt: { $exists: true } }).select('score passed'),
    Review.find({ reviewee: me }).select('rating'),
    Skill.find({ owner: me, status: { $ne: 'removed' } }).select('title views sessionsCompleted ratingSum ratingCount'),
  ]);
  const statusCounts = {};
  exchanges.forEach((e) => { statusCounts[e.status] = (statusCounts[e.status] || 0) + 1; });
  const completedSessions = exchanges.flatMap((e) => e.sessions.filter((s) => s.status === 'completed').map((s) => ({ ...s.toObject(), asTeacher: String(s.teacher || e.provider) === String(me), category: e.skill && e.skill.category })));
  const hoursByCategory = {};
  completedSessions.filter((s) => !s.asTeacher).forEach((s) => { hoursByCategory[s.category || 'Other'] = (hoursByCategory[s.category || 'Other'] || 0) + s.durationMinutes / 60; });
  const ratingDist = [1, 2, 3, 4, 5].map((r) => ({ rating: r, count: reviews.filter((x) => x.rating === r).length }));
  res.json({
    summary: {
      credits: user.credits, heldCredits: user.heldCredits, points: user.points, level: user.level, rating: user.rating,
      sessionsTaught: user.stats.sessionsTaught, sessionsLearned: user.stats.sessionsLearned,
      hoursTaught: user.stats.hoursTaught, hoursLearned: user.stats.hoursLearned,
      certificates: certs, badges: user.badges.length, loginStreak: user.loginStreak,
      activeGoals: goals.filter((g) => g.status === 'active').length,
      avgGoalProgress: goals.length ? Math.round(goals.reduce((a, g) => a + g.progress, 0) / goals.length) : 0,
      assessmentsTaken: attempts.length, assessmentsPassed: attempts.filter((a) => a.passed).length,
    },
    exchangeStatus: statusCounts,
    creditsFlow: {
      earned: bucket(txs.filter((t) => t.amount > 0), days, 'createdAt', (t) => t.amount),
      spent: bucket(txs.filter((t) => t.amount < 0), days, 'createdAt', (t) => -t.amount),
    },
    sessionsOverTime: bucket(completedSessions.filter((s) => s.completedAt), days, 'completedAt'),
    hoursByCategory: Object.entries(hoursByCategory).map(([category, hours]) => ({ category, hours: Math.round(hours * 10) / 10 })),
    ratingDistribution: ratingDist,
    skillPerformance: skills.map((s) => ({ title: s.title, views: s.views, sessions: s.sessionsCompleted, rating: s.rating })),
  });
});

/** Platform-wide analytics for admins/moderators. */
exports.platform = asyncHandler(async (req, res) => {
  const days = Math.min(365, Number(req.query.days) || 30);
  const since = new Date(Date.now() - days * 86400000);
  const [users, newUsers, skills, exchangesAll, recentExchanges, posts, openReports, certs, txs, recentSkills] = await Promise.all([
    User.countDocuments(),
    User.find({ createdAt: { $gte: since } }).select('createdAt'),
    Skill.countDocuments({ status: 'active' }),
    Exchange.find().select('status type sessions skill createdAt').populate('skill', 'title category'),
    Exchange.find({ createdAt: { $gte: since } }).select('createdAt'),
    Post.countDocuments({ status: 'visible' }),
    Report.countDocuments({ status: 'open' }),
    Certificate.countDocuments({ revoked: false }),
    CreditTransaction.find({ type: 'earned_teaching', createdAt: { $gte: since } }).select('amount createdAt'),
    Skill.find({ status: 'active' }).select('category'),
  ]);
  const statusBreakdown = {};
  const typeBreakdown = {};
  const skillDemand = {};
  let completedSessions = 0; let hoursExchanged = 0;
  exchangesAll.forEach((e) => {
    statusBreakdown[e.status] = (statusBreakdown[e.status] || 0) + 1;
    typeBreakdown[e.type] = (typeBreakdown[e.type] || 0) + 1;
    if (e.skill) skillDemand[e.skill.title] = (skillDemand[e.skill.title] || 0) + 1;
    e.sessions.forEach((s) => { if (s.status === 'completed') { completedSessions += 1; hoursExchanged += s.durationMinutes / 60; } });
  });
  const categories = {};
  recentSkills.forEach((s) => { categories[s.category] = (categories[s.category] || 0) + 1; });
  const activeUsers = await User.countDocuments({ lastLoginDate: { $gte: new Date(Date.now() - 7 * 86400000) } });
  res.json({
    totals: { users, activeUsers7d: activeUsers, skills, exchanges: exchangesAll.length, completedSessions, hoursExchanged: Math.round(hoursExchanged * 10) / 10, forumPosts: posts, openReports, certificates: certs },
    signups: bucket(newUsers, days),
    exchangesOverTime: bucket(recentExchanges, days),
    creditsCirculated: bucket(txs, days, 'createdAt', (t) => t.amount),
    statusBreakdown, typeBreakdown,
    categoryDistribution: Object.entries(categories).map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count),
    topSkills: Object.entries(skillDemand).map(([title, requests]) => ({ title, requests })).sort((a, b) => b.requests - a.requests).slice(0, 10),
  });
});

const toCSV = (rows) => {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const esc = (v) => { const s = v === undefined || v === null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n');
};

exports.exportCSV = asyncHandler(async (req, res) => {
  const { type } = req.params;
  let rows = [];
  if (type === 'users') {
    rows = (await User.find().sort('createdAt')).map((u) => ({ id: u._id, name: u.name, email: u.email, role: u.role, status: u.status, credits: u.credits, points: u.points, level: u.level, sessionsTaught: u.stats.sessionsTaught, sessionsLearned: u.stats.sessionsLearned, rating: u.rating, joined: u.createdAt.toISOString() }));
  } else if (type === 'exchanges') {
    rows = (await Exchange.find().populate('requester provider', 'name').populate('skill', 'title').sort('createdAt')).map((e) => ({ id: e._id, skill: e.skill && e.skill.title, learner: e.requester && e.requester.name, mentor: e.provider && e.provider.name, type: e.type, status: e.status, hours: e.hoursRequested, sessionsCompleted: e.sessions.filter((s) => s.status === 'completed').length, created: e.createdAt.toISOString() }));
  } else if (type === 'transactions') {
    rows = (await CreditTransaction.find().populate('user', 'name').sort('createdAt')).map((t) => ({ id: t._id, user: t.user && t.user.name, amount: t.amount, type: t.type, description: t.description, balanceAfter: t.balanceAfter, date: t.createdAt.toISOString() }));
  } else {
    return res.status(400).json({ message: 'Export type must be users, exchanges, or transactions' });
  }
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${type}-${dayKey(Date.now())}.csv"`);
  return res.send(toCSV(rows));
});
