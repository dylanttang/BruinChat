import { devAuth } from './devAuth.js';

export function adminAuth(req, res, next) {
  devAuth(req, res, () => {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}
