import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import WebSocket from 'ws';
import { Server } from 'socket.io';
import { createOriginPolicy, originGuard, socketCorsOptions } from '../utils/cors.js';

const ownOrigin = 'https://chat.example.edu';
const policy = createOriginPolicy({ NODE_ENV: 'production', CORS_ORIGINS: ownOrigin });

test('origins must match exactly; invalid configuration fails closed', () => {
  assert.equal(policy(ownOrigin), true);
  assert.equal(policy(undefined), true);
  for (const origin of ['null', ownOrigin + '.evil.test', 'http://chat.example.edu', 'https://evil.test']) assert.equal(policy(origin), false);
  for (const origin of ['*', ownOrigin + '/path', 'http://chat.example.edu', 'not-a-url']) {
    assert.throws(() => createOriginPolicy({ NODE_ENV: 'production', CORS_ORIGINS: origin }));
  }
  assert.equal(createOriginPolicy({})('http://localhost:8081'), false);
  assert.equal(createOriginPolicy({ CORS_ORIGINS: 'http://localhost:8081' })('http://localhost:8081'), true);
});

test('HTTP and Socket.IO enforce the same allowlist, including WebSocket upgrades', async () => {
  const app = express();
  app.use(originGuard(policy));
  app.use(cors({ origin: (origin, callback) => callback(null, policy(origin)) }));
  app.get('/resource', (req, res) => res.json({ ok: true }));
  const server = createServer(app);
  const io = new Server(server, socketCorsOptions(policy));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const path of ['/resource', '/socket.io/?EIO=4&transport=polling']) {
      const allowed = await fetch(base + path, { headers: { Origin: ownOrigin } });
      assert.equal(allowed.status, 200);
      assert.equal(allowed.headers.get('access-control-allow-origin'), ownOrigin);
      await allowed.text();
      const denied = await fetch(base + path, { headers: { Origin: 'https://evil.test' } });
      assert.equal(denied.status, 403);
      assert.equal(denied.headers.get('access-control-allow-origin'), null);
      await denied.text();
      const native = await fetch(base + path);
      assert.equal(native.status, 200);
      await native.text();
    }
    const preflight = await fetch(base + '/resource', { method: 'OPTIONS', headers: { Origin: ownOrigin, 'Access-Control-Request-Method': 'PUT' } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), ownOrigin);
    const connect = origin => new Promise((resolve, reject) => {
      const socket = new WebSocket(base.replace('http:', 'ws:') + '/socket.io/?EIO=4&transport=websocket', { origin });
      socket.on('open', () => { socket.close(); resolve(101); });
      socket.on('unexpected-response', (_req, response) => { response.resume(); resolve(response.statusCode); socket.terminate(); });
      socket.on('error', reject);
    });
    assert.equal(await connect(ownOrigin), 101);
    const status = await connect('https://evil.test');
    // Engine.IO returns HTTP 400 when rejecting a WebSocket upgrade.
    assert.equal(status, 400);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => io.close(resolve));
  }
});
