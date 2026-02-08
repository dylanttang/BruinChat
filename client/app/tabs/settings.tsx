import { View, Text, StyleSheet, Switch, TouchableOpacity, ScrollView } from "react-native";
import { useState } from "react";

export default function Settings() {
  const [pause, setPause] = useState(false);
  const [classNotif, setClassNotif] = useState(true);
  const [replyNotif, setReplyNotif] = useState(true);

  const Row = ({ title, right }: any) => (
    <View style={styles.row}>
      <Text style={styles.rowText}>{title}</Text>
      {right}
    </View>
  );

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>Settings</Text>

      {/* Appearance */}
      <Text style={styles.section}>Appearance</Text>
      <View style={styles.card}>
        <Row title="System default" right={<Text>›</Text>} />
      </View>

      {/* Notifications */}
      <Text style={styles.section}>Notifications</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.rowText}>Pause notifications</Text>
          <Switch value={pause} onValueChange={setPause} />
        </View>

        <View style={styles.row}>
          <Text style={styles.rowText}>Class notifications</Text>
          <Switch value={classNotif} onValueChange={setClassNotif} />
        </View>

        <View style={styles.row}>
          <Text style={styles.rowText}>Reply notifications</Text>
          <Switch value={replyNotif} onValueChange={setReplyNotif} />
        </View>
      </View>

      {/* Report */}
      <Text style={styles.section}>Report</Text>
      <View style={styles.card}>
        <Row title="Report a user" right={<Text>›</Text>} />
        <Row title="Past reports" right={<Text>›</Text>} />
      </View>

      {/* Archive */}
      <Text style={styles.section}>Archive</Text>
      <View style={styles.card}>
        <Row title="View archived classes" right={<Text>›</Text>} />
      </View>

      <TouchableOpacity style={styles.signOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#fff",
  },

  header: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 10,
    marginTop: 60,
  },

  section: {
    marginTop: 20,
    marginBottom: 8,
    fontWeight: "600",
  },

  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#eee",
    overflow: "hidden",
  },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 13,
    borderBottomWidth: 1,
    borderColor: "#f2f2f2",
  },

  rowText: {
    fontSize: 16,
  },

  signOut: {
    marginTop: 30,
    borderWidth: 1,
    borderColor: "red",
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
  },

  signOutText: {
    color: "red",
    fontWeight: "600",
  },
});