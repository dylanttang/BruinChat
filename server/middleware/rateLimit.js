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

// Global catch-all — applied once on /api/*
// Generous: 300 requests per minute per identity. Mostly there to catch
// runaway clients and absolute abuse.
const globalLimiter = new RateLimiterMemory({
  keyPrefix: 'global',
  points: 300,
  duration: 60,
});

// Auth endpoints — strict, per-IP. Prevents brute force on /api/auth/google
// and dev-list enumeration.
const authLimiter = new RateLimiterMemory({
  keyPrefix: 'auth',
  points: 10,
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

export const globalRateLimit = wrap(globalLimiter, userOrIpKey);
export const authRateLimit = wrap(authLimiter, ipKey);
export const messageSendRateLimit = chain(
  wrap(messageBurstLimiter, userOrIpKey),
  wrap(messageSustainedLimiter, userOrIpKey)
);
export const reactionRateLimit = wrap(reactionLimiter, userOrIpKey);
export const reportRateLimit = wrap(reportLimiter, userOrIpKey);
export const feedbackRateLimit = wrap(feedbackLimiter, userOrIpKey);
export const uploadRateLimit = wrap(uploadLimiter, userOrIpKey);
export const enrollmentRateLimit = wrap(enrollmentLimiter, userOrIpKey);
