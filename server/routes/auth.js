import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import User from '../../models/User.js';
import { authRateLimit } from '../middleware/rateLimit.js';

const router = Router();
const googleClient = new OAuth2Client();

// Only accounts managed by UCLA's Google Workspace (student accounts, which
// sign in through UCLA Logon + Duo). Google sets the signed `hd` claim only
// for Workspace accounts, so a personal Google account registered with a UCLA
// address can't pass — checking the email suffix alone would let it through.
// Students' @ucla.edu addresses are aliases of their @g.ucla.edu account, so
// Google always reports them as @g.ucla.edu here.
const UCLA_HOSTED_DOMAIN = 'g.ucla.edu';

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

    if (payload.hd !== UCLA_HOSTED_DOMAIN || !email.endsWith(`@${UCLA_HOSTED_DOMAIN}`)) {
      return res.status(403).json({
        error: 'Please sign in with your @g.ucla.edu account (the Google version of your @ucla.edu email)',
      });
    }

    const username = usernameFromEmail(email);
    const displayName = payload.name || username;
    const avatarUrl = payload.picture || '';

    let user = await User.findOne({
      $or: [
        { googleId },
        { email },
      ],
    });

    // A deleted account only keeps its email/Google ID if it was banned
    // (see DELETE /api/users/me), so a match here means a banned user trying
    // to come back.
    if (user?.deletedAt) {
      return res.status(403).json({ error: 'This account has been banned' });
    }

    if (!user) {
      const usernameTaken = await User.exists({ username });
      user = new User({
        username: usernameTaken ? `${username.slice(0, 38)}_${googleId.slice(-24)}` : username,
        email,
        googleId,
        emailVerified: true,
        displayName,
        avatarUrl,
      });
    } else {
      if (user.googleId && user.googleId !== googleId) {
        return res.status(401).json({ error: 'Google identity does not match this account' });
      }
      user.email = email;
      user.googleId = googleId;
      user.emailVerified = true;
      user.displayName = user.displayName || displayName;
      if (avatarUrl) user.avatarUrl = avatarUrl;
    }

    if (user.bannedAt) return res.status(403).json({ error: 'Your account has been banned' });
    await user.save();

    const token = signAppToken(user);
    req.user = user;
    res.json({ token, user: user.toObject() });
  } catch (err) {
    console.error('POST /api/auth/google error:', err);
    res.status(401).json({ error: 'Google sign-in failed' });
  }
});

export default router;
