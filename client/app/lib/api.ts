import AsyncStorage from "@react-native-async-storage/async-storage";

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

const DEV_USER_KEY = "dev_user_id";

export async function getDevUserId(): Promise<string | null> {
  return AsyncStorage.getItem(DEV_USER_KEY);
}

export async function setDevUserId(id: string): Promise<void> {
  await AsyncStorage.setItem(DEV_USER_KEY, id);
}

export async function clearDevUserId(): Promise<void> {
  await AsyncStorage.removeItem(DEV_USER_KEY);
}

// Thin wrapper around fetch that automatically adds the x-user-id header.
// Once real OAuth is in place, swap this to read a JWT from storage and send
// Authorization: Bearer <token> instead.
export async function apiFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const userId = await getDevUserId();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (userId) headers.set("x-user-id", userId);

  return fetch(`${API_URL}${path}`, { ...init, headers });
}
