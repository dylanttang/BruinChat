// Web signs in through expo-auth-session in welcome.tsx; the native SDK isn't used.

export async function signInWithNativeGoogle(): Promise<string | null> {
  throw new Error("Native Google sign-in isn't available on web");
}

export async function signOutOfNativeGoogle(): Promise<void> {}
