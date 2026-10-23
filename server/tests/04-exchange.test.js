const { connect, disconnect, registerUser, api, skillPayload } = require('./helpers');
const { Exchange, CreditTransaction, User } = require('../src/models');

beforeAll(connect);
afterAll(disconnect);

const future = (h = 24) => new Date(Date.now() + h * 3600000).toISOString();
async function backdate(exchangeId, sessionId) {
  const ex = await Exchange.findById(exchangeId);
  ex.sessions.id(sessionId).startTime = new Date(Date.now() - 2 * 3600000);
  await ex.save();
}

describe('Module 4: Exchange requests & session booking', () => {
  let mentor; let learner; let skill; let exchangeId;

  beforeAll(async () => {
    mentor = await registerUser({ name: 'Mentor' });
    learner = await registerUser({ name: 'Learner' });
    skill = (await api(mentor.token).post('/skills').send(skillPayload({ creditsPerHour: 2 }))).body.skill;
  });

  test('cannot request own skill, or more credits than you have', async () => {
    expect((await api(mentor.token).post('/exchanges').send({ skillId: skill._id })).status).toBe(400);
    const r = await api(learner.token).post('/exchanges').send({ skillId: skill._id, hoursRequested: 10 });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/20 credits/);
  });

  test('learner sends a credit request; mentor is notified', async () => {
    const r = await api(learner.token).post('/exchanges').send({ skillId: skill._id, hoursRequested: 2, message: 'Keen to learn pandas' });
    expect(r.status).toBe(201);
    expect(r.body.exchange.status).toBe('pending');
    exchangeId = r.body.exchange._id;
    const n = await api(mentor.token).get('/notifications');
    expect(n.body.items.some((x) => x.type === 'exchange')).toBe(true);
    expect((await api(learner.token).post('/exchanges').send({ skillId: skill._id, hoursRequested: 1 })).status).toBe(409);
  });

  test('only the mentor can respond; accepting escrows credits', async () => {
    expect((await api(learner.token).post(`/exchanges/${exchangeId}/respond`).send({ action: 'accept' })).status).toBe(403);
    const r = await api(mentor.token).post(`/exchanges/${exchangeId}/respond`).send({ action: 'accept' });
    expect(r.status).toBe(200);
    expect(r.body.exchange.status).toBe('accepted');
    const me = (await api(learner.token).get('/auth/me')).body.user;
    expect(me.credits).toBe(6); // 10 - 4 held
    expect(me.heldCredits).toBe(4);
    const convos = await api(learner.token).get('/conversations');
    expect(convos.body.items).toHaveLength(1); // conversation auto-created
  });

  test('outsiders cannot view the exchange', async () => {
    const stranger = await registerUser();
    expect((await api(stranger.token).get(`/exchanges/${exchangeId}`)).status).toBe(403);
  });

  test('schedule sessions with validation, hour cap and conflict detection', async () => {
    expect((await api(learner.token).post(`/exchanges/${exchangeId}/sessions`).send({ startTime: new Date(Date.now() - 3600000).toISOString() })).status).toBe(400);
    const s1 = await api(learner.token).post(`/exchanges/${exchangeId}/sessions`).send({ startTime: future(24), durationMinutes: 60, meetingLink: 'https://meet.example.com/abc' });
    expect(s1.status).toBe(201);
    const overlap = await api(mentor.token).post(`/exchanges/${exchangeId}/sessions`).send({ startTime: future(24.5), durationMinutes: 60 });
    expect(overlap.status).toBe(409);
    const tooLong = await api(mentor.token).post(`/exchanges/${exchangeId}/sessions`).send({ startTime: future(48), durationMinutes: 120 });
    expect(tooLong.status).toBe(400);
    const s2 = await api(mentor.token).post(`/exchanges/${exchangeId}/sessions`).send({ startTime: future(48), durationMinutes: 60 });
    expect(s2.status).toBe(201);
    const up = await api(learner.token).get('/exchanges/upcoming');
    expect(up.body.items).toHaveLength(2);
  });

  test('reschedule and cancel a session', async () => {
    const ex = (await api(learner.token).get(`/exchanges/${exchangeId}`)).body.exchange;
    const sid = ex.sessions[1]._id;
    const r = await api(learner.token).put(`/exchanges/${exchangeId}/sessions/${sid}`).send({ startTime: future(72), agenda: 'Plotting' });
    expect(r.body.exchange.sessions[1].agenda).toBe('Plotting');
    const c = await api(learner.token).put(`/exchanges/${exchangeId}/sessions/${sid}`).send({ status: 'cancelled' });
    expect(c.body.exchange.sessions[1].status).toBe('cancelled');
  });

  test('session completes only after both confirm; credits move from escrow to mentor', async () => {
    const ex = (await api(learner.token).get(`/exchanges/${exchangeId}`)).body.exchange;
    const sid = ex.sessions[0]._id;
    expect((await api(learner.token).post(`/exchanges/${exchangeId}/sessions/${sid}/confirm`)).status).toBe(400); // not started
    await backdate(exchangeId, sid);
    const c1 = await api(learner.token).post(`/exchanges/${exchangeId}/sessions/${sid}/confirm`);
    expect(c1.body.exchange.sessions[0].status).toBe('scheduled');
    expect((await api(learner.token).post(`/exchanges/${exchangeId}/sessions/${sid}/confirm`)).status).toBe(400);
    const c2 = await api(mentor.token).post(`/exchanges/${exchangeId}/sessions/${sid}/confirm`);
    expect(c2.body.exchange.sessions[0].status).toBe('completed');
    expect(c2.body.exchange.escrowCredits).toBe(2);
    const m = (await api(mentor.token).get('/auth/me')).body.user;
    expect(m.credits).toBe(12);
    expect(m.stats.sessionsTaught).toBe(1);
    expect(m.badges.some((b) => b.key === 'first_steps')).toBe(true);
    const l = (await api(learner.token).get('/auth/me')).body.user;
    expect(l.stats.sessionsLearned).toBe(1);
    expect(l.heldCredits).toBe(2);
  });

  test('reviews: one per party, updates ratings', async () => {
    expect((await api(learner.token).post(`/exchanges/${exchangeId}/review`).send({ rating: 7 })).status).toBe(400);
    const r = await api(learner.token).post(`/exchanges/${exchangeId}/review`).send({ rating: 5, comment: 'Brilliant teacher' });
    expect(r.status).toBe(201);
    expect((await api(learner.token).post(`/exchanges/${exchangeId}/review`).send({ rating: 4 })).status).toBe(409);
    const prof = await api().get(`/users/${mentor.id}`);
    expect(prof.body.user.rating).toBe(5);
    expect(prof.body.reviews).toHaveLength(1);
    const sk = await api().get(`/skills/${skill._id}`);
    expect(sk.body.skill.rating).toBe(5);
    expect(sk.body.skill.sessionsCompleted).toBe(1);
  });

  test('shared notes and resources', async () => {
    const n = await api(learner.token).put(`/exchanges/${exchangeId}/notes`).send({ notes: '# Session 1\n- groupby' });
    expect(n.body.notes).toMatch(/groupby/);
    const r = await api(mentor.token).post(`/exchanges/${exchangeId}/resources`).send({ title: 'Pandas docs', url: 'https://pandas.pydata.org' });
    expect(r.status).toBe(201);
    const ex = (await api(learner.token).get(`/exchanges/${exchangeId}`)).body.exchange;
    expect(ex.sharedNotes).toMatch(/groupby/);
    expect(ex.resources).toHaveLength(1);
  });

  test('completing the exchange refunds unused escrow', async () => {
    const r = await api(learner.token).post(`/exchanges/${exchangeId}/complete`);
    expect(r.body.exchange.status).toBe('completed');
    const l = (await api(learner.token).get('/auth/me')).body.user;
    expect(l.credits).toBe(8);
    expect(l.heldCredits).toBe(0);
    const txs = await CreditTransaction.find({ user: learner.id });
    expect(txs.map((t) => t.type)).toEqual(expect.arrayContaining(['signup_bonus', 'escrow_hold', 'escrow_release', 'escrow_refund']));
  });

  test('decline and cancel flows', async () => {
    const r1 = await api(learner.token).post('/exchanges').send({ skillId: skill._id, hoursRequested: 1 });
    const d = await api(mentor.token).post(`/exchanges/${r1.body.exchange._id}/respond`).send({ action: 'decline', note: 'Fully booked' });
    expect(d.body.exchange.status).toBe('declined');
    const r2 = await api(learner.token).post('/exchanges').send({ skillId: skill._id, hoursRequested: 1 });
    await api(mentor.token).post(`/exchanges/${r2.body.exchange._id}/respond`).send({ action: 'accept' });
    const before = (await User.findById(learner.id)).credits;
    const c = await api(learner.token).post(`/exchanges/${r2.body.exchange._id}/cancel`).send({ reason: 'Schedule changed' });
    expect(c.body.exchange.status).toBe('cancelled');
    expect((await User.findById(learner.id)).credits).toBe(before + 2);
  });

  test('skill swap requires an own skill and moves no credits', async () => {
    const theirs = (await api(learner.token).post('/skills').send(skillPayload({ title: 'Watercolour Painting', category: 'Arts & Crafts', tags: ['art'] }))).body.skill;
    expect((await api(mentor.token).post('/exchanges').send({ skillId: theirs._id, type: 'swap', offeredSkillId: theirs._id })).status).toBe(400);
    const sw = await api(mentor.token).post('/exchanges').send({ skillId: theirs._id, type: 'swap', offeredSkillId: skill._id });
    expect(sw.status).toBe(201);
    const before = (await User.findById(mentor.id)).credits;
    const a = await api(learner.token).post(`/exchanges/${sw.body.exchange._id}/respond`).send({ action: 'accept' });
    expect(a.body.exchange.escrowCredits).toBe(0);
    expect((await User.findById(mentor.id)).credits).toBe(before);
    const list = await api(mentor.token).get('/exchanges?role=learner');
    expect(list.body.items.every((e) => e.requester._id === mentor.id)).toBe(true);
  });
});
