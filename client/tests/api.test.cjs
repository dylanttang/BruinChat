const { test } = require('node:test');
const assert = require('node:assert/strict');
const loadModule = require('./helpers/load-module.cjs');

function setup(initialToken = null) {
  let token = initialToken;
  const requests = [];
  let response = { ok: true, json: async () => ({ token: 'new-token', user: { _id: 'user' } }) };
  let writeError = false;
  const api = loadModule('lib/api.ts', { './googleNativeSignIn': { signOutOfNativeGoogle: async () => {} },
    './tokenStorage': {
    getStoredToken: async () => token,
    storeToken: async (next) => { if (writeError) throw new Error('storage failed'); token = next; },
    removeStoredToken: async () => { token = null; },
  } }, { fetch: async (url, init) => { requests.push({ url, init }); return response; } });
  return { api, requests, token: () => token, failStorage: () => { writeError = true; }, respond: (next) => { response = next; } };
}
test('API sends the stored JWT with JSON requests and preserves custom headers', async () => {
  const h = setup('jwt');
  await h.api.apiFetch('/api/users/me', { headers: { 'X-Request-Id': 'abc' } });
  const headers = h.requests[0].init.headers;
  assert.equal(headers.get('Authorization'), 'Bearer jwt');
  assert.equal(headers.get('X-Request-Id'), 'abc');
  assert.equal(headers.get('Content-Type'), 'application/json');
  assert.equal(headers.has('x-user-id'), false);
});
test('API never invents authentication when signed out', async () => {
  const h = setup();
  await h.api.apiFetch('/api/users/me');
  assert.equal(h.requests[0].init.headers.has('Authorization'), false);
  assert.equal(h.requests[0].init.headers.has('x-user-id'), false);
});
test('multipart requests let fetch supply the content-type boundary', async () => {
  const h = setup('jwt');
  await h.api.apiFetch('/api/example', { method: 'POST', body: new FormData() });
  assert.equal(h.requests[0].init.headers.has('Content-Type'), false);
});
test('successful Google exchange persists the token before notifying sessions', async () => {
  const h = setup();
  let observed;
  h.api.onSessionChanged(() => { observed = h.token(); });
  await h.api.signInWithGoogleIdToken('google-token');
  assert.equal(observed, 'new-token');
  assert.equal(JSON.parse(h.requests[0].init.body).idToken, 'google-token');
});
test('failed Google exchange does not overwrite the existing session', async () => {
  const h = setup('old-token');
  h.respond({ ok: false, json: async () => ({ error: 'UCLA account required' }) });
  await assert.rejects(h.api.signInWithGoogleIdToken('bad-token'), /UCLA account required/);
  assert.equal(h.token(), 'old-token');
});
test('failed secure persistence does not announce a successful sign-in', async () => {
  const h = setup(); h.failStorage();
  let notified = false;
  h.api.onSessionChanged(() => { notified = true; });
  await assert.rejects(h.api.signInWithGoogleIdToken('google-token'), /storage failed/);
  assert.equal(notified, false);
});
test('logout clears the token before notification and respects listener unsubscribe', async () => {
  const h = setup('jwt');
  let calls = 0;
  const off = h.api.onSessionChanged(() => { calls++; assert.equal(h.token(), null); });
  await h.api.clearAuthToken();
  off();
  await h.api.clearAuthToken();
  assert.equal(calls, 1);
});
