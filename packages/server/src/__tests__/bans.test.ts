import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApp, authHeader } from "./helpers";

vi.mock("../db.js", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    server: {
      findUnique: vi.fn(),
    },
    serverMember: {
      findUnique: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    serverBan: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    memberRole: {
      findMany: vi.fn(),
    },
    role: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn().mockResolvedValue([]),
  },
}));

const { prisma } = await import("../db.js");
const mockPrisma = vi.mocked(prisma);

const SERVER = {
  id: "srv1",
  name: "Test",
  iconUrl: null,
  ownerId: "owner1",
  createdAt: new Date(),
};

/** Make checkPermission resolve to "no roles, @everyone has no permissions". */
function grantNoPermissions() {
  mockPrisma.memberRole.findMany.mockResolvedValue([] as any);
  mockPrisma.role.findFirst.mockResolvedValue({ permissions: 0 } as any);
}

describe("Ban Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mockPrisma.$transaction as any).mockResolvedValue([]);
    mockPrisma.server.findUnique.mockResolvedValue(SERVER as any);
  });

  describe("POST /api/servers/:serverId/bans/:targetId", () => {
    it("allows the owner to ban a member and removes their membership", async () => {
      const app = await buildApp();
      const token = app.jwt.sign({ userId: "owner1" });

      const res = await app.inject({
        method: "POST",
        url: "/api/servers/srv1/bans/user2",
        headers: authHeader(token),
        payload: { reason: "spam" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().banned).toBe(true);
      expect(mockPrisma.serverBan.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ serverId: "srv1", userId: "user2", bannedBy: "owner1", reason: "spam" }),
        })
      );
      expect(mockPrisma.serverMember.deleteMany).toHaveBeenCalledWith({
        where: { serverId: "srv1", userId: "user2" },
      });
      await app.close();
    });

    it("rejects users without BAN_MEMBERS permission", async () => {
      const app = await buildApp();
      const token = app.jwt.sign({ userId: "user3" });
      grantNoPermissions();

      const res = await app.inject({
        method: "POST",
        url: "/api/servers/srv1/bans/user2",
        headers: authHeader(token),
      });

      expect(res.statusCode).toBe(403);
      expect(mockPrisma.serverBan.upsert).not.toHaveBeenCalled();
      await app.close();
    });

    it("rejects banning yourself", async () => {
      const app = await buildApp();
      const token = app.jwt.sign({ userId: "owner1" });

      const res = await app.inject({
        method: "POST",
        url: "/api/servers/srv1/bans/owner1",
        headers: authHeader(token),
      });

      expect(res.statusCode).toBe(400);
      await app.close();
    });

    it("rejects banning the server owner", async () => {
      const app = await buildApp();
      const token = app.jwt.sign({ userId: "admin1" });
      // admin1 has BAN_MEMBERS via a role (1 << 11)
      mockPrisma.memberRole.findMany.mockResolvedValue([
        { role: { permissions: 1 << 11 } },
      ] as any);
      mockPrisma.role.findFirst.mockResolvedValue({ permissions: 0 } as any);

      const res = await app.inject({
        method: "POST",
        url: "/api/servers/srv1/bans/owner1",
        headers: authHeader(token),
      });

      expect(res.statusCode).toBe(400);
      expect(mockPrisma.serverBan.upsert).not.toHaveBeenCalled();
      await app.close();
    });
  });

  describe("join while banned", () => {
    it("blocks a banned user from joining by server id", async () => {
      const app = await buildApp();
      const token = app.jwt.sign({ userId: "user2" });

      mockPrisma.serverMember.findUnique.mockResolvedValue(null);
      mockPrisma.serverBan.findUnique.mockResolvedValue({
        serverId: "srv1",
        userId: "user2",
        bannedBy: "owner1",
        reason: null,
        createdAt: new Date(),
      } as any);

      const res = await app.inject({
        method: "POST",
        url: "/api/servers/srv1/join",
        headers: authHeader(token),
      });

      expect(res.statusCode).toBe(403);
      expect(mockPrisma.serverMember.create).not.toHaveBeenCalled();
      await app.close();
    });
  });

  describe("GET /api/servers/:serverId/bans", () => {
    it("lists bans with resolved banner names", async () => {
      const app = await buildApp();
      const token = app.jwt.sign({ userId: "owner1" });

      mockPrisma.serverBan.findMany.mockResolvedValue([
        {
          serverId: "srv1",
          userId: "user2",
          bannedBy: "owner1",
          reason: "spam",
          createdAt: new Date("2026-06-01"),
          user: { id: "user2", username: "spammer", displayName: "Spammer", avatarUrl: null },
        },
      ] as any);
      mockPrisma.user.findMany.mockResolvedValue([
        { id: "owner1", displayName: "The Owner" },
      ] as any);

      const res = await app.inject({
        method: "GET",
        url: "/api/servers/srv1/bans",
        headers: authHeader(token),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.bans).toHaveLength(1);
      expect(body.bans[0].user.username).toBe("spammer");
      expect(body.bans[0].bannedByName).toBe("The Owner");
      expect(body.bans[0].reason).toBe("spam");
      await app.close();
    });

    it("rejects users without BAN_MEMBERS permission", async () => {
      const app = await buildApp();
      const token = app.jwt.sign({ userId: "user3" });
      grantNoPermissions();

      const res = await app.inject({
        method: "GET",
        url: "/api/servers/srv1/bans",
        headers: authHeader(token),
      });

      expect(res.statusCode).toBe(403);
      await app.close();
    });
  });

  describe("DELETE /api/servers/:serverId/bans/:targetId", () => {
    it("revokes a ban with permission", async () => {
      const app = await buildApp();
      const token = app.jwt.sign({ userId: "owner1" });

      const res = await app.inject({
        method: "DELETE",
        url: "/api/servers/srv1/bans/user2",
        headers: authHeader(token),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().unbanned).toBe(true);
      expect(mockPrisma.serverBan.deleteMany).toHaveBeenCalledWith({
        where: { serverId: "srv1", userId: "user2" },
      });
      await app.close();
    });
  });
});
