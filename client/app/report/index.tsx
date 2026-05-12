import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { useTheme, Colors } from "../context/ThemeContext";
import { addLocalReport } from "../lib/localReports";

export default function ReportUser() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const n = name.trim();
    const e = email.trim();
    if (!n) {
      Alert.alert("Missing name", "Enter the person’s name.");
      return;
    }
    if (!e) {
      Alert.alert("Missing email", "Enter the person’s email.");
      return;
    }
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
    if (!emailOk) {
      Alert.alert("Invalid email", "Please enter a valid email address.");
      return;
    }

    setSubmitting(true);
    try {
      await addLocalReport({ reportedName: n, reportedEmail: e, note: note.trim() || undefined });
      Alert.alert("Report submitted", "Your report was saved on this device.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert("Couldn’t save", "Try again in a moment.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.back}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Report a user</Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.intro}>
            Tell us who you’re reporting. Reports are stored only on this device for now.
          </Text>

          <Text style={styles.sectionLabel}>Their name</Text>
          <View style={styles.card}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Full name"
              placeholderTextColor={colors.mutedText}
              style={styles.inputPlain}
              autoCapitalize="words"
              autoCorrect
            />
          </View>

          <Text style={styles.sectionLabel}>Their email</Text>
          <View style={styles.card}>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="name@example.com"
              placeholderTextColor={colors.mutedText}
              style={styles.inputPlain}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <Text style={styles.sectionLabel}>What happened (optional)</Text>
          <View style={styles.card}>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Brief description"
              placeholderTextColor={colors.mutedText}
              style={[styles.inputPlain, styles.multiline]}
              multiline
              textAlignVertical="top"
            />
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, submitting && styles.primaryBtnDisabled]}
            onPress={submit}
            disabled={submitting}
          >
            <Text style={styles.primaryBtnText}>Submit report</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    flex: { flex: 1 },
    header: {
      height: 56,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    back: { fontSize: 22, color: colors.text },
    title: { fontSize: 18, fontWeight: "600", color: colors.text },
    scroll: { flex: 1 },
    content: {
      padding: 20,
      paddingBottom: 32,
    },
    intro: {
      fontSize: 14,
      color: colors.subtext,
      marginBottom: 20,
      lineHeight: 20,
    },
    sectionLabel: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.text,
      marginBottom: 8,
      marginTop: 4,
    },
    card: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      overflow: "hidden",
      marginBottom: 16,
    },
    inputPlain: {
      paddingHorizontal: 14,
      paddingVertical: 13,
      fontSize: 16,
      color: colors.text,
    },
    multiline: { minHeight: 100, paddingTop: 13 },
    primaryBtn: {
      marginTop: 8,
      backgroundColor: colors.text,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: "center",
    },
    primaryBtnDisabled: { opacity: 0.5 },
    primaryBtnText: {
      color: colors.background,
      fontWeight: "600",
      fontSize: 16,
    },
  });
}
