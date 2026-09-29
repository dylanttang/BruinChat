import { io, Socket } from "socket.io-client";
import { API_URL, getAuthToken } from "./api";

// The server rejects connections without a valid app token, and only lets a
// socket join chats the signed-in user is a member of.
export async function createSocket(): Promise<Socket> {
  const token = await getAuthToken();

  return io(API_URL, {
    auth: { token },
  });
}
