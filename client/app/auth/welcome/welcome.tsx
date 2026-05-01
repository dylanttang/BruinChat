import { useEffect, useState, useMemo } from "react";
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
<<<<<<< HEAD
import { apiFetch, setDevUserId } from "../../lib/api";
import { useTheme, Colors } from "../../context/ThemeContext";
=======
import { apiFetch, setDevUserId } from "../../../lib/api";
>>>>>>> 328579e (moved non route modules out of expo router's app tree)

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
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);

  const [devPickerVisible, setDevPickerVisible] = useState(false);
  const [devUsers, setDevUsers] = useState<DevUser[] | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(false);

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
      />

      <TextInput
        style={styles.input}
        placeholder="Your UCLA Logon Password"
        placeholderTextColor={colors.mutedText}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <View style={styles.row}>
        <TouchableOpacity style={styles.rememberRow} onPress={() => setRememberMe(!rememberMe)}>
          <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
            {rememberMe && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.rowText}>Remember me</Text>
        </TouchableOpacity>
        <TouchableOpacity>
          <Text style={styles.rowText}>Forgot Password?</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.signInBtn}>
        <Text style={styles.signInText}>Sign In</Text>
      </TouchableOpacity>

      {/* TODO: Remove once Google OAuth is working */}
      <TouchableOpacity style={styles.devBtn} onPress={openDevPicker}>
        <Text style={styles.devText}>Skip (Dev)</Text>
      </TouchableOpacity>

      {/* Dev user picker */}
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
              Temporary — for testing until Google OAuth is wired up.
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
      marginBottom: 24,
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
    signInBtn: {
      backgroundColor: "#888",
      borderRadius: 25,
      paddingVertical: 14,
      alignItems: "center",
      alignSelf: "center",
      paddingHorizontal: 48,
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
