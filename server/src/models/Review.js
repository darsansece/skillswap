const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  exchange: { type: mongoose.Schema.Types.ObjectId, ref: 'Exchange', required: true },
  reviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reviewee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  skill: { type: mongoose.Schema.Types.ObjectId, ref: 'Skill' },
  rating: { type: Number, min: 1, max: 5, required: true },
  comment: { type: String, maxlength: 1000 },
}, { timestamps: true });

module.exports = mongoose.model('Review', reviewSchema);
