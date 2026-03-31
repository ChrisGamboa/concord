import type { WebSocket } from "ws";
import type { ServerMessage } from "@concord/shared";

interface Connection {
  socket: WebSocket;
  userId: string;
  subscribedChannels: Set<string>;
}

const connections = new Map<string, Connection>();

export function addConnection(sessionId: string, socket: WebSocket, userId: string) {
  connections.set(sessionId, {
    socket,
    userId,
    subscribedChannels: new Set(),
  });
}

export function removeConnection(sessionId: string) {
  connections.delete(sessionId);
}

export function getConnection(sessionId: string) {
  return connections.get(sessionId);
}

export function subscribeToChannel(sessionId: string, channelId: string) {
  const conn = connections.get(sessionId);
  if (conn) conn.subscribedChannels.add(channelId);
}

export function unsubscribeFromChannel(sessionId: string, channelId: string) {
  const conn = connections.get(sessionId);
  if (conn) conn.subscribedChannels.delete(channelId);
}

export function broadcastToChannel(channelId: string, message: ServerMessage, excludeSessionId?: string) {
  for (const [sessionId, conn] of connections) {
    if (sessionId === excludeSessionId) continue;
    if (conn.subscribedChannels.has(channelId) && conn.socket.readyState === 1) {
      conn.socket.send(JSON.stringify(message));
    }
  }
}

export function sendToUser(userId: string, message: ServerMessage) {
  for (const conn of connections.values()) {
    if (conn.userId === userId && conn.socket.readyState === 1) {
      conn.socket.send(JSON.stringify(message));
    }
  }
}

export function getOnlineUserIds(): string[] {
  const userIds = new Set<string>();
  for (const conn of connections.values()) {
    userIds.add(conn.userId);
  }
  return Array.from(userIds);
}
