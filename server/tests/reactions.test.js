import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import User from '../../models/User.js';
import Chat from '../../models/Chat.js';
import Message from '../../models/Message.js';
import { request } from './helpers/http.js';
import { CURRENT_TERMS_VERSION } from '../utils/terms.js';
import { toggleReactionUpdate } from '../utils/reactions.js';

process.env.JWT_SECRET = 'reaction-test-secret-with-at-least-32-characters';
const meId = 'aaaaaaaaaaaaaaaaaaaaaaaa', chatId = 'cccccccccccccccccccccccc', messageId = 'dddddddddddddddddddddddd';
const headers = { authorization: `Bearer ${jwt.sign({ sub: meId }, process.env.JWT_SECRET, { expiresIn: '1h' })}` };
const chain = value => { const q = { populate: () => q, select: () => q, lean: async () => value }; return q; };
const saved = [[User, 'findById'], [Chat, 'findById'], [Message, 'findOne'], [Message, 'findById'], [Message, 'updateOne']].map(([model, key]) => [model, key, model[key]]);
let updates, matched;

beforeEach(() => {
  updates = []; matched = 1;
  User.findById = () => chain({ _id: meId, termsVersion: CURRENT_TERMS_VERSION, blockedUsers: [] });
  Chat.findById = () => chain({ _id: chatId, members: [meId], isGroup: true });
  Message.findOne = async () => ({ _id: messageId, chatId, deletedAt: null, reactions: [], save: async () => { throw new Error('should not save'); } });
  Message.updateOne = async (filter, update) => { updates.push({ filter, update }); return { matchedCount: matched }; };
  Message.findById = () => chain({ _id: messageId, chatId, reactions: [] });
});
afterEach(() => saved.forEach(([model, key, value]) => { model[key] = value; }));

const react = emoji => request(`/api/chats/${chatId}/messages/${messageId}/react`, { method: 'POST', headers, body: { emoji } });

test('reacting is one database update, not a read-then-save that can collide', async () => {
  const res = await react('❤️');
  assert.equal(res.status, 200);
  assert.equal(updates.length, 1);
  assert.equal(String(updates[0].filter._id), messageId);
  assert.equal(updates[0].filter.deletedAt, null);
  assert.ok(Array.isArray(updates[0].update), 'uses an update pipeline');
});

test('a message deleted while reacting is refused', async () => {
  matched = 0;
  assert.equal((await react('❤️')).status, 400);
});

test('the emoji is stored as text, never read as a field name', () => {
  const [stage] = toggleReactionUpdate(meId, '$text');
  const json = JSON.stringify(stage);
  const count = text => json.split(text).length - 1;
  assert.ok(count('{"$literal":"$text"}') > 0);
  assert.equal(count('"$text"'), count('{"$literal":"$text"}'));
});
