import AsyncStorage from '@react-native-async-storage/async-storage';

// SecureStore is native-only. Web sessions stay in memory and end on reload.
let token: string | null = null;
let cleanup: Promise<void> | undefined;
function clearLegacyStorage() {
  if (!cleanup) cleanup = AsyncStorage.multiRemove(['auth_token', 'dev_user_id']).catch((error) => {
    cleanup = undefined;
    throw error;
  });
  return cleanup;
}
export async function getStoredToken(): Promise<string | null> {
  await clearLegacyStorage();
  return token;
}
export async function storeToken(value: string): Promise<void> {
  await clearLegacyStorage();
  token = value;
}
export async function removeStoredToken(): Promise<void> {
  token = null;
  await clearLegacyStorage();
}
