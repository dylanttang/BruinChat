import { View, Text, StyleSheet, TouchableOpacity, Image, Modal, Pressable } from "react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme, fonts, Colors } from "../../context/ThemeContext";
import { messageMedia, type MediaKind } from "../../lib/messageMedia";
import ChatMedia from "./ChatMedia";

type ReplyMessage = {
  _id: string;
  text: string;
  mediaUrl?: string | null;
  mediaUrls?: string[];
  mediaTypes?: MediaKind[];
  senderId: { displayName: string };
};

type Props = {
  item: {
    id: string;
    user: string;
    avatarUrl?: string;
    text: string;
    mediaUrl?: string | null;
    mediaUrls?: string[];
    mediaTypes?: MediaKind[];
    mine: boolean;
    replyTo?: ReplyMessage | null;
    // names: who reacted with this emoji ("You" first), for the reactions sheet.
    reactions?: { emoji: string; count: number; reactedByMe: boolean; names: string[] }[];
  };
  onLongPress?: () => void;
  replyCount?: number;
  onOpenThread?: () => void;
  onReact?: (emoji: string) => void;
  // Tapping the sender's picture or name opens their profile sheet.
  onPressUser?: () => void;
  // Same sender as the message above or below. Like Instagram, a run of
  // messages sits close together, with the name on the first and the picture
  // on the last.
  groupedWithPrevious?: boolean;
  groupedWithNext?: boolean;
};

// How far the reaction pills hang below the bubble. The pills are ~25px tall,
// so only their top ~7px overlaps the bubble (like Instagram), which stays
// inside the bubble's 10px bottom padding and never covers the text.
const REACTION_OVERHANG = 18;

// Double-tapping a message reacts with this, like Instagram's double-tap to like.
const LIKE_EMOJI = "❤️";
const DOUBLE_TAP_MS = 280;

function getReplySummary(message: ReplyMessage) {
  const text = message.text?.trim();
  if (text) return text;

  const mediaTypes = message.mediaTypes || [];
  const mediaCount = message.mediaUrls?.length || (message.mediaUrl ? 1 : 0);
  const firstType = mediaTypes[0] || (message.mediaUrl ? "image" : null);
  const label = firstType === "video" ? "Video" : firstType === "image" ? "Photo" : "Media";

  return mediaCount > 1 ? `[${mediaCount} ${label}s]` : `[${label}]`;
}

export default function MessageBubble({
  item, onLongPress, onReact, onPressUser, onOpenThread, replyCount = 0, groupedWithPrevious = false, groupedWithNext = false,
}: Props) {
  const isMe = item.mine;
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [reactionsWidth, setReactionsWidth] = useState(0);
  const [showReactions, setShowReactions] = useState(false);
  const hasReactions = !!item.reactions?.length;
  const hasMyReaction = !!item.reactions?.some((r) => r.reactedByMe);

  const lastTapRef = useRef(0);
  const pendingTapRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (pendingTapRef.current) clearTimeout(pendingTapRef.current);
  }, []);

  // Only ever sets the heart: double-tapping a message you already liked
  // shouldn't un-like it (removing is done from the reactions sheet). If you'd
  // reacted with something else, the server swaps it for the heart. The
  // heart just shows up as a reaction pill; no separate big-heart animation.
  const likeMessage = () => {
    const alreadyLiked = item.reactions?.some((r) => r.emoji === LIKE_EMOJI && r.reactedByMe);
    if (!alreadyLiked) onReact?.(LIKE_EMOJI);
  };

  // A second tap within DOUBLE_TAP_MS likes the message. A single tap's own
  // action (e.g. opening a photo) waits that long so it doesn't fire on a like.
  const handleTap = (onSingleTap?: () => void) => {
    const now = Date.now();
    if (now - lastTapRef.current < DOUBLE_TAP_MS) {
      lastTapRef.current = 0;
      if (pendingTapRef.current) {
        clearTimeout(pendingTapRef.current);
        pendingTapRef.current = null;
      }
      likeMessage();
      return;
    }

    lastTapRef.current = now;
    if (onSingleTap) {
      pendingTapRef.current = setTimeout(() => {
        pendingTapRef.current = null;
        onSingleTap();
      }, DOUBLE_TAP_MS);
    }
  };

  // Photos and videos sit on their own, with no bubble or frame around them.
  // Any caption (and the reply quote) goes in a gradient bubble attached right
  // below, at the same width, joined by nearly square corners (orange = you,
  // blue = others).
  const mediaItems = messageMedia(item);
  const hasMedia = mediaItems.length > 0;
  const hasText = !!item.text;
  const showBubble = hasText || !hasMedia;
  const replyPreview = item.replyTo && (
    <View style={[styles.replyPreview, showBubble ? styles.replyPreviewOnGradient : styles.replyPreviewPlain]}>
      <Text style={[styles.replyName, showBubble && styles.onGradientText]}>
        {item.replyTo.senderId.displayName}
      </Text>
      <Text style={[styles.replyText, showBubble && styles.onGradientSubtext]} numberOfLines={1}>
        {getReplySummary(item.replyTo)}
      </Text>
    </View>
  );

  const textBubble = showBubble && (
    <LinearGradient
      colors={isMe ? colors.gradients.sent : colors.gradients.received}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={[
        styles.bubble,
        isMe ? styles.myBubble : styles.otherBubble,
        hasMedia ? styles.captionBubble : { alignSelf: isMe ? "flex-end" : "flex-start" },
        !hasMedia && groupedWithPrevious && (isMe ? styles.myGroupedBubble : styles.otherGroupedBubble),
      ]}
    >
      {replyPreview}
      {hasText && (
        <Text style={[styles.messageText, styles.onGradientText]}>
          {item.text}
        </Text>
      )}
    </LinearGradient>
  );

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => handleTap()}
        onLongPress={onLongPress}
        style={[
          styles.row,
          { justifyContent: isMe ? "flex-end" : "flex-start" },
          groupedWithPrevious && styles.rowJoinedAbove,
          groupedWithNext && styles.rowJoinedBelow,
        ]}
      >
        {!isMe && (groupedWithNext ? (
          <View style={styles.avatarSpace} />
        ) : (
          <TouchableOpacity onPress={onPressUser} disabled={!onPressUser} accessibilityLabel={`Open ${item.user}'s profile`}>
            <Image source={item.avatarUrl ? { uri: item.avatarUrl } : undefined} style={styles.avatar} />
          </TouchableOpacity>
        ))}

        <View style={{ maxWidth: "75%" }}>
          {!isMe && !groupedWithPrevious && (
            <Text style={styles.username} onPress={onPressUser} suppressHighlighting>
              {item.user}
            </Text>
          )}

          {/* Reactions float over the bubble's bottom-right corner instead of
              taking their own row, so reacting never changes the message's height. */}
          <View
            style={[
              { alignSelf: isMe ? "flex-end" : "flex-start" },
              // Leave room below for the pills so they don't overlap the next
              // message, and keep short bubbles from others at least as wide
              // as their reactions so the pills don't spill over the avatar.
              hasReactions && { marginBottom: REACTION_OVERHANG },
              hasReactions && !isMe && { minWidth: reactionsWidth + 8 },
            ]}
          >
          {hasMedia ? (
            <View style={{ alignItems: isMe ? "flex-end" : "flex-start" }}>
              {!showBubble && replyPreview}
              <ChatMedia
                messageId={item.id}
                items={mediaItems}
                caption={showBubble ? textBubble : undefined}
                onPress={(open) => handleTap(open)}
                onLongPress={onLongPress}
              />
            </View>
          ) : (
            textBubble
          )}

          {/* Only show the link once a thread exists; new threads start from
              the long-press menu's "Reply in thread". */}
          {onOpenThread && replyCount > 0 && <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Open thread, ${replyCount} ${replyCount === 1 ? "reply" : "replies"}`} onPress={onOpenThread} style={{ paddingTop: 4, paddingBottom: 6 }}>
            <Text style={{ color: colors.primary, fontFamily: fonts.bold, fontSize: 13 }}>{`${replyCount} ${replyCount === 1 ? "reply" : "replies"}`}</Text>
          </TouchableOpacity>}

          {hasReactions && (
            <View
              style={styles.reactionsOverlay}
              onLayout={(e) => setReactionsWidth(e.nativeEvent.layout.width)}
            >
              {item.reactions!.map((reaction) => (
                <TouchableOpacity
                  key={reaction.emoji}
                  activeOpacity={0.7}
                  onPress={() => setShowReactions(true)}
                  accessibilityLabel={`${reaction.emoji} ${reaction.count}. Show who reacted`}
                  style={[
                    styles.reactionPill,
                    reaction.reactedByMe && styles.myReactionPill,
                  ]}
                >
                  <Text style={styles.reactionText}>
                    {reaction.count > 1 ? `${reaction.emoji} ${reaction.count}` : reaction.emoji}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          </View>
        </View>
      </TouchableOpacity>

      {/* Only mounted while open, so a long chat doesn't carry a viewer per message. */}

      {/* Who reacted, Instagram-style. Tapping a row removes your reaction or
          adds the same one. */}
      <Modal
        transparent
        visible={showReactions && hasReactions}
        animationType="fade"
        onRequestClose={() => setShowReactions(false)}
      >
        <View style={styles.sheetContainer}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setShowReactions(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Reactions</Text>
            {item.reactions?.map((reaction) => (
              <TouchableOpacity
                key={reaction.emoji}
                activeOpacity={0.7}
                style={styles.sheetRow}
                onPress={() => {
                  onReact?.(reaction.emoji);
                  setShowReactions(false);
                }}
                accessibilityLabel={
                  reaction.reactedByMe
                    ? `Remove your ${reaction.emoji} reaction`
                    : hasMyReaction
                      ? `Switch your reaction to ${reaction.emoji}`
                      : `React ${reaction.emoji} too`
                }
              >
                <Text style={styles.sheetEmoji}>{reaction.emoji}</Text>
                <Text style={styles.sheetNames} numberOfLines={2}>
                  {reaction.names.join(", ")}
                </Text>
                {/* One reaction per person, so picking another emoji switches yours. */}
                <Text style={[styles.sheetAction, reaction.reactedByMe && styles.sheetActionRemove]}>
                  {reaction.reactedByMe ? "Tap to remove" : hasMyReaction ? "Switch" : "React too"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
    </>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "flex-end",
      marginVertical: 6,
      paddingHorizontal: 8,
    },
    rowJoinedAbove: {
      marginTop: 1,
    },
    rowJoinedBelow: {
      marginBottom: 1,
    },
    avatar: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.avatarBg,
      marginRight: 8,
    },
    // Keeps grouped messages lined up where the picture would be.
    avatarSpace: {
      width: 42,
    },
    username: {
      fontFamily: fonts.regular,
      fontSize: 12,
      color: colors.subtext,
      marginBottom: 2,
    },
    bubble: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 20,
      overflow: "hidden",
    },
    // A caption attached under a photo, the same width, with nearly square
    // top corners meeting the photo's bottom corners.
    captionBubble: {
      marginTop: 2,
      borderTopLeftRadius: 4,
      borderTopRightRadius: 4,
    },
    myBubble: {
      borderBottomRightRadius: 6,
    },
    otherBubble: {
      borderBottomLeftRadius: 6,
    },
    myGroupedBubble: {
      borderTopRightRadius: 6,
    },
    otherGroupedBubble: {
      borderTopLeftRadius: 6,
    },
    messageText: {
      fontFamily: fonts.regular,
      fontSize: 16,
      lineHeight: 21,
      color: colors.text,
    },
    onGradientText: {
      color: colors.bubbleText,
    },
    onGradientSubtext: {
      color: colors.bubbleSubtext,
    },
    replyPreview: {
      borderRadius: 8,
      padding: 6,
      marginBottom: 6,
    },
    replyPreviewOnGradient: {
      backgroundColor: colors.bubbleQuote,
      borderLeftWidth: 3,
      borderLeftColor: colors.bubbleQuoteBorder,
    },
    replyPreviewPlain: {
      backgroundColor: colors.inputBg,
      borderLeftWidth: 3,
      borderLeftColor: colors.accent,
    },
    replyName: {
      fontSize: 11,
      fontFamily: fonts.medium,
      color: colors.mutedText,
      marginBottom: 1,
    },
    replyText: {
      fontFamily: fonts.regular,
      fontSize: 12,
      color: colors.subtext,
    },
    // Hangs half outside the bubble's bottom-right corner (Instagram-style).
    reactionsOverlay: {
      position: "absolute",
      right: -4,
      bottom: -REACTION_OVERHANG,
      flexDirection: "row",
    },
    reactionPill: {
      minHeight: 22,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 11,
      backgroundColor: colors.card,
      // Background-colored ring makes the pill look cut out of the bubble.
      borderWidth: 2,
      borderColor: colors.background,
      marginLeft: 2,
      justifyContent: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.12,
      shadowRadius: 2,
      elevation: 2,
    },
    myReactionPill: {
      backgroundColor: colors.brandSoft,
    },
    sheetContainer: {
      flex: 1,
      justifyContent: "flex-end",
    },
    sheetBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.35)",
    },
    sheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 36,
    },
    sheetHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: "center",
      marginBottom: 12,
    },
    sheetTitle: {
      fontFamily: fonts.bold,
      fontSize: 16,
      color: colors.text,
      marginBottom: 4,
    },
    sheetRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    sheetEmoji: {
      fontSize: 22,
      marginRight: 12,
    },
    sheetNames: {
      flex: 1,
      fontFamily: fonts.regular,
      fontSize: 15,
      color: colors.text,
    },
    sheetAction: {
      fontFamily: fonts.medium,
      fontSize: 13,
      color: colors.brand,
      marginLeft: 12,
    },
    sheetActionRemove: {
      color: colors.danger,
    },
    reactionText: {
      fontFamily: fonts.regular,
      fontSize: 12,
      color: colors.text,
    },
  });
}
