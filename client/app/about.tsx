import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, useRouter } from "expo-router";
import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import { Colors, fonts, useTheme } from "../context/ThemeContext";

export default function AboutScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const version = Constants.expoConfig?.version;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityLabel="Back"
          accessibilityRole="button"
          hitSlop={10}
          onPress={() => router.canGoBack() ? router.back() : router.replace("/tabs/settings")}
        >
          <Ionicons name="arrow-back" size={24} color={colors.brand} />
        </TouchableOpacity>
        <Text accessibilityRole="header" style={styles.title}>About BChat</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.appName}>BChat</Text>
        <Text style={styles.body}>Group chats for UCLA students, by UCLA students.</Text>
        <Link href="https://bchatucla.com" style={styles.link}>bchatucla.com</Link>
        <Text style={styles.body}>Made by UCLA DevX</Text>
        {version && <Text style={[styles.body, styles.version]}>Version {version}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      minHeight: 56,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.card,
    },
    headerSpacer: {
      width: 24,
    },
    title: {
      fontFamily: fonts.bold,
      fontSize: 18,
      color: colors.text,
    },
    content: {
      flexGrow: 1,
      padding: 24,
      gap: 12,
    },
    appName: {
      fontFamily: fonts.bold,
      fontSize: 28,
      color: colors.text,
    },
    body: {
      fontFamily: fonts.medium,
      fontSize: 16,
      color: colors.subtext,
    },
    version: {
      marginTop: "auto",
    },
    link: {
      alignSelf: "flex-start",
      fontFamily: fonts.bold,
      fontSize: 16,
      color: colors.text,
      textDecorationLine: "underline",
    },
  });
}
