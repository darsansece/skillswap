const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const ai = require('../services/ai');

exports.recommendations = asyncHandler(async (req, res) => {
  const [skills, people] = await Promise.all([ai.recommendSkills(req.user, 10), ai.recommendPeople(req.user, 8)]);
  res.json({ skills, people });
});

exports.chat = asyncHandler(async (req, res) => {
  const message = String(req.body.message || '').trim();
  if (!message) throw new AppError('Message is required');
  if (message.length > 2000) throw new AppError('Message is too long');
  res.json(await ai.chat(req.user, message, Array.isArray(req.body.history) ? req.body.history : []));
});

exports.learningPath = asyncHandler(async (req, res) => {
  const skillName = String(req.body.skillName || '').trim();
  if (!skillName) throw new AppError('Skill name is required');
  res.json({ path: await ai.learningPath(req.user, skillName, req.body.currentLevel) });
});
