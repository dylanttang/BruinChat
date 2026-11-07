import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Animated,
  Easing,
  Platform,
  PanResponder,
  useWindowDimensions,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme, fonts, Colors } from "../../context/ThemeContext";
import { Rect, zoomFrom } from "../../lib/mediaLayout";
import MediaPreview, { MediaItem, measureInWindow } from "./MediaPreview";
import MediaViewer from "./MediaViewer";
import { isViewerOpen, useMediaOverlayOpen } from "./mediaOverlay";

const GAP = 4;
const PADDING = 8;
const HEADER_HEIGHT = 60;
const OPEN_MS = 320;
const CLOSE_MS = 280;
// Drag down this far (or flick) to close.
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 1;
// Without a measured chat tile, rise in slightly from below instead.
const FALLBACK_ZOOM = { translateX: 0, translateY: 40, scale: 0.9 };
// The native driver isn't available on web.
const useNativeDriver = Platform.OS !== "web";

type Props = {
  items: MediaItem[];
  // Where each item's tile is in the chat (null if it isn't shown there), so
  // the photos fly out of the message into the grid and back.
  origins: (Rect | null)[];
  onClose: () => void;
};

// Every photo and video in a message, as a grid. It grows out of the message
// and shrinks back into it (✕, back, or swipe down from the top). Tapping one opens the swipeable viewer on top;
// closing that comes back here.
export default function MediaGallery({ items, origins, onClose }: Props) {
  useMediaOverlayOpen("gallery");
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0)).current;
  // How far the grid is being dragged down to close it.
  const drag = useRef(new Animated.Value(0)).current;
  const cellRefs = useRef<(View | null)[]>([]);
  const scrollYRef = useRef(0);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Set when closing starts: how far the grid was scrolled, so each photo
  // flies back from where it actually is.
  const [closingScroll, setClosingScroll] = useState<number | null>(null);
  const [viewer, setViewer] = useState<{ index: number; origins: (Rect | null)[] } | null>(null);

  // 6 items fit on screen at once (more scroll): 2 across × 3 down on a tall
  // screen like a phone, 3 across × 2 down on a wide one like a browser window.
  const wideScreen = window.width > window.height;
  const COLUMNS = wideScreen ? 3 : 2;
  const FIT_ROWS = wideScreen ? 2 : 3;
  // Cells are as big as possible while 6 still fit, so on a wide screen they
  // don't grow past the screen's height.
  const availableWidth = window.width - PADDING * 2;
  const availableHeight = window.height - insets.top - insets.bottom - HEADER_HEIGHT - PADDING * 2;
  const cell = Math.max(60, Math.floor(Math.min(
    (availableWidth - GAP * (COLUMNS - 1)) / COLUMNS,
    (availableHeight - GAP * (FIT_ROWS - 1)) / FIT_ROWS
  )));
  const gridWidth = cell * COLUMNS + GAP * (COLUMNS - 1);

  // Where each cell lands on screen, matching the centered layout below.
  const rows = Math.ceil(items.length / COLUMNS);
  const gridHeight = rows * cell + (rows - 1) * GAP;
  const scrollTop = insets.top + HEADER_HEIGHT;
  const contentHeight = PADDING + gridHeight + PADDING + insets.bottom;
  // Only scroll when the grid doesn't fit. When it does, nothing can grab a
  // downward swipe as a scroll, so swiping down anywhere closes the grid.
  const scrollable = contentHeight > window.height - scrollTop;

  const cellRects = useMemo(() => {
    const gridTop = scrollTop + PADDING + Math.max(0, (window.height - scrollTop - contentHeight) / 2);
    const gridLeft = (window.width - gridWidth) / 2;
    const scrolled = closingScroll ?? 0;
    return items.map((_, i): Rect => ({
      x: gridLeft + (i % COLUMNS) * (cell + GAP),
      y: gridTop + Math.floor(i / COLUMNS) * (cell + GAP) - scrolled,
      width: cell,
      height: cell,
    }));
  }, [items, cell, gridWidth, COLUMNS, scrollTop, contentHeight, window.width, window.height, closingScroll]);

  useEffect(() => {
    Animated.timing(progress, { toValue: 1, duration: OPEN_MS, easing: Easing.out(Easing.cubic), useNativeDriver }).start();
  }, [progress]);

  // Runs after the cells have re-rendered with their scrolled positions.
  useEffect(() => {
    if (closingScroll === null) return;
    const timing = { duration: CLOSE_MS, easing: Easing.inOut(Easing.cubic), useNativeDriver };
    Animated.parallel([
      Animated.timing(progress, { toValue: 0, ...timing }),
      Animated.timing(drag, { toValue: 0, ...timing }),
    ]).start(() => onCloseRef.current());
  }, [closingScroll, progress, drag]);

  const close = () => {
    if (closingScroll === null) setClosingScroll(scrollYRef.current);
  };
  const closeRef = useRef(close);
  closeRef.current = close;
  // Whether the current touch turned into a swipe. On web the browser still
  // sends a click when a swipe ends on a photo, so that click is ignored.
  const swipedRef = useRef(false);

  const panResponder = useMemo(() => {
    let dragging = false;
    // A clear downward drag anywhere on the screen. When the grid scrolls,
    // only from the top, so it never fights scrolling back up.
    const isSwipeDown = (g: { dx: number; dy: number }) =>
      scrollYRef.current <= 0 && g.dy > 10 && g.dy > Math.abs(g.dx) * 1.5;
    const springBack = () => {
      dragging = false;
      Animated.spring(drag, { toValue: 0, useNativeDriver, bounciness: 4 }).start();
    };
    return PanResponder.create({
      // Take touches that start on empty space. Touches inside a modal still
      // bubble up to the chat message it opened from on iOS and Android, so
      // otherwise tapping a gap could like or long-press that message.
      // Photos and buttons are deeper, so they still get their own taps.
      onStartShouldSetPanResponder: () => true,
      // Runs first on every new touch, before anything claims it.
      onStartShouldSetPanResponderCapture: () => {
        swipedRef.current = false;
        return false;
      },
      // A swipe down that starts on a photo or button is taken over too, but
      // not from the viewer opened on top.
      onMoveShouldSetPanResponderCapture: (_, g) => !isViewerOpen() && isSwipeDown(g),
      onPanResponderGrant: () => {
        dragging = false;
      },
      onPanResponderMove: (_, g) => {
        if (!dragging && !isSwipeDown(g)) return;
        dragging = true;
        swipedRef.current = true;
        drag.setValue(Math.max(0, g.dy));
      },
      onPanResponderRelease: (_, g) => {
        if (!dragging) return;
        if (g.dy > DISMISS_DISTANCE || g.vy > DISMISS_VELOCITY) closeRef.current();
        else springBack();
      },
      onPanResponderTerminate: springBack,
    });
  }, [drag]);

  // Dragging down lets the chat show through.
  const dragFade = drag.interpolate<number>({ inputRange: [0, 300], outputRange: [1, 0.3], extrapolate: "clamp" });
  const backdropOpacity = Animated.multiply<number>(progress, dragFade);

  const open = (index: number) => {
    if (swipedRef.current) return;
    Promise.all(items.map((_, i) => measureInWindow(cellRefs.current[i] ?? null))).then((cellOrigins) =>
      setViewer({ index, origins: cellOrigins })
    );
  };

  const allPhotos = items.every((item) => item.type === "image");
  const allVideos = items.every((item) => item.type === "video");
  const title = `${items.length} ${allPhotos ? "photos" : allVideos ? "videos" : "items"}`;
  // Items hidden behind "+N" in the chat come out of that last tile.
  const lastShown = origins.reduce((last, origin, i) => (origin ? i : last), -1);

  return (
    <Modal transparent visible statusBarTranslucent animationType="none" onRequestClose={close}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdropOpacity }]} />
      <View
        {...panResponder.panHandlers}
        style={[
          styles.screen,
          { paddingTop: insets.top },
          // On web, stop the browser from claiming the swipe for its own panning.
          Platform.OS === "web" && !scrollable && ({ touchAction: "none" } as object),
        ]}
        pointerEvents={closingScroll === null ? "auto" : "none"}
      >
        {/* iOS style: close on the left, title centered. */}
        <Animated.View style={[styles.header, { opacity: backdropOpacity }]}>
          <TouchableOpacity accessibilityLabel="Close" activeOpacity={0.7} style={styles.closeBtn} onPress={close}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <View style={styles.headerSpacer} />
        </Animated.View>

        {/* Centered on screen when everything fits; otherwise starts at the top and scrolls. */}
        <Animated.View style={[styles.scroll, { transform: [{ translateY: drag }] }]}>
        <ScrollView
          style={styles.scroll}
          // No bounce at the top on iOS, so pulling down goes to closing instead.
          bounces={false}
          scrollEnabled={scrollable}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: PADDING + insets.bottom }]}
          scrollEventThrottle={32}
          onScroll={(event) => {
            scrollYRef.current = event.nativeEvent.contentOffset.y;
          }}
        >
          <View style={[styles.grid, { width: gridWidth }]}>
            {items.map((item, index) => {
              const fromTile = origins[index] ?? (lastShown >= 0 ? origins[lastShown] : null);
              const zoom = fromTile ? zoomFrom(fromTile, cellRects[index]) : FALLBACK_ZOOM;
              const hidden = !origins[index];
              const cellStyle: Animated.WithAnimatedValue<ViewStyle> = {
                // Photos shown in the chat start exactly over their tile; the
                // hidden ones fade in from behind the "+N" tile.
                opacity: hidden
                  ? progress.interpolate<number>({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] })
                  : 1,
                transform: [
                  { translateX: progress.interpolate<number>({ inputRange: [0, 1], outputRange: [zoom.translateX, 0] }) },
                  { translateY: progress.interpolate<number>({ inputRange: [0, 1], outputRange: [zoom.translateY, 0] }) },
                  { scale: progress.interpolate<number>({ inputRange: [0, 1], outputRange: [zoom.scale, 1] }) },
                ],
              };
              return (
                <Animated.View key={`${item.uri}-${index}`} style={[cellStyle, { zIndex: hidden ? 0 : 1 }]}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    accessibilityRole="imagebutton"
                    accessibilityLabel={`Open ${item.type === "video" ? "video" : "photo"} ${index + 1} of ${items.length}`}
                    onPress={() => open(index)}
                  >
                    <View
                      ref={(view) => {
                        cellRefs.current[index] = view;
                      }}
                      collapsable={false}
                      style={[styles.cell, { width: cell, height: cell }]}
                    >
                      <MediaPreview item={item} showDuration />
                    </View>
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
          </View>
        </ScrollView>
        </Animated.View>
      </View>

      {viewer && (
        <MediaViewer
          items={items}
          initialIndex={viewer.index}
          origins={viewer.origins}
          onClose={() => setViewer(null)}
        />
      )}
    </Modal>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    backdrop: {
      backgroundColor: colors.background,
    },
    screen: {
      flex: 1,
    },
    header: {
      height: HEADER_HEIGHT,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
    },
    title: {
      flex: 1,
      textAlign: "center",
      color: colors.text,
      fontSize: 17,
      fontFamily: fonts.bold,
    },
    // Same width as the close button, so the title stays centered.
    headerSpacer: {
      width: 36,
    },
    closeBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.inputBg,
      alignItems: "center",
      justifyContent: "center",
    },
    closeText: {
      color: colors.text,
      fontSize: 16,
      fontFamily: fonts.bold,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: PADDING,
    },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: GAP,
    },
    cell: {
      borderRadius: 6,
      overflow: "hidden",
      backgroundColor: colors.border,
    },
  });
}
