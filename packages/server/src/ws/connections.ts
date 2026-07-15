import type { WebSocket } from "ws";
import type { ServerMessage } from "@concord/shared";
import { INSTANCE_ID, initBus, publishEnvelope } from "./bus.js";

interface Connection {
  socket: WebSocket;
  userId: string;
  subscribedChannels: Set<string>;
}

// Local socket registry for THIS instance only. Cross-instance fan-out happens
// over the Redis bus (see broadcast* below).
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

// ---- Local delivery (to sockets held by this instance) ----

function deliverToChannel(channelId: string, message: ServerMessage, excludeSessionId?: string) {
  const raw = JSON.stringify(message);
  for (const [sessionId, conn] of connections) {
    if (sessionId === excludeSessionId) continue;
    if (conn.subscribedChannels.has(channelId) && conn.socket.readyState === 1) {
      conn.socket.send(raw);
    }
  }
}

function deliverToAll(message: ServerMessage, excludeSessionId?: string) {
  const raw = JSON.stringify(message);
  for (const [sessionId, conn] of connections) {
    if (sessionId === excludeSessionId) continue;
    if (conn.socket.readyState === 1) conn.socket.send(raw);
  }
}

function deliverToUser(userId: string, message: ServerMessage) {
  const raw = JSON.stringify(message);
  for (const conn of connections.values()) {
    if (conn.userId === userId && conn.socket.readyState === 1) {
      conn.socket.send(raw);
    }
  }
}

// ---- Cross-instance envelopes ----
// An excluded session only ever lives on the originating instance (which delivers
// locally before publishing), so peers never hold it and the exclude is dropped
// from the wire envelope.
type Envelope =
  | { o: string; k: "channel"; channelId: string; message: ServerMessage }
  | { o: string; k: "all"; message: ServerMessage }
  | { o: string; k: "user"; userId: string; message: ServerMessage };

function handleEnvelope(raw: string) {
  let env: Envelope;
  try {
    env = JSON.parse(raw);
  } catch {
    return;
  }
  if (env.o === INSTANCE_ID) return; // already delivered locally on this instance
  switch (env.k) {
    case "channel": deliverToChannel(env.channelId, env.message); break;
    case "all": deliverToAll(env.message); break;
    case "user": deliverToUser(env.userId, env.message); break;
  }
}

/** Wire up the Redis bus. Safe to call once at startup; no-op'd delivery if Redis is down. */
export async function initConnections(): Promise<void> {
  await initBus(handleEnvelope);
}

// ---- Public broadcast API: deliver locally now, fan out to peers via the bus ----

export function broadcastToChannel(channelId: string, message: ServerMessage, excludeSessionId?: string) {
  deliverToChannel(channelId, message, excludeSessionId);
  publishEnvelope({ o: INSTANCE_ID, k: "channel", channelId, message });
}

export function broadcastToAll(message: ServerMessage, excludeSessionId?: string) {
  deliverToAll(message, excludeSessionId);
  publishEnvelope({ o: INSTANCE_ID, k: "all", message });
}

export function sendToUser(userId: string, message: ServerMessage) {
  deliverToUser(userId, message);
  publishEnvelope({ o: INSTANCE_ID, k: "user", userId, message });
}
