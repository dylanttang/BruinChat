import { View, Text, StyleSheet, Image, Platform } from "react-native";
import { Audio, ResizeMode, Video } from "expo-av";
import * as VideoThumbnails from "expo-video-thumbnails";
import { useEffect, useState, useSyncExternalStore } from "react";
import { fonts } from "../../context/ThemeContext";
import { Rect, formatDuration } from "../../lib/mediaLayout";

export type MediaItem = { uri: string; type: "image" | "video" };

// Shapes (width / height) and video thumbnails are remembered for the whole
// session, so the chat, the grid and the viewer agree on a photo's shape and
// nothing resizes or regenerates when a list re-renders.
const ratios = new Map<string, number>();
const listeners = new Set<() => void>();
const thumbnails = new Map<string, Promise<string>>();
const thumbnailUris = new Map<string, string>();
const durations = new Map<string, number>();
const durationLoads = new Set<string>();

function notify() {
  listeners.forEach((listener) => listener());
}

function setRatio(uri: string, ratio: number) {
  if (!Number.isFinite(ratio) || ratio <= 0 || ratios.get(uri) === ratio) return;
  ratios.set(uri, ratio);
  notify();
}

// Remembers a video's length once anything has loaded it (a preview or the viewer).
export function reportVideoDuration(uri: string, ms: number | undefined) {
  if (!ms || !Number.isFinite(ms) || durations.get(uri) === ms) return;
  durations.set(uri, ms);
  notify();
}

// Reads just the video's length (and, on web, its shape), without playing it.
function loadDuration(uri: string) {
  if (durations.has(uri) || durationLoads.has(uri)) return;
  durationLoads.add(uri);
  const done = (ms: number) => {
    if (ms) reportVideoDuration(uri, ms);
    else durationLoads.delete(uri);
  };
  if (Platform.OS === "web") {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => {
      if (video.videoWidth && video.videoHeight) setRatio(uri, video.videoWidth / video.videoHeight);
      done(Number.isFinite(video.duration) ? video.duration * 1000 : 0);
      video.removeAttribute("src");
      video.load();
    };
    video.onerror = () => done(0);
    video.src = uri;
    return;
  }
  Audio.Sound.createAsync({ uri }, { shouldPlay: false })
    .then(({ sound, status }) => {
      done(status.isLoaded ? status.durationMillis ?? 0 : 0);
      sound.unloadAsync().catch(() => {});
    })
    .catch(() => done(0));
}

export function useVideoDuration(uri: string): number | null {
  const read = () => durations.get(uri) ?? null;
  const duration = useSyncExternalStore(subscribe, read, read);
  useEffect(() => {
    loadDuration(uri);
  }, [uri]);
  return duration;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Not available on web; there the video itself, paused, is the preview.
function loadThumbnail(uri: string): Promise<string> {
  let pending = thumbnails.get(uri);
  if (!pending) {
    pending = VideoThumbnails.getThumbnailAsync(uri, { time: 0 }).then(({ uri: thumbnailUri, width, height }) => {
      if (width && height) setRatio(uri, width / height);
      thumbnailUris.set(uri, thumbnailUri);
      return thumbnailUri;
    });
    pending.catch(() => thumbnails.delete(uri));
    thumbnails.set(uri, pending);
  }
  return pending;
}

export function useMediaRatio(item: MediaItem): number | null {
  const read = () => ratios.get(item.uri) ?? null;
  const ratio = useSyncExternalStore(subscribe, read, read);

  useEffect(() => {
    if (ratios.has(item.uri)) return;
    if (item.type === "image") {
      Image.getSize(item.uri, (width, height) => width && height && setRatio(item.uri, width / height), () => {});
    } else if (Platform.OS !== "web") {
      loadThumbnail(item.uri).catch(() => {});
    }
  }, [item.uri, item.type]);

  return ratio;
}

function useVideoThumbnail(uri: string): string | null {
  const [thumbnail, setThumbnail] = useState(() => thumbnailUris.get(uri) ?? null);

  useEffect(() => {
    let live = true;
    loadThumbnail(uri)
      .then((thumbnailUri) => live && setThumbnail(thumbnailUri))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [uri]);

  return thumbnail;
}

// Reads the real size of a web video once it can show its first frame.
// Native passes naturalSize; web passes the <video> element's event.
export function reportVideoSize(uri: string, event: any) {
  const width = event?.naturalSize?.width ?? event?.target?.videoWidth;
  const height = event?.naturalSize?.height ?? event?.target?.videoHeight;
  if (width && height) setRatio(uri, width / height);
}

export function measureInWindow(view: View | null): Promise<Rect | null> {
  return new Promise((resolve) => {
    if (!view?.measureInWindow) {
      resolve(null);
      return;
    }
    view.measureInWindow((x, y, width, height) => resolve(width && height ? { x, y, width, height } : null));
  });
}

// Fills its parent with the photo, or the video's first frame with a small ▶
// in the top right (and, in grids, its length in the bottom right).
export default function MediaPreview({ item, resizeMode = "cover", badges = true, showDuration = false }: {
  item: MediaItem;
  resizeMode?: "cover" | "contain";
  badges?: boolean;
  showDuration?: boolean;
}) {
  if (item.type === "image") {
    return <Image source={{ uri: item.uri }} style={StyleSheet.absoluteFill} resizeMode={resizeMode} />;
  }
  return (
    <>
      {Platform.OS === "web" ? (
        <WebVideoFrame uri={item.uri} resizeMode={resizeMode} />
      ) : (
        <NativeVideoFrame uri={item.uri} resizeMode={resizeMode} />
      )}
      {badges && (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View style={styles.playBadge}>
            <Text style={styles.playText}>▶</Text>
          </View>
          {showDuration && <DurationBadge uri={item.uri} />}
        </View>
      )}
    </>
  );
}

function DurationBadge({ uri }: { uri: string }) {
  const duration = useVideoDuration(uri);
  if (!duration) return null;
  return (
    <View style={styles.durationBadge}>
      <Text style={styles.durationText}>{formatDuration(duration)}</Text>
    </View>
  );
}

function WebVideoFrame({ uri, resizeMode }: { uri: string; resizeMode: "cover" | "contain" }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Video
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        resizeMode={resizeMode === "cover" ? ResizeMode.COVER : ResizeMode.CONTAIN}
        shouldPlay={false}
        isMuted
        onReadyForDisplay={(event) => reportVideoSize(uri, event)}
      />
    </View>
  );
}

function NativeVideoFrame({ uri, resizeMode }: { uri: string; resizeMode: "cover" | "contain" }) {
  const thumbnail = useVideoThumbnail(uri);
  return thumbnail ? <Image source={{ uri: thumbnail }} style={StyleSheet.absoluteFill} resizeMode={resizeMode} /> : null;
}

const styles = StyleSheet.create({
  playBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  playText: {
    color: "white",
    fontSize: 11,
    marginLeft: 2,
  },
  durationBadge: {
    position: "absolute",
    right: 8,
    bottom: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  durationText: {
    color: "white",
    fontSize: 12,
    fontFamily: fonts.bold,
  },
});
