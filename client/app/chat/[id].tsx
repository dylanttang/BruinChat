import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import MessageBubble from "../components/messageBubble";
import { apiFetch, getDevUserId } from "../lib/api";

type Message = {
  _id: string;
  text: string;
  createdAt: string;
  senderId: { _id: string; displayName: string; avatarUrl: string };
};

type Chat = {
  _id: string;
  name: string;
  members: { _id: string; displayName: string }[];
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const listRef = useRef<FlatList>(null);

  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [chat, setChat] = useState<Chat | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [userId, chatRes, msgsRes] = await Promise.all([
        getDevUserId(),
        apiFetch(`/api/chats/${id}`),
        apiFetch(`/api/chats/${id}/messages`),
      ]);
      setCurrentUserId(userId);

      if (chatRes.ok) {
        const data = await chatRes.json();
        setChat(data.chat);
      }
      if (msgsRes.ok) {
        const data = await msgsRes.json();
        setMessages(data.messages);
      }
    } catch (err) {
      console.error("Failed to load chat:", err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const sendMessage = async () => {
    const text = message.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const res = await apiFetch(`/api/chats/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // Prepend because FlatList is inverted
      setMessages((prev) => [data.message, ...prev]);
      setMessage("");
    } catch (err) {
      console.error("Failed to send:", err);
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>

        <Text style={styles.title} numberOfLines={1}>
          {chat?.name ?? "Loading..."}
        </Text>

        <TouchableOpacity onPress={() => router.push(`/chat/${id}/info`)}>
          <Text style={styles.menuDot}>•••</Text>
        </TouchableOpacity>
      </View>

      {/* MESSAGES */}
      {loading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color="#888" />
        </View>
      ) : messages.length === 0 ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 32 }}>
          <Text style={{ color: "#888", textAlign: "center" }}>
            No messages yet. Say hi!
          </Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          inverted
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <MessageBubble
              item={{
                id: item._id,
                user: item.senderId.displayName,
                text: item.text,
                time: formatTime(item.createdAt),
                mine: currentUserId === item.senderId._id,
              }}
            />
          )}
        />
      )}

      {/* INPUT BAR */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.inputBar}>
          <TouchableOpacity style={styles.plusBtn}>
            <Text style={{ fontSize: 22 }}>＋</Text>
          </TouchableOpacity>

          <TextInput
            placeholder="Type a message..."
            style={styles.input}
            value={message}
            onChangeText={setMessage}
            onSubmitEditing={sendMessage}
            editable={!sending}
          />

          <TouchableOpacity style={styles.sendBtn} onPress={sendMessage} disabled={sending || !message.trim()}>
            <Text style={{ fontSize: 18, opacity: sending || !message.trim() ? 0.3 : 1 }}>➤</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },

  /* HEADER */
  header: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderColor: "#eee",
  },

  back: {
    fontSize: 22,
  },

  title: {
    fontSize: 18,
    fontWeight: "600",
    flex: 1,
    textAlign: "center",
    paddingHorizontal: 12,
  },

  menuDot: {
    fontSize: 16,
    color: "#555",
    letterSpacing: 2,
  },

  /* LIST */
  list: {
    padding: 12,
  },

  /* INPUT BAR */
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderTopWidth: 1,
    borderColor: "#eee",
  },

  input: {
    flex: 1,
    backgroundColor: "#f2f2f2",
    borderRadius: 22,
    paddingHorizontal: 16,
    height: 44,
    marginHorizontal: 8,
  },

  plusBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#eee",
    alignItems: "center",
    justifyContent: "center",
  },

  sendBtn: {
    paddingHorizontal: 6,
  },
});
