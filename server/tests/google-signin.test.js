import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { OAuth2Client } from 'google-auth-library';
import User from '../../models/User.js';
import auth from '../routes/auth.js';

// In-memory stand-in for the users collection, enforcing the unique username
// index like MongoDB would.
function fakeUsers(seed) {
  const store = seed.map((fields) => new User(fields));
  const matches = (doc, query) => Object.entries(query).every(([key, value]) =>
    key === '$or' ? value.some((clause) => matches(doc, clause)) : doc[key] === value);
  const originals = { findOne: User.findOne, exists: User.exists, save: User.prototype.save };

  User.findOne = async (query) => store.find((doc) => matches(doc, query)) ?? null;
  User.exists = async (query) => (store.some((doc) => matches(doc, query)) ? { _id: 'x' } : null);
  User.prototype.save = async function save() {
    if (store.some((doc) => doc !== this && doc.username === this.username)) {
      throw Object.assign(new Error('duplicate key'), { code: 11000, keyPattern: { username: 1 } });
    }
    if (!store.includes(this)) store.push(this);
    return this;
  };

  const restore = () => {
    User.findOne = originals.findOne;
    User.exists = originals.exists;
    User.prototype.save = originals.save;
  };
  return { store, restore };
}

// Google's verifyIdToken, faked: the "idToken" is a JSON payload.
function fakeGoogle() {
  const original = OAuth2Client.prototype.verifyIdToken;
  OAuth2Client.prototype.verifyIdToken = async ({ idToken }) => ({ getPayload: () => JSON.parse(idToken) });
  return () => { OAuth2Client.prototype.verifyIdToken = original; };
}

test('Google sign-in never matches accounts by username', async () => {
  const env = { JWT_SECRET: process.env.JWT_SECRET, GOOGLE_WEB_CLIENT_ID: process.env.GOOGLE_WEB_CLIENT_ID };
  process.env.JWT_SECRET = 'isolated-signin-test-secret-over-32-characters';
  process.env.GOOGLE_WEB_CLIENT_ID = 'test-client';

  // A seeded admin account with no Google ID or email (like the dev seed
  // data), and a normal account already linked to Google.
  const { store, restore } = fakeUsers([
    { username: 'jonathan', displayName: 'Jonathan', role: 'admin' },
    { username: 'bruin', displayName: 'Joe Bruin', email: 'bruin@g.ucla.edu', googleId: 'google-bruin' },
  ]);
  const restoreGoogle = fakeGoogle();

  const app = express();
  app.use(express.json());
  app.use('/api/auth', auth);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const signIn = async (claims) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: JSON.stringify({ email_verified: true, name: 'Someone', ...claims }) }),
    });
    return { status: res.status, body: await res.json() };
  };

  try {
    // A stranger whose email prefix matches the seeded admin gets a new,
    // separate account, and the admin account is left untouched.
    const stranger = await signIn({ sub: 'google-stranger', email: 'jonathan@ucla.edu' });
    assert.equal(stranger.status, 200);
    assert.equal(stranger.body.user.username, 'jonathan-2');
    assert.equal(stranger.body.user.role, 'user');
    const admin = store.find((u) => u.username === 'jonathan');
    assert.equal(admin.googleId, undefined);
    assert.equal(admin.email, undefined);

    // Signing in again with the same Google account returns the same account.
    const again = await signIn({ sub: 'google-stranger', email: 'jonathan@ucla.edu' });
    assert.equal(again.body.user._id, stranger.body.user._id);

    // A third "jonathan" gets the next free username.
    const third = await signIn({ sub: 'google-third', email: 'jonathan@g.ucla.edu' });
    assert.equal(third.body.user.username, 'jonathan-3');

    // An email already linked to a different Google account is refused.
    const hijack = await signIn({ sub: 'google-other', email: 'bruin@g.ucla.edu' });
    assert.equal(hijack.status, 409);
    assert.equal(store.find((u) => u.username === 'bruin').googleId, 'google-bruin');

    // The real owner still signs in normally.
    const owner = await signIn({ sub: 'google-bruin', email: 'bruin@g.ucla.edu' });
    assert.equal(owner.status, 200);
    assert.equal(owner.body.user.username, 'bruin');
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    restoreGoogle();
    restore();
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
