import { apiFetch } from "./api";

export async function startDirectMessage(recipient: { recipientId: string } | { username: string }): Promise<string> {
  const response = await apiFetch("/api/chats/direct", { method: "POST", body: JSON.stringify(recipient) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not start direct message");
  return data.chat._id;
}

export function conversationTitle(chat: { name: string; isGroup?: boolean; members: { _id: string; displayName: string }[] }, userId: string | null): string {
  return chat.isGroup === false
    ? (userId ? chat.members.find(member => member._id !== userId)?.displayName : null) || "Direct message"
    : chat.name;
}
