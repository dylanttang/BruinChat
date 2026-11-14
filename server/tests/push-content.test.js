import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import Expo from 'expo-server-sdk';
import User from '../../models/User.js';
import Chat from '../../models/Chat.js';
import Message from '../../models/Message.js';
import { request } from './helpers/http.js';
import { CURRENT_TERMS_VERSION } from '../utils/terms.js';

const userId = 'aaaaaaaaaaaaaaaaaaaaaaaa', chatId = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const memberId = 'cccccccccccccccccccccccc', messageId = 'dddddddddddddddddddddddd';
const token = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
process.env.JWT_SECRET = 'push-content-test-secret-at-least-32-chars';
process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
const mediaUrl = `https://res.cloudinary.com/test-cloud/image/authenticated/messages/${userId}/photo.jpg`;
const headers = { authorization: `Bearer ${jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: '1h' })}` };

const proto = Object.getPrototypeOf(new Expo());
const original = { send: proto.sendPushNotificationsAsync, user: User.findById, users: User.find, exists: User.exists, chat: Chat.findById, update: Chat.findByIdAndUpdate, create: Message.create, byId: Message.findById };
const chain = value => { const q = { sort: () => q, limit: () => q, populate: () => q, select: () => q, lean: async () => value }; return q; };
let chat, pushed;

beforeEach(() => {
  pushed = [];
  chat = { _id: chatId, name: 'MATH 32B — Calculus of Several Variables', isGroup: true, course: 'eeeeeeeeeeeeeeeeeeeeeeee', members: [userId, memberId] };
  proto.sendPushNotificationsAsync = async chunk => { pushed.push(...chunk); return chunk.map(() => ({ status: 'ok', id: 'r1' })); };
  User.findById = () => chain({ _id: userId, displayName: 'Jonathan', termsVersion: CURRENT_TERMS_VERSION, blockedUsers: [] });
  User.find = () => chain([{ _id: memberId, pushToken: token, classNotif: true, replyNotif: true }]);
  User.exists = async () => ({ _id: memberId });
  Chat.findById = () => chain(chat);
  Chat.findByIdAndUpdate = async () => ({});
  Message.create = async doc => ({ ...doc, _id: messageId, createdAt: new Date() });
  Message.findById = () => chain({ _id: messageId, chatId, text: 'are we meeting at powell today?', senderId: { _id: userId, displayName: 'Jonathan' }, replyTo: null });
});
afterEach(() => {
  proto.sendPushNotificationsAsync = original.send;
  User.findById = original.user; User.find = original.users; User.exists = original.exists;
  Chat.findById = original.chat; Chat.findByIdAndUpdate = original.update;
  Message.create = original.create; Message.findById = original.byId;
});

const send = () => request(`/api/chats/${chatId}/messages`, {
  method: 'POST', headers, body: { text: 'are we meeting at powell today?' },
});

test('a class chat notification leads with the course code and names the sender in the body', async () => {
  const res = await send();
  assert.equal(res.status, 201);
  assert.equal(pushed.length, 1);
  assert.equal(pushed[0].title, 'MATH 32B');
  assert.equal(pushed[0].body, 'Jonathan: are we meeting at powell today?');
  assert.equal(pushed[0].data.chatId, chatId);
});

test('a group chat without an em dash keeps its whole name as the title', async () => {
  chat = { ...chat, name: 'Study Group', course: null };
  const res = await send();
  assert.equal(res.status, 201);
  assert.equal(pushed[0].title, 'Study Group');
  assert.equal(pushed[0].body, 'Jonathan: are we meeting at powell today?');
});

test('a direct message keeps the sender as the title and the message alone in the body', async () => {
  chat = { _id: chatId, name: 'Direct message', isGroup: false, members: [userId, memberId] };
  const res = await send();
  assert.equal(res.status, 201);
  assert.equal(pushed[0].title, 'Jonathan');
  assert.equal(pushed[0].body, 'are we meeting at powell today?');
});

test('a media-only message still names the sender in a group chat', async () => {
  Message.findById = () => chain({ _id: messageId, chatId, text: '', senderId: { _id: userId, displayName: 'Jonathan' }, replyTo: null });
  const res = await request(`/api/chats/${chatId}/messages`, {
    method: 'POST', headers,
    body: { mediaUrls: [mediaUrl] },
  });
  assert.equal(res.status, 201);
  assert.equal(pushed[0].body, 'Jonathan: 📎 Media');
});

test('a mentioned member is told even with class notifications off, in their own notification', async () => {
  const quietId = 'ffffffffffffffffffffffff';
  const quietToken = 'ExponentPushToken[cccccccccccccccccccccc]';
  chat = { ...chat, members: [userId, memberId, quietId] };
  User.find = () => chain([
    { _id: memberId, pushToken: token, classNotif: true, replyNotif: true },
    { _id: quietId, pushToken: quietToken, classNotif: false, replyNotif: true },
  ]);
  let created;
  Message.create = async doc => { created = doc; return { ...doc, _id: messageId, createdAt: new Date() }; };
  const res = await request(`/api/chats/${chatId}/messages`, {
    method: 'POST', headers, body: { text: '@Quiet are we meeting at powell today?', mentions: [quietId] },
  });
  assert.equal(res.status, 201);
  assert.deepEqual(created.mentions, [quietId]);
  assert.equal(pushed.length, 2);
  const normal = pushed.find(p => p.to === token);
  const mention = pushed.find(p => p.to === quietToken);
  assert.equal(normal.title, 'MATH 32B');
  assert.equal(mention.title, 'Jonathan mentioned you in MATH 32B');
  assert.equal(mention.body, 'are we meeting at powell today?');
});

test('mentions of yourself or of people outside the chat are dropped', async () => {
  let created;
  Message.create = async doc => { created = doc; return { ...doc, _id: messageId, createdAt: new Date() }; };
  const res = await request(`/api/chats/${chatId}/messages`, {
    method: 'POST', headers, body: { text: 'hi', mentions: [userId, '999999999999999999999999'] },
  });
  assert.equal(res.status, 201);
  assert.equal(created.mentions, undefined);
});

test('too many mentions are rejected', async () => {
  const res = await request(`/api/chats/${chatId}/messages`, {
    method: 'POST', headers, body: { text: 'hi', mentions: Array.from({ length: 11 }, (_, i) => i.toString(16).padStart(24, '0')) },
  });
  assert.equal(res.status, 400);
});
