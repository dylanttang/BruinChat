import { Tabs, useRouter } from "expo-router";
import { useEffect } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, fonts } from "../../context/ThemeContext";
import { apiFetch } from "../../lib/api";

export default function TabLayout() {
  const { colors } = useTheme();
  const router = useRouter();

  // Anyone who hasn't accepted the current Terms (existing accounts from
  // before the agreement screen, or after a Terms update) goes back through it.
  // The server also refuses posts until they do.
  useEffect(() => {
    apiFetch("/api/users/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user && data.user.termsVersion !== data.currentTermsVersion) {
          router.replace("/auth/terms");
        }
      })
      .catch((err) => console.error("Failed to check terms:", err));
  }, [router]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.mutedText,
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 11 },
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.border,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
