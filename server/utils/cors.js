export function createOriginPolicy(env = process.env) {
  const origins = (env.CORS_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean);
  for (const origin of origins) {
    const parsed = new URL(origin);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin ||
        (env.NODE_ENV === 'production' && parsed.protocol !== 'https:')) {
      throw new Error('CORS_ORIGINS must contain exact origins (HTTPS in production)');
    }
  }
  const allowed = new Set(origins);
  // Native mobile apps do not send Origin. They still require JWT authentication.
  return (origin) => origin === undefined || allowed.has(origin);
}
