const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../src/app');
const { User } = require('../src/models');

let memServer = null;

/** Connect to a fresh database for this test file. Uses MONGO_URI_TEST, or an in-memory MongoDB when USE_MEMORY_SERVER=true. */
async function connect() {
  let base = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017';
  if (process.env.USE_MEMORY_SERVER === 'true') {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    memServer = await MongoMemoryServer.create();
    base = memServer.getUri();
  }
  const dbName = `skillswap_test_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    const url = new URL(base);
    url.pathname = `/${dbName}`;
    if (!url.searchParams.has('directConnection') && (url.hostname === '127.0.0.1' || url.hostname === 'localhost')) {
      url.searchParams.set('directConnection', 'true');
    }
    await mongoose.connect(url.toString());
  } catch (err) {
    const uri = `${base.replace(/\/+$/, '')}/${dbName}`;
    await mongoose.connect(uri);
  }
}

async function disconnect() {
  await mongoose.connection.dropDatabase().catch(() => null);
  await mongoose.disconnect();
  if (memServer) await memServer.stop();
}

let counter = 0;
async function registerUser(overrides = {}) {
  counter += 1;
  const data = { name: `User ${counter}`, email: `user${counter}_${Date.now()}@test.com`, password: 'password123', ...overrides };
  const res = await request(app).post('/api/auth/register').send(data);
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { ...res.body, token: res.body.accessToken, id: res.body.user._id, email: data.email, password: data.password };
}

async function makeRole(user, role) {
  await User.updateOne({ _id: user.id }, { role });
  const res = await request(app).post('/api/auth/login').send({ email: user.email, password: user.password });
  return { ...user, token: res.body.accessToken };
}

const api = (token) => {
  const wrap = (method) => (url) => {
    const req = request(app)[method](`/api${url}`);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };
  return { get: wrap('get'), post: wrap('post'), put: wrap('put'), delete: wrap('delete') };
};

const skillPayload = (o = {}) => ({ title: 'Python for Data Analysis', description: 'Learn pandas, numpy and plotting with real datasets.', category: 'Technology', level: 'intermediate', tags: ['python', 'data'], creditsPerHour: 2, ...o });

module.exports = { app, connect, disconnect, registerUser, makeRole, api, skillPayload, request };
