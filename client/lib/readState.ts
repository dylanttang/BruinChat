import AsyncStorage from "@react-native-async-storage/async-storage";

// Which chats have messages the user hasn't seen yet, kept on this phone.
// For each chat we store the time of the newest message the user has had on
// screen (server time), and a chat is unread when someone else has posted
// since. Chats never opened on this phone count as read up to when tracking
// started here, so existing chats don't all light up after an update.

const STORAGE_KEY = "chatReadState";

type ReadState = { trackingSince: string; seen: Record<string, string> };

let state: ReadState | null = null;
let loading: Promise<ReadState> | null = null;

export function loadReadState(): Promise<ReadState> {
  if (state) return Promise.resolve(state);
  if (!loading) {
    loading = AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => (raw ? JSON.parse(raw) : null))
      .catch(() => null)
      .then((saved: ReadState | null) => {
        state = saved?.trackingSince ? saved : { trackingSince: new Date().toISOString(), seen: {} };
        if (!saved) persist();
        return state;
      })
      .finally(() => { loading = null; });
  }
  return loading;
}

function persist() {
  if (state) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
}

export async function markChatSeen(chatId: string, newestMessageAt: string) {
  const current = await loadReadState();
  const previous = current.seen[chatId];
  if (previous && new Date(previous) >= new Date(newestMessageAt)) return;
  current.seen = { ...current.seen, [chatId]: newestMessageAt };
  persist();
}

export async function clearReadState() {
  state = null;
  await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
}

type ChatSummary = {
  _id: string;
  lastMessageAt?: string | null;
  lastMessageCreatedAt?: string | null;
  lastMessageSenderId?: string | null;
};

export function isChatUnread(chat: ChatSummary, readState: ReadState | null, currentUserId: string | null) {
  if (!readState) return false;
  // Older servers only send lastMessageAt. Newer ones send null here when
  // every message is from a blocked user.
  const latest = "lastMessageCreatedAt" in chat ? chat.lastMessageCreatedAt : chat.lastMessageAt;
  if (!latest) return false;
  if (currentUserId && chat.lastMessageSenderId === currentUserId) return false;
  const seen = readState.seen[chat._id] ?? readState.trackingSince;
  return new Date(latest) > new Date(seen);
}

// Newest message the user can see, ignoring ones still sending (those carry
// the phone's clock, not the server's).
export function newestMessageAt(messages: { createdAt?: string; pending?: boolean }[]) {
  let newest: string | null = null;
  for (const message of messages) {
    if (message.pending || !message.createdAt) continue;
    if (!newest || new Date(message.createdAt) > new Date(newest)) newest = message.createdAt;
  }
  return newest;
}
