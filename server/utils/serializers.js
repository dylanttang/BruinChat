import { mediaDeliveryUrl } from './media.js';

function plain(value) {
  return value?.toObject ? value.toObject() : value;
}

export function serializeAvatar(value) {
  // Google OAuth photos are public; uploaded avatars require signed delivery.
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && (url.hostname === 'googleusercontent.com' || url.hostname.endsWith('.googleusercontent.com'))) return value;
  } catch {}
  return mediaDeliveryUrl(value);
}

// Serialize stored references exactly once, after resource authorization.
// Delivery URLs expire and must never be written back to MongoDB.
export function serializeUser(user) {
  if (!user) return user;
  const result = { ...plain(user) };
  if ('avatarUrl' in result) result.avatarUrl = serializeAvatar(result.avatarUrl);
  return result;
}

export function serializeMessage(message) {
  if (!message) return message;
  const result = { ...plain(message) };
  if ('mediaUrl' in result) result.mediaUrl = mediaDeliveryUrl(result.mediaUrl);
  if (Array.isArray(result.mediaUrls)) result.mediaUrls = result.mediaUrls.map(mediaDeliveryUrl).filter(Boolean);
  if (result.senderId?.displayName !== undefined) result.senderId = serializeUser(result.senderId);
  if (result.replyTo?.chatId !== undefined || result.replyTo?.mediaUrl !== undefined) result.replyTo = serializeMessage(result.replyTo);
  return result;
}

export function serializeChat(chat) {
  if (!chat) return chat;
  const result = { ...plain(chat) };
  if (Array.isArray(result.members)) result.members = result.members.map(member => member?.displayName !== undefined ? serializeUser(member) : member);
  return result;
}
