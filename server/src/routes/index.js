const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');
const { protect, optionalAuth, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/error');

const auth = require('../controllers/authController');
const users = require('../controllers/userController');
const skills = require('../controllers/skillController');
const ex = require('../controllers/exchangeController');
const chat = require('../controllers/chatController');
const notif = require('../controllers/notificationController');
const ai = require('../controllers/aiController');
const rewards = require('../controllers/rewardController');
const learn = require('../controllers/learningController');
const forum = require('../controllers/forumController');
const admin = require('../controllers/adminController');
const analytics = require('../controllers/analyticsController');
const { CATEGORIES, LEVELS } = require('../config/constants');

const r = express.Router();
const staff = authorize('admin', 'moderator');
const adminOnly = authorize('admin');

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: process.env.NODE_ENV === 'test' ? 10000 : 50, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many attempts, try again later' } });
const aiLimiter = rateLimit({ windowMs: 60 * 1000, max: process.env.NODE_ENV === 'test' ? 10000 : 20, message: { message: 'Too many assistant requests, slow down a little' } });

const password = (f = 'password') => body(f).isLength({ min: 8 }).withMessage('Password must be at least 8 characters').matches(/\d/).withMessage('Password must contain a number');

// ---- 1. Auth ----
r.post('/auth/register', authLimiter, [body('name').trim().isLength({ min: 2, max: 80 }).withMessage('Name must be 2-80 characters'), body('email').isEmail().withMessage('Enter a valid email').normalizeEmail({ gmail_remove_dots: false }), password()], validate, auth.register);
r.post('/auth/login', authLimiter, [body('email').isEmail().withMessage('Enter a valid email').normalizeEmail({ gmail_remove_dots: false }), body('password').notEmpty().withMessage('Password is required')], validate, auth.login);
r.post('/auth/refresh', auth.refresh);
r.post('/auth/logout', protect, auth.logout);
r.get('/auth/me', protect, auth.me);
r.get('/auth/verify-email/:token', auth.verifyEmail);
r.post('/auth/forgot-password', authLimiter, auth.forgotPassword);
r.post('/auth/reset-password/:token', authLimiter, [password()], validate, auth.resetPassword);
r.post('/auth/change-password', protect, [body('currentPassword').notEmpty(), password('newPassword')], validate, auth.changePassword);

// ---- 2. Profiles & portfolio ----
r.get('/users', protect, users.searchUsers);
r.put('/users/me', protect, [body('name').optional().trim().isLength({ min: 2, max: 80 }), body('bio').optional().isLength({ max: 2000 })], validate, users.updateProfile);
r.post('/users/me/portfolio', protect, [body('title').trim().notEmpty().withMessage('Title is required'), body('url').optional({ values: 'falsy' }).isURL().withMessage('Enter a valid URL')], validate, users.addPortfolio);
r.put('/users/me/portfolio/:itemId', protect, users.updatePortfolio);
r.delete('/users/me/portfolio/:itemId', protect, users.deletePortfolio);
r.get('/users/me/bookmarks', protect, users.getBookmarks);
r.post('/users/me/bookmarks/:skillId', protect, users.toggleBookmark);
r.get('/users/:id', optionalAuth, users.getPublicProfile);
r.post('/users/:id/endorse', protect, users.endorse);

// ---- 3. Marketplace ----
const skillRules = [
  body('title').trim().isLength({ min: 3, max: 120 }).withMessage('Title must be 3-120 characters'),
  body('description').trim().isLength({ min: 20 }).withMessage('Description must be at least 20 characters'),
  body('category').isIn(CATEGORIES).withMessage('Choose a valid category'),
  body('level').optional().isIn(LEVELS),
  body('creditsPerHour').optional().isInt({ min: 0, max: 20 }).withMessage('Credits per hour must be 0-20'),
];
r.get('/skills/meta', skills.meta);
r.get('/skills/categories', skills.categoryStats);
r.get('/skills/mine', protect, skills.mine);
r.get('/skills/swap-matches', protect, skills.swapMatches);
r.get('/skills', optionalAuth, skills.list);
r.get('/skills/:id', optionalAuth, skills.get);
r.post('/skills', protect, skillRules, validate, skills.create);
r.put('/skills/:id', protect, skills.update);
r.delete('/skills/:id', protect, skills.remove);
r.post('/skills/:id/verification', protect, skills.requestVerification);

// ---- 4. Exchanges & sessions ----
r.get('/exchanges', protect, ex.list);
r.get('/exchanges/upcoming', protect, ex.upcoming);
r.post('/exchanges', protect, [body('skillId').isMongoId().withMessage('Skill is required'), body('type').optional().isIn(['credit', 'swap']), body('hoursRequested').optional().isFloat({ min: 0.5, max: 40 }).withMessage('Hours must be between 0.5 and 40')], validate, ex.create);
r.get('/exchanges/:id', protect, ex.get);
r.post('/exchanges/:id/respond', protect, ex.respond);
r.post('/exchanges/:id/cancel', protect, ex.cancel);
r.post('/exchanges/:id/complete', protect, ex.complete);
r.post('/exchanges/:id/sessions', protect, [body('startTime').isISO8601().withMessage('Start time is required'), body('durationMinutes').optional().isInt({ min: 15, max: 480 }).withMessage('Duration must be 15-480 minutes')], validate, ex.scheduleSession);
r.put('/exchanges/:id/sessions/:sessionId', protect, ex.updateSession);
r.post('/exchanges/:id/sessions/:sessionId/confirm', protect, ex.confirmSession);
r.post('/exchanges/:id/review', protect, ex.review);
r.put('/exchanges/:id/notes', protect, ex.updateNotes);
r.post('/exchanges/:id/resources', protect, ex.addResource);
r.get('/exchanges/:id/assessments', protect, ex.listAssessments);
r.post('/exchanges/:id/assessments', protect, ex.createAssessment);
r.post('/exchanges/:id/assessments/:assessmentId/submit', protect, ex.submitAssessment);
r.delete('/exchanges/:id/assessments/:assessmentId', protect, ex.deleteAssessment);

// ---- 5. Real-time communication ----
r.get('/conversations', protect, chat.list);
r.post('/conversations', protect, [body('userId').isMongoId()], validate, chat.start);
r.get('/conversations/:id/messages', protect, chat.messages);
r.post('/conversations/:id/messages', protect, [body('text').optional().isLength({ max: 4000 })], validate, chat.send);
r.post('/conversations/:id/read', protect, chat.markRead);
r.get('/notifications', protect, notif.list);
r.post('/notifications/read-all', protect, notif.markAllRead);
r.post('/notifications/:id/read', protect, notif.markRead);
r.delete('/notifications/:id', protect, notif.remove);

const uploadDir = path.join(__dirname, '../../uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({ destination: uploadDir, filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${path.extname(file.originalname).toLowerCase()}`) }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /\.(png|jpe?g|gif|webp|pdf|txt|md|zip)$/i.test(file.originalname)),
});
r.post('/uploads', protect, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Upload a png, jpg, gif, webp, pdf, txt, md or zip file under 5 MB' });
  return res.status(201).json({ name: req.file.originalname, url: `/uploads/${req.file.filename}` });
});

// ---- 6. AI assistant ----
r.get('/ai/recommendations', protect, ai.recommendations);
r.post('/ai/chat', protect, aiLimiter, ai.chat);
r.post('/ai/learning-path', protect, aiLimiter, ai.learningPath);

// ---- 7. Credits, rewards, gamification ----
r.get('/rewards/wallet', protect, rewards.wallet);
r.post('/rewards/transfer', protect, rewards.transfer);
r.get('/rewards/progress', protect, rewards.progress);
r.get('/rewards/leaderboard', protect, rewards.leaderboard);

// ---- 8. Assessments, certificates, progress ----
r.get('/assessments', protect, learn.listAssessments);
r.get('/assessments/attempts/mine', protect, learn.myAttempts);
r.post('/assessments', protect, [body('title').trim().notEmpty().withMessage('Title is required'), body('skillName').trim().notEmpty().withMessage('Skill name is required')], validate, learn.createAssessment);
r.get('/assessments/:id', protect, learn.getAssessment);
r.put('/assessments/:id', protect, learn.updateAssessment);
r.post('/assessments/:id/attempts', protect, learn.startAttempt);
r.post('/assessments/attempts/:attemptId/submit', protect, learn.submitAttempt);
r.get('/certificates/mine', protect, learn.myCertificates);
r.get('/certificates/verify/:code', learn.verifyCertificate);
r.get('/goals', protect, learn.listGoals);
r.post('/goals', protect, [body('skillName').trim().notEmpty().withMessage('Skill name is required')], validate, learn.createGoal);
r.put('/goals/:id', protect, learn.updateGoal);
r.delete('/goals/:id', protect, learn.deleteGoal);

// ---- 9. Forum ----
r.get('/forum/posts', optionalAuth, forum.list);
r.get('/forum/tags', forum.tags);
r.post('/forum/posts', protect, [body('title').trim().isLength({ min: 5, max: 200 }).withMessage('Title must be 5-200 characters'), body('body').trim().isLength({ min: 10 }).withMessage('Write at least 10 characters')], validate, forum.create);
r.get('/forum/posts/:id', optionalAuth, forum.get);
r.put('/forum/posts/:id', protect, forum.update);
r.delete('/forum/posts/:id', protect, forum.remove);
r.post('/forum/posts/:id/upvote', protect, forum.togglePostVote);
r.post('/forum/posts/:id/comments', protect, [body('body').trim().isLength({ min: 1, max: 5000 }).withMessage('Comment cannot be empty')], validate, forum.comment);
r.post('/forum/posts/:id/accept', protect, forum.acceptAnswer);
r.post('/forum/comments/:commentId/upvote', protect, forum.toggleCommentVote);
r.delete('/forum/comments/:commentId', protect, forum.deleteComment);

// ---- 10. Admin, verification, moderation ----
r.post('/reports', protect, [body('targetType').notEmpty(), body('targetId').isMongoId(), body('reason').isIn(['spam', 'harassment', 'inappropriate', 'fraud', 'misinformation', 'other']).withMessage('Choose a reason')], validate, admin.createReport);
r.get('/announcements', admin.listAnnouncements);
r.get('/admin/users', protect, staff, admin.listUsers);
r.post('/admin/users/:id/moderate', protect, staff, admin.moderateUser);
r.put('/admin/users/:id/role', protect, adminOnly, admin.setRole);
r.post('/admin/users/:id/credits', protect, adminOnly, admin.adjustCredits);
r.get('/admin/verifications', protect, staff, admin.verificationQueue);
r.post('/admin/verifications/:id', protect, staff, admin.reviewVerification);
r.get('/admin/reports', protect, staff, admin.listReports);
r.post('/admin/reports/:id/resolve', protect, staff, admin.resolveReport);
r.get('/admin/assessments', protect, staff, admin.assessmentQueue);
r.post('/admin/assessments/:id/review', protect, staff, admin.reviewAssessment);
r.post('/admin/certificates/:id/revoke', protect, staff, admin.revokeCertificate);
r.get('/admin/audit', protect, adminOnly, admin.auditLog);
r.post('/admin/announcements', protect, staff, admin.createAnnouncement);
r.delete('/admin/announcements/:id', protect, staff, admin.deactivateAnnouncement);

// ---- 11. Reports & analytics ----
r.get('/analytics/me', protect, analytics.me);
r.get('/analytics/platform', protect, staff, analytics.platform);
r.get('/analytics/export/:type', protect, adminOnly, analytics.exportCSV);

module.exports = r;
