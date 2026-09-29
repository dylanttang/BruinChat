import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import User from '../../models/User.js';
import mongoose from 'mongoose';
import { authRateLimit } from '../middleware/rateLimit.js';
import { isDevLoginEnabled } from '../utils/devLogin.js';

const router = Router();
const googleClient = new OAuth2Client();

const UCLA_EMAIL_RE = /^[a-zA-Z0-9._%+-]+@(g\.)?ucla\.edu$/;

function getGoogleClientIds() {
  return [
    process.env.GOOGLE_WEB_CLIENT_ID,
    process.env.GOOGLE_IOS_CLIENT_ID,
    process.env.GOOGLE_ANDROID_CLIENT_ID,
  ].filter(Boolean);
}

function signAppToken(user) {
  if (!process.env.JWT_SECRET) {
    throw new Error('Missing JWT_SECRET');
  }

  return jwt.sign(
    {
      sub: user._id.toString(),
      role: user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function usernameFromEmail(email) {
  return email.split('@')[0].toLowerCase();
}

// Usernames are display handles, not identities, so a taken one just gets a
// numeric suffix (jonathan, jonathan-2, jonathan-3, ...).
async function availableUsername(base) {
  if (!(await User.exists({ username: base }))) return base;
  for (let n = 2; n < 50; n++) {
    const candidate = `${base}-${n}`;
    if (!(await User.exists({ username: candidate }))) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

// Find the account a verified Google identity belongs to. Accounts are
// matched by Google account ID, then by verified email, and never by
// username: the username is just the email prefix, and matching on it let
// anyone whose UCLA email shared a prefix with an existing account (e.g. a
// seeded account with no Google ID) sign in as that account.
//
// Resolves to { user } (null for a new account) or { status, error }.
async function findAccountForGoogle({ googleId, email }) {
  const byGoogleId = await User.findOne({ googleId });
  if (byGoogleId) return { user: byGoogleId };

  const byEmail = await User.findOne({ email });
  if (byEmail?.googleId && byEmail.googleId !== googleId) {
    // Same address, different Google account: never silently relink.
    return { status: 409, error: 'This email is already linked to a different Google account' };
  }
  return { user: byEmail };
}

router.post('/google', authRateLimit, async (req, res) => {
  try {
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ error: 'JWT auth is not configured' });
    }

    const { idToken } = req.body;
    if (!idToken || typeof idToken !== 'string') {
      return res.status(400).json({ error: 'idToken is required' });
    }

    const audience = getGoogleClientIds();
    if (audience.length === 0) {
      return res.status(500).json({ error: 'Google OAuth is not configured' });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience,
    });

    const payload = ticket.getPayload();
    const email = payload?.email?.toLowerCase();
    const googleId = payload?.sub;

    if (!email || !googleId) {
      return res.status(401).json({ error: 'Google token is missing identity claims' });
    }

    if (!payload.email_verified) {
      return res.status(403).json({ error: 'Google email is not verified' });
    }

    if (!UCLA_EMAIL_RE.test(email)) {
      return res.status(403).json({ error: 'Please sign in with a UCLA email address' });
    }

    const username = usernameFromEmail(email);
    const displayName = payload.name || username;
    const avatarUrl = payload.picture || '';

    const match = await findAccountForGoogle({ googleId, email });
    if (match.error) return res.status(match.status).json({ error: match.error });
    let user = match.user;

    // A deleted account only keeps its email/Google ID if it was banned
    // (see DELETE /api/users/me), so a match here means a banned user trying
    // to come back.
    if (user?.deletedAt) {
      return res.status(403).json({ error: 'This account has been banned' });
    }

    if (!user) {
      user = new User({
        username: await availableUsername(username),
        email,
        googleId,
        emailVerified: true,
        displayName,
        avatarUrl,
      });
    } else {
      user.email = email;
      user.googleId = googleId;
      user.emailVerified = true;
      user.displayName = user.displayName || displayName;
      if (avatarUrl) user.avatarUrl = avatarUrl;
    }

    try {
      await user.save();
    } catch (err) {
      // Another sign-up took the same username between the check and the
      // save (unique index). Retry once with a random suffix.
      if (err.code !== 11000 || !err.keyPattern?.username) throw err;
      user.username = `${username}-${Math.random().toString(36).slice(2, 7)}`;
      await user.save();
    }

    const token = signAppToken(user);
    res.json({ token, user: user.toObject() });
  } catch (err) {
    console.error('POST /api/auth/google error:', err);
    res.status(401).json({ error: 'Google sign-in failed' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/dev-login — Sign in as any user without Google (dev only)
//
// Backs the "Skip (Dev)" picker. Returns a normal app JWT, so the rest of the
// app (HTTP and sockets) only ever deals with real tokens. 404 unless
// DEV_AUTH=true and NODE_ENV isn't "production" (see utils/devLogin.js).
//
// Body: { userId }
// Response: { token, user }
// ---------------------------------------------------------------------------
router.post('/dev-login', async (req, res) => {
  if (!isDevLoginEnabled()) return res.status(404).json({ error: 'Not found' });

  try {
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ error: 'Set JWT_SECRET in server/.env to use dev login' });
    }

    const { userId } = req.body;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const user = await User.findById(userId);
    if (!user || user.deletedAt) return res.status(404).json({ error: 'User not found' });

    res.json({ token: signAppToken(user), user: user.toObject() });
  } catch (err) {
    console.error('POST /api/auth/dev-login error:', err);
    res.status(500).json({ error: 'Dev login failed' });
  }
});

export default router;
