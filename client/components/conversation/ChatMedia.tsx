import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from "react-native";
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTheme, fonts, Colors } from "../../context/ThemeContext";
import { Rect, chatGrid, clampRatio, fitWithin } from "../../lib/mediaLayout";
import { mediaKey } from "../../lib/messageMedia";
import MediaPreview, { MediaItem, measureInWindow, useMediaRatio } from "./MediaPreview";
import MediaViewer from "./MediaViewer";
import MediaGallery from "./MediaGallery";
import { useChatMediaList } from "./chatMediaList";

// A single photo or video shows at its real shape within this box, like
// iMessage and Instagram DMs. Several are shown as a grid of square tiles.
const SINGLE_MAX_WIDTH = 240;
const SINGLE_MAX_HEIGHT = 300;
const GRID_GAP = 4;
const GRID_TILE = (SINGLE_MAX_WIDTH - GRID_GAP) / 2;
const RADIUS = 18;
// The corners that touch a caption below are nearly square, so the photo and
// its caption read as one attached card.
const JOINED_RADIUS = 4;

type Props = {
  // With it, the viewer swipes through all of the chat's media, not just this
  // message's.
  messageId?: string;
  items: MediaItem[];
  // Shown right under the media, at the same width, attached to it.
  caption?: ReactNode;
  // Called with the tile's "open" action; the bubble decides when to run it
  // (it waits briefly so a double-tap can like the message instead).
  onPress: (open: () => void) => void;
  onLongPress?: () => void;
};

// Media in a message. 1–3 items open straight into the swipeable viewer;
// 4 or more show as a 2×2 grid ("+N" on the last tile when there are more)
// and open a grid of all of them first.
export default function ChatMedia({ messageId, items, caption, onPress, onLongPress }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { shown, wideLast, extra, opensGallery } = chatGrid(items.length);
  const single = shown === 1;
  const attached = !!caption;
  // A single photo's width depends on its shape; the caption matches it.
  const [singleWidth, setSingleWidth] = useState<number>(SINGLE_MAX_WIDTH);
  const tileRefs = useRef<(View | null)[]>([]);
  const chat = useChatMediaList();
  const [viewer, setViewer] = useState<{ items: MediaItem[]; index: number; origins: (Rect | null)[] } | null>(null);
  const [gallery, setGallery] = useState<{ origins: (Rect | null)[] } | null>(null);

  const openAt = (index: number) => {
    // Swipe through the whole chat when this message is in its list (the
    // thread's first message, shown above the replies, isn't).
    const all = chat?.all() ?? [];
    const start = messageId ? all.findIndex((item) => item.key === mediaKey(messageId, 0)) : -1;
    if (!opensGallery && chat && start >= 0) {
      // Measure every photo that's on screen, so the viewer grows out of this
      // one and shrinks back into whichever it ends on.
      Promise.all(all.map((item) => measureOnScreen(chat.tiles.get(item.key) ?? null))).then((origins) =>
        setViewer({ items: all, index: start + index, origins })
      );
      return;
    }
    // Measure every tile so the viewer or grid can grow out of the message
    // and shrink back into whichever photo it ends on.
    Promise.all(items.map((_, i) => (i < shown ? measureInWindow(tileRefs.current[i] ?? null) : null))).then((origins) =>
      opensGallery ? setGallery({ origins }) : setViewer({ items, index, origins })
    );
  };

  return (
    <View>
      <View style={single ? null : styles.grid}>
        {items.slice(0, shown).map((item, index) => {
          const wide = wideLast && index === shown - 1;
          // Which of this tile's bottom corners touch the caption.
          const joined: Joined = !attached ? null
            : single || wide ? "both"
            : index === shown - 2 ? "left"
            : index === shown - 1 ? "right"
            : null;
          return (
            <MediaTile
              key={`${item.uri}-${index}`}
              item={item}
              single={single}
              wide={wide}
              joined={joined}
              extra={index === shown - 1 ? extra : 0}
              styles={styles}
              tileRef={(view) => {
                tileRefs.current[index] = view;
                if (!chat || !messageId) return;
                if (view) chat.tiles.set(mediaKey(messageId, index), view);
                else chat.tiles.delete(mediaKey(messageId, index));
              }}
              onWidth={single ? setSingleWidth : undefined}
              onPress={() => onPress(() => openAt(index))}
              onLongPress={onLongPress}
            />
          );
        })}
      </View>
      {attached && <View style={{ width: single ? singleWidth : SINGLE_MAX_WIDTH }}>{caption}</View>}

      {viewer && (
        <MediaViewer
          items={viewer.items}
          initialIndex={viewer.index}
          origins={viewer.origins}
          onClose={() => setViewer(null)}
        />
      )}
      {gallery && <MediaGallery items={items} origins={gallery.origins} onClose={() => setGallery(null)} />}
    </View>
  );
}

// Where a tile is, or null if it's scrolled off screen (the viewer then fades
// in and out instead of growing from a spot that can't be seen).
function measureOnScreen(view: View | null): Promise<Rect | null> {
  return measureInWindow(view).then((rect) => {
    const screen = Dimensions.get("window");
    const visible = rect && rect.x < screen.width && rect.x + rect.width > 0 && rect.y < screen.height && rect.y + rect.height > 0;
    return visible ? rect : null;
  });
}

type Joined = "left" | "right" | "both" | null;

function MediaTile({ item, single, wide, joined, extra, styles, tileRef, onWidth, onPress, onLongPress }: {
  item: MediaItem;
  single: boolean;
  wide: boolean;
  joined: Joined;
  // How many more items are hidden behind this tile ("+N"), if any.
  extra: number;
  styles: ReturnType<typeof makeStyles>;
  tileRef: (view: View | null) => void;
  onWidth?: (width: number) => void;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const isVideo = item.type === "video";
  const ratio = useMediaRatio(item);
  const size = single
    ? fitWithin(clampRatio(ratio ?? 1), SINGLE_MAX_WIDTH, SINGLE_MAX_HEIGHT)
    : { width: wide ? SINGLE_MAX_WIDTH : GRID_TILE, height: GRID_TILE };
  const corner = joined && {
    ...(joined !== "right" && { borderBottomLeftRadius: JOINED_RADIUS }),
    ...(joined !== "left" && { borderBottomRightRadius: JOINED_RADIUS }),
  };

  // Report the width before paint so the caption never shows at the wrong size.
  useLayoutEffect(() => {
    onWidth?.(size.width);
  }, [onWidth, size.width]);

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="imagebutton"
      accessibilityLabel={extra ? `Show all, ${extra} more` : isVideo ? "Open video" : "Open photo"}
    >
      <View ref={tileRef} collapsable={false} style={[styles.tile, size, corner, isVideo && styles.videoTile]}>
        <MediaPreview item={item} showDuration={!single} />
        {extra > 0 && (
          <View style={styles.moreOverlay}>
            <Text style={styles.moreText}>+{extra}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    grid: {
      width: SINGLE_MAX_WIDTH,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: GRID_GAP,
    },
    // Rounded corners, no border or frame. The background only shows while
    // the photo is loading.
    tile: {
      borderRadius: RADIUS,
      overflow: "hidden",
      backgroundColor: colors.border,
    },
    videoTile: {
      backgroundColor: "#1f1f24",
    },
    moreOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(0,0,0,0.5)",
    },
    moreText: {
      color: "white",
      fontSize: 26,
      fontFamily: fonts.bold,
    },
  });
}
