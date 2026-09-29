import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import User from '../../models/User.js';
import Chat from '../../models/Chat.js';
import Message from '../../models/Message.js';
import { devAuth } from '../middleware/devAuth.js';
import { configureSockets } from '../utils/sockets.js';
import { createOriginPolicy } from '../utils/cors.js';
import { validateMessage } from '../utils/validation.js';

process.env.JWT_SECRET = 'test-only-secret-with-at-least-32-characters';
process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
const userId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const chatId = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const originalFind = User.findById;
const originalExists = Chat.exists;
afterEach(() => { User.findById = originalFind; Chat.exists = originalExists; });
const sign = (claims = {}, options = {}) => jwt.sign({ sub: userId, ...claims }, process.env.JWT_SECRET, { expiresIn: '1h', ...options });

async function auth(headers) {
  let status, accepted = false;
  const req = { headers };
  await devAuth(req, { status(code) { status = code; return this; }, json() {} }, () => { accepted = true; });
  return { status, accepted, req };
}
test('HTTP rejects missing, forged, expired and wrong-algorithm credentials including x-user-id', async () => {
  User.findById = () => { throw new Error('Must not query the database'); };
  for (const headers of [{}, { 'x-user-id': userId }, { authorization: 'Bearer invalid', 'x-user-id': userId },
    { authorization: `Bearer ${sign({}, { expiresIn: -1 })}` },
    { authorization: `Bearer ${sign({}, { algorithm: 'HS384' })}` }]) {
    assert.equal((await auth(headers)).status, 401);
  }
});
test('HTTP trusts verified subject and database role, rejects deleted or banned accounts', async () => {
  User.findById = (id) => ({ lean: async () => ({ _id: id, role: 'user' }) });
  const result = await auth({ authorization: `Bearer ${sign({ role: 'admin' })}`, 'x-user-id': chatId });
  assert.equal(result.accepted, true);
  assert.equal(result.req.user._id, userId);
  assert.equal(result.req.user.role, 'user');
  for (const account of [null, { _id: userId, bannedAt: new Date() }]) {
    User.findById = () => ({ lean: async () => account });
    assert.equal((await auth({ authorization: `Bearer ${sign()}` })).status, 401);
  }
});
function socketHarness(token) {
  const handlers = {}, rooms = new Set(), broadcasts = [];
  let middleware, onConnect;
  configureSockets({ use(fn) { middleware = fn; }, on(event, fn) { onConnect = fn; } });
  const socket = {
    handshake: { auth: { token, userId: chatId } }, data: {}, rooms,
    on(event, fn) { handlers[event] = fn; },
    join(room) { rooms.add(room); }, leave(room) { rooms.delete(room); },
    disconnect() { handlers.disconnect?.(); this.disconnected = true; },
    to(room) { return { emit(event, data) { broadcasts.push({ room, event, data }); } }; },
  };
  return { socket, handlers, broadcasts, async connect() {
    let error; await middleware(socket, (err) => { error = err; });
    if (!error) onConnect(socket);
    return error;
  } };
}
test('socket handshake rejects unauthenticated user IDs', async () => {
  const h = socketHarness(undefined);
  assert.ok(await h.connect());
  assert.equal(h.socket.rooms.size, 0);
});
test('socket joins only member chats, cannot join arrays or internal rooms, typing uses verified identity', async () => {
  User.findById = () => ({ lean: async () => ({ _id: userId }) });
  let member = true;
  Chat.exists = async (query) => member && query._id === chatId && query.members === userId;
  const h = socketHarness(sign());
  assert.equal(await h.connect(), undefined);
  try {
    for (const room of [[chatId], `user:${chatId}`, 'invalid', 'cccccccccccccccccccccccc']) {
      let ack; await h.handlers.joinChat(room, (result) => { ack = result; });
      assert.equal(ack.ok, false);
    }
    let ack; await h.handlers.joinChat(chatId, (result) => { ack = result; });
    assert.equal(ack.ok, true);
    await h.handlers.typing({ chatId, isTyping: true, userId: chatId });
    assert.equal(h.broadcasts[0].data.userId, userId);
    member = false;
    await h.handlers.typing({ chatId, isTyping: true });
    assert.equal(h.broadcasts.length, 1);
    assert.equal(h.socket.rooms.has(chatId), false);
    await h.handlers.typing(null);
  } finally { h.socket.disconnect(); }
});
test('CORS exact allowlist rejects lookalike, wildcard, null and insecure production origins', () => {
  const allowed = createOriginPolicy({ CORS_ORIGINS: 'https://bruinchat.example', NODE_ENV: 'production' });
  assert.equal(allowed('https://bruinchat.example'), true);
  assert.equal(allowed(undefined), true);
  for (const origin of ['null', 'https://bruinchat.example.evil.test', 'http://bruinchat.example', 'https://evil.test']) assert.equal(allowed(origin), false);
  assert.equal(createOriginPolicy({})('http://localhost:8081'), false);
  for (const origin of ['*', 'https://bruinchat.example/path', 'http://bruinchat.example']) assert.throws(() => createOriginPolicy({ CORS_ORIGINS: origin, NODE_ENV: 'production' }));
});
test('message validation handles types, length boundaries, Cloudinary ownership and reply IDs', () => {
  assert.equal(validateMessage({ text: 'x'.repeat(4000) }), null);
  for (const body of [{ text: 'x'.repeat(4001) }, { text: {} }, { mediaUrl: 42 }, { mediaUrls: ['https://evil.test/a.jpg'] }, { mediaUrls: ['https://res.cloudinary.com/other/image/upload/a.jpg'] }, { mediaUrls: Array(11).fill('https://res.cloudinary.com/test-cloud/image/authenticated/messages/aaaaaaaaaaaaaaaaaaaaaaaa/a.jpg') }, { replyTo: {} }]) assert.ok(validateMessage(body));
  assert.equal(validateMessage({ mediaUrls: ['https://res.cloudinary.com/test-cloud/video/authenticated/messages/aaaaaaaaaaaaaaaaaaaaaaaa/a.mp4'], mediaTypes: ['video'], replyTo: chatId }), null);
});
test('Mongoose schema enforces message and profile limits without database access', () => {
  assert.ok(new Message({ chatId, senderId: userId, text: 'x'.repeat(4001) }).validateSync()?.errors.text);
  for (const [field, max] of Object.entries({ username: 64, email: 254, displayName: 100, year: 32, major: 120, goal: 1000, avatarUrl: 2048, pushToken: 4096 })) {
    const user = new User({ username: 'student', displayName: 'Student', [field]: 'x'.repeat(max + 1) });
    assert.ok(user.validateSync()?.errors[field], field);
  }
});

test('profile route returns 400 for oversized or non-string input before updating MongoDB', async () => {
  const { default: users } = await import('../routes/users.js');
  const handler = users.stack.find((layer) => layer.route?.path === '/me/profile').route.stack.at(-1).handle;
  for (const body of [{ major: 'x'.repeat(121) }, { goal: {} }, { year: ['2026'] }]) {
    let status;
    await handler({ body, user: { _id: userId } }, { status(code) { status = code; return this; }, json() {} });
    assert.equal(status, 400);
  }
  assert.equal(users.stack.some((layer) => layer.route?.path === '/dev-list'), false);
});
test('message endpoints reject oversized edits and cross-chat replies; local multipart route is gone', async () => {
  const { default: chats } = await import('../routes/chats.js');
  const originalChat = Chat.findById, originalMessage = Message.findOne, originalMessageExists = Message.exists;
  try {
    Chat.findById = () => ({ lean: async () => ({ members: [userId] }) });
    Message.findOne = async () => ({ senderId: userId });
    Message.exists = async () => null;
    const send = chats.stack.find((layer) => layer.route?.path === '/:id/messages' && layer.route.methods.post).route.stack.at(-1).handle;
    const edit = chats.stack.find((layer) => layer.route?.path === '/:chatId/messages/:id' && layer.route.methods.put).route.stack.at(-1).handle;
    for (const [handler, body] of [[send, { text: 'x'.repeat(4001) }], [send, { text: 'reply', replyTo: userId }], [edit, { text: {} }], [edit, { text: 'x'.repeat(4001) }]]) {
      let status;
      await handler({ params: { id: chatId, chatId }, body, user: { _id: userId } }, { status(code) { status = code; return this; }, json() {} });
      assert.equal(status, 400);
    }
    assert.equal(chats.stack.some((layer) => layer.route?.path === '/:id/messages/media'), false);
  } finally { Chat.findById = originalChat; Message.findOne = originalMessage; Message.exists = originalMessageExists; }
});

test('authenticated media uses expiring signed delivery; public/foreign references and other upload owners are rejected', async () => {
  const { mediaDeliveryUrl, serializeMedia, MEDIA_LINK_TTL_SECONDS } = await import('../utils/media.js');
  process.env.CLOUDINARY_API_KEY = 'test-key';
  process.env.CLOUDINARY_API_SECRET = 'test-secret';
  const asset = `https://res.cloudinary.com/test-cloud/image/authenticated/v123/messages/${userId}/photo.jpg`;
  assert.equal(validateMessage({ mediaUrls: [asset] }, userId), null);
  assert.ok(validateMessage({ mediaUrls: [asset] }, chatId));
  assert.ok(validateMessage({ mediaUrls: [asset.replace('/authenticated/', '/upload/')] }, userId));
  const before = Math.floor(Date.now() / 1000);
  const delivered = new URL(mediaDeliveryUrl(asset));
  assert.equal(delivered.hostname, 'api.cloudinary.com');
  assert.equal(delivered.searchParams.get('type'), 'authenticated');
  assert.equal(delivered.searchParams.get('public_id'), `messages/${userId}/photo`);
  assert.ok(delivered.searchParams.get('signature'));
  assert.ok(Number(delivered.searchParams.get('expires_at')) <= before + MEDIA_LINK_TTL_SECONDS + 1);
  assert.ok(Number(delivered.searchParams.get('expires_at')) >= before + MEDIA_LINK_TTL_SECONDS);
  const source = { _id: userId, mediaUrl: asset, mediaUrls: [asset], replyTo: { mediaUrl: asset }, avatarUrl: asset };
  const output = serializeMedia(source);
  assert.ok(output.mediaUrl.startsWith('https://api.cloudinary.com/'));
  assert.ok(output.replyTo.mediaUrl.startsWith('https://api.cloudinary.com/'));
  assert.equal(source.mediaUrl, asset);
  assert.equal(mediaDeliveryUrl(asset.replace('test-cloud', 'other-cloud')), '');
  assert.equal(mediaDeliveryUrl(asset + '?signature=forged'), '');
  assert.equal(serializeMedia({ mediaUrl: '/uploads/old.jpg' }).mediaUrl, '');
});

test('upload signatures lock delivery type and folder to the authenticated account', async () => {
  const { default: uploads } = await import('../routes/upload.js');
  const { v2: cloudinary } = await import('cloudinary');
  const handler = uploads.stack.find((layer) => layer.route?.path === '/signature').route.stack.at(-1).handle;
  let body;
  handler({ query: { folder: 'messages' }, user: { _id: userId } }, { json(value) { body = value; } });
  assert.equal(body.type, 'authenticated');
  assert.equal(body.folder, `messages/${userId}`);
  const expected = cloudinary.utils.api_sign_request({ folder: body.folder, timestamp: body.timestamp, public_id: body.publicId, overwrite: false, type: 'authenticated', upload_preset: 'bruinchat_signed' }, process.env.CLOUDINARY_API_SECRET);
  assert.equal(body.signature, expected);
});
