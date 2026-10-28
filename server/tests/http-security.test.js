import { request } from './helpers/http.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import User from '../../models/User.js';
import Chat from '../../models/Chat.js';
import Message from '../../models/Message.js';
process.env.JWT_SECRET = 'test-only-secret-with-at-least-32-characters';
process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
process.env.CLOUDINARY_API_KEY = 'test-key';
process.env.CLOUDINARY_API_SECRET = 'test-secret';
const userId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const chatId = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const sign = () => jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: '1h' });
test('HTTP message delivery signs nested media only after membership authorization', async () => {
  const originalChat = Chat.findById, originalMessages = Message.find, originalAggregate = Message.aggregate;
  const asset = `https://res.cloudinary.com/test-cloud/image/authenticated/messages/${userId}/photo.jpg`;
  const stored = { chatId, mediaUrl: asset, mediaUrls: [asset], senderId: { displayName: 'Student', avatarUrl: asset }, replyTo: { chatId, mediaUrl: asset } };
  let member = false, reads = 0;
  User.findById = () => ({ lean: async () => ({ _id: userId }) });
  Chat.findById = () => ({ lean: async () => ({ members: member ? [userId] : [] }) });
  Message.aggregate = async () => [];
  Message.find = () => {
    reads++;
    const query = { sort: () => query, limit: () => query, populate: () => query, lean: async () => [stored] };
    return query;
  };
  try {
    const options = { headers: { authorization: `Bearer ${sign()}` } };
    assert.equal((await request(`/api/chats/${chatId}/messages`, options)).status, 403);
    assert.equal(reads, 0);
    member = true;
    const response = await request(`/api/chats/${chatId}/messages`, options);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    const message = response.data.messages[0];
    for (const url of [message.mediaUrl, message.mediaUrls[0], message.senderId.avatarUrl, message.replyTo.mediaUrl]) {
      assert.ok(new URL(url).searchParams.get('signature'));
    }
    assert.equal(stored.mediaUrl, asset);
    assert.equal(stored.senderId.avatarUrl, asset);
  } finally { Chat.findById = originalChat; Message.find = originalMessages; Message.aggregate = originalAggregate; }
});

