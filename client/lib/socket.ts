import { io, Socket } from "socket.io-client";
import { API_URL, getAuthToken, onSessionChanged } from "./api";

export async function createSocket(): Promise<Socket> {
  const socket = io(API_URL, {
    // Called on every connection/reconnection so a refreshed token is used.
    auth: (callback) => {
      getAuthToken().then((token) => callback({ token })).catch(() => callback({ token: null }));
    },
  });
  const unsubscribe = onSessionChanged(() => socket.disconnect());
  socket.on("disconnect", (reason) => {
    if (reason === "io client disconnect" || reason === "io server disconnect") unsubscribe();
  });
  return socket;
}
