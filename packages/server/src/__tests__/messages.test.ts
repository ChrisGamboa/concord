import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApp, authHeader } from "./helpers";

vi.mock("../db.js", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    channel: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      aggregate: vi.fn(),
    },
    message: {
      findMany: vi.fn(),
    },
    serverMember: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    server: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

const { prisma } = await import("../db.js");
const mockPrisma = vi.mocked(prisma);

describe("Message Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/messages/channel/:channelId", () => {
    it("should return messages for a channel", async () => {
      const app = await buildApp();
      const token = app.jwt.sign({ userId: "user1" });

      mockPrisma.channel.findUnique.mockResolvedValue({
        id: "ch1",
        serverId: "srv1",
        name: "general",
        type: "TEXT",
        position: 0,
        createdAt: new Date(),
      } as any);

      mockPrisma.serverMember.findUnique.mockResolvedValue({
        userId: "user1",
        serverId: "srv1",
        nickname: null,
        joinedAt: new Date(),
      } as any);

      const now = new Date();
      mockPrisma.message.findMany.mockResolvedValue([
        {
          id: "msg1",
          channelId: "ch1",
          authorId: "user1",
          content: "Hello!",
          createdAt: now,
          editedAt: null,
          author: {
            id: "user1",
            username: "testuser",
            displayName: "Test User",
            avatarUrl: null,
          },
        },
      ] as any);

      const res = await app.inject({
        method: "GET",
        url: "/api/messages/channel/ch1",
        headers: authHeader(token),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.messages).toHaveLength(1);
      expect(body.messages[0].content).toBe("Hello!");
      expect(body.hasMore).toBe(false);
      await app.close();
    });

    it("should return 404 for non-existent channel", async () => {
      const app = await buildApp();
      const token = app.jwt.sign({ userId: "user1" });

      mockPrisma.channel.findUnique.mockResolvedValue(null);

      const res = await app.inject({
        method: "GET",
        url: "/api/messages/channel/nonexistent",
        headers: authHeader(token),
      });

      expect(res.statusCode).toBe(404);
      await app.close();
    });

    it("should return 403 if not a server member", async () => {
      const app = await buildApp();
      const token = app.jwt.sign({ userId: "user1" });

      mockPrisma.channel.findUnique.mockResolvedValue({
        id: "ch1",
        serverId: "srv1",
      } as any);
      mockPrisma.serverMember.findUnique.mockResolvedValue(null);

      const res = await app.inject({
        method: "GET",
        url: "/api/messages/channel/ch1",
        headers: authHeader(token),
      });

      expect(res.statusCode).toBe(403);
      await app.close();
    });

    it("should indicate hasMore when more messages exist", async () => {
      const app = await buildApp();
      const token = app.jwt.sign({ userId: "user1" });

      mockPrisma.channel.findUnique.mockResolvedValue({
        id: "ch1",
        serverId: "srv1",
      } as any);
      mockPrisma.serverMember.findUnique.mockResolvedValue({
        userId: "user1",
        serverId: "srv1",
      } as any);

      // Return 51 messages (limit is 50, so +1 indicates hasMore)
      const messages = Array.from({ length: 51 }, (_, i) => ({
        id: `msg${i}`,
        channelId: "ch1",
        authorId: "user1",
        content: `Message ${i}`,
        createdAt: new Date(Date.now() - i * 1000),
        editedAt: null,
        author: {
          id: "user1",
          username: "testuser",
          displayName: "Test",
          avatarUrl: null,
        },
      }));
      mockPrisma.message.findMany.mockResolvedValue(messages as any);

      const res = await app.inject({
        method: "GET",
        url: "/api/messages/channel/ch1",
        headers: authHeader(token),
      });

      const body = res.json();
      expect(body.messages).toHaveLength(50);
      expect(body.hasMore).toBe(true);
      await app.close();
    });
  });
});
