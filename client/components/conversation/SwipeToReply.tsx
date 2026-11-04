import { ReactNode, useMemo, useRef } from "react";
import { Animated, PanResponder, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";

// How far a message has to be dragged before letting go replies to it.
const TRIGGER = 56;
const MAX_DRAG = 80;

type Props = {
  children: ReactNode;
  onReply: () => void;
  enabled?: boolean;
};

// Swipe a message to the right to reply to it, like Instagram. Only clearly
// sideways drags are taken, so scrolling the chat and long-press still work.
export default function SwipeToReply({ children, onReply, enabled = true }: Props) {
  const { colors } = useTheme();
  const dragX = useRef(new Animated.Value(0)).current;
  const onReplyRef = useRef(onReply);
  onReplyRef.current = onReply;

  const responder = useMemo(() => {
    const settle = () => {
      Animated.spring(dragX, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 20 }).start();
    };
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) => g.dx > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
      onPanResponderMove: (_, g) => dragX.setValue(Math.max(0, Math.min(g.dx, MAX_DRAG))),
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_, g) => {
        if (g.dx >= TRIGGER) onReplyRef.current();
        settle();
      },
      onPanResponderTerminate: settle,
    });
  }, [dragX]);

  if (!enabled) return <>{children}</>;

  const progress = { inputRange: [0, TRIGGER], extrapolate: "clamp" as const };
  return (
    <View>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.icon,
          {
            opacity: dragX.interpolate({ ...progress, outputRange: [0, 1] }),
            transform: [{ scale: dragX.interpolate({ ...progress, outputRange: [0.5, 1] }) }],
          },
        ]}
      >
        <Ionicons name="arrow-undo" size={18} color={colors.mutedText} />
      </Animated.View>
      <Animated.View style={{ transform: [{ translateX: dragX }] }} {...responder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  icon: {
    position: "absolute",
    left: 12,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
});
