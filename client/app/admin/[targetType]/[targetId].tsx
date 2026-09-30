import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { apiFetch } from "../../../lib/api";
import { ACTION_LABEL, REASON_LABEL, timeAgo } from "../../../lib/moderation";
import { Colors, fonts, useTheme } from "../../../context/ThemeContext";

type Action = "dismiss" | "warn" | "mute" | "ban";

type Detail = {
  targetType: "user" | "message";
  target: { _id: string; text?: string; mediaUrls?: string[]; deletedAt?: string | null; chat?: { name: string } } | null;
  targetUser: {
    _id: string;
    displayName: string;
    avatarUrl?: string;
    bannedAt: string | null;
    mutedUntil: string | null;
    deletedAt: string | null;
  } | null;
  reports: {
    _id: string;
    reporterId: { displayName: string } | null;
    reason: string;
    details: string;
    status: string;
    createdAt: string;
  }[];
  context: {
    _id: string;
    text: string;
    deletedAt?: string | null;
    mediaUrls?: string[];
    senderId: { displayName: string } | null;
    chatId?: { name: string };
    createdAt: string;
    isReported?: boolean;
  }[];
  history: {
    action: string;
    reason: string | null;
    note: string;
    muteDays: number | null;
    messageText: string | null;
    byName: string | null;
    at: string;
  }[];
};

const ACTIONS: { value: Action; label: string; hint: string }[] = [
  { value: "dismiss", label: "No violation", hint: "Close the report without penalty" },
  { value: "warn", label: "Warn", hint: "They see a warning next time they open the app" },
  { value: "mute", label: "Mute", hint: "They can read but can't post, react, or edit" },
  { value: "ban", label: "Ban", hint: "Permanently locked out of BChat" },
];
const MUTE_OPTIONS = [1, 7, 30];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

export default function ReportDetail() {
  const router = useRouter();
  const { targetType, targetId } = useLocalSearchParams<{ targetType: string; targetId: string }>();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<Action | null>(null);
  const [muteDays, setMuteDays] = useState(7);
  const [removeMessage, setRemoveMessage] = useState(false);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/admin/reports/${targetType}/${targetId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDetail(await res.json());
    } catch (err) {
      console.error("Failed to load report:", err);
    } finally {
      setLoading(false);
    }
  }, [targetType, targetId]);

  useEffect(() => {
    load();
  }, [load]);

  const pendingReports = detail?.reports.filter((r) => r.status === "pending") ?? [];
  const canRemove = detail?.targetType === "message" && !!detail.target && !detail.target.deletedAt;
  const user = detail?.targetUser;
  const isMuted = !!user?.mutedUntil && new Date(user.mutedUntil) > new Date();

  const summary = () => {
    const parts: string[] = [];
    if (removeMessage) parts.push("remove the message");
    if (action === "warn") parts.push(`warn ${user?.displayName}`);
    if (action === "mute") parts.push(`mute ${user?.displayName} for ${muteDays} day${muteDays === 1 ? "" : "s"}`);
    if (action === "ban") parts.push(`permanently ban ${user?.displayName}`);
    if (action === "dismiss" && !removeMessage) return "Close this report with no action?";
    return `This will ${parts.join(" and ")}.`;
  };

  const submit = () => {
    if (!action) return;
    Alert.alert("Confirm action", summary(), [
      { text: "Cancel", style: "cancel" },
      {
        text: "Confirm",
        style: action === "ban" ? "destructive" : "default",
        onPress: async () => {
          setSubmitting(true);
          try {
            const res = await apiFetch("/api/admin/reports/resolve", {
              method: "POST",
              body: JSON.stringify({
                targetType,
                targetId,
                action,
                removeMessage,
                ...(action === "mute" ? { muteDays } : {}),
                note: note.trim(),
              }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            router.back();
          } catch (err: any) {
            Alert.alert("Couldn't apply action", err.message ?? "Please try again.");
          } finally {
            setSubmitting(false);
          }
        },
      },
    ]);
  };

  const accountAction = (kind: "unmute" | "unban") => {
    if (!user) return;
    Alert.alert(kind === "unmute" ? `Unmute ${user.displayName}?` : `Unban ${user.displayName}?`, undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: kind === "unmute" ? "Unmute" : "Unban",
        onPress: async () => {
          const res = await apiFetch(`/api/admin/users/${user._id}/${kind}`, { method: "POST" });
          if (!res.ok) Alert.alert("Something went wrong", "Please try again.");
          load();
        },
      },
    ]);
  };

  if (loading || !detail) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        {loading ? <ActivityIndicator color={colors.mutedText} /> : <Text style={styles.muted}>Report not found.</Text>}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={24} color={colors.brand} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {detail.targetType === "message" ? "Reported message" : "Reported user"}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Who */}
        <View style={styles.card}>
          <View style={styles.userRow}>
            <Image source={user?.avatarUrl ? { uri: user.avatarUrl } : undefined} style={styles.avatar} />
            <View style={{ flex: 1 }}>
              <Text style={styles.userName}>{user?.displayName ?? "Unknown user"}</Text>
              <Text style={styles.muted}>
                {user?.deletedAt
                  ? "Account deleted"
                  : user?.bannedAt
                    ? `Banned ${formatDate(user.bannedAt)}`
                    : isMuted
                      ? `Muted until ${formatDate(user!.mutedUntil!)}`
                      : "In good standing"}
              </Text>
            </View>
            {isMuted && !user?.bannedAt && (
              <TouchableOpacity style={styles.smallBtn} onPress={() => accountAction("unmute")}>
                <Text style={styles.smallBtnText}>Unmute</Text>
              </TouchableOpacity>
            )}
            {user?.bannedAt && (
              <TouchableOpacity style={styles.smallBtn} onPress={() => accountAction("unban")}>
                <Text style={styles.smallBtnText}>Unban</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Moderation history */}
        <Text style={styles.section}>Moderation history</Text>
        <View style={styles.card}>
          {detail.history.length === 0 ? (
            <Text style={styles.muted}>No previous actions against this user.</Text>
          ) : (
            detail.history.map((entry, index) => (
              <View key={index} style={[styles.historyRow, index === detail.history.length - 1 && styles.last]}>
                <View style={styles.historyTop}>
                  <Text style={styles.historyAction}>
                    {ACTION_LABEL[entry.action] ?? entry.action}
                    {entry.action === "muted" && entry.muteDays ? ` (${entry.muteDays}d)` : ""}
                  </Text>
                  <Text style={styles.muted}>{formatDate(entry.at)}</Text>
                </View>
                {!!entry.reason && <Text style={styles.body}>For {REASON_LABEL[entry.reason] ?? entry.reason}</Text>}
                {!!entry.messageText && <Text style={styles.quote}>"{entry.messageText}"</Text>}
                {!!entry.note && <Text style={styles.body}>Note: {entry.note}</Text>}
                {!!entry.byName && <Text style={styles.muted}>by {entry.byName}</Text>}
              </View>
            ))
          )}
        </View>

        {/* Reports */}
        <Text style={styles.section}>Reports ({detail.reports.length})</Text>
        <View style={styles.card}>
          {detail.reports.map((report, index) => (
            <View key={report._id} style={[styles.historyRow, index === detail.reports.length - 1 && styles.last]}>
              <View style={styles.historyTop}>
                <Text style={styles.historyAction}>{REASON_LABEL[report.reason] ?? report.reason}</Text>
                <Text style={styles.muted}>{timeAgo(report.createdAt)}</Text>
              </View>
              {!!report.details && <Text style={styles.body}>"{report.details}"</Text>}
              <Text style={styles.muted}>
                from {report.reporterId?.displayName ?? "deleted user"}
                {report.status !== "pending" ? ` · ${report.status}` : ""}
              </Text>
            </View>
          ))}
        </View>

        {/* Context */}
        <Text style={styles.section}>
          {detail.targetType === "message"
            ? `In ${detail.target?.chat?.name ?? "chat"}`
            : "Their recent messages"}
        </Text>
        <View style={styles.card}>
          {detail.context.length === 0 ? (
            <Text style={styles.muted}>No messages.</Text>
          ) : (
            detail.context.map((msg) => (
              <View key={msg._id} style={[styles.contextMsg, msg.isReported && styles.contextReported]}>
                <Text style={styles.contextSender}>
                  {msg.senderId?.displayName ?? "Unknown"}
                  {msg.chatId?.name ? ` · ${msg.chatId.name}` : ""}
                </Text>
                <Text style={[styles.body, msg.deletedAt && styles.muted]}>
                  {msg.deletedAt ? "[removed]" : msg.text || (msg.mediaUrls?.length ? "[photo or video]" : "")}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* Decide */}
        {pendingReports.length > 0 ? (
          <>
            <Text style={styles.section}>Take action</Text>
            <View style={styles.card}>
              {canRemove && (
                <View style={[styles.removeRow]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.optionLabel}>Remove this message</Text>
                    <Text style={styles.muted}>Deletes it for everyone in the chat</Text>
                  </View>
                  <Switch
                    value={removeMessage}
                    onValueChange={setRemoveMessage}
                    trackColor={{ false: colors.border, true: colors.danger }}
                  />
                </View>
              )}

              {ACTIONS.map((option) => {
                const selected = action === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.option, selected && styles.optionSelected]}
                    onPress={() => setAction(option.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.optionLabel, selected && { color: colors.brand }]}>{option.label}</Text>
                      <Text style={styles.muted}>{option.hint}</Text>
                    </View>
                    {selected && <Ionicons name="checkmark-circle" size={22} color={colors.brand} />}
                  </TouchableOpacity>
                );
              })}

              {action === "mute" && (
                <View style={styles.muteRow}>
                  {MUTE_OPTIONS.map((days) => (
                    <TouchableOpacity
                      key={days}
                      style={[styles.muteChip, muteDays === days && styles.muteChipSelected]}
                      onPress={() => setMuteDays(days)}
                    >
                      <Text style={[styles.muteChipText, muteDays === days && { color: colors.onPrimary }]}>
                        {days} day{days === 1 ? "" : "s"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <TextInput
                style={styles.note}
                placeholder="Internal note (only admins see this)"
                placeholderTextColor={colors.mutedText}
                value={note}
                onChangeText={setNote}
                maxLength={500}
                multiline
              />

              <TouchableOpacity
                style={[
                  styles.applyBtn,
                  action === "ban" && { backgroundColor: colors.danger },
                  (!action || submitting) && { opacity: 0.4 },
                ]}
                onPress={submit}
                disabled={!action || submitting}
              >
                <Text style={styles.applyText}>
                  {submitting
                    ? "Applying…"
                    : `Resolve ${pendingReports.length} report${pendingReports.length === 1 ? "" : "s"}`}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <Text style={[styles.muted, { textAlign: "center", marginTop: 16 }]}>All reports here are resolved.</Text>
        )}
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
    center: {
      alignItems: "center",
      justifyContent: "center",
    },
    header: {
      height: 56,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.card,
    },
    headerTitle: {
      fontFamily: fonts.bold,
      fontSize: 18,
      color: colors.text,
    },
    content: {
      padding: 16,
      paddingBottom: 48,
    },
    section: {
      fontFamily: fonts.bold,
      fontSize: 15,
      color: colors.brand,
      marginTop: 20,
      marginBottom: 8,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
    },
    userRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.avatarBg,
      marginRight: 12,
    },
    userName: {
      fontFamily: fonts.bold,
      fontSize: 18,
      color: colors.text,
    },
    muted: {
      fontFamily: fonts.regular,
      fontSize: 13,
      color: colors.mutedText,
    },
    body: {
      fontFamily: fonts.regular,
      fontSize: 14,
      lineHeight: 20,
      color: colors.text,
      marginTop: 2,
    },
    quote: {
      fontFamily: fonts.regular,
      fontSize: 14,
      lineHeight: 20,
      color: colors.subtext,
      fontStyle: "italic",
      marginTop: 2,
    },
    smallBtn: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 12,
      backgroundColor: colors.inputBg,
    },
    smallBtnText: {
      fontFamily: fonts.medium,
      fontSize: 13,
      color: colors.primary,
    },
    historyRow: {
      paddingBottom: 10,
      marginBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.separator,
    },
    last: {
      paddingBottom: 0,
      marginBottom: 0,
      borderBottomWidth: 0,
    },
    historyTop: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    historyAction: {
      fontFamily: fonts.bold,
      fontSize: 15,
      color: colors.text,
    },
    contextMsg: {
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 10,
      marginBottom: 4,
    },
    contextReported: {
      backgroundColor: colors.brandSoft,
      borderLeftWidth: 3,
      borderLeftColor: colors.danger,
    },
    contextSender: {
      fontFamily: fonts.medium,
      fontSize: 12,
      color: colors.subtext,
    },
    removeRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingBottom: 12,
      marginBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.separator,
    },
    option: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 14,
      padding: 12,
      marginBottom: 8,
    },
    optionSelected: {
      borderColor: colors.brand,
      backgroundColor: colors.brandSoft,
    },
    optionLabel: {
      fontFamily: fonts.bold,
      fontSize: 15,
      color: colors.text,
    },
    muteRow: {
      flexDirection: "row",
      gap: 8,
      marginBottom: 8,
    },
    muteChip: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 9,
      borderRadius: 12,
      backgroundColor: colors.inputBg,
    },
    muteChipSelected: {
      backgroundColor: colors.brand,
    },
    muteChipText: {
      fontFamily: fonts.medium,
      fontSize: 14,
      color: colors.text,
    },
    note: {
      fontFamily: fonts.regular,
      fontSize: 14,
      color: colors.text,
      backgroundColor: colors.inputBg,
      borderRadius: 12,
      padding: 12,
      minHeight: 64,
      textAlignVertical: "top",
      marginTop: 4,
    },
    applyBtn: {
      marginTop: 14,
      paddingVertical: 14,
      borderRadius: 16,
      alignItems: "center",
      backgroundColor: colors.primary,
    },
    applyText: {
      fontFamily: fonts.bold,
      fontSize: 16,
      color: colors.onPrimary,
    },
  });
}
