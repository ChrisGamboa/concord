import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApp, authHeader } from "./helpers";

vi.mock("../db.js", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    server: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    serverMember: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

const { prisma } = await import("../db.js");
const mockPrisma = vi.mocked(prisma);

describe("Server Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/servers", () => {
    it("should return servers the user is a member of", async () => {
      const app = await buildApp();
      const token = app.jwt.sign({ userId: "user1" });

      mockPrisma.serverMember.findMany.mockResolvedValue([
        {
          userId: "user1",
          serverId: "srv1",
          nickname: null,
          joinedAt: new Date(),
          server: {
            id: "srv1",
            name: "Test Server",
            iconUrl: null,
            ownerId: "user1",
            createdAt: new Date("2026-01-01"),
          },
        },
      ] as any);

      const res = await app.inject({
        method: "GET",
        url: "/api/servers",
        headers: authHeader(token),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.servers).toHaveLength(1);
      expect(body.servers[0].name).toBe("Test Server");
      await app.close();
    });

    it("should reject unauthenticated requests", async () => {
      const app = await buildApp();

      const res = await app.inject({
        method: "GET",
        url: "/api/servers",
      });

      expect(res.statusCode).toBe(401);
      await app.close();
    });
  });

  describe("POST /api/servers", () => {
    it("should create a server with default channels and roles", async () => {
      const app = await buildApp();
      const token = app.jwt.sign({ userId: "user1" });

      mockPrisma.server.create.mockResolvedValue({
        id: "srv2",
        name: "New Server",
        iconUrl: null,
        ownerId: "user1",
        createdAt: new Date("2026-01-01"),
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/servers",
        headers: authHeader(token),
        payload: { name: "New Server" },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().name).toBe("New Server");
      expect(mockPrisma.server.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: "New Server",
            ownerId: "user1",
          }),
        })
      );
      await app.close();
    });

    it("should reject empty server name", async () => {
      const app = await buildApp();
      const token = app.jwt.sign({ userId: "user1" });

      const res = await app.inject({
        method: "POST",
        url: "/api/servers",
        headers: authHeader(token),
        payload: { name: "" },
      });

      expect(res.statusCode).toBe(400);
      await app.close();
    });
  });

  describe("POST /api/servers/:serverId/join", () => {
    it("should allow joining an existing server", async () => {
      const app = await buildApp();
      const token = app.jwt.sign({ userId: "user2" });

      mockPrisma.server.findUnique.mockResolvedValue({
        id: "srv1",
        name: "Test",
        iconUrl: null,
        ownerId: "user1",
        createdAt: new Date(),
      });
      mockPrisma.serverMember.findUnique.mockResolvedValue(null);
      mockPrisma.serverMember.create.mockResolvedValue({
        userId: "user2",
        serverId: "srv1",
        nickname: null,
        joinedAt: new Date(),
      } as any);

      const res = await app.inject({
        method: "POST",
        url: "/api/servers/srv1/join",
        headers: authHeader(token),
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().joined).toBe(true);
      await app.close();
    });

    it("should reject joining a non-existent server", async () => {
      const app = await buildApp();
      const token = app.jwt.sign({ userId: "user1" });

      mockPrisma.server.findUnique.mockResolvedValue(null);

      const res = await app.inject({
        method: "POST",
        url: "/api/servers/nonexistent/join",
        headers: authHeader(token),
      });

      expect(res.statusCode).toBe(404);
      await app.close();
    });

    it("should reject if already a member", async () => {
      const app = await buildApp();
      const token = app.jwt.sign({ userId: "user1" });

      mockPrisma.server.findUnique.mockResolvedValue({
        id: "srv1",
        name: "Test",
        iconUrl: null,
        ownerId: "user1",
        createdAt: new Date(),
      });
      mockPrisma.serverMember.findUnique.mockResolvedValue({
        userId: "user1",
        serverId: "srv1",
        nickname: null,
        joinedAt: new Date(),
      } as any);

      const res = await app.inject({
        method: "POST",
        url: "/api/servers/srv1/join",
        headers: authHeader(token),
      });

      expect(res.statusCode).toBe(409);
      await app.close();
    });
  });
});
