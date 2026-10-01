import { View, Text, StyleSheet, TouchableOpacity, Image, Modal, Pressable, Animated } from "react-native";
import { ResizeMode, Video } from "expo-av";
import * as VideoThumbnails from "expo-video-thumbnails";
import { useEffect, useMemo, useRef, useState } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme, fonts, Colors } from "../../context/ThemeContext";
import { API_URL } from "../../lib/api";

type MediaKind = "image" | "video";

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
    time: string;
    mine: boolean;
    replyTo?: ReplyMessage | null;
    // names: who reacted with this emoji ("You" first), for the reactions sheet.
    reactions?: { emoji: string; count: number; reactedByMe: boolean; names: string[] }[];
  };
  onLongPress?: () => void;
  onReact?: (emoji: string) => void;
  // Tapping the sender's picture or name opens their profile sheet.
  onPressUser?: () => void;
};

// How far the reaction pills hang below the bubble, and the room kept free
// for the timestamp beside them on short bubbles.
const REACTION_OVERHANG = 12;
const TIMESTAMP_ROOM = 56;

// Double-tapping a message reacts with this, like Instagram's double-tap to like.
const LIKE_EMOJI = "❤️";
const DOUBLE_TAP_MS = 280;

function isVideoUrl(url: string) {
  return /\.(mp4|mov|m4v|webm)(\?|$)/i.test(url);
}

function getReplySummary(message: ReplyMessage) {
  const text = message.text?.trim();
  if (text) return text;

  const mediaTypes = message.mediaTypes || [];
  const mediaCount = message.mediaUrls?.length || (message.mediaUrl ? 1 : 0);
  const firstType = mediaTypes[0] || (message.mediaUrl ? "image" : null);
  const label = firstType === "video" ? "Video" : firstType === "image" ? "Photo" : "Media";

  return mediaCount > 1 ? `[${mediaCount} ${label}s]` : `[${label}]`;
}

function VideoThumbnailTile({ uri, style }: { uri: string; style: any }) {
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

export default function MessageBubble({ item, onLongPress, onReact, onPressUser }: Props) {
  const isMe = item.mine;
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [expandedMedia, setExpandedMedia] = useState<{ uri: string; type: MediaKind } | null>(null);
  const [videoEnded, setVideoEnded] = useState(false);
  const [reactionsWidth, setReactionsWidth] = useState(0);
  const [showReactions, setShowReactions] = useState(false);
  const expandedVideoRef = useRef<Video>(null);
  const hasReactions = !!item.reactions?.length;
  const hasMyReaction = !!item.reactions?.some((r) => r.reactedByMe);

  const heartAnim = useRef(new Animated.Value(0)).current;
  const lastTapRef = useRef(0);
  const pendingTapRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (pendingTapRef.current) clearTimeout(pendingTapRef.current);
  }, []);

  // Only ever sets the heart: double-tapping a message you already liked
  // shouldn't un-like it (removing is done from the reactions sheet). If you'd
  // reacted with something else, the server swaps it for the heart.
  const likeMessage = () => {
    const alreadyLiked = item.reactions?.some((r) => r.emoji === LIKE_EMOJI && r.reactedByMe);
    if (!alreadyLiked) onReact?.(LIKE_EMOJI);

    heartAnim.setValue(0);
    Animated.sequence([
      Animated.spring(heartAnim, { toValue: 1, friction: 4, useNativeDriver: true }),
      Animated.timing(heartAnim, { toValue: 0, duration: 200, delay: 250, useNativeDriver: true }),
    ]).start();
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
  const mediaUrls = item.mediaUrls?.length ? item.mediaUrls : item.mediaUrl ? [item.mediaUrl] : [];
  const toMediaUri = (url: string) => (url.startsWith("http") || url.startsWith("file:") ? url : `${API_URL}${url}`);
  const getMediaKind = (url: string, index: number): MediaKind => (
    item.mediaTypes?.[index] || (isVideoUrl(url) ? "video" : "image")
  );

  useEffect(() => {
    setVideoEnded(false);
  }, [expandedMedia?.uri]);

  // Text-only bubbles get the brand gradients (orange = you, blue = others).
  // Media bubbles keep the frosted-glass frame so photos aren't tinted.
  const hasMedia = mediaUrls.length > 0;
  const onGradient = !hasMedia;

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => handleTap()}
        onLongPress={onLongPress}
        style={[styles.row, { justifyContent: isMe ? "flex-end" : "flex-start" }]}
      >
        {!isMe && (
          <TouchableOpacity onPress={onPressUser} disabled={!onPressUser} accessibilityLabel={`Open ${item.user}'s profile`}>
            <Image source={item.avatarUrl ? { uri: item.avatarUrl } : undefined} style={styles.avatar} />
          </TouchableOpacity>
        )}

        <View style={{ maxWidth: "75%" }}>
          {!isMe && (
            <Text style={styles.username} onPress={onPressUser} suppressHighlighting>
              {item.user}
            </Text>
          )}

          {/* Reactions float over the bubble's bottom-right corner instead of
              taking their own row, so reacting never changes the message's height. */}
          <View
            style={[
              { alignSelf: isMe ? "flex-end" : "flex-start" },
              // Keep short bubbles wide enough that the reactions don't cover
              // the timestamp on the left.
              hasReactions && !isMe && { minWidth: reactionsWidth + TIMESTAMP_ROOM },
            ]}
          >
          <LinearGradient
            colors={
              hasMedia
                ? ["transparent", "transparent"]
                : isMe
                  ? colors.gradients.sent
                  : colors.gradients.received
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={[
              styles.bubble,
              isMe ? styles.myBubble : styles.otherBubble,
              hasMedia && styles.mediaBubble,
            ]}
          >
            {item.replyTo && (
              <View style={[styles.replyPreview, onGradient ? styles.replyPreviewOnGradient : styles.replyPreviewPlain]}>
                <Text style={[styles.replyName, onGradient && styles.onGradientText]}>
                  {item.replyTo.senderId.displayName}
                </Text>
                <Text style={[styles.replyText, onGradient && styles.onGradientSubtext]} numberOfLines={1}>
                  {getReplySummary(item.replyTo)}
                </Text>
              </View>
            )}
            {mediaUrls.length > 0 && (
              <View style={styles.photoGrid}>
                {mediaUrls.map((url, index) => {
                  const mediaUri = toMediaUri(url);
                  const mediaType = getMediaKind(url, index);
                  return (
                    <TouchableOpacity
                      key={`${url}-${index}`}
                      activeOpacity={0.85}
                      onLongPress={onLongPress}
                      onPress={() => handleTap(() => setExpandedMedia({ uri: mediaUri, type: mediaType }))}
                    >
                      {mediaType === "video" ? (
                        <View style={styles.videoThumbWrap}>
                          <VideoThumbnailTile uri={mediaUri} style={styles.photoThumb} />
                          <View style={styles.videoPlayBadge}>
                            <Text style={styles.videoPlayText}>▶</Text>
                          </View>
                        </View>
                      ) : (
                        <Image source={{ uri: mediaUri }} style={styles.photoThumb} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            {!!item.text && (
              <Text style={[styles.messageText, onGradient && styles.onGradientText]}>
                {item.text}
              </Text>
            )}
          </LinearGradient>

          {/* Heart that pops over the bubble on double-tap. */}
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              styles.heartBurst,
              {
                opacity: heartAnim,
                transform: [{ scale: heartAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
              },
            ]}
          >
            <Text style={styles.heartBurstText}>{LIKE_EMOJI}</Text>
          </Animated.View>

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

          <Text
            style={[
              styles.time,
              { alignSelf: isMe ? "flex-end" : "flex-start" },
              // Your timestamp is on the same side as the reactions; slide it
              // left of them rather than down.
              hasReactions && isMe && { marginRight: reactionsWidth + 2 },
            ]}
          >
            {item.time}
          </Text>
        </View>
      </TouchableOpacity>

      <Modal transparent visible={!!expandedMedia} animationType="fade" onRequestClose={() => setExpandedMedia(null)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={styles.modalCloseLayer} onPress={() => setExpandedMedia(null)} />
          {expandedMedia && (
            <View style={styles.expandedPhotoWrap}>
              <View style={styles.expandedPhotoGlass}>
                {expandedMedia.type === "video" ? (
                  <>
                    <Video
                      ref={expandedVideoRef}
                      source={{ uri: expandedMedia.uri }}
                      style={styles.expandedPhoto}
                      useNativeControls
                      resizeMode={ResizeMode.CONTAIN}
                      shouldPlay
                      onPlaybackStatusUpdate={(status) => {
                        if (!status.isLoaded) return;
                        if (status.didJustFinish) {
                          setVideoEnded(true);
                          return;
                        }
                        if (videoEnded && status.isPlaying) {
                          setVideoEnded(false);
                          expandedVideoRef.current?.replayAsync();
                        }
                      }}
                    />
                    {videoEnded && (
                      <TouchableOpacity
                        accessibilityLabel="Replay video"
                        activeOpacity={0.85}
                        style={styles.videoReplayBtn}
                        onPress={() => {
                          setVideoEnded(false);
                          expandedVideoRef.current?.replayAsync();
                        }}
                      >
                        <Text style={styles.videoReplayText}>▶</Text>
                      </TouchableOpacity>
                    )}
                  </>
                ) : (
                  <Image source={{ uri: expandedMedia.uri }} style={styles.expandedPhoto} />
                )}
              </View>
              <TouchableOpacity
                accessibilityLabel="Close media"
                activeOpacity={0.8}
                style={styles.closePhotoBtn}
                onPress={() => setExpandedMedia(null)}
              >
                <Text style={styles.closePhotoText}>✕</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>

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
    avatar: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.avatarBg,
      marginRight: 8,
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
    mediaBubble: {
      padding: 6,
      backgroundColor: "rgba(255,255,255,0.16)",
      borderWidth: 1,
      borderColor: "rgba(120,120,128,0.24)",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.12,
      shadowRadius: 16,
      elevation: 4,
    },
    myBubble: {
      borderBottomRightRadius: 6,
    },
    otherBubble: {
      borderBottomLeftRadius: 6,
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
    time: {
      fontFamily: fonts.regular,
      fontSize: 10,
      color: colors.mutedText,
      marginTop: 2,
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
    heartBurst: {
      alignItems: "center",
      justifyContent: "center",
    },
    heartBurstText: {
      fontSize: 40,
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
    photoGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 4,
    },
    photoThumb: {
      width: 112,
      height: 112,
      borderRadius: 12,
      backgroundColor: colors.border,
    },
    videoThumbWrap: {
      width: 112,
      height: 112,
      borderRadius: 12,
      overflow: "hidden",
      backgroundColor: colors.border,
    },
    videoPlayBadge: {
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(0,0,0,0.14)",
    },
    videoPlayText: {
      color: "white",
      fontSize: 22,
      fontFamily: fonts.bold,
      textShadowColor: "rgba(0,0,0,0.6)",
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 4,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.62)",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    },
    modalCloseLayer: {
      ...StyleSheet.absoluteFillObject,
    },
    expandedPhotoWrap: {
      width: "92%",
      maxWidth: 420,
      height: "68%",
      borderRadius: 28,
      padding: 10,
      backgroundColor: "rgba(255,255,255,0.14)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.28)",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 18 },
      shadowOpacity: 0.35,
      shadowRadius: 28,
      elevation: 12,
    },
    expandedPhotoGlass: {
      flex: 1,
      borderRadius: 22,
      overflow: "hidden",
      backgroundColor: "rgba(255,255,255,0.08)",
    },
    expandedPhoto: {
      width: "100%",
      height: "100%",
      resizeMode: "contain",
    },
    videoReplayBtn: {
      position: "absolute",
      alignSelf: "center",
      top: "50%",
      width: 64,
      height: 64,
      marginTop: -32,
      borderRadius: 32,
      backgroundColor: "rgba(255,255,255,0.22)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.38)",
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.24,
      shadowRadius: 18,
      elevation: 8,
    },
    videoReplayText: {
      color: "white",
      fontSize: 28,
      fontFamily: fonts.bold,
      marginLeft: 4,
      textShadowColor: "rgba(0,0,0,0.35)",
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 4,
    },
    closePhotoBtn: {
      position: "absolute",
      top: -12,
      right: -10,
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: "rgba(255,255,255,0.22)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.35)",
      alignItems: "center",
      justifyContent: "center",
    },
    closePhotoText: {
      color: "white",
      fontSize: 15,
      fontFamily: fonts.bold,
    },
  });
}
