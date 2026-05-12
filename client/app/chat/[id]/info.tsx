import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Switch,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { useTheme, Colors } from "../../context/ThemeContext";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";
const DEV_USER_ID = process.env.EXPO_PUBLIC_DEV_USER_ID || "";

export default function ChatInfo() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const chatId = Array.isArray(params.id) ? params.id[0] : params.id ?? "";

  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [chatNotif, setChatNotif] = useState(true);
  const [archiveChat, setArchiveChat] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const courseDetails = {
    professor: "Name",
    lectureTime: "Time",
    midtermDates: "Dates",
    finalDates: "Dates",
  };

  const members = Array(8).fill({ username: "Username", courses: "Courses" });

  const confirmLeave = () => {
    if (!chatId) {
      Alert.alert("Missing chat", "Could not determine which chat to leave.");
      return;
    }
    if (!DEV_USER_ID.trim()) {
      Alert.alert(
        "Dev user id",
        "Set EXPO_PUBLIC_DEV_USER_ID in client/.env so the API knows who is leaving (until real auth ships)."
      );
      return;
    }

    Alert.alert(
      "Leave chat?",
      "You will stop receiving messages from this chat.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: () => void leaveChat(),
        },
      ]
    );
  };

  const leaveChat = async () => {
    setLeaving(true);
    try {
      const res = await fetch(
        `${API_URL}/api/chats/${encodeURIComponent(chatId)}/members/me`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": DEV_USER_ID.trim(),
          },
        }
      );

      if (res.ok) {
        router.replace("/tabs/home");
        return;
      }

      const data = await res.json().catch(() => ({}));
      const msg =
        typeof data.error === "string"
          ? data.error
          : typeof data.message === "string"
            ? data.message
            : `Request failed (${res.status})`;
      Alert.alert("Could not leave chat", msg);
    } catch (e) {
      Alert.alert("Network error", e instanceof Error ? e.message : "Try again.");
    } finally {
      setLeaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          Chat Info & Settings
        </Text>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.headerRight}>
          <Text style={styles.close}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={[styles.section, styles.sectionFirst]}>Class Details</Text>
        <View style={styles.card}>
          <View style={styles.detailRow}>
            <Text style={styles.label}>Professor</Text>
            <Text style={styles.value}>{courseDetails.professor}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.label}>Lecture Time</Text>
            <Text style={styles.value}>{courseDetails.lectureTime}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.label}>Midterm Dates</Text>
            <Text style={styles.value}>{courseDetails.midtermDates}</Text>
          </View>
          <View style={[styles.detailRow, styles.detailRowLast]}>
            <Text style={styles.label}>Final Dates</Text>
            <Text style={styles.value}>{courseDetails.finalDates}</Text>
          </View>
          <Text style={styles.innerSectionTitle}>Course Overview</Text>
          <View style={styles.overviewPlaceholder} />
        </View>

        <Text style={styles.section}>Notifications</Text>
        <View style={styles.card}>
          <View style={[styles.row, styles.lastRow]}>
            <Text style={styles.rowText}>Chat Notifications</Text>
            <Switch value={chatNotif} onValueChange={setChatNotif} />
          </View>
        </View>

        <Text style={styles.section}>Archive</Text>
        <View style={styles.card}>
          <View style={[styles.row, styles.lastRow]}>
            <Text style={styles.rowText}>Archive Chat</Text>
            <Switch value={archiveChat} onValueChange={setArchiveChat} />
          </View>
        </View>

        <Text style={styles.section}>Report</Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push("/report")}
            activeOpacity={0.7}
          >
            <Text style={styles.rowText}>Report a user</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.row, styles.lastRow]}
            onPress={() => router.push("/report/past")}
            activeOpacity={0.7}
          >
            <Text style={styles.rowText}>Past reports</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.section}>People ({members.length})</Text>
        <View style={styles.card}>
          {members.map((member, index) => (
            <View
              key={index}
              style={[styles.memberRow, index === members.length - 1 && styles.lastRow]}
            >
              <View style={styles.avatar} />
              <Text style={styles.memberName}>{member.username}</Text>
              <Text style={styles.memberCourses}>{member.courses}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.leaveButton, (leaving || !chatId) && styles.leaveButtonDisabled]}
          onPress={confirmLeave}
          disabled={leaving || !chatId}
        >
          {leaving ? (
            <ActivityIndicator color="red" />
          ) : (
            <Text style={styles.leaveText}>Leave Chat</Text>
          )}
        </TouchableOpacity>
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
      height: 56,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerRight: {
      width: 32,
      alignItems: "flex-end",
    },
    back: {
      fontSize: 22,
      color: colors.text,
    },
    close: {
      fontSize: 18,
      color: colors.text,
    },
    title: {
      flex: 1,
      fontSize: 17,
      fontWeight: "600",
      color: colors.text,
      textAlign: "center",
      paddingHorizontal: 8,
    },
    scrollContent: {
      padding: 20,
      paddingBottom: 32,
    },
    section: {
      marginTop: 20,
      marginBottom: 8,
      fontWeight: "600",
      color: colors.text,
    },
    sectionFirst: {
      marginTop: 10,
    },
    card: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
      backgroundColor: colors.card,
    },
    detailRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 13,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.separator,
    },
    detailRowLast: {
      borderBottomWidth: 0,
    },
    innerSectionTitle: {
      fontWeight: "600",
      fontSize: 16,
      color: colors.text,
      paddingHorizontal: 13,
      paddingTop: 12,
      paddingBottom: 8,
    },
    overviewPlaceholder: {
      height: 100,
      marginHorizontal: 13,
      marginBottom: 12,
      backgroundColor: colors.inputBg,
      borderRadius: 8,
    },
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: 13,
      borderBottomWidth: 1,
      borderBottomColor: colors.separator,
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
    label: {
      fontSize: 16,
      fontWeight: "500",
      color: colors.text,
    },
    value: {
      fontSize: 16,
      color: colors.subtext,
      marginLeft: 12,
      flexShrink: 1,
      textAlign: "right",
    },
    memberRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 13,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.separator,
    },
    avatar: {
      width: 36,
      height: 36,
      backgroundColor: colors.avatarBg,
      borderRadius: 18,
      marginRight: 12,
    },
    memberName: {
      fontSize: 16,
      color: colors.text,
      flex: 1,
    },
    memberCourses: {
      fontSize: 13,
      color: colors.mutedText,
    },
    leaveButton: {
      marginTop: 24,
      borderWidth: 1,
      borderColor: "red",
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: "center",
      justifyContent: "center",
      minHeight: 48,
    },
    leaveButtonDisabled: {
      opacity: 0.55,
    },
    leaveText: {
      fontSize: 16,
      color: "red",
      fontWeight: "600",
    },
  });
}
