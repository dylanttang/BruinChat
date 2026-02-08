import { View, Text, StyleSheet, Image } from "react-native";

export default function MessageBubble({ item }) {
  const isMe = item.mine;

  return (
    <View
      style={[
        bubbleStyles.row,
        { justifyContent: isMe ? "flex-end" : "flex-start" },
      ]}
    >
      {/* avatar for others */}
      {!isMe && <View style={bubbleStyles.avatar} />}

      <View style={{ maxWidth: "75%" }}>
        {!isMe && (
          <Text style={bubbleStyles.username}>{item.user}</Text>
        )}

        <View
          style={[
            bubbleStyles.bubble,
            isMe ? bubbleStyles.myBubble : bubbleStyles.otherBubble,
          ]}
        >
          <Text
            style={{
              color: isMe ? "white" : "black",
              fontSize: 16,
            }}
          >
            {item.text}
          </Text>
        </View>

        <Text
          style={[
            bubbleStyles.time,
            { alignSelf: isMe ? "flex-end" : "flex-start" },
          ]}
        >
          {item.time}
        </Text>
      </View>
    </View>
  );
}

const bubbleStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginVertical: 6,
    paddingHorizontal: 8,
  },

  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#ccc",
    marginRight: 8,
  },

  username: {
    fontSize: 12,
    color: "#666",
    marginBottom: 2,
  },

  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },

  myBubble: {
    backgroundColor: "#007AFF",
    borderBottomRightRadius: 6, // speech tail look
  },

  otherBubble: {
    backgroundColor: "#E9E9EB",
    borderBottomLeftRadius: 6,
  },

  time: {
    fontSize: 10,
    color: "#999",
    marginTop: 2,
  },
});
