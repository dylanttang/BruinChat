import AsyncStorage from "@react-native-async-storage/async-storage";

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

const DEV_USER_KEY = "dev_user_id";
const AUTH_TOKEN_KEY = "auth_token";

export async function getAuthToken(): Promise<string | null> {
  return AsyncStorage.getItem(AUTH_TOKEN_KEY);
}

export async function setAuthToken(token: string): Promise<void> {
  await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
  await clearDevUserId();
}

export async function clearAuthToken(): Promise<void> {
  await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
}

// The old dev picker stored a raw user ID under this key and sent it as an
// x-user-id header. The server no longer accepts that; this only clears any
// leftover value on sign out.
export async function clearDevUserId(): Promise<void> {
  await AsyncStorage.removeItem(DEV_USER_KEY);
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
