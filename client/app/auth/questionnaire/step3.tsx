import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  TextInput,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

export default function AddCoursesScreen() {
  const router = useRouter();
  const [courses, setCourses] = useState([
    {
      id: "1",
      name: "CS 31 Lecture 1",
      subtitle: "Discussion 1E",
      time1: "M, W, F 10:00–11:00 AM",
      time2: "TR 3:00 PM",
    },
  ]);

  const [modalVisible, setModalVisible] = useState(false);
  const [search, setSearch] = useState("");

  const availableCourses = [
    "CS 32",
    "CS 33",
    "GEOL 101",
    "MATH 61",
    "PHYSICS 5A",
  ];

  const filteredCourses = availableCourses.filter((c) =>
    c.toLowerCase().includes(search.toLowerCase())
  );

  const addCourse = (courseName: string) => {
    const newCourse = {
      id: Date.now().toString(),
      name: courseName,
      subtitle: "Discussion TBD",
      time1: "Schedule TBD",
      time2: "",
    };

    setCourses([...courses, newCourse]);
    setModalVisible(false);
    setSearch("");
  };

  const removeCourse = (id: string) => {
    setCourses(courses.filter((c) => c.id !== id));
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Add your Enrolled Courses</Text>

      {/* COURSE LIST */}
      <FlatList
        data={courses}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 20 }}
        renderItem={({ item }) => (
          <View style={styles.courseCard}>
            <View>
              <Text style={styles.courseName}>{item.name}</Text>
              <Text style={styles.subtitle}>{item.subtitle}</Text>
              <Text style={styles.time}>{item.time1}</Text>
              {item.time2 ? <Text style={styles.time}>{item.time2}</Text> : null}
            </View>

            <TouchableOpacity
              style={styles.removeBtn}
              onPress={() => removeCourse(item.id)}
            >
              <Ionicons name="close" size={18} />
            </TouchableOpacity>
          </View>
        )}
        ListFooterComponent={
          <>
            {/* ADD CLASS BUTTON */}
            <TouchableOpacity
              style={styles.addClassCard}
              onPress={() => setModalVisible(true)}
            >
              <Text style={{ color: "#888" }}>Add Class</Text>
              <Ionicons name="add" size={20} color="#888" />
            </TouchableOpacity>

            <Text style={styles.addMore}>Add More Classes</Text>

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
              />
              <Ionicons name="search" size={20} />
            </View>

            {/* SEARCH RESULTS */}
            {search.length > 0 &&
              filteredCourses.map((course) => (
                <Pressable
                  key={course}
                  onPress={() => addCourse(course)}
                >
                  <Text style={styles.searchResult}>
                    {course}
                  </Text>
                </Pressable>
              ))}

            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => addCourse(search)}
            >
              <Text style={{ color: "white" }}>Add Class</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setModalVisible(false)}
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

  time: {
    fontSize: 12,
    color: "#555",
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

  addBtn: {
    backgroundColor: "#666",
    padding: 14,
    borderRadius: 20,
    alignItems: "center",
    marginTop: 15,
  },

  cancelBtn: {
    marginTop: 12,
    alignItems: "center",
  },
});