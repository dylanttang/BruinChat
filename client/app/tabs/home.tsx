import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

const chats = [
  {
    id: "1",
    name: "Group Chat Name",
    lastMessage: "Last message sent...",
    time: "2:41 PM",
  },
  {
    id: "2",
    name: "Group Chat Name",
    lastMessage: "Last message sent...",
    time: "1:18 PM",
  },
  {
    id: "3",
    name: "Group Chat Name",
    lastMessage: "Last message sent...",
    time: "Yesterday",
  },
];

export default function Home() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.iconPlaceholder} />
        <Text style={styles.title}>BruinChat</Text>
        <View style={styles.iconPlaceholder} />
      </View>

      {/* Chat List */}
      <FlatList
        data={chats}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
              style={styles.chatRow}
              onPress={() => router.push(`/chat/${item.id}`)}
          >
            <View style={styles.avatar} />

            <View style={styles.chatText}>
              <Text style={styles.chatName}>{item.name}</Text>
              <Text style={styles.lastMessage}>
                {item.lastMessage}
              </Text>
            </View>

            <Text style={styles.time}>{item.time}</Text>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },

  header: {
    height: 90,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
  },

  title: {
    fontSize: 20,
    fontWeight: "600",
  },

  iconPlaceholder: {
    width: 32,
    height: 32,
    backgroundColor: "#ddd",
    borderRadius: 4,
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
    borderBottomColor: "#eee",
  },

  avatar: {
    width: 48,
    height: 48,
    backgroundColor: "#ccc",
    borderRadius: 8,
    marginRight: 12,
  },

  chatText: {
    flex: 1,
  },

  chatName: {
    fontSize: 16,
    fontWeight: "500",
  },

  lastMessage: {
    fontSize: 14,
    color: "#666",
    marginTop: 2,
  },

  time: {
    fontSize: 12,
    color: "#999",
  },
});