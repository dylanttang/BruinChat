import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { apiFetch } from "../../../lib/api";
import { requestMessageJump } from "../../../lib/messageJump";
import { useTheme, fonts, Colors } from "../../../context/ThemeContext";

type SearchMessage = {
  _id: string;
  text: string;
  createdAt: string;
  threadRootId?: string | null;
  senderId?: { _id: string; displayName?: string } | null;
};

function formatResultTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ChatSearch() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchMessage[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSearch = useCallback(async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setResults([]);
      setSearched(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch(
        `/api/chats/${id}/messages/search?q=${encodeURIComponent(trimmed)}`
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Search failed");
      }
      const data = await response.json();
      setResults(data.messages ?? []);
      setSearched(true);
    } catch (err) {
      setResults([]);
      setSearched(true);
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }, [id]);

  const openMessage = (message: SearchMessage) => {
    requestMessageJump(message._id);
    if (message.threadRootId) {
      router.push(`/chat/${id}/thread/${message.threadRootId}`);
      return;
    }
    // Back to the chat already underneath, instead of opening a second copy.
    router.dismissTo(`/chat/${id}`);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Back">
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Search messages</Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.searchBar}>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Search in this chat"
          placeholderTextColor={colors.mutedText}
          autoFocus
          returnKeyType="search"
          onSubmitEditing={() => runSearch(query)}
          clearButtonMode="while-editing"
        />
        <TouchableOpacity
          style={[styles.searchButton, !query.trim() && styles.searchButtonDisabled]}
          onPress={() => runSearch(query)}
          disabled={!query.trim() || loading}
        >
          <Text style={styles.searchButtonText}>Search</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.mutedText} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item._id}
          contentContainerStyle={results.length === 0 ? styles.centeredContent : styles.list}
          ListEmptyComponent={
            searched ? (
              <Text style={styles.emptyText}>No messages matched “{query.trim()}”.</Text>
            ) : (
              <Text style={styles.emptyText}>Search for a word or phrase in this chat.</Text>
            )
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.result} onPress={() => openMessage(item)}>
              <View style={styles.resultHeader}>
                <Text style={styles.sender} numberOfLines={1}>
                  {item.senderId?.displayName || "Unknown"}
                </Text>
                <Text style={styles.time}>{formatResultTime(item.createdAt)}</Text>
              </View>
              <Text style={styles.resultText} numberOfLines={3}>{item.text}</Text>
              {item.threadRootId ? <Text style={styles.threadTag}>In a thread</Text> : null}
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
      backgroundColor: colors.card,
    },
    back: {
      fontFamily: fonts.regular,
      fontSize: 22,
      color: colors.brand,
    },
    title: {
      fontSize: 18,
      fontFamily: fonts.medium,
      flex: 1,
      textAlign: "center",
      paddingHorizontal: 12,
      color: colors.text,
    },
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.card,
    },
    input: {
      flex: 1,
      fontFamily: fonts.regular,
      fontSize: 16,
      color: colors.text,
      backgroundColor: colors.inputBg,
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 10,
      minHeight: 40,
    },
    searchButton: {
      backgroundColor: colors.primary,
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    searchButtonDisabled: {
      opacity: 0.45,
    },
    searchButtonText: {
      fontFamily: fonts.medium,
      fontSize: 14,
      color: "#fff",
    },
    list: {
      padding: 16,
    },
    centered: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
    },
    centeredContent: {
      flexGrow: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
    },
    emptyText: {
      fontFamily: fonts.regular,
      fontSize: 15,
      color: colors.subtext,
      textAlign: "center",
    },
    errorText: {
      fontFamily: fonts.regular,
      fontSize: 15,
      color: colors.danger,
      textAlign: "center",
    },
    result: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      borderRadius: 14,
      padding: 12,
      marginBottom: 10,
    },
    resultHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 6,
      gap: 8,
    },
    sender: {
      flex: 1,
      fontFamily: fonts.medium,
      fontSize: 14,
      color: colors.text,
    },
    time: {
      fontFamily: fonts.regular,
      fontSize: 12,
      color: colors.mutedText,
    },
    resultText: {
      fontFamily: fonts.regular,
      fontSize: 15,
      color: colors.text,
      lineHeight: 21,
    },
    threadTag: {
      marginTop: 8,
      fontFamily: fonts.medium,
      fontSize: 12,
      color: colors.brand,
    },
  });
}
