import { useMemo, useState } from "react";
import { Alert, Image, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, fonts, useTheme } from "../context/ThemeContext";
import { ReportTarget, setUserBlocked } from "../lib/moderation";
import ReportModal from "./ReportModal";

export type ProfileUser = {
  _id: string;
  displayName: string;
  avatarUrl?: string;
};

type Props = {
  user: ProfileUser | null;
  isBlocked: boolean;
  onClose: () => void;
  onBlockedChange: (userId: string, blocked: boolean) => void;
};

// Bottom sheet shown when you tap someone's name or picture: who they are,
// plus Block/Unblock and Report.
export default function UserProfileSheet({ user, isBlocked, onClose, onBlockedChange }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [busy, setBusy] = useState(false);

  const toggleBlock = () => {
    if (!user) return;
    const blocking = !isBlocked;
    Alert.alert(
      blocking ? `Block ${user.displayName}?` : `Unblock ${user.displayName}?`,
      blocking
        ? "You won't see their messages or get notifications from them. They won't be told. You can unblock them in Settings."
        : "You'll see their messages again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: blocking ? "Block" : "Unblock",
          style: blocking ? "destructive" : "default",
          onPress: async () => {
            setBusy(true);
            try {
              await setUserBlocked(user._id, blocking);
              onBlockedChange(user._id, blocking);
              onClose();
            } catch (err) {
              console.error("Failed to update block:", err);
              Alert.alert("Something went wrong", "Please try again.");
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  const openReport = () => {
    if (!user) return;
    setReportTarget({ type: "user", id: user._id, name: user.displayName });
  };

  const closeReport = () => {
    setReportTarget(null);
    onClose();
  };

  return (
    <>
      {/* Hide the sheet while the report dialog is up; iOS doesn't stack two
          visible Modals reliably. */}
      <Modal visible={!!user && !reportTarget} transparent animationType="slide" onRequestClose={onClose}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          {user && (
            <>
              <Image source={user.avatarUrl ? { uri: user.avatarUrl } : undefined} style={styles.avatar} />
              <Text style={styles.name}>{user.displayName}</Text>
              {isBlocked && <Text style={styles.blockedTag}>Blocked</Text>}

              <View style={styles.actions}>
                <TouchableOpacity style={styles.action} onPress={toggleBlock} disabled={busy}>
                  <Ionicons
                    name={isBlocked ? "checkmark-circle-outline" : "ban-outline"}
                    size={22}
                    color={isBlocked ? colors.primary : colors.danger}
                  />
                  <Text style={[styles.actionText, { color: isBlocked ? colors.primary : colors.danger }]}>
                    {isBlocked ? "Unblock" : "Block"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.action} onPress={openReport} disabled={busy}>
                  <Ionicons name="flag-outline" size={22} color={colors.danger} />
                  <Text style={[styles.actionText, { color: colors.danger }]}>Report</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.close} onPress={onClose}>
                <Text style={styles.closeText}>Close</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </Modal>
      <ReportModal target={reportTarget} onClose={closeReport} />
    </>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
    },
    sheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 24,
      paddingTop: 10,
      paddingBottom: 36,
      alignItems: "center",
    },
    handle: {
      width: 40,
      height: 5,
      borderRadius: 3,
      backgroundColor: colors.border,
      marginBottom: 18,
    },
    avatar: {
      width: 84,
      height: 84,
      borderRadius: 42,
      backgroundColor: colors.avatarBg,
    },
    name: {
      fontFamily: fonts.bold,
      fontSize: 22,
      color: colors.text,
      marginTop: 12,
    },
    blockedTag: {
      fontFamily: fonts.medium,
      fontSize: 13,
      color: colors.danger,
      marginTop: 4,
    },
    actions: {
      flexDirection: "row",
      gap: 12,
      marginTop: 22,
      alignSelf: "stretch",
    },
    action: {
      flex: 1,
      alignItems: "center",
      gap: 6,
      paddingVertical: 14,
      borderRadius: 16,
      backgroundColor: colors.inputBg,
    },
    actionText: {
      fontFamily: fonts.medium,
      fontSize: 14,
    },
    close: {
      marginTop: 16,
      paddingVertical: 8,
    },
    closeText: {
      fontFamily: fonts.medium,
      fontSize: 15,
      color: colors.subtext,
    },
  });
}
