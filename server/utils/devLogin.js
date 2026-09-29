// The dev user picker ("Skip (Dev)" on the welcome screen) lets you sign in
// as any user without Google. It's only available when DEV_AUTH=true is set
// and NODE_ENV isn't "production", so a production server can never enable
// it by accident.
export function isDevLoginEnabled(env = process.env) {
  return env.DEV_AUTH === 'true' && env.NODE_ENV !== 'production';
}
