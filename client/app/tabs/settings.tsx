import { View, Text, StyleSheet, Switch, TouchableOpacity, ScrollView, Alert, Modal, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme, ThemeMode, Colors } from "../context/ThemeContext";
import { clearDevUserId, apiFetch } from "../lib/api";

const NOTIF_KEY = "@bruinchat_notif";

const THEME_OPTIONS: { label: string; value: ThemeMode }[] = [
  { label: "System default", value: "system" },
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
];

export default function Settings() {
  const router = useRouter();
  const { colors, mode, setMode } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [notifEnabled, setNotifEnabled] = useState(true);
  const [classNotif, setClassNotif] = useState(true);
  const [replyNotif, setReplyNotif] = useState(true);
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  // Load persisted notif prefs
  useEffect(() => {
    AsyncStorage.getItem(NOTIF_KEY).then((raw) => {
      if (!raw) return;
      try {
        const saved = JSON.parse(raw);
        if (typeof saved.notifEnabled === "boolean") setNotifEnabled(saved.notifEnabled);
        if (typeof saved.classNotif === "boolean") setClassNotif(saved.classNotif);
        if (typeof saved.replyNotif === "boolean") setReplyNotif(saved.replyNotif);
      } catch {}
    });
  }, []);

  const saveNotifPrefs = (prefs: { notifEnabled?: boolean; classNotif?: boolean; replyNotif?: boolean }) => {
    const next = { notifEnabled, classNotif, replyNotif, ...prefs };
    AsyncStorage.setItem(NOTIF_KEY, JSON.stringify(next));
    apiFetch("/api/users/me/notifications", { method: "PUT", body: JSON.stringify(next) })
      .catch((err) => console.error("Failed to sync notif prefs:", err));
  };

  const handleNotifEnabled = (val: boolean) => {
    setNotifEnabled(val);
    saveNotifPrefs({ notifEnabled: val });
  };

  const handleClassNotif = (val: boolean) => {
    setClassNotif(val);
    saveNotifPrefs({ classNotif: val });
  };

  const handleReplyNotif = (val: boolean) => {
    setReplyNotif(val);
    saveNotifPrefs({ replyNotif: val });
  };

  const submitFeedback = async () => {
    if (!feedbackText.trim()) return;
    setSubmittingFeedback(true);
    try {
      const res = await apiFetch("/api/feedback", {
        method: "POST",
        body: JSON.stringify({ text: feedbackText.trim() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setFeedbackText("");
      setFeedbackVisible(false);
      Alert.alert("Thanks!", "Your feedback was submitted.");
    } catch (err: any) {
      Alert.alert("Error", "Could not submit feedback. Try again.");
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const signOut = () => {
    Alert.alert("Sign out?", "You'll be taken back to the sign-in screen.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          await clearDevUserId();
          router.replace("/auth/welcome/welcome");
        },
      },
    ]);
  };

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
            <Text style={styles.rowText}>Enable notifications</Text>
            <Switch value={notifEnabled} onValueChange={handleNotifEnabled} />
          </View>
          <View style={[styles.row, { opacity: notifEnabled ? 1 : 0.4 }]}>
            <View>
              <Text style={styles.rowText}>Class notifications</Text>
              <Text style={styles.rowSubtext}>New messages in your classes</Text>
            </View>
            <Switch value={classNotif} onValueChange={handleClassNotif} disabled={!notifEnabled} />
          </View>
          <View style={[styles.row, styles.lastRow, { opacity: notifEnabled ? 1 : 0.4 }]}>
            <View>
              <Text style={styles.rowText}>Reply notifications</Text>
              <Text style={styles.rowSubtext}>When someone replies to you</Text>
            </View>
            <Switch value={replyNotif} onValueChange={handleReplyNotif} disabled={!notifEnabled} />
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

        {/* Feedback */}
        <Text style={styles.section}>Support</Text>
        <View style={styles.card}>
          <TouchableOpacity style={[styles.row, styles.lastRow]} onPress={() => setFeedbackVisible(true)}>
            <Text style={styles.rowText}>Send feedback</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.signOut} onPress={signOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Feedback Modal */}
      <Modal visible={feedbackVisible} transparent animationType="fade" onRequestClose={() => setFeedbackVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Send Feedback</Text>
            <TextInput
              style={styles.feedbackInput}
              placeholder="What's on your mind?"
              placeholderTextColor={colors.mutedText}
              multiline
              value={feedbackText}
              onChangeText={setFeedbackText}
              maxLength={500}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => { setFeedbackVisible(false); setFeedbackText(""); }}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmit, (!feedbackText.trim() || submittingFeedback) && { opacity: 0.5 }]}
                onPress={submitFeedback}
                disabled={!feedbackText.trim() || submittingFeedback}
              >
                <Text style={styles.modalSubmitText}>{submittingFeedback ? "Sending…" : "Submit"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    rowSubtext: {
      fontSize: 12,
      color: colors.mutedText,
      marginTop: 2,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
    },
    modalCard: {
      width: "100%",
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 20,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: "600",
      color: colors.text,
      marginBottom: 14,
    },
    feedbackInput: {
      backgroundColor: colors.inputBg,
      borderRadius: 10,
      padding: 12,
      color: colors.text,
      fontSize: 15,
      minHeight: 120,
      textAlignVertical: "top",
      borderWidth: 1,
      borderColor: colors.border,
    },
    modalButtons: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 10,
      marginTop: 14,
    },
    modalCancel: {
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: colors.inputBg,
    },
    modalCancelText: {
      color: colors.text,
      fontWeight: "500",
    },
    modalSubmit: {
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: colors.primary,
    },
    modalSubmitText: {
      color: "#fff",
      fontWeight: "600",
    },
  });
}
