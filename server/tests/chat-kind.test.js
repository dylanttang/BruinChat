import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import Chat from '../../models/Chat.js';
import Course from '../../models/Course.js';
import Message from '../../models/Message.js';
import { request } from './helpers/http.js';
import { useRealDb, makeUser, authHeaders } from './helpers/realDb.js';
import { getReviewUser } from '../utils/reviewLogin.js';

const { backfillChatKinds } = createRequire(import.meta.url)('../../scripts/backfillChatKind.js');

// Chat kind, phase 1 (#116): new chats store a kind, and chats created before
// that (no kind) keep working exactly as before until the backfill runs.
useRealDb();

const quiet = { log: () => {} };
const course = () => Course.create({ subjectArea: 'COM SCI', number: '35L', title: 'Software Construction', term: '26F' });
const list = (user, kind, extra = '') => request(`/api/chats?limit=20&kind=${kind}${extra}`, { headers: authHeaders(user) });
const ids = (response) => response.data.chats.map((chat) => chat._id);

// Chats shaped like the ones already in production, which have no kind.
async function legacyChats(ana, ben, cs35l) {
  const members = [ana._id, ben._id];
  const insert = async (doc) => (await Chat.collection.insertOne({ archivedBy: [], lastMessageAt: null, createdBy: ana._id, ...doc })).insertedId;
  return {
    classChat: await insert({ name: 'COM SCI 35L — Software Construction', isGroup: true, course: cs35l._id, members }),
    dm: await insert({ name: 'Direct message', isGroup: false, directKey: members.map(String).sort().join(':'), members }),
    team: await insert({ name: 'BChat Team', isGroup: true, members }),
  };
}

test('kindOf uses the stored kind, else the rule the app has always used', () => {
  assert.equal(Chat.kindOf({ kind: 'group', isGroup: true }), 'group');
  assert.equal(Chat.kindOf({ course: 'c', isGroup: true }), 'class');
  assert.equal(Chat.kindOf({ course: 'c', isGroup: false }), 'class');
  assert.equal(Chat.kindOf({ isGroup: false }), 'direct');
  assert.equal(Chat.kindOf({ isGroup: true }), 'team');
  assert.equal(Chat.kindOf({}), 'team');
});

test('every way a chat is created stores its kind', async () => {
  const [ana, ben, cs35l] = [await makeUser(), await makeUser(), await course()];
  await request('/api/users/me/courses', { method: 'PUT', headers: authHeaders(ana), body: { courseIds: [String(cs35l._id)] } });
  assert.equal((await Chat.findOne({ course: cs35l._id }).lean()).kind, 'class');

  const dm = await request('/api/chats/direct', { method: 'POST', headers: authHeaders(ana), body: { recipientId: String(ben._id) } });
  assert.equal((await Chat.findById(dm.data.chat._id).lean()).kind, 'direct');

  process.env.REVIEW_LOGIN_EMAIL = 'reviewer@example.com';
  try {
    const reviewer = await getReviewUser();
    assert.equal((await Chat.findOne({ members: reviewer._id }).lean()).kind, 'team');
  } finally {
    delete process.env.REVIEW_LOGIN_EMAIL;
  }
});

test('chats without a kind list, page and open as before', async () => {
  const [ana, ben, cs35l] = [await makeUser(), await makeUser(), await course()];
  const { classChat, dm, team } = await legacyChats(ana, ben, cs35l);

  assert.deepEqual(new Set(ids(await list(ana, 'group'))), new Set([String(classChat), String(team)]));
  assert.deepEqual(ids(await list(ana, 'direct')), [String(dm)]);

  const firstPage = await request('/api/chats?limit=1&kind=group', { headers: authHeaders(ana) });
  const secondPage = await request(`/api/chats?limit=1&kind=group&before=${firstPage.data.nextCursor}`, { headers: authHeaders(ana) });
  assert.equal(secondPage.status, 200);
  assert.deepEqual(new Set([...ids(firstPage), ...ids(secondPage)]), new Set([String(classChat), String(team)]));

  const opened = await request(`/api/chats/${dm}`, { headers: authHeaders(ana) });
  assert.equal(opened.status, 200);
  assert.equal(opened.data.chat.isGroup, false);
});

test('messages send in chats without a kind, and DM block checks still apply', async () => {
  const [ana, ben, cs35l] = [await makeUser(), await makeUser(), await course()];
  const { classChat, dm } = await legacyChats(ana, ben, cs35l);
  const send = (user, chatId) => request(`/api/chats/${chatId}/messages`, { method: 'POST', headers: authHeaders(user), body: { text: 'hi' } });

  assert.equal((await send(ana, classChat)).status, 201);
  assert.equal((await send(ana, dm)).status, 201);
  assert.equal(await Message.countDocuments(), 2);

  await ben.updateOne({ $set: { blockedUsers: [ana._id] } });
  assert.equal((await send(ana, dm)).status, 403);
  assert.equal((await send(ana, classChat)).status, 201);
});

test('chats without a kind can be left, except DMs', async () => {
  const [ana, ben, cs35l] = [await makeUser(), await makeUser(), await course()];
  const { dm, team } = await legacyChats(ana, ben, cs35l);
  const leave = (chatId) => request(`/api/chats/${chatId}/members/me`, { method: 'DELETE', headers: authHeaders(ana) });

  assert.equal((await leave(dm)).status, 400);
  assert.equal((await leave(team)).status, 200);
  const saved = await Chat.findById(team).lean();
  assert.deepEqual(saved.members.map(String), [String(ben._id)]);
  assert.equal(saved.kind, undefined);
});

test('backfill dry run counts without writing', async () => {
  const [ana, ben, cs35l] = [await makeUser(), await makeUser(), await course()];
  await legacyChats(ana, ben, cs35l);
  const result = await backfillChatKinds({ apply: false, ...quiet });
  assert.deepEqual(result.planned, { class: 1, direct: 1, team: 1 });
  assert.equal(result.remaining, 3);
  assert.equal(await Chat.countDocuments({ kind: { $exists: true } }), 0);
});

test('backfill labels every old shape, keeps other fields, and is safe to rerun', async () => {
  const [ana, ben, cs35l] = [await makeUser(), await makeUser(), await course()];
  const { classChat, dm, team } = await legacyChats(ana, ben, cs35l);
  const odd = (await Chat.collection.insertOne({ name: 'Odd', isGroup: false, course: (await Course.create({ subjectArea: 'MATH', number: '32B', title: 'Calc', term: '26F' }))._id, members: [ana._id], createdBy: ana._id })).insertedId;
  const labeled = await Chat.create({ name: 'Already labeled', kind: 'team', isGroup: true, members: [ana._id], createdBy: ana._id });
  const before = await Chat.find().lean();

  const result = await backfillChatKinds({ apply: true, ...quiet });
  assert.equal(result.remaining, 0);
  const kinds = Object.fromEntries((await Chat.find().lean()).map((chat) => [String(chat._id), chat.kind]));
  assert.deepEqual(kinds, {
    [String(classChat)]: 'class', [String(dm)]: 'direct', [String(team)]: 'team', [String(odd)]: 'class', [String(labeled._id)]: 'team',
  });

  for (const old of before) {
    const now = await Chat.findById(old._id).lean();
    const { kind: _old, ...oldRest } = old;
    const { kind: _now, ...nowRest } = now;
    assert.deepEqual(nowRest, oldRest);
  }

  const again = await backfillChatKinds({ apply: true, ...quiet });
  assert.deepEqual(again.planned, { class: 0, direct: 0, team: 0 });
  assert.equal(again.remaining, 0);
});
