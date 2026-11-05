// Sizing math for photos and videos in chat and in the full-screen viewer.
// No React Native imports, so it's unit-testable.

export type Rect = { x: number; y: number; width: number; height: number };

// Very tall or very wide media is capped to these width/height ratios in
// chat so it doesn't become a sliver; the viewer always shows the real shape.
export const MIN_CHAT_RATIO = 0.5;
export const MAX_CHAT_RATIO = 2.5;

export function clampRatio(ratio: number, min = MIN_CHAT_RATIO, max = MAX_CHAT_RATIO): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return 1;
  return Math.min(max, Math.max(min, ratio));
}

// The largest size with this width/height ratio that fits inside the box.
export function fitWithin(ratio: number, maxWidth: number, maxHeight: number): { width: number; height: number } {
  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  let width = maxWidth;
  let height = width / safeRatio;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * safeRatio;
  }
  return { width: Math.round(width), height: Math.round(height) };
}

// Where the viewer shows media: as large as fits, centered in the window.
// Without a known ratio it uses the whole box (the media is drawn "contain").
export function viewerRect(
  ratio: number | null,
  window: { width: number; height: number },
  { margin = 12, maxHeightFraction = 0.8 } = {}
): Rect {
  const maxWidth = window.width - margin * 2;
  const maxHeight = window.height * maxHeightFraction;
  const size = ratio ? fitWithin(ratio, maxWidth, maxHeight) : { width: maxWidth, height: maxHeight };
  return {
    x: (window.width - size.width) / 2,
    y: (window.height - size.height) / 2,
    ...size,
  };
}

// The transform that makes something drawn at `target` sit over `origin`, so
// animating it to the identity grows it from where it was in the chat.
// Transforms scale around the center, so translate center-to-center.
export function zoomFrom(origin: Rect, target: Rect): { translateX: number; translateY: number; scale: number } {
  if (!origin.width || !target.width) return { translateX: 0, translateY: 0, scale: 1 };
  return {
    translateX: origin.x + origin.width / 2 - (target.x + target.width / 2),
    translateY: origin.y + origin.height / 2 - (target.y + target.height / 2),
    scale: origin.width / target.width,
  };
}

// How a message's media is laid out in chat. Up to 4 tiles are shown; with
// more, the 4th tile is covered by "+N" (N = everything not fully visible).
// With 4 or more, tapping opens a grid of all of them instead of the viewer.
export const CHAT_GRID_MAX = 4;

export function chatGrid(count: number): { shown: number; wideLast: boolean; extra: number; opensGallery: boolean } {
  const shown = Math.min(Math.max(count, 0), CHAT_GRID_MAX);
  return {
    shown,
    // An odd tile at the end spans the full width so the grid stays a rectangle.
    wideLast: shown > 1 && shown % 2 === 1,
    extra: count > CHAT_GRID_MAX ? count - (CHAT_GRID_MAX - 1) : 0,
    opensGallery: count >= CHAT_GRID_MAX,
  };
}

// Which page a horizontal swipe in the viewer lands on. A long enough drag or
// a quick flick moves one page; it never wraps from the last to the first.
export function swipeTarget(
  index: number,
  count: number,
  drag: { dx: number; vx: number },
  pageWidth: number,
  { distance = 0.2, velocity = 0.4 } = {}
): number {
  const next = drag.dx < -pageWidth * distance || drag.vx < -velocity ? index + 1
    : drag.dx > pageWidth * distance || drag.vx > velocity ? index - 1
    : index;
  return Math.min(count - 1, Math.max(0, next));
}

// Past the first or last page the drag only follows the finger a little.
export function resistDrag(index: number, count: number, dx: number, factor = 0.25): number {
  const pastStart = index === 0 && dx > 0;
  const pastEnd = index === count - 1 && dx < 0;
  return pastStart || pastEnd ? dx * factor : dx;
}

// A video's length or position as m:ss (or h:mm:ss for long ones).
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

// How far along a progress bar a touch is, from 0 (start) to 1 (end).
export function seekFraction(x: number, width: number): number {
  if (!(width > 0) || !Number.isFinite(x)) return 0;
  return Math.min(1, Math.max(0, x / width));
}
