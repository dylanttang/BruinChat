import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Markdown from "../../components/Markdown";
import { PRIVACY_POLICY, TERMS_OF_SERVICE } from "../../legal/content";
import { Colors, fonts, useTheme } from "../../context/ThemeContext";

const DOCS = {
  terms: { title: "Terms of Service", source: TERMS_OF_SERVICE },
  privacy: { title: "Privacy Policy", source: PRIVACY_POLICY },
} as const;

export default function LegalDocument() {
  const router = useRouter();
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const document = DOCS[doc as keyof typeof DOCS] ?? DOCS.terms;

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={24} color={colors.brand} />
        </TouchableOpacity>
        <Text style={styles.title}>{document.title}</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Markdown source={document.source} />
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
    header: {
      height: 56,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.card,
    },
    title: {
      fontFamily: fonts.bold,
      fontSize: 18,
      color: colors.text,
    },
    content: {
      padding: 20,
      paddingBottom: 48,
    },
  });
}
