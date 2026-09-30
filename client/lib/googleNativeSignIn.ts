// Native Google sign-in (iOS/Android) via Google's own SDK. The returned ID
// token's audience is the web client ID, which is what the server verifies.
// Web uses expo-auth-session instead (see googleNativeSignIn.web.ts).
//
// Needs a development build: Expo Go doesn't include this native module.

const UCLA_HOSTED_DOMAIN = "g.ucla.edu";

let configured = false;

// Returns the Google ID token, or null if the user cancelled.
export async function signInWithNativeGoogle(): Promise<string | null> {
  let lib: typeof import("@react-native-google-signin/google-signin");
  try {
    // Loaded lazily so Expo Go shows an error here instead of crashing on launch.
    lib = await import("@react-native-google-signin/google-signin");
  } catch {
    throw new Error("Google sign-in needs a development build (it doesn't work in Expo Go).");
  }
  const { GoogleSignin, isSuccessResponse, isErrorWithCode, statusCodes } = lib;

  if (!configured) {
    GoogleSignin.configure({
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
      iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
      // Only offer UCLA accounts. The server enforces the domain regardless.
      hostedDomain: UCLA_HOSTED_DOMAIN,
    });
    configured = true;
  }

  try {
    await GoogleSignin.hasPlayServices();
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return null;
    if (!response.data.idToken) {
      throw new Error("Google did not return an ID token. Check the web client ID.");
    }
    return response.data.idToken;
  } catch (err) {
    if (isErrorWithCode(err) && err.code === statusCodes.IN_PROGRESS) return null;
    throw err;
  }
}

// Clears Google's cached account so the next sign-in shows the account picker.
export async function signOutOfNativeGoogle(): Promise<void> {
  try {
    const { GoogleSignin } = await import("@react-native-google-signin/google-signin");
    await GoogleSignin.signOut();
  } catch {
    // Not signed in with Google, or running without the native module.
  }
}
