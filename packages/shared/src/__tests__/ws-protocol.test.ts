import { describe, it, expect } from "vitest";
import type { ClientMessage, ServerMessage } from "../ws";

describe("WebSocket Protocol Types", () => {
  it("should serialize client messages to valid JSON", () => {
    const messages: ClientMessage[] = [
      { type: "send_message", channelId: "ch1", content: "hello" },
      { type: "edit_message", messageId: "msg1", content: "edited" },
      { type: "delete_message", messageId: "msg1" },
      { type: "typing_start", channelId: "ch1" },
      { type: "subscribe_channel", channelId: "ch1" },
      { type: "unsubscribe_channel", channelId: "ch1" },
    ];

    for (const msg of messages) {
      const json = JSON.stringify(msg);
      const parsed = JSON.parse(json);
      expect(parsed.type).toBe(msg.type);
    }
  });

  it("should serialize server messages to valid JSON", () => {
    const messages: ServerMessage[] = [
      {
        type: "message_created",
        message: {
          id: "msg1",
          channelId: "ch1",
          authorId: "user1",
          content: "hello",
          createdAt: new Date().toISOString(),
          editedAt: null,
        },
      },
      {
        type: "message_deleted",
        channelId: "ch1",
        messageId: "msg1",
      },
      {
        type: "typing",
        channelId: "ch1",
        userId: "user1",
        username: "testuser",
      },
      {
        type: "presence_update",
        userId: "user1",
        status: "online",
      },
      {
        type: "error",
        message: "Something went wrong",
      },
      {
        type: "ready",
        userId: "user1",
        sessionId: "session1",
      },
    ];

    for (const msg of messages) {
      const json = JSON.stringify(msg);
      const parsed = JSON.parse(json);
      expect(parsed.type).toBe(msg.type);
    }
  });

  it("should round-trip message dates as ISO strings", () => {
    const now = new Date();
    const msg: ServerMessage = {
      type: "message_created",
      message: {
        id: "msg1",
        channelId: "ch1",
        authorId: "user1",
        content: "test",
        createdAt: now.toISOString(),
        editedAt: null,
      },
    };

    const parsed = JSON.parse(JSON.stringify(msg));
    expect(new Date(parsed.message.createdAt).getTime()).toBe(
      new Date(now.toISOString()).getTime()
    );
  });
});
