import { useMemo, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";

export default function Step1() {
  const router = useRouter();
  const [selectedYear, setSelectedYear] = useState<string | null>(null);

  const years = useMemo(
    () => ["Freshman", "Sophomore", "Junior", "Senior", "Graduate"],
    []
  );

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.step}>Step 1 of 3</Text>
      <Text style={styles.title}>What year are you?</Text>
      <Text style={styles.subtitle}>
        This helps us personalize your onboarding.
      </Text>

      <View style={styles.options}>
        {years.map((year) => {
          const selected = selectedYear === year;
          return (
            <TouchableOpacity
              key={year}
              style={[styles.option, selected && styles.optionSelected]}
              onPress={() => setSelectedYear(year)}
            >
              <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                {year}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        style={[styles.button, !selectedYear && styles.buttonDisabled]}
        disabled={!selectedYear}
        onPress={() =>
          router.push({
            pathname: "/auth/questionnaire/step2",
            params: { year: selectedYear ?? "" },
          })
        }
      >
        <Text style={styles.buttonText}>Continue</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 24,
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
  options: {
    marginTop: 28,
    gap: 12,
  },
  option: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  optionSelected: {
    borderColor: "#555",
    backgroundColor: "#f3f3f3",
  },
  optionText: {
    fontSize: 16,
    color: "#222",
  },
  optionTextSelected: {
    fontWeight: "600",
  },
  button: {
    marginTop: "auto",
    marginBottom: 12,
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