import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../../lib/api";
import UserProfileSheet, { ProfileUser } from "../../../components/UserProfileSheet";
import { useTheme, fonts, Colors } from "../../../context/ThemeContext";

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
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  const [profileUser, setProfileUser] = useState<ProfileUser | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch(`/api/chats/${id}`).then((res) => (res.ok ? res.json() : null)),
      apiFetch("/api/users/me").then((res) => (res.ok ? res.json() : null)),
    ])
      .then(([chatData, meData]) => {
        setChat(chatData?.chat ?? null);
        setCurrentUserId(meData?.user?._id ?? null);
        setBlockedIds(new Set((meData?.user?.blockedUsers ?? []).map(String)));
      })
      .catch((err) => console.error("Failed to load chat info:", err))
      .finally(() => setLoading(false));
  }, [id]);

  const handleBlockedChange = (userId: string, blocked: boolean) => {
    setBlockedIds((prev) => {
      const next = new Set(prev);
      if (blocked) next.add(userId);
      else next.delete(userId);
      return next;
    });
  };

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
          {chat.members.map((member, index) => {
            const isMe = member._id === currentUserId;
            return (
              <TouchableOpacity
                key={member._id}
                style={[
                  styles.memberRow,
                  index === chat.members.length - 1 && { borderBottomWidth: 0 },
                ]}
                onPress={() => setProfileUser(member)}
                disabled={isMe}
              >
                <Image source={member.avatarUrl ? { uri: member.avatarUrl } : undefined} style={styles.avatar} />
                <Text style={styles.memberName}>{member.displayName}{isMe ? " (you)" : ""}</Text>
                {blockedIds.has(member._id) && <Text style={styles.blockedTag}>Blocked</Text>}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Leave Button */}
        <TouchableOpacity style={styles.leaveButton}>
          <Text style={styles.leaveText}>Leave</Text>
        </TouchableOpacity>
      </ScrollView>

      <UserProfileSheet
        user={profileUser}
        isBlocked={!!profileUser && blockedIds.has(profileUser._id)}
        onClose={() => setProfileUser(null)}
        onBlockedChange={handleBlockedChange}
      />
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
      fontFamily: fonts.regular,
      fontSize: 22,
      color: colors.brand,
    },
    title: {
      fontSize: 18,
      fontFamily: fonts.medium,
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
      fontFamily: fonts.medium,
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
      fontFamily: fonts.medium,
      color: colors.text,
    },
    value: {
      fontFamily: fonts.regular,
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
      borderRadius: 18,
      marginRight: 12,
    },
    blockedTag: {
      fontFamily: fonts.medium,
      fontSize: 12,
      color: colors.danger,
    },
    memberName: {
      fontFamily: fonts.regular,
      fontSize: 14,
      color: colors.text,
      flex: 1,
    },
    leaveButton: {
      borderWidth: 1,
      borderColor: colors.danger,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: "center",
      marginBottom: 20,
    },
    leaveText: {
      fontSize: 16,
      color: colors.danger,
      fontFamily: fonts.medium,
    },
  });
}
