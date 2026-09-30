import { View, Text, StyleSheet, Switch, TouchableOpacity, ScrollView, Alert, Modal, TextInput, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme, fonts, ThemeMode, Colors } from "../../context/ThemeContext";
import { clearAuthToken, clearDevUserId, apiFetch } from "../../lib/api";

const NOTIF_KEY = "@bruinchat_notif";
const SUPPORT_EMAIL = "bchatdevx@gmail.com";

const THEME_OPTIONS: { label: string; value: ThemeMode }[] = [
  { label: "System default", value: "system" },
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
];

export default function Settings() {
  const router = useRouter();
  const { colors, mode, setMode } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const switchTrack = { false: colors.border, true: colors.primary };

  const [notifEnabled, setNotifEnabled] = useState(true);
  const [classNotif, setClassNotif] = useState(true);
  const [replyNotif, setReplyNotif] = useState(true);
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

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
          await clearAuthToken();
          await clearDevUserId();
          router.replace("/auth/welcome/welcome");
        },
      },
    ]);
  };

  const closeDeleteModal = () => {
    setDeleteVisible(false);
    setDeleteConfirmText("");
  };

  // Permanent, so the user has to type DELETE before the button enables.
  const deleteAccount = async () => {
    setDeleting(true);
    try {
      const res = await apiFetch("/api/users/me", { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await AsyncStorage.removeItem(NOTIF_KEY);
      await clearAuthToken();
      await clearDevUserId();
      closeDeleteModal();
      router.replace("/auth/welcome/welcome");
    } catch (err) {
      console.error("Failed to delete account:", err);
      Alert.alert("Couldn't delete account", "Please try again, or email us for help.");
    } finally {
      setDeleting(false);
    }
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
            <Switch value={notifEnabled} onValueChange={handleNotifEnabled} trackColor={switchTrack} />
          </View>
          <View style={[styles.row, { opacity: notifEnabled ? 1 : 0.4 }]}>
            <View>
              <Text style={styles.rowText}>Class notifications</Text>
              <Text style={styles.rowSubtext}>New messages in your classes</Text>
            </View>
            <Switch value={classNotif} onValueChange={handleClassNotif} disabled={!notifEnabled} trackColor={switchTrack} />
          </View>
          <View style={[styles.row, styles.lastRow, { opacity: notifEnabled ? 1 : 0.4 }]}>
            <View>
              <Text style={styles.rowText}>Reply notifications</Text>
              <Text style={styles.rowSubtext}>When someone replies to you</Text>
            </View>
            <Switch value={replyNotif} onValueChange={handleReplyNotif} disabled={!notifEnabled} trackColor={switchTrack} />
          </View>
        </View>

        {/* Privacy & safety */}
        <Text style={styles.section}>Privacy & safety</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.row} onPress={() => router.push("/blocked")}>
            <Text style={styles.rowText}>Blocked users</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.row, styles.lastRow]} onPress={() => router.push("/reports")}>
            <Text style={styles.rowText}>Your reports</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.sectionHint}>
          To report or block someone, tap their name in a chat or long-press one of their messages.
        </Text>

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
          <TouchableOpacity style={styles.row} onPress={() => setFeedbackVisible(true)}>
            <Text style={styles.rowText}>Send feedback</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.row, styles.lastRow]}
            onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
          >
            <View>
              <Text style={styles.rowText}>Contact us</Text>
              <Text style={styles.rowSubtext}>{SUPPORT_EMAIL}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Legal */}
        <Text style={styles.section}>Legal</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.row} onPress={() => router.push("/legal/terms")}>
            <Text style={styles.rowText}>Terms of Service</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.row, styles.lastRow]} onPress={() => router.push("/legal/privacy")}>
            <Text style={styles.rowText}>Privacy Policy</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.signOut} onPress={signOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.deleteAccount} onPress={() => setDeleteVisible(true)}>
          <Text style={styles.deleteAccountText}>Delete account</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Delete Account Modal */}
      <Modal visible={deleteVisible} transparent animationType="fade" onRequestClose={closeDeleteModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Delete your account?</Text>
            <Text style={styles.deleteBody}>This permanently deletes:</Text>
            <Text style={styles.deleteBullet}>• your profile, email, and courses</Text>
            <Text style={styles.deleteBullet}>• every message, photo, and video you've sent</Text>
            <Text style={styles.deleteBullet}>• your reactions and feedback</Text>
            <Text style={[styles.deleteBody, { marginTop: 10 }]}>
              This can't be undone. Type <Text style={styles.deleteKeyword}>DELETE</Text> to confirm.
            </Text>
            <TextInput
              style={styles.deleteInput}
              placeholder="DELETE"
              placeholderTextColor={colors.mutedText}
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!deleting}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancel} onPress={closeDeleteModal} disabled={deleting}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalSubmit,
                  { backgroundColor: colors.danger },
                  (deleteConfirmText.trim() !== "DELETE" || deleting) && { opacity: 0.4 },
                ]}
                onPress={deleteAccount}
                disabled={deleteConfirmText.trim() !== "DELETE" || deleting}
              >
                <Text style={styles.modalSubmitText}>{deleting ? "Deleting…" : "Delete forever"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
      fontFamily: fonts.bold,
      marginBottom: 10,
      marginTop: 10,
      color: colors.text,
    },
    section: {
      marginTop: 20,
      marginBottom: 8,
      fontFamily: fonts.medium,
      color: colors.brand,
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
      fontFamily: fonts.regular,
      fontSize: 16,
      color: colors.text,
    },
    chevron: {
      fontFamily: fonts.regular,
      fontSize: 18,
      color: colors.mutedText,
    },
    check: {
      fontSize: 16,
      color: colors.brand,
      fontFamily: fonts.medium,
    },
    signOut: {
      marginTop: 30,
      borderWidth: 1,
      borderColor: colors.danger,
      borderRadius: 14,
      padding: 14,
      alignItems: "center",
    },
    signOutText: {
      color: colors.danger,
      fontFamily: fonts.medium,
    },
    deleteBody: {
      fontFamily: fonts.regular,
      fontSize: 15,
      lineHeight: 21,
      color: colors.text,
      marginBottom: 4,
    },
    deleteBullet: {
      fontFamily: fonts.regular,
      fontSize: 14,
      lineHeight: 20,
      color: colors.subtext,
      marginLeft: 4,
    },
    deleteKeyword: {
      fontFamily: fonts.bold,
      color: colors.danger,
    },
    deleteInput: {
      fontFamily: fonts.medium,
      fontSize: 16,
      letterSpacing: 2,
      color: colors.text,
      backgroundColor: colors.inputBg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginTop: 12,
    },
    deleteAccount: {
      marginTop: 14,
      marginBottom: 40,
      alignItems: "center",
      padding: 10,
    },
    deleteAccountText: {
      fontFamily: fonts.medium,
      fontSize: 14,
      color: colors.danger,
    },
    sectionHint: {
      fontFamily: fonts.regular,
      fontSize: 13,
      lineHeight: 18,
      color: colors.mutedText,
      marginTop: 8,
      marginHorizontal: 4,
    },
    rowSubtext: {
      fontFamily: fonts.regular,
      fontSize: 12,
      color: colors.mutedText,
      marginTop: 2,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
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
      fontFamily: fonts.medium,
      color: colors.text,
      marginBottom: 14,
    },
    feedbackInput: {
      fontFamily: fonts.regular,
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
      fontFamily: fonts.medium,
    },
    modalSubmit: {
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: colors.primary,
    },
    modalSubmitText: {
      color: colors.onPrimary,
      fontFamily: fonts.medium,
    },
  });
}
