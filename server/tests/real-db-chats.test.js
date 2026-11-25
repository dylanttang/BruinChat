import { test } from 'node:test';
import assert from 'node:assert/strict';
import Chat from '../../models/Chat.js';
import Course from '../../models/Course.js';
import { request } from './helpers/http.js';
import { useRealDb, makeUser, authHeaders } from './helpers/realDb.js';

// Today's behavior for class chats and DMs, checked against a real database.
// These guard existing features while chat types change (#116).
useRealDb();

const course = () => Course.create({ subjectArea: 'COM SCI', number: '35L', title: 'Software Construction', term: '26F' });
const list = (user, kind) => request(`/api/chats?limit=20${kind ? `&kind=${kind}` : ''}`, { headers: authHeaders(user) });
const setCourses = (user, courseIds) => request('/api/users/me/courses', { method: 'PUT', headers: authHeaders(user), body: { courseIds } });

test('adding a class creates one shared class chat; dropping it leaves the chat', async () => {
  const [ana, ben, cs35l] = [await makeUser(), await makeUser(), await course()];
  assert.equal((await setCourses(ana, [String(cs35l._id)])).status, 200);
  assert.equal((await setCourses(ben, [String(cs35l._id)])).status, 200);

  const chats = await Chat.find({ course: cs35l._id }).lean();
  assert.equal(chats.length, 1);
  assert.equal(chats[0].isGroup, true);
  assert.deepEqual(chats[0].members.map(String).sort(), [String(ana._id), String(ben._id)].sort());

  const groupList = await list(ana, 'group');
  assert.deepEqual(groupList.data.chats.map((chat) => chat._id), [String(chats[0]._id)]);
  assert.equal((await list(ana, 'direct')).data.chats.length, 0);

  assert.equal((await setCourses(ana, [])).status, 200);
  assert.deepEqual((await Chat.findById(chats[0]._id).lean()).members.map(String), [String(ben._id)]);
  assert.equal((await list(ana, 'group')).data.chats.length, 0);
});

test('starting a DM twice reuses one chat, listed only under direct', async () => {
  const [ana, ben] = [await makeUser(), await makeUser()];
  const first = await request('/api/chats/direct', { method: 'POST', headers: authHeaders(ana), body: { recipientId: String(ben._id) } });
  const again = await request('/api/chats/direct', { method: 'POST', headers: authHeaders(ben), body: { recipientId: String(ana._id) } });
  assert.equal(first.status, 200);
  assert.equal(again.data.chat._id, first.data.chat._id);
  assert.equal(await Chat.countDocuments({ isGroup: false }), 1);

  assert.deepEqual((await list(ana, 'direct')).data.chats.map((chat) => chat._id), [first.data.chat._id]);
  assert.equal((await list(ana, 'group')).data.chats.length, 0);
});

test('a group chat with no course (like the team chat) lists with classes and can be left', async () => {
  const [ana, ben] = [await makeUser(), await makeUser()];
  const team = await Chat.create({ name: 'BChat Team', isGroup: true, members: [ana._id, ben._id], createdBy: ana._id });
  assert.deepEqual((await list(ana, 'group')).data.chats.map((chat) => chat._id), [String(team._id)]);

  const left = await request(`/api/chats/${team._id}/members/me`, { method: 'DELETE', headers: authHeaders(ana) });
  assert.equal(left.status, 200);
  assert.deepEqual((await Chat.findById(team._id).lean()).members.map(String), [String(ben._id)]);
});

test('chat list pages by newest message without skipping or repeating chats', async () => {
  const ana = await makeUser();
  const chats = [];
  for (let i = 0; i < 5; i += 1) {
    chats.push(await Chat.create({ name: `Chat ${i}`, isGroup: true, members: [ana._id], createdBy: ana._id, lastMessageAt: new Date(Date.now() - i * 60_000) }));
  }
  const firstPage = await request('/api/chats?limit=2&kind=group', { headers: authHeaders(ana) });
  const secondPage = await request(`/api/chats?limit=2&kind=group&before=${firstPage.data.nextCursor}`, { headers: authHeaders(ana) });
  const thirdPage = await request(`/api/chats?limit=2&kind=group&before=${secondPage.data.nextCursor}`, { headers: authHeaders(ana) });
  const seen = [...firstPage.data.chats, ...secondPage.data.chats, ...thirdPage.data.chats].map((chat) => chat._id);
  assert.deepEqual(seen, chats.map((chat) => String(chat._id)));
  assert.equal(thirdPage.data.hasMore, false);
});
