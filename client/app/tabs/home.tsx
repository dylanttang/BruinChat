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
import { useCallback, useState } from "react";
import { apiFetch } from "../lib/api";

type Chat = {
  _id: string;
  name: string;
  lastMessageAt: string | null;
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
        <View style={styles.iconPlaceholder} />
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color="#888" />
        </View>
      ) : chats.length === 0 ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 32 }}>
          <Text style={{ fontSize: 16, color: "#888", textAlign: "center" }}>
            No chats yet. Add classes to get started.
          </Text>
        </View>
      ) : (
        <FlatList
          data={chats}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
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
                  {item.members.length} {item.members.length === 1 ? "member" : "members"}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },

  header: {
    height: 90,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
  },

  title: {
    fontSize: 20,
    fontWeight: "600",
  },

  iconPlaceholder: {
    width: 32,
    height: 32,
    backgroundColor: "#ddd",
    borderRadius: 4,
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
    borderBottomColor: "#eee",
  },

  avatar: {
    width: 48,
    height: 48,
    backgroundColor: "#ccc",
    borderRadius: 8,
    marginRight: 12,
  },

  chatText: {
    flex: 1,
  },

  chatName: {
    fontSize: 16,
    fontWeight: "500",
  },

  lastMessage: {
    fontSize: 14,
    color: "#666",
    marginTop: 2,
  },

  time: {
    fontSize: 12,
    color: "#999",
  },
});
