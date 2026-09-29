import jwt from 'jsonwebtoken';
import User from '../../models/User.js';

export async function authenticateToken(token) {
  if (typeof token !== 'string' || !token || !process.env.JWT_SECRET) {
    throw new Error('Authentication required');
  }
  const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  if (typeof payload !== 'object' || typeof payload.sub !== 'string' || !/^[a-f0-9]{24}$/i.test(payload.sub || '') || !Number.isFinite(payload.exp)) {
    throw new Error('Invalid token');
  }
  const user = await User.findById(payload.sub).lean();
  if (!user || user.bannedAt) throw new Error('Account unavailable');
  return { user, expiresAt: payload.exp * 1000 };
}
