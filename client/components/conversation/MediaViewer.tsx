import {
  View,
  Text,
  StyleSheet,
  Image,
  Modal,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDecay,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { Gesture, GestureDetector, GestureHandlerRootView, type PanGesture } from "react-native-gesture-handler";
import { scheduleOnRN } from "react-native-worklets";
import { useEventListener } from "expo";
import { VideoView, useVideoPlayer } from "expo-video";
import { BlurView } from "expo-blur";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fonts } from "../../context/ThemeContext";
import {
  MAX_ZOOM,
  Rect,
  dragWithin,
  formatDuration,
  panBounds,
  resistDrag,
  rubberBand,
  seekFraction,
  settleZoom,
  swipeTarget,
  viewerRect,
  zoomAround,
  zoomFrom,
} from "../../lib/mediaLayout";
import MediaPreview, { MediaItem, reportVideoDuration, useMediaRatio, useVideoDuration } from "./MediaPreview";
import { isViewerOpen, useMediaOverlayOpen } from "./mediaOverlay";
import { releaseAudio } from "../../modules/audio-session";

const OPEN_MS = 300;
const CLOSE_MS = 260;
const PAGE_MS = 240;
// Space between pages while swiping.
const PAGE_GAP = 16;
// Drag down this far (or flick faster than this, per second) to close.
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 1000;
// A touch has to move this far before it pages or closes, so taps stay taps.
// A zoomed photo follows the finger a little sooner.
const DRAG_START = 8;
const ZOOMED_DRAG_START = 4;
// Further than this and a tap doesn't count.
const TAP_SLOP = 10;
// Without a measured thumbnail, rise in slightly from below instead.
const FALLBACK_ZOOM = { translateX: 0, translateY: 40, scale: 0.9 };
// Dragging down shrinks the media a little and lets the chat show through.
const DRAG_RANGE = [0, 400];
const RADIUS = 14;
// Height of everything in the video's bottom bar, so it all lines up.
const CONTROLS_HEIGHT = 24;
// How long before the end a video jumps back to the start (seconds).
const LOOP_EARLY_S = 0.2;
const SPRING = { damping: 20, stiffness: 220 };
// A zoomed photo going back inside its edges, or back to 1x, snaps there
// quickly instead of springing.
const SNAP = { duration: 160, easing: Easing.out(Easing.cubic) };

// What the current touch is doing. Each touch does one thing.
const NONE = 0;
const PAGE = 1;
const DISMISS = 2;
const ZOOM = 3;

// Music is let back in once the last viewer closes, even if the viewer that
// showed the video closed while another was opening.
let releasePending = false;

// The viewer's drag, so the video's progress bar can keep it from starting.
const ViewerPan = createContext<PanGesture | null>(null);

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
// through the media (stopping at the first and last), pinch to zoom photos,
// and tap outside, press ✕ or swipe down to close.
//
// Every touch here is handled by react-native-gesture-handler and every
// animation runs on the UI thread with Reanimated. Mixing in React Native's
// own touchables would lose taps: when a gesture starts, it cancels them.
export default function MediaViewer({ items, initialIndex, origins, onClose }: Props) {
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pageWidth = window.width + PAGE_GAP;
  const count = items.length;
  const [index, setIndex] = useState(initialIndex);
  const indexRef = useRef(initialIndex);
  const closingRef = useRef(false);
  useMediaOverlayOpen("viewer");

  // 0 closed, 1 open.
  const progress = useSharedValue(0);
  // Offset of the row of pages: -index * pageWidth when settled.
  const rowX = useSharedValue(-initialIndex * pageWidth);
  // How far the media is dragged down to close.
  const dragY = useSharedValue(0);
  // The current photo's zoom: scale, and offset from the center.
  const scale = useSharedValue(1);
  const zoomX = useSharedValue(0);
  const zoomY = useSharedValue(0);
  // The same values the gestures need, on the UI thread.
  const mode = useSharedValue(NONE);
  const closing = useSharedValue(false);
  const current = useSharedValue(initialIndex);
  const page = useSharedValue(pageWidth);
  const screen = useSharedValue({ width: window.width, height: window.height });
  // The current photo's size at 1x.
  const size = useSharedValue({ width: 0, height: 0 });
  const touchStart = useSharedValue({ x: 0, y: 0 });
  const pinching = useSharedValue(false);
  const pinchIgnored = useSharedValue(false);
  const pinchFrom = useSharedValue(1);
  const pinchLast = useSharedValue(1);

  // Once the viewer closes, let music a video paused start again. A moment
  // later, so the video has stopped first.
  const showedVideo = useRef(false);
  if (items[index]?.type === "video") showedVideo.current = true;
  useEffect(() => {
    return () => {
      if (showedVideo.current) releasePending = true;
      if (!releasePending) return;
      setTimeout(() => {
        if (!releasePending || isViewerOpen()) return;
        releasePending = false;
        releaseAudio();
      }, 300);
    };
  }, []);

  useEffect(() => {
    progress.value = withTiming(1, { duration: OPEN_MS, easing: Easing.out(Easing.cubic) });
  }, [progress]);

  // Keep the current page centered if the window resizes, and start over
  // unzoomed.
  useEffect(() => {
    page.value = pageWidth;
    screen.value = { width: window.width, height: window.height };
    rowX.value = -indexRef.current * pageWidth;
    mode.value = NONE;
    scale.value = 1;
    zoomX.value = 0;
    zoomY.value = 0;
  }, [pageWidth, window.width, window.height, page, screen, rowX, mode, scale, zoomX, zoomY]);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const finishClose = useCallback(() => onCloseRef.current(), []);

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    closing.value = true;
    const timing = { duration: CLOSE_MS, easing: Easing.inOut(Easing.cubic) };
    dragY.value = withTiming(0, timing);
    scale.value = withTiming(1, timing);
    zoomX.value = withTiming(0, timing);
    zoomY.value = withTiming(0, timing);
    progress.value = withTiming(0, timing, () => {
      "worklet";
      scheduleOnRN(finishClose);
    });
  }, [closing, dragY, scale, zoomX, zoomY, progress, finishClose]);

  const settlePage = useCallback((next: number) => {
    indexRef.current = next;
    setIndex(next);
  }, []);

  const isPhoto = items[index]?.type === "image";

  const { pan, root } = useMemo(() => {
    const pan = Gesture.Pan()
      // Decided below from how the touch moves.
      .manualActivation(true)
      .onTouchesDown((event) => {
        "worklet";
        const touch = event.allTouches[0];
        if (event.numberOfTouches === 1 && touch) touchStart.value = { x: touch.absoluteX, y: touch.absoluteY };
      })
      .onTouchesMove((event, state) => {
        "worklet";
        if (closing.value) {
          state.fail();
          return;
        }
        // Once a touch pages or closes, it keeps doing that.
        if (mode.value === PAGE || mode.value === DISMISS) return;
        const touch = event.allTouches[0];
        if (!touch) return;
        const dx = touch.absoluteX - touchStart.value.x;
        const dy = touch.absoluteY - touchStart.value.y;
        const moved = Math.max(Math.abs(dx), Math.abs(dy));
        // Zoomed in: move the photo around.
        if (mode.value === ZOOM || scale.value > 1.01) {
          if (pinching.value || moved >= ZOOMED_DRAG_START) {
            mode.value = ZOOM;
            state.activate();
          }
          return;
        }
        // Two fingers are a pinch, not a swipe.
        if (event.numberOfTouches > 1 || moved < DRAG_START) return;
        // The first clear direction decides: sideways pages, down closes,
        // and anything else (up, or sideways with nothing to page to) does
        // nothing at all.
        if (Math.abs(dx) > Math.abs(dy)) {
          if (count > 1) {
            mode.value = PAGE;
            state.activate();
          } else {
            state.fail();
          }
        } else if (dy > 0) {
          mode.value = DISMISS;
          state.activate();
        } else {
          state.fail();
        }
      })
      .onChange((event) => {
        "worklet";
        if (mode.value === PAGE) {
          rowX.value = -current.value * page.value + resistDrag(current.value, count, event.translationX);
        } else if (mode.value === DISMISS) {
          // Only straight down, the one way that does something.
          dragY.value = Math.max(event.translationY, 0);
        } else if (mode.value === ZOOM) {
          const bounds = panBounds(size.value, scale.value, screen.value);
          zoomX.value = dragWithin(zoomX.value, event.changeX, bounds.x);
          zoomY.value = dragWithin(zoomY.value, event.changeY, bounds.y);
        }
      })
      .onEnd((event, success) => {
        "worklet";
        if (mode.value === PAGE) {
          const next = success
            ? swipeTarget(current.value, count, { dx: event.translationX, vx: event.velocityX / 1000 }, page.value)
            : current.value;
          rowX.value = withTiming(-next * page.value, { duration: PAGE_MS, easing: Easing.out(Easing.cubic) });
          if (next !== current.value) {
            current.value = next;
            scheduleOnRN(settlePage, next);
          }
        } else if (mode.value === DISMISS) {
          if (success && (event.translationY > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY)) {
            scheduleOnRN(close);
          } else {
            dragY.value = withSpring(0, SPRING);
          }
        } else if (mode.value === ZOOM && !pinching.value) {
          // Glide to a stop with the flick, or spring back in from past an edge.
          const rest = settleZoom({ scale: scale.value, x: zoomX.value, y: zoomY.value }, size.value, screen.value);
          const bounds = panBounds(size.value, rest.scale, screen.value);
          zoomX.value = Math.abs(zoomX.value) > bounds.x
            ? withTiming(rest.x, SNAP)
            : withDecay({ velocity: event.velocityX, clamp: [-bounds.x, bounds.x] });
          zoomY.value = Math.abs(zoomY.value) > bounds.y
            ? withTiming(rest.y, SNAP)
            : withDecay({ velocity: event.velocityY, clamp: [-bounds.y, bounds.y] });
        }
      })
      .onFinalize(() => {
        "worklet";
        if (mode.value !== ZOOM || (!pinching.value && scale.value <= 1.01)) mode.value = NONE;
      });

    const pinch = Gesture.Pinch()
      .enabled(isPhoto)
      .onStart(() => {
        "worklet";
        // Not in the middle of paging or closing.
        pinchIgnored.value = closing.value || mode.value === PAGE || mode.value === DISMISS;
        if (pinchIgnored.value) return;
        pinching.value = true;
        mode.value = ZOOM;
        pinchFrom.value = scale.value;
        pinchLast.value = scale.value;
      })
      .onUpdate((event) => {
        "worklet";
        if (pinchIgnored.value) return;
        const next = rubberBand(pinchFrom.value * event.scale, 1, MAX_ZOOM);
        // The photo's center is the screen's center (viewerRect centers it).
        zoomX.value = zoomAround(zoomX.value, pinchLast.value, next, event.focalX, screen.value.width / 2);
        zoomY.value = zoomAround(zoomY.value, pinchLast.value, next, event.focalY, screen.value.height / 2);
        scale.value = next;
        pinchLast.value = next;
      })
      .onEnd(() => {
        "worklet";
        if (pinchIgnored.value) return;
        const rest = settleZoom({ scale: scale.value, x: zoomX.value, y: zoomY.value }, size.value, screen.value);
        scale.value = withTiming(rest.scale, SNAP);
        zoomX.value = withTiming(rest.x, SNAP);
        zoomY.value = withTiming(rest.y, SNAP);
        if (rest.scale === 1) mode.value = NONE;
      })
      .onFinalize(() => {
        "worklet";
        pinching.value = false;
      });

    // Two fingers move the photo while zooming it.
    return { pan, root: Gesture.Simultaneous(pan, pinch) };
  }, [
    count, isPhoto, close, settlePage,
    touchStart, closing, mode, scale, pinching, rowX, current, page, dragY, size, screen, zoomX, zoomY,
    pinchIgnored, pinchFrom, pinchLast,
  ]);

  // A new page starts unzoomed.
  useEffect(() => {
    if (closingRef.current) return;
    scale.value = 1;
    zoomX.value = 0;
    zoomY.value = 0;
  }, [index, scale, zoomX, zoomY]);

  const backdropTap = useMemo(
    () =>
      Gesture.Tap()
        .runOnJS(true)
        .maxDistance(TAP_SLOP)
        .onEnd((_event, success) => {
          if (success) close();
        }),
    [close]
  );

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value * interpolate(dragY.value, DRAG_RANGE, [1, 0.35], Extrapolation.CLAMP),
  }));
  const chromeStyle = useAnimatedStyle(() => ({
    opacity: progress.value * interpolate(dragY.value, [0, 150], [1, 0], Extrapolation.CLAMP),
  }));
  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: rowX.value }] }));

  // Only the current page and its neighbours are mounted.
  const pages = [index - 1, index, index + 1].filter((k) => k >= 0 && k < count);
  const zoom = { scale, x: zoomX, y: zoomY };

  return (
    <Modal transparent statusBarTranslucent visible animationType="none" onRequestClose={close}>
      {/* The viewer is dark in both themes, so the clock and battery go light. */}
      <StatusBar style="light" />
      {/* A Modal is its own window on Android, so gestures need a root here too. */}
      <GestureHandlerRootView style={StyleSheet.absoluteFill}>
        <ViewerPan.Provider value={pan}>
          <GestureDetector gesture={root}>
            <View
              style={StyleSheet.absoluteFill}
              // Touches inside a Modal still bubble up to the chat message it
              // was opened from. Keeping them here means a tap can't like or
              // long-press that message.
              onStartShouldSetResponder={() => true}
              onResponderTerminationRequest={() => false}
            >
              <GestureDetector gesture={backdropTap}>
                <Animated.View
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel="Close media"
                  accessibilityActions={[{ name: "activate" }]}
                  onAccessibilityAction={close}
                  style={[StyleSheet.absoluteFill, backdropStyle]}
                >
                  <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
                  <View style={[StyleSheet.absoluteFill, styles.dim]} />
                </Animated.View>
              </GestureDetector>

              <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, rowStyle]}>
                {pages.map((k) => (
                  <ViewerPage
                    key={`${items[k].uri}-${k}`}
                    item={items[k]}
                    left={k * pageWidth}
                    current={k === index}
                    origin={origins[k] ?? null}
                    window={window}
                    progress={progress}
                    dragY={dragY}
                    zoom={zoom}
                    size={size}
                  />
                ))}
              </Animated.View>

              <Animated.View pointerEvents="box-none" style={[styles.topBar, { top: insets.top + 8 }, chromeStyle]}>
                {count > 1 ? (
                  <Text style={styles.counter}>
                    {index + 1} / {count}
                  </Text>
                ) : (
                  <View />
                )}
                <ViewerButton label="Close media" style={styles.closeBtn} onPress={close}>
                  <Text style={styles.closeText}>✕</Text>
                </ViewerButton>
              </Animated.View>
            </View>
          </GestureDetector>
        </ViewerPan.Provider>
      </GestureHandlerRootView>
    </Modal>
  );
}

function ViewerPage({ item, left, current, origin, window, progress, dragY, zoom, size }: {
  item: MediaItem;
  // Where this page sits in the row of pages.
  left: number;
  current: boolean;
  origin: Rect | null;
  window: { width: number; height: number };
  progress: SharedValue<number>;
  dragY: SharedValue<number>;
  zoom: { scale: SharedValue<number>; x: SharedValue<number>; y: SharedValue<number> };
  // Set to this page's size at 1x while it's the current one.
  size: SharedValue<{ width: number; height: number }>;
}) {
  const ratio = useMediaRatio(item);
  const target = useMemo(() => viewerRect(ratio, window), [ratio, window]);
  const from = useMemo(() => (origin ? zoomFrom(origin, target) : FALLBACK_ZOOM), [origin, target]);

  useEffect(() => {
    if (current) size.value = { width: target.width, height: target.height };
  }, [current, target.width, target.height, size]);

  // The current page zooms from its thumbnail, follows the swipe-down drag
  // and pinch zoom; its neighbours just fade with the viewer. Both return
  // the same keys, so nothing is left over when a page stops being current.
  const style = useAnimatedStyle((): ViewStyle => {
    if (!current) {
      return {
        opacity: progress.value,
        borderRadius: RADIUS,
        transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 1 }],
      };
    }
    const p = progress.value;
    const s = zoom.scale.value;
    return {
      opacity: interpolate(p, [0, 0.15, 1], [0, 1, 1]),
      // Zoomed in, the corners stay the same size on screen.
      borderRadius: RADIUS / s,
      transform: [
        { translateX: interpolate(p, [0, 1], [from.translateX, 0]) + zoom.x.value },
        { translateY: interpolate(p, [0, 1], [from.translateY, 0]) + dragY.value + zoom.y.value },
        {
          scale:
            interpolate(p, [0, 1], [from.scale, 1]) *
            interpolate(dragY.value, DRAG_RANGE, [1, 0.8], Extrapolation.CLAMP) *
            s,
        },
      ],
    };
  });

  return (
    <Animated.View
      style={[styles.media, { left: left + target.x, top: target.y, width: target.width, height: target.height }, style]}
      // Screen readers only reach the page on screen.
      accessibilityElementsHidden={!current}
      importantForAccessibility={current ? "auto" : "no-hide-descendants"}
    >
      {item.type === "video" ? (
        // Neighbours get their player too, paused, so a video has loaded by
        // the time it's swiped to, and swiping back to it doesn't reload it.
        <ViewerVideo item={item} active={current} />
      ) : (
        <Image source={{ uri: item.uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
      )}
    </Animated.View>
  );
}

// A button made of a tap gesture, so it works alongside the viewer's swipes.
function ViewerButton({ label, style, onPress, children }: {
  label: string;
  style: StyleProp<ViewStyle>;
  onPress: () => void;
  children: ReactNode;
}) {
  const [pressed, setPressed] = useState(false);
  const onPressRef = useRef(onPress);
  onPressRef.current = onPress;
  const tap = useMemo(
    () =>
      Gesture.Tap()
        .runOnJS(true)
        .maxDistance(TAP_SLOP)
        .onBegin(() => setPressed(true))
        .onFinalize(() => setPressed(false))
        .onEnd((_event, success) => {
          if (success) onPressRef.current();
        }),
    []
  );
  return (
    <GestureDetector gesture={tap}>
      <View
        accessible
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityActions={[{ name: "activate" }]}
        onAccessibilityAction={() => onPressRef.current()}
        style={[style, pressed && styles.pressed]}
      >
        {children}
      </View>
    </GestureDetector>
  );
}

// Plays as soon as it's the current page and loops; swiping away unmounts it,
// which stops it. Tap the video to pause or play, or use the bar along the
// bottom: play/pause on the left, drag anywhere on the bar to jump there, and
// the video's length on the right.
function ViewerVideo({ item, active }: { item: MediaItem; active: boolean }) {
  const uri = item.uri;
  // The player is released when this unmounts, which stops the video.
  const player = useVideoPlayer(uri, (p) => {
    // A backup: the viewer normally jumps back to the start just before the
    // end (below), which loops more smoothly.
    p.loop = true;
    // expo-video times are in seconds; this updates the bar 10 times a second.
    p.timeUpdateEventInterval = 0.1;
    // Plays with sound even when the phone is on silent, and pauses other
    // apps' music while it plays (Android: takes audio focus).
    p.audioMixingMode = "auto";
  });
  // This player already knows the length, so don't load it a second time.
  const knownDuration = useVideoDuration(uri, false);
  // Times here are in milliseconds, like the rest of the media code.
  const [playback, setPlayback] = useState({ position: 0, duration: 0, playing: true });
  // While dragging the bar: where it's being dragged to, in milliseconds.
  const [scrubbing, setScrubbing] = useState<number | null>(null);
  // Until the video draws its first frame, its thumbnail covers the black.
  const [frameShown, setFrameShown] = useState(false);
  const resumeAfterScrub = useRef(false);
  const lastSeek = useRef(0);

  const readDuration = () => {
    const ms = player.duration * 1000;
    if (!Number.isFinite(ms) || ms <= 0) return;
    reportVideoDuration(uri, ms);
    setPlayback((current) => ({ ...current, duration: ms }));
  };

  // In case it was ready before the listeners below were attached.
  useEffect(() => {
    if (player.status === "readyToPlay") readDuration();
  }, [player]);

  // Plays while it's the page on screen, and pauses where it is when swiped
  // away. On web, play() only reaches a <video> that is already on the page,
  // so it can't go in the useVideoPlayer setup.
  useEffect(() => {
    if (active) player.play();
    else player.pause();
  }, [player, active]);

  useEventListener(player, "playingChange", ({ isPlaying }) => {
    setPlayback((current) => ({ ...current, playing: isPlaying }));
  });
  useEventListener(player, "timeUpdate", ({ currentTime }) => {
    // expo-video's loop stops at the end and then starts over, which
    // stutters. Jumping back while still playing keeps it going.
    const end = player.duration;
    if (player.playing && end > 1 && currentTime >= end - LOOP_EARLY_S) {
      player.currentTime = 0;
      currentTime = 0;
    }
    setPlayback((current) => ({ ...current, position: currentTime * 1000 }));
    // A backup in case the first-frame event was missed.
    if (currentTime > 0) setFrameShown(true);
  });
  useEventListener(player, "statusChange", ({ status }) => {
    if (status === "readyToPlay") readDuration();
  });

  const duration = playback.duration || knownDuration || 0;
  const position = scrubbing ?? playback.position;

  const toggle = () => {
    if (playback.playing) player.pause();
    else player.play();
  };
  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;

  const tap = useMemo(
    () =>
      Gesture.Tap()
        .runOnJS(true)
        .maxDistance(TAP_SLOP)
        .onEnd((_event, success) => {
          if (success) toggleRef.current();
        }),
    []
  );

  // expo-video always seeks to the exact time.
  const seekTo = (ms: number) => {
    player.currentTime = ms / 1000;
  };

  const label = playback.playing ? "Pause video" : "Play video";
  return (
    <>
      <VideoView
        player={player}
        style={styles.video}
        contentFit="contain"
        // The bar below and the tap-to-pause layer are the controls.
        nativeControls={false}
        fullscreenOptions={{ enable: false }}
        allowsPictureInPicture={false}
        // iOS shows a Live Text button on paused frames, over the length.
        allowsVideoFrameAnalysis={false}
        // Android: a TextureView follows the rounded corners and the zoom
        // animation. It can't change after mounting.
        surfaceType="textureView"
        onFirstFrameRender={() => setFrameShown(true)}
      />

      {/* Web shows the video's own first frame while it loads. */}
      {!frameShown && Platform.OS !== "web" && (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <MediaPreview item={item} resizeMode="contain" badges={false} />
          {active && <ActivityIndicator color="white" style={StyleSheet.absoluteFill} />}
        </View>
      )}

      {/* Tapping the video pauses or plays it. The bar below sits on top, so
          its taps never reach this. */}
      <GestureDetector gesture={tap}>
        <View
          accessible
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityActions={[{ name: "activate" }]}
          onAccessibilityAction={() => toggleRef.current()}
          style={StyleSheet.absoluteFill}
        />
      </GestureDetector>

      {/* One row, all the same height: play/pause, progress, length. */}
      <View style={styles.controls}>
        <ViewerButton label={label} style={styles.controlBtn} onPress={toggle}>
          {/* Drawn rather than text glyphs so they sit exactly centered. */}
          {playback.playing ? (
            <View style={styles.pauseIcon}>
              <View style={styles.pauseBar} />
              <View style={styles.pauseBar} />
            </View>
          ) : (
            <View style={styles.playIcon} />
          )}
        </ViewerButton>
        <ProgressBar
          fraction={duration ? position / duration : 0}
          onScrubStart={() => {
            resumeAfterScrub.current = playback.playing;
            player.pause();
          }}
          onScrub={(fraction) => {
            const ms = fraction * duration;
            setScrubbing(ms);
            // Seek as the finger moves, but not on every single move event.
            const now = Date.now();
            if (now - lastSeek.current > 80) {
              lastSeek.current = now;
              seekTo(ms);
            }
          }}
          onScrubEnd={(fraction) => {
            const ms = fraction * duration;
            setPlayback((current) => ({ ...current, position: ms }));
            setScrubbing(null);
            seekTo(ms);
            if (resumeAfterScrub.current) player.play();
          }}
        />
        <Text style={styles.time}>{formatDuration(duration)}</Text>
      </View>
    </>
  );
}

// A thin bar showing how far the video is. Touch or drag anywhere on it to
// jump there. While a finger is on it, swiping pages or closing the viewer
// can't start.
function ProgressBar({ fraction, onScrubStart, onScrub, onScrubEnd }: {
  fraction: number;
  onScrubStart: () => void;
  onScrub: (fraction: number) => void;
  onScrubEnd: (fraction: number) => void;
}) {
  const viewerPan = useContext(ViewerPan);
  const widthRef = useRef(0);
  const lastRef = useRef(0);
  const [dragFraction, setDragFraction] = useState<number | null>(null);
  const handlers = useRef({ onScrubStart, onScrub, onScrubEnd });
  handlers.current = { onScrubStart, onScrub, onScrubEnd };

  const scrub = useMemo(() => {
    const move = (x: number) => {
      const f = seekFraction(x, widthRef.current);
      lastRef.current = f;
      setDragFraction(f);
      handlers.current.onScrub(f);
    };
    const gesture = Gesture.Pan()
      .runOnJS(true)
      .minDistance(0)
      // On touch down, so a tap jumps there too. x is relative to the bar.
      .onBegin((event) => {
        handlers.current.onScrubStart();
        move(event.x);
      })
      .onUpdate((event) => move(event.x))
      .onFinalize(() => {
        setDragFraction(null);
        handlers.current.onScrubEnd(lastRef.current);
      });
    return viewerPan ? gesture.blocksExternalGesture(viewerPan) : gesture;
  }, [viewerPan]);

  const shown = Math.min(1, Math.max(0, dragFraction ?? fraction));
  return (
    <GestureDetector gesture={scrub}>
      <View
        accessibilityRole="adjustable"
        accessibilityLabel="Video progress"
        style={styles.track}
        onLayout={(event) => {
          widthRef.current = event.nativeEvent.layout.width;
        }}
      >
        <View pointerEvents="none" style={styles.trackLine}>
          <View style={[styles.trackFill, { width: `${shown * 100}%` }]} />
        </View>
        <View
          pointerEvents="none"
          style={[styles.knob, dragFraction !== null && styles.knobActive, { left: `${shown * 100}%` }]}
        />
      </View>
    </GestureDetector>
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
    borderRadius: RADIUS,
    overflow: "hidden",
  },
  // The size too, not just the edges: on web a <video> otherwise keeps its own
  // size.
  video: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  topBar: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  // The shadows keep the counter and ✕ readable over a bright zoomed photo.
  counter: {
    color: "white",
    fontSize: 15,
    fontFamily: fonts.bold,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowRadius: 4,
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
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowRadius: 4,
  },
  pressed: {
    opacity: 0.7,
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
  // The whole height of the bar and a little wider than the icon, so it's
  // easy to hit; the negative margins keep the icon where it was.
  controlBtn: {
    width: CONTROLS_HEIGHT + 16,
    height: CONTROLS_HEIGHT + 12,
    marginHorizontal: -8,
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
