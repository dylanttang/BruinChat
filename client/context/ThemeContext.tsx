import { createContext, useContext, useState, useEffect, useMemo, ReactNode } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type ThemeMode = "system" | "light" | "dark";

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
};

const lightColors: Colors = {
  background: "#fff",
  card: "#fff",
  border: "#eee",
  separator: "#f2f2f2",
  text: "#000",
  subtext: "#666",
  mutedText: "#999",
  inputBg: "#f2f2f2",
  avatarBg: "#ddd",
  tabBar: "#fff",
};

const darkColors: Colors = {
  background: "#000",
  card: "#1c1c1e",
  border: "#38383a",
  separator: "#38383a",
  text: "#fff",
  subtext: "#ababab",
  mutedText: "#636366",
  inputBg: "#2c2c2e",
  avatarBg: "#3a3a3c",
  tabBar: "#1c1c1e",
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
