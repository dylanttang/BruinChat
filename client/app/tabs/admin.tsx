import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Image, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { apiFetch } from "../../lib/api";
import { ACTION_LABEL, REASON_LABEL, timeAgo } from "../../lib/moderation";
import { Colors, fonts, useTheme } from "../../context/ThemeContext";

type QueueItem = {
  targetType: "user" | "message";
  targetId: string;
  reasons: string[];
  reportCount: number;
  firstReportedAt: string;
  status?: string;
  actions?: string[];
  muteDays?: number | null;
  resolvedAt?: string;
  target: { text?: string; mediaUrls?: string[]; deletedAt?: string | null; chat?: { name: string } } | null;
  targetUser: {
    _id: string;
    displayName: string;
    avatarUrl?: string;
    bannedAt: string | null;
    mutedUntil: string | null;
    priorActionCount: number;
  } | null;
};

type Filter = "pending" | "resolved";

function describeResolution(item: QueueItem): string {
  if (item.status === "dismissed") return "Dismissed";
  const actions = (item.actions ?? []).map((a) =>
    a === "muted" && item.muteDays ? `Muted ${item.muteDays}d` : ACTION_LABEL[a] ?? a
  );
  return actions.join(" · ") || item.status || "";
}

export default function AdminQueue() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [filter, setFilter] = useState<Filter>("pending");
  const [items, setItems] = useState<QueueItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (which: Filter) => {
    try {
      const res = await apiFetch(`/api/admin/reports?status=${which}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(data.items);
      setPendingCount(data.pendingCount);
    } catch (err) {
      console.error("Failed to load reports:", err);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load(filter).finally(() => setLoading(false));
    }, [filter, load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load(filter);
    setRefreshing(false);
  };

  const renderItem = ({ item }: { item: QueueItem }) => {
    const user = item.targetUser;
    const preview =
      item.targetType === "message"
        ? item.target?.deletedAt
          ? "[message removed]"
          : item.target?.text || (item.target?.mediaUrls?.length ? "[photo or video]" : "[empty message]")
        : "Reported profile";

    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => router.push(`/admin/${item.targetType}/${item.targetId}`)}
      >
        <Image source={user?.avatarUrl ? { uri: user.avatarUrl } : undefined} style={styles.avatar} />
        <View style={{ flex: 1 }}>
          <View style={styles.rowTop}>
            <Text style={styles.name} numberOfLines={1}>{user?.displayName ?? "Unknown user"}</Text>
            <Text style={styles.time}>
              {timeAgo(filter === "pending" ? item.firstReportedAt : item.resolvedAt ?? item.firstReportedAt)}
            </Text>
          </View>
          <Text style={styles.preview} numberOfLines={2}>
            {item.targetType === "message" && item.target?.chat ? `${item.target.chat.name}: ` : ""}
            {preview}
          </Text>
          <View style={styles.tags}>
            {filter === "resolved" ? (
              <Text style={[styles.tag, styles.tagNeutral]}>{describeResolution(item)}</Text>
            ) : (
              item.reasons.map((reason) => (
                <Text key={reason} style={[styles.tag, styles.tagReason]}>{REASON_LABEL[reason] ?? reason}</Text>
              ))
            )}
            {item.reportCount > 1 && <Text style={[styles.tag, styles.tagNeutral]}>{item.reportCount} reports</Text>}
            {!!user?.priorActionCount && filter === "pending" && (
              <Text style={[styles.tag, styles.tagWarn]}>
                {user.priorActionCount} prior action{user.priorActionCount === 1 ? "" : "s"}
              </Text>
            )}
            {user?.bannedAt && <Text style={[styles.tag, styles.tagWarn]}>Banned</Text>}
            {user?.mutedUntil && new Date(user.mutedUntil) > new Date() && (
              <Text style={[styles.tag, styles.tagWarn]}>Muted</Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <Text style={styles.header}>Reports</Text>
      <Text style={styles.subheader}>
        {pendingCount === 0 ? "All caught up" : `${pendingCount} waiting for review. Handle within 24 hours.`}
      </Text>

      <View style={styles.segment}>
        {(["pending", "resolved"] as Filter[]).map((option) => (
          <TouchableOpacity
            key={option}
            style={[styles.segmentOption, filter === option && styles.segmentOptionActive]}
            onPress={() => setFilter(option)}
          >
            <Text style={[styles.segmentText, filter === option && styles.segmentTextActive]}>
              {option === "pending" ? `Pending${pendingCount ? ` (${pendingCount})` : ""}` : "Resolved"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.mutedText} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item, index) => `${item.targetType}-${item.targetId}-${index}`}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.mutedText} />}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {filter === "pending" ? "No reports waiting. Nice." : "Nothing resolved yet."}
            </Text>
          }
        />
      )}
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
      fontFamily: fonts.bold,
      fontSize: 28,
      color: colors.text,
      marginTop: 10,
      paddingHorizontal: 20,
    },
    subheader: {
      fontFamily: fonts.regular,
      fontSize: 14,
      color: colors.subtext,
      paddingHorizontal: 20,
      marginTop: 2,
    },
    segment: {
      flexDirection: "row",
      marginHorizontal: 20,
      marginTop: 14,
      marginBottom: 6,
      backgroundColor: colors.inputBg,
      borderRadius: 14,
      padding: 3,
    },
    segmentOption: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 11,
      alignItems: "center",
    },
    segmentOptionActive: {
      backgroundColor: colors.card,
    },
    segmentText: {
      fontFamily: fonts.medium,
      fontSize: 14,
      color: colors.mutedText,
    },
    segmentTextActive: {
      color: colors.brand,
    },
    row: {
      flexDirection: "row",
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.separator,
    },
    avatar: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: colors.avatarBg,
      marginRight: 12,
    },
    rowTop: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    name: {
      flex: 1,
      fontFamily: fonts.bold,
      fontSize: 16,
      color: colors.text,
    },
    time: {
      fontFamily: fonts.regular,
      fontSize: 12,
      color: colors.mutedText,
      marginLeft: 8,
    },
    preview: {
      fontFamily: fonts.regular,
      fontSize: 14,
      lineHeight: 19,
      color: colors.subtext,
      marginTop: 2,
    },
    tags: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginTop: 8,
    },
    tag: {
      fontFamily: fonts.medium,
      fontSize: 12,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      overflow: "hidden",
    },
    tagReason: {
      color: colors.danger,
      backgroundColor: colors.brandSoft,
    },
    tagWarn: {
      color: colors.onPrimary,
      backgroundColor: colors.danger,
    },
    tagNeutral: {
      color: colors.subtext,
      backgroundColor: colors.inputBg,
    },
    empty: {
      fontFamily: fonts.regular,
      fontSize: 15,
      color: colors.subtext,
      textAlign: "center",
      marginTop: 60,
    },
  });
}
