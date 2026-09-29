import { parseMediaReference } from './media.js';
export const PROFILE_LIMITS = { year: 32, major: 120, goal: 1000, pushToken: 4096 };
export const validString = (value, max) => typeof value === 'string' && value.length <= max;
export function validateText(text) {
  return validString(text, 4000) ? null : 'Message text must be a string of at most 4000 characters';
}
export function validCloudinaryUrl(value, folder, userId) {
  const asset = parseMediaReference(value);
  return Boolean(asset && (!folder || asset.folder === folder) && (!userId || asset.ownerId === userId.toString()));
}
export function validateMessage(body, userId) {
  if (body.text !== undefined && validateText(body.text)) return validateText(body.text);
  if (body.mediaUrl !== undefined && body.mediaUrl !== '' && !validCloudinaryUrl(body.mediaUrl, 'messages', userId)) return 'Invalid media URL';
  if (body.mediaUrls !== undefined && (!Array.isArray(body.mediaUrls) || body.mediaUrls.length > 10 || !body.mediaUrls.every((url) => validCloudinaryUrl(url, 'messages', userId)))) return 'Provide at most 10 Cloudinary media URLs';
  if (body.mediaTypes !== undefined && (!Array.isArray(body.mediaTypes) || body.mediaTypes.length !== (body.mediaUrls?.length || 0) || !body.mediaTypes.every((type) => ['image', 'video'].includes(type)))) return 'Invalid media types';
  if (body.replyTo !== undefined && (typeof body.replyTo !== 'string' || !/^[a-f0-9]{24}$/i.test(body.replyTo))) return 'Invalid reply ID';
  return null;
}
