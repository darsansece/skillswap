const mongoose = require('mongoose');

const txSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  amount: { type: Number, required: true }, // + earned, - spent
  type: { type: String, enum: ['signup_bonus', 'escrow_hold', 'escrow_release', 'escrow_refund', 'earned_teaching', 'reward', 'admin_adjustment', 'transfer'], required: true },
  description: String,
  exchange: { type: mongoose.Schema.Types.ObjectId, ref: 'Exchange' },
  balanceAfter: Number,
}, { timestamps: true });

module.exports = mongoose.model('CreditTransaction', txSchema);
