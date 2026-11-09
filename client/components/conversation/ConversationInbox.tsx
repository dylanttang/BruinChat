import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { apiFetch, onSessionChanged } from "../../lib/api";
import { loadReadState, clearReadState, isChatUnread } from "../../lib/readState";
import GradientButton from "../GradientButton";
import { startDirectMessage, conversationTitle } from "../../lib/directMessages";
import { useTheme, fonts, Colors } from "../../context/ThemeContext";

const CHAT_PAGE_SIZE = 20;

type Chat = {
  _id: string;
  name: string;
  isGroup?: boolean;
  lastMessageAt: string | null;
  lastMessageText: string | null;
  lastMessageSenderId?: string | null;
  lastMessageCreatedAt?: string | null;
  members: { _id: string; displayName: string }[];
};

type InboxCache = {
  chats: Chat[];
  hasMore: boolean;
  nextCursor: string | null;
  currentUserId: string | null;
};

// The last list shown for each inbox, so switching tabs shows it right away
// while a fresh copy loads in the background.
const inboxCache: { group?: InboxCache; direct?: InboxCache } = {};
onSessionChanged(() => {
  delete inboxCache.group;
  delete inboxCache.direct;
  clearReadState();
});

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

export default function ConversationInbox({ direct = false }: { direct?: boolean }) {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const kind = direct ? "direct" : "group";
  const cached = inboxCache[kind];

  const [username, setUsername] = useState("");
  const [starting, setStarting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(cached?.currentUserId ?? null);
  const [error, setError] = useState<string | null>(null);
  const [chats, setChats] = useState<Chat[]>(cached?.chats ?? []);
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(cached?.hasMore ?? false);
  const [nextCursor, setNextCursor] = useState<string | null>(cached?.nextCursor ?? null);
  const [readState, setReadState] = useState<Awaited<ReturnType<typeof loadReadState>> | null>(null);
  const loadedRef = useRef(!!cached);

  const loadChats = useCallback(async (
    { reset = true, before = null }: { reset?: boolean; before?: string | null } = {}
  ) => {
    try {
      const cursor = reset ? null : before;
      const query = cursor
        ? `?before=${encodeURIComponent(cursor)}&limit=${CHAT_PAGE_SIZE}`
        : `?limit=${CHAT_PAGE_SIZE}`;
      const [res, me] = await Promise.all([apiFetch(`/api/chats${query}&kind=${direct ? "direct" : "group"}`), apiFetch("/api/users/me")]);
      if (me.ok) setCurrentUserId((await me.json()).user._id);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setError(null);
      setChats((prev) => {
        if (reset) return data.chats;

        const existingIds = new Set(prev.map((chat) => chat._id));
        const newChats = data.chats.filter((chat: Chat) => !existingIds.has(chat._id));
        return [...prev, ...newChats];
      });
      setHasMore(!!data.hasMore);
      setNextCursor(data.nextCursor ?? null);
      loadedRef.current = true;
    } catch (err) {
      setError("Could not load conversations. Pull to refresh or tap here to retry.");
      console.error("Failed to fetch chats:", err);
    }
  }, [direct]);

  useEffect(() => {
    if (loadedRef.current) inboxCache[kind] = { chats, hasMore, nextCursor, currentUserId };
  }, [kind, chats, hasMore, nextCursor, currentUserId]);

  useFocusEffect(
    useCallback(() => {
      // Only show the spinner the first time; after that, keep the list on
      // screen and refresh it quietly.
      if (!loadedRef.current) setLoading(true);
      loadChats().finally(() => setLoading(false));
      loadReadState().then((state) => setReadState({ ...state }));
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
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={direct ? "Back to class chats" : "Open direct messages"} onPress={() => direct ? router.canGoBack() ? router.back() : router.replace("/tabs/home") : router.push("/direct")}>
          <LinearGradient colors={colors.gradients.sent} style={styles.logoTile}>
            <Ionicons name={direct ? "arrow-back" : "chatbubbles"} size={18} color={colors.onPrimary} />
          </LinearGradient>
        </TouchableOpacity>
        <Text style={styles.title}>{direct ? "Direct messages" : "BChat"}</Text>
        <TouchableOpacity
          style={styles.profileButton}
          onPress={() => router.push("/tabs/profile")}
          accessibilityRole="button"
          accessibilityLabel="Open profile settings"
        >
          <Ionicons name="person-circle-outline" size={30} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {direct && <View style={{ flexDirection: "row", padding: 12, gap: 8 }}>
        <TextInput accessibilityLabel="Recipient username" placeholder="Classmate's exact username" placeholderTextColor={colors.mutedText} value={username} onChangeText={setUsername} autoCapitalize="none" maxLength={64} style={{ flex: 1, padding: 12, borderRadius: 12, backgroundColor: colors.inputBg, color: colors.text }} />
        <TouchableOpacity disabled={starting || !username.trim()} accessibilityRole="button" onPress={async () => {
          if (starting || !username.trim()) return;
          setStarting(true);
          try {
            const chatId = await startDirectMessage({ username });
            setUsername("");
            router.push(`/chat/${chatId}`);
          } catch (error) { Alert.alert("Could not start message", error instanceof Error ? error.message : "Please try again"); }
          finally { setStarting(false); }
        }} style={{ padding: 12, justifyContent: "center" }}><Text style={{ color: colors.text }}>{starting ? "Opening…" : "Message"}</Text></TouchableOpacity>
      </View>}
      {error && <TouchableOpacity onPress={() => loadChats()}><Text style={{ padding: 16, color: colors.text }}>{error}</Text></TouchableOpacity>}
      {loading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={colors.mutedText} />
        </View>
      ) : chats.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            {direct ? "No direct messages yet. Enter a classmate’s username above to start one." : "No chats yet. Add classes to get started."}
          </Text>
          {!direct && <GradientButton
            label="Add Classes"
            onPress={() => router.push("/auth/questionnaire/step3")}
            style={styles.emptyButton}
          />}
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
          extraData={readState}
          renderItem={({ item, index }) => {
            const unread = isChatUnread(item, readState, currentUserId);
            return (
            <TouchableOpacity
              style={styles.chatRow}
              onPress={() => router.push(`/chat/${item._id}`)}
              accessibilityLabel={unread ? `${conversationTitle(item, currentUserId)}, unread` : undefined}
            >
              <LinearGradient
                colors={index % 2 === 0 ? colors.gradients.received : colors.gradients.sent}
                style={styles.avatar}
              >
                <Text style={styles.avatarText}>{getInitials(conversationTitle(item, currentUserId))}</Text>
              </LinearGradient>

              <View style={styles.chatText}>
                <Text style={[styles.chatName, unread && styles.chatNameUnread]} numberOfLines={1}>{conversationTitle(item, currentUserId)}</Text>
                <Text style={[styles.lastMessage, unread && styles.lastMessageUnread]} numberOfLines={1}>
                  {item.lastMessageText ?? "No messages yet"}
                </Text>
              </View>

              <View style={styles.meta}>
                <Text style={[styles.time, unread && styles.timeUnread]}>{formatTime(item.lastMessageAt)}</Text>
                {unread && <View style={styles.unreadDot} />}
              </View>
            </TouchableOpacity>
            );
          }}
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
    chatNameUnread: {
      fontFamily: fonts.bold,
    },
    lastMessage: {
      fontFamily: fonts.regular,
      fontSize: 14,
      color: colors.subtext,
      marginTop: 2,
    },
    lastMessageUnread: {
      fontFamily: fonts.medium,
      color: colors.text,
    },
    meta: {
      alignItems: "flex-end",
      gap: 6,
      marginLeft: 8,
    },
    time: {
      fontFamily: fonts.regular,
      fontSize: 12,
      color: colors.mutedText,
    },
    timeUnread: {
      color: colors.brand,
    },
    unreadDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.brand,
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
