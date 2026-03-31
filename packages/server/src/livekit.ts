import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { env } from "./env.js";

export const roomService = new RoomServiceClient(
  env.LIVEKIT_URL.replace("ws://", "http://").replace("wss://", "https://"),
  env.LIVEKIT_API_KEY,
  env.LIVEKIT_API_SECRET
);

export async function createLiveKitToken(
  userId: string,
  username: string,
  roomName: string,
  options?: {
    canPublish?: boolean;
    canSubscribe?: boolean;
  }
): Promise<string> {
  const token = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
    identity: userId,
    name: username,
    ttl: "6h",
  });

  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: options?.canPublish ?? true,
    canSubscribe: options?.canSubscribe ?? true,
  });

  return token.toJwt();
}

/**
 * Voice channel rooms are named: "voice:<channelId>"
 */
export function voiceRoomName(channelId: string): string {
  return `voice:${channelId}`;
}
