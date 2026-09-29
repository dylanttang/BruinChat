/**
 * Rate limiting middleware.
 *
 * Uses rate-limiter-flexible with in-memory storage. Swap RateLimiterMemory
 * for RateLimiterRedis when we deploy multiple server instances.
 *
 * Each limiter exports as Express middleware. Attach them to specific routes:
 *
 *   import { messageSendLimiter } from '../middleware/rateLimit.js';
 *   router.post('/:id/messages', devAuth, messageSendLimiter, handler);
 *
 * Shadow mode:
 *   Set RATE_LIMIT_SHADOW=true in env to log would-be blocks without
 *   actually 429-ing anyone. Use this when rolling out to prod for the
 *   first time so you can tune limits with real data.
 */
import jwt from 'jsonwebtoken';
import { RateLimiterMemory } from 'rate-limiter-flexible';

const SHADOW_MODE = process.env.RATE_LIMIT_SHADOW === 'true';

// ---------------------------------------------------------------------------
// Limiter definitions
// ---------------------------------------------------------------------------
//
// `points` = how many requests are allowed in the window.
// `duration` = window length in seconds.
// `blockDuration` = how long to keep blocking after the window is exhausted
//                   (defaults to `duration` if not set).

// Global catch-all — applied once on /api/*, before route auth runs.
// Signed-in requests are counted per user (300/min). Anonymous requests are
// counted per IP with a much higher ceiling (1000/min), because campus WiFi
// puts thousands of students behind a handful of public IPs; a per-IP limit
// sized for one person would lock out a whole dorm.
const globalUserLimiter = new RateLimiterMemory({
  keyPrefix: 'global-user',
  points: 300,
  duration: 60,
});
const globalIpLimiter = new RateLimiterMemory({
  keyPrefix: 'global-ip',
  points: 1000,
  duration: 60,
});

// Auth endpoints — per-IP. Sized for a shared campus IP on launch day
// (100 sign-ins per 15 minutes) while still stopping scripted abuse. Google
// verifies the credentials themselves, so there's no password to brute-force.
const authLimiter = new RateLimiterMemory({
  keyPrefix: 'auth',
  points: 100,
  duration: 900, // 15 minutes
});

// Message send — token-bucket-ish via two chained limiters.
// Burst: 10 messages in 10 seconds.
// Sustained: 60 messages per minute.
const messageBurstLimiter = new RateLimiterMemory({
  keyPrefix: 'msg-burst',
  points: 10,
  duration: 10,
});
const messageSustainedLimiter = new RateLimiterMemory({
  keyPrefix: 'msg-sustained',
  points: 60,
  duration: 60,
});

// Reactions — 30 per minute per user. Cheap to spam, cheap to limit.
const reactionLimiter = new RateLimiterMemory({
  keyPrefix: 'react',
  points: 30,
  duration: 60,
});

// Reports — 5 per hour per user. Prevents report-spam abuse.
const reportLimiter = new RateLimiterMemory({
  keyPrefix: 'report',
  points: 5,
  duration: 3600,
});

// Feedback — 5 per hour per user. Discourage spam.
const feedbackLimiter = new RateLimiterMemory({
  keyPrefix: 'feedback',
  points: 5,
  duration: 3600,
});

// Chat photo/video uploads — 30 requests per hour per user (each can carry
// up to 10 files of 10 MB). On top of the message send limits.
const mediaUploadLimiter = new RateLimiterMemory({
  keyPrefix: 'media',
  points: 30,
  duration: 3600,
});

// File uploads — 10 per hour per user. Cloudinary costs real money.
const uploadLimiter = new RateLimiterMemory({
  keyPrefix: 'upload',
  points: 10,
  duration: 3600,
});

// Course enrollment changes — 20 per hour per user. People shouldn't be
// editing their schedule constantly.
const enrollmentLimiter = new RateLimiterMemory({
  keyPrefix: 'enroll',
  points: 20,
  duration: 3600,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// For authenticated routes, key by user ID so a single user can't abuse
// from multiple devices. Falls back to IP if somehow there's no user.
function userOrIpKey(req) {
  return req.user?._id ? `u:${req.user._id}` : `ip:${req.ip}`;
}

function ipKey(req) {
  return `ip:${req.ip}`;
}

// The global limiter runs before route auth, so req.user isn't set yet. Read
// the user from the bearer token instead. Only a token that verifies counts;
// a forged or expired one falls back to the IP bucket, so rotating fake
// tokens can't buy fresh quotas.
export function globalKey(req) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ') && process.env.JWT_SECRET) {
    try {
      const { sub } = jwt.verify(header.slice('Bearer '.length), process.env.JWT_SECRET);
      if (sub) return `u:${sub}`;
    } catch {
      // fall through to IP
    }
  }
  return `ip:${req.ip}`;
}

// Wrap a single limiter as Express middleware.
function wrap(limiter, getKey) {
  return async (req, res, next) => {
    const key = getKey(req);
    try {
      await limiter.consume(key);
      next();
    } catch (rejRes) {
      const retryAfterSec = Math.ceil((rejRes?.msBeforeNext ?? 1000) / 1000);

      if (SHADOW_MODE) {
        console.warn(
          `[rate-limit:shadow] ${limiter.keyPrefix} would block ${key} ` +
          `(retry in ${retryAfterSec}s)`
        );
        return next();
      }

      res.set('Retry-After', String(retryAfterSec));
      res.set('X-RateLimit-Limit', String(limiter.points));
      res.set('X-RateLimit-Remaining', '0');
      res.set('X-RateLimit-Reset', String(Math.ceil(Date.now() / 1000) + retryAfterSec));
      return res.status(429).json({
        error: 'Too many requests',
        retryAfter: retryAfterSec,
      });
    }
  };
}

// Chain multiple limiters into one middleware (e.g., burst + sustained for
// message sending). All limiters must pass before the request is allowed.
function chain(...middlewares) {
  return async (req, res, next) => {
    let i = 0;
    const run = (err) => {
      if (err) return next(err);
      if (i >= middlewares.length) return next();
      const mw = middlewares[i++];
      mw(req, res, run);
    };
    run();
  };
}

// ---------------------------------------------------------------------------
// Exported middlewares
// ---------------------------------------------------------------------------

const globalUserRateLimit = wrap(globalUserLimiter, globalKey);
const globalIpRateLimit = wrap(globalIpLimiter, globalKey);
export function globalRateLimit(req, res, next) {
  return globalKey(req).startsWith('u:')
    ? globalUserRateLimit(req, res, next)
    : globalIpRateLimit(req, res, next);
}
export const authRateLimit = wrap(authLimiter, ipKey);
export const messageSendRateLimit = chain(
  wrap(messageBurstLimiter, userOrIpKey),
  wrap(messageSustainedLimiter, userOrIpKey)
);
export const reactionRateLimit = wrap(reactionLimiter, userOrIpKey);
export const reportRateLimit = wrap(reportLimiter, userOrIpKey);
export const feedbackRateLimit = wrap(feedbackLimiter, userOrIpKey);
export const uploadRateLimit = wrap(uploadLimiter, userOrIpKey);
export const mediaUploadRateLimit = wrap(mediaUploadLimiter, userOrIpKey);
export const enrollmentRateLimit = wrap(enrollmentLimiter, userOrIpKey);
