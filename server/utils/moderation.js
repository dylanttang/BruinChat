import { hasAcceptedTerms, TERMS_REQUIRED_ERROR } from './terms.js';

export function isMuted(user) {
  return !!user?.mutedUntil && new Date(user.mutedUntil) > new Date();
}

// Why this user can't post right now, as { status, body }, or null if they
// can. Used by every route that creates or changes chat content (messages,
// media, reactions, edits).
export function postingBlock(user) {
  if (user.bannedAt) {
    return { status: 403, body: { error: 'Your account has been banned', code: 'BANNED' } };
  }
  if (isMuted(user)) {
    return {
      status: 403,
      body: { error: "You're muted and can't post right now", code: 'MUTED', mutedUntil: user.mutedUntil },
    };
  }
  if (!hasAcceptedTerms(user)) {
    return { status: 403, body: TERMS_REQUIRED_ERROR };
  }
  return null;
}
