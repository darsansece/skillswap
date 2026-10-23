const jwt = require('jsonwebtoken');
const { User } = require('../models');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

const ACCESS_SECRET = () => process.env.JWT_SECRET || 'dev_access_secret';

const signAccess = (user) => jwt.sign({ id: user._id, role: user.role }, ACCESS_SECRET(), { expiresIn: process.env.JWT_EXPIRES || '1d' });

async function userFromToken(token) {
  const decoded = jwt.verify(token, ACCESS_SECRET());
  const user = await User.findById(decoded.id);
  if (!user) throw new AppError('User no longer exists', 401);
  return user;
}

function checkStatus(user) {
  if (user.status === 'banned') throw new AppError('This account has been banned', 403);
  if (user.status === 'suspended') {
    if (user.suspendedUntil && user.suspendedUntil < new Date()) {
      user.status = 'active'; user.suspendedUntil = undefined;
      return user.save();
    }
    throw new AppError(`Account suspended${user.suspendedUntil ? ` until ${user.suspendedUntil.toISOString().slice(0, 10)}` : ''}`, 403);
  }
  return null;
}

const protect = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new AppError('Not authenticated', 401);
  let user;
  try { user = await userFromToken(token); } catch (e) { throw new AppError(e.status ? e.message : 'Invalid or expired token', 401); }
  await checkStatus(user);
  req.user = user;
  next();
});

const optionalAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    try { req.user = await userFromToken(header.slice(7)); } catch (e) { /* ignore */ }
  }
  next();
});

const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) return next(new AppError('You do not have permission for this action', 403));
  return next();
};

module.exports = { protect, optionalAuth, authorize, signAccess, userFromToken, checkStatus };
