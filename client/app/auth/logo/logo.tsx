import { useEffect } from "react";
import { Image, View, Text } from "react-native";
import { useRouter } from "expo-router";

export default function Logo() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace("/auth/welcome/welcome");
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "white" }}>
      <Text style={{ fontSize: 24, fontWeight: "bold", marginBottom: 16 }}>
        BruinChat
      </Text>
      <Image
        source={require("../../../src/assets/icon.png")}
        style={{ width: 120, height: 120 }}
        resizeMode="contain"
      />
    </View>
  );
}
