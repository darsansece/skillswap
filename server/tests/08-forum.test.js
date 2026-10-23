const { connect, disconnect, registerUser, makeRole, api } = require('./helpers');

beforeAll(connect);
afterAll(disconnect);

describe('Module 9: Community forum & knowledge sharing', () => {
  let asker; let helper; let mod; let postId; let commentId;
  beforeAll(async () => {
    asker = await registerUser({ name: 'Asker' });
    helper = await registerUser({ name: 'Helper' });
    mod = await makeRole(await registerUser({ name: 'Mod' }), 'moderator');
  });

  test('create post with validation; members cannot post announcements', async () => {
    expect((await api(asker.token).post('/forum/posts').send({ title: 'Hi', body: 'x' })).status).toBe(422);
    expect((await api(asker.token).post('/forum/posts').send({ title: 'Big news everyone', body: 'Some announcement text', category: 'announcement' })).status).toBe(403);
    const p = await api(asker.token).post('/forum/posts').send({ title: 'How do I practise scales efficiently?', body: 'I keep getting bored doing scales on guitar.', category: 'question', tags: ['guitar', 'practice'] });
    expect(p.status).toBe(201);
    postId = p.body.post._id;
    await api(helper.token).post('/forum/posts').send({ title: 'Sharing my sourdough notes', body: 'Hydration matters more than anything.', category: 'resource', tags: ['baking'] });
  });

  test('list, search, filter and tags', async () => {
    expect((await api().get('/forum/posts')).body.total).toBe(2);
    expect((await api().get('/forum/posts?q=sourdough')).body.items[0].category).toBe('resource');
    expect((await api().get('/forum/posts?category=question')).body.total).toBe(1);
    expect((await api().get('/forum/posts?tag=guitar')).body.total).toBe(1);
    expect((await api().get('/forum/posts?sort=unanswered')).body.total).toBe(1);
    const t = await api().get('/forum/tags');
    expect(t.body.items.map((x) => x.tag)).toEqual(expect.arrayContaining(['guitar', 'baking']));
  });

  test('comments, threaded replies and notifications', async () => {
    const c = await api(helper.token).post(`/forum/posts/${postId}/comments`).send({ body: 'Turn scales into melodies!' });
    expect(c.status).toBe(201);
    commentId = c.body.comment._id;
    const reply = await api(asker.token).post(`/forum/posts/${postId}/comments`).send({ body: 'Great idea', parent: commentId });
    expect(reply.body.comment.parent).toBe(commentId);
    const d = await api().get(`/forum/posts/${postId}`);
    expect(d.body.comments).toHaveLength(2);
    expect(d.body.post.commentCount).toBe(2);
    const n = await api(asker.token).get('/notifications');
    expect(n.body.items.some((x) => x.type === 'forum')).toBe(true);
  });

  test('upvotes toggle on posts and comments', async () => {
    expect((await api(helper.token).post(`/forum/posts/${postId}/upvote`)).body.upvoteCount).toBe(1);
    expect((await api(helper.token).post(`/forum/posts/${postId}/upvote`)).body.upvoteCount).toBe(0);
    expect((await api(asker.token).post(`/forum/comments/${commentId}/upvote`)).body.upvoted).toBe(true);
  });

  test('accepting an answer rewards the helper', async () => {
    expect((await api(helper.token).post(`/forum/posts/${postId}/accept`).send({ commentId })).status).toBe(403);
    const before = (await api(helper.token).get('/auth/me')).body.user.points;
    const a = await api(asker.token).post(`/forum/posts/${postId}/accept`).send({ commentId });
    expect(a.body.post.acceptedComment).toBe(commentId);
    const after = (await api(helper.token).get('/auth/me')).body.user;
    expect(after.points).toBe(before + 25);
    expect(after.badges.some((b) => b.key === 'helpful')).toBe(true);
    expect((await api().get('/forum/posts?sort=unanswered')).body.total).toBe(0);
  });

  test('moderators can pin and lock; locked threads reject comments', async () => {
    await api(asker.token).put(`/forum/posts/${postId}`).send({ pinned: true });
    expect((await api().get(`/forum/posts/${postId}`)).body.post.pinned).toBe(false); // ignored for members
    const r = await api(mod.token).put(`/forum/posts/${postId}`).send({ pinned: true, locked: true });
    expect(r.body.post.locked).toBe(true);
    expect((await api(helper.token).post(`/forum/posts/${postId}/comments`).send({ body: 'late' })).status).toBe(400);
    expect((await api().get('/forum/posts')).body.items[0]._id).toBe(postId);
  });

  test('only authors or moderators can edit/delete', async () => {
    expect((await api(helper.token).put(`/forum/posts/${postId}`).send({ title: 'hijack' })).status).toBe(403);
    expect((await api(helper.token).delete(`/forum/comments/${commentId}`)).status).toBe(200);
    expect((await api(mod.token).delete(`/forum/posts/${postId}`)).status).toBe(200);
    expect((await api().get(`/forum/posts/${postId}`)).status).toBe(404);
  });
});
