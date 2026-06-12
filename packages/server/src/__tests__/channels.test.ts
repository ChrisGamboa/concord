import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApp, authHeader } from "./helpers";

vi.mock("../db.js", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    server: { findUnique: vi.fn() },
    serverMember: { findUnique: vi.fn() },
    channel: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    lastRead: { findMany: vi.fn() },
    message: { count: vi.fn() },
    memberRole: { findMany: vi.fn() },
    role: { findFirst: vi.fn() },
    $transaction: vi.fn().mockResolvedValue([]),
  },
}));

const { prisma } = await import("../db.js");
const mockPrisma = vi.mocked(prisma);

describe("Channel Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mockPrisma.$transaction as any).mockResolvedValue([]);
  });

  describe("PATCH /api/channels/server/:serverId/reorder", () => {
    it("reorders channels for a user with MANAGE_CHANNELS", async () => {
      const app = await buildApp();
      const token = app.jwt.sign({ userId: "owner1" });

      // owner shortcut grants all permissions
      mockPrisma.server.findUnique.mockResolvedValue({ ownerId: "owner1" } as any);
      mockPrisma.channel.findMany.mockResolvedValue([
        { id: "a" }, { id: "b" }, { id: "c" },
      ] as any);

      const res = await app.inject({
        method: "PATCH",
        url: "/api/channels/server/srv1/reorder",
        headers: authHeader(token),
        payload: { channelIds: ["c", "a", "b"] },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().reordered).toBe(true);
      expect(mockPrisma.channel.update).toHaveBeenCalledWith({ where: { id: "c" }, data: { position: 0 } });
      expect(mockPrisma.channel.update).toHaveBeenCalledWith({ where: { id: "a" }, data: { position: 1 } });
      expect(mockPrisma.channel.update).toHaveBeenCalledWith({ where: { id: "b" }, data: { position: 2 } });
      await app.close();
    });

    it("rejects an incomplete channel id list", async () => {
      const app = await buildApp();
      const token = app.jwt.sign({ userId: "owner1" });

      mockPrisma.server.findUnique.mockResolvedValue({ ownerId: "owner1" } as any);
      mockPrisma.channel.findMany.mockResolvedValue([
        { id: "a" }, { id: "b" }, { id: "c" },
      ] as any);

      const res = await app.inject({
        method: "PATCH",
        url: "/api/channels/server/srv1/reorder",
        headers: authHeader(token),
        payload: { channelIds: ["a", "b"] },
      });

      expect(res.statusCode).toBe(400);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      await app.close();
    });

    it("rejects users without MANAGE_CHANNELS", async () => {
      const app = await buildApp();
      const token = app.jwt.sign({ userId: "user2" });

      mockPrisma.server.findUnique.mockResolvedValue({ ownerId: "owner1" } as any);
      mockPrisma.memberRole.findMany.mockResolvedValue([] as any);
      mockPrisma.role.findFirst.mockResolvedValue({ permissions: 0 } as any);

      const res = await app.inject({
        method: "PATCH",
        url: "/api/channels/server/srv1/reorder",
        headers: authHeader(token),
        payload: { channelIds: ["a"] },
      });

      expect(res.statusCode).toBe(403);
      await app.close();
    });
  });

  describe("GET /api/channels/server/:serverId/unread", () => {
    it("returns unread and mention counts per channel", async () => {
      const app = await buildApp();
      const token = app.jwt.sign({ userId: "user1" });

      mockPrisma.serverMember.findUnique.mockResolvedValue({ userId: "user1", serverId: "srv1" } as any);
      mockPrisma.channel.findMany.mockResolvedValue([{ id: "ch1" }] as any);
      mockPrisma.lastRead.findMany.mockResolvedValue([] as any);
      mockPrisma.user.findUnique.mockResolvedValue({ username: "testuser" } as any);
      // First count call = unread, second = mentions
      (mockPrisma.message.count as any)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(2);

      const res = await app.inject({
        method: "GET",
        url: "/api/channels/server/srv1/unread",
        headers: authHeader(token),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ unread: { ch1: 5 }, mentions: { ch1: 2 } });
      // Mention count must filter on the @username token
      expect(mockPrisma.message.count).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            content: { contains: "@testuser" },
          }),
        })
      );
      await app.close();
    });
  });
});
