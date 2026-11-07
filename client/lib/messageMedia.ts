import { API_URL } from "./api";

export type MediaKind = "image" | "video";

type MessageWithMedia = {
  _id?: string;
  mediaUrl?: string | null;
  mediaUrls?: string[];
  mediaTypes?: MediaKind[];
};

function isVideoUrl(url: string) {
  return /\.(mp4|mov|m4v|webm)(\?|$)/i.test(url);
}

function toMediaUri(url: string) {
  return url.startsWith("http") || url.startsWith("file:") ? url : `${API_URL}${url}`;
}

// The photos and videos in a message, ready to show. Older messages only
// have a single mediaUrl and no types.
export function messageMedia(message: MessageWithMedia): { uri: string; type: MediaKind }[] {
  const urls = message.mediaUrls?.length ? message.mediaUrls : message.mediaUrl ? [message.mediaUrl] : [];
  return urls.map((url, index) => ({
    uri: toMediaUri(url),
    type: message.mediaTypes?.[index] || (isVideoUrl(url) ? "video" : "image"),
  }));
}

// Identifies one photo or video in a chat: its message and its place in it.
export function mediaKey(messageId: string, index: number) {
  return `${messageId}:${index}`;
}

// Every photo and video in a chat, oldest first, for swiping through them
// all in the viewer. Messages come newest first, like the chat list.
export function chatMedia(messages: MessageWithMedia[]) {
  const all: { uri: string; type: MediaKind; key: string }[] = [];
  for (let m = messages.length - 1; m >= 0; m--) {
    const message = messages[m];
    if (!message._id) continue;
    messageMedia(message).forEach((item, index) => all.push({ ...item, key: mediaKey(message._id!, index) }));
  }
  return all;
}
