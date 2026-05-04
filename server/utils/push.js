import Expo from 'expo-server-sdk';

const expo = new Expo();

/**
 * Fan out Expo push notifications to a list of tokens.
 * Silently drops invalid tokens. Fire-and-forget — does not block caller.
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

  const chunks = expo.chunkPushNotifications(messages);
  for (const chunk of chunks) {
    try {
      await expo.sendPushNotificationsAsync(chunk);
    } catch (err) {
      console.error('Push notification error:', err);
    }
  }
}
