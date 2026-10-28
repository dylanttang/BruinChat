import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import User from '../../models/User.js';
import { request } from './helpers/http.js';

let requestNumber = 0;
const original = { verify: OAuth2Client.prototype.verifyIdToken, find: User.findOne, exists: User.exists, save: User.prototype.save };
let payload, query, saved, verification;
beforeEach(() => {
  process.env.JWT_SECRET = 'test-only-random-secret-over-thirty-two-characters';
  process.env.GOOGLE_WEB_CLIENT_ID = 'test-client.apps.googleusercontent.com';
  delete process.env.GOOGLE_IOS_CLIENT_ID;
  delete process.env.GOOGLE_ANDROID_CLIENT_ID;
  payload = { sub: '123456789012345678901', email: 'student@g.ucla.edu', email_verified: true, hd: 'g.ucla.edu', name: 'Student' };
  saved = null; query = null; verification = null;
  OAuth2Client.prototype.verifyIdToken = async (options) => { verification = options; return { getPayload: () => payload }; };
  User.findOne = async (filter) => { query = filter; return null; };
  User.exists = async () => null;
  User.prototype.save = async function () { saved = this; return this; };
});
afterEach(() => {
  OAuth2Client.prototype.verifyIdToken = original.verify;
  User.findOne = original.find;
  User.exists = original.exists;
  User.prototype.save = original.save;
});
async function exchange(body = { idToken: 'google-token' }) {
  return request('/api/auth/google', { method: 'POST', body, headers: { 'X-Forwarded-For': `192.0.2.${++requestNumber}` } });
}
test('missing or non-string Google tokens fail before verification', async () => {
  for (const body of [{}, { idToken: 7 }, { idToken: '' }]) assert.equal((await exchange(body)).status, 400);
  assert.equal(verification, null);
});
test('unverified, non-UCLA and lookalike domains cannot create accounts', async () => {
  for (const email of ['student@example.org', 'student@ucla.edu.evil.test']) {
    payload.email = email;
    assert.equal((await exchange()).status, 403);
  }
  payload.email = 'student@ucla.edu'; payload.email_verified = false;
  assert.equal((await exchange()).status, 403);
  assert.equal(saved, null);
});
test('verified UCLA login verifies the configured audience and issues an expiring JWT', async () => {
  const result = await exchange();
  assert.equal(result.status, 200);
  assert.deepEqual(verification, { idToken: 'google-token', audience: ['test-client.apps.googleusercontent.com'] });
  const claims = jwt.verify(result.data.token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  assert.equal(claims.sub, saved._id.toString());
  assert.ok(claims.exp > claims.iat);
  assert.equal(claims.role, 'user');
});
test('username collisions create a distinct account instead of taking over an existing identity', async () => {
  User.exists = async () => ({ _id: 'another-user' });
  const result = await exchange();
  assert.equal(result.status, 200);
  assert.deepEqual(query, { $or: [{ googleId: payload.sub }, { email: payload.email }] });
  assert.notEqual(saved.username, 'student');
  assert.equal(saved.role, 'user');
  assert.equal(saved.googleId, payload.sub);
});
test('a conflicting Google identity cannot attach to an existing email account', async () => {
  User.findOne = async () => ({ googleId: 'different-google-identity' });
  assert.equal((await exchange()).status, 401);
  assert.equal(saved, null);
});
test('banned users cannot obtain a fresh JWT', async () => {
  User.findOne = async () => ({ googleId: payload.sub, bannedAt: new Date() });
  const result = await exchange();
  assert.equal(result.status, 403);
  assert.equal(result.data.token, undefined);
  assert.equal(saved, null);
});
test('missing OAuth configuration fails closed', async () => {
  delete process.env.GOOGLE_WEB_CLIENT_ID;
  assert.equal((await exchange()).status, 500);
  assert.equal(verification, null);
});

test('personal Google accounts with a UCLA email cannot bypass the hosted-domain restriction', async () => {
  delete payload.hd;
  assert.equal((await exchange()).status, 403);
  assert.equal(saved, null);
});
