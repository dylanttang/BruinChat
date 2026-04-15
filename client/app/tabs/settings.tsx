import { View, Text, StyleSheet, Switch, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState, useMemo } from "react";
import { useRouter } from "expo-router";
import { useTheme, ThemeMode, Colors } from "../context/ThemeContext";

const THEME_OPTIONS: { label: string; value: ThemeMode }[] = [
  { label: "System default", value: "system" },
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
];

export default function Settings() {
  const router = useRouter();
  const { colors, mode, setMode } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [pause, setPause] = useState(false);
  const [classNotif, setClassNotif] = useState(true);
  const [replyNotif, setReplyNotif] = useState(true);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container}>
        <Text style={styles.header}>Settings</Text>

        {/* Appearance */}
        <Text style={styles.section}>Appearance</Text>
        <View style={styles.card}>
          {THEME_OPTIONS.map((option, index) => (
            <TouchableOpacity
              key={option.value}
              style={[styles.row, index === THEME_OPTIONS.length - 1 && styles.lastRow]}
              onPress={() => setMode(option.value)}
            >
              <Text style={styles.rowText}>{option.label}</Text>
              {mode === option.value && <Text style={styles.check}>✓</Text>}
            </TouchableOpacity>
          ))}
        </View>

        {/* Notifications */}
        <Text style={styles.section}>Notifications</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowText}>Pause notifications</Text>
            <Switch value={pause} onValueChange={setPause} />
          </View>
          <View style={styles.row}>
            <Text style={styles.rowText}>Class notifications</Text>
            <Switch value={classNotif} onValueChange={setClassNotif} />
          </View>
          <View style={[styles.row, styles.lastRow]}>
            <Text style={styles.rowText}>Reply notifications</Text>
            <Switch value={replyNotif} onValueChange={setReplyNotif} />
          </View>
        </View>

        {/* Report */}
        <Text style={styles.section}>Report</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowText}>Report a user</Text>
            <Text style={styles.chevron}>›</Text>
          </View>
          <View style={[styles.row, styles.lastRow]}>
            <Text style={styles.rowText}>Past reports</Text>
            <Text style={styles.chevron}>›</Text>
          </View>
        </View>

        {/* Archive */}
        <Text style={styles.section}>Archive</Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={[styles.row, styles.lastRow]}
            onPress={() => router.push("/archived")}
          >
            <Text style={styles.rowText}>View archived classes</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.signOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    container: {
      flex: 1,
      padding: 20,
      backgroundColor: colors.background,
    },
    header: {
      fontSize: 28,
      fontWeight: "700",
      marginBottom: 10,
      marginTop: 10,
      color: colors.text,
    },
    section: {
      marginTop: 20,
      marginBottom: 8,
      fontWeight: "600",
      color: colors.text,
    },
    card: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
      backgroundColor: colors.card,
    },
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: 13,
      borderBottomWidth: 1,
      borderColor: colors.separator,
    },
    lastRow: {
      borderBottomWidth: 0,
    },
    rowText: {
      fontSize: 16,
      color: colors.text,
    },
    chevron: {
      fontSize: 18,
      color: colors.mutedText,
    },
    check: {
      fontSize: 16,
      color: colors.text,
      fontWeight: "600",
    },
    signOut: {
      marginTop: 30,
      borderWidth: 1,
      borderColor: "red",
      borderRadius: 14,
      padding: 14,
      alignItems: "center",
    },
    signOutText: {
      color: "red",
      fontWeight: "600",
    },
  });
}
