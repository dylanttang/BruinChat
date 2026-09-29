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
import { useRouter } from "expo-router";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { signInWithGoogleIdToken } from "../../../lib/api";
import { useTheme, Colors } from "../../../context/ThemeContext";

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
        router.replace("/auth/questionnaire/step1");
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
    <SafeAreaView style={styles.container}>
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

      <TouchableOpacity
        style={[styles.signInBtn, (!request || signingIn || !isGoogleConfigured) && styles.signInBtnDisabled]}
        onPress={signInWithGoogle}
        disabled={!request || signingIn}
      >
        {signingIn ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.signInText}>Sign in with Google</Text>
        )}
      </TouchableOpacity>

    </SafeAreaView>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      justifyContent: "center",
      paddingHorizontal: 32,
    },
    title: {
      fontSize: 26,
      fontWeight: "bold",
      textAlign: "center",
      marginBottom: 32,
      lineHeight: 34,
      color: colors.text,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 25,
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
      borderWidth: 1,
      borderColor: colors.mutedText,
      marginRight: 8,
      backgroundColor: "transparent",
    },
    checkboxChecked: {
      backgroundColor: colors.subtext,
    },
    checkmark: {
      color: "#fff",
      fontSize: 12,
      lineHeight: 18,
      textAlign: "center",
    },
    rowText: {
      fontSize: 14,
      color: colors.text,
    },
    errorText: {
      color: "#B42318",
      fontSize: 13,
      textAlign: "center",
      marginBottom: 12,
    },
    signInBtn: {
      backgroundColor: colors.primary,
      borderRadius: 25,
      paddingVertical: 14,
      alignItems: "center",
      alignSelf: "center",
      minWidth: 210,
      paddingHorizontal: 28,
    },
    signInBtnDisabled: {
      opacity: 0.6,
    },
    signInText: {
      color: "#fff",
      fontSize: 16,
      fontWeight: "600",
    },
  });
}
