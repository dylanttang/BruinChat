import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import WebSocket from 'ws';
import User from '../../models/User.js';
import Chat from '../../models/Chat.js';
import auth from '../routes/auth.js';
import users from '../routes/users.js';
import { devAuth } from '../middleware/devAuth.js';
import { isDevLoginEnabled } from '../utils/devLogin.js';
import { socketAuth, registerChatHandlers } from '../utils/socketAuth.js';

const SECRET = 'isolated-auth-test-secret-over-32-characters';
const memberId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const memberChat = 'cccccccccccccccccccccccc';
const otherChat = 'dddddddddddddddddddddddd';
const token = (sub) => jwt.sign({ sub }, SECRET);

// Stub the database: one user who is a member of `memberChat` only.
function stubDb() {
  const originals = { findById: User.findById, exists: Chat.exists };
  User.findById = (id) => {
    const doc = id === memberId
      ? { _id: memberId, role: 'user', displayName: 'Member', deletedAt: null, bannedAt: null, toObject() { return { ...this }; } }
      : null;
    const query = Promise.resolve(doc);
    query.lean = async () => doc;
    return query;
  };
  Chat.exists = async ({ _id, members }) => (_id === memberChat && members === memberId ? { _id } : null);
  return () => { User.findById = originals.findById; Chat.exists = originals.exists; };
}

function withEnv(values, fn) {
  const previous = {};
  for (const key of Object.keys(values)) {
    previous[key] = process.env[key];
    if (values[key] === undefined) delete process.env[key]; else process.env[key] = values[key];
  }
  return Promise.resolve(fn()).finally(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
}

async function listen(server) {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return `127.0.0.1:${server.address().port}`;
}

test('dev login is only enabled with DEV_AUTH=true outside production', () => {
  assert.equal(isDevLoginEnabled({}), false);
  assert.equal(isDevLoginEnabled({ DEV_AUTH: 'true' }), true);
  assert.equal(isDevLoginEnabled({ DEV_AUTH: 'true', NODE_ENV: 'development' }), true);
  assert.equal(isDevLoginEnabled({ DEV_AUTH: 'true', NODE_ENV: 'production' }), false);
  assert.equal(isDevLoginEnabled({ DEV_AUTH: '1' }), false);
});

test('HTTP: x-user-id is ignored, dev endpoints are gated, dev login issues a working token', async () => {
  const restore = stubDb();
  const app = express();
  app.use(express.json());
  app.use('/api/auth', auth);
  app.use('/api/users', users);
  app.get('/api/protected', devAuth, (req, res) => res.json({ userId: req.user._id }));
  const server = createServer(app);
  const host = await listen(server);
  const call = (path, init = {}) => fetch(`http://${host}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });

  try {
    await withEnv({ JWT_SECRET: SECRET, DEV_AUTH: undefined, NODE_ENV: undefined }, async () => {
      // The old bypass: a raw user ID header no longer authenticates.
      assert.equal((await call('/api/protected', { headers: { 'x-user-id': memberId } })).status, 401);
      assert.equal((await call('/api/protected', { headers: { Authorization: `Bearer ${token(memberId)}` } })).status, 200);
      assert.equal((await call('/api/protected', { headers: { Authorization: 'Bearer not-a-jwt' } })).status, 401);

      // Dev endpoints don't exist unless DEV_AUTH=true.
      assert.equal((await call('/api/users/dev-list')).status, 404);
      assert.equal((await call('/api/auth/dev-login', { method: 'POST', body: JSON.stringify({ userId: memberId }) })).status, 404);
    });

    await withEnv({ JWT_SECRET: SECRET, DEV_AUTH: 'true', NODE_ENV: 'production' }, async () => {
      assert.equal((await call('/api/auth/dev-login', { method: 'POST', body: JSON.stringify({ userId: memberId }) })).status, 404);
    });

    await withEnv({ JWT_SECRET: SECRET, DEV_AUTH: 'true', NODE_ENV: undefined }, async () => {
      const res = await call('/api/auth/dev-login', { method: 'POST', body: JSON.stringify({ userId: memberId }) });
      assert.equal(res.status, 200);
      const { token: issued } = await res.json();
      const me = await call('/api/protected', { headers: { Authorization: `Bearer ${issued}` } });
      assert.deepEqual(await me.json(), { userId: memberId });

      assert.equal((await call('/api/auth/dev-login', { method: 'POST', body: JSON.stringify({ userId: 'bbbbbbbbbbbbbbbbbbbbbbbb' }) })).status, 404);
      assert.equal((await call('/api/auth/dev-login', { method: 'POST', body: JSON.stringify({ userId: 'nope' }) })).status, 400);
    });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    restore();
  }
});

// Minimal Socket.IO client over a raw WebSocket (Engine.IO v4 packets):
// "40{auth}" connects, "4<id>[event,...]" emits with an ack, "43<id>[...]"
// is the ack, "44{message}" is a refused connection.
function openSocket(host, auth) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${host}/socket.io/?EIO=4&transport=websocket`);
    const timer = setTimeout(() => { ws.terminate(); reject(new Error('socket timed out')); }, 3000);
    const acks = new Map();
    let nextAck = 0;
    const client = {
      emit(event, arg) {
        return new Promise((ackResolve) => {
          const id = nextAck++;
          acks.set(id, ackResolve);
          ws.send(`42${id}${JSON.stringify([event, arg])}`);
        });
      },
      close() { ws.close(); },
    };
    ws.on('message', (data) => {
      const packet = data.toString();
      if (packet.startsWith('0')) ws.send(`40${JSON.stringify(auth)}`);
      else if (packet.startsWith('40')) { clearTimeout(timer); resolve({ connected: true, client }); }
      else if (packet.startsWith('44')) { clearTimeout(timer); ws.close(); resolve({ connected: false, error: JSON.parse(packet.slice(2)).message }); }
      else if (packet.startsWith('43')) {
        const [, id, payload] = /^43(\d+)(.*)$/.exec(packet);
        acks.get(Number(id))?.(JSON.parse(payload)[0]);
      }
    });
    ws.on('error', (err) => { clearTimeout(timer); reject(err); });
  });
}

test('Socket.IO: connections need a valid token and chat rooms need membership', async () => {
  const restore = stubDb();
  const server = createServer();
  const io = new Server(server);
  io.use(socketAuth);
  io.on('connection', registerChatHandlers);
  const host = await listen(server);

  try {
    await withEnv({ JWT_SECRET: SECRET }, async () => {
      assert.deepEqual(await openSocket(host, {}), { connected: false, error: 'Missing Authorization bearer token' });
      assert.deepEqual(await openSocket(host, { userId: memberId }), { connected: false, error: 'Missing Authorization bearer token' });
      assert.deepEqual(await openSocket(host, { token: 'forged' }), { connected: false, error: 'Invalid or expired token' });
      assert.deepEqual(
        await openSocket(host, { token: token('bbbbbbbbbbbbbbbbbbbbbbbb') }),
        { connected: false, error: 'User not found' }
      );

      const { connected, client } = await openSocket(host, { token: token(memberId) });
      assert.equal(connected, true);
      assert.deepEqual(await client.emit('joinChat', memberChat), { ok: true });
      assert.deepEqual(await client.emit('joinChat', otherChat), { ok: false, error: 'You are not a member of this chat' });
      assert.deepEqual(await client.emit('joinChat', 'not-an-id'), { ok: false, error: 'Invalid chat ID' });

      const [socket] = await io.fetchSockets();
      assert.equal(socket.rooms.has(memberChat), true);
      assert.equal(socket.rooms.has(otherChat), false);
      client.close();
    });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => io.close(resolve));
    restore();
  }
});
