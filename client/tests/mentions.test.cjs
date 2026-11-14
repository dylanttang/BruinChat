const { test } = require('node:test');
const assert = require('node:assert/strict');
const loadModule = require('./helpers/load-module.cjs');

const { mentionQuery, matchMembers, insertMention, mentionsInText, splitMentions } = loadModule('lib/mentions.ts');
const plain = (value) => JSON.parse(JSON.stringify(value));

const members = [
  { _id: '1', displayName: 'Darren Le' },
  { _id: '2', displayName: 'Mark Mairs' },
  { _id: '3', displayName: 'Leonardo Vela' },
];

test('finds the @ being typed before the cursor, spaces included', () => {
  assert.deepEqual(plain(mentionQuery('hey @Dar', 8)), { start: 4, query: 'Dar' });
  assert.deepEqual(plain(mentionQuery('@', 1)), { start: 0, query: '' });
  assert.deepEqual(plain(mentionQuery('hey @Darren L', 13)), { start: 4, query: 'Darren L' });
  assert.equal(mentionQuery('email me@ucla.edu', 17), null);
  assert.equal(mentionQuery('no mention here', 15), null);
});

test('matches names starting with the query first, then anywhere', () => {
  assert.deepEqual(plain(matchMembers(members, 'le')).map((m) => m._id), ['1', '3']);
  assert.deepEqual(plain(matchMembers(members, 'mar')).map((m) => m._id), ['2']);
  assert.deepEqual(plain(matchMembers(members, 'ren')).map((m) => m._id), ['1']);
  assert.deepEqual(plain(matchMembers(members, 'zzz')), []);
  assert.equal(matchMembers(members, '').length, 3);
});

test('inserting a mention replaces the typed query and adds a space', () => {
  assert.deepEqual(plain(insertMention('hey @Dar', 4, 8, 'Darren Le')), { text: 'hey @Darren Le ', cursor: 15 });
  assert.deepEqual(plain(insertMention('@ma see you', 0, 3, 'Mark Mairs')), { text: '@Mark Mairs  see you', cursor: 12 });
});

test('only people still named in the text are sent as mentions', () => {
  const picked = [members[0], members[1], members[0]];
  assert.deepEqual(plain(mentionsInText('hi @Darren Le', picked)).map((m) => m._id), ['1']);
});

test('splits a message into mention and plain parts, longest name first', () => {
  assert.deepEqual(plain(splitMentions('hi @Darren Le and @Ann', ['Ann', 'Darren Le'])), [
    { text: 'hi ', mention: false },
    { text: '@Darren Le', mention: true },
    { text: ' and ', mention: false },
    { text: '@Ann', mention: true },
  ]);
  assert.deepEqual(plain(splitMentions('@Ann Lee hi', ['Ann', 'Ann Lee'])), [
    { text: '@Ann Lee', mention: true },
    { text: ' hi', mention: false },
  ]);
  assert.deepEqual(plain(splitMentions('no mentions', [])), [{ text: 'no mentions', mention: false }]);
});
