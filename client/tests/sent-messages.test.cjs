const { test } = require('node:test');
const assert = require('node:assert/strict');
const loadModule = require('./helpers/load-module.cjs');

const sent = loadModule('lib/sentMessages.ts');
const me = { _id: 'me' };
const pending = { _id: 'local-1', clientKey: 'local-1', pending: true, text: 'hi', mediaUrls: [], senderId: me };
const older = { _id: 'm1', text: 'earlier', senderId: { _id: 'other' } };
const server = { _id: 'm2', text: 'hi', mediaUrls: [], senderId: me };

test('server copy replaces the pending row and keeps its list key', () => {
  const list = sent.confirmSent([pending, older], 'local-1', server);
  assert.equal(list.length, 2);
  assert.equal(list[0]._id, 'm2');
  assert.equal(list[0].clientKey, 'local-1');
  assert.ok(!list[0].pending);
});

test('socket copy arriving before the POST response swaps in once, never duplicates', () => {
  assert.equal(sent.isNewToList([pending, older], server), false);
  const afterSocket = sent.receiveMessage([pending, older], server);
  assert.deepEqual(Array.from(afterSocket, m => m._id), ['m2', 'm1']);
  assert.equal(afterSocket[0].clientKey, 'local-1');

  const afterResponse = sent.confirmSent(afterSocket, 'local-1', { ...server, reactions: [] });
  assert.deepEqual(Array.from(afterResponse, m => m._id), ['m2', 'm1']);
  assert.equal(afterResponse[0].clientKey, 'local-1');
  assert.ok(!afterResponse[0].pending);
});

test("someone else's message, or a different message of ours, is new and added", () => {
  const theirs = { _id: 'm3', text: 'hi', senderId: { _id: 'other' } };
  assert.equal(sent.isNewToList([pending], theirs), true);
  assert.deepEqual(Array.from(sent.receiveMessage([pending], theirs), m => m._id), ['m3', 'local-1']);

  const otherReply = { ...server, _id: 'm4', replyTo: { _id: 'm1' } };
  assert.equal(sent.isNewToList([pending], otherReply), true);
  assert.equal(sent.receiveMessage([pending], otherReply).length, 2);
});

test('messages already on screen are merged, not re-added or re-animated', () => {
  assert.equal(sent.isNewToList([older], older), false);
  const merged = sent.receiveMessage([older], { ...older, text: 'edited' });
  assert.equal(merged.length, 1);
  assert.equal(merged[0].text, 'edited');
});
