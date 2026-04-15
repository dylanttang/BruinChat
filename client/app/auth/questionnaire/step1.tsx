import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
export default function Step1() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const disabled = useMemo(
    () => !firstName.trim() || !lastName.trim(),
    [firstName, lastName]
  );
  const onContinue = () => {
    if (disabled) {
      Alert.alert("Missing info", "Please enter both your first and last name.");
      return;
    }
    router.push("/auth/questionnaire/step2");
  };
  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* subtle background blobs like the screenshot */}
      <View pointerEvents="none" style={styles.blobTopRight} />
      <View pointerEvents="none" style={styles.blobMidRight} />
      <View pointerEvents="none" style={styles.blobBottomRight} />
      <View style={styles.content}>
        <Text style={styles.title}>
          Enter your{"\n"}Preferred Name
        </Text>
        <Text style={styles.subtitle}>
          This will be viewable by everyone in your{"\n"}classes.
        </Text>
        <View style={styles.form}>
          <TextInput
            value={firstName}
            onChangeText={setFirstName}
            placeholder="Your firstname"
            placeholderTextColor="#B6B6B6"
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="next"
            style={styles.input}
          />
          <TextInput
            value={lastName}
            onChangeText={setLastName}
            placeholder="Your lastname"
            placeholderTextColor="#B6B6B6"
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
            style={styles.input}
            onSubmitEditing={onContinue}
          />
        </View>
        <TouchableOpacity
          onPress={onContinue}
          activeOpacity={0.85}
          disabled={disabled}
          style={[styles.button, disabled && styles.buttonDisabled]}
        >
          <Text style={styles.buttonText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  content: {
    flex: 1,
    paddingTop: 170,
    paddingHorizontal: 32,
    alignItems: "center",
  },
  title: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "800",
    color: "#111111",
    textAlign: "center",
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "500",
    color: "#6E6E6E",
    textAlign: "center",
    marginBottom: 34,
  },
  form: {
    width: "100%",
    gap: 16,
    marginBottom: 26,
  },
  input: {
    height: 52,
    borderRadius: 28,
    borderWidth: 1.2,
    borderColor: "#2C2C2C",
    paddingHorizontal: 18,
    fontSize: 15,
    color: "#111111",
    backgroundColor: "#FFFFFF",
  },
  button: {
    width: 220,
    height: 54,
    borderRadius: 28,
    backgroundColor: "#5F5F5F",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  // Background blobs (light, like the screenshot)
  blobTopRight: {
    position: "absolute",
    right: -55,
    top: 90,
    width: 180,
    height: 140,
    borderRadius: 90,
    backgroundColor: "#F2F2F2",
    opacity: 0.9,
    transform: [{ rotate: "12deg" }],
  },
  blobMidRight: {
    position: "absolute",
    right: -65,
    top: 210,
    width: 150,
    height: 110,
    borderRadius: 80,
    backgroundColor: "#F4F4F4",
    opacity: 0.9,
    transform: [{ rotate: "-10deg" }],
  },
  blobBottomRight: {
    position: "absolute",
    right: -55,
    top: 325,
    width: 170,
    height: 120,
    borderRadius: 90,
    backgroundColor: "#F3F3F3",
    opacity: 0.9,
    transform: [{ rotate: "8deg" }],
  },
});