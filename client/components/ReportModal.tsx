import { useEffect, useMemo, useState } from "react";
import { Alert, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, fonts, useTheme } from "../context/ThemeContext";
import { REPORT_REASONS, ReportReason, ReportTarget, submitReport } from "../lib/moderation";

type Props = {
  target: ReportTarget | null;
  onClose: () => void;
};

export default function ReportModal({ target, onClose }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Start fresh every time the modal opens for a new target.
  useEffect(() => {
    setReason(null);
    setDetails("");
  }, [target?.id]);

  const submit = async () => {
    if (!target || !reason) return;
    setSubmitting(true);
    try {
      const result = await submitReport(target, reason, details.trim());
      onClose();
      Alert.alert(
        result === "duplicate" ? "Already reported" : "Thanks for reporting",
        result === "duplicate"
          ? "You already have an open report for this. We'll review it soon."
          : "We review reports within 24 hours. You can also block this person so you don't see their messages."
      );
    } catch (err) {
      console.error("Failed to submit report:", err);
      Alert.alert("Couldn't send report", "Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const title = target?.type === "message" ? "Report message" : `Report ${target?.name ?? "user"}`;

  return (
    <Modal visible={!!target} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>
            {target?.type === "message"
              ? `What's wrong with this message from ${target.name}?`
              : "What's going on?"}
          </Text>

          {REPORT_REASONS.map((option) => {
            const selected = reason === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[styles.option, selected && styles.optionSelected]}
                onPress={() => setReason(option.value)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{option.label}</Text>
                {selected && <Ionicons name="checkmark-circle" size={20} color={colors.brand} />}
              </TouchableOpacity>
            );
          })}

          <TextInput
            style={styles.details}
            placeholder="Add details (optional)"
            placeholderTextColor={colors.mutedText}
            value={details}
            onChangeText={setDetails}
            maxLength={500}
            multiline
          />

          <View style={styles.buttons}>
            <TouchableOpacity style={styles.cancel} onPress={onClose} disabled={submitting}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submit, (!reason || submitting) && { opacity: 0.4 }]}
              onPress={submit}
              disabled={!reason || submitting}
            >
              <Text style={styles.submitText}>{submitting ? "Sending…" : "Send report"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: "center",
      padding: 24,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 20,
      padding: 20,
    },
    title: {
      fontFamily: fonts.bold,
      fontSize: 19,
      color: colors.text,
    },
    subtitle: {
      fontFamily: fonts.regular,
      fontSize: 14,
      color: colors.subtext,
      marginTop: 4,
      marginBottom: 14,
    },
    option: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 8,
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
      fontFamily: fonts.medium,
      color: colors.brand,
    },
    details: {
      fontFamily: fonts.regular,
      fontSize: 15,
      color: colors.text,
      backgroundColor: colors.inputBg,
      borderRadius: 12,
      padding: 12,
      minHeight: 72,
      textAlignVertical: "top",
      marginTop: 6,
    },
    buttons: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 10,
      marginTop: 16,
    },
    cancel: {
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: colors.inputBg,
    },
    cancelText: {
      fontFamily: fonts.medium,
      color: colors.text,
    },
    submit: {
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: colors.danger,
    },
    submitText: {
      fontFamily: fonts.bold,
      color: colors.onPrimary,
    },
  });
}
