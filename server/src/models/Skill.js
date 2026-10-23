const mongoose = require('mongoose');
const { CATEGORIES, LEVELS } = require('../config/constants');

const skillSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, required: true, maxlength: 4000 },
  category: { type: String, enum: CATEGORIES, required: true },
  level: { type: String, enum: LEVELS, default: 'intermediate' },
  tags: [{ type: String, lowercase: true, trim: true }],
  mode: { type: String, enum: ['online', 'in-person', 'both'], default: 'online' },
  location: String,
  creditsPerHour: { type: Number, default: 1, min: 0, max: 20 },
  acceptsSwap: { type: Boolean, default: true },
  yearsExperience: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'paused', 'removed'], default: 'active' },
  verification: {
    status: { type: String, enum: ['none', 'pending', 'verified', 'rejected'], default: 'none' },
    evidence: String,
    note: String,
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
  },
  views: { type: Number, default: 0 },
  sessionsCompleted: { type: Number, default: 0 },
  ratingSum: { type: Number, default: 0 },
  ratingCount: { type: Number, default: 0 },
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

skillSchema.virtual('rating').get(function rating() {
  return this.ratingCount ? Math.round((this.ratingSum / this.ratingCount) * 10) / 10 : 0;
});

module.exports = mongoose.model('Skill', skillSchema);
