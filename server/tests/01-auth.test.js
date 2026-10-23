const { connect, disconnect, registerUser, api } = require('./helpers');
const { User } = require('../src/models');

beforeAll(connect);
afterAll(disconnect);

describe('Module 1: Authentication & access control', () => {
  test('registers a user with signup bonus and tokens', async () => {
    const u = await registerUser({ name: 'Asha' });
    expect(u.token).toBeTruthy();
    expect(u.refreshToken).toBeTruthy();
    expect(u.user.credits).toBe(10);
    expect(u.user.password).toBeUndefined();
    expect(u.user.role).toBe('user');
  });

  test('rejects invalid registration input', async () => {
    const res = await api().post('/auth/register').send({ name: 'A', email: 'bad', password: 'short' });
    expect(res.status).toBe(422);
    expect(res.body.errors.length).toBeGreaterThan(0);
  });

  test('rejects duplicate email', async () => {
    const u = await registerUser();
    const res = await api().post('/auth/register').send({ name: 'Dup', email: u.email, password: 'password123' });
    expect(res.status).toBe(409);
  });

  test('login succeeds with right password and fails otherwise', async () => {
    const u = await registerUser();
    const ok = await api().post('/auth/login').send({ email: u.email, password: u.password });
    expect(ok.status).toBe(200);
    expect(ok.body.accessToken).toBeTruthy();
    const bad = await api().post('/auth/login').send({ email: u.email, password: 'wrongpass1' });
    expect(bad.status).toBe(401);
  });

  test('protected routes require a valid token', async () => {
    expect((await api().get('/auth/me')).status).toBe(401);
    expect((await api('garbage').get('/auth/me')).status).toBe(401);
    const u = await registerUser();
    const me = await api(u.token).get('/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(u.email);
  });

  test('refresh token rotates and logout revokes it', async () => {
    const u = await registerUser();
    const r1 = await api().post('/auth/refresh').send({ refreshToken: u.refreshToken });
    expect(r1.status).toBe(200);
    const old = await api().post('/auth/refresh').send({ refreshToken: u.refreshToken });
    expect(old.status).toBe(401); // rotated
    await api(r1.body.accessToken).post('/auth/logout');
    const after = await api().post('/auth/refresh').send({ refreshToken: r1.body.refreshToken });
    expect(after.status).toBe(401);
  });

  test('email verification flow', async () => {
    const u = await registerUser();
    const res = await api().get(`/auth/verify-email/${u.devVerifyToken}`);
    expect(res.status).toBe(200);
    const me = await api(u.token).get('/auth/me');
    expect(me.body.user.emailVerified).toBe(true);
    expect((await api().get(`/auth/verify-email/${u.devVerifyToken}`)).status).toBe(400);
  });

  test('forgot + reset password flow', async () => {
    const u = await registerUser();
    const f = await api().post('/auth/forgot-password').send({ email: u.email });
    expect(f.body.devResetToken).toBeTruthy();
    const r = await api().post(`/auth/reset-password/${f.body.devResetToken}`).send({ password: 'newpassword9' });
    expect(r.status).toBe(200);
    expect((await api().post('/auth/login').send({ email: u.email, password: 'newpassword9' })).status).toBe(200);
    expect((await api().post('/auth/login').send({ email: u.email, password: u.password })).status).toBe(401);
  });

  test('change password requires current password', async () => {
    const u = await registerUser();
    expect((await api(u.token).post('/auth/change-password').send({ currentPassword: 'nope', newPassword: 'another123' })).status).toBe(400);
    expect((await api(u.token).post('/auth/change-password').send({ currentPassword: u.password, newPassword: 'another123' })).status).toBe(200);
  });

  test('role-based access: normal users cannot reach admin routes', async () => {
    const u = await registerUser();
    expect((await api(u.token).get('/admin/users')).status).toBe(403);
  });

  test('suspended and banned users are blocked', async () => {
    const u = await registerUser();
    await User.updateOne({ _id: u.id }, { status: 'suspended', suspendedUntil: new Date(Date.now() + 86400000) });
    expect((await api(u.token).get('/auth/me')).status).toBe(403);
    expect((await api().post('/auth/login').send({ email: u.email, password: u.password })).status).toBe(403);
    await User.updateOne({ _id: u.id }, { status: 'suspended', suspendedUntil: new Date(Date.now() - 1000) });
    expect((await api(u.token).get('/auth/me')).status).toBe(200); // auto-lifted
    await User.updateOne({ _id: u.id }, { status: 'banned' });
    expect((await api(u.token).get('/auth/me')).status).toBe(403);
  });
});
