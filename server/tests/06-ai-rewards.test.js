const { connect, disconnect, registerUser, api, skillPayload } = require('./helpers');
const { User } = require('../src/models');
const { levelFor } = require('../src/services/gamification');

beforeAll(connect);
afterAll(disconnect);

describe('Module 6: AI learning assistant & recommendations', () => {
  let me; let guitarist; let coder;
  beforeAll(async () => {
    me = await registerUser({ name: 'Learner' });
    guitarist = await registerUser({ name: 'Guitarist' });
    coder = await registerUser({ name: 'Coder' });
    await api(guitarist.token).post('/skills').send(skillPayload({ title: 'Acoustic Guitar for Beginners', category: 'Music', tags: ['guitar'] }));
    await api(coder.token).post('/skills').send(skillPayload({ title: 'React Fundamentals', category: 'Technology', tags: ['react', 'javascript'] }));
    await api(me.token).post('/skills').send(skillPayload({ title: 'Baking Sourdough', category: 'Cooking', tags: ['baking'] }));
    await api(me.token).put('/users/me').send({ skillsWanted: [{ name: 'Guitar', category: 'Music' }] });
    await api(guitarist.token).put('/users/me').send({ skillsWanted: [{ name: 'Sourdough baking' }] });
  });

  test('skill recommendations rank wanted skills first with reasons', async () => {
    const r = await api(me.token).get('/ai/recommendations');
    expect(r.status).toBe(200);
    expect(r.body.skills[0].skill.title).toMatch(/Guitar/);
    expect(r.body.skills[0].reasons).toEqual(expect.arrayContaining(['Matches a skill you want to learn', 'Swap match: they want a skill you teach']));
    expect(r.body.skills.some((s) => s.skill.owner._id === me.id)).toBe(false);
  });

  test('people recommendations flag mutual swaps', async () => {
    const r = await api(me.token).get('/ai/recommendations');
    const g = r.body.people.find((p) => p.user._id === guitarist.id);
    expect(g.mutual).toBe(true);
  });

  test('assistant chat answers (rule-based fallback without API key)', async () => {
    const r = await api(me.token).post('/ai/chat').send({ message: 'What should I learn? Recommend something' });
    expect(r.status).toBe(200);
    expect(r.body.source).toBe('rule-based');
    expect(r.body.reply).toMatch(/Guitar/);
    const c = await api(me.token).post('/ai/chat').send({ message: 'how many credits do I have' });
    expect(c.body.reply).toMatch(/10 credits/);
    expect((await api(me.token).post('/ai/chat').send({ message: '' })).status).toBe(400);
  });

  test('learning path includes stages, mentors and assessments', async () => {
    const r = await api(me.token).post('/ai/learning-path').send({ skillName: 'Guitar', currentLevel: 'beginner' });
    expect(r.status).toBe(200);
    expect(r.body.path.steps.length).toBeGreaterThanOrEqual(6);
    expect(r.body.path.mentors[0].title).toMatch(/Guitar/);
  });
});

describe('Module 7: Credits, rewards & gamification', () => {
  let a; let b;
  beforeAll(async () => { a = await registerUser({ name: 'Ava' }); b = await registerUser({ name: 'Ben' }); });

  test('level thresholds', () => {
    expect(levelFor(0)).toBe(1);
    expect(levelFor(100)).toBe(2);
    expect(levelFor(260)).toBe(3);
    expect(levelFor(99999)).toBe(8);
  });

  test('wallet shows balance and ledger', async () => {
    const w = await api(a.token).get('/rewards/wallet');
    expect(w.body.balance).toBe(10);
    expect(w.body.items[0].type).toBe('signup_bonus');
  });

  test('peer credit transfer with validation', async () => {
    expect((await api(a.token).post('/rewards/transfer').send({ toUserId: a.id, amount: 1 })).status).toBe(400);
    expect((await api(a.token).post('/rewards/transfer').send({ toUserId: b.id, amount: 100 })).status).toBe(400);
    expect((await api(a.token).post('/rewards/transfer').send({ toUserId: b.id, amount: 1.5 })).status).toBe(400);
    const t = await api(a.token).post('/rewards/transfer').send({ toUserId: b.id, amount: 3, note: 'Thanks!' });
    expect(t.body.balance).toBe(7);
    expect((await api(b.token).get('/rewards/wallet')).body.balance).toBe(13);
  });

  test('progress lists badges and level progress', async () => {
    const p = await api(a.token).get('/rewards/progress');
    expect(p.body.level).toBe(1);
    expect(p.body.badges.length).toBe(9);
    expect(p.body.loginStreak).toBe(1);
  });

  test('daily login streak increments on consecutive days and awards a badge at 7', async () => {
    const yesterday = new Date(Date.now() - 86400000);
    await User.updateOne({ _id: a.id }, { lastLoginDate: yesterday, loginStreak: 6 });
    const r = await api().post('/auth/login').send({ email: a.email, password: a.password });
    expect(r.body.daily.streak).toBe(7);
    const p = await api(a.token).get('/rewards/progress');
    expect(p.body.badges.find((x) => x.key === 'streak_7').earned).toBe(true);
    const again = await api().post('/auth/login').send({ email: a.email, password: a.password });
    expect(again.body.daily.awarded).toBe(0); // once per day
  });

  test('leaderboard ranks by points', async () => {
    await User.updateOne({ _id: b.id }, { points: 5000 });
    const l = await api(a.token).get('/rewards/leaderboard');
    expect(l.body.items[0]._id).toBe(b.id);
    expect(l.body.myRank).toBeGreaterThan(1);
  });
});
