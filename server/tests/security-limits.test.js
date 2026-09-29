import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import { checkJwtSecret } from '../utils/jwtSecret.js';
import { globalKey, globalRateLimit, authRateLimit } from '../middleware/rateLimit.js';

const SECRET = 'isolated-rate-limit-test-secret-over-32-chars';

test('JWT_SECRET: production refuses weak secrets, development only warns', () => {
  const strong = 'a'.repeat(48);
  for (const JWT_SECRET of [undefined, '', 'short', 'replace-with-a-long-random-secret']) {
    assert.throws(() => checkJwtSecret({ NODE_ENV: 'production', JWT_SECRET }), /Refusing to start/);
    assert.equal(typeof checkJwtSecret({ JWT_SECRET }), 'string');
  }
  assert.equal(checkJwtSecret({ NODE_ENV: 'production', JWT_SECRET: strong }), null);
  assert.equal(checkJwtSecret({ JWT_SECRET: strong }), null);
});

test('global limiter keys verified tokens by user and everything else by IP', () => {
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = SECRET;
  try {
    const req = (authorization) => ({ ip: '1.2.3.4', headers: authorization ? { authorization } : {} });
    assert.equal(globalKey(req(`Bearer ${jwt.sign({ sub: 'user-a' }, SECRET)}`)), 'u:user-a');
    assert.equal(globalKey(req(`Bearer ${jwt.sign({ sub: 'user-a' }, 'some-other-secret-entirely-xxxxx')}`)), 'ip:1.2.3.4');
    assert.equal(globalKey(req('Bearer garbage')), 'ip:1.2.3.4');
    assert.equal(globalKey(req()), 'ip:1.2.3.4');
  } finally {
    if (previous === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previous;
  }
});

test('one heavy user on a shared IP does not use up anyone else\'s quota', async () => {
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = SECRET;
  const app = express();
  app.use('/api', globalRateLimit);
  app.post('/api/auth/google', authRateLimit, (req, res) => res.json({ ok: true }));
  app.get('/api/ping', (req, res) => res.json({ ok: true }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (token) => fetch(`${base}/api/ping`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    .then(async (res) => { await res.text(); return res.status; });

  try {
    // Everyone below shares 127.0.0.1, like students behind campus WiFi.
    const heavy = jwt.sign({ sub: 'heavy-user' }, SECRET);
    const statuses = [];
    for (let i = 0; i < 301; i++) statuses.push(await get(heavy));
    assert.equal(statuses.filter((s) => s === 200).length, 300);
    assert.equal(statuses.at(-1), 429);

    assert.equal(await get(jwt.sign({ sub: 'classmate' }, SECRET)), 200);
    assert.equal(await get(), 200);

    // Sign-in allows 100 per 15 minutes per IP (it used to be 10).
    const signIns = [];
    for (let i = 0; i < 101; i++) {
      const res = await fetch(`${base}/api/auth/google`, { method: 'POST' });
      await res.text();
      signIns.push(res.status);
    }
    assert.equal(signIns.filter((s) => s === 200).length, 100);
    assert.equal(signIns.at(-1), 429);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    if (previous === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previous;
  }
});
