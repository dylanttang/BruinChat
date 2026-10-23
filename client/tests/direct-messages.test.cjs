const { test } = require('node:test');
const assert = require('node:assert/strict');
const loadModule = require('./helpers/load-module.cjs');
test('DM navigation returns the chat ID and surfaces server errors', async () => {
  const requests = []; let ok = true;
  const dm = loadModule('lib/directMessages.ts', { './api': { apiFetch: async (path, init) => {
    requests.push({ path, init }); return { ok, json: async () => ok ? { chat: { _id: 'pair' } } : { error: 'Unavailable' } };
  } } });
  assert.equal(await dm.startDirectMessage({ recipientId: 'classmate' }), 'pair');
  assert.deepEqual(JSON.parse(requests[0].init.body), { recipientId: 'classmate' });
  assert.equal(requests[0].path, '/api/chats/direct');
  ok = false;
  await assert.rejects(dm.startDirectMessage({ username: 'classmate' }), /Unavailable/);
});
test('DM titles show the other participant while class chats retain their names', () => {
  const { conversationTitle } = loadModule('lib/directMessages.ts', { './api': {} });
  const chat = { name: 'Class', members: [{ _id: 'me', displayName: 'Me' }, { _id: 'other', displayName: 'Alex' }] };
  assert.equal(conversationTitle(chat, 'me'), 'Class');
  chat.isGroup = false;
  assert.equal(conversationTitle(chat, 'me'), 'Alex');
  assert.equal(conversationTitle(chat, null), 'Direct message');
});
