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
  Alert,
  Image,
  ScrollView,
} from "react-native";
import * as VideoThumbnails from "expo-video-thumbnails";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import * as ImagePicker from "expo-image-picker";
import MessageBubble from "./MessageBubble";
import { apiFetch } from "../../lib/api";
import { useTheme, fonts, Colors } from "../../context/ThemeContext";
import { uploadToCloudinary } from "../../lib/cloudinary";
import { createSocket } from "../../lib/socket";
import { ReportTarget, setUserBlocked } from "../../lib/moderation";
import UserProfileSheet, { ProfileUser } from "../../components/UserProfileSheet";
import ReportModal from "../../components/ReportModal";

const REACTION_OPTIONS = ["👍", "❤️", "😂", "🎉", "👀"];
const TYPING_IDLE_MS = 1800;
const TYPING_EVENT_TTL_MS = 3000;

type Reaction = {
  _id?: string;
  emoji: string;
  userId: string | { _id: string; displayName?: string };
  createdAt?: string;
};

type Message = {
  _id: string;
  text: string;
  mediaUrl?: string | null;
  mediaUrls?: string[];
  mediaTypes?: ("image" | "video")[];
  createdAt: string;
  senderId: { _id: string; displayName: string; avatarUrl: string };
  replyTo?: ReplyMessage | null;
  threadRootId?: string | null;
  replyCount?: number;
  deletedAt?: string | null;
  reactions?: Reaction[];
};

type ReplyMessage = {
  _id: string;
  text: string;
  mediaUrl?: string | null;
  mediaUrls?: string[];
  mediaTypes?: ("image" | "video")[];
  senderId: { displayName: string };
};

type PendingMedia = {
  uri: string;
  type: "image" | "video";
  fileName?: string | null;
  mimeType?: string;
  fileSize?: number;
};

function PendingVideoThumbnail({ uri, style }: { uri: string; style: any }) {
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    VideoThumbnails.getThumbnailAsync(uri, { time: 0 })
      .then(({ uri: generatedUri }) => {
        if (mounted) setThumbnailUri(generatedUri);
      })
      .catch(() => {
        if (mounted) setThumbnailUri(null);
      });

    return () => {
      mounted = false;
    };
  }, [uri]);

  return thumbnailUri ? (
    <Image source={{ uri: thumbnailUri }} style={style} />
  ) : (
    <View style={[style, { backgroundColor: "#1f1f24" }]} />
  );
}

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

function getReplySummary(message: ReplyMessage | Message): string {
  const text = message.text?.trim();
  if (text) return text;

  const mediaTypes = message.mediaTypes || [];
  const mediaCount = message.mediaUrls?.length || (message.mediaUrl ? 1 : 0);
  const firstType = mediaTypes[0] || (message.mediaUrl ? "image" : null);
  const label = firstType === "video" ? "Video" : firstType === "image" ? "Photo" : "Media";

  return mediaCount > 1 ? `[${mediaCount} ${label}s]` : `[${label}]`;
}

function getReactionUserId(reaction: Reaction): string {
  return typeof reaction.userId === "string" ? reaction.userId : reaction.userId._id;
}

function groupReactions(reactions: Reaction[] = [], currentUserId: string | null) {
  const grouped = new Map<
    string,
    { emoji: string; count: number; reactedByMe: boolean; names: string[] }
  >();

  reactions.forEach((reaction) => {
    const existing = grouped.get(reaction.emoji) ?? {
      emoji: reaction.emoji,
      count: 0,
      reactedByMe: false,
      names: [],
    };

    const isMine = getReactionUserId(reaction) === currentUserId;
    existing.count += 1;
    existing.reactedByMe = existing.reactedByMe || isMine;
    // Names for the "who reacted" sheet; "You" goes first.
    if (isMine) {
      existing.names.unshift("You");
    } else {
      const name = typeof reaction.userId === "string" ? undefined : reaction.userId.displayName;
      existing.names.push(name || "Someone");
    }
    grouped.set(reaction.emoji, existing);
  });

  return Array.from(grouped.values());
}

function upsertMessage(messages: Message[], incoming: Message): Message[] {
  const existing = messages.some((message) => message._id === incoming._id);
  if (existing) {
    return messages.map((message) => (message._id === incoming._id ? { ...message, ...incoming } : message));
  }
  return [incoming, ...messages];
}

function replaceMessage(messages: Message[], incoming: Message): Message[] {
  return messages.map((message) => (message._id === incoming._id ? { ...message, ...incoming } : message));
}

export default function ConversationScreen({ chatId: id, threadId }: { chatId: string; threadId?: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const inputRef = useRef<TextInput>(null);
  const listRef = useRef<FlatList>(null);
  const socketRef = useRef<Socket | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingStartedRef = useRef(false);
  const remoteTypingTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [chat, setChat] = useState<Chat | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [root, setRoot] = useState<Message | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [actionTarget, setActionTarget] = useState<Message | null>(null);
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const [pendingMedia, setPendingMedia] = useState<PendingMedia[]>([]);
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  // Socket handlers are registered once, so they read the latest block list
  // through a ref instead of closing over stale state.
  const blockedIdsRef = useRef<Set<string>>(new Set());
  blockedIdsRef.current = blockedIds;
  const [profileUser, setProfileUser] = useState<ProfileUser | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [mutedUntil, setMutedUntil] = useState<Date | null>(null);
  const isMuted = !!mutedUntil && mutedUntil > new Date();

  const messagesUrl = `/api/chats/${id}/messages${threadId ? `?thread=${threadId}` : ""}`;
  const loadData = useCallback(async () => {
    try {
      const [meRes, chatRes, msgsRes] = await Promise.all([
        apiFetch("/api/users/me"),
        apiFetch(`/api/chats/${id}`),
        apiFetch(messagesUrl),
      ]);

      if (!meRes.ok || !chatRes.ok || !msgsRes.ok) throw new Error("Unable to load conversation");
      setError(null);
      if (meRes.ok) {
        const data = await meRes.json();
        setCurrentUserId(data.user._id);
        setBlockedIds(new Set((data.user.blockedUsers ?? []).map(String)));
        setMutedUntil(data.user.mutedUntil ? new Date(data.user.mutedUntil) : null);
      }

      if (chatRes.ok) {
        const data = await chatRes.json();
        setChat(data.chat);
      }
      if (msgsRes.ok) {
        const data = await msgsRes.json();
        setMessages(data.messages);
        setRoot(data.root ?? null);
        setHasMore(data.hasMore);
      }
    } catch (err) {
      setError("Could not load this conversation. Tap to retry.");
      console.error("Failed to load chat:", err);
    } finally {
      setLoading(false);
    }
  }, [id, messagesUrl]);

  useFocusEffect(useCallback(() => {
    loadData();
  }, [loadData]));

  const clearRemoteTypingUser = useCallback((userId: string) => {
    const timer = remoteTypingTimersRef.current[userId];
    if (timer) {
      clearTimeout(timer);
      delete remoteTypingTimersRef.current[userId];
    }

    setTypingUserIds((prev) => prev.filter((id) => id !== userId));
  }, []);

  const stopTyping = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    if (typingStartedRef.current) {
      socketRef.current?.emit("typing", { chatId: id, threadId, isTyping: false });
      typingStartedRef.current = false;
    }
  }, [id, threadId]);

  const handleMessageChange = useCallback((text: string) => {
    setMessage(text);

    if (!text.trim()) {
      stopTyping();
      return;
    }

    if (!typingStartedRef.current) {
      socketRef.current?.emit("typing", { chatId: id, threadId, isTyping: true });
      typingStartedRef.current = true;
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(stopTyping, TYPING_IDLE_MS);
  }, [id, threadId, stopTyping]);

  useEffect(() => {
    if (!id || !currentUserId) return;

    let isActive = true;
    setTypingUserIds([]);

    createSocket().then((socket) => {
      if (!isActive) {
        socket.disconnect();
        return;
      }

      socketRef.current = socket;

      const joinChat = () => socket.emit("joinChat", id);
      socket.on("connect", joinChat);
      if (socket.connected) joinChat();

      socket.on("newMessage", (incoming: Message) => {
        if (blockedIdsRef.current.has(incoming.senderId?._id)) return;
        const parent = incoming.threadRootId;
        if (threadId ? parent === threadId : !parent) setMessages((prev) => upsertMessage(prev, incoming));
        if (incoming.senderId?._id) clearRemoteTypingUser(incoming.senderId._id);
      });

      socket.on("threadUpdated", ({ rootId, senderId }: { rootId: string; senderId: string }) => {
        if (blockedIdsRef.current.has(senderId)) return;
        setMessages(prev => prev.map(item => item._id === rootId ? { ...item, replyCount: (item.replyCount || 0) + 1 } : item));
      });
      socket.on("messageEdited", (incoming: Message) => {
        setMessages((prev) => replaceMessage(prev, incoming));
        setRoot(prev => prev?._id === incoming._id ? incoming : prev);
      });

      socket.on("messageDeleted", (incoming: Message) => {
        setMessages((prev) => replaceMessage(prev, incoming));
        setRoot(prev => prev?._id === incoming._id ? incoming : prev);
      });

      socket.on("messageReacted", (incoming: Message) => {
        setMessages((prev) => replaceMessage(prev, incoming));
        setRoot(prev => prev?._id === incoming._id ? incoming : prev);
      });

      socket.on("typing", ({ chatId, userId, isTyping, threadId: incomingThread }) => {
        if ((incomingThread || undefined) !== threadId) return;
        if (chatId !== id || !userId || userId === currentUserId) return;
        if (blockedIdsRef.current.has(userId)) return;

        if (!isTyping) {
          clearRemoteTypingUser(userId);
          return;
        }

        setTypingUserIds((prev) => (
          prev.includes(userId) ? prev : [...prev, userId]
        ));

        const existingTimer = remoteTypingTimersRef.current[userId];
        if (existingTimer) clearTimeout(existingTimer);
        remoteTypingTimersRef.current[userId] = setTimeout(
          () => clearRemoteTypingUser(userId),
          TYPING_EVENT_TTL_MS
        );
      });
    });

    return () => {
      isActive = false;
      stopTyping();
      Object.values(remoteTypingTimersRef.current).forEach(clearTimeout);
      remoteTypingTimersRef.current = {};

      const socket = socketRef.current;
      if (socket) {
        socket.emit("leaveChat", id);
        socket.disconnect();
        socketRef.current = null;
      }
    };
  }, [clearRemoteTypingUser, currentUserId, id, stopTyping, threadId, loadData]);

  const reactToMessage = useCallback(async (messageId: string, emoji: string) => {
    try {
      const res = await apiFetch(`/api/chats/${id}/messages/${messageId}/react`, {
        method: "POST",
        body: JSON.stringify({ emoji }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      setMessages((prev) => replaceMessage(prev, data.message));
      setRoot(prev => prev?._id === data.message._id ? data.message : prev);
    } catch (err) {
      console.error("Failed to react:", err);
    }
  }, [id]);

  const handleBlockedChange = (userId: string, blocked: boolean) => {
    setBlockedIds((prev) => {
      const next = new Set(prev);
      if (blocked) next.add(userId);
      else next.delete(userId);
      return next;
    });
  };

  const blockUser = (target: Message) => {
    const { _id: userId, displayName } = target.senderId;
    Alert.alert(
      `Block ${displayName}?`,
      "You won't see their messages or get notifications from them. They won't be told. You can unblock them in Settings.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: async () => {
            try {
              await setUserBlocked(userId, true);
              handleBlockedChange(userId, true);
            } catch (err) {
              console.error("Failed to block:", err);
              Alert.alert("Couldn't block user", "Please try again.");
            }
          },
        },
      ]
    );
  };

  const visibleMessages = useMemo(
    () => messages.filter((msg) => !blockedIds.has(msg.senderId?._id)),
    [messages, blockedIds]
  );

  const typingLabel = useMemo(() => {
    const names = typingUserIds.map((userId) => (
      chat?.members.find((member) => member._id === userId)?.displayName ?? "Someone"
    ));

    if (names.length === 0) return "";
    if (names.length === 1) return `${names[0]} is typing...`;
    if (names.length === 2) return `${names[0]} and ${names[1]} are typing...`;
    return `${names[0]} and ${names.length - 1} others are typing...`;
  }, [chat?.members, typingUserIds]);

  const sendMessage = async () => {
    if (error || (threadId && root?.deletedAt)) return;
    const text = message.trim();
    if ((!text && pendingMedia.length === 0) || sending) {
      if (!text) stopTyping();
      return;
    }
    setSending(true);
    try {
      const mediaUrls = [];
      for (const item of pendingMedia) {
        mediaUrls.push(await uploadToCloudinary(item.uri, "messages", item));
      }
      const response = await apiFetch(`/api/chats/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({ text, mediaUrls, mediaTypes: pendingMedia.map(item => item.type), ...(threadId ? { threadRootId: threadId } : {}) }),
      });
      const data = await response.json();
      if (!response.ok) throw Object.assign(new Error(data.error || `HTTP ${response.status}`), data);
      setMessages(prev => upsertMessage(prev, data.message));
      setMessage("");
      setPendingMedia([]);
      stopTyping();
    } catch (err: any) {
      console.error("Failed to send:", err);
      if (err?.code === "MUTED") {
        setMutedUntil(new Date(err.mutedUntil));
      } else if (err?.code === "BANNED") {
        router.replace("/banned");
      } else if (err?.code === "TERMS_REQUIRED") {
        router.replace("/auth/terms");
      } else {
        Alert.alert("Failed to send", "Please try again.");
      }
    } finally {
      setSending(false);
    }
  };

  const addPickedMedia = (assets: ImagePicker.ImagePickerAsset[]) => {
    const validMedia: PendingMedia[] = assets.flatMap((asset) => {
      const mediaType = asset.type === "video" ? "video" : asset.type === "image" ? "image" : null;
      if (!mediaType) return [];
      if (asset.fileSize && asset.fileSize > 10 * 1024 * 1024) {
        Alert.alert("File too large", "Images and videos must be 10MB or smaller.");
        return [];
      }
      return [{
        uri: asset.uri,
        type: mediaType,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        fileSize: asset.fileSize,
      }];
    });

    setPendingMedia((prev) => [...prev, ...validMedia].slice(0, 10));
  };

  const pickFromLibrary = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Allow photo library access to send photos.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      allowsMultipleSelection: true,
      selectionLimit: 10,
      orderedSelection: true,
      quality: 0.85,
    });

    if (!result.canceled) addPickedMedia(result.assets);
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Allow camera access to take photos.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images", "videos"],
      quality: 0.85,
    });

    if (!result.canceled) addPickedMedia(result.assets);
  };

  const openPhotoOptions = () => {
    Alert.alert("Add media", undefined, [
      { text: "Photo & Video Library", onPress: pickFromLibrary },
      { text: "Camera", onPress: takePhoto },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>

        <Text style={styles.title} numberOfLines={1}>
          {threadId ? "Thread" : chat?.name ?? "Loading..."}
        </Text>

        <TouchableOpacity accessibilityLabel="Conversation info" onPress={() => router.push(`/chat/${id}/info`)}>
          <Text style={styles.menuDot}>•••</Text>
        </TouchableOpacity>
      </View>

      {threadId && root && !blockedIds.has(root.senderId?._id) && <View style={{ maxHeight: 240, borderBottomWidth: 1, borderColor: colors.border }}>
        <ScrollView><MessageBubble item={{ id: root._id, user: root.senderId?.displayName ?? "Deleted user", avatarUrl: root.senderId?.avatarUrl, text: root.deletedAt ? "Message deleted" : root.text, mediaUrl: root.mediaUrl, mediaUrls: root.mediaUrls, mediaTypes: root.mediaTypes, time: formatTime(root.createdAt), mine: currentUserId === root.senderId?._id, reactions: groupReactions(root.reactions, currentUserId) }} onReact={emoji => reactToMessage(root._id, emoji)} onPressUser={() => setProfileUser(root.senderId)} /></ScrollView>
      </View>}
      {error && <TouchableOpacity onPress={loadData}><Text style={{ color: colors.text, padding: 16 }}>{error}</Text></TouchableOpacity>}
      {/* MESSAGES */}
      {loading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={colors.mutedText} />
        </View>
      ) : visibleMessages.length === 0 ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 32 }}>
          <Text style={styles.emptyText}>
            No messages yet. Say hi!
          </Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          onEndReached={async () => {
            if (!hasMore || loadingMore || !messages.length) return;
            setLoadingMore(true);
            try {
              const response = await apiFetch(`${messagesUrl}${threadId ? "&" : "?"}before=${messages[messages.length - 1]._id}`);
              if (!response.ok) throw new Error("Unable to load older messages");
              const data = await response.json();
              setMessages(prev => [...prev, ...data.messages.filter((m: Message) => !prev.some(existing => existing._id === m._id))]);
              setHasMore(data.hasMore);
            } catch { setError("Could not load older messages. Try again."); }
            finally { setLoadingMore(false); }
          }}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.mutedText} /> : null}
          data={injectDateSeparators(visibleMessages)}
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
                  avatarUrl: msg.senderId.avatarUrl,
                  text: msg.deletedAt ? "Message deleted" : msg.text,
                  mediaUrl: msg.mediaUrl ?? null,
                  mediaUrls: msg.mediaUrls,
                  mediaTypes: msg.mediaTypes,
                  time: formatTime(msg.createdAt),
                  mine: currentUserId === msg.senderId._id,
                  replyTo: msg.replyTo ?? null,
                  reactions: groupReactions(msg.reactions, currentUserId),
                }}
                onOpenThread={!threadId && (!msg.deletedAt || !!msg.replyCount) ? () => router.push(`/chat/${id}/thread/${msg._id}`) : undefined}
                replyCount={msg.replyCount ?? 0}
                onLongPress={() => setActionTarget(msg)}
                onReact={(emoji) => reactToMessage(msg._id, emoji)}
                onPressUser={() => setProfileUser(msg.senderId)}
              />
            );
          }}
        />
      )}

      {/* INPUT BAR */}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {actionTarget && (
          <View style={styles.actionBar}>
            <View style={styles.actionTopRow}>
              <View style={styles.actionEmojiRow}>
                {REACTION_OPTIONS.map((emoji) => (
                  <TouchableOpacity
                    key={emoji}
                    style={styles.actionEmojiButton}
                    onPress={() => {
                      reactToMessage(actionTarget._id, emoji);
                      setActionTarget(null);
                    }}
                  >
                    <Text style={styles.actionEmoji}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={styles.actionCloseButton} onPress={() => setActionTarget(null)}>
                <Text style={styles.actionCloseText}>×</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.actionButtonsRow}>
              <TouchableOpacity
                style={styles.actionReplyButton}
                onPress={() => {
                  if (threadId) inputRef.current?.focus();
                  else router.push(`/chat/${id}/thread/${actionTarget._id}`);
                  setActionTarget(null);
                }}
              >
                <Text style={styles.actionReplyText}>{threadId ? "Reply to thread" : "Reply in thread"}</Text>
              </TouchableOpacity>
              {actionTarget.senderId._id !== currentUserId && (
                <>
                  <TouchableOpacity
                    style={styles.actionReplyButton}
                    onPress={() => {
                      setReportTarget({ type: "message", id: actionTarget._id, name: actionTarget.senderId.displayName });
                      setActionTarget(null);
                    }}
                  >
                    <Text style={[styles.actionReplyText, { color: colors.danger }]}>Report</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionReplyButton}
                    onPress={() => {
                      const target = actionTarget;
                      setActionTarget(null);
                      blockUser(target);
                    }}
                  >
                    <Text style={[styles.actionReplyText, { color: colors.danger }]}>Block</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        )}
        {!!typingLabel && (
          <View style={styles.typingBar}>
            <Text style={styles.typingText}>{typingLabel}</Text>
          </View>
        )}
        {pendingMedia.length > 0 && (
          <View style={styles.photoPreviewBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoPreviewList}>
              {pendingMedia.map((item, index) => (
                <View key={`${item.uri}-${index}`} style={styles.photoPreviewItem}>
                  {item.type === "video" ? (
                    <PendingVideoThumbnail uri={item.uri} style={styles.photoPreviewImage} />
                  ) : (
                    <Image source={{ uri: item.uri }} style={styles.photoPreviewImage} />
                  )}
                  {item.type === "video" && (
                    <View style={styles.videoPreviewBadge}>
                      <Text style={styles.videoPreviewBadgeText}>▶</Text>
                    </View>
                  )}
                  <TouchableOpacity
                    style={styles.removePhotoBtn}
                    onPress={() => setPendingMedia((prev) => prev.filter((_, mediaIndex) => mediaIndex !== index))}
                  >
                    <Text style={styles.removePhotoText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        )}
        {isMuted ? (
          <View style={styles.mutedBar}>
            <Text style={styles.mutedTitle}>You're muted</Text>
            <Text style={styles.mutedText}>
              You can read this chat but can't post until{" "}
              {mutedUntil!.toLocaleDateString([], { month: "short", day: "numeric" })} at{" "}
              {mutedUntil!.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.
            </Text>
          </View>
        ) : (
          <View style={styles.inputBar}>
            <TouchableOpacity style={styles.plusBtn} onPress={openPhotoOptions} disabled={sending}>
              <Text style={styles.plusText}>＋</Text>
            </TouchableOpacity>

            <TextInput
            ref={inputRef}
              placeholder="Type a message..."
              placeholderTextColor={colors.mutedText}
              style={styles.input}
              value={message}
              maxLength={4000}
              onChangeText={handleMessageChange}
              onSubmitEditing={sendMessage}
              editable={!sending && !error && !(threadId && !!root?.deletedAt)}
            />

            <TouchableOpacity
              style={[styles.sendBtn, (sending || (!message.trim() && pendingMedia.length === 0)) && styles.sendBtnDisabled]}
              onPress={sendMessage}
              disabled={sending || (!message.trim() && pendingMedia.length === 0)}
              accessibilityLabel="Send message"
            >
              <Text style={styles.sendText}>➤</Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>

      <UserProfileSheet
        user={profileUser}
        isBlocked={!!profileUser && blockedIds.has(profileUser._id)}
        onClose={() => setProfileUser(null)}
        onBlockedChange={handleBlockedChange}
      />
      <ReportModal target={reportTarget} onClose={() => setReportTarget(null)} />
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
      backgroundColor: colors.card,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderColor: colors.border,
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
    menuDot: {
      fontFamily: fonts.regular,
      fontSize: 16,
      color: colors.brand,
      letterSpacing: 2,
    },
    list: {
      padding: 12,
    },
    inputBar: {
      backgroundColor: colors.card,
      flexDirection: "row",
      alignItems: "center",
      padding: 10,
      borderTopWidth: 1,
      borderColor: colors.border,
    },
    input: {
      fontFamily: fonts.regular,
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
      backgroundColor: colors.brandSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    plusText: {
      fontSize: 22,
      color: colors.brand,
    },
    sendBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    sendBtnDisabled: {
      opacity: 0.35,
    },
    sendText: {
      fontSize: 16,
      color: colors.onPrimary,
      marginLeft: 2,
    },
    mutedBar: {
      padding: 16,
      borderTopWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.brandSoft,
    },
    mutedTitle: {
      fontFamily: fonts.bold,
      fontSize: 15,
      color: colors.brand,
    },
    mutedText: {
      fontFamily: fonts.regular,
      fontSize: 13,
      lineHeight: 18,
      color: colors.subtext,
      marginTop: 2,
    },
    emptyText: {
      fontFamily: fonts.regular,
      color: colors.subtext,
      textAlign: "center",
    },
    photoPreviewBar: {
      borderTopWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      paddingVertical: 8,
    },
    photoPreviewList: {
      paddingHorizontal: 12,
      gap: 8,
    },
    photoPreviewItem: {
      width: 72,
      height: 72,
      borderRadius: 12,
      overflow: "hidden",
      backgroundColor: colors.inputBg,
    },
    photoPreviewImage: {
      width: "100%",
      height: "100%",
    },
    videoPreviewBadge: {
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      alignItems: "center",
      justifyContent: "center",
    },
    videoPreviewBadgeText: {
      color: "white",
      fontSize: 18,
      fontFamily: fonts.bold,
      textShadowColor: "rgba(0,0,0,0.6)",
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 4,
    },
    removePhotoBtn: {
      position: "absolute",
      top: 4,
      right: 4,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: "rgba(0,0,0,0.6)",
      alignItems: "center",
      justifyContent: "center",
    },
    removePhotoText: {
      color: "white",
      fontSize: 12,
      fontFamily: fonts.bold,
    },
    dateSeparator: {
      alignItems: "center",
      marginVertical: 12,
    },
    dateSeparatorText: {
      fontFamily: fonts.regular,
      fontSize: 12,
      color: colors.mutedText,
    },
    actionBar: {
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderTopWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    actionTopRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    actionButtonsRow: {
      flexDirection: "row",
      gap: 8,
    },
    actionEmojiRow: {
      flexDirection: "row",
      flex: 1,
    },
    actionEmojiButton: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.inputBg,
      marginRight: 4,
    },
    actionEmoji: {
      fontFamily: fonts.regular,
      fontSize: 16,
    },
    actionReplyButton: {
      flex: 1,
      minHeight: 34,
      paddingHorizontal: 10,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.inputBg,
    },
    actionReplyText: {
      fontSize: 13,
      fontFamily: fonts.medium,
      color: colors.text,
    },
    actionCloseButton: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
      marginLeft: 6,
    },
    actionCloseText: {
      fontFamily: fonts.regular,
      fontSize: 20,
      color: colors.mutedText,
    },
    typingBar: {
      paddingHorizontal: 16,
      paddingVertical: 6,
      borderTopWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    typingText: {
      fontFamily: fonts.regular,
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
      fontFamily: fonts.medium,
      color: colors.text,
    },
    replyBarText: {
      fontFamily: fonts.regular,
      fontSize: 12,
      color: colors.subtext,
    },
    replyBarClose: {
      paddingLeft: 12,
    },
  });
}
