import { useEffect, useMemo, useState } from "react";
import { Platform, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { isReviewLoginEnabled, signInForAppReview, signInWithGoogleIdToken } from "../../../lib/api";
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

  // App Store review sign-in: only offered while the server has it turned on.
  const [reviewLoginEnabled, setReviewLoginEnabled] = useState(false);
  const [showReviewLogin, setShowReviewLogin] = useState(false);
  const [reviewEmail, setReviewEmail] = useState("");
  const [reviewPassword, setReviewPassword] = useState("");

  useEffect(() => {
    isReviewLoginEnabled().then(setReviewLoginEnabled);
  }, []);

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

  const signInForReview = async () => {
    setAuthError(null);
    setSigningIn(true);
    try {
      await signInForAppReview(reviewEmail, reviewPassword);
      router.replace(await resolveSignedInRoute());
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign-in failed";
      setAuthError(message);
    } finally {
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

      {reviewLoginEnabled && !showReviewLogin && (
        <TouchableOpacity onPress={() => setShowReviewLogin(true)} style={styles.reviewLink}>
          <Text style={styles.reviewLinkText}>App Review sign in</Text>
        </TouchableOpacity>
      )}

      {reviewLoginEnabled && showReviewLogin && (
        <>
          <TextInput
            value={reviewEmail}
            onChangeText={setReviewEmail}
            placeholder="Email"
            placeholderTextColor={colors.mutedText}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="username"
          />
          <TextInput
            value={reviewPassword}
            onChangeText={setReviewPassword}
            placeholder="Password"
            placeholderTextColor={colors.mutedText}
            style={styles.input}
            secureTextEntry
            textContentType="password"
          />
          <GradientButton
            label="Sign in"
            onPress={signInForReview}
            disabled={!reviewEmail || !reviewPassword}
            loading={signingIn}
            style={[styles.signInBtn, styles.reviewSignInBtn]}
          />
        </>
      )}

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
    reviewSignInBtn: {
      marginTop: 12,
    },
    reviewLink: {
      alignSelf: "center",
      marginTop: 18,
      padding: 6,
    },
    reviewLinkText: {
      fontFamily: fonts.regular,
      fontSize: 13,
      color: colors.subtext,
      textDecorationLine: "underline",
    },
    input: {
      alignSelf: "stretch",
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginTop: 12,
      fontFamily: fonts.regular,
      fontSize: 15,
      color: colors.text,
      backgroundColor: colors.card,
    },
  });
}
