import { useEffect } from "react";
import { Image, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../../../context/ThemeContext";
import { resolveSignedInRoute } from "../../../lib/session";

export default function Logo() {
  const router = useRouter();
  const { colors } = useTheme();

  // Show the logo for at least a second while checking for a saved session,
  // so returning users skip sign-in.
  useEffect(() => {
    let cancelled = false;
    const minDelay = new Promise((resolve) => setTimeout(resolve, 1000));
    Promise.all([resolveSignedInRoute(), minDelay]).then(([route]) => {
      if (!cancelled) router.replace(route);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <LinearGradient colors={colors.gradients.backdrop} style={styles.container}>
      <Image
        source={require("../../../src/assets/splash-icon.png")}
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
  icon: {
    width: 120,
    height: 120,
  },
});
