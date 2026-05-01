import { View, Text, StyleSheet, FlatList, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { useTheme, Colors } from "../context/ThemeContext";

const archivedChats = [
  { id: "1", name: "Class group A", lastMessage: "last message sent" },
  { id: "2", name: "Class group A", lastMessage: "last message sent" },
  { id: "3", name: "Class group A", lastMessage: "last message sent" },
];

export default function ArchivedClasses() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Archived Classes</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Chat List */}
      <FlatList
        data={archivedChats}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.chatRow}>
            <View style={styles.avatar} />
            <View style={styles.chatText}>
              <Text style={styles.chatName}>{item.name}</Text>
              <Text style={styles.lastMessage}>{item.lastMessage}</Text>
            </View>
          </TouchableOpacity>
        )}
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
      fontSize: 22,
      color: colors.text,
    },
    title: {
      fontSize: 18,
      fontWeight: "600",
      color: colors.text,
    },
    list: {
      paddingTop: 8,
    },
    chatRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    avatar: {
      width: 48,
      height: 48,
      backgroundColor: colors.avatarBg,
      borderRadius: 8,
      marginRight: 12,
    },
    chatText: {
      flex: 1,
    },
    chatName: {
      fontSize: 16,
      fontWeight: "500",
      color: colors.text,
    },
    lastMessage: {
      fontSize: 14,
      color: colors.subtext,
      marginTop: 2,
    },
  });
}
