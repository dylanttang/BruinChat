const { test } = require('node:test');
const assert = require('node:assert/strict');
const loadModule = require('./helpers/load-module.cjs');

const layout = loadModule('lib/mediaLayout.ts');

test('chat photos keep their shape inside the max box', () => {
  assert.deepEqual({ ...layout.fitWithin(4 / 3, 240, 300) }, { width: 240, height: 180 }); // landscape
  assert.deepEqual({ ...layout.fitWithin(3 / 4, 240, 300) }, { width: 225, height: 300 }); // portrait
  assert.deepEqual({ ...layout.fitWithin(1, 240, 300) }, { width: 240, height: 240 }); // square
  assert.deepEqual({ ...layout.fitWithin(NaN, 240, 300) }, { width: 240, height: 240 }); // unknown
});

test('extreme ratios are capped in chat so photos never become slivers', () => {
  assert.equal(layout.clampRatio(0.1), layout.MIN_CHAT_RATIO);
  assert.equal(layout.clampRatio(10), layout.MAX_CHAT_RATIO);
  assert.equal(layout.clampRatio(1.5), 1.5);
  assert.equal(layout.clampRatio(0), 1);
});

test('viewer centers the media as large as fits', () => {
  const rect = layout.viewerRect(1, { width: 400, height: 800 });
  assert.deepEqual({ ...rect }, { x: 12, y: 212, width: 376, height: 376 });
  const unknown = layout.viewerRect(null, { width: 400, height: 800 });
  assert.equal(unknown.width, 376);
  assert.equal(unknown.height, 640);
});

test('zoomFrom places the viewer image exactly over the chat thumbnail', () => {
  const origin = { x: 100, y: 500, width: 94, height: 94 };
  const target = { x: 12, y: 212, width: 376, height: 376 };
  const zoom = layout.zoomFrom(origin, target);
  assert.equal(zoom.scale, 0.25);
  // Target center (200, 400) moved to the origin center (147, 547).
  assert.equal(zoom.translateX, -53);
  assert.equal(zoom.translateY, 147);
});

test('chat shows up to 4 tiles and "+N" on the 4th when there are more', () => {
  assert.deepEqual({ ...layout.chatGrid(1) }, { shown: 1, wideLast: false, extra: 0, opensGallery: false });
  assert.deepEqual({ ...layout.chatGrid(3) }, { shown: 3, wideLast: true, extra: 0, opensGallery: false });
  assert.deepEqual({ ...layout.chatGrid(4) }, { shown: 4, wideLast: false, extra: 0, opensGallery: true });
  assert.deepEqual({ ...layout.chatGrid(7) }, { shown: 4, wideLast: false, extra: 4, opensGallery: true });
});

test('swiping moves one page and never wraps around', () => {
  const W = 400;
  assert.equal(layout.swipeTarget(0, 3, { dx: -120, vx: 0 }, W), 1); // drag left: next
  assert.equal(layout.swipeTarget(1, 3, { dx: 120, vx: 0 }, W), 0); // drag right: previous
  assert.equal(layout.swipeTarget(1, 3, { dx: -30, vx: 0 }, W), 1); // too short: stay
  assert.equal(layout.swipeTarget(1, 3, { dx: -30, vx: -1 }, W), 2); // quick flick: next
  assert.equal(layout.swipeTarget(2, 3, { dx: -300, vx: -2 }, W), 2); // last stays last
  assert.equal(layout.swipeTarget(0, 3, { dx: 300, vx: 2 }, W), 0); // first stays first
});

test('dragging past either end only follows the finger a little', () => {
  assert.equal(layout.resistDrag(0, 3, 100), 25);
  assert.equal(layout.resistDrag(2, 3, -100), -25);
  assert.equal(layout.resistDrag(1, 3, 100), 100);
});

test('video lengths read like 0:07, 1:05 and 1:02:03', () => {
  assert.equal(layout.formatDuration(7400), '0:07');
  assert.equal(layout.formatDuration(65000), '1:05');
  assert.equal(layout.formatDuration(3723000), '1:02:03');
  assert.equal(layout.formatDuration(NaN), '0:00');
});

test('the progress bar maps a touch to a point in the video, within the bar', () => {
  assert.equal(layout.seekFraction(50, 200), 0.25);
  assert.equal(layout.seekFraction(-20, 200), 0);
  assert.equal(layout.seekFraction(500, 200), 1);
  assert.equal(layout.seekFraction(10, 0), 0);
});

test('a zoomed photo can only move as far as its edges', () => {
  const size = { width: 400, height: 300 };
  const window = { width: 400, height: 800 };
  assert.deepEqual({ ...layout.panBounds(size, 1, window) }, { x: 0, y: 0 });
  // 2x: 800 wide on a 400 wide screen, still shorter than the screen.
  assert.deepEqual({ ...layout.panBounds(size, 2, window) }, { x: 200, y: 0 });
  assert.deepEqual({ ...layout.panBounds(size, 4, window) }, { x: 600, y: 200 });
});

test('pinching past the limits slows down but keeps moving', () => {
  assert.equal(layout.rubberBand(2, 1, 4), 2);
  const below = layout.rubberBand(0.5, 1, 4);
  assert.ok(below < 1 && below > 0.5);
  const above = layout.rubberBand(6, 1, 4);
  assert.ok(above > 4 && above < 6);
  assert.ok(layout.rubberBand(8, 1, 4) > above);
});

test('zooming keeps the point under the fingers still', () => {
  // Screen point of a photo point p: center + offset + scale * (p - center).
  const center = 200;
  const focal = 300;
  const offset = 40;
  const pointUnder = center + (focal - center - offset) / 2; // at 2x
  const next = layout.zoomAround(offset, 2, 3, focal, center);
  assert.equal(center + next + 3 * (pointUnder - center), focal);
  assert.equal(layout.zoomAround(offset, 2, 2, focal, center), offset);
});

test('a zoomed photo resists being dragged past its edge, not back in', () => {
  assert.equal(layout.dragWithin(0, 10, 100), 10);
  assert.equal(layout.dragWithin(100, 10, 100), 100 + 10 * layout.EDGE_RESIST);
  assert.equal(layout.dragWithin(100, -10, 100), 90);
  assert.equal(layout.dragWithin(-100, -10, 100), -100 - 10 * layout.EDGE_RESIST);
  // Not zoomed (bound 0): every drag resists.
  assert.equal(layout.dragWithin(0, 10, 0), 10 * layout.EDGE_RESIST);
});

test('zoom settles inside its limits with no gap at the edges', () => {
  const size = { width: 400, height: 300 };
  const window = { width: 400, height: 800 };
  assert.deepEqual({ ...layout.settleZoom({ scale: 0.8, x: 30, y: 20 }, size, window) }, { scale: 1, x: 0, y: 0 });
  // 2x can move 200 sideways and not at all up or down.
  assert.deepEqual({ ...layout.settleZoom({ scale: 2, x: 350, y: 50 }, size, window) }, { scale: 2, x: 200, y: 0 });
  // Past the max comes back to it, pulled toward the center the same amount.
  assert.deepEqual({ ...layout.settleZoom({ scale: 5, x: 500, y: 0 }, size, window) }, { scale: 4, x: 400, y: 0 });
});
