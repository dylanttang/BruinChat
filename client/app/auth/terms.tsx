import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { apiFetch, clearAuthToken, clearDevUserId } from "../../lib/api";
import { Colors, fonts, useTheme } from "../../context/ThemeContext";
import GradientButton from "../../components/GradientButton";

// Plain-language summary of the rules Apple's guideline 1.2 cares about. The
// full, binding text is in the Terms of Service linked below.
const RULES = [
  { icon: "people-outline", text: "Class chats are visible to everyone in the class. Post like you're in a room full of classmates." },
  { icon: "ban-outline", text: "Zero tolerance for harassment, hate, threats, sexual content, spam, or sharing others' private info." },
  { icon: "school-outline", text: "Don't share exam or quiz answers during an assessment." },
  { icon: "flag-outline", text: "Report anything that breaks the rules. We review reports within 24 hours and remove offenders." },
] as const;

export default function TermsAgreement() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [termsVersion, setTermsVersion] = useState<string | null>(null);
  const [onboarded, setOnboarded] = useState(false);

  useEffect(() => {
    apiFetch("/api/users/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setTermsVersion(data?.currentTermsVersion ?? null);
        setOnboarded(!!data?.user?.year);
      })
      .catch((err) => console.error("Failed to load terms version:", err));
  }, []);

  const accept = async () => {
    if (!termsVersion) return;
    setSaving(true);
    try {
      const res = await apiFetch("/api/users/me/terms", {
        method: "PUT",
        body: JSON.stringify({ version: termsVersion }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      router.replace(onboarded ? "/tabs/home" : "/auth/questionnaire/step1");
    } catch (err) {
      console.error("Failed to accept terms:", err);
      Alert.alert("Something went wrong", "Couldn't save your agreement. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const decline = async () => {
    await clearAuthToken();
    await clearDevUserId();
    router.replace("/auth/welcome/welcome");
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Before you join</Text>
        <Text style={styles.subtitle}>
          BChat is a community of classmates. Here's what we ask of everyone.
        </Text>

        <View style={styles.card}>
          {RULES.map((rule, index) => (
            <View key={rule.icon} style={[styles.rule, index === RULES.length - 1 && styles.lastRule]}>
              <View style={styles.ruleIcon}>
                <Ionicons name={rule.icon} size={20} color={colors.brand} />
              </View>
              <Text style={styles.ruleText}>{rule.text}</Text>
            </View>
          ))}
        </View>

        <View style={styles.links}>
          <TouchableOpacity onPress={() => router.push("/legal/terms")}>
            <Text style={styles.link}>Read the Terms of Service</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/legal/privacy")}>
            <Text style={styles.link}>Read the Privacy Policy</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.agreeRow}
          onPress={() => setAgreed(!agreed)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: agreed }}
        >
          <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
            {agreed && <Ionicons name="checkmark" size={16} color={colors.onPrimary} />}
          </View>
          <Text style={styles.agreeText}>
            I agree to the Terms of Service and Privacy Policy. If I'm under 18, a parent or guardian
            has agreed too.
          </Text>
        </TouchableOpacity>

        <GradientButton
          label="Agree and continue"
          onPress={accept}
          disabled={!agreed || !termsVersion}
          loading={saving}
        />

        {!termsVersion && <ActivityIndicator style={styles.loading} color={colors.mutedText} />}

        <TouchableOpacity style={styles.declineBtn} onPress={decline}>
          <Text style={styles.declineText}>Don't agree — sign out</Text>
        </TouchableOpacity>
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
    title: {
      fontFamily: fonts.bold,
      fontSize: 30,
      color: colors.text,
      marginTop: 12,
    },
    subtitle: {
      fontFamily: fonts.regular,
      fontSize: 15,
      lineHeight: 21,
      color: colors.subtext,
      marginTop: 8,
      marginBottom: 20,
    },
    card: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 18,
      backgroundColor: colors.card,
      paddingHorizontal: 16,
    },
    rule: {
      flexDirection: "row",
      alignItems: "flex-start",
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.separator,
    },
    lastRule: {
      borderBottomWidth: 0,
    },
    ruleIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.brandSoft,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
    },
    ruleText: {
      flex: 1,
      fontFamily: fonts.regular,
      fontSize: 15,
      lineHeight: 21,
      color: colors.text,
    },
    links: {
      marginTop: 18,
      gap: 10,
    },
    link: {
      fontFamily: fonts.medium,
      fontSize: 15,
      color: colors.primary,
    },
    agreeRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginTop: 24,
      marginBottom: 20,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 7,
      borderWidth: 1.5,
      borderColor: colors.mutedText,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
      marginTop: 1,
    },
    checkboxChecked: {
      backgroundColor: colors.brand,
      borderColor: colors.brand,
    },
    agreeText: {
      flex: 1,
      fontFamily: fonts.regular,
      fontSize: 14,
      lineHeight: 20,
      color: colors.text,
    },
    loading: {
      marginTop: 12,
    },
    declineBtn: {
      marginTop: 18,
      alignItems: "center",
      paddingVertical: 8,
    },
    declineText: {
      fontFamily: fonts.regular,
      fontSize: 14,
      color: colors.mutedText,
    },
  });
}
