import {
  View,
  Text,
  StyleSheet,
  Image,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { apiFetch } from "../../lib/api";
import { uploadToCloudinary } from "../../lib/cloudinary";
import { useTheme, Colors } from "../../context/ThemeContext";

type Course = {
  _id: string;
  subjectArea: string;
  number: string;
  title: string;
};

type User = {
  _id: string;
  displayName: string;
  username: string;
  courses: Course[];
  avatarUrl?: string;
  year?: string;
  major?: string;
  goal?: string;
};

export default function Profile() {
  const router = useRouter();
  const tabBarHeight = useBottomTabBarHeight();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors, tabBarHeight), [colors, tabBarHeight]);

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [stats, setStats] = useState<{ courseCount: number; chatCount: number; messageCount: number } | null>(null);
  const [courseListHeight, setCourseListHeight] = useState(0);
  const [courseContentHeight, setCourseContentHeight] = useState(0);
  const [courseScrollY, setCourseScrollY] = useState(0);

  const courseScrollRange = Math.max(courseContentHeight - courseListHeight, 0);
  const clampedCourseScrollY = Math.max(0, Math.min(courseScrollY, courseScrollRange));
  const shouldShowCourseScrollbar = !!user?.courses?.length && courseListHeight > 0;
  const courseScrollbarThumbHeight =
    courseListHeight > 0 && courseContentHeight > courseListHeight
      ? Math.min(courseListHeight, Math.max(36, (courseListHeight * courseListHeight) / courseContentHeight))
      : Math.max(36, courseListHeight);
  const courseScrollbarThumbTop =
    courseScrollRange > 0
      ? (clampedCourseScrollY / courseScrollRange) *
        Math.max(courseListHeight - courseScrollbarThumbHeight, 0)
      : 0;

  const onCourseListLayout = (event: LayoutChangeEvent) => {
    setCourseListHeight(event.nativeEvent.layout.height);
  };

  const onCourseListScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setCourseScrollY(event.nativeEvent.contentOffset.y);
  };

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      Promise.all([
        apiFetch("/api/users/me").then((res) => (res.ok ? res.json() : null)),
        apiFetch("/api/users/me/stats").then((res) => (res.ok ? res.json() : null)),
      ])
        .then(([userData, statsData]) => {
          setUser(userData?.user ?? null);
          setStats(statsData ?? null);
        })
        .catch((err) => console.error("Failed to load user:", err))
        .finally(() => setLoading(false));
    }, [])
  );

  const pickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission required", "Please allow photo access to change your avatar.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled) return;

    const uri = result.assets[0].uri;
    setUploadingAvatar(true);
    try {
      const avatarUrl = await uploadToCloudinary(uri, "avatars");
      const res = await apiFetch("/api/users/me/avatar", {
        method: "PUT",
        body: JSON.stringify({ avatarUrl }),
      });
      if (!res.ok) throw new Error("Failed to save avatar");
      setUser((prev) => (prev ? { ...prev, avatarUrl } : prev));
    } catch (err: any) {
      Alert.alert("Upload failed", err.message ?? "Could not update avatar. Try again.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const avatarSource = user?.avatarUrl ?? null;

  return (
    <SafeAreaView style={styles.container}>
      {/* Avatar */}
      <View style={styles.avatarWrapper}>
        {uploadingAvatar ? (
          <View style={[styles.avatar, { alignItems: "center", justifyContent: "center", backgroundColor: colors.inputBg }]}>
            <ActivityIndicator color={colors.mutedText} />
          </View>
        ) : (
          <Image
            source={avatarSource ? { uri: avatarSource } : undefined}
            style={styles.avatar}
          />
        )}
        <TouchableOpacity style={styles.editAvatar} onPress={pickAvatar} disabled={uploadingAvatar}>
          <Ionicons name="pencil" size={16} color="white" />
        </TouchableOpacity>
      </View>

      {/* Name */}
      <Text style={styles.name}>
        {loading ? " " : user?.displayName ?? "Unknown User"}
      </Text>

      {/* Profile info */}
      {!loading && (user?.year || user?.major) && (
        <View style={styles.profileInfo}>
          {user.year && user.major ? (
            <Text style={styles.profileInfoText}>{user.year} · {user.major}</Text>
          ) : user.year ? (
            <Text style={styles.profileInfoText}>{user.year}</Text>
          ) : (
            <Text style={styles.profileInfoText}>{user.major}</Text>
          )}
        </View>
      )}

      {/* Stats */}
      {!loading && stats && (
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.courseCount}</Text>
            <Text style={styles.statLabel}>Courses</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.chatCount}</Text>
            <Text style={styles.statLabel}>Chats</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.messageCount}</Text>
            <Text style={styles.statLabel}>Messages</Text>
          </View>
        </View>
      )}

      {/* Courses Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>My Courses</Text>

        {loading ? (
          <ActivityIndicator size="small" color={colors.mutedText} style={{ paddingVertical: 16 }} />
        ) : !user?.courses || user.courses.length === 0 ? (
          <Text style={{ color: colors.subtext, paddingVertical: 16 }}>
            No courses yet. Tap "Edit Courses" below to add some.
          </Text>
        ) : (
          <View style={styles.courseListWrapper} onLayout={onCourseListLayout}>
            <FlatList
              style={styles.courseList}
              contentContainerStyle={styles.scrollableCourseContent}
              showsVerticalScrollIndicator
              persistentScrollbar
              bounces={false}
              overScrollMode="never"
              onContentSizeChange={(_, height) => setCourseContentHeight(height)}
              onScroll={onCourseListScroll}
              scrollEventThrottle={16}
              data={user.courses}
              keyExtractor={(item) => item._id}
              renderItem={({ item }) => (
                <View style={styles.courseRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.courseTitle}>
                      {item.subjectArea} {item.number}
                    </Text>
                    <Text style={styles.courseSubtitle}>{item.title}</Text>
                  </View>
                </View>
              )}
            />
            {shouldShowCourseScrollbar && (
              <>
                <View pointerEvents="none" style={styles.scrollIndicatorTrack} />
                <View
                  pointerEvents="none"
                  style={[
                    styles.scrollIndicatorThumb,
                    {
                      height: courseScrollbarThumbHeight,
                      transform: [{ translateY: courseScrollbarThumbTop }],
                    },
                  ]}
                />
              </>
            )}
          </View>
        )}
      </View>

      <TouchableOpacity
        style={styles.editButton}
        onPress={() => router.push("/auth/questionnaire/step3")}
      >
        <Text style={styles.editText}>Edit Courses</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

function makeStyles(colors: Colors, tabBarHeight: number) {
  return StyleSheet.create({
    container: {
      flex: 1,
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: tabBarHeight + 20,
      backgroundColor: colors.background,
    },
    settingsIcon: {
      position: "absolute",
      top: 50,
      right: 20,
      padding: 8,
    },
    avatarWrapper: {
      alignSelf: "center",
      marginTop: 4,
    },
    avatar: {
      width: 112,
      height: 112,
      borderRadius: 56,
      backgroundColor: colors.avatarBg,
    },
    editAvatar: {
      position: "absolute",
      bottom: 8,
      right: 8,
      backgroundColor: "#333",
      padding: 6,
      borderRadius: 20,
    },
    name: {
      fontSize: 23,
      fontWeight: "600",
      textAlign: "center",
      marginVertical: 6,
      color: colors.text,
    },
    profileInfo: {
      alignItems: "center",
      marginBottom: 12,
    },
    profileInfoText: {
      fontSize: 14,
      color: colors.subtext,
      fontWeight: "500",
    },
    profileGoalText: {
      fontSize: 13,
      color: colors.mutedText,
      marginTop: 2,
    },
    card: {
      flex: 1,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      backgroundColor: colors.card,
    },
    courseListWrapper: {
      flex: 1,
      position: "relative",
    },
    courseList: {
      flex: 1,
    },
    scrollableCourseContent: {
      paddingRight: 14,
    },
    scrollIndicatorTrack: {
      position: "absolute",
      top: 0,
      right: 2,
      bottom: 0,
      width: 5,
      borderRadius: 3,
      backgroundColor: colors.mutedText,
      opacity: 0.35,
    },
    scrollIndicatorThumb: {
      position: "absolute",
      top: 0,
      right: 2,
      width: 5,
      height: 42,
      borderRadius: 3,
      backgroundColor: colors.mutedText,
    },
    cardTitle: {
      fontWeight: "600",
      fontSize: 18,
      marginBottom: 10,
      color: colors.text,
    },
    courseRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 15,
      borderBottomWidth: 1,
      borderColor: colors.separator,
    },
    courseTitle: {
      fontWeight: "500",
      paddingVertical: 5,
      color: colors.text,
    },
    courseSubtitle: {
      color: colors.subtext,
    },
    editButton: {
      marginTop: 10,
      alignSelf: "center",
      backgroundColor: colors.inputBg,
      paddingHorizontal: 30,
      paddingVertical: 12,
      borderRadius: 20,
    },
    editText: {
      fontWeight: "500",
      color: colors.text,
    },
    statsRow: {
      flexDirection: "row",
      gap: 10,
      marginBottom: 12,
    },
    statCard: {
      flex: 1,
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 12,
      alignItems: "center",
    },
    statValue: {
      fontSize: 20,
      fontWeight: "700",
      color: colors.text,
    },
    statLabel: {
      fontSize: 12,
      color: colors.mutedText,
      marginTop: 2,
    },
  });
}
