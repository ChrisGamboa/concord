import type { ClientMessage, ServerMessage } from "@concord/shared";

type MessageHandler = (msg: ServerMessage) => void;

let socket: WebSocket | null = null;
let handlers: MessageHandler[] = [];
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

export function connectWs(token: string) {
  if (socket?.readyState === WebSocket.OPEN) return;

  socket = new WebSocket(`ws://localhost:3001/ws?token=${encodeURIComponent(token)}`);

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

export function sendWs(msg: ClientMessage) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(msg));
  }
}

export function onWsMessage(handler: MessageHandler): () => void {
  handlers.push(handler);
  return () => {
    handlers = handlers.filter((h) => h !== handler);
  };
}
