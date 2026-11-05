import Expo from 'expo-server-sdk';
import User from '../../models/User.js';

// Expo reports most delivery problems in tickets and receipts rather than by
// throwing, so a send that "succeeds" can still have reached nobody. Both are
// logged, and tokens Apple or Google have retired are cleared from the user.
const expo = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN || undefined });

export const RECEIPT_DELAY_MS = 15_000;

// A push token is a credential; log only enough to correlate with a user.
function redact(token) {
  return typeof token === 'string' && token.length > 12 ? `…${token.slice(-10)}` : 'unknown-token';
}

// Expo's wording for a token the device no longer accepts.
function isDeadToken(details) {
  return details?.error === 'DeviceNotRegistered';
}

async function clearPushToken(token) {
  try {
    await User.updateMany({ pushToken: token }, { $set: { pushToken: null } });
  } catch (err) {
    console.error(`Push: failed to clear retired token ${redact(token)}:`, err.message);
  }
}

// Receipts arrive minutes later and carry the errors APNs/FCM returned after
// Expo accepted the message — InvalidCredentials shows up here or in a ticket.
export async function checkPushReceipts(receipts) {
  if (receipts.length === 0) return;
  const byId = new Map(receipts.map(({ id, token }) => [id, token]));
  for (const chunk of expo.chunkPushNotificationReceiptIds([...byId.keys()])) {
    try {
      const results = await expo.getPushNotificationReceiptsAsync(chunk);
      for (const [id, receipt] of Object.entries(results)) {
        if (receipt.status !== 'error') continue;
        const token = byId.get(id);
        console.error(`Push receipt error for ${redact(token)}: ${receipt.details?.error || 'unknown'} — ${receipt.message}`);
        if (isDeadToken(receipt.details)) await clearPushToken(token);
      }
    } catch (err) {
      console.error('Push receipt lookup failed:', err.message);
    }
  }
}

/**
 * Fan out Expo push notifications to a list of tokens.
 * Drops invalid tokens. Fire-and-forget — does not block the caller.
 *
 * @param {string[]} tokens
 * @param {{ title: string, body: string, data?: object }} payload
 */
export async function sendPush(tokens, payload) {
  const messages = tokens
    .filter((token) => Expo.isExpoPushToken(token))
    .map((token) => ({
      to: token,
      sound: 'default',
      title: payload.title,
      body: payload.body,
      data: payload.data ?? {},
    }));

  if (messages.length === 0) return;

  const receipts = [];
  for (const chunk of expo.chunkPushNotifications(messages)) {
    let tickets;
    try {
      tickets = await expo.sendPushNotificationsAsync(chunk);
    } catch (err) {
      console.error(`Push send failed for ${chunk.length} message(s):`, err.message);
      continue;
    }
    // Expo returns one ticket per message, in the order sent.
    for (const [index, ticket] of tickets.entries()) {
      const token = chunk[index]?.to;
      if (ticket.status === 'ok') {
        if (ticket.id) receipts.push({ id: ticket.id, token });
        continue;
      }
      console.error(`Push ticket error for ${redact(token)}: ${ticket.details?.error || 'unknown'} — ${ticket.message}`);
      if (isDeadToken(ticket.details)) await clearPushToken(token);
    }
  }

  if (receipts.length === 0) return;
  // Don't make the caller wait for receipts, and don't hold the process open.
  const timer = setTimeout(() => { checkPushReceipts(receipts); }, RECEIPT_DELAY_MS);
  timer.unref?.();
}
