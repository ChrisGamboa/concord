import { describe, it, expect, beforeEach } from "vitest";
import { useChatStore, type ChatMessage } from "../chat";

const initialState = useChatStore.getState();

function msg(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "msg1",
    channelId: "ch1",
    authorId: "user1",
    content: "hello",
    createdAt: new Date("2026-06-01T12:00:00Z").toISOString(),
    editedAt: null,
    ...overrides,
  };
}

describe("chat store", () => {
  beforeEach(() => {
    useChatStore.setState(initialState, true);
    useChatStore.getState().setActiveChannel("ch1");
  });

  describe("optimistic send lifecycle", () => {
    it("appends a pending message and reconciles it by nonce", () => {
      const store = useChatStore.getState();
      store.addPendingMessage(msg({ id: "pending-n1", pending: true, nonce: "n1" }));

      expect(useChatStore.getState().messages).toHaveLength(1);
      expect(useChatStore.getState().messages[0].pending).toBe(true);

      // Server echo with the same nonce replaces the optimistic copy in place
      store.addMessage(msg({ id: "server-id-1" }), "n1");

      const messages = useChatStore.getState().messages;
      expect(messages).toHaveLength(1);
      expect(messages[0].id).toBe("server-id-1");
      expect(messages[0].pending).toBeUndefined();
    });

    it("appends echoes with unknown nonces as new messages", () => {
      const store = useChatStore.getState();
      store.addMessage(msg({ id: "a" }), "some-other-nonce");
      expect(useChatStore.getState().messages).toHaveLength(1);
    });

    it("dedupes messages by id", () => {
      const store = useChatStore.getState();
      store.addMessage(msg({ id: "a" }));
      store.addMessage(msg({ id: "a" }));
      expect(useChatStore.getState().messages).toHaveLength(1);
    });

    it("marks a pending message failed and back to pending on retry", () => {
      const store = useChatStore.getState();
      store.addPendingMessage(msg({ id: "pending-n1", pending: true, nonce: "n1" }));

      store.markMessageFailed("n1");
      expect(useChatStore.getState().messages[0]).toMatchObject({ pending: false, failed: true });

      store.markMessagePending("n1");
      expect(useChatStore.getState().messages[0]).toMatchObject({ pending: true, failed: false });
    });

    it("removes a discarded failed message by nonce", () => {
      const store = useChatStore.getState();
      store.addPendingMessage(msg({ id: "pending-n1", pending: true, nonce: "n1" }));
      store.markMessageFailed("n1");
      store.removeMessageByNonce("n1");
      expect(useChatStore.getState().messages).toHaveLength(0);
    });
  });

  describe("live append gating", () => {
    it("ignores messages for other channels", () => {
      useChatStore.getState().addMessage(msg({ channelId: "ch2" }));
      expect(useChatStore.getState().messages).toHaveLength(0);
    });

    it("ignores live appends while viewing history (isAtLatest=false)", () => {
      const store = useChatStore.getState();
      store.setMessages([msg({ id: "old" })], true, false);
      store.addMessage(msg({ id: "new" }));
      expect(useChatStore.getState().messages.map((m) => m.id)).toEqual(["old"]);
    });

    it("resumes appends after returning to the latest view", () => {
      const store = useChatStore.getState();
      store.setMessages([msg({ id: "old" })], false, false);
      store.setMessages([msg({ id: "latest" })], false); // isAtLatest defaults to true
      store.addMessage(msg({ id: "new" }));
      expect(useChatStore.getState().messages.map((m) => m.id)).toEqual(["latest", "new"]);
    });
  });

  describe("updateMessage", () => {
    it("merges updates so omitted fields like reactions survive", () => {
      const store = useChatStore.getState();
      store.addMessage(msg({ id: "a", reactions: [{ emoji: "👍", count: 2, userIds: ["u1", "u2"] }] }));

      store.updateMessage(msg({ id: "a", content: "edited", editedAt: new Date().toISOString() }));

      const updated = useChatStore.getState().messages[0];
      expect(updated.content).toBe("edited");
      expect(updated.reactions).toHaveLength(1);
    });
  });

  describe("unread and mention counts", () => {
    it("tracks unread and mention counts together", () => {
      const store = useChatStore.getState();
      store.setUnreadCount("ch2", 5, 2);
      expect(useChatStore.getState().unreadCounts.ch2).toBe(5);
      expect(useChatStore.getState().mentionCounts.ch2).toBe(2);
    });

    it("clears the mention count when unread drops to zero", () => {
      const store = useChatStore.getState();
      store.setUnreadCount("ch2", 5, 2);
      store.setUnreadCount("ch2", 0);
      expect(useChatStore.getState().unreadCounts.ch2).toBeUndefined();
      expect(useChatStore.getState().mentionCounts.ch2).toBeUndefined();
    });

    it("clears the mention count when mentions drop to zero but unread remains", () => {
      const store = useChatStore.getState();
      store.setUnreadCount("ch2", 5, 2);
      store.setUnreadCount("ch2", 7, 0);
      expect(useChatStore.getState().unreadCounts.ch2).toBe(7);
      expect(useChatStore.getState().mentionCounts.ch2).toBeUndefined();
    });
  });

  describe("mutes", () => {
    it("toggles channel and server mutes without duplicates", () => {
      const store = useChatStore.getState();
      store.setChannelMuted("ch1", true);
      store.setChannelMuted("ch1", true);
      expect(useChatStore.getState().mutedChannels).toEqual(["ch1"]);

      store.setChannelMuted("ch1", false);
      expect(useChatStore.getState().mutedChannels).toEqual([]);

      store.setServerMuted("srv1", true);
      expect(useChatStore.getState().mutedServers).toEqual(["srv1"]);
    });

    it("replaces mutes wholesale via setMutes", () => {
      const store = useChatStore.getState();
      store.setChannelMuted("stale", true);
      store.setMutes({ channels: ["ch1", "ch2"], servers: [] });
      expect(useChatStore.getState().mutedChannels).toEqual(["ch1", "ch2"]);
      expect(useChatStore.getState().mutedServers).toEqual([]);
    });
  });

  describe("pagination", () => {
    it("prepends older messages while keeping order", () => {
      const store = useChatStore.getState();
      store.setMessages([msg({ id: "newer" })], true);
      store.prependMessages([msg({ id: "older" })], false);
      expect(useChatStore.getState().messages.map((m) => m.id)).toEqual(["older", "newer"]);
      expect(useChatStore.getState().hasMoreMessages).toBe(false);
    });
  });
});
