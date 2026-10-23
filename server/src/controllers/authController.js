const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { signAccess, checkStatus } = require('../middleware/auth');
const credits = require('../services/credits');
const { recordLogin } = require('../services/gamification');
const { SIGNUP_BONUS } = require('../config/constants');

const REFRESH_SECRET = () => process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret';
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');

async function issueTokens(user) {
  const refreshToken = jwt.sign({ id: user._id, jti: crypto.randomBytes(8).toString('hex') }, REFRESH_SECRET(), { expiresIn: '30d' });
  user.refreshTokenHash = hash(refreshToken);
  await user.save();
  return { accessToken: signAccess(user), refreshToken };
}

const selfView = (user) => {
  const o = user.toObject({ virtuals: true });
  ['password', 'emailVerifyToken', 'resetPasswordToken', 'resetPasswordExpires', 'refreshTokenHash'].forEach((k) => delete o[k]);
  return o;
};

exports.register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  if (await User.findOne({ email: email.toLowerCase() })) throw new AppError('An account with this email already exists', 409);
  const user = new User({ name, email, password });
  const verifyToken = user.createToken('emailVerifyToken');
  await user.save();
  await credits.grant(user._id, SIGNUP_BONUS, 'signup_bonus', 'Welcome bonus');
  user.credits = SIGNUP_BONUS;
  await recordLogin(user);
  const tokens = await issueTokens(user);
  // In production, email the verification link instead of returning it.
  const devExtras = process.env.NODE_ENV !== 'production' ? { devVerifyToken: verifyToken } : {};
  res.status(201).json({ user: selfView(user), ...tokens, ...devExtras });
});

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
  if (!user || !(await user.comparePassword(password))) throw new AppError('Incorrect email or password', 401);
  await checkStatus(user);
  const daily = await recordLogin(user);
  const tokens = await issueTokens(user);
  res.json({ user: selfView(user), ...tokens, daily });
});

exports.refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) throw new AppError('Refresh token required', 400);
  let decoded;
  try { decoded = jwt.verify(refreshToken, REFRESH_SECRET()); } catch (e) { throw new AppError('Invalid refresh token', 401); }
  const user = await User.findById(decoded.id).select('+refreshTokenHash');
  if (!user || user.refreshTokenHash !== hash(refreshToken)) throw new AppError('Refresh token revoked', 401);
  await checkStatus(user);
  res.json(await issueTokens(user));
});

exports.logout = asyncHandler(async (req, res) => {
  await User.updateOne({ _id: req.user._id }, { $unset: { refreshTokenHash: 1 } });
  res.json({ message: 'Logged out' });
});

exports.me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  res.json({ user: selfView(user) });
});

exports.verifyEmail = asyncHandler(async (req, res) => {
  const user = await User.findOne({ emailVerifyToken: User.hashToken(req.params.token) });
  if (!user) throw new AppError('Verification link is invalid or already used', 400);
  user.emailVerified = true;
  user.emailVerifyToken = undefined;
  await user.save();
  res.json({ message: 'Email verified' });
});

exports.forgotPassword = asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: String(req.body.email || '').toLowerCase() });
  const response = { message: 'If that email is registered, a reset link has been sent' };
  if (user) {
    const token = user.createToken('resetPasswordToken', 'resetPasswordExpires', 60 * 60 * 1000);
    await user.save();
    if (process.env.NODE_ENV !== 'production') response.devResetToken = token;
  }
  res.json(response);
});

exports.resetPassword = asyncHandler(async (req, res) => {
  const user = await User.findOne({ resetPasswordToken: User.hashToken(req.params.token), resetPasswordExpires: { $gt: new Date() } });
  if (!user) throw new AppError('Reset link is invalid or has expired', 400);
  user.password = req.body.password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  user.refreshTokenHash = undefined;
  await user.save();
  res.json({ message: 'Password updated. Please log in.' });
});

exports.changePassword = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.comparePassword(req.body.currentPassword))) throw new AppError('Current password is incorrect', 400);
  user.password = req.body.newPassword;
  await user.save();
  res.json({ message: 'Password changed' });
});

exports.selfView = selfView;
