import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useMemo } from "react";
import { useTheme, Colors } from "../context/ThemeContext";

type Props = {
  item: {
    id: string;
    user: string;
    text: string;
    time: string;
    mine: boolean;
    replyTo?: { _id: string; text: string; senderId: { displayName: string } } | null;
  };
  onLongPress?: () => void;
};

export default function MessageBubble({ item, onLongPress }: Props) {
  const isMe = item.mine;
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onLongPress={onLongPress}
      style={[styles.row, { justifyContent: isMe ? "flex-end" : "flex-start" }]}
    >
      {!isMe && <View style={styles.avatar} />}

      <View style={{ maxWidth: "75%" }}>
        {!isMe && <Text style={styles.username}>{item.user}</Text>}

        <View style={[styles.bubble, isMe ? styles.myBubble : styles.otherBubble]}>
          {item.replyTo && (
            <View style={[styles.replyPreview, isMe ? styles.replyPreviewMe : styles.replyPreviewOther]}>
              <Text style={styles.replyName}>{item.replyTo.senderId.displayName}</Text>
              <Text style={styles.replyText} numberOfLines={1}>{item.replyTo.text}</Text>
            </View>
          )}
          <Text style={{ color: isMe ? "white" : colors.text, fontSize: 16 }}>
            {item.text}
          </Text>
        </View>

        <Text style={[styles.time, { alignSelf: isMe ? "flex-end" : "flex-start" }]}>
          {item.time}
        </Text>
      </View>
    </TouchableOpacity>
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
    replyPreview: {
      borderRadius: 8,
      padding: 6,
      marginBottom: 6,
    },
    replyPreviewMe: {
      backgroundColor: "rgba(255,255,255,0.2)",
    },
    replyPreviewOther: {
      backgroundColor: colors.border,
    },
    replyName: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.mutedText,
      marginBottom: 1,
    },
    replyText: {
      fontSize: 12,
      color: colors.subtext,
    },
    time: {
      fontSize: 10,
      color: colors.mutedText,
      marginTop: 2,
    },
  });
}
