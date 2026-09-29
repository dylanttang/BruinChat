/**
 * Auth middleware: requires `Authorization: Bearer <JWT>`.
 *
 * Tokens come from Google sign-in (POST /api/auth/google) or, in local
 * development only, the dev user picker (POST /api/auth/dev-login). The name
 * `devAuth` is historical; there is no longer a header-based dev bypass.
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

// Verify an app JWT and load its user. Shared by HTTP routes and the
// Socket.IO handshake. Resolves to { user } or { status, error }.
export async function authenticateToken(token) {
  if (!process.env.JWT_SECRET) {
    return { status: 500, error: 'JWT auth is not configured' };
  }
  if (!token) {
    return { status: 401, error: 'Missing Authorization bearer token' };
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return { status: 401, error: 'Invalid or expired token' };
  }

  const user = await User.findById(payload.sub).lean();
  if (!user || user.deletedAt) {
    return { status: 401, error: 'User not found' };
  }
  return { user };
}

export async function devAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;

  try {
    const { user, status, error } = await authenticateToken(token);
    if (!user) return res.status(status).json({ error });

    if (user.bannedAt && !isBannedRequestAllowed(req)) {
      return res.status(403).json({ error: 'Your account has been banned', code: 'BANNED' });
    }

    req.user = user;
    return next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(500).json({ error: 'Authentication failed' });
  }
}
