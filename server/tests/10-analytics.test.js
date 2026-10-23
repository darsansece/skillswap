const { connect, disconnect, registerUser, makeRole, api, skillPayload } = require('./helpers');
const { Exchange } = require('../src/models');

beforeAll(connect);
afterAll(disconnect);

describe('Module 11: Reports, dashboards & analytics', () => {
  let admin; let mentor; let learner;
  beforeAll(async () => {
    admin = await makeRole(await registerUser({ name: 'Admin2' }), 'admin');
    mentor = await registerUser({ name: 'Mentor2' });
    learner = await registerUser({ name: 'Learner2' });
    const skill = (await api(mentor.token).post('/skills').send(skillPayload({ creditsPerHour: 1 }))).body.skill;
    const ex = (await api(learner.token).post('/exchanges').send({ skillId: skill._id, hoursRequested: 1 })).body.exchange;
    await api(mentor.token).post(`/exchanges/${ex._id}/respond`).send({ action: 'accept' });
    const s = (await api(learner.token).post(`/exchanges/${ex._id}/sessions`).send({ startTime: new Date(Date.now() + 86400000).toISOString(), durationMinutes: 60 })).body.session;
    const doc = await Exchange.findById(ex._id); doc.sessions.id(s._id).startTime = new Date(Date.now() - 7200000); await doc.save();
    await api(learner.token).post(`/exchanges/${ex._id}/sessions/${s._id}/confirm`);
    await api(mentor.token).post(`/exchanges/${ex._id}/sessions/${s._id}/confirm`);
    await api(learner.token).post(`/exchanges/${ex._id}/review`).send({ rating: 4 });
  });

  test('personal dashboard summarises activity', async () => {
    const m = await api(mentor.token).get('/analytics/me?days=7');
    expect(m.status).toBe(200);
    expect(m.body.summary.sessionsTaught).toBe(1);
    expect(m.body.summary.credits).toBe(11);
    expect(m.body.creditsFlow.earned).toHaveLength(7);
    expect(m.body.creditsFlow.earned.reduce((a, d) => a + d.value, 0)).toBe(11);
    expect(m.body.ratingDistribution.find((r) => r.rating === 4).count).toBe(1);
    expect(m.body.skillPerformance[0].sessions).toBe(1);
    const l = await api(learner.token).get('/analytics/me');
    expect(l.body.hoursByCategory[0]).toEqual({ category: 'Technology', hours: 1 });
  });

  test('platform analytics for staff only', async () => {
    expect((await api(mentor.token).get('/analytics/platform')).status).toBe(403);
    const p = await api(admin.token).get('/analytics/platform?days=14');
    expect(p.body.totals.users).toBe(3);
    expect(p.body.totals.completedSessions).toBe(1);
    expect(p.body.signups).toHaveLength(14);
    expect(p.body.statusBreakdown.accepted).toBe(1);
    expect(p.body.topSkills[0].requests).toBe(1);
    expect(p.body.categoryDistribution[0].category).toBe('Technology');
  });

  test('CSV exports', async () => {
    const u = await api(admin.token).get('/analytics/export/users');
    expect(u.headers['content-type']).toMatch(/text\/csv/);
    expect(u.text.split('\n')[0]).toMatch(/^id,name,email/);
    expect(u.text.split('\n')).toHaveLength(4);
    const t = await api(admin.token).get('/analytics/export/transactions');
    expect(t.text).toMatch(/earned_teaching/);
    expect((await api(admin.token).get('/analytics/export/nope')).status).toBe(400);
  });
});
