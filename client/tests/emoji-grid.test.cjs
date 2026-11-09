const { test } = require('node:test');
const assert = require('node:assert/strict');
const loadModule = require('./helpers/load-module.cjs');

const { buildEmojiColumns, sectionAtOffset, searchEmojis, addRecentEmoji } = loadModule('lib/emojiGrid.ts');

// Modules load in their own context, so copy arrays before deepEqual.
const plain = (value) => JSON.parse(JSON.stringify(value));
const emojis = (count, prefix) =>
  Array.from({ length: count }, (_, i) => ({ emoji: `${prefix}${i}`, name: `${prefix} ${i}` }));

test('each section starts a new column, with a gap before it', () => {
  const sections = [{ key: 'a', emojis: emojis(7, 'a') }, { key: 'b', emojis: emojis(3, 'b') }];
  const { columns, sectionOffsets, totalWidth } = buildEmojiColumns(sections, 5, 40, 12);
  assert.deepEqual(plain(columns.map((c) => c.emojis.length)), [5, 2, 3]);
  assert.deepEqual(plain(columns.map((c) => c.section)), [0, 0, 1]);
  assert.deepEqual(plain(columns.map((c) => c.offset)), [0, 40, 80]);
  assert.deepEqual(plain(columns.map((c) => c.width)), [40, 40, 52]);
  assert.deepEqual(plain(sectionOffsets), [0, 80]);
  assert.equal(totalWidth, 132);
});

test('the section at the left edge is the active one', () => {
  assert.equal(sectionAtOffset([0, 80, 200], 0), 0);
  assert.equal(sectionAtOffset([0, 80, 200], 79), 1);
  assert.equal(sectionAtOffset([0, 80, 200], 150), 1);
  assert.equal(sectionAtOffset([0, 80, 200], 500), 2);
});

test('search matches every word against names and keywords', () => {
  const all = [
    { emoji: '😂', name: 'face with tears of joy', keywords: ['laugh', 'lol'] },
    { emoji: '😀', name: 'grinning face', keywords: ['smile'] },
  ];
  assert.deepEqual(searchEmojis(all, 'LOL').map((e) => e.emoji), ['😂']);
  assert.deepEqual(searchEmojis(all, 'face').map((e) => e.emoji), ['😂', '😀']);
  assert.deepEqual(searchEmojis(all, 'face smile').map((e) => e.emoji), ['😀']);
  assert.deepEqual(plain(searchEmojis(all, '   ')), []);
});

test('recent emojis move to the front without duplicates', () => {
  assert.deepEqual(plain(addRecentEmoji(['a', 'b', 'c'], 'b', 3)), ['b', 'a', 'c']);
  assert.deepEqual(plain(addRecentEmoji(['a', 'b', 'c'], 'd', 3)), ['d', 'a', 'b']);
});
