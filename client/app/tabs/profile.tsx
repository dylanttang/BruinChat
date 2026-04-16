import {
  View,
  Text,
  StyleSheet,
  Image,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { apiFetch } from "../lib/api";

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
};

export default function Profile() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <SafeAreaView style={styles.container}>
      {/* Settings icon top right */}
      <TouchableOpacity style={styles.settingsIcon}>
        <Ionicons name="options-outline" size={26} />
      </TouchableOpacity>

      {/* Avatar */}
      <View style={styles.avatarWrapper}>
        <Image style={styles.avatar} />

        <TouchableOpacity style={styles.editAvatar}>
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
          <ActivityIndicator size="small" color="#888" style={{ paddingVertical: 16 }} />
        ) : !user?.courses || user.courses.length === 0 ? (
          <Text style={{ color: "#888", paddingVertical: 16 }}>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#fff",
  },

  settingsIcon: {
    position: "absolute",
    top: 10,
    right: 20,
    padding: 20,
  },

  avatarWrapper: {
    alignSelf: "center",
    marginTop: 30,
  },

  avatar: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "#ddd",
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
  },

  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#eee",
    padding: 16,
  },

  cardTitle: {
    fontWeight: "600",
    fontSize: 18,
    marginBottom: 10,
  },

  courseRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderColor: "#f1f1f1",
  },

  courseTitle: {
    fontWeight: "500",
    paddingVertical: 5,
  },

  courseSubtitle: {
    color: "#777",
  },

  editButton: {
    marginTop: 25,
    alignSelf: "center",
    backgroundColor: "#ddd",
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 20,
  },

  editText: {
    fontWeight: "500",
  },
});
