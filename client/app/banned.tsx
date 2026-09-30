import { useMemo } from "react";
import { Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { clearAuthToken, clearDevUserId } from "../lib/api";
import { Colors, fonts, useTheme } from "../context/ThemeContext";

const SUPPORT_EMAIL = "bchatdevx@gmail.com";

// Shown instead of the app when the account is banned. The server refuses
// every other request from a banned account.
export default function Banned() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const signOut = async () => {
    await clearAuthToken();
    await clearDevUserId();
    router.replace("/auth/welcome/welcome");
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.icon}>
        <Ionicons name="ban-outline" size={40} color={colors.danger} />
      </View>
      <Text style={styles.title}>Your account has been banned</Text>
      <Text style={styles.body}>
        This account was banned for violating the BChat Terms of Service, so it can no longer use BChat.
      </Text>
      <Text style={styles.body}>
        If you think this was a mistake, email us and we'll take another look.
      </Text>

      <TouchableOpacity style={styles.primary} onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}>
        <Text style={styles.primaryText}>Email {SUPPORT_EMAIL}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondary} onPress={() => router.push("/legal/terms")}>
        <Text style={styles.secondaryText}>Read the Terms of Service</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondary} onPress={signOut}>
        <Text style={styles.secondaryText}>Sign out</Text>
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
      padding: 32,
    },
    icon: {
      alignSelf: "center",
      width: 76,
      height: 76,
      borderRadius: 38,
      backgroundColor: colors.brandSoft,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 20,
    },
    title: {
      fontFamily: fonts.bold,
      fontSize: 24,
      color: colors.text,
      textAlign: "center",
      marginBottom: 12,
    },
    body: {
      fontFamily: fonts.regular,
      fontSize: 15,
      lineHeight: 22,
      color: colors.subtext,
      textAlign: "center",
      marginBottom: 8,
    },
    primary: {
      marginTop: 24,
      paddingVertical: 14,
      borderRadius: 18,
      backgroundColor: colors.primary,
      alignItems: "center",
    },
    primaryText: {
      fontFamily: fonts.bold,
      fontSize: 15,
      color: colors.onPrimary,
    },
    secondary: {
      marginTop: 12,
      paddingVertical: 10,
      alignItems: "center",
    },
    secondaryText: {
      fontFamily: fonts.medium,
      fontSize: 15,
      color: colors.primary,
    },
  });
}
