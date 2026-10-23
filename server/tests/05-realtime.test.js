const http = require('http');
const { io: Client } = require('socket.io-client');
const { connect, disconnect, registerUser, api, app } = require('./helpers');
const { initSocket } = require('../src/socket');

let server; let port;
beforeAll(async () => {
  await connect();
  server = http.createServer(app);
  initSocket(server);
  await new Promise((r) => server.listen(0, r));
  port = server.address().port;
});
afterAll(async () => {
  const { getIO } = require('../src/services/notify');
  getIO().close();
  await new Promise((r) => server.close(r));
  await disconnect();
});

const connectClient = (token) => new Promise((resolve, reject) => {
  const c = Client(`http://localhost:${port}`, { auth: { token }, transports: ['websocket'], forceNew: true });
  c.on('connect', () => resolve(c));
  c.on('connect_error', reject);
});
const once = (c, ev) => new Promise((r) => c.once(ev, r));

describe('Module 5: Real-time communication & collaboration', () => {
  let a; let b; let convoId;
  beforeAll(async () => {
    a = await registerUser({ name: 'Alice' });
    b = await registerUser({ name: 'Bob' });
  });

  test('REST: start conversation, send, list, unread, mark read', async () => {
    expect((await api(a.token).post('/conversations').send({ userId: a.id })).status).toBe(400);
    const c = await api(a.token).post('/conversations').send({ userId: b.id });
    convoId = c.body.conversation._id;
    const again = await api(b.token).post('/conversations').send({ userId: a.id });
    expect(again.body.conversation._id).toBe(convoId); // same thread reused
    expect((await api(a.token).post(`/conversations/${convoId}/messages`).send({})).status).toBe(400);
    await api(a.token).post(`/conversations/${convoId}/messages`).send({ text: 'Hi Bob!' });
    const list = await api(b.token).get('/conversations');
    expect(list.body.items[0].unread).toBe(1);
    expect(list.body.items[0].lastMessage.text).toBe('Hi Bob!');
    await api(b.token).post(`/conversations/${convoId}/read`);
    expect((await api(b.token).get('/conversations')).body.items[0].unread).toBe(0);
    const msgs = await api(b.token).get(`/conversations/${convoId}/messages`);
    expect(msgs.body.items).toHaveLength(1);
    const outsider = await registerUser();
    expect((await api(outsider.token).get(`/conversations/${convoId}/messages`)).status).toBe(403);
    // offline recipient gets a notification
    const n = await api(b.token).get('/notifications?unread=true');
    expect(n.body.items.some((x) => x.type === 'message')).toBe(true);
  });

  test('socket auth rejects bad tokens', async () => {
    await expect(connectClient('bad-token')).rejects.toBeTruthy();
  });

  test('socket: live messages, typing indicators and presence', async () => {
    const ca = await connectClient(a.token);
    const cb = await connectClient(b.token);
    const online = await new Promise((r) => ca.emit('presence:list', [b.id], r));
    expect(online).toContain(b.id);

    const typingP = once(cb, 'typing');
    ca.emit('typing', { conversationId: convoId, typing: true });
    const t = await typingP;
    expect(t).toMatchObject({ conversationId: convoId, typing: true, name: 'Alice' });

    const incoming = once(cb, 'message:new');
    const ack = await new Promise((r) => ca.emit('message:send', { conversationId: convoId, text: 'Live hello' }, r));
    expect(ack.ok).toBe(true);
    const m = await incoming;
    expect(m.message.text).toBe('Live hello');

    const offline = once(ca, 'presence');
    cb.disconnect();
    expect(await offline).toMatchObject({ userId: b.id, online: false });
    ca.disconnect();
  });

  test('socket: live notifications are pushed', async () => {
    const cb = await connectClient(b.token);
    const p = once(cb, 'notification');
    await api(a.token).post(`/users/${b.id}/endorse`).send({ skill: 'Chess' });
    const n = await p;
    expect(n.title).toMatch(/endorsed/);
    cb.disconnect();
  });

  test('notifications: mark read, mark all, delete', async () => {
    const list = await api(b.token).get('/notifications');
    const id = list.body.items[0]._id;
    await api(b.token).post(`/notifications/${id}/read`);
    await api(b.token).post('/notifications/read-all');
    expect((await api(b.token).get('/notifications')).body.unread).toBe(0);
    await api(b.token).delete(`/notifications/${id}`);
    expect((await api(b.token).get('/notifications')).body.total).toBe(list.body.total - 1);
  });

  test('file upload for chat attachments', async () => {
    const res = await api(a.token).post('/uploads').attach('file', Buffer.from('hello notes'), 'notes.txt');
    expect(res.status).toBe(201);
    expect(res.body.url).toMatch(/^\/uploads\//);
    const bad = await api(a.token).post('/uploads').attach('file', Buffer.from('x'), 'evil.exe');
    expect(bad.status).toBe(400);
  });
});
