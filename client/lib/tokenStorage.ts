import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'auth_token';
let cleanup: Promise<void> | undefined;
function clearLegacyStorage() {
  // Force a fresh login instead of trusting credentials left in plaintext storage.
  if (!cleanup) cleanup = AsyncStorage.multiRemove([TOKEN_KEY, 'dev_user_id']).catch((error) => {
    cleanup = undefined;
    throw error;
  });
  return cleanup;
}
export async function getStoredToken(): Promise<string | null> {
  await clearLegacyStorage();
  return SecureStore.getItemAsync(TOKEN_KEY);
}
export async function storeToken(token: string): Promise<void> {
  await clearLegacyStorage();
  await SecureStore.setItemAsync(TOKEN_KEY, token, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
}
export async function removeStoredToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await clearLegacyStorage();
}
