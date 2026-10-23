/**
 * AI Learning Assistant + recommendation engine.
 * - Recommendations are computed with a transparent content-based scoring model (works offline).
 * - The chat assistant and learning-path generator use the Anthropic Messages API when
 *   ANTHROPIC_API_KEY is set, and fall back to a deterministic rule-based assistant otherwise.
 */
const { Skill, User, Assessment } = require('../models');

const tokenize = (s = '') => String(s).toLowerCase().split(/[^a-z0-9+#]+/).filter((w) => w.length > 1);
const overlap = (a, b) => { const B = new Set(b); return a.filter((w) => B.has(w)).length; };

async function recommendSkills(user, limit = 10) {
  const wanted = (user.skillsWanted || []);
  const wantedTokens = wanted.flatMap((w) => tokenize(w.name));
  const wantedCats = new Set(wanted.map((w) => w.category).filter(Boolean));
  const interestTokens = (user.interests || []).flatMap(tokenize);
  const mySkills = await Skill.find({ owner: user._id, status: 'active' }).select('title tags');
  const myOfferTokens = mySkills.flatMap((s) => [...tokenize(s.title), ...s.tags]);

  const candidates = await Skill.find({ owner: { $ne: user._id }, status: 'active' })
    .populate('owner', 'name avatar skillsWanted stats level status').limit(500);

  const scored = candidates.filter((s) => s.owner && s.owner.status === 'active').map((s) => {
    const reasons = [];
    let score = 0;
    const sTokens = [...tokenize(s.title), ...s.tags, ...tokenize(s.category)];
    const m = overlap(wantedTokens, sTokens);
    if (m) { score += 40 + 10 * (m - 1); reasons.push('Matches a skill you want to learn'); }
    if (wantedCats.has(s.category)) { score += 15; reasons.push(`In your wanted category: ${s.category}`); }
    const im = overlap(interestTokens, sTokens);
    if (im) { score += 8 * im; reasons.push('Related to your interests'); }
    const ownerWants = (s.owner.skillsWanted || []).flatMap((w) => tokenize(w.name));
    if (s.acceptsSwap && overlap(ownerWants, myOfferTokens)) { score += 25; reasons.push('Swap match: they want a skill you teach'); }
    if (s.verification && s.verification.status === 'verified') { score += 10; reasons.push('Verified skill'); }
    score += (s.rating || 0) * 4 + Math.min(s.sessionsCompleted, 20);
    if (s.creditsPerHour > user.credits && !s.acceptsSwap) score -= 15;
    return { skill: s, score: Math.round(score), reasons };
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

async function recommendPeople(user, limit = 8) {
  const mySkills = await Skill.find({ owner: user._id, status: 'active' }).select('title tags');
  const myOfferTokens = mySkills.flatMap((s) => [...tokenize(s.title), ...s.tags]);
  const wantedTokens = (user.skillsWanted || []).flatMap((w) => tokenize(w.name));
  const others = await User.find({ _id: { $ne: user._id }, status: 'active' }).select('name avatar headline skillsWanted stats level').limit(500);
  const otherSkills = await Skill.find({ owner: { $in: others.map((o) => o._id) }, status: 'active' }).select('owner title tags');
  const byOwner = {};
  otherSkills.forEach((s) => { (byOwner[s.owner] = byOwner[s.owner] || []).push(s); });
  return others.map((o) => {
    const theyOffer = (byOwner[o._id] || []).flatMap((s) => [...tokenize(s.title), ...s.tags]);
    const theyWant = (o.skillsWanted || []).flatMap((w) => tokenize(w.name));
    const canTeachMe = overlap(wantedTokens, theyOffer);
    const iCanTeach = overlap(theyWant, myOfferTokens);
    const score = canTeachMe * 30 + iCanTeach * 30 + (canTeachMe && iCanTeach ? 40 : 0) + (o.rating || 0) * 2;
    return { user: o, score, mutual: !!(canTeachMe && iCanTeach), canTeachMe: !!canTeachMe, iCanTeach: !!iCanTeach };
  }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
}

async function callClaude(system, messages, maxTokens = 1000) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6', max_tokens: maxTokens, system, messages }),
  });
  if (!res.ok) throw new Error(`AI provider error ${res.status}`);
  const data = await res.json();
  return data.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
}

const LEVEL_STEPS = {
  beginner: ['Learn the core vocabulary and fundamentals', 'Follow a structured beginner tutorial end to end', 'Complete 3 small guided exercises'],
  intermediate: ['Build a small real project on your own', 'Get feedback on your work from a mentor session', 'Study common patterns and mistakes'],
  advanced: ['Tackle a complex project with real constraints', 'Teach a beginner session to consolidate knowledge', 'Take the certification assessment'],
};

function fallbackPath(skillName, currentLevel = 'beginner') {
  const order = ['beginner', 'intermediate', 'advanced'];
  const start = Math.max(0, order.indexOf(currentLevel));
  const steps = order.slice(start).flatMap((lvl) => LEVEL_STEPS[lvl].map((t) => ({ stage: lvl, title: `${t} (${skillName})` })));
  return { skillName, source: 'rule-based', steps, weeklyHours: 4, estimatedWeeks: steps.length * 1.5 };
}

async function learningPath(user, skillName, currentLevel) {
  const mentors = await Skill.find({ status: 'active', owner: { $ne: user._id }, $or: [{ title: { $regex: skillName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }, { tags: skillName.toLowerCase() }] })
    .populate('owner', 'name avatar').limit(5);
  const assessments = await Assessment.find({ status: 'published', skillName: { $regex: skillName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }).select('title level').limit(5);
  let plan = fallbackPath(skillName, currentLevel);
  try {
    const text = await callClaude(
      'You design concise learning paths. Respond ONLY with JSON: {"steps":[{"stage":"beginner|intermediate|advanced","title":"..."}],"weeklyHours":number,"estimatedWeeks":number}. 6-9 steps.',
      [{ role: 'user', content: `Skill: ${skillName}. Current level: ${currentLevel || 'beginner'}. Learner interests: ${(user.interests || []).join(', ') || 'n/a'}.` }],
    );
    if (text) {
      const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
      if (Array.isArray(parsed.steps)) plan = { skillName, source: 'ai', ...parsed };
    }
  } catch (e) { /* keep fallback */ }
  return { ...plan, mentors, assessments };
}

function ruleBasedReply(message, ctx) {
  const m = message.toLowerCase();
  if (/credit|wallet|balance/.test(m)) return `You have ${ctx.credits} credits available. You earn credits by teaching sessions (1 credit per hour at the listed rate), and spend them when you learn. Swaps let you trade skills without spending credits.`;
  if (/recommend|suggest|what should i learn|match/.test(m)) {
    return ctx.recs.length ? `Based on your profile, here are good matches:\n${ctx.recs.map((r) => `• ${r.skill.title} with ${r.skill.owner.name} — ${r.reasons[0] || 'popular in the community'}`).join('\n')}` : 'Add a few skills you want to learn on your profile and I can recommend mentors for you.';
  }
  if (/badge|level|points|xp/.test(m)) return `You're level ${ctx.level} with ${ctx.points} points. Teaching sessions (+50), learning (+20), reviewing (+10), and helpful forum answers (+25) earn the most.`;
  if (/certif|assessment|test|quiz/.test(m)) return 'Open the Learn tab to take skill assessments. Passing one issues a certificate with a public verification code you can share.';
  if (/how.*(learn|start|improve)|path|roadmap|plan/.test(m)) return 'Try the learning path generator in the Assistant: enter a skill and your level, and I will lay out stages, suggested mentors, and assessments. Setting a goal with milestones lets you track progress.';
  if (/session|book|schedule/.test(m)) return 'To book a session: open a skill in the Marketplace, send an exchange request, and once the mentor accepts you can schedule sessions from the exchange page. Credits are held in escrow until the session is confirmed complete.';
  return "I'm your learning assistant. Ask me for skill recommendations, a learning roadmap, how credits work, or tips on booking sessions.";
}

async function chat(user, message, history = []) {
  const recs = await recommendSkills(user, 3);
  const ctx = { credits: user.credits, level: user.level, points: user.points, recs };
  const system = `You are the learning assistant for a community skill-exchange platform where members teach and learn from each other using time-based credits or direct skill swaps. Be concise, warm, practical.
Member: ${user.name}. Level ${user.level}, ${user.points} points, ${user.credits} credits.
Wants to learn: ${(user.skillsWanted || []).map((w) => w.name).join(', ') || 'not set'}.
Top platform matches: ${recs.map((r) => `${r.skill.title} by ${r.skill.owner.name}`).join('; ') || 'none yet'}.`;
  try {
    const msgs = [...history.slice(-10).map((h) => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: String(h.content).slice(0, 4000) })), { role: 'user', content: message }];
    const text = await callClaude(system, msgs);
    if (text) return { reply: text, source: 'ai' };
  } catch (e) { /* fall back */ }
  return { reply: ruleBasedReply(message, ctx), source: 'rule-based' };
}

module.exports = { recommendSkills, recommendPeople, learningPath, chat, tokenize };
