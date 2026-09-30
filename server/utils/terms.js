// Bump this whenever docs/legal/terms-of-service.md or privacy-policy.md
// changes in a way users need to re-accept. Clients compare it against
// user.termsVersion and send users back through the agreement screen.
export const CURRENT_TERMS_VERSION = '2026-09-28';

export function hasAcceptedTerms(user) {
  return user?.termsVersion === CURRENT_TERMS_VERSION;
}

export const TERMS_REQUIRED_ERROR = {
  error: 'You must accept the Terms of Service before posting',
  code: 'TERMS_REQUIRED',
};
