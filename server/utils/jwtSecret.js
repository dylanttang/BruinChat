// Anyone who knows or guesses JWT_SECRET can mint tokens for any user,
// admins included. Production refuses to start with a missing, short, or
// example secret; development only warns so local setup stays easy.
// Generate one with: openssl rand -hex 48
const MIN_LENGTH = 32;
const EXAMPLE_SECRETS = new Set(['replace-with-a-long-random-secret']);

// Returns a warning string (development) or null; throws in production.
export function checkJwtSecret(env = process.env) {
  const secret = env.JWT_SECRET ?? '';
  let problem = null;
  if (!secret) problem = 'JWT_SECRET is not set; sign-in will not work';
  else if (EXAMPLE_SECRETS.has(secret)) problem = 'JWT_SECRET is still the example value from .env.example';
  else if (secret.length < MIN_LENGTH) problem = `JWT_SECRET is shorter than ${MIN_LENGTH} characters`;

  if (problem && env.NODE_ENV === 'production') {
    throw new Error(`${problem}. Refusing to start in production (generate one with: openssl rand -hex 48)`);
  }
  return problem;
}
