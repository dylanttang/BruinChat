export const PROFILE_LIMITS = { year: 32, major: 120, goal: 1000, pushToken: 4096, avatarUrl: 2048 };
export const validString = (value, max) => typeof value === 'string' && value.length <= max;
export function validateMessageLengths(body) {
  if (body.text !== undefined && !validString(body.text, 4000)) return 'Message text must be a string of at most 4000 characters';
  if (body.mediaUrl !== undefined && !validString(body.mediaUrl, 2048)) return 'Media URL must be a string of at most 2048 characters';
  if (body.mediaUrls !== undefined) {
    const valid = Array.isArray(body.mediaUrls) && body.mediaUrls.length <= 10
      && body.mediaUrls.every(url => validString(url, 2048));
    if (!valid) return 'Provide at most 10 media URLs of at most 2048 characters each';
  }
  return null;
}
