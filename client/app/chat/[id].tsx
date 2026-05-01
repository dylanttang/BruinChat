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
import * as ImagePicker from "expo-image-picker";
import * as VideoThumbnails from "expo-video-thumbnails";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MessageBubble from "../components/messageBubble";
import { apiFetch, getDevUserId } from "../../lib/api";
import { useTheme, Colors } from "../../context/ThemeContext";

type Message = {
  _id: string;
  text: string;
  mediaUrl?: string;
  mediaUrls?: string[];
  mediaTypes?: ("image" | "video")[];
  createdAt: string;
  senderId: { _id: string; displayName: string; avatarUrl: string };
  replyTo?: ReplyMessage | null;
};

type ReplyMessage = {
  _id: string;
  text: string;
  mediaUrl?: string;
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
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [pendingMedia, setPendingMedia] = useState<PendingMedia[]>([]);

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

  const postTextMessage = async (text: string) => {
    const res = await apiFetch(`/api/chats/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({ text, ...(replyingTo ? { replyTo: replyingTo._id } : {}) }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.message as Message;
  };

  const sendMessage = async () => {
    const text = message.trim();
    if ((!text && pendingMedia.length === 0) || sending) return;
    setSending(true);
    try {
      const newMessages: Message[] = [];

      if (pendingMedia.length > 0) {
        const formData = new FormData();
        if (replyingTo) {
          formData.append("replyTo", replyingTo._id);
        }
        pendingMedia.forEach((item, index) => {
          formData.append("media", {
            uri: item.uri,
            name: item.fileName || `${item.type}-${index + 1}.${item.type === "video" ? "mp4" : "jpg"}`,
            type: item.mimeType || (item.type === "video" ? "video/mp4" : "image/jpeg"),
          } as any);
        });

        const mediaRes = await apiFetch(`/api/chats/${id}/messages/media`, {
          method: "POST",
          body: formData,
        });
        if (!mediaRes.ok) throw new Error(`HTTP ${mediaRes.status}`);
        const mediaData = await mediaRes.json();
        newMessages.push(mediaData.message);
      }

      if (text) {
        newMessages.push(await postTextMessage(text));
      }

      setMessages((prev) => [...newMessages.reverse(), ...prev]);
      setMessage("");
      setPendingMedia([]);
      setReplyingTo(null);
    } catch (err) {
      console.error("Failed to send:", err);
      Alert.alert("Failed to send", "Please try again.");
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
                  mediaUrl: msg.mediaUrl,
                  mediaUrls: msg.mediaUrls,
                  mediaTypes: msg.mediaTypes,
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
              <Text style={styles.replyBarText} numberOfLines={1}>{getReplySummary(replyingTo)}</Text>
            </View>
            <TouchableOpacity onPress={() => setReplyingTo(null)} style={styles.replyBarClose}>
              <Text style={{ fontSize: 18, color: colors.mutedText }}>✕</Text>
            </TouchableOpacity>
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
        <View style={styles.inputBar}>
          <TouchableOpacity style={styles.plusBtn} onPress={openPhotoOptions} disabled={sending}>
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

          <TouchableOpacity style={styles.sendBtn} onPress={sendMessage} disabled={sending || (!message.trim() && pendingMedia.length === 0)}>
            <Text style={{ fontSize: 18, color: colors.text, opacity: sending || (!message.trim() && pendingMedia.length === 0) ? 0.3 : 1 }}>➤</Text>
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
      fontWeight: "700",
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
      fontWeight: "700",
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
