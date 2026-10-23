const { connect, disconnect, registerUser, api, skillPayload } = require('./helpers');

beforeAll(connect);
afterAll(disconnect);

describe('Module 3: Skill marketplace & discovery', () => {
  let mentor; let other; let skillId;
  beforeAll(async () => {
    mentor = await registerUser({ name: 'Mentor Mei' });
    other = await registerUser({ name: 'Other Om' });
    const s = await api(mentor.token).post('/skills').send(skillPayload());
    skillId = s.body.skill._id;
    await api(mentor.token).post('/skills').send(skillPayload({ title: 'Carnatic Violin Basics', category: 'Music', tags: ['violin', 'carnatic'], creditsPerHour: 3, level: 'beginner', mode: 'in-person' }));
    await api(other.token).post('/skills').send(skillPayload({ title: 'Spanish Conversation', category: 'Languages', tags: ['spanish'], creditsPerHour: 1, acceptsSwap: false }));
  });

  test('validates skill input', async () => {
    const res = await api(mentor.token).post('/skills').send({ title: 'x', description: 'short', category: 'Nope' });
    expect(res.status).toBe(422);
  });

  test('awards points for listing', async () => {
    const me = await api(mentor.token).get('/auth/me');
    expect(me.body.user.points).toBeGreaterThanOrEqual(20);
  });

  test('search, filter, sort and paginate', async () => {
    expect((await api().get('/skills?q=violin')).body.items).toHaveLength(1);
    expect((await api().get('/skills?category=Languages')).body.items[0].title).toBe('Spanish Conversation');
    expect((await api().get('/skills?maxCredits=1')).body.total).toBe(1);
    expect((await api().get('/skills?swap=true')).body.total).toBe(2);
    expect((await api().get('/skills?mode=online')).body.total).toBe(2);
    expect((await api().get('/skills?tag=python')).body.total).toBe(1);
    const sorted = await api().get('/skills?sort=credits-desc');
    expect(sorted.body.items[0].creditsPerHour).toBe(3);
    const page = await api().get('/skills?limit=2&page=2');
    expect(page.body.items).toHaveLength(1);
    expect(page.body.pages).toBe(2);
  });

  test('detail view counts views from others, returns related', async () => {
    await api(other.token).get(`/skills/${skillId}`);
    const d = await api(other.token).get(`/skills/${skillId}`);
    expect(d.body.skill.views).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(d.body.related)).toBe(true);
  });

  test('only owner can edit/remove', async () => {
    expect((await api(other.token).put(`/skills/${skillId}`).send({ title: 'Hacked' })).status).toBe(403);
    expect((await api(mentor.token).put(`/skills/${skillId}`).send({ status: 'paused' })).body.skill.status).toBe('paused');
    expect((await api().get('/skills?q=Data%20Analysis')).body.total).toBe(0);
    await api(mentor.token).put(`/skills/${skillId}`).send({ status: 'active' });
  });

  test('bookmarks toggle', async () => {
    const b = await api(other.token).post(`/users/me/bookmarks/${skillId}`);
    expect(b.body.bookmarked).toBe(true);
    expect((await api(other.token).get('/users/me/bookmarks')).body.items).toHaveLength(1);
    expect((await api(other.token).post(`/users/me/bookmarks/${skillId}`)).body.bookmarked).toBe(false);
  });

  test('category stats and meta', async () => {
    const c = await api().get('/skills/categories');
    expect(c.body.items.find((x) => x.category === 'Technology').count).toBe(1);
    expect((await api().get('/skills/meta')).body.categories).toContain('Music');
  });

  test('swap matches find mutual partners', async () => {
    await api(mentor.token).put('/users/me').send({ skillsWanted: [{ name: 'Spanish' }] });
    await api(other.token).put('/users/me').send({ skillsWanted: [{ name: 'Python' }] });
    const m = await api(mentor.token).get('/skills/swap-matches');
    expect(m.body.items.some((x) => x.user._id === other.id)).toBe(true);
  });

  test('verification request requires evidence', async () => {
    expect((await api(mentor.token).post(`/skills/${skillId}/verification`).send({})).status).toBe(400);
    const v = await api(mentor.token).post(`/skills/${skillId}/verification`).send({ evidence: 'https://github.com/mei' });
    expect(v.body.skill.verification.status).toBe('pending');
  });
});
