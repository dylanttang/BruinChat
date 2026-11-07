const { test } = require('node:test');
const assert = require('node:assert/strict');
const loadModule = require('./helpers/load-module.cjs');

const { messageMedia, chatMedia } = loadModule('lib/messageMedia.ts', { './api': { API_URL: 'https://api.test' } });

test('message media resolves server paths and guesses types for old messages', () => {
  const items = messageMedia({ mediaUrl: '/uploads/clip.MOV' });
  assert.deepEqual([...items.map((item) => ({ ...item }))], [{ uri: 'https://api.test/uploads/clip.MOV', type: 'video' }]);
  const typed = messageMedia({ mediaUrls: ['https://cdn.test/a', 'file:///b.jpg'], mediaTypes: ['video', 'image'] });
  assert.deepEqual([...typed.map((item) => item.type)], ['video', 'image']);
  assert.equal(typed[1].uri, 'file:///b.jpg');
  assert.equal(messageMedia({ mediaUrls: [] }).length, 0);
});

test('chat media lists every item oldest first with a key per message and place', () => {
  const newestFirst = [
    { _id: 'c', mediaUrls: ['https://cdn.test/c1.jpg', 'https://cdn.test/c2.mp4'] },
    { _id: 'b' },
    { _id: 'a', mediaUrl: 'https://cdn.test/a.jpg' },
  ];
  assert.deepEqual([...chatMedia(newestFirst).map((item) => `${item.key} ${item.type}`)], ['a:0 image', 'c:0 image', 'c:1 video']);
});
