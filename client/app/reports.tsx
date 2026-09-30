import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { apiFetch } from "../lib/api";
import { REASON_LABEL } from "../lib/moderation";
import { Colors, fonts, useTheme } from "../context/ThemeContext";

type MyReport = {
  _id: string;
  targetType: "user" | "message";
  reason: string;
  details: string;
  status: string;
  createdAt: string;
  targetName: string | null;
  targetPreview: string | null;
};

// Reporters see whether action was taken, not what it was.
function describeStatus(status: string): { label: string; tone: "pending" | "done" | "neutral" } {
  if (status === "pending") return { label: "Under review", tone: "pending" };
  if (status === "dismissed") return { label: "No violation found", tone: "neutral" };
  return { label: "Action taken", tone: "done" };
}

export default function MyReports() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [reports, setReports] = useState<MyReport[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      apiFetch("/api/reports/me")
        .then((res) => (res.ok ? res.json() : []))
        .then(setReports)
        .catch((err) => console.error("Failed to load reports:", err))
        .finally(() => setLoading(false));
    }, [])
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={24} color={colors.brand} />
        </TouchableOpacity>
        <Text style={styles.title}>Your reports</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.mutedText} />
      ) : (
        <FlatList
          data={reports}
          keyExtractor={(item) => item._id}
          contentContainerStyle={reports.length === 0 && styles.emptyContainer}
          ListEmptyComponent={
            <Text style={styles.empty}>
              You haven't reported anything. To report someone, tap their name or long-press one of their messages.
            </Text>
          }
          renderItem={({ item }) => {
            const status = describeStatus(item.status);
            return (
              <View style={styles.row}>
                <View style={styles.rowTop}>
                  <Text style={styles.target} numberOfLines={1}>
                    {item.targetType === "message" ? "Message from " : ""}
                    {item.targetName ?? "a deleted user"}
                  </Text>
                  <Text
                    style={[
                      styles.status,
                      status.tone === "pending" && { color: colors.brand, backgroundColor: colors.brandSoft },
                      status.tone === "done" && { color: colors.onPrimary, backgroundColor: colors.primary },
                    ]}
                  >
                    {status.label}
                  </Text>
                </View>
                {!!item.targetPreview && (
                  <Text style={styles.preview} numberOfLines={2}>"{item.targetPreview}"</Text>
                )}
                <Text style={styles.meta}>
                  {REASON_LABEL[item.reason] ?? item.reason} ·{" "}
                  {new Date(item.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                </Text>
              </View>
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
    row: {
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.separator,
    },
    rowTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    target: {
      flex: 1,
      fontFamily: fonts.bold,
      fontSize: 16,
      color: colors.text,
      marginRight: 8,
    },
    status: {
      fontFamily: fonts.medium,
      fontSize: 12,
      color: colors.subtext,
      backgroundColor: colors.inputBg,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      overflow: "hidden",
    },
    preview: {
      fontFamily: fonts.regular,
      fontSize: 14,
      lineHeight: 19,
      color: colors.subtext,
      marginTop: 4,
    },
    meta: {
      fontFamily: fonts.regular,
      fontSize: 13,
      color: colors.mutedText,
      marginTop: 6,
    },
    emptyContainer: {
      flexGrow: 1,
      justifyContent: "center",
    },
    empty: {
      fontFamily: fonts.regular,
      fontSize: 15,
      lineHeight: 21,
      color: colors.subtext,
      textAlign: "center",
      paddingHorizontal: 32,
    },
  });
}
