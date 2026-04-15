import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
export default function Step2() {
  const router = useRouter();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const canContinue = useMemo(() => true, []); // allow continue even if skipped
  useEffect(() => {
    (async () => {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      setHasPermission(status === "granted");
      if (status !== "granted") {
        Alert.alert(
          "Permission needed",
          "We need access to your photos so you can upload a profile picture."
        );
      }
    })();
  }, []);
  const pickImage = async () => {
    if (hasPermission === false) {
      Alert.alert(
        "Permission denied",
        "Please enable photo permissions in Settings to upload an image."
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled) {
      setImageUri(result.assets[0].uri);
    }
  };
  const onContinue = () => {
    // TODO: persist/upload imageUri if needed
    router.push("/auth/questionnaire/step3");
  };
  const onSkip = () => {
    setImageUri(null);
    router.push("/auth/questionnaire/step3");
  };
  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.content}>
        <Text style={styles.title}>Add a Profile Picture</Text>
        <Text style={styles.subtitle}>
          Your profile picture will be visible{"\n"}to everyone.
        </Text>
        <TouchableOpacity
          onPress={pickImage}
          activeOpacity={0.85}
          style={styles.circleUpload}
        >
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.circleImage} />
          ) : (
            <Text style={styles.circlePlaceholder}>Upload an image</Text>
          )}
        </TouchableOpacity>
        <View style={styles.buttons}>
          <TouchableOpacity
            onPress={onContinue}
            activeOpacity={0.85}
            disabled={!canContinue}
            style={[styles.primaryButton, !canContinue && styles.buttonDisabled]}
          >
            <Text style={styles.primaryText}>Continue</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onSkip}
            activeOpacity={0.85}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryText}>Skip</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
const CIRCLE_SIZE = 132;
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  content: {
    flex: 1,
    paddingTop: 190,
    paddingHorizontal: 32,
    alignItems: "center",
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800",
    color: "#111111",
    textAlign: "center",
    marginBottom: 10,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: "500",
    color: "#6E6E6E",
    textAlign: "center",
    marginBottom: 26,
  },
  circleUpload: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    borderWidth: 1.2,
    borderColor: "#2C2C2C",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginBottom: 34,
  },
  circlePlaceholder: {
    fontSize: 14,
    fontWeight: "500",
    color: "#B6B6B6",
    textAlign: "center",
  },
  circleImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  buttons: {
    width: "100%",
    alignItems: "center",
    gap: 14,
  },
  primaryButton: {
    width: 220,
    height: 54,
    borderRadius: 28,
    backgroundColor: "#5F5F5F",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryButton: {
    width: 220,
    height: 54,
    borderRadius: 28,
    backgroundColor: "#CFCFCF",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: {
    color: "#111111",
    fontSize: 16,
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});