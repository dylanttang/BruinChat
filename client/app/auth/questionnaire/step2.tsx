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
import { useTheme, fonts, Colors } from "../../../context/ThemeContext";
import GradientButton from "../../../components/GradientButton";

export default function Step2() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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
          placeholderTextColor={colors.mutedText}
          style={styles.input}
          autoCapitalize="words"
        />

        <Text style={styles.sectionLabel}>What do you want from BChat?</Text>
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

        <GradientButton
          label="Continue to Courses"
          disabled={!selectedGoal}
          style={styles.button}
          onPress={() =>
            router.push({
              pathname: "/auth/questionnaire/step3",
              params: {
                year: params.year ?? "",
                major: major.trim(),
                goal: selectedGoal ?? "",
              },
            })
          }
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      padding: 24,
      paddingBottom: 40,
    },
    step: {
      marginTop: 12,
      fontFamily: fonts.medium,
      color: colors.brand,
      fontSize: 13,
    },
    title: {
      marginTop: 16,
      fontFamily: fonts.bold,
      fontSize: 30,
      color: colors.text,
    },
    subtitle: {
      marginTop: 10,
      fontFamily: fonts.regular,
      color: colors.subtext,
      fontSize: 15,
    },
    sectionLabel: {
      marginTop: 26,
      marginBottom: 8,
      fontFamily: fonts.bold,
      fontSize: 16,
      color: colors.text,
    },
    input: {
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontFamily: fonts.regular,
      fontSize: 15,
      color: colors.text,
      backgroundColor: colors.card,
    },
    options: {
      gap: 10,
    },
    option: {
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 16,
      paddingVertical: 14,
      paddingHorizontal: 14,
      backgroundColor: colors.card,
    },
    optionSelected: {
      borderColor: colors.brand,
      backgroundColor: colors.brandSoft,
    },
    optionText: {
      fontFamily: fonts.regular,
      fontSize: 15,
      color: colors.text,
    },
    optionTextSelected: {
      fontFamily: fonts.bold,
      color: colors.brand,
    },
    button: {
      marginTop: 28,
    },
  });
}
