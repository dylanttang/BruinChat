/**
 * Auth middleware.
 *
 * Prefers Authorization: Bearer <JWT>, then falls back to `x-user-id` for
 * local development so the temporary picker keeps working.
 */
import jwt from 'jsonwebtoken';
import User from '../../models/User.js';

// Banned users can still load their own account (so the app can show the
// "banned" screen) and delete it; everything else is refused.
const BANNED_ALLOWED = new Set(['GET /api/users/me', 'DELETE /api/users/me']);

function isBannedRequestAllowed(req) {
  const path = req.originalUrl.split('?')[0].replace(/\/$/, '');
  return BANNED_ALLOWED.has(`${req.method} ${path}`);
}

export async function devAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;

  if (token) {
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ error: 'JWT auth is not configured' });
    }

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(payload.sub).lean();
      if (!user || user.deletedAt) {
        return res.status(401).json({ error: 'User not found' });
      }

      if (user.bannedAt && !isBannedRequestAllowed(req)) {
        return res.status(403).json({ error: 'Your account has been banned', code: 'BANNED' });
      }

      req.user = user;
      return next();
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  }

  const userId = req.headers['x-user-id'];

  if (!userId) {
    return res.status(401).json({ error: 'Missing Authorization bearer token' });
  }

  try {
    const user = await User.findById(userId).lean();
    if (!user || user.deletedAt) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (user.bannedAt && !isBannedRequestAllowed(req)) {
      return res.status(403).json({ error: 'Your account has been banned', code: 'BANNED' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid user ID' });
  }
}
