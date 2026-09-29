import { getStoredToken, removeStoredToken, storeToken } from "./tokenStorage";

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

// The login token lives in the iOS Keychain / Android Keystore via
// expo-secure-store (memory only on web); see tokenStorage.ts. Tokens left
// in plaintext AsyncStorage by older builds are deleted, not migrated, so
// those users sign in once more.
export const getAuthToken = getStoredToken;
export const setAuthToken = storeToken;
export const clearAuthToken = removeStoredToken;

export async function signInWithGoogleIdToken(idToken: string) {
  const res = await fetch(`${API_URL}/api/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Google sign-in failed");
  }

  await setAuthToken(data.token);
  return data;
}

// Dev picker sign-in (server must run with DEV_AUTH=true). Returns a normal
// app token, same as Google sign-in.
export async function signInAsDevUser(userId: string) {
  const res = await fetch(`${API_URL}/api/auth/dev-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Dev login failed");
  }

  await setAuthToken(data.token);
  return data;
}

// Thin wrapper around fetch that adds the app's auth token.
export async function apiFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const token = await getAuthToken();
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(`${API_URL}${path}`, { ...init, headers });
}
