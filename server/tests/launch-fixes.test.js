import { test } from 'node:test';
import assert from 'node:assert/strict';
import { v2 as cloudinary } from 'cloudinary';
import User from '../../models/User.js';
import Chat from '../../models/Chat.js';
import Message from '../../models/Message.js';
import { deleteMediaAssets, messageMediaReferences } from '../utils/media.js';
import { CURRENT_TERMS_VERSION } from '../utils/terms.js';

const userId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const otherId = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const chatId = 'cccccccccccccccccccccccc';

function withEnv(values, fn) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  return Promise.resolve(fn()).finally(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
}

// Run a route's final handler directly with stubbed req/res.
async function callRoute(router, method, path, req) {
  const layer = router.stack.find((l) => l.route?.path === path && l.route.methods[method]);
  const handler = layer.route.stack.at(-1).handle;
  const res = { statusCode: 200, body: undefined };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  res.end = () => res;
  await handler(req, res);
  return res;
}

test('deleteMediaAssets destroys our authenticated uploads and skips everything else', async () => {
  const destroyed = [];
  const original = cloudinary.uploader.destroy;
  cloudinary.uploader.destroy = async (publicId, options) => {
    destroyed.push({ publicId, options });
    if (publicId.endsWith('fails')) throw new Error('boom');
    return { result: 'ok' };
  };
  try {
    await withEnv({ CLOUDINARY_CLOUD_NAME: 'testcloud', CLOUDINARY_API_KEY: 'k', CLOUDINARY_API_SECRET: 's' }, async () => {
      const message = {
        mediaUrl: `https://res.cloudinary.com/testcloud/image/authenticated/v1/messages/${userId}/photo1.jpg`,
        mediaUrls: [
          `https://res.cloudinary.com/testcloud/video/authenticated/messages/${userId}/clip.mp4`,
          `https://res.cloudinary.com/testcloud/image/authenticated/messages/${userId}/fails.jpg`,
        ],
      };
      await deleteMediaAssets([
        ...messageMediaReferences(message),
        'https://lh3.googleusercontent.com/a/some-google-photo', // not ours
        `https://res.cloudinary.com/othercloud/image/authenticated/messages/${userId}/x.jpg`, // other account
        'not a url',
      ]);
    });
    assert.deepEqual(destroyed.map((d) => d.publicId).sort(), [
      `messages/${userId}/clip`,
      `messages/${userId}/fails`,
      `messages/${userId}/photo1`,
    ]);
    const video = destroyed.find((d) => d.publicId.endsWith('clip'));
    assert.equal(video.options.resource_type, 'video');
    assert.equal(video.options.type, 'authenticated');
  } finally {
    cloudinary.uploader.destroy = original;
  }
});

test('accepting the Terms again keeps the original acceptance date', async () => {
  const { default: users } = await import('../routes/users.js');
  const original = { updateOne: User.updateOne, findById: User.findById };
  let filter;
  User.updateOne = async (query) => { filter = query; return { modifiedCount: 0 }; };
  User.findById = () => ({ select: () => ({ lean: async () => ({ termsVersion: CURRENT_TERMS_VERSION }) }) });
  try {
    const res = await callRoute(users, 'put', '/me/terms', { body: { version: CURRENT_TERMS_VERSION }, user: { _id: userId } });
    assert.equal(res.statusCode, 200);
    // Only users who haven't accepted this version get a new date.
    assert.deepEqual(filter, { _id: userId, termsVersion: { $ne: CURRENT_TERMS_VERSION } });
  } finally {
    Object.assign(User, original);
  }
});

test('new messages do not push to banned or deleted accounts', async () => {
  const { default: chats } = await import('../routes/chats.js');
  const original = { chatFind: Chat.findById, chatUpdate: Chat.findByIdAndUpdate, create: Message.create, msgFind: Message.findById, userFind: User.find };
  let recipientQuery;
  Chat.findById = () => ({ lean: async () => ({ _id: chatId, members: [userId, otherId] }) });
  Chat.findByIdAndUpdate = async () => ({});
  Message.create = async (doc) => ({ ...doc, _id: 'dddddddddddddddddddddddd', createdAt: new Date() });
  const populated = { _id: 'dddddddddddddddddddddddd', text: 'hi', replyTo: null };
  const query = { populate: () => query, lean: async () => populated };
  Message.findById = () => query;
  User.find = (q) => { recipientQuery = q; return { select: () => ({ lean: async () => [] }) }; };
  try {
    const res = await callRoute(chats, 'post', '/:id/messages', {
      params: { id: chatId },
      body: { text: 'hi' },
      user: { _id: userId, displayName: 'Sender', termsVersion: CURRENT_TERMS_VERSION },
    });
    assert.equal(res.statusCode, 201);
    assert.equal(recipientQuery.bannedAt, null);
    assert.equal(recipientQuery.deletedAt, null);
  } finally {
    Chat.findById = original.chatFind;
    Chat.findByIdAndUpdate = original.chatUpdate;
    Message.create = original.create;
    Message.findById = original.msgFind;
    User.find = original.userFind;
  }
});
