import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import User from '../../models/User.js';
import Chat from '../../models/Chat.js';
import Message from '../../models/Message.js';
import { request } from './helpers/http.js';
import { CURRENT_TERMS_VERSION } from '../utils/terms.js';

const userId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const chatId = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const blockedId = 'cccccccccccccccccccccccc';
process.env.JWT_SECRET = 'message-search-secret-with-at-least-32-chars';
const headers = {
  authorization: `Bearer ${jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: '1h' })}`,
};

const original = {
  user: User.findById,
  chat: Chat.findById,
  find: Message.find,
};

const chain = (value) => {
  const q = {
    sort: () => q,
    limit: () => q,
    populate: () => q,
    select: () => q,
    lean: async () => value,
  };
  return q;
};

let member;
let blockedUsers;
let results;
let searchQuery;

beforeEach(() => {
  member = true;
  blockedUsers = [];
  results = [];
  searchQuery = null;
  User.findById = () => chain({
    _id: userId,
    termsVersion: CURRENT_TERMS_VERSION,
    blockedUsers,
  });
  Chat.findById = () => chain({ _id: chatId, members: member ? [userId] : [] });
  Message.find = (q) => {
    searchQuery = q;
    return chain(results);
  };
});

afterEach(() => {
  User.findById = original.user;
  Chat.findById = original.chat;
  Message.find = original.find;
});

const search = (query = '?q=hello') =>
  request(`/api/chats/${chatId}/messages/search${query}`, { headers });

test('search finds messages containing the query for chat members', async () => {
  results = [{
    _id: 'dddddddddddddddddddddddd',
    chatId,
    text: 'Hello from class',
    senderId: { _id: userId, displayName: 'Student' },
    createdAt: new Date().toISOString(),
  }];

  const res = await search('?q=hello');
  assert.equal(res.status, 200);
  assert.equal(searchQuery.chatId, chatId);
  assert.equal(searchQuery.deletedAt, null);
  assert.deepEqual(searchQuery.senderId, { $nin: [] });
  assert.equal(searchQuery.text.$regex, 'hello');
  assert.equal(searchQuery.text.$options, 'i');
  assert.equal(res.data.messages.length, 1);
  assert.equal(res.data.messages[0].text, 'Hello from class');
  assert.equal(res.data.query, 'hello');
});

test('search escapes regex metacharacters in the query', async () => {
  results = [];
  const res = await search(`?q=${encodeURIComponent('a+b (c)')}`);
  assert.equal(res.status, 200);
  assert.equal(searchQuery.text.$regex, 'a\\+b \\(c\\)');
});

test('search skips messages from blocked users', async () => {
  blockedUsers = [blockedId];
  results = [];
  const res = await search('?q=notes');
  assert.equal(res.status, 200);
  assert.deepEqual(searchQuery.senderId, { $nin: [blockedId] });
});

test('nonmembers cannot search messages', async () => {
  member = false;
  const res = await search('?q=hello');
  assert.equal(res.status, 403);
  assert.equal(searchQuery, null);
});

test('missing search query is rejected', async () => {
  const res = await search('?q=   ');
  assert.equal(res.status, 400);
  assert.equal(searchQuery, null);
});
