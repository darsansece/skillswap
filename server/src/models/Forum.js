const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true, maxlength: 200 },
  body: { type: String, required: true, maxlength: 10000 },
  category: { type: String, enum: ['question', 'discussion', 'resource', 'announcement', 'showcase'], default: 'discussion' },
  tags: [{ type: String, lowercase: true }],
  upvotes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  commentCount: { type: Number, default: 0 },
  views: { type: Number, default: 0 },
  acceptedComment: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment' },
  pinned: { type: Boolean, default: false },
  locked: { type: Boolean, default: false },
  status: { type: String, enum: ['visible', 'hidden'], default: 'visible' },
}, { timestamps: true });

const commentSchema = new mongoose.Schema({
  post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true, index: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  body: { type: String, required: true, maxlength: 5000 },
  parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment' },
  upvotes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  status: { type: String, enum: ['visible', 'hidden'], default: 'visible' },
}, { timestamps: true });

module.exports = {
  Post: mongoose.model('Post', postSchema),
  Comment: mongoose.model('Comment', commentSchema),
};
