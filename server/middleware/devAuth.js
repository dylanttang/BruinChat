import { authenticateToken } from '../utils/auth.js';

// Kept under the existing export name to avoid changing every route import.
// Authentication is JWT-only in every environment.
export async function devAuth(req, res, next) {
  const header = req.headers.authorization;
  const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : null;
  try {
    const { user } = await authenticateToken(token);
    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
