import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import User from '../../models/User.js';
import Chat from '../../models/Chat.js';
import Message from '../../models/Message.js';
import { request } from './helpers/http.js';
import { CURRENT_TERMS_VERSION } from '../utils/terms.js';
let meId = 'aaaaaaaaaaaaaaaaaaaaaaaa', sequence = 0, headers;
const otherId = 'bbbbbbbbbbbbbbbbbbbbbbbb', chatId = 'cccccccccccccccccccccccc';
process.env.JWT_SECRET = 'direct-test-secret-with-at-least-32-characters';

const chain = value => { const q = { populate: () => q, select: () => q, sort: () => q, limit: () => q, lean: async () => value }; return q; };
const saved = [ [User, 'findById'], [User, 'findOne'], [User, 'exists'], [Chat, 'findOne'], [Chat, 'findOneAndUpdate'], [Chat, 'findByIdAndUpdate'], [Chat, 'find'], [Chat, 'findById'], [Message, 'aggregate'], [Message, 'create'] ].map(([model, key]) => [model, key, model[key]]);
let me, recipient, existing, inserted, recipientQuery, listQuery, race, updates, writes, available;
beforeEach(() => {
  meId = `a${(++sequence).toString(16).padStart(23, "0")}`;
  headers = { authorization: `Bearer ${jwt.sign({ sub: meId }, process.env.JWT_SECRET, { expiresIn: "1h" })}` };
  me = { _id: meId, termsVersion: CURRENT_TERMS_VERSION, blockedUsers: [] };
  recipient = { _id: otherId, displayName: 'Classmate' }; existing = null; inserted = null; race = false; updates = []; writes = 0; available = true;
  User.findById = () => chain(me);
  User.findOne = query => { recipientQuery = query; return chain(recipient); };
  User.exists = async () => available;
  Chat.findOne = query => chain(query.directKey ? { _id: chatId, isGroup: false, members: [meId, otherId] } : existing);
  Chat.findOneAndUpdate = (query, update) => {
    inserted = { query, update };
    if (race) return { lean: async () => { throw Object.assign(new Error('duplicate pair'), { code: 11000 }); } };
    return chain({ _id: chatId, ...update.$setOnInsert });
  };
  Chat.findByIdAndUpdate = async (id, update) => { updates.push(update); return {}; };
  Chat.find = query => { listQuery = query; return chain([]); };
  Chat.findById = () => ({ ...chain({ _id: chatId, members: [meId, otherId], isGroup: false }), then: resolve => resolve({ _id: chatId, members: [meId, otherId], isGroup: false }) });
  Message.aggregate = async () => [];
  Message.create = async () => { writes++; throw new Error('Should not write'); };
});
afterEach(() => saved.forEach(([model, key, value]) => { model[key] = value; }));
const start = body => request('/api/chats/direct', { method: 'POST', headers, body });
test('DM creation uses a canonical unique pair and ignores caller-supplied members', async () => {
  assert.equal((await start({ recipientId: otherId, members: ['attacker'] })).status, 200);
  assert.equal(inserted.query.directKey, `${meId}:${otherId}`);
  assert.deepEqual(inserted.update.$setOnInsert.members, [meId, otherId]);
  assert.equal(inserted.update.$setOnInsert.isGroup, false);
  assert.equal(recipientQuery.blockedUsers.$ne, meId);
  assert.equal(recipientQuery.deletedAt, null);
  assert.deepEqual(updates[0], { $pull: { archivedBy: meId } });
  assert.ok(Chat.schema.indexes().some(([fields, options]) => fields.directKey === 1 && options.unique));
});
test('existing DMs are reused and duplicate-creation races return the winning pair', async () => {
  existing = { _id: chatId, members: [meId, otherId], isGroup: false };
  assert.equal((await start({ username: ' Classmate ' })).data.chat._id, chatId);
  assert.equal(recipientQuery.username, 'classmate');
  assert.equal(inserted, null);
  existing = null; race = true;
  assert.equal((await start({ recipientId: otherId })).data.chat._id, chatId);
});
test('invalid, self, blocked and unavailable recipients cannot create DMs', async () => {
  assert.equal((await start({ recipientId: 'invalid' })).status, 400);
  assert.equal((await start({ username: {} })).status, 400);
  recipient = { _id: meId };
  assert.equal((await start({ recipientId: meId })).status, 400);
  recipient = null;
  assert.equal((await start({ recipientId: otherId })).status, 404);
  recipient = { _id: otherId }; me.blockedUsers = [otherId];
  assert.equal((await start({ recipientId: otherId })).status, 404);
  assert.equal(inserted, null);
});
test('muted users and users who have not accepted Terms cannot start DMs', async () => {
  me.mutedUntil = new Date(Date.now() + 60000);
  assert.equal((await start({ recipientId: otherId })).status, 403);
  me.mutedUntil = null; me.termsVersion = null;
  assert.equal((await start({ recipientId: otherId })).status, 403);
  assert.equal(inserted, null);
});
test('inbox kind filters apply on the server before pagination', async () => {
  assert.equal((await request('/api/chats?kind=direct', { headers })).status, 200);
  assert.equal(listQuery.isGroup, false);
  assert.equal(listQuery.members, meId);
  assert.equal((await request('/api/chats?kind=group', { headers })).status, 200);
  assert.deepEqual(listQuery.isGroup, { $ne: false });
  assert.equal((await request('/api/chats?kind=invalid', { headers })).status, 400);
});
test('blocked or unavailable recipients cannot receive existing DM messages or thread replies', async () => {
  available = false;
  for (const body of [{ text: 'Hi' }, { text: 'Reply', threadRootId: 'dddddddddddddddddddddddd' }]) {
    assert.equal((await request(`/api/chats/${chatId}/messages`, { method: 'POST', headers, body })).status, 403);
  }
  assert.equal(writes, 0);
});
test('DM participants must archive instead of leaving and breaking the pair', async () => {
  const res = await request(`/api/chats/${chatId}/members/me`, { method: 'DELETE', headers });
  assert.equal(res.status, 400);
  assert.match(res.data.error, /Archive/);
});

test('blocks also prevent DM reactions and edits', async () => {
  available = false;
  const messageId = 'dddddddddddddddddddddddd';
  assert.equal((await request(`/api/chats/${chatId}/messages/${messageId}/react`, { method: 'POST', headers, body: { emoji: '❤️' } })).status, 403);
  assert.equal((await request(`/api/chats/${chatId}/messages/${messageId}`, { method: 'PUT', headers, body: { text: 'Edit' } })).status, 403);
});
