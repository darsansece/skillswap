const { connect, disconnect, registerUser, api, skillPayload } = require('./helpers');

beforeAll(connect);
afterAll(disconnect);

describe('Module 2: Profile & skill portfolio', () => {
  test('updates profile fields and ignores protected ones', async () => {
    const u = await registerUser();
    const res = await api(u.token).put('/users/me').send({ headline: 'Data nerd', bio: 'I love teaching', languages: ['English', 'Tamil'], skillsWanted: [{ name: 'Guitar', category: 'Music' }], credits: 9999, role: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body.user.headline).toBe('Data nerd');
    expect(res.body.user.skillsWanted[0].name).toBe('Guitar');
    expect(res.body.user.credits).toBe(10);
    expect(res.body.user.role).toBe('user');
  });

  test('portfolio CRUD', async () => {
    const u = await registerUser();
    const add = await api(u.token).post('/users/me/portfolio').send({ title: 'Sales dashboard', url: 'https://example.com/dash', skill: 'Python' });
    expect(add.status).toBe(201);
    const id = add.body.portfolio[0]._id;
    const upd = await api(u.token).put(`/users/me/portfolio/${id}`).send({ title: 'Sales dashboard v2' });
    expect(upd.body.portfolio[0].title).toBe('Sales dashboard v2');
    expect((await api(u.token).post('/users/me/portfolio').send({ title: 'x', url: 'not a url' })).status).toBe(422);
    const del = await api(u.token).delete(`/users/me/portfolio/${id}`);
    expect(del.body.portfolio).toHaveLength(0);
  });

  test('public profile hides private fields and shows skills; endorsements work', async () => {
    const a = await registerUser(); const b = await registerUser();
    await api(a.token).post('/skills').send(skillPayload());
    const e = await api(b.token).post(`/users/${a.id}/endorse`).send({ skill: 'Python' });
    expect(e.status).toBe(201);
    expect((await api(b.token).post(`/users/${a.id}/endorse`).send({ skill: 'Python' })).status).toBe(409);
    expect((await api(a.token).post(`/users/${a.id}/endorse`).send({ skill: 'Python' })).status).toBe(400);
    const p = await api().get(`/users/${a.id}`);
    expect(p.status).toBe(200);
    expect(p.body.user.email).toBeUndefined();
    expect(p.body.user.password).toBeUndefined();
    expect(p.body.skills).toHaveLength(1);
    expect(p.body.endorsements.Python).toBe(1);
  });
});

