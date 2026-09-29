import { useMemo, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useTheme, fonts, Colors } from "../../../context/ThemeContext";
import GradientButton from "../../../components/GradientButton";

export default function Step1() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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

      <GradientButton
        label="Continue"
        disabled={!selectedYear}
        style={styles.button}
        onPress={() =>
          router.push({
            pathname: "/auth/questionnaire/step2",
            params: { year: selectedYear ?? "" },
          })
        }
      />
    </SafeAreaView>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      padding: 24,
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
    options: {
      marginTop: 28,
      gap: 12,
    },
    option: {
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 18,
      paddingVertical: 16,
      paddingHorizontal: 18,
      backgroundColor: colors.card,
    },
    optionSelected: {
      borderColor: colors.brand,
      backgroundColor: colors.brandSoft,
    },
    optionText: {
      fontFamily: fonts.regular,
      fontSize: 16,
      color: colors.text,
    },
    optionTextSelected: {
      fontFamily: fonts.bold,
      color: colors.brand,
    },
    button: {
      marginTop: "auto",
      marginBottom: 12,
    },
  });
}
