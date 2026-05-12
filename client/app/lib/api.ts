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

export async function getDevUserId(): Promise<string | null> {
  return AsyncStorage.getItem(DEV_USER_KEY);
}

export async function setDevUserId(id: string): Promise<void> {
  await AsyncStorage.setItem(DEV_USER_KEY, id);
}

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

// Thin wrapper around fetch that automatically adds app auth. The temporary
// x-user-id fallback stays in place for local dev until the picker is removed.
export async function apiFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const token = await getAuthToken();
  const userId = await getDevUserId();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  } else if (userId) {
    headers.set("x-user-id", userId);
  }

  return fetch(`${API_URL}${path}`, { ...init, headers });
}
