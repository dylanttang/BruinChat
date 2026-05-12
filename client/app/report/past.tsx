import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMemo, useEffect, useState, useCallback } from "react";
import { useRouter } from "expo-router";
import { useTheme, Colors } from "../context/ThemeContext";
import { getLocalReports, type LocalReport } from "../lib/localReports";

export default function PastReports() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [reports, setReports] = useState<LocalReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "initial") setLoading(true);
    if (mode === "refresh") setRefreshing(true);
    try {
      const list = await getLocalReports();
      setReports(list);
    } finally {
      if (mode === "initial") setLoading(false);
      if (mode === "refresh") setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load("initial");
  }, [load]);

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Past reports</Text>
        <View style={{ width: 32 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.subtext} />
        </View>
      ) : reports.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>No reports yet</Text>
          <Text style={styles.emptySub}>
            When you submit a report from Report a user, it will show up here on this device.
          </Text>
        </View>
      ) : (
        <FlatList
          data={reports}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshing={refreshing}
          onRefresh={() => load("refresh")}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.label}>Name</Text>
                <Text style={styles.value} numberOfLines={2}>
                  {item.reportedName}
                </Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Email</Text>
                <Text style={styles.value} numberOfLines={2}>
                  {item.reportedEmail}
                </Text>
              </View>
              <View style={[styles.row, !item.note && styles.lastRow]}>
                <Text style={styles.label}>Date</Text>
                <Text style={styles.valueMuted}>{formatDate(item.submittedAt)}</Text>
              </View>
              {item.note ? (
                <View style={[styles.noteBlock, styles.lastRow]}>
                  <Text style={styles.noteLabel}>Note</Text>
                  <Text style={styles.noteText}>{item.note}</Text>
                </View>
              ) : null}
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    header: {
      height: 56,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    back: { fontSize: 22, color: colors.text },
    title: { fontSize: 18, fontWeight: "600", color: colors.text },
    centered: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 28,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: "600",
      color: colors.text,
      marginBottom: 8,
    },
    emptySub: {
      fontSize: 14,
      color: colors.subtext,
      textAlign: "center",
      lineHeight: 20,
    },
    list: { padding: 20, paddingBottom: 32, gap: 14 },
    card: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      overflow: "hidden",
    },
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.separator,
      gap: 12,
    },
    lastRow: {
      borderBottomWidth: 0,
    },
    label: {
      fontSize: 14,
      fontWeight: "500",
      color: colors.subtext,
      width: 72,
      flexShrink: 0,
    },
    value: {
      flex: 1,
      fontSize: 16,
      color: colors.text,
      textAlign: "right",
    },
    valueMuted: {
      flex: 1,
      fontSize: 14,
      color: colors.subtext,
      textAlign: "right",
    },
    noteBlock: {
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    noteLabel: {
      fontSize: 14,
      fontWeight: "500",
      color: colors.subtext,
      marginBottom: 6,
    },
    noteText: {
      fontSize: 15,
      color: colors.text,
      lineHeight: 22,
    },
  });
}
