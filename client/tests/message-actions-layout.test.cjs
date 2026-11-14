const { test } = require('node:test');
const assert = require('node:assert/strict');
const loadModule = require('./helpers/load-module.cjs');

const { messageActionsLayout } = loadModule('lib/messageActionsLayout.ts');

const base = { screenHeight: 800, topInset: 50, bottomInset: 30, barHeight: 50, menuHeight: 200, gap: 8, margin: 12 };
const plain = (value) => JSON.parse(JSON.stringify(value));

test('a message with room around it stays where it is', () => {
  const layout = messageActionsLayout({ ...base, rect: { x: 0, y: 300, width: 300, height: 60 } });
  assert.deepEqual(plain(layout), { messageY: 300, barY: 242, menuY: 368 });
});

test('a message near the bottom slides up so the menu fits', () => {
  const layout = messageActionsLayout({ ...base, rect: { x: 0, y: 600, width: 300, height: 60 } });
  // The menu ends right at the bottom margin: 800 - 30 - 12 = 758.
  assert.equal(layout.menuY + base.menuHeight, 758);
  assert.equal(layout.messageY, 758 - 200 - 8 - 60);
  assert.equal(layout.barY, layout.messageY - 58);
});

test('a message near the top slides down so the bar fits', () => {
  const layout = messageActionsLayout({ ...base, rect: { x: 0, y: 70, width: 300, height: 60 } });
  // The bar starts right at the top margin: 50 + 12 = 62.
  assert.equal(layout.barY, 62);
  assert.equal(layout.messageY, 120);
});

test('a message too tall for everything keeps the bar on screen and the menu covers its bottom', () => {
  const layout = messageActionsLayout({ ...base, rect: { x: 0, y: 100, width: 300, height: 600 } });
  assert.equal(layout.barY, 62);
  assert.equal(layout.menuY, 758 - 200);
});
