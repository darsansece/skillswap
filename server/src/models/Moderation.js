const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  targetType: { type: String, enum: ['user', 'skill', 'post', 'comment', 'message', 'review'], required: true },
  targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
  reason: { type: String, enum: ['spam', 'harassment', 'inappropriate', 'fraud', 'misinformation', 'other'], required: true },
  details: { type: String, maxlength: 1000 },
  status: { type: String, enum: ['open', 'resolved', 'dismissed'], default: 'open', index: true },
  action: { type: String, enum: ['none', 'content_removed', 'user_warned', 'user_suspended', 'user_banned'] },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  resolutionNote: String,
  resolvedAt: Date,
}, { timestamps: true });

const auditSchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  action: { type: String, required: true },
  targetType: String,
  targetId: mongoose.Schema.Types.ObjectId,
  meta: mongoose.Schema.Types.Mixed,
}, { timestamps: true });

const announcementSchema = new mongoose.Schema({
  title: { type: String, required: true },
  body: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  active: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = {
  Report: mongoose.model('Report', reportSchema),
  AuditLog: mongoose.model('AuditLog', auditSchema),
  Announcement: mongoose.model('Announcement', announcementSchema),
};
