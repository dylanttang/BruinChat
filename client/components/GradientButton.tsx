import { ReactNode } from "react";
import { ActivityIndicator, StyleProp, StyleSheet, Text, TouchableOpacity, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { fonts, Gradient, useTheme } from "../context/ThemeContext";

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  // Defaults to the blue action gradient; pass colors.gradients.sent for orange.
  gradient?: Gradient;
  style?: StyleProp<ViewStyle>;
  icon?: ReactNode;
};

export default function GradientButton({ label, onPress, disabled, loading, gradient, style, icon }: Props) {
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={disabled || loading}
      style={[styles.wrap, (disabled || loading) && styles.disabled, style]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <LinearGradient
        colors={gradient ?? colors.gradients.action}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.gradient}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.onPrimary} />
        ) : (
          <>
            <Text style={[styles.label, { color: colors.onPrimary }]}>{label}</Text>
            {icon}
          </>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 22,
    overflow: "hidden",
    shadowColor: "#5B8FE0",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 3,
  },
  disabled: {
    opacity: 0.5,
  },
  gradient: {
    minHeight: 50,
    paddingHorizontal: 28,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  label: {
    fontFamily: fonts.bold,
    fontSize: 16,
  },
});
