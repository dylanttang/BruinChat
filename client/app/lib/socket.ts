import { io, Socket } from "socket.io-client";
import { API_URL, getDevUserId } from "./api";

export async function createSocket(): Promise<Socket> {
  const userId = await getDevUserId();

  return io(API_URL, {
    auth: { userId },
  });
}
