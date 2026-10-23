import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import User from '../../models/User.js';
import Chat from '../../models/Chat.js';
import Message from '../../models/Message.js';
import { request } from './helpers/http.js';
import { createApp } from '../app.js';
import { CURRENT_TERMS_VERSION } from '../utils/terms.js';

const userId = 'aaaaaaaaaaaaaaaaaaaaaaaa', chatId = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const rootId = 'cccccccccccccccccccccccc', replyId = 'dddddddddddddddddddddddd';
process.env.JWT_SECRET = 'thread-test-secret-with-at-least-32-characters';
const headers = { authorization: `Bearer ${jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: '1h' })}` };
const original = { user: User.findById, users: User.find, chat: Chat.findById, update: Chat.findByIdAndUpdate, find: Message.find, one: Message.findOne, exists: Message.exists, aggregate: Message.aggregate, create: Message.create, byId: Message.findById };
const chain = value => { const q = { sort: () => q, limit: () => q, populate: () => q, select: () => q, lean: async () => value }; return q; };
let member, root, messages, readQuery, rootQuery, sent, events;
beforeEach(() => {
  member = true; root = { _id: rootId, chatId, threadRootId: null, text: 'Topic', senderId: { _id: userId, displayName: 'Student' } };
  messages = []; readQuery = null; rootQuery = null; sent = null; events = [];
  User.findById = () => chain({ _id: userId, termsVersion: CURRENT_TERMS_VERSION, blockedUsers: [] });
  User.find = () => chain([]);
  Chat.findById = () => chain({ _id: chatId, members: member ? [userId] : [] });
  Chat.findByIdAndUpdate = async () => ({});
  Message.findOne = q => { rootQuery = q; return chain(root); };
  Message.find = q => { readQuery = q; return chain(messages); };
  Message.aggregate = async () => [{ _id: rootId, count: 3 }];
  Message.exists = async q => { rootQuery = q; return root && !root.deletedAt && !root.threadRootId ? { _id: rootId } : null; };
  Message.create = async doc => { sent = { ...doc, _id: replyId, createdAt: new Date() }; return sent; };
  Message.findById = () => chain({ ...sent, replyTo: null });
});
afterEach(() => {
  User.findById = original.user; User.find = original.users; Chat.findById = original.chat; Chat.findByIdAndUpdate = original.update;
  Message.find = original.find; Message.findOne = original.one; Message.exists = original.exists; Message.aggregate = original.aggregate; Message.create = original.create; Message.findById = original.byId;
});
const get = (query = '') => request(`/api/chats/${chatId}/messages${query}`, { headers });
test('main conversation excludes replies and returns reply counts', async () => {
  messages = [root];
  const res = await get();
  assert.equal(res.status, 200);
  assert.equal(readQuery.threadRootId, null);
  assert.equal(res.data.messages[0].replyCount, 3);
  assert.equal(res.data.root, null);
});
test('thread fetch scopes root and replies to the authorized chat and paginates replies', async () => {
  messages = [{ _id: replyId, text: 'Reply', threadRootId: rootId }, { _id: 'eeeeeeeeeeeeeeeeeeeeeeee' }];
  const res = await get(`?thread=${rootId}&limit=1&before=${replyId}`);
  assert.equal(res.status, 200);
  assert.equal(rootQuery.chatId, chatId);
  assert.equal(rootQuery.threadRootId, null);
  assert.equal(readQuery.threadRootId, rootId);
  assert.equal(String(readQuery._id.$lt), replyId);
  assert.equal(res.data.root._id, rootId);
  assert.equal(res.data.messages.length, 1);
  assert.equal(res.data.hasMore, true);
});
test('nonmembers cannot read a thread or its root', async () => {
  member = false;
  assert.equal((await get(`?thread=${rootId}`)).status, 403);
  assert.equal(rootQuery, null);
  assert.equal(readQuery, null);
});
test('malformed, foreign and nested roots fail without reading replies', async () => {
  assert.equal((await get('?thread=invalid')).status, 400);
  root = null;
  assert.equal((await get(`?thread=${rootId}`)).status, 404);
  assert.equal(readQuery, null);
});
test('reply sends persist the root and notify the parent conversation', async () => {
  const io = { to: room => ({ emit: (event, data) => events.push({ room, event, data }) }) };
  const res = await request(`/api/chats/${chatId}/messages`, { method: 'POST', body: { text: 'Reply', threadRootId: rootId }, headers, app: createApp({ io }) });
  assert.equal(res.status, 201);
  assert.equal(sent.threadRootId, rootId);
  assert.equal(rootQuery.chatId, chatId);
  assert.equal(rootQuery.threadRootId, null);
  assert.ok(events.some(e => e.event === 'threadUpdated' && e.data.rootId === rootId && e.room === chatId));
});
test('deleted or nested roots cannot receive new replies', async () => {
  for (const change of [{ deletedAt: new Date() }, { threadRootId: replyId }]) {
    root = { _id: rootId, ...change };
    const res = await request(`/api/chats/${chatId}/messages`, { method: 'POST', body: { text: 'Reply', threadRootId: rootId }, headers });
    assert.equal(res.status, 400);
    assert.equal(sent, null);
  }
});

test('legacy quoted replies stay in the main conversation without a data migration', async () => {
  messages = [{ _id: replyId, replyTo: rootId, text: 'Existing quoted reply' }];
  const res = await get();
  assert.equal(res.status, 200);
  assert.equal(readQuery.threadRootId, null);
  assert.equal(readQuery.replyTo, undefined);
  assert.equal(res.data.messages[0].text, 'Existing quoted reply');
});
