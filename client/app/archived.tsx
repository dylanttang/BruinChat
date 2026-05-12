import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useMemo, useEffect, useState, useCallback } from "react";
import { useTheme, Colors } from "./context/ThemeContext";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";
const DEV_USER_ID = process.env.EXPO_PUBLIC_DEV_USER_ID || "";

type ArchivedChatRow = {
  id: string;
  name: string;
  lastMessage: string;
};

export default function ArchivedClasses() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [chats, setChats] = useState<ArchivedChatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (!DEV_USER_ID.trim()) {
      setError(
        "Set EXPO_PUBLIC_DEV_USER_ID in client/.env to your MongoDB user _id (dev auth)."
      );
      setChats([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (mode === "initial") setLoading(true);
    if (mode === "refresh") setRefreshing(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/archived-chats`, {
        headers: {
          "Content-Type": "application/json",
          "x-user-id": DEV_USER_ID.trim(),
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : `Request failed (${res.status})`);
        setChats([]);
        return;
      }
      const list = Array.isArray(data.chats) ? data.chats : [];
      setChats(
        list.map((c: { id?: string; name?: string; lastMessage?: string }) => ({
          id: String(c.id ?? ""),
          name: String(c.name ?? "Chat"),
          lastMessage: String(c.lastMessage ?? ""),
        }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load archived chats");
      setChats([]);
    } finally {
      if (mode === "initial") setLoading(false);
      if (mode === "refresh") setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load("initial");
  }, [load]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Archived Classes</Text>
        <View style={{ width: 32 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.subtext} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : chats.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No archived classes yet.</Text>
        </View>
      ) : (
        <FlatList
          data={chats}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshing={refreshing}
          onRefresh={() => load("refresh")}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.chatRow}
              onPress={() => router.push(`/chat/${item.id}`)}
            >
              <View style={styles.avatar} />
              <View style={styles.chatText}>
                <Text style={styles.chatName}>{item.name}</Text>
                <Text style={styles.lastMessage} numberOfLines={2}>
                  {item.lastMessage}
                </Text>
              </View>
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
      height: 56,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    back: {
      fontSize: 22,
      color: colors.text,
    },
    title: {
      fontSize: 18,
      fontWeight: "600",
      color: colors.text,
    },
    centered: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 24,
    },
    errorText: {
      color: colors.subtext,
      textAlign: "center",
      fontSize: 15,
    },
    emptyText: {
      color: colors.subtext,
      fontSize: 16,
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
  });
}
