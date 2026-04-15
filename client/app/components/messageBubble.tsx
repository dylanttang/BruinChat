import { View, Text, StyleSheet } from "react-native";
import { useMemo } from "react";
import { useTheme, Colors } from "../context/ThemeContext";

export default function MessageBubble({ item }) {
  const isMe = item.mine;
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={[styles.row, { justifyContent: isMe ? "flex-end" : "flex-start" }]}>
      {!isMe && <View style={styles.avatar} />}

      <View style={{ maxWidth: "75%" }}>
        {!isMe && <Text style={styles.username}>{item.user}</Text>}

        <View style={[styles.bubble, isMe ? styles.myBubble : styles.otherBubble]}>
          <Text style={{ color: isMe ? "white" : colors.text, fontSize: 16 }}>
            {item.text}
          </Text>
        </View>

        <Text style={[styles.time, { alignSelf: isMe ? "flex-end" : "flex-start" }]}>
          {item.time}
        </Text>
      </View>
    </View>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
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
      backgroundColor: colors.avatarBg,
      marginRight: 8,
    },
    username: {
      fontSize: 12,
      color: colors.subtext,
      marginBottom: 2,
    },
    bubble: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 18,
    },
    myBubble: {
      backgroundColor: "#007AFF",
      borderBottomRightRadius: 6,
    },
    otherBubble: {
      backgroundColor: colors.inputBg,
      borderBottomLeftRadius: 6,
    },
    time: {
      fontSize: 10,
      color: colors.mutedText,
      marginTop: 2,
    },
  });
}
