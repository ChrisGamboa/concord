import type { ClientMessage, ServerMessage } from "@concord/shared";
import { WS_URL } from "./config";
import { api } from "./api";

type MessageHandler = (msg: ServerMessage) => void;

let socket: WebSocket | null = null;
let handlers: MessageHandler[] = [];
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

export async function connectWs(token: string) {
  if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;

  // Prefer a short-lived ticket so the JWT never lands in the WS URL/logs; fall
  // back to the token query param if the ticket request fails.
  let url = `${WS_URL}/ws?token=${encodeURIComponent(token)}`;
  try {
    const { ticket } = await api.getWsTicket();
    url = `${WS_URL}/ws?ticket=${encodeURIComponent(ticket)}`;
  } catch {
    /* fall back to token in query */
  }

  socket = new WebSocket(url);

  socket.onopen = () => {
    console.log("[ws] connected");
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  socket.onmessage = (event) => {
    const msg: ServerMessage = JSON.parse(event.data);
    for (const handler of handlers) {
      handler(msg);
    }
  };

  socket.onclose = () => {
    console.log("[ws] disconnected, reconnecting...");
    reconnectTimer = setTimeout(() => connectWs(token), 3000);
  };

  socket.onerror = (err) => {
    console.error("[ws] error", err);
  };
}

export function disconnectWs() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  socket?.close();
  socket = null;
}

/** Send a message if the socket is open. Returns false when disconnected (message dropped). */
export function sendWs(msg: ClientMessage): boolean {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(msg));
    return true;
  }
  return false;
}

export function onWsMessage(handler: MessageHandler): () => void {
  handlers.push(handler);
  return () => {
    handlers = handlers.filter((h) => h !== handler);
  };
}
