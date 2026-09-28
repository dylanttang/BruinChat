import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useMemo, useState } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { apiFetch } from "../../lib/api";
import GradientButton from "../../components/GradientButton";
import { useTheme, fonts, Colors } from "../../context/ThemeContext";

const CHAT_PAGE_SIZE = 20;

type Chat = {
  _id: string;
  name: string;
  lastMessageAt: string | null;
  lastMessageText: string | null;
  members: { _id: string; displayName: string }[];
};

function formatTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } else if (diffDays === 1) {
    return "Yesterday";
  } else if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: "short" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

// "COM SCI 35L" -> "CS", "Physics 1A" -> "P1"
function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

export default function Home() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const loadChats = useCallback(async (
    { reset = true, before = null }: { reset?: boolean; before?: string | null } = {}
  ) => {
    try {
      const cursor = reset ? null : before;
      const query = cursor
        ? `?before=${encodeURIComponent(cursor)}&limit=${CHAT_PAGE_SIZE}`
        : `?limit=${CHAT_PAGE_SIZE}`;
      const res = await apiFetch(`/api/chats${query}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setChats((prev) => {
        if (reset) return data.chats;

        const existingIds = new Set(prev.map((chat) => chat._id));
        const newChats = data.chats.filter((chat: Chat) => !existingIds.has(chat._id));
        return [...prev, ...newChats];
      });
      setHasMore(!!data.hasMore);
      setNextCursor(data.nextCursor ?? null);
    } catch (err) {
      console.error("Failed to fetch chats:", err);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadChats().finally(() => setLoading(false));
    }, [loadChats])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadChats({ reset: true });
    setRefreshing(false);
  };

  const loadMoreChats = async () => {
    if (!hasMore || !nextCursor || loadingMore || loading || refreshing) return;

    setLoadingMore(true);
    await loadChats({ reset: false, before: nextCursor });
    setLoadingMore(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <LinearGradient colors={colors.gradients.sent} style={styles.logoTile}>
          <Ionicons name="chatbubbles" size={18} color={colors.onPrimary} />
        </LinearGradient>
        <Text style={styles.title}>BruinChat</Text>
        <TouchableOpacity
          style={styles.profileButton}
          onPress={() => router.push("/tabs/profile")}
          accessibilityRole="button"
          accessibilityLabel="Open profile settings"
        >
          <Ionicons name="person-circle-outline" size={30} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={colors.mutedText} />
        </View>
      ) : chats.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            No chats yet. Add classes to get started.
          </Text>
          <GradientButton
            label="Add Classes"
            onPress={() => router.push("/auth/questionnaire/step3")}
            style={styles.emptyButton}
          />
        </View>
      ) : (
        <FlatList
          data={chats}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.mutedText} />
          }
          onEndReached={loadMoreChats}
          onEndReachedThreshold={0.35}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color={colors.mutedText} />
              </View>
            ) : null
          }
          renderItem={({ item, index }) => (
            <TouchableOpacity
              style={styles.chatRow}
              onPress={() => router.push(`/chat/${item._id}`)}
            >
              <LinearGradient
                colors={index % 2 === 0 ? colors.gradients.received : colors.gradients.sent}
                style={styles.avatar}
              >
                <Text style={styles.avatarText}>{getInitials(item.name)}</Text>
              </LinearGradient>

              <View style={styles.chatText}>
                <Text style={styles.chatName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.lastMessage} numberOfLines={1}>
                  {item.lastMessageText ?? "No messages yet"}
                </Text>
              </View>

              <Text style={styles.time}>{formatTime(item.lastMessageAt)}</Text>
            </TouchableOpacity>
          )}
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
      height: 90,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.card,
    },
    title: {
      fontSize: 24,
      fontFamily: fonts.bold,
      color: colors.brand,
    },
    logoTile: {
      width: 34,
      height: 34,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
    },
    profileButton: {
      width: 32,
      height: 32,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 16,
    },
    list: {
      paddingTop: 8,
    },
    footerLoader: {
      paddingVertical: 16,
      alignItems: "center",
    },
    chatRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: 16,
      marginRight: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: {
      fontFamily: fonts.bold,
      fontSize: 16,
      color: colors.onPrimary,
    },
    chatText: {
      flex: 1,
    },
    chatName: {
      fontSize: 16,
      fontFamily: fonts.medium,
      color: colors.text,
    },
    lastMessage: {
      fontFamily: fonts.regular,
      fontSize: 14,
      color: colors.subtext,
      marginTop: 2,
    },
    time: {
      fontFamily: fonts.regular,
      fontSize: 12,
      color: colors.mutedText,
    },
    emptyState: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 32,
    },
    emptyText: {
      fontFamily: fonts.regular,
      fontSize: 16,
      color: colors.subtext,
      textAlign: "center",
    },
    emptyButton: {
      marginTop: 20,
    },
  });
}
