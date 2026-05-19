import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../lib/api";
import { useTheme, Colors } from "../../context/ThemeContext";

type Member = {
  _id: string;
  displayName: string;
  avatarUrl: string;
};

type Course = {
  _id: string;
  subjectArea: string;
  number: string;
  title: string;
};

type Chat = {
  _id: string;
  name: string;
  members: Member[];
  course: Course | null;
};

export default function ChatInfo() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [chat, setChat] = useState<Chat | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(`/api/chats/${id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setChat(data?.chat ?? null))
      .catch((err) => console.error("Failed to load chat info:", err))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator color={colors.mutedText} />
      </SafeAreaView>
    );
  }

  if (!chat) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ color: colors.subtext }}>Chat not found.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{chat.name}</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Course Details (if this is a course chat) */}
        {chat.course && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Course</Text>
            <View style={styles.row}>
              <Text style={styles.label}>Subject</Text>
              <Text style={styles.value}>{chat.course.subjectArea}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Number</Text>
              <Text style={styles.value}>{chat.course.number}</Text>
            </View>
            <View style={[styles.row, { borderBottomWidth: 0 }]}>
              <Text style={styles.label}>Title</Text>
              <Text style={[styles.value, { flex: 1, textAlign: "right", marginLeft: 12 }]}>
                {chat.course.title}
              </Text>
            </View>
          </View>
        )}

        {/* Members */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            Members ({chat.members.length})
          </Text>
          {chat.members.map((member, index) => (
            <View
              key={member._id}
              style={[
                styles.memberRow,
                index === chat.members.length - 1 && { borderBottomWidth: 0 },
              ]}
            >
              <View style={styles.avatar} />
              <Text style={styles.memberName}>{member.displayName}</Text>
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
      flex: 1,
      textAlign: "center",
      paddingHorizontal: 12,
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
