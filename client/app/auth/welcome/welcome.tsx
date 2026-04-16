import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  FlatList,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { apiFetch, setDevUserId } from "../../lib/api";

type DevUser = {
  _id: string;
  displayName: string;
  username: string;
};

export default function Welcome() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);

  const [devPickerVisible, setDevPickerVisible] = useState(false);
  const [devUsers, setDevUsers] = useState<DevUser[] | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const openDevPicker = async () => {
    setDevPickerVisible(true);
    if (devUsers !== null) return;

    setLoadingUsers(true);
    try {
      const res = await apiFetch("/api/users/dev-list");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDevUsers(data.users);
    } catch (err) {
      console.error("Failed to load dev users:", err);
      setDevUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  };

  const pickUser = async (user: DevUser) => {
    await setDevUserId(user._id);
    setDevPickerVisible(false);

    // Skip course picker for returning users who've already enrolled in classes
    try {
      const res = await apiFetch("/api/users/me");
      const data = await res.json();
      if (res.ok && data.user?.courses?.length > 0) {
        router.replace("/tabs/home");
        return;
      }
    } catch (err) {
      console.error("Failed to check user courses:", err);
    }

    router.replace("/auth/questionnaire/step3");
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#fff", justifyContent: "center", paddingHorizontal: 32 }}>
      <Text style={{ fontSize: 26, fontWeight: "bold", textAlign: "center", marginBottom: 32, lineHeight: 34 }}>
        Sign in with your{"\n"}UCLA email
      </Text>

      <TextInput
        style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 25, paddingHorizontal: 20, paddingVertical: 14, fontSize: 16, marginBottom: 16 }}
        placeholder="Your UCLA email"
        placeholderTextColor="#999"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
      />

      <TextInput
        style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 25, paddingHorizontal: 20, paddingVertical: 14, fontSize: 16, marginBottom: 16 }}
        placeholder="Your UCLA Logon Password"
        placeholderTextColor="#999"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <TouchableOpacity
          style={{ flexDirection: "row", alignItems: "center" }}
          onPress={() => setRememberMe(!rememberMe)}
        >
          <View style={{ width: 18, height: 18, borderWidth: 1, borderColor: "#999", marginRight: 8, backgroundColor: rememberMe ? "#666" : "transparent" }} />
          <Text style={{ fontSize: 14, color: "#333" }}>Remember me</Text>
        </TouchableOpacity>

        <TouchableOpacity>
          <Text style={{ fontSize: 14, color: "#333" }}>Forgot Password?</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={{ backgroundColor: "#888", borderRadius: 25, paddingVertical: 14, alignItems: "center", alignSelf: "center", paddingHorizontal: 48 }}>
        <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>Sign In</Text>
      </TouchableOpacity>

      {/* TODO: Remove this once Google OAuth is working */}
      <TouchableOpacity
        style={{ marginTop: 24, alignSelf: "center" }}
        onPress={openDevPicker}
      >
        <Text style={{ fontSize: 14, color: "#aaa" }}>Skip (Dev)</Text>
      </TouchableOpacity>

      {/* Dev user picker */}
      <Modal
        transparent
        visible={devPickerVisible}
        animationType="fade"
        onRequestClose={() => setDevPickerVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 24 }}>
          <View style={{ backgroundColor: "#fff", borderRadius: 20, padding: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: "600", marginBottom: 4 }}>Pick a dev user</Text>
            <Text style={{ fontSize: 13, color: "#888", marginBottom: 16 }}>
              Temporary — for testing until Google OAuth is wired up.
            </Text>

            {loadingUsers ? (
              <ActivityIndicator size="small" color="#888" style={{ paddingVertical: 20 }} />
            ) : devUsers && devUsers.length > 0 ? (
              <FlatList
                data={devUsers}
                keyExtractor={(item) => item._id}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => pickUser(item)}
                    style={({ pressed }) => ({
                      paddingVertical: 12,
                      borderBottomWidth: 1,
                      borderBottomColor: "#eee",
                      backgroundColor: pressed ? "#f5f5f5" : "transparent",
                    })}
                  >
                    <Text style={{ fontSize: 16 }}>{item.displayName}</Text>
                    <Text style={{ fontSize: 12, color: "#888" }}>@{item.username}</Text>
                  </Pressable>
                )}
              />
            ) : (
              <Text style={{ color: "#888", paddingVertical: 12 }}>
                No users found. Run the seed script.
              </Text>
            )}

            <TouchableOpacity
              style={{ marginTop: 16, alignItems: "center", paddingVertical: 10 }}
              onPress={() => setDevPickerVisible(false)}
            >
              <Text style={{ color: "#333" }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
