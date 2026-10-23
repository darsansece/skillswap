const { connect, disconnect, registerUser, makeRole, api, skillPayload } = require('./helpers');

beforeAll(connect);
afterAll(disconnect);

describe('Module 10: Admin panel, verification & moderation', () => {
  let admin; let mod; let user; let troll; let skillId;
  beforeAll(async () => {
    admin = await makeRole(await registerUser({ name: 'Admin' }), 'admin');
    mod = await makeRole(await registerUser({ name: 'Moderator' }), 'moderator');
    user = await registerUser({ name: 'Regular' });
    troll = await registerUser({ name: 'Troll' });
    skillId = (await api(user.token).post('/skills').send(skillPayload())).body.skill._id;
  });

  test('user listing and search for staff', async () => {
    const r = await api(mod.token).get('/admin/users?q=Troll');
    expect(r.body.items).toHaveLength(1);
    expect(r.body.items[0].email).toBe(troll.email);
  });

  test('skill verification queue: approve', async () => {
    await api(user.token).post(`/skills/${skillId}/verification`).send({ evidence: 'https://portfolio.example.com' });
    const q = await api(mod.token).get('/admin/verifications');
    expect(q.body.items).toHaveLength(1);
    const v = await api(mod.token).post(`/admin/verifications/${skillId}`).send({ decision: 'verified', note: 'Strong portfolio' });
    expect(v.body.skill.verification.status).toBe('verified');
    expect((await api().get('/skills?verified=true')).body.total).toBe(1);
  });

  test('reporting content and resolving with content removal', async () => {
    const post = await api(troll.token).post('/forum/posts').send({ title: 'Buy cheap followers now', body: 'spam spam spam spam spam' });
    expect((await api(user.token).post('/reports').send({ targetType: 'post', targetId: post.body.post._id, reason: 'bogus' })).status).toBe(422);
    const r = await api(user.token).post('/reports').send({ targetType: 'post', targetId: post.body.post._id, reason: 'spam', details: 'Obvious spam' });
    expect(r.status).toBe(201);
    expect((await api(user.token).post('/reports').send({ targetType: 'post', targetId: post.body.post._id, reason: 'spam' })).status).toBe(409);
    const q = await api(mod.token).get('/admin/reports');
    expect(q.body.items[0].target.preview).toMatch(/followers/);
    const res = await api(mod.token).post(`/admin/reports/${r.body.report._id}/resolve`).send({ action: 'content_removed', note: 'Spam' });
    expect(res.body.report.status).toBe('resolved');
    expect((await api().get(`/forum/posts/${post.body.post._id}`)).status).toBe(404);
    expect((await api(user.token).get('/notifications')).body.items.some((n) => n.type === 'moderation')).toBe(true);
  });

  test('warn and suspend via report; suspended user is locked out', async () => {
    const r = await api(user.token).post('/reports').send({ targetType: 'user', targetId: troll.id, reason: 'harassment' });
    const res = await api(mod.token).post(`/admin/reports/${r.body.report._id}/resolve`).send({ action: 'user_suspended', days: 3 });
    expect(res.body.report.action).toBe('user_suspended');
    expect((await api(troll.token).get('/auth/me')).status).toBe(403);
    await api(mod.token).post(`/admin/users/${troll.id}/moderate`).send({ action: 'activate' });
    expect((await api(troll.token).get('/auth/me')).status).toBe(200);
    await api(mod.token).post(`/admin/users/${troll.id}/moderate`).send({ action: 'warn', reason: 'Be kind' });
    const u = await api(mod.token).get('/admin/users?q=Troll');
    expect(u.body.items[0].warnings).toHaveLength(1);
  });

  test('dismissed reports take no action', async () => {
    const r = await api(troll.token).post('/reports').send({ targetType: 'skill', targetId: skillId, reason: 'other' });
    const res = await api(mod.token).post(`/admin/reports/${r.body.report._id}/resolve`).send({ action: 'dismiss' });
    expect(res.body.report.status).toBe('dismissed');
    expect((await api().get(`/skills/${skillId}`)).status).toBe(200);
  });

  test('permission boundaries between moderators and admins', async () => {
    expect((await api(mod.token).post(`/admin/users/${troll.id}/moderate`).send({ action: 'ban' })).status).toBe(403);
    expect((await api(mod.token).post(`/admin/users/${admin.id}/moderate`).send({ action: 'suspend' })).status).toBe(403);
    expect((await api(mod.token).put(`/admin/users/${user.id}/role`).send({ role: 'admin' })).status).toBe(403);
    expect((await api(mod.token).get('/admin/audit')).status).toBe(403);
    expect((await api(admin.token).post(`/admin/users/${admin.id}/moderate`).send({ action: 'suspend' })).status).toBe(400);
  });

  test('admin: role changes, credit adjustments, bans, audit log', async () => {
    const role = await api(admin.token).put(`/admin/users/${user.id}/role`).send({ role: 'moderator' });
    expect(role.body.user.role).toBe('moderator');
    const c = await api(admin.token).post(`/admin/users/${user.id}/credits`).send({ amount: 5, reason: 'Event host' });
    expect(c.body.credits).toBe(15);
    expect((await api(admin.token).post(`/admin/users/${user.id}/credits`).send({ amount: -500 })).status).toBe(400);
    await api(admin.token).post(`/admin/users/${troll.id}/moderate`).send({ action: 'ban' });
    expect((await api().post('/auth/login').send({ email: troll.email, password: troll.password })).status).toBe(403);
    const log = await api(admin.token).get('/admin/audit');
    expect(log.body.items.map((l) => l.action)).toEqual(expect.arrayContaining(['user.ban', 'user.role', 'credits.adjust', 'skill.verified', 'report.resolved']));
  });

  test('banned users\u2019 skills are hidden from the marketplace', async () => {
    expect((await api().get('/skills')).body.items.every((s) => s.owner._id !== troll.id)).toBe(true);
  });

  test('announcements', async () => {
    const a = await api(mod.token).post('/admin/announcements').send({ title: 'Skill fair on Saturday', body: 'Join us!' });
    expect((await api().get('/announcements')).body.items).toHaveLength(1);
    await api(mod.token).delete(`/admin/announcements/${a.body.announcement._id}`);
    expect((await api().get('/announcements')).body.items).toHaveLength(0);
  });
});

