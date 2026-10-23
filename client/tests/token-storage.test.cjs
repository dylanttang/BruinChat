const { test } = require('node:test');
const assert = require('node:assert/strict');
const loadModule = require('./helpers/load-module.cjs');

function setup(platform, { cleanupFails = false, secureWriteFails = false } = {}) {
  let value = null, attempts = 0;
  const writes = [], removed = [];
  const store = loadModule(`lib/tokenStorage${platform === 'web' ? '.web' : ''}.ts`, {
    '@react-native-async-storage/async-storage': {
      async multiRemove(keys) {
        attempts++;
        if (cleanupFails && attempts === 1) throw new Error('storage unavailable');
        removed.push([...keys]);
      },
    },
    'expo-secure-store': {
      WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only',
      async getItemAsync() { return value; },
      async setItemAsync(key, next, options) {
        if (secureWriteFails) throw new Error('keychain unavailable');
        writes.push({ key, options }); value = next;
      },
      async deleteItemAsync() { value = null; },
    },
  });
  return { store, writes, removed, attempts: () => attempts };
}
for (const platform of ['native', 'web']) {
  test(`${platform}: legacy plaintext credentials are removed before session use`, async () => {
    const h = setup(platform);
    assert.equal(await h.store.getStoredToken(), null);
    assert.deepEqual(h.removed, [['auth_token', 'dev_user_id']]);
    await h.store.storeToken('session-token');
    assert.equal(await h.store.getStoredToken(), 'session-token');
    assert.equal(h.attempts(), 1);
  });
  test(`${platform}: logout removes the session`, async () => {
    const h = setup(platform);
    await h.store.storeToken('session-token');
    await h.store.removeStoredToken();
    assert.equal(await h.store.getStoredToken(), null);
  });
  test(`${platform}: failed legacy cleanup blocks session use and can be retried`, async () => {
    const h = setup(platform, { cleanupFails: true });
    await assert.rejects(h.store.storeToken('secret'), /storage unavailable/);
    assert.equal(h.writes.length, 0);
    await h.store.storeToken('replacement');
    assert.equal(await h.store.getStoredToken(), 'replacement');
    assert.equal(h.attempts(), 2);
  });
  test(`${platform}: concurrent reads share one cleanup`, async () => {
    const h = setup(platform);
    await Promise.all([h.store.getStoredToken(), h.store.getStoredToken()]);
    assert.equal(h.attempts(), 1);
  });
}
test('native tokens use device-only Keychain accessibility', async () => {
  const h = setup('native');
  await h.store.storeToken('secret');
  assert.equal(h.writes[0].key, 'auth_token');
  assert.equal(h.writes[0].options.keychainAccessible, 'device-only');
});
test('Keychain failures propagate without falling back to plaintext storage', async () => {
  const h = setup('native', { secureWriteFails: true });
  await assert.rejects(h.store.storeToken('secret'), /keychain unavailable/);
  assert.equal(await h.store.getStoredToken(), null);
});
test('web sessions disappear when the application reloads', async () => {
  const first = setup('web');
  await first.store.storeToken('secret');
  assert.equal(first.writes.length, 0);
  assert.equal(await setup('web').store.getStoredToken(), null);
});
