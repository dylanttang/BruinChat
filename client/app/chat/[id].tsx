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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MessageBubble from "../components/messageBubble";
import { apiFetch, getDevUserId } from "../lib/api";
import { useTheme, Colors } from "../context/ThemeContext";

type Message = {
  _id: string;
  text: string;
  createdAt: string;
  senderId: { _id: string; displayName: string; avatarUrl: string };
  replyTo?: { _id: string; text: string; senderId: { displayName: string } } | null;
};

type DateSeparator = { _id: string; type: "date"; label: string };
type ListItem = Message | DateSeparator;

function formatDateLabel(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (isToday) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();
  if (isYesterday) return "Yesterday";
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

function injectDateSeparators(messages: Message[]): ListItem[] {
  // messages are newest-first (inverted list), so iterate and inject separators
  const result: ListItem[] = [];
  for (let i = 0; i < messages.length; i++) {
    result.push(messages[i]);
    const curr = new Date(messages[i].createdAt);
    const next = messages[i + 1] ? new Date(messages[i + 1].createdAt) : null;
    const isDifferentDay =
      !next ||
      curr.getFullYear() !== next.getFullYear() ||
      curr.getMonth() !== next.getMonth() ||
      curr.getDate() !== next.getDate();
    if (isDifferentDay) {
      result.push({ _id: `sep-${messages[i]._id}`, type: "date", label: formatDateLabel(messages[i].createdAt) });
    }
  }
  return result;
}

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
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const listRef = useRef<FlatList>(null);

  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [chat, setChat] = useState<Chat | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);

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
        body: JSON.stringify({ text, ...(replyingTo ? { replyTo: replyingTo._id } : {}) }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMessages((prev) => [data.message, ...prev]);
      setMessage("");
      setReplyingTo(null);
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
          <ActivityIndicator color={colors.mutedText} />
        </View>
      ) : messages.length === 0 ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 32 }}>
          <Text style={{ color: colors.subtext, textAlign: "center" }}>
            No messages yet. Say hi!
          </Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={injectDateSeparators(messages)}
          inverted
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            if ("type" in item && item.type === "date") {
              return (
                <View style={styles.dateSeparator}>
                  <Text style={styles.dateSeparatorText}>{item.label}</Text>
                </View>
              );
            }
            const msg = item as Message;
            return (
              <MessageBubble
                item={{
                  id: msg._id,
                  user: msg.senderId.displayName,
                  text: msg.text,
                  time: formatTime(msg.createdAt),
                  mine: currentUserId === msg.senderId._id,
                  replyTo: msg.replyTo ?? null,
                }}
                onLongPress={() => setReplyingTo(msg)}
              />
            );
          }}
        />
      )}

      {/* INPUT BAR */}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {replyingTo && (
          <View style={styles.replyBar}>
            <View style={styles.replyBarContent}>
              <Text style={styles.replyBarName}>{replyingTo.senderId.displayName}</Text>
              <Text style={styles.replyBarText} numberOfLines={1}>{replyingTo.text}</Text>
            </View>
            <TouchableOpacity onPress={() => setReplyingTo(null)} style={styles.replyBarClose}>
              <Text style={{ fontSize: 18, color: colors.mutedText }}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.inputBar}>
          <TouchableOpacity style={styles.plusBtn}>
            <Text style={{ fontSize: 22, color: colors.text }}>＋</Text>
          </TouchableOpacity>

          <TextInput
            placeholder="Type a message..."
            placeholderTextColor={colors.mutedText}
            style={styles.input}
            value={message}
            onChangeText={setMessage}
            onSubmitEditing={sendMessage}
            editable={!sending}
          />

          <TouchableOpacity style={styles.sendBtn} onPress={sendMessage} disabled={sending || !message.trim()}>
            <Text style={{ fontSize: 18, color: colors.text, opacity: sending || !message.trim() ? 0.3 : 1 }}>➤</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
      borderColor: colors.border,
    },
    back: {
      fontSize: 22,
      color: colors.text,
    },
    title: {
      fontSize: 18,
      fontWeight: "600",
      flex: 1,
      textAlign: "center",
      paddingHorizontal: 12,
      color: colors.text,
    },
    menuDot: {
      fontSize: 16,
      color: colors.subtext,
      letterSpacing: 2,
    },
    list: {
      padding: 12,
    },
    inputBar: {
      flexDirection: "row",
      alignItems: "center",
      padding: 10,
      borderTopWidth: 1,
      borderColor: colors.border,
    },
    input: {
      flex: 1,
      backgroundColor: colors.inputBg,
      borderRadius: 22,
      paddingHorizontal: 16,
      height: 44,
      marginHorizontal: 8,
      color: colors.text,
    },
    plusBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.inputBg,
      alignItems: "center",
      justifyContent: "center",
    },
    sendBtn: {
      paddingHorizontal: 6,
    },
    dateSeparator: {
      alignItems: "center",
      marginVertical: 12,
    },
    dateSeparatorText: {
      fontSize: 12,
      color: colors.mutedText,
    },
    replyBar: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderTopWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    replyBarContent: {
      flex: 1,
    },
    replyBarName: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.text,
    },
    replyBarText: {
      fontSize: 12,
      color: colors.subtext,
    },
    replyBarClose: {
      paddingLeft: 12,
    },
  });
}
