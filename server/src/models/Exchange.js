const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  startTime: { type: Date, required: true },
  durationMinutes: { type: Number, required: true, min: 15, max: 480 },
  meetingLink: String,
  location: String,
  agenda: String,
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // in swaps either party may teach
  status: { type: String, enum: ['scheduled', 'completed', 'cancelled', 'missed'], default: 'scheduled' },
  confirmedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  creditsCharged: { type: Number, default: 0 },
  completedAt: Date,
}, { timestamps: true });

const exchangeSchema = new mongoose.Schema({
  requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true }, // learner
  provider: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true }, // teacher
  skill: { type: mongoose.Schema.Types.ObjectId, ref: 'Skill', required: true },
  type: { type: String, enum: ['credit', 'swap'], default: 'credit' },
  offeredSkill: { type: mongoose.Schema.Types.ObjectId, ref: 'Skill' }, // for swap
  message: { type: String, maxlength: 1000 },
  hoursRequested: { type: Number, default: 1, min: 0.5, max: 40 },
  status: { type: String, enum: ['pending', 'accepted', 'declined', 'cancelled', 'completed'], default: 'pending', index: true },
  responseNote: String,
  escrowCredits: { type: Number, default: 0 },
  sessions: [sessionSchema],
  sharedNotes: { type: String, default: '' },
  resources: [{ title: String, url: String, addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' } }],
  reviewedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true });

module.exports = mongoose.model('Exchange', exchangeSchema);
