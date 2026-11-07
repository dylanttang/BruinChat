import { createContext, useContext, useMemo, useRef, type ReactNode } from "react";
import type { View } from "react-native";
import { chatMedia } from "../../lib/messageMedia";

type ChatMediaList = {
  // Every photo and video in the chat, oldest first.
  all: () => ReturnType<typeof chatMedia>;
  // The on-screen tile of each one that's in the list right now, by key, so
  // the viewer can grow out of and shrink back into it.
  tiles: Map<string, View>;
};

const Context = createContext<ChatMediaList | null>(null);

// Lets the viewer swipe through every photo and video in the chat, not just
// the ones in the message that was tapped.
export function ChatMediaProvider({ messages, children }: {
  // Newest first, like the chat list.
  messages: Parameters<typeof chatMedia>[0];
  children: ReactNode;
}) {
  const allRef = useRef<ReturnType<typeof chatMedia> | null>(null);
  const messagesRef = useRef(messages);
  if (messagesRef.current !== messages) {
    messagesRef.current = messages;
    allRef.current = null;
  }
  // Stays the same object, so a new message doesn't re-render every photo.
  // The list is only worked out when the viewer opens.
  const value = useMemo<ChatMediaList>(
    () => ({
      all: () => (allRef.current ??= chatMedia(messagesRef.current)),
      tiles: new Map(),
    }),
    []
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useChatMediaList() {
  return useContext(Context);
}
