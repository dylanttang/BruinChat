import { v2 as cloudinary } from 'cloudinary';

export const MEDIA_LINK_TTL_SECONDS = 3600;

// Only canonical, unsigned authenticated asset references are stored in MongoDB.
export function parseMediaReference(value) {
  if (typeof value !== 'string' || value.length > 2048 || !process.env.CLOUDINARY_CLOUD_NAME) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com' || url.port || url.username || url.password || url.search || url.hash) return null;
    const [empty, cloud, resourceType, deliveryType, ...parts] = url.pathname.split('/');
    if (cloud !== process.env.CLOUDINARY_CLOUD_NAME || !['image', 'video'].includes(resourceType) || deliveryType !== 'authenticated') return null;
    if (/^v\d+$/.test(parts[0])) parts.shift();
    const match = parts.join('/').match(/^(avatars|messages)\/([a-f0-9]{24})\/([a-zA-Z0-9_-]+)\.([a-zA-Z0-9]+)$/);
    if (!match) return null;
    return { resourceType, folder: match[1], ownerId: match[2], publicId: `${match[1]}/${match[2]}/${match[3]}`, format: match[4] };
  } catch { return null; }
}

export function mediaDeliveryUrl(value) {
  const asset = parseMediaReference(value);
  if (!asset) return '';
  if (!process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) return '';
  return cloudinary.utils.private_download_url(asset.publicId, asset.format, {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    resource_type: asset.resourceType,
    type: 'authenticated',
    attachment: false,
    expires_at: Math.floor(Date.now() / 1000) + MEDIA_LINK_TTL_SECONDS,
  });
}

// Call only after the enclosing resource has passed its authorization check.
export function serializeMedia(payload) {
  const visit = (value) => {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== 'object') return value;
    for (const [key, entry] of Object.entries(value)) {
      if (key === 'mediaUrl') value[key] = mediaDeliveryUrl(entry);
      else if (key === 'mediaUrls' && Array.isArray(entry)) value[key] = entry.map(mediaDeliveryUrl).filter(Boolean);
      else if (key === 'avatarUrl') {
        // Google-owned OAuth photos are not uploaded chat media.
        let googlePhoto = false;
        try { const u = new URL(entry); googlePhoto = u.protocol === 'https:' && (u.hostname === 'googleusercontent.com' || u.hostname.endsWith('.googleusercontent.com')); } catch {}
        value[key] = googlePhoto ? entry : mediaDeliveryUrl(entry);
      } else value[key] = visit(entry);
    }
    return value;
  };
  return visit(JSON.parse(JSON.stringify(payload)));
}

export function mediaResponseMiddleware(req, res, next) {
  const json = res.json.bind(res);
  res.json = (payload) => {
    if (!req.user) return json(payload);
    res.set('Cache-Control', 'private, no-store');
    return json(serializeMedia(payload));
  };
  next();
}
