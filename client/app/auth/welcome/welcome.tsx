import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { signInWithGoogleIdToken } from "../../../lib/api";
import { useTheme, fonts, Colors } from "../../../context/ThemeContext";
import GradientButton from "../../../components/GradientButton";

WebBrowser.maybeCompleteAuthSession();

export default function Welcome() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [email, setEmail] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
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
    loginHint: email || undefined,
    selectAccount: true,
  });

  useEffect(() => {
    const finishGoogleSignIn = async () => {
      if (response?.type !== "success") return;

      const idToken = response.params.id_token;
      if (!idToken) {
        setAuthError("Google did not return an ID token. Check your OAuth client IDs.");
        setSigningIn(false);
        return;
      }

      try {
        await signInWithGoogleIdToken(idToken);
        router.replace("/auth/terms");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Google sign-in failed";
        setAuthError(message);
      } finally {
        setSigningIn(false);
      }
    };

    finishGoogleSignIn();
  }, [response, router]);

  const signInWithGoogle = async () => {
    setAuthError(null);
    if (!isGoogleConfigured) {
      setAuthError("Google OAuth client IDs are not configured yet.");
      return;
    }

    setSigningIn(true);
    const result = await promptAsync();
    if (result.type !== "success") {
      setSigningIn(false);
    }
  };

  return (
    <LinearGradient colors={colors.gradients.backdrop} style={styles.backdrop}>
    <SafeAreaView style={styles.container}>
      <Text style={styles.wordmark}>BChat</Text>
      <Text style={styles.tagline}>Instantly connected chats for every UCLA class</Text>
      <Text style={styles.title}>Sign in with your{"\n"}UCLA email</Text>

      <TextInput
        style={styles.input}
        placeholder="Your UCLA email"
        placeholderTextColor={colors.mutedText}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
      />

      <View style={styles.row}>
        <TouchableOpacity style={styles.rememberRow} onPress={() => setRememberMe(!rememberMe)}>
          <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
            {rememberMe && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.rowText}>Remember me</Text>
        </TouchableOpacity>
      </View>

      {authError && <Text style={styles.errorText}>{authError}</Text>}

      <GradientButton
        label="Sign in with Google"
        onPress={signInWithGoogle}
        disabled={!request || !isGoogleConfigured}
        loading={signingIn}
        style={styles.signInBtn}
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
      marginBottom: 32,
      lineHeight: 34,
      color: colors.text,
    },
    input: {
      fontFamily: fonts.regular,
      borderWidth: 1.5,
      borderRadius: 25,
      borderColor: colors.border,
      paddingHorizontal: 20,
      paddingVertical: 14,
      fontSize: 16,
      marginBottom: 16,
      color: colors.text,
      backgroundColor: colors.card,
    },
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 16,
    },
    rememberRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    checkbox: {
      width: 18,
      height: 18,
      borderWidth: 1.5,
      borderColor: colors.mutedText,
      borderRadius: 5,
      marginRight: 8,
      backgroundColor: "transparent",
    },
    checkboxChecked: {
      backgroundColor: colors.brand,
      borderColor: colors.brand,
    },
    checkmark: {
      fontFamily: fonts.regular,
      color: colors.onPrimary,
      fontSize: 12,
      lineHeight: 18,
      textAlign: "center",
    },
    rowText: {
      fontFamily: fonts.regular,
      fontSize: 14,
      color: colors.text,
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
