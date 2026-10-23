const mongoose = require('mongoose');
const { CATEGORIES, LEVELS } = require('../config/constants');

const questionSchema = new mongoose.Schema({
  prompt: { type: String, required: true },
  options: { type: [String], validate: (v) => v.length >= 2 && v.length <= 6 },
  correctIndex: { type: Number, required: true },
  explanation: String,
  points: { type: Number, default: 1 },
});

const assessmentSchema = new mongoose.Schema({
  title: { type: String, required: true },
  skillName: { type: String, required: true },
  category: { type: String, enum: CATEGORIES, default: 'Other' },
  level: { type: String, enum: LEVELS, default: 'beginner' },
  description: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  questions: [questionSchema],
  passingScore: { type: Number, default: 70, min: 1, max: 100 }, // percent
  timeLimitMinutes: { type: Number, default: 20 },
  maxAttempts: { type: Number, default: 3 },
  status: { type: String, enum: ['draft', 'pending_review', 'published', 'archived'], default: 'published' },
}, { timestamps: true });

const attemptSchema = new mongoose.Schema({
  assessment: { type: mongoose.Schema.Types.ObjectId, ref: 'Assessment', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  answers: [Number],
  score: Number, // percent
  passed: Boolean,
  startedAt: Date,
  submittedAt: Date,
}, { timestamps: true });

const certificateSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  assessment: { type: mongoose.Schema.Types.ObjectId, ref: 'Assessment' },
  skillName: String,
  level: String,
  score: Number,
  code: { type: String, unique: true },
  issuedAt: { type: Date, default: Date.now },
  revoked: { type: Boolean, default: false },
});

const goalSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  skillName: { type: String, required: true },
  targetLevel: { type: String, enum: LEVELS, default: 'intermediate' },
  targetDate: Date,
  milestones: [{ title: String, done: { type: Boolean, default: false }, doneAt: Date }],
  hoursLogged: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'completed', 'abandoned'], default: 'active' },
  notes: String,
}, { timestamps: true, toJSON: { virtuals: true } });

goalSchema.virtual('progress').get(function progress() {
  if (!this.milestones || !this.milestones.length) return this.status === 'completed' ? 100 : 0;
  return Math.round((this.milestones.filter((m) => m.done).length / this.milestones.length) * 100);
});

module.exports = {
  Assessment: mongoose.model('Assessment', assessmentSchema),
  Attempt: mongoose.model('Attempt', attemptSchema),
  Certificate: mongoose.model('Certificate', certificateSchema),
  Goal: mongoose.model('Goal', goalSchema),
};
