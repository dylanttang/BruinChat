import { View, Text, Button } from "react-native";
import { useRouter } from "expo-router";

export default function AuthIndex() {
  const router = useRouter();

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text>Auth Page</Text>

      <Button
        title="Log In"
        onPress={() => router.replace("/auth/questionnaire/step3")}
      />
    </View>
  );
}
