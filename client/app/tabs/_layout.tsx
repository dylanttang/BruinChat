import { Tabs, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, fonts } from "../../context/ThemeContext";
import { apiFetch } from "../../lib/api";

export default function TabLayout() {
  const { colors } = useTheme();
  const router = useRouter();

  const [isAdmin, setIsAdmin] = useState(false);
  const [pendingReports, setPendingReports] = useState(0);

  // Account checks on app open:
  //   - banned users go to the banned screen (the server refuses them anyway)
  //   - anyone who hasn't accepted the current Terms goes back through them
  //   - unseen moderation notices (warnings, mutes, removals) are shown once
  useEffect(() => {
    apiFetch("/api/users/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const user = data?.user;
        if (!user) return;
        if (user.bannedAt) {
          router.replace("/banned");
          return;
        }
        if (user.termsVersion !== data.currentTermsVersion) {
          router.replace("/auth/terms");
          return;
        }
        setIsAdmin(user.role === "admin");

        const unseen = (user.moderationNotices ?? []).filter((n: { seenAt: string | null }) => !n.seenAt);
        if (unseen.length) {
          Alert.alert(
            "A note from BChat moderation",
            unseen.map((n: { message: string }) => n.message).join("\n\n") +
              "\n\nPlease review the Terms of Service. Contact bchatdevx@gmail.com if you think this was a mistake.",
            [
              { text: "View Terms", onPress: () => router.push("/legal/terms") },
              { text: "OK" },
            ]
          );
          apiFetch("/api/users/me/notices/seen", { method: "POST" }).catch(() => {});
        }
      })
      .catch((err) => console.error("Failed to check account:", err));
  }, [router]);

  // Keep the Admin tab badge current.
  useEffect(() => {
    if (!isAdmin) return;
    const refresh = () =>
      apiFetch("/api/admin/reports?status=pending")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => data && setPendingReports(data.pendingCount))
        .catch(() => {});
    refresh();
    const interval = setInterval(refresh, 60_000);
    return () => clearInterval(interval);
  }, [isAdmin]);

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
        name="admin"
        options={{
          title: "Admin",
          // Hidden for everyone except admins; the API enforces it too.
          href: isAdmin ? undefined : null,
          tabBarBadge: pendingReports > 0 ? pendingReports : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.danger, fontFamily: fonts.bold },
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="shield-checkmark" size={size} color={color} />
          ),
        }}
        listeners={{
          focus: () => {
            apiFetch("/api/admin/reports?status=pending")
              .then((res) => (res.ok ? res.json() : null))
              .then((data) => data && setPendingReports(data.pendingCount))
              .catch(() => {});
          },
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
