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
  // Native mobile clients may omit Origin; CORS is separate from authentication.
  return (origin) => origin === undefined || allowed.has(origin);
}

export function originGuard(isOriginAllowed) {
  return (req, res, next) => {
    if (!isOriginAllowed(req.headers.origin)) return res.status(403).json({ error: 'Origin not allowed' });
    next();
  };
}

export function socketCorsOptions(isOriginAllowed) {
  return {
    cors: { origin: (origin, callback) => callback(null, isOriginAllowed(origin)), methods: ['GET', 'POST', 'PUT', 'DELETE'] },
    // Unlike CORS headers, allowRequest also rejects WebSocket handshakes.
    allowRequest: (req, callback) => callback(null, isOriginAllowed(req.headers.origin)),
  };
}
