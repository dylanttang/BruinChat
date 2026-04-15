import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState, useMemo } from "react";
import MessageBubble from "../components/messageBubble";
import { useTheme, Colors } from "../context/ThemeContext";

export default function ChatScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [message, setMessage] = useState("");

  // mock data
  const messages = [
    { id: "1", user: "Alex", text: "Hey everyone!", time: "2:10 PM", mine: false },
    { id: "2", user: "Alex", text: "Are we meeting today?", time: "2:11 PM", mine: false },
    { id: "3", user: "Me", text: "Yep 👍", time: "2:12 PM", mine: true },
    { id: "4", user: "Me", text: "Library at 6?", time: "2:12 PM", mine: true },
  ];

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Group {id}</Text>
        <TouchableOpacity onPress={() => router.push(`/chat/${id}/info`)}>
          <Text style={styles.menuDot}>•••</Text>
        </TouchableOpacity>
      </View>

      {/* MESSAGES */}
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <MessageBubble item={item} />}
      />

      {/* INPUT BAR */}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.inputBar}>
          <TouchableOpacity style={styles.plusBtn}>
            <Text style={{ fontSize: 22, color: colors.text }}>＋</Text>
          </TouchableOpacity>
          <TextInput
            placeholder="Type a message..."
            placeholderTextColor={colors.mutedText}
            style={styles.input}
            value={message}
            onChangeText={setMessage}
          />
          <TouchableOpacity style={styles.sendBtn}>
            <Text style={{ fontSize: 18, color: colors.text }}>➤</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
      borderColor: colors.border,
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
    menuDot: {
      fontSize: 16,
      color: colors.subtext,
      letterSpacing: 2,
    },
    list: {
      padding: 12,
    },
    inputBar: {
      flexDirection: "row",
      alignItems: "center",
      padding: 10,
      borderTopWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    input: {
      flex: 1,
      backgroundColor: colors.inputBg,
      borderRadius: 22,
      paddingHorizontal: 16,
      height: 44,
      marginHorizontal: 8,
      color: colors.text,
    },
    plusBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.inputBg,
      alignItems: "center",
      justifyContent: "center",
    },
    sendBtn: {
      paddingHorizontal: 6,
    },
  });
}
