import { describe, it, expect, beforeEach } from "vitest";
import type { ServerMessage } from "@concord/shared";
import {
  addConnection,
  removeConnection,
  subscribeToChannel,
  broadcastToChannel,
  broadcastToAll,
  sendToUser,
} from "../ws/connections.js";

// The Redis bus is never initialised in tests, so broadcasts exercise the local
// (single-instance) delivery path against fake sockets.

class FakeSocket {
  readyState = 1;
  sent: ServerMessage[] = [];
  send(raw: string) {
    this.sent.push(JSON.parse(raw));
  }
}

let sessions: string[] = [];
function connect(sessionId: string, userId: string) {
  const sock = new FakeSocket();
  addConnection(sessionId, sock as unknown as never, userId);
  sessions.push(sessionId);
  return sock;
}

const msg = (id: string): ServerMessage => ({ type: "error", message: id });

describe("connections local delivery", () => {
  beforeEach(() => {
    for (const s of sessions) removeConnection(s);
    sessions = [];
  });

  it("broadcastToChannel only reaches subscribed sockets", () => {
    const a = connect("s1", "u1");
    const b = connect("s2", "u2");
    subscribeToChannel("s1", "chan");
    broadcastToChannel("chan", msg("hi"));
    expect(a.sent).toHaveLength(1);
    expect(b.sent).toHaveLength(0);
  });

  it("broadcastToChannel honors excludeSessionId", () => {
    const a = connect("s1", "u1");
    const b = connect("s2", "u2");
    subscribeToChannel("s1", "chan");
    subscribeToChannel("s2", "chan");
    broadcastToChannel("chan", msg("hi"), "s1");
    expect(a.sent).toHaveLength(0);
    expect(b.sent).toHaveLength(1);
  });

  it("sendToUser reaches all of a user's sockets and no one else", () => {
    const a1 = connect("s1", "u1");
    const a2 = connect("s2", "u1");
    const other = connect("s3", "u2");
    sendToUser("u1", msg("hi"));
    expect(a1.sent).toHaveLength(1);
    expect(a2.sent).toHaveLength(1);
    expect(other.sent).toHaveLength(0);
  });

  it("broadcastToAll reaches everyone except the excluded session", () => {
    const a = connect("s1", "u1");
    const b = connect("s2", "u2");
    broadcastToAll(msg("hi"), "s2");
    expect(a.sent).toHaveLength(1);
    expect(b.sent).toHaveLength(0);
  });

  it("does not deliver to closed sockets", () => {
    const a = connect("s1", "u1");
    a.readyState = 3; // CLOSED
    subscribeToChannel("s1", "chan");
    broadcastToChannel("chan", msg("hi"));
    expect(a.sent).toHaveLength(0);
  });
});
