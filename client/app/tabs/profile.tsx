import {
  View,
  Text,
  StyleSheet,
  Image,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { apiFetch } from "../lib/api";
import { useTheme, Colors } from "../context/ThemeContext";

type Course = {
  _id: string;
  subjectArea: string;
  number: string;
  title: string;
};

type User = {
  _id: string;
  displayName: string;
  username: string;
  courses: Course[];
  avatarUrl?: string;
};

export default function Profile() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [localAvatar, setLocalAvatar] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      apiFetch("/api/users/me")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => setUser(data?.user ?? null))
        .catch((err) => console.error("Failed to load user:", err))
        .finally(() => setLoading(false));
    }, [])
  );

  const pickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission required", "Please allow photo access to change your avatar.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled) return;

    const uri = result.assets[0].uri;
    setLocalAvatar(uri);

    // TODO: Upload to backend once Jonathan's endpoint is ready.
    // Example:
    // const formData = new FormData();
    // formData.append("avatar", { uri, name: "avatar.jpg", type: "image/jpeg" } as any);
    // await apiFetch("/api/users/me/avatar", { method: "POST", body: formData });
  };

  const avatarSource = localAvatar ?? user?.avatarUrl ?? null;

  return (
    <SafeAreaView style={styles.container}>
      {/* Avatar */}
      <View style={styles.avatarWrapper}>
        <Image
          source={avatarSource ? { uri: avatarSource } : undefined}
          style={styles.avatar}
        />
        <TouchableOpacity style={styles.editAvatar} onPress={pickAvatar}>
          <Ionicons name="pencil" size={16} color="white" />
        </TouchableOpacity>
      </View>

      {/* Name */}
      <Text style={styles.name}>
        {loading ? " " : user?.displayName ?? "Unknown User"}
      </Text>

      {/* Courses Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>My Courses</Text>

        {loading ? (
          <ActivityIndicator size="small" color={colors.mutedText} style={{ paddingVertical: 16 }} />
        ) : !user?.courses || user.courses.length === 0 ? (
          <Text style={{ color: colors.subtext, paddingVertical: 16 }}>
            No courses yet. Tap "Edit Courses" below to add some.
          </Text>
        ) : (
          <FlatList
            data={user.courses}
            keyExtractor={(item) => item._id}
            renderItem={({ item }) => (
              <View style={styles.courseRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.courseTitle}>
                    {item.subjectArea} {item.number}
                  </Text>
                  <Text style={styles.courseSubtitle}>{item.title}</Text>
                </View>
              </View>
            )}
            scrollEnabled={false}
          />
        )}
      </View>

      <TouchableOpacity
        style={styles.editButton}
        onPress={() => router.push("/auth/questionnaire/step3")}
      >
        <Text style={styles.editText}>Edit Courses</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      padding: 20,
      backgroundColor: colors.background,
    },
    settingsIcon: {
      position: "absolute",
      top: 50,
      right: 20,
      padding: 8,
    },
    avatarWrapper: {
      alignSelf: "center",
      marginTop: 30,
    },
    avatar: {
      width: 160,
      height: 160,
      borderRadius: 80,
      backgroundColor: colors.avatarBg,
    },
    editAvatar: {
      position: "absolute",
      bottom: 8,
      right: 8,
      backgroundColor: "#333",
      padding: 6,
      borderRadius: 20,
    },
    name: {
      fontSize: 24,
      fontWeight: "600",
      textAlign: "center",
      marginVertical: 20,
      color: colors.text,
    },
    card: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      backgroundColor: colors.card,
    },
    cardTitle: {
      fontWeight: "600",
      fontSize: 18,
      marginBottom: 10,
      color: colors.text,
    },
    courseRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 15,
      borderBottomWidth: 1,
      borderColor: colors.separator,
    },
    courseTitle: {
      fontWeight: "500",
      paddingVertical: 5,
      color: colors.text,
    },
    courseSubtitle: {
      color: colors.subtext,
    },
    editButton: {
      marginTop: 25,
      alignSelf: "center",
      backgroundColor: colors.inputBg,
      paddingHorizontal: 30,
      paddingVertical: 12,
      borderRadius: 20,
    },
    editText: {
      fontWeight: "500",
      color: colors.text,
    },
  });
}
