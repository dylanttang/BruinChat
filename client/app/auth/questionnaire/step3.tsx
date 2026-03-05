import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  TextInput,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState, useEffect } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";
const MAX_COURSES = 8;

// Common abbreviations students use → official SOC subject area codes
const ALIASES: Record<string, string> = {
  "CS": "COM SCI",
  "EE": "EC ENGR",
  "LS": "LIFESCI",
  "POLI SCI": "POL SCI",
  "POLISCI": "POL SCI",
  "ASTRO": "ASTR",
  "MECH E": "MECH&AE",
  "MAE": "MECH&AE",
  "CEE": "C&EE",
};

type Course = {
  _id: string;
  subjectArea: string;
  number: string;
  title: string;
};

export default function AddCoursesScreen() {
  const router = useRouter();
  const [selectedCourses, setSelectedCourses] = useState<Course[]>([]);
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalVisible, setModalVisible] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch(`${API_URL}/api/courses`)
      .then((res) => res.json())
      .then((data) => setAllCourses(data.courses))
      .catch((err) => console.error("Failed to fetch courses:", err))
      .finally(() => setLoading(false));
  }, []);

  const filteredCourses = search.length > 0
    ? allCourses
        .filter((c) => {
          const query = search.toLowerCase();
          const label = `${c.subjectArea} ${c.number} ${c.title}`.toLowerCase();
          if (label.includes(query)) return true;

          // Also match without spaces (e.g. "CS32" matches "COM SCI 32")
          const queryNoSpaces = query.replace(/\s+/g, "");
          const labelNoSpaces = label.replace(/\s+/g, "");
          if (labelNoSpaces.includes(queryNoSpaces)) return true;

          // Check if query starts with a known alias
          for (const [alias, real] of Object.entries(ALIASES)) {
            const aliasLower = alias.toLowerCase();
            if (query.startsWith(aliasLower)) {
              const expanded = real.toLowerCase() + query.slice(alias.length);
              if (label.includes(expanded)) return true;
            }
            // Also check without spaces (e.g. "cs32" → "comsci32")
            if (queryNoSpaces.startsWith(aliasLower.replace(/\s+/g, ""))) {
              const expanded = real.toLowerCase().replace(/\s+/g, "") + queryNoSpaces.slice(aliasLower.replace(/\s+/g, "").length);
              if (labelNoSpaces.includes(expanded)) return true;
            }
          }
          return false;
        })
        .slice(0, 20)
    : [];

  const addCourse = (course: Course) => {
    if (selectedCourses.some((c) => c._id === course._id)) return;
    setSelectedCourses([...selectedCourses, course]);
    setModalVisible(false);
    setSearch("");
  };

  const removeCourse = (id: string) => {
    setSelectedCourses(selectedCourses.filter((c) => c._id !== id));
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color="#888" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Add your Enrolled Courses</Text>

      {/* COURSE LIST */}
      <FlatList
        data={selectedCourses}
        keyExtractor={(item) => item._id}
        contentContainerStyle={{ paddingBottom: 20 }}
        renderItem={({ item }) => (
          <View style={styles.courseCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.courseName}>
                {item.subjectArea} {item.number}
              </Text>
              <Text style={styles.subtitle}>{item.title}</Text>
            </View>

            <TouchableOpacity
              style={styles.removeBtn}
              onPress={() => removeCourse(item._id)}
            >
              <Ionicons name="close" size={18} />
            </TouchableOpacity>
          </View>
        )}
        ListFooterComponent={
          <>
            {/* ADD CLASS BUTTON */}
            {selectedCourses.length >= MAX_COURSES ? (
              <View style={[styles.addClassCard, { opacity: 0.4 }]}>
                <Text style={{ color: "#888" }}>Maximum {MAX_COURSES} courses</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.addClassCard}
                onPress={() => setModalVisible(true)}
              >
                <Text style={{ color: "#888" }}>Add Class</Text>
                <Ionicons name="add" size={20} color="#888" />
              </TouchableOpacity>
            )}

            <Text style={styles.addMore}>
              {selectedCourses.length} / {MAX_COURSES} courses
            </Text>

            <TouchableOpacity
              style={styles.continueBtn}
              onPress={() => router.replace("/tabs/home")}
            >
              <Text style={styles.continueText}>Continue</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.skipBtn}>
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
          </>
        }
      />

      {/* MODAL */}
      <Modal transparent visible={modalVisible} animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              Enter your Course Name
            </Text>

            <View style={styles.searchBar}>
              <TextInput
                placeholder="Search for your class..."
                value={search}
                onChangeText={setSearch}
                style={{ flex: 1 }}
                autoFocus
              />
              <Ionicons name="search" size={20} />
            </View>

            {/* SEARCH RESULTS */}
            <FlatList
              data={filteredCourses}
              keyExtractor={(item) => item._id}
              style={{ maxHeight: 200 }}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable onPress={() => addCourse(item)}>
                  <Text style={styles.searchResult}>
                    {item.subjectArea} {item.number} — {item.title}
                  </Text>
                </Pressable>
              )}
            />

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => { setModalVisible(false); setSearch(""); }}
            >
              <Text>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: "#fff",
  },

  title: {
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
    marginVertical: 40,
  },

  courseCard: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
  },

  courseName: {
    fontWeight: "600",
    fontSize: 16,
  },

  subtitle: {
    color: "#666",
  },

  removeBtn: {
    backgroundColor: "#eee",
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  addClassCard: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 20,
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  addMore: {
    textAlign: "right",
    marginBottom: 30,
    color: "#555",
  },

  continueBtn: {
    backgroundColor: "#777",
    padding: 14,
    borderRadius: 20,
    alignItems: "center",
    marginBottom: 12,
  },

  continueText: {
    color: "white",
    fontWeight: "600",
  },

  skipBtn: {
    backgroundColor: "#ccc",
    padding: 14,
    borderRadius: 20,
    alignItems: "center",
  },

  skipText: {
    fontWeight: "500",
  },

  /* MODAL */

  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: 20,
  },

  modalCard: {
    backgroundColor: "#f2f2f2",
    borderRadius: 30,
    padding: 24,
  },

  modalTitle: {
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 20,
  },

  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 25,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 15,
    backgroundColor: "white",
  },

  searchResult: {
    paddingVertical: 8,
    fontSize: 16,
  },

  cancelBtn: {
    marginTop: 12,
    alignItems: "center",
  },
});