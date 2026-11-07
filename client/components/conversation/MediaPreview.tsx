import { View, Text, StyleSheet, Image, Platform } from "react-native";
import { VideoView, createVideoPlayer, useVideoPlayer } from "expo-video";
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
  durationQueue.push({ uri, done });
  runDurationQueue();
}

// On iOS and Android a hidden, muted player that never plays reads the
// length, then is released. A few at a time, so a message with many videos
// doesn't open them all at once.
const MAX_DURATION_LOADS = 3;
const DURATION_TIMEOUT_MS = 15000;
const durationQueue: { uri: string; done: (ms: number) => void }[] = [];
let activeDurationLoads = 0;

function runDurationQueue() {
  while (activeDurationLoads < MAX_DURATION_LOADS && durationQueue.length) {
    const { uri, done } = durationQueue.shift()!;
    activeDurationLoads++;
    readNativeDuration(uri, (ms) => {
      activeDurationLoads--;
      done(ms);
      runDurationQueue();
    });
  }
}

function readNativeDuration(uri: string, done: (ms: number) => void) {
  const player = createVideoPlayer(uri);
  player.muted = true;
  let finished = false;
  const finish = (ms: number) => {
    if (finished) return;
    finished = true;
    clearTimeout(timeout);
    loaded.remove();
    failed.remove();
    player.release();
    done(Number.isFinite(ms) ? ms : 0);
  };
  const loaded = player.addListener("sourceLoad", ({ duration }) => finish(duration * 1000));
  const failed = player.addListener("statusChange", ({ status }) => {
    if (status === "error") finish(0);
  });
  const timeout = setTimeout(() => finish(0), DURATION_TIMEOUT_MS);
}

// load: false only reads a length something else already found (the viewer
// gets it from its own player).
export function useVideoDuration(uri: string, load = true): number | null {
  const read = () => durations.get(uri) ?? null;
  const duration = useSyncExternalStore(subscribe, read, read);
  useEffect(() => {
    if (load) loadDuration(uri);
  }, [uri, load]);
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
    } else if (Platform.OS === "web") {
      // On web, reading the length also reads the shape.
      loadDuration(item.uri);
    } else {
      // The thumbnail is already rotated upright, so its shape is the video's.
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

// A muted player that never plays, so the <video> shows its first frame.
function WebVideoFrame({ uri, resizeMode }: { uri: string; resizeMode: "cover" | "contain" }) {
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true;
  });
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit={resizeMode} nativeControls={false} />
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
