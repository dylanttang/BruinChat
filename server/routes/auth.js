import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import User from '../../models/User.js';

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

router.post('/google', async (req, res) => {
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

    let user = await User.findOne({
      $or: [
        { googleId },
        { email },
        { username },
      ],
    });

    if (!user) {
      user = new User({
        username,
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

    await user.save();

    const token = signAppToken(user);
    res.json({ token, user: user.toObject() });
  } catch (err) {
    console.error('POST /api/auth/google error:', err);
    res.status(401).json({ error: 'Google sign-in failed' });
  }
});

export default router;
