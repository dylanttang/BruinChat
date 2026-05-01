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
import { apiFetch } from "../../lib/api";
import { useTheme, Colors } from "../../context/ThemeContext";

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

export default function Home() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadChats = useCallback(async () => {
    try {
      const res = await apiFetch("/api/chats");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setChats(data.chats);
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
    await loadChats();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.iconPlaceholder} />
        <Text style={styles.title}>BruinChat</Text>
        <TouchableOpacity
          style={styles.profileButton}
          onPress={() => router.push("/tabs/profile")}
          accessibilityRole="button"
          accessibilityLabel="Open profile settings"
        >
          <Ionicons name="person-circle-outline" size={30} color={colors.text} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={colors.mutedText} />
        </View>
      ) : chats.length === 0 ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 32 }}>
          <Text style={{ fontSize: 16, color: colors.subtext, textAlign: "center" }}>
            No chats yet. Add classes to get started.
          </Text>
        </View>
      ) : (
        <FlatList
          data={chats}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.mutedText} />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.chatRow}
              onPress={() => router.push(`/chat/${item._id}`)}
            >
              <View style={styles.avatar} />

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
    },
    title: {
      fontSize: 20,
      fontWeight: "600",
      color: colors.text,
    },
    iconPlaceholder: {
      width: 32,
      height: 32,
      backgroundColor: colors.avatarBg,
      borderRadius: 4,
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
      backgroundColor: colors.avatarBg,
      borderRadius: 8,
      marginRight: 12,
    },
    chatText: {
      flex: 1,
    },
    chatName: {
      fontSize: 16,
      fontWeight: "500",
      color: colors.text,
    },
    lastMessage: {
      fontSize: 14,
      color: colors.subtext,
      marginTop: 2,
    },
    time: {
      fontSize: 12,
      color: colors.mutedText,
    },
  });
}
