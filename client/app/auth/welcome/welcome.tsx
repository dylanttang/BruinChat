import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity } from "react-native";

export default function Welcome() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);

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
    </View>
  );
}
