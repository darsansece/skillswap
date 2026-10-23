const { User } = require('../models');
const { LEVEL_THRESHOLDS, BADGES } = require('../config/constants');
const { notify } = require('./notify');

const levelFor = (points) => {
  let level = 1;
  LEVEL_THRESHOLDS.forEach((t, i) => { if (points >= t) level = i + 1; });
  return level;
};

const BADGE_RULES = {
  first_steps: (u) => u.stats.sessionsTaught + u.stats.sessionsLearned >= 1,
  mentor: (u) => u.stats.sessionsTaught >= 5,
  master_mentor: (u) => u.stats.sessionsTaught >= 25,
  eager_learner: (u) => u.stats.sessionsLearned >= 5,
  helpful: (u) => u.stats.acceptedAnswers >= 1,
  streak_7: (u) => u.loginStreak >= 7,
  top_rated: (u) => u.stats.ratingCount >= 5 && u.stats.ratingSum / u.stats.ratingCount >= 4.5,
  community: (u) => u.stats.forumPosts >= 10,
};

async function awardBadge(user, key) {
  if (user.badges.some((b) => b.key === key)) return false;
  const def = BADGES.find((b) => b.key === key);
  if (!def) return false;
  user.badges.push({ key });
  await notify(user._id, { type: 'badge', title: `Badge earned: ${def.icon} ${def.name}`, body: def.description, link: '/rewards' });
  return true;
}

async function evaluateBadges(user) {
  let changed = false;
  for (const [key, rule] of Object.entries(BADGE_RULES)) {
    if (rule(user) && await awardBadge(user, key)) changed = true;
  }
  return changed;
}

/** Add points, update level and badges. Accepts a user doc or id. */
async function addPoints(userOrId, amount, statUpdates = {}) {
  const user = userOrId.save ? userOrId : await User.findById(userOrId);
  if (!user) return null;
  user.points += amount;
  Object.entries(statUpdates).forEach(([k, v]) => { user.stats[k] = (user.stats[k] || 0) + v; });
  const newLevel = levelFor(user.points);
  if (newLevel > user.level) {
    user.level = newLevel;
    await notify(user._id, { type: 'system', title: `Level up! You're now level ${newLevel}`, link: '/rewards' });
  }
  await evaluateBadges(user);
  await user.save();
  return user;
}

/** Track daily login streak and award daily points. */
async function recordLogin(user) {
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const last = user.lastLoginDate ? new Date(user.lastLoginDate) : null;
  if (last) last.setUTCHours(0, 0, 0, 0);
  if (last && last.getTime() === today.getTime()) return { awarded: 0 };
  const yesterday = new Date(today.getTime() - 86400000);
  user.loginStreak = last && last.getTime() === yesterday.getTime() ? user.loginStreak + 1 : 1;
  user.lastLoginDate = new Date();
  const pts = require('../config/constants').DAILY_LOGIN_POINTS;
  await addPoints(user, pts);
  return { awarded: pts, streak: user.loginStreak };
}

module.exports = { levelFor, addPoints, awardBadge, evaluateBadges, recordLogin, BADGE_RULES };
