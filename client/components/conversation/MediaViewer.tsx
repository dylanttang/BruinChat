import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Modal,
  Pressable,
  Animated,
  Easing,
  PanResponder,
  Platform,
  useWindowDimensions,
  type ViewStyle,
} from "react-native";
import { ResizeMode, Video } from "expo-av";
import { BlurView } from "expo-blur";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useEffect, useMemo, useRef, useState } from "react";
import { fonts } from "../../context/ThemeContext";
import { Rect, formatDuration, resistDrag, seekFraction, swipeTarget, viewerRect, zoomFrom } from "../../lib/mediaLayout";
import MediaPreview, { MediaItem, reportVideoDuration, reportVideoSize, useMediaRatio, useVideoDuration } from "./MediaPreview";

const OPEN_MS = 300;
const CLOSE_MS = 260;
const PAGE_MS = 240;
// Space between pages while swiping.
const PAGE_GAP = 16;
// Drag down this far (or flick) to close.
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 1;
// Without a measured thumbnail, rise in slightly from below instead.
const FALLBACK_ZOOM = { translateX: 0, translateY: 40, scale: 0.9 };
// Dragging down shrinks the media a little and lets the chat show through.
const DRAG_RANGE = [0, 400];
// Height of everything in the video's bottom bar, so it all lines up.
const CONTROLS_HEIGHT = 24;
// The native driver isn't available on web.
const useNativeDriver = Platform.OS !== "web";

type Props = {
  items: MediaItem[];
  initialIndex: number;
  // Where each item's thumbnail is on screen (null if it isn't visible), so
  // the viewer grows out of it and shrinks back into it.
  origins: (Rect | null)[];
  onClose: () => void;
};

// Instagram-style full-screen viewer: the chat blurs out behind the media,
// which grows from its spot and shrinks back on close. Swipe left and right
// through the message's media (stopping at the first and last), and tap
// outside, press ✕ or swipe down to close.
export default function MediaViewer({ items, initialIndex, origins, onClose }: Props) {
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pageWidth = window.width + PAGE_GAP;
  const [index, setIndex] = useState(initialIndex);
  const progress = useRef(new Animated.Value(0)).current;
  // Vertical drag (swipe down to close).
  const pan = useRef(new Animated.ValueXY()).current;
  // Horizontal position of the row of pages: -index * pageWidth when settled.
  const position = useRef(new Animated.Value(-initialIndex * pageWidth)).current;
  const closingRef = useRef(false);
  const indexRef = useRef(initialIndex);
  const pageWidthRef = useRef(pageWidth);
  const axisRef = useRef<"x" | "y" | null>(null);
  // Whether the current touch turned into a swipe. On web the browser still
  // sends a click when a swipe ends, which would otherwise close the viewer.
  const swipedRef = useRef(false);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: OPEN_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver,
    }).start();
  }, [progress]);

  // Keep the current page centered if the window resizes.
  useEffect(() => {
    pageWidthRef.current = pageWidth;
    position.setValue(-indexRef.current * pageWidth);
  }, [pageWidth, position]);

  const close = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    Animated.parallel([
      Animated.timing(progress, { toValue: 0, duration: CLOSE_MS, easing: Easing.inOut(Easing.cubic), useNativeDriver }),
      Animated.timing(pan, { toValue: { x: 0, y: 0 }, duration: CLOSE_MS, easing: Easing.inOut(Easing.cubic), useNativeDriver }),
    ]).start(() => onClose());
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  const panResponder = useMemo(() => {
    const settlePage = (next: number) => {
      indexRef.current = next;
      setIndex(next);
      Animated.timing(position, {
        toValue: -next * pageWidthRef.current,
        duration: PAGE_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver,
      }).start();
    };
    const springBack = () => {
      Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver, bounciness: 4 }).start();
    };

    return PanResponder.create({
      // Runs first on every new touch, before anything claims it.
      onStartShouldSetPanResponderCapture: () => {
        swipedRef.current = false;
        return false;
      },
      onPanResponderGrant: () => {
        swipedRef.current = true;
      },
      // Only claim clear drags, so taps (and video controls) still work. The
      // first clear direction decides: sideways pages, downwards closes.
      onMoveShouldSetPanResponder: (_, g) => {
        if (closingRef.current || (Math.abs(g.dx) < 8 && Math.abs(g.dy) < 8)) return false;
        const axis = Math.abs(g.dx) > Math.abs(g.dy) ? "x" : "y";
        if (axis === "x" && items.length < 2) return false;
        axisRef.current = axis;
        return true;
      },
      onPanResponderMove: (_, g) => {
        if (axisRef.current === "x") {
          const i = indexRef.current;
          position.setValue(-i * pageWidthRef.current + resistDrag(i, items.length, g.dx));
        } else {
          pan.setValue({ x: g.dx, y: Math.max(g.dy, -40) });
        }
      },
      onPanResponderRelease: (_, g) => {
        if (axisRef.current === "x") {
          settlePage(swipeTarget(indexRef.current, items.length, g, pageWidthRef.current));
        } else if (g.dy > DISMISS_DISTANCE || g.vy > DISMISS_VELOCITY) {
          closeRef.current();
        } else {
          springBack();
        }
      },
      onPanResponderTerminate: () => {
        if (axisRef.current === "x") settlePage(indexRef.current);
        else springBack();
      },
    });
  }, [items.length, pan, position]);

  const backdropOpacity = Animated.multiply<number>(
    progress,
    pan.y.interpolate<number>({ inputRange: DRAG_RANGE, outputRange: [1, 0.35], extrapolate: "clamp" })
  );
  const chromeOpacity = Animated.multiply<number>(
    progress,
    pan.y.interpolate<number>({ inputRange: [0, 150], outputRange: [1, 0], extrapolate: "clamp" })
  );

  // Only the current page and its neighbours are mounted.
  const pages = [index - 1, index, index + 1].filter((k) => k >= 0 && k < items.length);

  return (
    <Modal transparent statusBarTranslucent visible animationType="none" onRequestClose={close}>
      {/* The viewer is dark in both themes, so the clock and battery go light. */}
      <StatusBar style="light" />
      <View style={StyleSheet.absoluteFill} {...panResponder.panHandlers}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: backdropOpacity }]}>
          <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, styles.dim]} />
        </Animated.View>
        <Pressable
          accessibilityLabel="Close media"
          style={StyleSheet.absoluteFill}
          onPress={() => {
            if (!swipedRef.current) close();
          }}
        />

        <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { transform: [{ translateX: position }] }]}>
          {pages.map((k) => (
            <ViewerPage
              key={`${items[k].uri}-${k}`}
              item={items[k]}
              left={k * pageWidth}
              current={k === index}
              origin={origins[k] ?? null}
              window={window}
              progress={progress}
              pan={pan}
              wasSwipe={() => swipedRef.current}
            />
          ))}
        </Animated.View>

        <Animated.View pointerEvents="box-none" style={[styles.topBar, { top: insets.top + 8, opacity: chromeOpacity }]}>
          {items.length > 1 ? (
            <Text style={styles.counter}>
              {index + 1} / {items.length}
            </Text>
          ) : (
            <View />
          )}
          <TouchableOpacity accessibilityLabel="Close media" activeOpacity={0.8} style={styles.closeBtn} onPress={close}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

function ViewerPage({ item, left, current, origin, window, progress, pan, wasSwipe }: {
  item: MediaItem;
  // Where this page sits in the row of pages.
  left: number;
  current: boolean;
  origin: Rect | null;
  window: { width: number; height: number };
  progress: Animated.Value;
  pan: Animated.ValueXY;
  // True if the touch that just ended was a swipe rather than a tap.
  wasSwipe: () => boolean;
}) {
  const ratio = useMediaRatio(item);
  const target = useMemo(() => viewerRect(ratio, window), [ratio, window]);
  const zoom = useMemo(() => (origin ? zoomFrom(origin, target) : FALLBACK_ZOOM), [origin, target]);

  // The current page zooms from its thumbnail and follows the swipe-down drag;
  // its neighbours just fade with the viewer.
  const style: Animated.WithAnimatedValue<ViewStyle> = current
    ? {
        opacity: progress.interpolate<number>({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 1] }),
        transform: [
          { translateX: Animated.add<number>(progress.interpolate<number>({ inputRange: [0, 1], outputRange: [zoom.translateX, 0] }), pan.x) },
          { translateY: Animated.add<number>(progress.interpolate<number>({ inputRange: [0, 1], outputRange: [zoom.translateY, 0] }), pan.y) },
          {
            scale: Animated.multiply<number>(
              progress.interpolate<number>({ inputRange: [0, 1], outputRange: [zoom.scale, 1] }),
              pan.y.interpolate<number>({ inputRange: DRAG_RANGE, outputRange: [1, 0.8], extrapolate: "clamp" })
            ),
          },
        ],
      }
    : { opacity: progress };

  return (
    <Animated.View
      style={[
        styles.media,
        { left: left + target.x, top: target.y, width: target.width, height: target.height },
        style,
      ]}
    >
      {item.type === "video" && current ? (
        <ViewerVideo uri={item.uri} wasSwipe={wasSwipe} />
      ) : item.type === "video" ? (
        <MediaPreview item={item} resizeMode="contain" badges={false} />
      ) : (
        <Image source={{ uri: item.uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
      )}
    </Animated.View>
  );
}

// Plays as soon as it's the current page and loops; swiping away unmounts it,
// which stops it. Tap the video to pause or play, or use the bar along the
// bottom: play/pause on the left, drag anywhere on the bar to jump there, and
// the video's length on the right.
function ViewerVideo({ uri, wasSwipe }: { uri: string; wasSwipe: () => boolean }) {
  const videoRef = useRef<Video>(null);
  const knownDuration = useVideoDuration(uri);
  const [playback, setPlayback] = useState({ position: 0, duration: 0, playing: true });
  // While dragging the bar: where it's being dragged to, in milliseconds.
  const [scrubbing, setScrubbing] = useState<number | null>(null);
  const resumeAfterScrub = useRef(false);
  const lastSeek = useRef(0);

  const duration = playback.duration || knownDuration || 0;
  const position = scrubbing ?? playback.position;

  const toggle = () => {
    const video = videoRef.current;
    if (!video) return;
    if (playback.playing) video.pauseAsync().catch(() => {});
    else video.playAsync().catch(() => {});
  };

  const seekTo = (ms: number, exact: boolean) => {
    const tolerance = exact ? 0 : 250;
    return videoRef.current
      ?.setPositionAsync(ms, { toleranceMillisBefore: tolerance, toleranceMillisAfter: tolerance })
      .catch(() => {});
  };

  return (
    <>
      <Video
        ref={videoRef}
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        resizeMode={ResizeMode.CONTAIN}
        shouldPlay
        isLooping
        progressUpdateIntervalMillis={250}
        onReadyForDisplay={(event) => reportVideoSize(uri, event)}
        onPlaybackStatusUpdate={(status) => {
          if (!status.isLoaded) return;
          reportVideoDuration(uri, status.durationMillis);
          setPlayback({
            position: status.positionMillis,
            duration: status.durationMillis ?? 0,
            playing: status.isPlaying,
          });
        }}
      />

      {/* Tapping the video pauses or plays it. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={playback.playing ? "Pause video" : "Play video"}
        style={StyleSheet.absoluteFill}
        onPress={() => {
          if (!wasSwipe()) toggle();
        }}
      />

      {/* One row, all the same height: play/pause, progress, length. */}
      <View style={styles.controls}>
        <TouchableOpacity
          accessibilityLabel={playback.playing ? "Pause video" : "Play video"}
          activeOpacity={0.7}
          hitSlop={8}
          style={styles.controlBtn}
          onPress={toggle}
        >
          {/* Drawn rather than text glyphs so they sit exactly centered. */}
          {playback.playing ? (
            <View style={styles.pauseIcon}>
              <View style={styles.pauseBar} />
              <View style={styles.pauseBar} />
            </View>
          ) : (
            <View style={styles.playIcon} />
          )}
        </TouchableOpacity>
        <ProgressBar
          fraction={duration ? position / duration : 0}
          onScrubStart={() => {
            resumeAfterScrub.current = playback.playing;
            videoRef.current?.pauseAsync().catch(() => {});
          }}
          onScrub={(fraction) => {
            const ms = fraction * duration;
            setScrubbing(ms);
            // Seek as the finger moves, but not on every single move event.
            const now = Date.now();
            if (now - lastSeek.current > 80) {
              lastSeek.current = now;
              seekTo(ms, false);
            }
          }}
          onScrubEnd={(fraction) => {
            const ms = fraction * duration;
            setPlayback((current) => ({ ...current, position: ms }));
            setScrubbing(null);
            Promise.resolve(seekTo(ms, true)).then(() => {
              if (resumeAfterScrub.current) videoRef.current?.playAsync().catch(() => {});
            });
          }}
        />
        <Text style={styles.time}>{formatDuration(duration)}</Text>
      </View>
    </>
  );
}

// A thin bar showing how far the video is. Touch or drag anywhere on it to
// jump there; while dragging it keeps the touch, so swiping pages or closing
// the viewer never starts from here.
function ProgressBar({ fraction, onScrubStart, onScrub, onScrubEnd }: {
  fraction: number;
  onScrubStart: () => void;
  onScrub: (fraction: number) => void;
  onScrubEnd: (fraction: number) => void;
}) {
  const widthRef = useRef(0);
  const startXRef = useRef(0);
  const [dragFraction, setDragFraction] = useState<number | null>(null);
  const handlers = useRef({ onScrubStart, onScrub, onScrubEnd });
  handlers.current = { onScrubStart, onScrub, onScrubEnd };

  const responder = useMemo(() => {
    const at = (dx: number) => seekFraction(startXRef.current + dx, widthRef.current);
    const finish = (dx: number) => {
      const f = at(dx);
      setDragFraction(null);
      handlers.current.onScrubEnd(f);
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event) => {
        // The fill and knob ignore touches, so this is always relative to the bar.
        startXRef.current = event.nativeEvent.locationX;
        const f = at(0);
        setDragFraction(f);
        handlers.current.onScrubStart();
        handlers.current.onScrub(f);
      },
      onPanResponderMove: (_, g) => {
        const f = at(g.dx);
        setDragFraction(f);
        handlers.current.onScrub(f);
      },
      onPanResponderRelease: (_, g) => finish(g.dx),
      onPanResponderTerminate: (_, g) => finish(g.dx),
    });
  }, []);

  const shown = Math.min(1, Math.max(0, dragFraction ?? fraction));
  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel="Video progress"
      style={styles.track}
      onLayout={(event) => {
        widthRef.current = event.nativeEvent.layout.width;
      }}
      {...responder.panHandlers}
    >
      <View pointerEvents="none" style={styles.trackLine}>
        <View style={[styles.trackFill, { width: `${shown * 100}%` }]} />
      </View>
      <View
        pointerEvents="none"
        style={[styles.knob, dragFraction !== null && styles.knobActive, { left: `${shown * 100}%` }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Extra dimming on top of the blur so the media stands out (and so Android,
  // where the blur is a translucent fallback, still darkens the chat).
  dim: {
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  media: {
    position: "absolute",
    borderRadius: 14,
    overflow: "hidden",
  },
  topBar: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  counter: {
    color: "white",
    fontSize: 15,
    fontFamily: fonts.bold,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: {
    color: "white",
    fontSize: 16,
    fontFamily: fonts.bold,
  },
  controls: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: CONTROLS_HEIGHT + 12,
    paddingHorizontal: 12,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  controlBtn: {
    width: CONTROLS_HEIGHT,
    height: CONTROLS_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  // A triangle pointing right, nudged so it looks centered.
  playIcon: {
    width: 0,
    height: 0,
    marginLeft: 2,
    borderTopWidth: 6,
    borderBottomWidth: 6,
    borderLeftWidth: 10,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderLeftColor: "white",
  },
  pauseIcon: {
    flexDirection: "row",
    gap: 3,
  },
  pauseBar: {
    width: 3,
    height: 12,
    borderRadius: 1,
    backgroundColor: "white",
  },
  time: {
    color: "white",
    fontSize: 12,
    lineHeight: CONTROLS_HEIGHT,
    fontFamily: fonts.bold,
    minWidth: 32,
    textAlign: "right",
  },
  // The touch area is taller than the line so it's easy to grab.
  track: {
    flex: 1,
    height: CONTROLS_HEIGHT,
    justifyContent: "center",
  },
  trackLine: {
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.3)",
    overflow: "hidden",
  },
  trackFill: {
    height: "100%",
    backgroundColor: "white",
  },
  knob: {
    position: "absolute",
    width: 12,
    height: 12,
    marginLeft: -6,
    borderRadius: 6,
    backgroundColor: "white",
  },
  knobActive: {
    width: 16,
    height: 16,
    marginLeft: -8,
    borderRadius: 8,
  },
});
