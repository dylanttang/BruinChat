import { useLocalSearchParams } from "expo-router";
import ConversationScreen from "../../../../components/conversation/ConversationScreen";

export default function ThreadScreen() {
  const { id, threadId } = useLocalSearchParams<{ id: string; threadId: string }>();
  return <ConversationScreen key={`${id}:${threadId}`} chatId={id} threadId={threadId} />;
}
