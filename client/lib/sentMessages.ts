// Helpers for showing a message the instant it's sent ("Sending…") and then
// swapping in the server's copy without the row remounting or re-animating.

import { keepLoadedMedia } from "./stableMedia";

export type ListMessage = {
  _id: string;
  text: string;
  mediaUrl?: string | null;
  mediaUrls?: string[];
  senderId: { _id: string };
  replyTo?: { _id: string } | null;
  // Set on our own message while it's still sending. clientKey stays on the
  // row after the server confirms it, so the row keeps its list key.
  pending?: boolean;
  clientKey?: string;
};

// Adds a new message at the bottom (index 0 of the inverted list), or merges
// it into the existing copy.
export function upsertMessage<T extends ListMessage>(messages: T[], incoming: T): T[] {
  const existing = messages.some((message) => message._id === incoming._id);
  if (existing) {
    return messages.map((message) => (message._id === incoming._id ? keepLoadedMedia(message, { ...message, ...incoming }) : message));
  }
  return [incoming, ...messages];
}

function mediaCount(message: ListMessage): number {
  return message.mediaUrls?.length || (message.mediaUrl ? 1 : 0);
}

// Whether a message from the server is the confirmed copy of a pending one.
// The server broadcasts the new message before it answers our POST, so the
// socket copy usually arrives first.
export function isConfirmedCopy(pending: ListMessage, incoming: ListMessage): boolean {
  return !!pending.pending
    && pending.senderId._id === incoming.senderId?._id
    && pending.text === incoming.text
    && mediaCount(pending) === mediaCount(incoming)
    && (pending.replyTo?._id ?? null) === (incoming.replyTo?._id ?? null);
}

// Swaps the pending row `clientKey` for the server's message, keeping the key.
export function confirmSent<T extends ListMessage>(messages: T[], clientKey: string, sent: T): T[] {
  if (messages.some((message) => message._id === sent._id)) {
    // Already swapped in (by the socket copy); just merge the latest fields.
    return messages
      .filter((message) => message.clientKey !== clientKey || message._id === sent._id)
      .map((message) => (message._id === sent._id ? keepLoadedMedia(message, { ...message, ...sent, pending: false }) : message));
  }
  if (!messages.some((message) => message.clientKey === clientKey)) return upsertMessage(messages, sent);
  // Our photos keep showing the file on the phone, which is already loaded.
  return messages.map((message) => (message.clientKey === clientKey ? keepLoadedMedia(message, { ...sent, clientKey }) : message));
}

// Adds a message that arrived over the socket: swaps it in for our matching
// pending message if there is one, otherwise adds or merges it.
export function receiveMessage<T extends ListMessage>(messages: T[], incoming: T): T[] {
  if (messages.some((message) => message._id === incoming._id)) return upsertMessage(messages, incoming);
  const pending = messages.find((message) => isConfirmedCopy(message, incoming));
  if (pending?.clientKey) return confirmSent(messages, pending.clientKey, incoming);
  return [incoming, ...messages];
}

// Whether a socket message is new to the screen (so its arrival should animate).
export function isNewToList(messages: ListMessage[], incoming: ListMessage): boolean {
  return !messages.some((message) => message._id === incoming._id || isConfirmedCopy(message, incoming));
}
