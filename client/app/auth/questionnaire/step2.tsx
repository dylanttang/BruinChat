import { useMemo, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ScrollView,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

export default function Step2() {
  const router = useRouter();
  const params = useLocalSearchParams<{ year?: string }>();
  const [major, setMajor] = useState("");
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null);

  const goals = useMemo(
    () => [
      "Find classmates in my courses",
      "Get help with coursework",
      "Build study groups",
      "Meet new people on campus",
    ],
    []
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.step}>Step 2 of 3</Text>
        <Text style={styles.title}>Tell us a little more</Text>
        <Text style={styles.subtitle}>
          Year: {params.year || "Not provided"}
        </Text>

        <Text style={styles.sectionLabel}>What is your major?</Text>
        <TextInput
          value={major}
          onChangeText={setMajor}
          placeholder="e.g. Computer Science"
          style={styles.input}
          autoCapitalize="words"
        />

        <Text style={styles.sectionLabel}>What do you want from BruinChat?</Text>
        <View style={styles.options}>
          {goals.map((goal) => {
            const selected = selectedGoal === goal;
            return (
              <TouchableOpacity
                key={goal}
                style={[styles.option, selected && styles.optionSelected]}
                onPress={() => setSelectedGoal(goal)}
              >
                <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                  {goal}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={[styles.button, !selectedGoal && styles.buttonDisabled]}
          disabled={!selectedGoal}
          onPress={() => router.push("/auth/questionnaire/step3")}
        >
          <Text style={styles.buttonText}>Continue to Courses</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  content: {
    padding: 24,
    paddingBottom: 40,
  },
  step: {
    marginTop: 12,
    color: "#888",
    fontSize: 13,
  },
  title: {
    marginTop: 16,
    fontSize: 30,
    fontWeight: "700",
  },
  subtitle: {
    marginTop: 10,
    color: "#666",
    fontSize: 15,
  },
  sectionLabel: {
    marginTop: 26,
    marginBottom: 8,
    fontSize: 16,
    fontWeight: "600",
    color: "#222",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  options: {
    gap: 10,
  },
  option: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  optionSelected: {
    borderColor: "#555",
    backgroundColor: "#f3f3f3",
  },
  optionText: {
    fontSize: 15,
    color: "#222",
  },
  optionTextSelected: {
    fontWeight: "600",
  },
  button: {
    marginTop: 28,
    backgroundColor: "#777",
    borderRadius: 18,
    alignItems: "center",
    paddingVertical: 14,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});