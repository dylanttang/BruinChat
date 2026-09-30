import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { apiFetch } from "../lib/api";
import { Colors, fonts, useTheme } from "../context/ThemeContext";

type BlockedUser = {
  _id: string;
  displayName: string;
  avatarUrl?: string;
};

export default function BlockedUsers() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [users, setUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      apiFetch("/api/users/me/blocked")
        .then((res) => (res.ok ? res.json() : { users: [] }))
        .then((data) => setUsers(data.users))
        .catch((err) => console.error("Failed to load blocked users:", err))
        .finally(() => setLoading(false));
    }, [])
  );

  const unblock = (user: BlockedUser) => {
    Alert.alert(`Unblock ${user.displayName}?`, "You'll see their messages again.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Unblock",
        onPress: async () => {
          try {
            const res = await apiFetch(`/api/users/${user._id}/block`, { method: "DELETE" });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setUsers((prev) => prev.filter((u) => u._id !== user._id));
          } catch (err) {
            console.error("Failed to unblock:", err);
            Alert.alert("Couldn't unblock user", "Please try again.");
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={24} color={colors.brand} />
        </TouchableOpacity>
        <Text style={styles.title}>Blocked users</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.mutedText} />
        </View>
      ) : users.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>
            You haven't blocked anyone. To block someone, long-press one of their messages.
          </Text>
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Image
                source={item.avatarUrl ? { uri: item.avatarUrl } : undefined}
                style={styles.avatar}
              />
              <Text style={styles.name} numberOfLines={1}>{item.displayName}</Text>
              <TouchableOpacity style={styles.unblockBtn} onPress={() => unblock(item)}>
                <Text style={styles.unblockText}>Unblock</Text>
              </TouchableOpacity>
            </View>
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
      backgroundColor: colors.card,
    },
    title: {
      fontFamily: fonts.bold,
      fontSize: 18,
      color: colors.text,
    },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 32,
    },
    emptyText: {
      fontFamily: fonts.regular,
      fontSize: 15,
      lineHeight: 21,
      color: colors.subtext,
      textAlign: "center",
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.separator,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.avatarBg,
      marginRight: 12,
    },
    name: {
      flex: 1,
      fontFamily: fonts.medium,
      fontSize: 16,
      color: colors.text,
    },
    unblockBtn: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 16,
      backgroundColor: colors.inputBg,
    },
    unblockText: {
      fontFamily: fonts.medium,
      fontSize: 14,
      color: colors.primary,
    },
  });
}
