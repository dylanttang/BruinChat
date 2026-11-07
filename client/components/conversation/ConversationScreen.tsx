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
  Animated,
  Easing,
  LayoutAnimation,
  LayoutAnimationConfig,
  AccessibilityInfo,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import * as VideoThumbnails from "expo-video-thumbnails";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Socket } from "socket.io-client";
import * as ImagePicker from "expo-image-picker";
import MessageBubble from "./MessageBubble";
import SwipeToReply from "./SwipeToReply";
import { ChatMediaProvider } from "./chatMediaList";
import { apiFetch } from "../../lib/api";
import { useTheme, fonts, Colors } from "../../context/ThemeContext";
import { takeMessageJump } from "../../lib/messageJump";
import { messageGrouping } from "../../lib/messageGroups";
import { uploadToCloudinary } from "../../lib/cloudinary";
import { mediaSizeError, MediaUploadError } from "../../lib/mediaPolicy";
import { LIBRARY_MEDIA_OPTIONS, CAMERA_MEDIA_OPTIONS } from "../../lib/mediaPicker";
import { startDirectMessage, conversationTitle } from "../../lib/directMessages";
import { createSocket } from "../../lib/socket";
import { confirmSent, isNewToList, receiveMessage } from "../../lib/sentMessages";
import { ReportTarget, setUserBlocked } from "../../lib/moderation";
import UserProfileSheet, { ProfileUser } from "../../components/UserProfileSheet";
import ReportModal from "../../components/ReportModal";
import EmojiPicker from "rn-emoji-keyboard";

const REACTION_OPTIONS = ["👍", "❤️", "😂", "🎉", "👀"];
const TYPING_IDLE_MS = 1800;
// Older messages load in bigger pages when jumping to a search result.
const JUMP_PAGE_SIZE = 100;
// How long a jumped-to message stays highlighted before fading out.
const JUMP_HIGHLIGHT_MS = 1200;
const JUMP_SCROLL_RETRIES = 10;
const JUMP_RETRY_DELAY_MS = 120;
const TYPING_EVENT_TTL_MS = 3000;

// Instagram-style send: the new bubble pops out of its bottom corner (from
// 80% size, fading in, with a slight springy overshoot) while the messages
// above glide up to make room.
const BUBBLE_START_SCALE = 0.8;
const BUBBLE_POP_MS = 450;
const LIST_GLIDE_MS = 420;
// The same curves run on every platform so iOS, Android and web match: a
// little overshoot for the bubble, and a plain ease-out (no bounce) for the
// list. The list curve is the standard ease-out because that's the closest
// curve LayoutAnimation offers on native (it can't take a custom one).
const BUBBLE_POP_CURVE = [0.34, 1.4, 0.64, 1] as const;
const LIST_GLIDE_CURVE = [0, 0, 0.58, 1] as const;
const BUBBLE_POP_EASING = `cubic-bezier(${BUBBLE_POP_CURVE.join(", ")})`;
const LIST_GLIDE_EASING = `cubic-bezier(${LIST_GLIDE_CURVE.join(", ")})`;
// Only animate when the reader is at (or near) the newest message; if they've
// scrolled up into history, a new message shouldn't move what they're reading.
const NEAR_BOTTOM_PX = 80;

// iOS/Android: LayoutAnimation glides the rows above up on the UI thread; the
// bubble's pop runs on the native driver in MessageEntrance.
const NATIVE_LIST_GLIDE: LayoutAnimationConfig = {
  duration: LIST_GLIDE_MS,
  update: { type: LayoutAnimation.Types.easeOut },
};

// When a reaction is added or removed, the row grows or shrinks to make room
// for the pill; glide the messages above instead of jumping, and fade the
// pill in.
const NATIVE_REACTION_GLIDE: LayoutAnimationConfig = {
  duration: 220,
  create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
  update: { type: LayoutAnimation.Types.easeInEaseOut },
  delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
};

// Web: LayoutAnimation does nothing in the browser. Instead, the list's content
// starts pushed back down by the new row's height (so nothing visibly jumps)
// and animates up to where it belongs. Transform-only, so the browser runs it
// without per-frame layout or JavaScript.
function glideWebListUp(scrollNode: HTMLElement | null | undefined, rowHeight: number) {
  const content = scrollNode?.firstElementChild as HTMLElement | null | undefined;
  if (!content?.animate || !rowHeight) return;
  // The inverted list flips its scroll view with scaleY(-1), so inside it a
  // negative translateY moves content visually down. "add" stacks a new
  // glide onto one that's still running instead of jumping.
  content.animate(
    [{ transform: `translateY(${-rowHeight}px)` }, { transform: "translateY(0px)" }],
    { duration: LIST_GLIDE_MS, easing: LIST_GLIDE_EASING, composite: "add" }
  );
}

// Wraps each message row and plays the pop when `animate` is set. On web it
// also measures the row before the browser paints and reports its height, so
// the list glide starts from exactly where the conversation was.
function MessageEntrance({ animate, mine, dimmed, onEnter, children }: {
  animate: boolean;
  mine: boolean;
  dimmed: boolean;
  onEnter: (height: number) => void;
  children: ReactNode;
}) {
  const ref = useRef<View>(null);
  const isWeb = Platform.OS === "web";
  const progress = useRef(new Animated.Value(animate && !isWeb ? 0 : 1)).current;
  const origin = mine ? "right bottom" : "left bottom";

  useLayoutEffect(() => {
    if (!animate) return;
    if (isWeb) {
      const node = ref.current as unknown as HTMLElement | null;
      onEnter(node?.getBoundingClientRect?.().height ?? 0);
      node?.animate?.(
        [
          { opacity: 0, transform: `scale(${BUBBLE_START_SCALE})`, transformOrigin: origin },
          { opacity: 1, transform: "scale(1)", transformOrigin: origin },
        ],
        { duration: BUBBLE_POP_MS, easing: BUBBLE_POP_EASING }
      );
    } else {
      onEnter(0);
      Animated.timing(progress, {
        toValue: 1,
        duration: BUBBLE_POP_MS,
        easing: Easing.bezier(...BUBBLE_POP_CURVE),
        useNativeDriver: true,
      }).start();
    }
    // Mount only: the first render decides whether this row animates.
  }, []);

  const pop = isWeb ? null : {
    opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: "clamp" }),
    transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [BUBBLE_START_SCALE, 1] }) }],
    transformOrigin: origin,
  };

  return (
    // Faded slightly until the server confirms it, like Instagram.
    <View ref={ref} style={dimmed ? { opacity: 0.6 } : null}>
      <Animated.View style={pop}>{children}</Animated.View>
    </View>
  );
}

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
  // Set on our own message while it's still sending. clientKey stays on the
  // row after the server confirms it, so the row keeps its list key and
  // doesn't remount (or re-animate) when the real message replaces it.
  pending?: boolean;
  clientKey?: string;
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

// Messages don't show their own times (long-press shows it). Like Instagram,
// a centered time divider appears at the start of each day and after a quiet
// stretch of this long.
const TIME_DIVIDER_GAP_MS = 30 * 60 * 1000;

function formatDayAndTime(iso: string): string {
  return `${formatDateLabel(iso)} at ${formatTime(iso)}`;
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
    const isLongGap = !!next && curr.getTime() - next.getTime() >= TIME_DIVIDER_GAP_MS;
    if (isDifferentDay || isLongGap) {
      result.push({ _id: `sep-${messages[i]._id}`, type: "date", label: formatDayAndTime(messages[i].createdAt) });
    }
  }
  return result;
}

type Chat = {
  _id: string;
  name: string;
  isGroup?: boolean;
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

// A sent message keeps its clientKey as its list key, so it stays the same row
// from sending through confirmed.
function listKey(item: ListItem): string {
  return ("clientKey" in item && item.clientKey) || item._id;
}

function replaceMessage(messages: Message[], incoming: Message): Message[] {
  return messages.map((message) => (message._id === incoming._id ? { ...message, ...incoming } : message));
}

export default function ConversationScreen({ chatId: id, threadId }: { chatId: string; threadId?: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const emojiPickerTheme = useMemo(() => ({
    backdrop: colors.overlay,
    knob: colors.border,
    container: colors.card,
    header: colors.subtext,
    skinTonesContainer: colors.inputBg,
    category: {
      icon: colors.mutedText,
      iconActive: colors.brand,
      container: colors.inputBg,
      containerActive: colors.brandSoft,
    },
    search: {
      background: colors.inputBg,
      text: colors.text,
      placeholder: colors.mutedText,
      icon: colors.mutedText,
    },
    emoji: { selected: colors.brandSoft },
  }), [colors]);
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
  // The search result to scroll to, once it's in the list.
  const [jumpTarget, setJumpTarget] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const highlightOpacity = useRef(new Animated.Value(0)).current;
  const jumpRetriesRef = useRef(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [actionTarget, setActionTarget] = useState<Message | null>(null);
  // Message the full emoji picker (the "+" in the long-press menu) reacts to.
  const [emojiPickerTarget, setEmojiPickerTarget] = useState<Message | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
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
  // Latest messages, so the socket handler can tell a brand-new message from
  // an echo of one already on screen (our own send arrives twice).
  const messagesRef = useRef<Message[]>([]);
  messagesRef.current = messages;
  const reduceMotionRef = useRef(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => { reduceMotionRef.current = enabled; })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) => {
      reduceMotionRef.current = enabled;
    });
    return () => subscription.remove();
  }, []);

  // Our own sender info, for showing a message the instant we send it.
  const meRef = useRef<Message["senderId"] | null>(null);
  // Inverted list: 0 is the newest message. Updated on scroll.
  const scrollOffsetRef = useRef(0);
  // List keys of rows that should pop in when they first render.
  const enteringKeysRef = useRef<Set<string>>(new Set());

  // Call right before adding a new message to state.
  const animateEntrance = useCallback((listKey: string) => {
    if (reduceMotionRef.current || scrollOffsetRef.current > NEAR_BOTTOM_PX) return;
    enteringKeysRef.current.add(listKey);
    if (Platform.OS !== "web") LayoutAnimation.configureNext(NATIVE_LIST_GLIDE);
  }, []);

  // Call right before applying a reaction change to state.
  const animateReactionChange = useCallback(() => {
    if (reduceMotionRef.current || Platform.OS === "web") return;
    LayoutAnimation.configureNext(NATIVE_REACTION_GLIDE);
  }, []);

  const handleRowEnter = useCallback((listKey: string, height: number) => {
    enteringKeysRef.current.delete(listKey);
    if (Platform.OS !== "web") return;
    const scrollNode = (listRef.current as any)?.getScrollableNode?.() as HTMLElement | undefined;
    glideWebListUp(scrollNode, height);
  }, []);

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
        meRef.current = {
          _id: data.user._id,
          displayName: data.user.displayName,
          avatarUrl: data.user.avatarUrl,
        };
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
        return { messages: data.messages as Message[], hasMore: data.hasMore as boolean };
      }
    } catch (err) {
      setError("Could not load this conversation. Tap to retry.");
      console.error("Failed to load chat:", err);
    } finally {
      setLoading(false);
    }
  }, [id, messagesUrl]);

  const fetchOlder = useCallback(async (before: string, limit?: number) => {
    const response = await apiFetch(`${messagesUrl}${threadId ? "&" : "?"}before=${before}${limit ? `&limit=${limit}` : ""}`);
    if (!response.ok) throw new Error("Unable to load older messages");
    const data = await response.json();
    setMessages(prev => [...prev, ...data.messages.filter((m: Message) => !prev.some(existing => existing._id === m._id))]);
    setHasMore(data.hasMore);
    return { messages: data.messages as Message[], hasMore: data.hasMore as boolean };
  }, [messagesUrl, threadId]);

  useFocusEffect(useCallback(() => {
    const target = takeMessageJump();
    let active = true;
    loadData().then(async (loaded) => {
      if (!target || !loaded || !active) return;
      // Coming back reloads only the newest page, so go back until it's there.
      setJumpTarget(target);
      let page = loaded;
      let found = page.messages.some(item => item._id === target);
      setLoadingMore(true);
      try {
        while (!found && page.hasMore && page.messages.length && active) {
          page = await fetchOlder(page.messages[page.messages.length - 1]._id, JUMP_PAGE_SIZE);
          found = page.messages.some(item => item._id === target);
        }
      } catch {
        setError("Could not load older messages. Try again.");
      } finally {
        setLoadingMore(false);
        if (!found) setJumpTarget(null);
      }
    });
    return () => { active = false; };
  }, [loadData, fetchOlder]));

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
        if (threadId ? parent === threadId : !parent) {
          if (isNewToList(messagesRef.current, incoming)) animateEntrance(incoming._id);
          setMessages((prev) => receiveMessage(prev, incoming));
        }
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
        animateReactionChange();
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
  }, [animateEntrance, animateReactionChange, clearRemoteTypingUser, currentUserId, id, stopTyping, threadId, loadData]);

  const reactToMessage = useCallback(async (messageId: string, emoji: string) => {
    try {
      const res = await apiFetch(`/api/chats/${id}/messages/${messageId}/react`, {
        method: "POST",
        body: JSON.stringify({ emoji }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      animateReactionChange();
      setMessages((prev) => replaceMessage(prev, data.message));
      setRoot(prev => prev?._id === data.message._id ? data.message : prev);
    } catch (err) {
      console.error("Failed to react:", err);
    }
  }, [animateReactionChange, id]);

  const handleBlockedChange = (userId: string, blocked: boolean) => {
    setBlockedIds((prev) => {
      const next = new Set(prev);
      if (blocked) next.add(userId);
      else next.delete(userId);
      return next;
    });
    if (blocked && replyingTo?.senderId._id === userId) setReplyingTo(null);
  };

  const startReply = (target: Message) => {
    setReplyingTo(target);
    inputRef.current?.focus();
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
  const listItems = useMemo(() => injectDateSeparators(visibleMessages), [visibleMessages]);

  useEffect(() => {
    if (!jumpTarget || !listRef.current) return;
    const index = listItems.findIndex(item => item._id === jumpTarget);
    if (index < 0) return;
    setJumpTarget(null);
    jumpRetriesRef.current = 0;
    listRef.current.scrollToIndex({ index, viewPosition: 0.5 });
    setHighlightedId(jumpTarget);
    highlightOpacity.setValue(1);
    Animated.sequence([
      Animated.delay(JUMP_HIGHLIGHT_MS),
      Animated.timing(highlightOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) setHighlightedId(null);
    });
  }, [jumpTarget, listItems, highlightOpacity]);

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
    // Clear the box right away so the keyboard stays up and the user can keep
    // typing while this one sends; put it back if the send fails.
    const media = pendingMedia;
    const reply = replyingTo;
    // Show the message right away (marked as sending) instead of waiting for
    // the upload and the server, like iMessage and Instagram do.
    const clientKey = `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const me = meRef.current;
    if (me) {
      animateEntrance(clientKey);
      setMessages(prev => [{
        _id: clientKey,
        clientKey,
        pending: true,
        text,
        mediaUrls: media.map(item => item.uri),
        mediaTypes: media.map(item => item.type),
        createdAt: new Date().toISOString(),
        senderId: me,
        replyTo: reply,
        ...(threadId ? { threadRootId: threadId } : {}),
      }, ...prev]);
    }
    setSending(true);
    setMessage("");
    setPendingMedia([]);
    setReplyingTo(null);
    stopTyping();
    try {
      const mediaUrls = [];
      for (const item of media) {
        mediaUrls.push(await uploadToCloudinary(item.uri, "messages", item));
      }
      const response = await apiFetch(`/api/chats/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({
          text, mediaUrls, mediaTypes: media.map(item => item.type),
          ...(threadId ? { threadRootId: threadId } : {}),
          ...(reply ? { replyTo: reply._id } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw Object.assign(new Error(data.error || `HTTP ${response.status}`), data);
      setMessages(prev => confirmSent(prev, clientKey, data.message));
    } catch (err: any) {
      console.error("Failed to send:", err);
      setMessages(prev => prev.filter(item => item.clientKey !== clientKey || !item.pending));
      setMessage(current => current || text);
      setPendingMedia(current => current.length ? current : media);
      setReplyingTo(current => current ?? reply);
      if (err?.code === "MUTED") {
        setMutedUntil(new Date(err.mutedUntil));
      } else if (err?.code === "BANNED") {
        router.replace("/banned");
      } else if (err?.code === "TERMS_REQUIRED") {
        router.replace("/auth/terms");
      } else {
        Alert.alert("Failed to send", err instanceof MediaUploadError ? err.message : "Please try again.");
      }
    } finally {
      setSending(false);
    }
  };

  const addPickedMedia = (assets: ImagePicker.ImagePickerAsset[]) => {
    const validMedia: PendingMedia[] = assets.flatMap((asset) => {
      const mediaType = asset.type === "video" ? "video" : asset.type === "image" ? "image" : null;
      if (!mediaType) return [];
      const sizeError = mediaSizeError(mediaType, asset.fileSize);
      if (sizeError) {
        Alert.alert("File too large", sizeError);
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

    try {
      const result = await ImagePicker.launchImageLibraryAsync(LIBRARY_MEDIA_OPTIONS);
      if (!result.canceled) addPickedMedia(result.assets);
    } catch {
      Alert.alert("Could not prepare media", "Please try again or choose a different photo or video.");
    }
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Allow camera access to take photos.");
      return;
    }

    try {
      const result = await ImagePicker.launchCameraAsync(CAMERA_MEDIA_OPTIONS);
      if (!result.canceled) addPickedMedia(result.assets);
    } catch {
      Alert.alert("Could not prepare media", "Please try recording again.");
    }
  };

  const openPhotoOptions = () => {
    // Alert menus don't show on web, so go straight to the browser's file picker.
    if (Platform.OS === "web") {
      pickFromLibrary();
      return;
    }
    Alert.alert("Add media", undefined, [
      { text: "Photo & Video Library", onPress: pickFromLibrary },
      { text: "Camera", onPress: takePhoto },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  // Your current reaction on the long-pressed message. If it came from the
  // full picker it isn't a quick option, so it goes first in the row; either
  // way it's highlighted, and tapping it again removes it.
  const myActionReaction = actionTarget?.reactions?.find(
    (reaction) => getReactionUserId(reaction) === currentUserId
  )?.emoji;
  const actionReactionOptions = myActionReaction && !REACTION_OPTIONS.includes(myActionReaction)
    ? [myActionReaction, ...REACTION_OPTIONS]
    : REACTION_OPTIONS;

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>

        <Text style={styles.title} numberOfLines={1}>
          {threadId ? "Thread" : (chat ? conversationTitle(chat, currentUserId) : "Loading...")}
        </Text>

        <View style={styles.headerActions}>
          {!threadId && (
            <TouchableOpacity
              accessibilityLabel="Search messages"
              onPress={() => router.push(`/chat/${id}/search`)}
              style={styles.headerAction}
            >
              <Text style={styles.searchIcon}>⌕</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity accessibilityLabel="Conversation info" onPress={() => router.push(`/chat/${id}/info`)}>
            <Text style={styles.menuDot}>•••</Text>
          </TouchableOpacity>
        </View>
      </View>

      {threadId && root && !blockedIds.has(root.senderId?._id) && <View style={{ maxHeight: 240, borderBottomWidth: 1, borderColor: colors.border }}>
        <ScrollView><MessageBubble item={{ id: root._id, user: root.senderId?.displayName ?? "Deleted user", avatarUrl: root.senderId?.avatarUrl, text: root.deletedAt ? "Message deleted" : root.text, mediaUrl: root.mediaUrl, mediaUrls: root.mediaUrls, mediaTypes: root.mediaTypes, mine: currentUserId === root.senderId?._id, reactions: groupReactions(root.reactions, currentUserId) }} onReact={emoji => reactToMessage(root._id, emoji)} onPressUser={() => setProfileUser(root.senderId)} /></ScrollView>
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
        <ChatMediaProvider messages={visibleMessages}>
        <FlatList
          ref={listRef}
          onEndReached={async () => {
            if (!hasMore || loadingMore || !messages.length) return;
            setLoadingMore(true);
            try {
              await fetchOlder(messages[messages.length - 1]._id);
            } catch { setError("Could not load older messages. Try again."); }
            finally { setLoadingMore(false); }
          }}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.mutedText} /> : null}
          data={listItems}
          inverted
          keyExtractor={listKey}
          extraData={highlightedId}
          // Rows further up aren't measured yet, so get close and try again.
          onScrollToIndexFailed={({ index, averageItemLength }) => {
            if (jumpRetriesRef.current >= JUMP_SCROLL_RETRIES) return;
            jumpRetriesRef.current += 1;
            listRef.current?.scrollToOffset({ offset: averageItemLength * index, animated: false });
            setTimeout(() => listRef.current?.scrollToIndex({ index, viewPosition: 0.5 }), JUMP_RETRY_DELAY_MS);
          }}
          onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
            scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
          contentContainerStyle={styles.list}
          renderItem={({ item, index }) => {
            if ("type" in item && item.type === "date") {
              return (
                <View style={styles.dateSeparator}>
                  <Text style={styles.dateSeparatorText}>{item.label}</Text>
                </View>
              );
            }
            const msg = item as Message;
            const key = listKey(msg);
            const grouping = messageGrouping(listItems, index);
            return (
              <MessageEntrance
                animate={enteringKeysRef.current.has(key)}
                mine={currentUserId === msg.senderId._id}
                dimmed={!!msg.pending}
                onEnter={(height) => handleRowEnter(key, height)}
              >
              {msg._id === highlightedId && (
                <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.jumpHighlight, { opacity: highlightOpacity }]} />
              )}
              <SwipeToReply enabled={!msg.deletedAt && !msg.pending && !error} onReply={() => startReply(msg)}>
              <MessageBubble
                item={{
                  id: msg._id,
                  user: msg.senderId.displayName,
                  avatarUrl: msg.senderId.avatarUrl,
                  text: msg.deletedAt ? "Message deleted" : msg.text,
                  mediaUrl: msg.mediaUrl ?? null,
                  mediaUrls: msg.mediaUrls,
                  mediaTypes: msg.mediaTypes,
                  mine: currentUserId === msg.senderId._id,
                  replyTo: msg.replyTo ?? null,
                  reactions: groupReactions(msg.reactions, currentUserId),
                }}
                // A sending message has no server ID yet, so it can't be
                // reacted to, replied to or opened until it's confirmed.
                onOpenThread={!threadId && !msg.pending && (!msg.deletedAt || !!msg.replyCount) ? () => router.push(`/chat/${id}/thread/${msg._id}`) : undefined}
                replyCount={msg.replyCount ?? 0}
                onLongPress={msg.pending ? undefined : () => setActionTarget(msg)}
                onReact={msg.pending ? undefined : (emoji) => reactToMessage(msg._id, emoji)}
                onPressUser={() => setProfileUser(msg.senderId)}
                groupedWithPrevious={grouping.withPrevious}
                groupedWithNext={grouping.withNext}
              />
              </SwipeToReply>
              </MessageEntrance>
            );
          }}
        />
        </ChatMediaProvider>
      )}

      {/* INPUT BAR */}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {actionTarget && (
          <View style={styles.actionBar}>
            <Text style={styles.actionTime}>{formatDayAndTime(actionTarget.createdAt)}</Text>
            <View style={styles.actionTopRow}>
              <View style={styles.actionEmojiRow}>
                {actionReactionOptions.map((emoji) => (
                  <TouchableOpacity
                    key={emoji}
                    style={[styles.actionEmojiButton, emoji === myActionReaction && styles.actionEmojiButtonSelected]}
                    accessibilityLabel={emoji === myActionReaction ? `Remove ${emoji} reaction` : `React with ${emoji}`}
                    onPress={() => {
                      reactToMessage(actionTarget._id, emoji);
                      setActionTarget(null);
                    }}
                  >
                    <Text style={styles.actionEmoji}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={styles.actionEmojiButton}
                  accessibilityLabel="More reactions"
                  onPress={() => {
                    setEmojiPickerTarget(actionTarget);
                    setActionTarget(null);
                  }}
                >
                  <Text style={styles.actionEmojiMore}>+</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.actionCloseButton} onPress={() => setActionTarget(null)}>
                <Text style={styles.actionCloseText}>×</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.actionButtonsRow}>
              {/* Threads are hidden for now (inline replies instead); existing
                  threads still open from their "N replies" link. */}
              {!actionTarget.deletedAt && (
                <TouchableOpacity
                  style={styles.actionReplyButton}
                  onPress={() => {
                    const target = actionTarget;
                    setActionTarget(null);
                    startReply(target);
                  }}
                >
                  <Text style={styles.actionReplyText}>Reply</Text>
                </TouchableOpacity>
              )}
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
        {replyingTo && (
          <View style={styles.replyBar}>
            <View style={styles.replyBarContent}>
              <Text style={styles.replyBarName}>Replying to {replyingTo.senderId._id === currentUserId ? "yourself" : replyingTo.senderId.displayName}</Text>
              <Text style={styles.replyBarText} numberOfLines={1}>{getReplySummary(replyingTo)}</Text>
            </View>
            <TouchableOpacity accessibilityLabel="Cancel reply" onPress={() => setReplyingTo(null)} style={styles.replyBarClose}>
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
              // Grows to a few lines instead of scrolling sideways. On phones
              // Return adds a new line (send with the button); on web, Enter
              // sends and Shift+Enter adds a line.
              multiline
              onKeyPress={Platform.OS === "web" ? (e: any) => {
                if (e.nativeEvent.key === "Enter" && !e.nativeEvent.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              } : undefined}
              editable={!error && !(threadId && !!root?.deletedAt)}
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
        onMessage={profileUser && profileUser._id !== currentUserId ? async () => {
          try {
            const chatId = await startDirectMessage({ recipientId: profileUser._id });
            setProfileUser(null);
            router.push(`/chat/${chatId}`);
          } catch (error) { Alert.alert("Could not start message", error instanceof Error ? error.message : "Please try again"); }
        } : undefined}
        user={profileUser}
        isBlocked={!!profileUser && blockedIds.has(profileUser._id)}
        onClose={() => setProfileUser(null)}
        onBlockedChange={handleBlockedChange}
      />
      <ReportModal target={reportTarget} onClose={() => setReportTarget(null)} />
      <EmojiPicker
        open={!!emojiPickerTarget}
        onClose={() => setEmojiPickerTarget(null)}
        onEmojiSelected={({ emoji }) => {
          if (emojiPickerTarget) reactToMessage(emojiPickerTarget._id, emoji);
        }}
        enableSearchBar
        enableRecentlyUsed
        categoryPosition="top"
        theme={emojiPickerTheme}
      />
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
    jumpHighlight: {
      backgroundColor: colors.brandSoft,
      borderRadius: 12,
    },
    headerActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    headerAction: {
      paddingVertical: 4,
      paddingHorizontal: 2,
    },
    searchIcon: {
      fontFamily: fonts.regular,
      fontSize: 22,
      color: colors.brand,
      lineHeight: 22,
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
      // Buttons stay at the bottom as the text box grows.
      alignItems: "flex-end",
      padding: 10,
      borderTopWidth: 1,
      borderColor: colors.border,
    },
    input: {
      fontFamily: fonts.regular,
      fontSize: 16,
      flex: 1,
      backgroundColor: colors.inputBg,
      borderRadius: 22,
      paddingHorizontal: 16,
      paddingTop: 11,
      paddingBottom: 11,
      minHeight: 44,
      maxHeight: 120,
      marginHorizontal: 8,
      color: colors.text,
    },
    plusBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      marginBottom: 4, // centered on a one-line text box
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
      marginBottom: 3,
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
    actionTime: {
      fontFamily: fonts.regular,
      fontSize: 12,
      color: colors.mutedText,
      textAlign: "center",
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
    actionEmojiButtonSelected: {
      borderWidth: 1.5,
      borderColor: colors.brand,
      backgroundColor: colors.brandSoft,
    },
    actionEmoji: {
      fontFamily: fonts.regular,
      fontSize: 16,
    },
    actionEmojiMore: {
      fontFamily: fonts.medium,
      fontSize: 18,
      color: colors.mutedText,
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
