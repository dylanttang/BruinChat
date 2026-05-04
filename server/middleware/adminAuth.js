import { devAuth } from './devAuth.js';

export async function adminAuth(req, res, next) {
  await new Promise((resolve) => devAuth(req, res, resolve));
  if (res.headersSent) return;
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}
