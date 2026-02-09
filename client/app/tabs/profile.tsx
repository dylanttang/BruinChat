import { View, Text, StyleSheet, Image, FlatList, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const courses = [
  { id: "1", title: "CS 31 Lecture 1", subtitle: "Discussion 1E", time: "M, W, F 10:00–11:00 AM" },
  { id: "2", title: "CS 33 Lecture 3", subtitle: "Discussion 1E", time: "TR 3:00 PM" },
  { id: "3", title: "GEOL Lecture 1", subtitle: "Discussion 1E", time: "M, W, F 10:00–11:00 AM" },
];

export default function Profile() {
  return (
    <View style={styles.container}>
      {/* Settings icon top right */}
      <TouchableOpacity style={styles.settingsIcon}>
        <Ionicons name="options-outline" size={26} />
      </TouchableOpacity>

      {/* Avatar */}
      <View style={styles.avatarWrapper}>
        <Image
          style={styles.avatar}
        />

        <TouchableOpacity style={styles.editAvatar}>
          <Ionicons name="pencil" size={16} color="white" />
        </TouchableOpacity>
      </View>

      {/* Name */}
      <Text style={styles.name}>FirstName LastName</Text>

      {/* Courses Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>My Courses</Text>

        <FlatList
          data={courses}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.courseRow}>
              <View>
                <Text style={styles.courseTitle}>{item.title}</Text>
                <Text style={styles.courseSubtitle}>{item.subtitle}</Text>
              </View>

              <Text style={styles.courseTime}>{item.time}</Text>
            </View>
          )}
        />
      </View>

      <TouchableOpacity style={styles.editButton}>
        <Text style={styles.editText}>Edit Courses</Text>
      </TouchableOpacity>
    </View>
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
    top: 50,
    right: 20,
    padding: 20,
  },

  avatarWrapper: {
    alignSelf: "center",
    marginTop: 70,
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

  courseTime: {
    fontSize: 12,
    color: "#555",
    paddingVertical: 5,
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
