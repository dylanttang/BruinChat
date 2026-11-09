const { test } = require('node:test');
const assert = require('node:assert/strict');
const loadModule = require('./helpers/load-module.cjs');

function memoryStorage(initial = {}) {
  const items = { ...initial };
  return {
    items,
    __esModule: true,
    default: {
      getItem: async (key) => items[key] ?? null,
      setItem: async (key, value) => { items[key] = value; },
      removeItem: async (key) => { delete items[key]; },
    },
  };
}

const load = (storage) =>
  loadModule('lib/readState.ts', { '@react-native-async-storage/async-storage': storage });

const readState = { trackingSince: '2026-11-01T00:00:00.000Z', seen: { a: '2026-11-05T10:00:00.000Z' } };

test('a chat is unread when someone else posted after the last seen message', () => {
  const { isChatUnread } = load(memoryStorage());
  const chat = { _id: 'a', lastMessageCreatedAt: '2026-11-05T10:05:00.000Z', lastMessageSenderId: 'other' };
  assert.equal(isChatUnread(chat, readState, 'me'), true);
  assert.equal(isChatUnread({ ...chat, lastMessageCreatedAt: '2026-11-05T10:00:00.000Z' }, readState, 'me'), false);
  assert.equal(isChatUnread({ ...chat, lastMessageSenderId: 'me' }, readState, 'me'), false);
  assert.equal(isChatUnread({ _id: 'a', lastMessageAt: null }, readState, 'me'), false);
  // Only blocked users have posted: the server sends null and the chat stays read.
  assert.equal(isChatUnread({ _id: 'a', lastMessageAt: '2026-11-06T00:00:00.000Z', lastMessageCreatedAt: null }, readState, 'me'), false);
  // Older servers without the field fall back to lastMessageAt.
  assert.equal(isChatUnread({ _id: 'a', lastMessageAt: '2026-11-06T00:00:00.000Z' }, readState, 'me'), true);
});

test('chats never opened here count as read up to when tracking started', () => {
  const { isChatUnread } = load(memoryStorage());
  assert.equal(isChatUnread({ _id: 'b', lastMessageAt: '2026-10-30T00:00:00.000Z' }, readState, 'me'), false);
  assert.equal(isChatUnread({ _id: 'b', lastMessageAt: '2026-11-02T00:00:00.000Z' }, readState, 'me'), true);
});

test('marking a chat seen only moves forward and is saved', async () => {
  const storage = memoryStorage();
  const { loadReadState, markChatSeen, isChatUnread } = load(storage);
  const chat = { _id: 'c', lastMessageCreatedAt: '2030-01-01T00:00:02.000Z', lastMessageSenderId: 'other' };
  await markChatSeen('c', '2030-01-01T00:00:02.000Z');
  await markChatSeen('c', '2030-01-01T00:00:01.000Z');
  const state = await loadReadState();
  assert.equal(state.seen.c, '2030-01-01T00:00:02.000Z');
  assert.equal(isChatUnread(chat, state, 'me'), false);
  assert.equal(JSON.parse(storage.items.chatReadState).seen.c, '2030-01-01T00:00:02.000Z');
});

test('the newest message ignores ones still sending', () => {
  const { newestMessageAt } = load(memoryStorage());
  assert.equal(newestMessageAt([
    { createdAt: '2026-11-05T10:00:00.000Z' },
    { createdAt: '2026-11-05T12:00:00.000Z', pending: true },
    { createdAt: '2026-11-05T11:00:00.000Z' },
  ]), '2026-11-05T11:00:00.000Z');
  assert.equal(newestMessageAt([]), null);
});
