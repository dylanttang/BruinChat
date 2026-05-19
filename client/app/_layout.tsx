import { Stack } from "expo-router";
import { ThemeProvider } from "./context/ThemeContext";
import { useEffect } from "react";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { apiFetch } from "./lib/api";

async function registerForPushNotifications() {
  if (!Device.isDevice) return; // simulators can't receive push notifications

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") return;

  const token = (await Notifications.getExpoPushTokenAsync()).data;
  apiFetch("/api/users/me/push-token", {
    method: "PUT",
    body: JSON.stringify({ pushToken: token }),
  }).catch((err) => console.error("Failed to save push token:", err));
}

export default function RootLayout() {
  useEffect(() => {
    registerForPushNotifications();
  }, []);

  return (
    <ThemeProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="auth" />
        <Stack.Screen name="tabs" />
      </Stack>
    </ThemeProvider>
  );
}
