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
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState, useEffect, useMemo } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { apiFetch } from "../../lib/api";
import { useTheme, Colors } from "../../context/ThemeContext";

const MAX_COURSES = 8;

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
  const params = useLocalSearchParams<{ year?: string; major?: string; goal?: string }>();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [selectedCourses, setSelectedCourses] = useState<Course[]>([]);
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      apiFetch("/api/courses").then((res) => res.json()),
      apiFetch("/api/users/me").then((res) => (res.ok ? res.json() : null)),
    ])
      .then(([coursesData, userData]) => {
        setAllCourses(coursesData.courses);
        if (userData?.user?.courses) {
          setSelectedCourses(userData.user.courses);
        }
        // During onboarding only: skip if they already finished before reaching this step
        if (userData?.user?.year && params.year) {
          router.replace("/tabs/home");
        }
      })
      .catch((err) => console.error("Failed to load:", err))
      .finally(() => setLoading(false));
  }, []);

  const saveAndContinue = async () => {
    setSaving(true);
    try {
      await Promise.all([
        apiFetch("/api/users/me/courses", {
          method: "PUT",
          body: JSON.stringify({ courseIds: selectedCourses.map((c) => c._id) }),
        }),
        params.year
          ? apiFetch("/api/users/me/profile", {
              method: "PUT",
              body: JSON.stringify({
                year: params.year,
                major: params.major || null,
                goal: params.goal || null,
              }),
            })
          : Promise.resolve(),
      ]);
      router.replace("/tabs/home");
    } catch (err: any) {
      Alert.alert("Failed to save", err.message || "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const filteredCourses = search.length > 0
    ? allCourses
        .filter((c) => {
          const query = search.toLowerCase();
          const label = `${c.subjectArea} ${c.number} ${c.title}`.toLowerCase();
          if (label.includes(query)) return true;
          const queryNoSpaces = query.replace(/\s+/g, "");
          const labelNoSpaces = label.replace(/\s+/g, "");
          if (labelNoSpaces.includes(queryNoSpaces)) return true;
          for (const [alias, real] of Object.entries(ALIASES)) {
            const aliasLower = alias.toLowerCase();
            if (query.startsWith(aliasLower)) {
              const expanded = real.toLowerCase() + query.slice(alias.length);
              if (label.includes(expanded)) return true;
            }
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
        <ActivityIndicator size="large" color={colors.mutedText} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={24} color={colors.text} />
      </TouchableOpacity>

      <Text style={styles.title}>Add your Enrolled Courses</Text>

      <FlatList
        data={selectedCourses}
        keyExtractor={(item) => item._id}
        contentContainerStyle={{ paddingBottom: 20 }}
        renderItem={({ item }) => (
          <View style={styles.courseCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.courseName}>{item.subjectArea} {item.number}</Text>
              <Text style={styles.subtitle}>{item.title}</Text>
            </View>
            <TouchableOpacity style={styles.removeBtn} onPress={() => removeCourse(item._id)}>
              <Ionicons name="close" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>
        )}
        ListFooterComponent={
          <>
            {selectedCourses.length >= MAX_COURSES ? (
              <View style={[styles.addClassCard, { opacity: 0.4 }]}>
                <Text style={styles.addClassText}>Maximum {MAX_COURSES} courses</Text>
              </View>
            ) : (
              <TouchableOpacity style={styles.addClassCard} onPress={() => setModalVisible(true)}>
                <Text style={styles.addClassText}>Add Class</Text>
                <Ionicons name="add" size={20} color={colors.mutedText} />
              </TouchableOpacity>
            )}

            <Text style={styles.addMore}>Add More Classes</Text>

            <TouchableOpacity
              style={[styles.continueBtn, saving && { opacity: 0.5 }]}
              onPress={saveAndContinue}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.continueText}>Continue</Text>
              )}
            </TouchableOpacity>
          </>
        }
      />

      <Modal transparent visible={modalVisible} animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Enter your Course Name</Text>

            <View style={styles.searchBar}>
              <TextInput
                placeholder="Search for your class..."
                placeholderTextColor={colors.mutedText}
                value={search}
                onChangeText={setSearch}
                style={[{ flex: 1 }, { color: colors.text }]}
                autoFocus
              />
              <Ionicons name="search" size={20} color={colors.mutedText} />
            </View>

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
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      padding: 24,
      backgroundColor: colors.background,
    },
    backBtn: {
      alignSelf: "flex-start",
      padding: 8,
      marginBottom: -16,
    },
    title: {
      fontSize: 28,
      fontWeight: "700",
      textAlign: "center",
      marginVertical: 40,
      color: colors.text,
    },
    courseCard: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 20,
      padding: 16,
      marginBottom: 16,
      flexDirection: "row",
      justifyContent: "space-between",
      backgroundColor: colors.card,
    },
    courseName: {
      fontWeight: "600",
      fontSize: 16,
      color: colors.text,
    },
    subtitle: {
      color: colors.subtext,
    },
    removeBtn: {
      backgroundColor: colors.inputBg,
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    addClassCard: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 20,
      padding: 16,
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 10,
      backgroundColor: colors.card,
    },
    addClassText: {
      color: colors.mutedText,
    },
    addMore: {
      textAlign: "right",
      marginBottom: 30,
      color: colors.subtext,
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
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.4)",
      justifyContent: "center",
      padding: 20,
    },
    modalCard: {
      backgroundColor: colors.card,
      borderRadius: 30,
      padding: 24,
    },
    modalTitle: {
      fontSize: 22,
      fontWeight: "700",
      textAlign: "center",
      marginBottom: 20,
      color: colors.text,
    },
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 25,
      paddingHorizontal: 16,
      paddingVertical: 10,
      marginBottom: 15,
      backgroundColor: colors.background,
    },
    searchResult: {
      paddingVertical: 8,
      fontSize: 16,
      color: colors.text,
    },
    cancelBtn: {
      marginTop: 12,
      alignItems: "center",
    },
    cancelText: {
      color: colors.text,
    },
  });
}
