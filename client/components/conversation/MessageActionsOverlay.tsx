import { View, Text, StyleSheet, Modal, Pressable, Animated, Easing, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useTheme, fonts, Colors } from "../../context/ThemeContext";
import type { Rect } from "../../lib/mediaLayout";
import { messageActionsLayout } from "../../lib/messageActionsLayout";

export type MessageAction = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
  // Opens an alert, another popup or the keyboard, so it has to wait for this
  // one to close.
  presents?: boolean;
  onPress: () => void;
};

type Props = {
  // The pressed message's row on screen, and a copy of it to show there.
  rect: Rect;
  mine: boolean;
  message: ReactNode;
  timeLabel: string;
  reactions: string[];
  // Your current reaction, highlighted; tapping it again removes it.
  selectedReaction?: string;
  onReact: (emoji: string) => void;
  onMoreReactions: () => void;
  actions: MessageAction[];
  onClose: () => void;
};

const BAR_HEIGHT = 52;
const MENU_WIDTH = 230;
const MENU_HEADER = 30;
const MENU_ROW = 46;
const GAP = 8;
const MARGIN = 12;
const OPEN_MS = 180;
// iOS drops an alert or popup that opens while another popup is still
// closing, so those wait this long.
const PRESENT_DELAY_MS = 350;

// Instagram-style long-press: the chat blurs, the message stays put (sliding
// just enough to make room), reactions float above it and the actions sit in
// a card below it. Tap anywhere else to close.
export default function MessageActionsOverlay({
  rect, mine, message, timeLabel, reactions, selectedReaction, onReact, onMoreReactions, actions, onClose,
}: Props) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const progress = useRef(new Animated.Value(0)).current;

  const menuHeight = MENU_HEADER + actions.length * MENU_ROW;
  const layout = messageActionsLayout({
    rect,
    screenHeight: window.height,
    topInset: insets.top,
    bottomInset: insets.bottom,
    barHeight: BAR_HEIGHT,
    menuHeight,
    gap: GAP,
    margin: MARGIN,
  });

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: OPEN_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [progress]);

  const side = mine ? { right: MARGIN } : { left: MARGIN };
  const pop = {
    opacity: progress,
    transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
  };
  const run = (action: () => void, presents = false) => () => {
    onClose();
    if (presents) setTimeout(action, PRESENT_DELAY_MS);
    else action();
  };

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: progress }]}>
        <BlurView intensity={40} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, styles.dim]} />
      </Animated.View>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close message menu" />

      {/* The message itself, slid into place. Just for show: taps close the menu. */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: rect.x,
          top: rect.y,
          width: rect.width,
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, layout.messageY - rect.y] }) }],
        }}
      >
        {message}
      </Animated.View>

      <Animated.View style={[styles.bar, side, { top: layout.barY }, pop]}>
        {reactions.map((emoji) => {
          const selected = emoji === selectedReaction;
          return (
            <Pressable
              key={emoji}
              onPress={run(() => onReact(emoji))}
              style={({ pressed }) => [styles.emojiButton, selected && styles.emojiSelected, pressed && styles.emojiPressed]}
              accessibilityLabel={selected ? `Remove ${emoji} reaction` : `React with ${emoji}`}
            >
              <Text style={styles.emoji} allowFontScaling={false}>{emoji}</Text>
            </Pressable>
          );
        })}
        <Pressable
          onPress={run(onMoreReactions, true)}
          style={({ pressed }) => [styles.moreButton, pressed && styles.emojiPressed]}
          accessibilityLabel="More reactions"
        >
          <Ionicons name="add" size={22} color={colors.subtext} />
        </Pressable>
      </Animated.View>

      <Animated.View style={[styles.menu, side, { top: layout.menuY }, pop]}>
        <Text style={styles.menuTime}>{timeLabel}</Text>
        {actions.map((action) => (
          <Pressable
            key={action.key}
            onPress={run(action.onPress, action.presents)}
            style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
          >
            <Text style={[styles.menuLabel, action.destructive && styles.destructive]}>{action.label}</Text>
            <Ionicons name={action.icon} size={20} color={action.destructive ? colors.danger : colors.text} />
          </Pressable>
        ))}
      </Animated.View>
    </Modal>
  );
}

function makeStyles(colors: Colors) {
  const card = {
    position: "absolute" as const,
    backgroundColor: colors.card,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  };
  return StyleSheet.create({
    dim: {
      backgroundColor: "rgba(0,0,0,0.15)",
    },
    bar: {
      ...card,
      height: BAR_HEIGHT,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 6,
      borderRadius: BAR_HEIGHT / 2,
    },
    emojiButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: "center",
      justifyContent: "center",
    },
    emojiSelected: {
      backgroundColor: colors.brandSoft,
    },
    emojiPressed: {
      transform: [{ scale: 1.2 }],
    },
    emoji: {
      fontSize: 28,
    },
    moreButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      marginLeft: 2,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.inputBg,
    },
    menu: {
      ...card,
      width: MENU_WIDTH,
      borderRadius: 14,
      overflow: "hidden",
    },
    menuTime: {
      height: MENU_HEADER,
      lineHeight: MENU_HEADER,
      paddingHorizontal: 16,
      fontFamily: fonts.regular,
      fontSize: 12,
      color: colors.mutedText,
    },
    menuRow: {
      height: MENU_ROW,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    menuRowPressed: {
      backgroundColor: colors.inputBg,
    },
    menuLabel: {
      fontFamily: fonts.medium,
      fontSize: 15,
      color: colors.text,
    },
    destructive: {
      color: colors.danger,
    },
  });
}
