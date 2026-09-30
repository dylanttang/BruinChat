import { useEffect, useMemo, useState } from "react";
import { Platform, Text, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { signInWithGoogleIdToken } from "../../../lib/api";
import { resolveSignedInRoute } from "../../../lib/session";
import { signInWithNativeGoogle } from "../../../lib/googleNativeSignIn";
import { useTheme, fonts, Colors } from "../../../context/ThemeContext";
import GradientButton from "../../../components/GradientButton";

WebBrowser.maybeCompleteAuthSession();

export default function Welcome() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [authError, setAuthError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const isGoogleConfigured = Boolean(
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
      process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ||
      process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID
  );
  const fallbackClientId =
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ||
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ||
    "missing-google-client-id";

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: fallbackClientId,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    selectAccount: true,
    // Only list UCLA accounts in Google's picker. This is a convenience; the
    // server enforces the domain.
    extraParams: { hd: "g.ucla.edu" },
  });

  // Trade the Google ID token for our own session, then route the user.
  const finishGoogleSignIn = async (idToken: string) => {
    try {
      await signInWithGoogleIdToken(idToken);
      router.replace(await resolveSignedInRoute());
    } catch (err) {
      const message = err instanceof Error ? err.message : "Google sign-in failed";
      setAuthError(message);
    } finally {
      setSigningIn(false);
    }
  };

  // Web: expo-auth-session delivers the result through `response`.
  useEffect(() => {
    if (response?.type !== "success") return;

    const idToken = response.params.id_token;
    if (!idToken) {
      setAuthError("Google did not return an ID token. Check your OAuth client IDs.");
      setSigningIn(false);
      return;
    }
    finishGoogleSignIn(idToken);
  }, [response]);

  const signInWithGoogle = async () => {
    setAuthError(null);
    if (!isGoogleConfigured) {
      setAuthError("Google OAuth client IDs are not configured yet.");
      return;
    }

    setSigningIn(true);

    if (Platform.OS === "web") {
      const result = await promptAsync();
      if (result.type !== "success") {
        setSigningIn(false);
      }
      return;
    }

    // iOS/Android: Google's native sign-in sheet.
    try {
      const idToken = await signInWithNativeGoogle();
      if (!idToken) {
        setSigningIn(false);
        return;
      }
      await finishGoogleSignIn(idToken);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Google sign-in failed";
      setAuthError(message);
      setSigningIn(false);
    }
  };

  return (
    <LinearGradient colors={colors.gradients.backdrop} style={styles.backdrop}>
    <SafeAreaView style={styles.container}>
      <Text style={styles.wordmark}>BChat</Text>
      <Text style={styles.tagline}>Instantly connected chats for every UCLA class</Text>
      <Text style={styles.title}>Sign in with your UCLA{"\n"}Google account</Text>
      <Text style={styles.hint}>
        Use your @g.ucla.edu account (the Google version of your @ucla.edu
        email). BChat is only for UCLA students.
      </Text>

      {authError && <Text style={styles.errorText}>{authError}</Text>}

      {/* Stays tappable when Google isn't configured so the error explains why. */}
      <GradientButton
        label="Sign in with Google"
        onPress={signInWithGoogle}
        disabled={Platform.OS === "web" && isGoogleConfigured && !request}
        loading={signingIn}
        style={styles.signInBtn}
        icon={<Ionicons name="logo-google" size={18} color={colors.onPrimary} />}
      />

    </SafeAreaView>
    </LinearGradient>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
    },
    container: {
      flex: 1,
      justifyContent: "center",
      paddingHorizontal: 32,
    },
    wordmark: {
      fontFamily: fonts.bold,
      fontSize: 44,
      textAlign: "center",
      color: colors.brand,
    },
    tagline: {
      fontFamily: fonts.regular,
      fontSize: 15,
      textAlign: "center",
      color: colors.subtext,
      marginTop: 6,
      marginBottom: 40,
    },
    title: {
      fontSize: 22,
      fontFamily: fonts.bold,
      textAlign: "center",
      marginBottom: 10,
      lineHeight: 30,
      color: colors.text,
    },
    hint: {
      fontFamily: fonts.regular,
      fontSize: 14,
      lineHeight: 20,
      textAlign: "center",
      color: colors.subtext,
      marginBottom: 28,
    },
    errorText: {
      fontFamily: fonts.regular,
      color: colors.danger,
      fontSize: 13,
      textAlign: "center",
      marginBottom: 12,
    },
    signInBtn: {
      alignSelf: "stretch",
    },
  });
}
