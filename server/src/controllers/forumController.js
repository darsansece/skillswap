const { Post, Comment } = require('../models');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { paginate, escapeRegex } = require('../utils/paginate');
const { addPoints } = require('../services/gamification');
const { notify } = require('../services/notify');
const { POINTS } = require('../config/constants');

const isStaff = (u) => u && ['admin', 'moderator'].includes(u.role);

exports.list = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate({ ...req.query, limit: req.query.limit || 15 });
  const filter = { status: 'visible' };
  if (req.query.category) filter.category = req.query.category;
  if (req.query.tag) filter.tags = String(req.query.tag).toLowerCase();
  if (req.query.author) filter.author = req.query.author;
  if (req.query.q) {
    const rx = { $regex: escapeRegex(req.query.q), $options: 'i' };
    filter.$or = [{ title: rx }, { body: rx }];
  }
  if (req.query.sort === 'unanswered') { filter.category = 'question'; filter.acceptedComment = { $exists: false }; }
  const sort = req.query.sort === 'top' ? { pinned: -1, commentCount: -1, views: -1 } : { pinned: -1, createdAt: -1 };
  const [items, total] = await Promise.all([
    Post.find(filter).populate('author', 'name avatar level').sort(sort).skip(skip).limit(limit),
    Post.countDocuments(filter),
  ]);
  res.json({ items: items.map((p) => ({ ...p.toObject(), upvoteCount: p.upvotes.length, body: p.body.slice(0, 280) })), total, page, pages: Math.ceil(total / limit) });
});

exports.get = asyncHandler(async (req, res) => {
  const post = await Post.findById(req.params.id).populate('author', 'name avatar level');
  if (!post || (post.status !== 'visible' && !isStaff(req.user))) throw new AppError('Post not found', 404);
  await Post.updateOne({ _id: post._id }, { $inc: { views: 1 } });
  const comments = await Comment.find({ post: post._id, status: 'visible' }).populate('author', 'name avatar level').sort('createdAt');
  res.json({ post: { ...post.toObject(), upvoteCount: post.upvotes.length }, comments: comments.map((c) => ({ ...c.toObject(), upvoteCount: c.upvotes.length })) });
});

exports.create = asyncHandler(async (req, res) => {
  const { title, body, category, tags } = req.body;
  if (category === 'announcement' && !isStaff(req.user)) throw new AppError('Only moderators can post announcements', 403);
  const post = await Post.create({ author: req.user._id, title, body, category, tags });
  await addPoints(req.user._id, POINTS.FORUM_POST, { forumPosts: 1 });
  res.status(201).json({ post });
});

async function ownPost(req) {
  const post = await Post.findById(req.params.id);
  if (!post || post.status !== 'visible') throw new AppError('Post not found', 404);
  if (String(post.author) !== String(req.user._id) && !isStaff(req.user)) throw new AppError('Not allowed', 403);
  return post;
}

exports.update = asyncHandler(async (req, res) => {
  const post = await ownPost(req);
  ['title', 'body', 'tags'].forEach((k) => { if (req.body[k] !== undefined) post[k] = req.body[k]; });
  if (isStaff(req.user)) ['pinned', 'locked'].forEach((k) => { if (req.body[k] !== undefined) post[k] = !!req.body[k]; });
  await post.save();
  res.json({ post });
});

exports.remove = asyncHandler(async (req, res) => {
  const post = await ownPost(req);
  post.status = 'hidden';
  await post.save();
  res.json({ ok: true });
});

exports.togglePostVote = asyncHandler(async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post || post.status !== 'visible') throw new AppError('Post not found', 404);
  const i = post.upvotes.findIndex((u) => String(u) === String(req.user._id));
  if (i >= 0) post.upvotes.splice(i, 1); else post.upvotes.push(req.user._id);
  await post.save();
  res.json({ upvoted: i < 0, upvoteCount: post.upvotes.length });
});

exports.comment = asyncHandler(async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post || post.status !== 'visible') throw new AppError('Post not found', 404);
  if (post.locked) throw new AppError('This thread is locked');
  if (req.body.parent) {
    const parent = await Comment.findOne({ _id: req.body.parent, post: post._id });
    if (!parent) throw new AppError('Parent comment not found', 404);
  }
  const c = await Comment.create({ post: post._id, author: req.user._id, body: req.body.body, parent: req.body.parent });
  post.commentCount += 1;
  await post.save();
  await addPoints(req.user._id, POINTS.FORUM_COMMENT);
  if (String(post.author) !== String(req.user._id)) await notify(post.author, { type: 'forum', title: `${req.user.name} replied to "${post.title.slice(0, 40)}"`, link: `/forum/${post._id}` });
  res.status(201).json({ comment: await c.populate('author', 'name avatar level') });
});

exports.toggleCommentVote = asyncHandler(async (req, res) => {
  const c = await Comment.findById(req.params.commentId);
  if (!c || c.status !== 'visible') throw new AppError('Comment not found', 404);
  const i = c.upvotes.findIndex((u) => String(u) === String(req.user._id));
  if (i >= 0) c.upvotes.splice(i, 1); else c.upvotes.push(req.user._id);
  await c.save();
  res.json({ upvoted: i < 0, upvoteCount: c.upvotes.length });
});

exports.deleteComment = asyncHandler(async (req, res) => {
  const c = await Comment.findById(req.params.commentId);
  if (!c || c.status !== 'visible') throw new AppError('Comment not found', 404);
  if (String(c.author) !== String(req.user._id) && !isStaff(req.user)) throw new AppError('Not allowed', 403);
  c.status = 'hidden';
  await c.save();
  await Post.updateOne({ _id: c.post }, { $inc: { commentCount: -1 } });
  res.json({ ok: true });
});

exports.acceptAnswer = asyncHandler(async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) throw new AppError('Post not found', 404);
  if (String(post.author) !== String(req.user._id)) throw new AppError('Only the author can accept an answer', 403);
  if (post.category !== 'question') throw new AppError('Only questions can have an accepted answer');
  const c = await Comment.findOne({ _id: req.body.commentId, post: post._id, status: 'visible' });
  if (!c) throw new AppError('Comment not found', 404);
  if (String(c.author) === String(req.user._id)) throw new AppError('You cannot accept your own answer');
  const firstAccept = !post.acceptedComment;
  post.acceptedComment = c._id;
  await post.save();
  if (firstAccept) {
    await addPoints(c.author, POINTS.ACCEPTED_ANSWER, { acceptedAnswers: 1 });
    await notify(c.author, { type: 'forum', title: 'Your answer was accepted', body: post.title, link: `/forum/${post._id}` });
  }
  res.json({ post });
});

exports.tags = asyncHandler(async (req, res) => {
  const rows = await Post.find({ status: 'visible' }).select('tags').limit(1000);
  const counts = {};
  rows.forEach((p) => p.tags.forEach((t) => { counts[t] = (counts[t] || 0) + 1; }));
  res.json({ items: Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([tag, count]) => ({ tag, count })) });
});

