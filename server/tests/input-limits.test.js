import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../../models/User.js';
import Message from '../../models/Message.js';
import Chat from '../../models/Chat.js';
import users from '../routes/users.js';
import chats from '../routes/chats.js';
import { validateMessageLengths, PROFILE_LIMITS } from '../utils/inputLimits.js';

const userId = 'aaaaaaaaaaaaaaaaaaaaaaaa', chatId = 'bbbbbbbbbbbbbbbbbbbbbbbb';

test('message input boundaries and types', () => {
  assert.equal(validateMessageLengths({ text: 'x'.repeat(4000), mediaUrls: Array(10).fill('x'.repeat(2048)) }), null);
  for (const body of [{ text: 'x'.repeat(4001) }, { text: {} }, { mediaUrl: 5 }, { mediaUrl: 'x'.repeat(2049) }, { mediaUrls: [null] }, { mediaUrls: Array(11).fill('url') }]) assert.ok(validateMessageLengths(body));
});

test('schema limits reject oversized strings while allowing exact boundaries', () => {
  for (const [field, max] of Object.entries({ username: 64, email: 254, googleId: 255, displayName: 100, ...PROFILE_LIMITS })) {
    const make = length => new User({ username: 'student', displayName: 'Student', [field]: 'x'.repeat(length) });
    assert.equal(make(max).validateSync()?.errors[field], undefined, field);
    assert.ok(make(max + 1).validateSync()?.errors[field], field);
  }
  assert.equal(new Message({ chatId, senderId: userId, text: 'x'.repeat(4000) }).validateSync(), undefined);
  assert.ok(new Message({ chatId, senderId: userId, text: 'x'.repeat(4001) }).validateSync()?.errors.text);
});

test('HTTP routes reject invalid inputs before writes and enable profile update validators', async () => {
  const originals = { user: User.findById, update: User.findByIdAndUpdate, chat: Chat.findById, message: Message.findOne, create: Message.create };
  const secret = 'isolated-unit-test-secret-over-32-characters';
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = secret;
  let writes = 0, updateOptions;
  User.findById = () => ({ lean: async () => ({ _id: userId }) });
  User.findByIdAndUpdate = (_id, update, options) => {
    writes++; updateOptions = options;
    const query = { populate: () => query, lean: async () => ({ _id: userId, ...update }) };
    return query;
  };
  Chat.findById = () => ({ lean: async () => ({ members: [userId] }) });
  Message.findOne = async () => ({ senderId: userId, save: async () => { writes++; } });
  Message.create = async () => { writes++; throw new Error('Invalid input reached create'); };
  const app = express(); app.use(express.json()); app.use('/api/users', users); app.use('/api/chats', chats);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const send = async (path, body, method = 'PUT') => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt.sign({ sub: userId }, secret)}` }, body: JSON.stringify(body),
    });
    await response.text(); return response.status;
  };
  try {
    for (const [field, max] of Object.entries({ year: 32, major: 120, goal: 1000 })) {
      for (const value of ['x'.repeat(max + 1), {}]) assert.equal(await send('/api/users/me/profile', { [field]: value }), 400);
    }
    assert.equal(await send('/api/users/me/push-token', { pushToken: 'x'.repeat(4097) }), 400);
    assert.equal(await send('/api/users/me/avatar', { avatarUrl: 'https://res.cloudinary.com/' + 'x'.repeat(2048) }), 400);
    for (const body of [{ text: {} }, { text: 'x'.repeat(4001) }, { mediaUrls: ['x'.repeat(2049)] }]) {
      assert.equal(await send(`/api/chats/${chatId}/messages`, body, 'POST'), 400);
    }
    for (const text of [{}, 'x'.repeat(4001), '']) assert.equal(await send(`/api/chats/${chatId}/messages/${userId}`, { text }), 400);
    assert.equal(writes, 0);
    assert.equal(await send('/api/users/me/profile', { major: 'x'.repeat(120), year: null }), 200);
    assert.equal(writes, 1);
    assert.equal(updateOptions.runValidators, true);
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    User.findById = originals.user; User.findByIdAndUpdate = originals.update; Chat.findById = originals.chat; Message.findOne = originals.message; Message.create = originals.create;
    if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
  }
});
