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
import { useState } from "react";
import MessageBubble from "../components/messageBubble";

export default function ChatScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();

  const [message, setMessage] = useState("");

  // mock data
  const messages = [
    {
      id: "1",
      user: "Alex",
      text: "Hey everyone!",
      time: "2:10 PM",
      mine: false,
    },
    {
      id: "2",
      user: "Alex",
      text: "Are we meeting today?",
      time: "2:11 PM",
      mine: false,
    },
    {
      id: "3",
      user: "Me",
      text: "Yep 👍",
      time: "2:12 PM",
      mine: true,
    },
    {
      id: "4",
      user: "Me",
      text: "Library at 6?",
      time: "2:12 PM",
      mine: true,
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Group {id}</Text>

        <View style={styles.menuDot} />
      </View>

      {/* MESSAGES */}
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <MessageBubble item={item} />}
      />

      {/* INPUT BAR */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.inputBar}>
          {/* Plus button */}
          <TouchableOpacity style={styles.plusBtn}>
            <Text style={{ fontSize: 22 }}>＋</Text>
          </TouchableOpacity>

          {/* Text input */}
          <TextInput
            placeholder="Type a message..."
            style={styles.input}
            value={message}
            onChangeText={setMessage}
          />

          {/* Send */}
          <TouchableOpacity style={styles.sendBtn}>
            <Text style={{ fontSize: 18 }}>➤</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },

  /* HEADER */
  header: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderColor: "#eee",
  },

  back: {
    fontSize: 22,
  },

  title: {
    fontSize: 18,
    fontWeight: "600",
  },

  menuDot: {
    width: 24,
    height: 24,
    backgroundColor: "#ddd",
    borderRadius: 6,
  },

  /* LIST */
  list: {
    padding: 12,
  },

  /* INPUT BAR */
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderTopWidth: 1,
    borderColor: "#eee",
  },

  input: {
    flex: 1,
    backgroundColor: "#f2f2f2",
    borderRadius: 22,
    paddingHorizontal: 16,
    height: 44, 
    marginHorizontal: 8,
  },

  plusBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#eee",
    alignItems: "center",
    justifyContent: "center",
  },

  sendBtn: {
    paddingHorizontal: 6,
  },
});
