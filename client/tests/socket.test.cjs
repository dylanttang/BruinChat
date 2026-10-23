const { test } = require('node:test');
const assert = require('node:assert/strict');
const loadModule = require('./helpers/load-module.cjs');
function setup() {
  let options, onChange, token = 'first-token', fail = false;
  const events = {};
  const socket = { disconnected: false, on: (event, fn) => { events[event] = fn; }, disconnect() { this.disconnected = true; events.disconnect?.('io client disconnect'); } };
  let unsubscribed = false;
  const api = loadModule('lib/socket.ts', {
    'socket.io-client': { io: (_url, opts) => { options = opts; return socket; } },
    './api': {
      API_URL: 'http://localhost:3000',
      getAuthToken: async () => { if (fail) throw new Error('keychain locked'); return token; },
      onSessionChanged: (fn) => { onChange = fn; return () => { unsubscribed = true; }; },
    },
  });
  return { api, socket, events, change: () => onChange(), unsubscribed: () => unsubscribed,
    token: (next) => { token = next; }, fail: () => { fail = true; },
    auth: () => new Promise((resolve) => options.auth(resolve)),
  };
}
test('socket reconnects read the current JWT rather than a captured user ID', async () => {
  const h = setup(); await h.api.createSocket();
  assert.equal((await h.auth()).token, 'first-token');
  h.token('rotated-token');
  assert.equal((await h.auth()).token, 'rotated-token');
  assert.equal(Object.hasOwn(await h.auth(), 'userId'), false);
});
test('unavailable secure storage cannot become a dev-auth fallback', async () => {
  const h = setup(); await h.api.createSocket(); h.fail();
  assert.equal((await h.auth()).token, null);
});
test('session change disconnects an active socket and releases its listener', async () => {
  const h = setup(); await h.api.createSocket(); h.change();
  assert.equal(h.socket.disconnected, true);
  assert.equal(h.unsubscribed(), true);
});
test('temporary transport disconnections retain the session listener for reconnect', async () => {
  const h = setup(); await h.api.createSocket(); h.events.disconnect('transport close');
  assert.equal(h.unsubscribed(), false);
  h.events.disconnect('io server disconnect');
  assert.equal(h.unsubscribed(), true);
});
