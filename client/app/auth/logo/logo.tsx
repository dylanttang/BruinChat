import { useEffect } from "react";
import { Image, Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme, fonts } from "../../../context/ThemeContext";

export default function Logo() {
  const router = useRouter();
  const { colors } = useTheme();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace("/auth/welcome/welcome");
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <LinearGradient colors={colors.gradients.backdrop} style={styles.container}>
      <Text style={[styles.wordmark, { color: colors.brand }]}>BruinChat</Text>
      <Image
        source={require("../../../src/assets/icon.png")}
        style={styles.icon}
        resizeMode="contain"
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  wordmark: {
    fontFamily: fonts.bold,
    fontSize: 40,
    marginBottom: 16,
  },
  icon: {
    width: 120,
    height: 120,
  },
});
