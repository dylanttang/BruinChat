/**
 * Development-only auth middleware.
 *
 * Reads `x-user-id` from request headers, looks up the user in MongoDB,
 * and attaches the document to `req.user`.
 *
 * When real auth (Google OAuth + JWT) is implemented, replace this single
 * middleware — no route changes required.
 */
import User from '../../models/User.js';

export async function devAuth(req, res, next) {
  const userId = req.headers['x-user-id'];

  if (!userId) {
    return res.status(401).json({ error: 'Missing x-user-id header (dev auth)' });
  }

  try {
    const user = await User.findById(userId).lean();
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user;
    next();
  } catch (err) {
    // Invalid ObjectId format, etc.
    return res.status(401).json({ error: 'Invalid user ID' });
  }
}
