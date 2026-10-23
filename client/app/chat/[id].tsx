import { useLocalSearchParams } from "expo-router";
import ConversationScreen from "../../components/conversation/ConversationScreen";

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ConversationScreen key={id} chatId={id} />;
}
