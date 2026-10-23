const { connect, disconnect, registerUser, makeRole, api } = require('./helpers');
const { Attempt } = require('../src/models');

beforeAll(connect);
afterAll(disconnect);

const quiz = {
  title: 'JavaScript Basics', skillName: 'JavaScript', category: 'Technology', level: 'beginner', passingScore: 60, maxAttempts: 2, timeLimitMinutes: 10,
  questions: [
    { prompt: 'typeof null?', options: ['null', 'object', 'undefined'], correctIndex: 1, explanation: 'Historic quirk' },
    { prompt: 'Strict equality?', options: ['==', '==='], correctIndex: 1 },
    { prompt: 'Array length of [1,2]?', options: ['1', '2', '3'], correctIndex: 1 },
  ],
};

describe('Module 8: Assessments, certifications & learning progress', () => {
  let mod; let user; let author; let assessmentId;
  beforeAll(async () => {
    mod = await makeRole(await registerUser({ name: 'Mod' }), 'moderator');
    user = await registerUser({ name: 'Taker' });
    author = await registerUser({ name: 'Author' });
  });

  test('validates questions', async () => {
    const bad = await api(mod.token).post('/assessments').send({ ...quiz, questions: [{ prompt: 'x', options: ['a'], correctIndex: 0 }] });
    expect(bad.status).toBe(400);
  });

  test('moderator assessments publish immediately; member ones need review', async () => {
    const a = await api(mod.token).post('/assessments').send(quiz);
    expect(a.body.assessment.status).toBe('published');
    assessmentId = a.body.assessment._id;
    const b = await api(author.token).post('/assessments').send({ ...quiz, title: 'Pending quiz' });
    expect(b.body.assessment.status).toBe('pending_review');
    expect((await api(user.token).get('/assessments')).body.items).toHaveLength(1);
    const q = await api(mod.token).get('/admin/assessments');
    expect(q.body.items).toHaveLength(1);
    const pub = await api(mod.token).post(`/admin/assessments/${b.body.assessment._id}/review`).send({ decision: 'publish' });
    expect(pub.body.assessment.status).toBe('published');
  });

  test('answers are hidden from takers', async () => {
    const g = await api(user.token).get(`/assessments/${assessmentId}`);
    expect(g.body.assessment.questions[0].correctIndex).toBeUndefined();
    const s = await api(user.token).post(`/assessments/${assessmentId}/attempts`);
    expect(s.body.assessment.questions[0].correctIndex).toBeUndefined();
  });

  test('authors cannot take their own assessment', async () => {
    expect((await api(mod.token).post(`/assessments/${assessmentId}/attempts`)).status).toBe(400);
  });

  test('failing attempt gives feedback and no certificate', async () => {
    const s = await api(user.token).post(`/assessments/${assessmentId}/attempts`);
    const r = await api(user.token).post(`/assessments/attempts/${s.body.attempt._id}/submit`).send({ answers: [0, 0, 1] });
    expect(r.body.attempt.score).toBe(33);
    expect(r.body.attempt.passed).toBe(false);
    expect(r.body.certificate).toBeNull();
    expect(r.body.review[0].explanation).toBe('Historic quirk');
    expect((await api(user.token).post(`/assessments/attempts/${s.body.attempt._id}/submit`).send({ answers: [] })).status).toBe(400);
  });

  test('passing issues a verifiable certificate, badge and points', async () => {
    const s = await api(user.token).post(`/assessments/${assessmentId}/attempts`);
    expect(s.body.attemptsLeft).toBe(1);
    const r = await api(user.token).post(`/assessments/attempts/${s.body.attempt._id}/submit`).send({ answers: [1, 1, 1] });
    expect(r.body.attempt.score).toBe(100);
    expect(r.body.certificate.code).toHaveLength(12);
    const v = await api().get(`/certificates/verify/${r.body.certificate.code}`);
    expect(v.body.valid).toBe(true);
    expect(v.body.certificate.holder).toBe('Taker');
    expect((await api().get('/certificates/verify/NOPE')).status).toBe(404);
    const me = (await api(user.token).get('/auth/me')).body.user;
    expect(me.badges.some((b) => b.key === 'certified')).toBe(true);
    expect((await api(user.token).get('/certificates/mine')).body.items).toHaveLength(1);
  });

  test('attempt limits are enforced', async () => {
    expect((await api(user.token).post(`/assessments/${assessmentId}/attempts`)).status).toBe(400);
    const list = await api(user.token).get('/assessments');
    const mine = list.body.items.find((i) => i._id === assessmentId);
    expect(mine.myBest).toBe(100);
    expect(mine.myPassed).toBe(true);
    expect((await api(user.token).get('/assessments/attempts/mine')).body.items).toHaveLength(2);
  });

  test('late submissions score zero', async () => {
    const other = await registerUser();
    const s = await api(other.token).post(`/assessments/${assessmentId}/attempts`);
    await Attempt.updateOne({ _id: s.body.attempt._id }, { startedAt: new Date(Date.now() - 60 * 60000) });
    const r = await api(other.token).post(`/assessments/attempts/${s.body.attempt._id}/submit`).send({ answers: [1, 1, 1] });
    expect(r.body.late).toBe(true);
    expect(r.body.attempt.score).toBe(0);
  });

  test('revoked certificates fail verification', async () => {
    const certs = (await api(user.token).get('/certificates/mine')).body.items;
    await api(mod.token).post(`/admin/certificates/${certs[0]._id}/revoke`).send({ reason: 'test' });
    expect((await api().get(`/certificates/verify/${certs[0].code}`)).body.valid).toBe(false);
  });

  test('learning goals with milestones track progress', async () => {
    const g = await api(user.token).post('/goals').send({ skillName: 'Guitar', targetLevel: 'intermediate', milestones: ['Learn chords', 'Play a song'] });
    expect(g.status).toBe(201);
    const id = g.body.goal._id;
    expect(g.body.goal.progress).toBe(0);
    const m1 = g.body.goal.milestones[0]._id;
    const u1 = await api(user.token).put(`/goals/${id}`).send({ toggleMilestone: m1, logHours: 2 });
    expect(u1.body.goal.progress).toBe(50);
    expect(u1.body.goal.hoursLogged).toBe(2);
    const u2 = await api(user.token).put(`/goals/${id}`).send({ toggleMilestone: g.body.goal.milestones[1]._id });
    expect(u2.body.goal.status).toBe('completed');
    const other = await registerUser();
    expect((await api(other.token).put(`/goals/${id}`).send({ notes: 'x' })).status).toBe(404);
    expect((await api(user.token).delete(`/goals/${id}`)).status).toBe(200);
  });
});
