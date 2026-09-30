import { getStoredToken, storeToken, removeStoredToken } from "./tokenStorage";

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

export const getAuthToken = getStoredToken;
const sessionListeners = new Set<() => void>();
export function onSessionChanged(listener: () => void) {
  sessionListeners.add(listener);
  return () => { sessionListeners.delete(listener); };
}
export async function setAuthToken(token: string) {
  await storeToken(token);
  sessionListeners.forEach((listener) => listener());
}
export async function clearAuthToken() {
  await removeStoredToken();
  sessionListeners.forEach((listener) => listener());
}

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

// Attach the authenticated session to API requests.
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
