// A search result going back to a chat that's already open. The chat picks
// this up when it regains focus, after it has reloaded its messages.
let pending: string | null = null;

export function requestMessageJump(messageId: string) {
  pending = messageId;
}

export function takeMessageJump() {
  const messageId = pending;
  pending = null;
  return messageId;
}
