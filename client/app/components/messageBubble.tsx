import { View, Text, StyleSheet, TouchableOpacity, Image, Modal, Pressable } from "react-native";
import { ResizeMode, Video } from "expo-av";
import * as VideoThumbnails from "expo-video-thumbnails";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme, Colors } from "../context/ThemeContext";
import { API_URL } from "../lib/api";

type MediaKind = "image" | "video";

type ReplyMessage = {
  _id: string;
  text: string;
  mediaUrl?: string;
  mediaUrls?: string[];
  mediaTypes?: MediaKind[];
  senderId: { displayName: string };
};

type Props = {
  item: {
    id: string;
    user: string;
    text: string;
    time: string;
    mine: boolean;
    mediaUrl?: string;
    mediaUrls?: string[];
    mediaTypes?: MediaKind[];
    replyTo?: ReplyMessage | null;
  };
  onLongPress?: () => void;
};

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

export default function MessageBubble({ item, onLongPress }: Props) {
  const isMe = item.mine;
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [expandedMedia, setExpandedMedia] = useState<{ uri: string; type: MediaKind } | null>(null);
  const [videoEnded, setVideoEnded] = useState(false);
  const expandedVideoRef = useRef<Video>(null);
  const mediaUrls = item.mediaUrls?.length ? item.mediaUrls : item.mediaUrl ? [item.mediaUrl] : [];
  const toImageUri = (url: string) => (url.startsWith("http") || url.startsWith("file:") ? url : `${API_URL}${url}`);
  const getMediaKind = (url: string, index: number): MediaKind => item.mediaTypes?.[index] || (isVideoUrl(url) ? "video" : "image");

  useEffect(() => {
    setVideoEnded(false);
  }, [expandedMedia?.uri]);

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.8}
        onLongPress={onLongPress}
        style={[styles.row, { justifyContent: isMe ? "flex-end" : "flex-start" }]}
      >
        {!isMe && <View style={styles.avatar} />}

        <View style={{ maxWidth: "75%" }}>
          {!isMe && <Text style={styles.username}>{item.user}</Text>}

          <View
            style={[
              styles.bubble,
              isMe ? styles.myBubble : styles.otherBubble,
              mediaUrls.length > 0 && styles.mediaBubble,
            ]}
          >
            {item.replyTo && (
              <View style={[styles.replyPreview, isMe ? styles.replyPreviewMe : styles.replyPreviewOther]}>
                <Text style={styles.replyName}>{item.replyTo.senderId.displayName}</Text>
                <Text style={styles.replyText} numberOfLines={1}>{getReplySummary(item.replyTo)}</Text>
              </View>
            )}
            {mediaUrls.length > 0 && (
              <View style={styles.photoGrid}>
                {mediaUrls.map((url, index) => {
                  const mediaUri = toImageUri(url);
                  const mediaType = getMediaKind(url, index);
                  return (
                    <TouchableOpacity
                      key={`${url}-${index}`}
                      activeOpacity={0.85}
                      onLongPress={onLongPress}
                      onPress={() => setExpandedMedia({ uri: mediaUri, type: mediaType })}
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
              <Text style={{ color: isMe ? "white" : colors.text, fontSize: 16 }}>
                {item.text}
              </Text>
            )}
          </View>

          <Text style={[styles.time, { alignSelf: isMe ? "flex-end" : "flex-start" }]}>
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
      fontSize: 12,
      color: colors.subtext,
      marginBottom: 2,
    },
    bubble: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 18,
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
      backgroundColor: "#007AFF",
      borderBottomRightRadius: 6,
    },
    otherBubble: {
      backgroundColor: colors.inputBg,
      borderBottomLeftRadius: 6,
    },
    replyPreview: {
      borderRadius: 8,
      padding: 6,
      marginBottom: 6,
    },
    replyPreviewMe: {
      backgroundColor: "rgba(255,255,255,0.2)",
    },
    replyPreviewOther: {
      backgroundColor: colors.border,
    },
    replyName: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.mutedText,
      marginBottom: 1,
    },
    replyText: {
      fontSize: 12,
      color: colors.subtext,
    },
    time: {
      fontSize: 10,
      color: colors.mutedText,
      marginTop: 2,
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
      fontWeight: "700",
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
      fontWeight: "700",
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
      fontWeight: "700",
    },
  });
}
