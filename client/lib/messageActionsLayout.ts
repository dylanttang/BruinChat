// Where the long-press overlay puts the message, the reaction bar above it and
// the menu below it, Instagram-style. No React Native imports, so it's
// unit-testable.

import type { Rect } from "./mediaLayout";

type Options = {
  // The pressed message's row, where it is on screen right now.
  rect: Rect;
  screenHeight: number;
  // Space taken by the notch and the home bar.
  topInset: number;
  bottomInset: number;
  barHeight: number;
  menuHeight: number;
  gap: number;
  margin: number;
};

// The message stays where it is when everything fits. Otherwise it slides up
// (or down) just enough for the bar and menu to fit on screen. A message too
// tall for all three lets the menu cover its bottom instead.
export function messageActionsLayout({
  rect, screenHeight, topInset, bottomInset, barHeight, menuHeight, gap, margin,
}: Options) {
  const minTop = topInset + margin;
  const maxBottom = screenHeight - bottomInset - margin;

  let messageY = rect.y;
  const bottom = messageY + rect.height + gap + menuHeight;
  if (bottom > maxBottom) messageY -= bottom - maxBottom;
  const top = messageY - gap - barHeight;
  if (top < minTop) messageY += minTop - top;

  return {
    messageY,
    barY: messageY - gap - barHeight,
    menuY: Math.min(messageY + rect.height + gap, maxBottom - menuHeight),
  };
}
