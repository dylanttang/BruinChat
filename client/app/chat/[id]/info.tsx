import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { useTheme, Colors } from "../../context/ThemeContext";

export default function ChatInfo() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const courseDetails = {
    professor: "Name",
    lectureTime: "Time",
    midtermDates: "Dates",
    finalDates: "Dates",
  };

  const members = Array(8).fill({ username: "Username", courses: "Courses" });

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Chat Info</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Course Details */}
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>Professor</Text>
            <Text style={styles.value}>{courseDetails.professor}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Lecture Time</Text>
            <Text style={styles.value}>{courseDetails.lectureTime}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Midterm Dates</Text>
            <Text style={styles.value}>{courseDetails.midtermDates}</Text>
          </View>
          <View style={[styles.row, { borderBottomWidth: 0 }]}>
            <Text style={styles.label}>Final Dates</Text>
            <Text style={styles.value}>{courseDetails.finalDates}</Text>
          </View>
        </View>

        {/* Course Overview */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Course Overview</Text>
          <View style={styles.overviewPlaceholder} />
        </View>

        {/* Members */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Members</Text>
          {members.map((member, index) => (
            <View
              key={index}
              style={[styles.memberRow, index === members.length - 1 && { borderBottomWidth: 0 }]}
            >
              <View style={styles.avatar} />
              <Text style={styles.memberName}>{member.username}</Text>
              <Text style={styles.memberCourses}>{member.courses}</Text>
            </View>
          ))}
        </View>

        {/* Leave Button */}
        <TouchableOpacity style={styles.leaveButton}>
          <Text style={styles.leaveText}>Leave</Text>
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
    header: {
      height: 56,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    back: {
      fontSize: 22,
      color: colors.text,
    },
    title: {
      fontSize: 18,
      fontWeight: "600",
      color: colors.text,
    },
    content: {
      padding: 16,
    },
    card: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
      marginBottom: 16,
      backgroundColor: colors.card,
    },
    sectionTitle: {
      fontWeight: "600",
      fontSize: 16,
      marginBottom: 10,
      color: colors.text,
    },
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.separator,
    },
    label: {
      fontSize: 14,
      fontWeight: "500",
      color: colors.text,
    },
    value: {
      fontSize: 14,
      color: colors.subtext,
    },
    overviewPlaceholder: {
      height: 100,
      backgroundColor: colors.inputBg,
      borderRadius: 8,
    },
    memberRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.separator,
    },
    avatar: {
      width: 36,
      height: 36,
      backgroundColor: colors.avatarBg,
      borderRadius: 8,
      marginRight: 12,
    },
    memberName: {
      fontSize: 14,
      color: colors.text,
      flex: 1,
    },
    memberCourses: {
      fontSize: 13,
      color: colors.mutedText,
    },
    leaveButton: {
      borderWidth: 1,
      borderColor: "red",
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: "center",
      marginBottom: 20,
    },
    leaveText: {
      fontSize: 16,
      color: "red",
      fontWeight: "600",
    },
  });
}
