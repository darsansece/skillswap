const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const portfolioSchema = new mongoose.Schema({
  title: { type: String, required: true, maxlength: 120 },
  description: { type: String, maxlength: 1000 },
  url: String,
  skill: String,
}, { timestamps: true });

const availabilitySchema = new mongoose.Schema({
  day: { type: String, enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] },
  from: String, // "09:00"
  to: String,
}, { _id: false });

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 8, select: false },
  role: { type: String, enum: ['user', 'moderator', 'admin'], default: 'user' },
  status: { type: String, enum: ['active', 'suspended', 'banned'], default: 'active' },
  suspendedUntil: Date,
  emailVerified: { type: Boolean, default: false },
  emailVerifyToken: { type: String, select: false },
  resetPasswordToken: { type: String, select: false },
  resetPasswordExpires: { type: Date, select: false },
  refreshTokenHash: { type: String, select: false },

  avatar: String,
  headline: { type: String, maxlength: 140 },
  bio: { type: String, maxlength: 2000 },
  location: String,
  languages: [String],
  timezone: { type: String, default: 'UTC' },
  skillsWanted: [{ name: String, category: String, level: String }],
  interests: [String],
  availability: [availabilitySchema],
  portfolio: [portfolioSchema],
  socialLinks: { website: String, linkedin: String, github: String },
  bookmarks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Skill' }],
  endorsements: [{
    skill: String,
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
  }],

  // Gamification & credits
  credits: { type: Number, default: 0, min: 0 },
  heldCredits: { type: Number, default: 0, min: 0 },
  points: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  badges: [{ key: String, awardedAt: { type: Date, default: Date.now } }],
  loginStreak: { type: Number, default: 0 },
  lastLoginDate: Date,
  stats: {
    sessionsTaught: { type: Number, default: 0 },
    sessionsLearned: { type: Number, default: 0 },
    hoursTaught: { type: Number, default: 0 },
    hoursLearned: { type: Number, default: 0 },
    ratingSum: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    forumPosts: { type: Number, default: 0 },
    acceptedAnswers: { type: Number, default: 0 },
  },
  warnings: [{ reason: String, by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, at: { type: Date, default: Date.now } }],
  lastSeen: Date,
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

userSchema.virtual('rating').get(function rating() {
  const s = this.stats || {};
  return s.ratingCount ? Math.round((s.ratingSum / s.ratingCount) * 10) / 10 : 0;
});

userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.createToken = function createToken(field, expiresField, ttlMs) {
  const raw = crypto.randomBytes(24).toString('hex');
  this[field] = crypto.createHash('sha256').update(raw).digest('hex');
  if (expiresField) this[expiresField] = new Date(Date.now() + ttlMs);
  return raw;
};

userSchema.statics.hashToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

userSchema.methods.toPublic = function toPublic() {
  const o = this.toObject();
  delete o.password; delete o.emailVerifyToken; delete o.resetPasswordToken;
  delete o.resetPasswordExpires; delete o.refreshTokenHash; delete o.bookmarks;
  delete o.warnings; delete o.email; delete o.heldCredits;
  return o;
};

module.exports = mongoose.model('User', userSchema);
