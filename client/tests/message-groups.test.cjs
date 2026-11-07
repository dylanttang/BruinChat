const { test } = require('node:test');
const assert = require('node:assert/strict');
const loadModule = require('./helpers/load-module.cjs');

const { messageGrouping } = loadModule('lib/messageGroups.ts');

const from = (sender, id) => ({ _id: id, senderId: { _id: sender } });
const flat = (grouping) => ({ ...grouping });

test('messages from one sender in a row join up, newest first', () => {
  const rows = [from('b', '4'), from('a', '3'), from('a', '2'), from('a', '1')];
  assert.deepEqual(flat(messageGrouping(rows, 0)), { withPrevious: false, withNext: false });
  assert.deepEqual(flat(messageGrouping(rows, 1)), { withPrevious: true, withNext: false });
  assert.deepEqual(flat(messageGrouping(rows, 2)), { withPrevious: true, withNext: true });
  assert.deepEqual(flat(messageGrouping(rows, 3)), { withPrevious: false, withNext: true });
});

test('a date or time divider splits a group', () => {
  const rows = [from('a', '2'), { _id: 'sep-1', type: 'date', label: 'Today' }, from('a', '1')];
  assert.deepEqual(flat(messageGrouping(rows, 0)), { withPrevious: false, withNext: false });
  assert.deepEqual(flat(messageGrouping(rows, 2)), { withPrevious: false, withNext: false });
});

test('messages with no sender never join up', () => {
  const rows = [{ _id: '2', senderId: null }, { _id: '1', senderId: null }];
  assert.deepEqual(flat(messageGrouping(rows, 0)), { withPrevious: false, withNext: false });
});
