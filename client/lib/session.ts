import type { Href } from "expo-router";
import { apiFetch, clearAuthToken, getAuthToken } from "./api";

export const WELCOME_ROUTE = "/auth/welcome/welcome";

// Where a signed-in user belongs: the Terms screen if they haven't accepted
// the current version, the questionnaire if they never finished it, otherwise
// Home. Banned users go through Home; tabs/_layout sends them to /banned.
//
// Returns the welcome screen when there's no usable session. A rejected token
// (expired, account deleted) is cleared so the next launch doesn't retry it.
export async function resolveSignedInRoute(): Promise<Href> {
  const token = await getAuthToken();
  if (!token) return WELCOME_ROUTE;

  let res: Response;
  try {
    res = await apiFetch("/api/users/me");
  } catch {
    // Server unreachable: keep the token and let the user retry from welcome.
    return WELCOME_ROUTE;
  }

  if (res.status === 401) {
    await clearAuthToken();
    return WELCOME_ROUTE;
  }
  if (!res.ok) return WELCOME_ROUTE;

  const { user, currentTermsVersion } = await res.json();
  if (user.termsVersion !== currentTermsVersion) return "/auth/terms";
  if (!user.year) return "/auth/questionnaire/step1";
  return "/tabs/home";
}
