import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type ThemeMode = "system" | "light" | "dark";

// expo-linear-gradient wants at least two stops.
export type Gradient = readonly [string, string, ...string[]];

export type Colors = {
  background: string;
  card: string;
  border: string;
  separator: string;
  text: string;
  subtext: string;
  mutedText: string;
  inputBg: string;
  avatarBg: string;
  tabBar: string;
  // Blue: buttons, links, switches, anything you tap to act.
  primary: string;
  // Orange: brand identity, your own messages, selection highlights.
  brand: string;
  brandSoft: string;
  // Periwinkle: secondary accent (badges, reply previews).
  accent: string;
  onPrimary: string;
  // Text on message bubbles: dark on the pastel light-mode bubbles, light on
  // the deeper dark-mode ones.
  bubbleText: string;
  bubbleSubtext: string;
  bubbleQuote: string;
  bubbleQuoteBorder: string;
  danger: string;
  overlay: string;
  gradients: {
    sent: Gradient;
    received: Gradient;
    action: Gradient;
    backdrop: Gradient;
  };
};

// Palette sampled from the BChat promo art: warm cream paper, sky-blue
// and sunset-orange speech bubbles, periwinkle accent.
const lightColors: Colors = {
  background: "#FFF8F1",
  card: "#FFFDFA",
  border: "#F2E2D2",
  separator: "#F7ECE1",
  text: "#2E2C3F",
  subtext: "#6E6878",
  mutedText: "#A39B9A",
  inputBg: "#FCEFE3",
  avatarBg: "#F8D1AD",
  tabBar: "#FFFDFA",
  primary: "#5B8FE0",
  brand: "#FE7A45",
  brandSoft: "#FFE7D6",
  accent: "#748ED0",
  onPrimary: "#FFFFFF",
  bubbleText: "#2E2C3F",
  bubbleSubtext: "rgba(46,44,63,0.7)",
  bubbleQuote: "rgba(255,255,255,0.55)",
  bubbleQuoteBorder: "rgba(46,44,63,0.3)",
  danger: "#E5484D",
  overlay: "rgba(46,44,63,0.45)",
  gradients: {
    sent: ["#FFDDBD", "#FFC19B"],
    received: ["#DCE8FA", "#BCD3F4"],
    action: ["#9FBEEB", "#5B8FE0"],
    backdrop: ["#FFDAC7", "#FFF8F1", "#E0E9F8"],
  },
};

const darkColors: Colors = {
  background: "#17161F",
  card: "#211F2B",
  border: "#332F3E",
  separator: "#2A2735",
  text: "#F8F0E9",
  subtext: "#BFB5B0",
  mutedText: "#817987",
  inputBg: "#2A2734",
  avatarBg: "#4A3A36",
  tabBar: "#1C1A25",
  primary: "#7AA6EC",
  brand: "#FF8A55",
  brandSoft: "#3A2A26",
  accent: "#8FA3E0",
  onPrimary: "#FFFFFF",
  bubbleText: "#FFF8F1",
  bubbleSubtext: "rgba(255,248,241,0.8)",
  bubbleQuote: "rgba(255,255,255,0.16)",
  bubbleQuoteBorder: "rgba(255,248,241,0.6)",
  danger: "#FF6B6F",
  overlay: "rgba(0,0,0,0.6)",
  gradients: {
    sent: ["#B8582A", "#9A4520"],
    received: ["#3F68B4", "#335696"],
    action: ["#7FA3E3", "#4C78C6"],
    backdrop: ["#2B1F24", "#17161F", "#1A2233"],
  },
};

// Quicksand, loaded in app/_layout.tsx. Custom fonts ignore fontWeight on
// iOS, so pick the weight by family instead.
export const fonts = {
  regular: "Quicksand_500Medium",
  medium: "Quicksand_600SemiBold",
  bold: "Quicksand_700Bold",
};

const STORAGE_KEY = "@bruinchat_theme";

type ThemeContextType = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  colors: Colors;
  isDark: boolean;
};

const ThemeContext = createContext<ThemeContextType>({
  mode: "system",
  setMode: () => {},
  colors: lightColors,
  isDark: false,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved === "light" || saved === "dark" || saved === "system") {
        setModeState(saved);
      }
    });
  }, []);

  const setMode = async (newMode: ThemeMode) => {
    setModeState(newMode);
    await AsyncStorage.setItem(STORAGE_KEY, newMode);
  };

  const isDark = mode === "dark" || (mode === "system" && systemScheme === "dark");
  const colors = isDark ? darkColors : lightColors;

  return (
    <ThemeContext.Provider value={{ mode, setMode, colors, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
