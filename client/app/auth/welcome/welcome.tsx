import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  FlatList,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { apiFetch, setDevUserId, signInWithGoogleIdToken } from "../../lib/api";
import { useTheme, Colors } from "../../context/ThemeContext";

WebBrowser.maybeCompleteAuthSession();

type DevUser = {
  _id: string;
  displayName: string;
  username: string;
};

export default function Welcome() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [email, setEmail] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const [devPickerVisible, setDevPickerVisible] = useState(false);
  const [devUsers, setDevUsers] = useState<DevUser[] | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(false);
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

  const openDevPicker = async () => {
    setDevPickerVisible(true);
    if (devUsers !== null) return;

    setLoadingUsers(true);
    try {
      const res = await apiFetch("/api/users/dev-list");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDevUsers(data.users);
    } catch (err) {
      console.error("Failed to load dev users:", err);
      setDevUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  };

  const pickUser = async (user: DevUser) => {
    await setDevUserId(user._id);
    setDevPickerVisible(false);
    router.replace("/auth/questionnaire/step1");
  };

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

      {/* TODO: Remove once every environment has Google OAuth client IDs. */}
      <TouchableOpacity style={styles.devBtn} onPress={openDevPicker}>
        <Text style={styles.devText}>Skip (Dev)</Text>
      </TouchableOpacity>

      <Modal
        transparent
        visible={devPickerVisible}
        animationType="fade"
        onRequestClose={() => setDevPickerVisible(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Pick a dev user</Text>
            <Text style={styles.modalSubtitle}>
              Temporary - for testing until every OAuth client is configured.
            </Text>

            {loadingUsers ? (
              <ActivityIndicator size="small" color={colors.mutedText} style={{ paddingVertical: 20 }} />
            ) : devUsers && devUsers.length > 0 ? (
              <FlatList
                data={devUsers}
                keyExtractor={(item) => item._id}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => pickUser(item)}
                    style={({ pressed }) => ([
                      styles.devUserRow,
                      { backgroundColor: pressed ? colors.inputBg : "transparent" },
                    ])}
                  >
                    <Text style={styles.devUserName}>{item.displayName}</Text>
                    <Text style={styles.devUserHandle}>@{item.username}</Text>
                  </Pressable>
                )}
              />
            ) : (
              <Text style={styles.emptyText}>No users found. Run the seed script.</Text>
            )}

            <TouchableOpacity style={styles.cancelBtn} onPress={() => setDevPickerVisible(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
      backgroundColor: "#4285F4",
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
    devBtn: {
      marginTop: 24,
      alignSelf: "center",
    },
    devText: {
      fontSize: 14,
      color: colors.mutedText,
    },
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.4)",
      justifyContent: "center",
      padding: 24,
    },
    modalCard: {
      backgroundColor: colors.card,
      borderRadius: 20,
      padding: 20,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: "600",
      marginBottom: 4,
      color: colors.text,
    },
    modalSubtitle: {
      fontSize: 13,
      color: colors.mutedText,
      marginBottom: 16,
    },
    devUserRow: {
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    devUserName: {
      fontSize: 16,
      color: colors.text,
    },
    devUserHandle: {
      fontSize: 12,
      color: colors.mutedText,
    },
    emptyText: {
      color: colors.mutedText,
      paddingVertical: 12,
    },
    cancelBtn: {
      marginTop: 16,
      alignItems: "center",
      paddingVertical: 10,
    },
    cancelText: {
      color: colors.text,
    },
  });
}
