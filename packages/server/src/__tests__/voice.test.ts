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
    },
    serverMember: {
      findUnique: vi.fn(),
    },
    server: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("../livekit.js", () => ({
  createLiveKitToken: vi.fn().mockResolvedValue("mock-livekit-token"),
  voiceRoomName: vi.fn((id: string) => `voice:${id}`),
  roomService: {
    listParticipants: vi.fn().mockResolvedValue([]),
  },
}));

const { prisma } = await import("../db.js");
const { createLiveKitToken, roomService } = await import("../livekit.js");
const mockPrisma = vi.mocked(prisma);
const mockCreateToken = vi.mocked(createLiveKitToken);
const mockRoomService = vi.mocked(roomService);

// Need to register voice routes in the test app
import type { FastifyPluginAsync } from "fastify";
import { voiceRoutes } from "../routes/voice.js";

async function buildAppWithVoice() {
  const app = await buildApp();
  await app.register(voiceRoutes, { prefix: "/api/voice" });
  return app;
}

describe("Voice Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/voice/:channelId/join", () => {
    it("should return LiveKit token for a voice channel", async () => {
      const app = await buildAppWithVoice();
      const token = app.jwt.sign({ userId: "user1" });

      mockPrisma.channel.findUnique.mockResolvedValue({
        id: "ch1",
        serverId: "srv1",
        name: "General",
        type: "VOICE",
        position: 1,
        createdAt: new Date(),
        server: { id: "srv1", name: "Test", iconUrl: null, ownerId: "user1", createdAt: new Date() },
      } as any);

      mockPrisma.serverMember.findUnique.mockResolvedValue({
        userId: "user1",
        serverId: "srv1",
        nickname: null,
        joinedAt: new Date(),
      } as any);

      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user1",
        username: "testuser",
        displayName: "Test User",
        passwordHash: "hashed",
        avatarUrl: null,
        createdAt: new Date(),
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/voice/ch1/join",
        headers: authHeader(token),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.token).toBe("mock-livekit-token");
      expect(body.roomName).toBe("voice:ch1");
      expect(body.url).toBeDefined();
      expect(mockCreateToken).toHaveBeenCalledWith(
        "user1",
        "Test User",
        "voice:ch1"
      );
      await app.close();
    });

    it("should reject non-voice channels", async () => {
      const app = await buildAppWithVoice();
      const token = app.jwt.sign({ userId: "user1" });

      mockPrisma.channel.findUnique.mockResolvedValue({
        id: "ch1",
        serverId: "srv1",
        name: "general",
        type: "TEXT",
        position: 0,
        createdAt: new Date(),
      } as any);

      const res = await app.inject({
        method: "POST",
        url: "/api/voice/ch1/join",
        headers: authHeader(token),
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("Not a voice channel");
      await app.close();
    });

    it("should reject non-existent channels", async () => {
      const app = await buildAppWithVoice();
      const token = app.jwt.sign({ userId: "user1" });

      mockPrisma.channel.findUnique.mockResolvedValue(null);

      const res = await app.inject({
        method: "POST",
        url: "/api/voice/nonexistent/join",
        headers: authHeader(token),
      });

      expect(res.statusCode).toBe(404);
      await app.close();
    });

    it("should reject non-members", async () => {
      const app = await buildAppWithVoice();
      const token = app.jwt.sign({ userId: "user2" });

      mockPrisma.channel.findUnique.mockResolvedValue({
        id: "ch1",
        serverId: "srv1",
        name: "General",
        type: "VOICE",
        position: 1,
        createdAt: new Date(),
        server: { id: "srv1" },
      } as any);

      mockPrisma.serverMember.findUnique.mockResolvedValue(null);

      const res = await app.inject({
        method: "POST",
        url: "/api/voice/ch1/join",
        headers: authHeader(token),
      });

      expect(res.statusCode).toBe(403);
      await app.close();
    });

    it("should reject unauthenticated requests", async () => {
      const app = await buildAppWithVoice();

      const res = await app.inject({
        method: "POST",
        url: "/api/voice/ch1/join",
      });

      expect(res.statusCode).toBe(401);
      await app.close();
    });
  });

  describe("GET /api/voice/:channelId/participants", () => {
    it("should return empty array when no one is in the room", async () => {
      const app = await buildAppWithVoice();
      const token = app.jwt.sign({ userId: "user1" });

      mockPrisma.channel.findUnique.mockResolvedValue({
        id: "ch1",
        serverId: "srv1",
        type: "VOICE",
      } as any);

      mockPrisma.serverMember.findUnique.mockResolvedValue({
        userId: "user1",
        serverId: "srv1",
      } as any);

      mockRoomService.listParticipants.mockRejectedValue(
        new Error("room not found")
      );

      const res = await app.inject({
        method: "GET",
        url: "/api/voice/ch1/participants",
        headers: authHeader(token),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().participants).toEqual([]);
      await app.close();
    });

    it("should return participants when room exists", async () => {
      const app = await buildAppWithVoice();
      const token = app.jwt.sign({ userId: "user1" });

      mockPrisma.channel.findUnique.mockResolvedValue({
        id: "ch1",
        serverId: "srv1",
        type: "VOICE",
      } as any);

      mockPrisma.serverMember.findUnique.mockResolvedValue({
        userId: "user1",
        serverId: "srv1",
      } as any);

      mockRoomService.listParticipants.mockResolvedValue([
        {
          identity: "user1",
          name: "Test User",
          joinedAt: BigInt(1700000000),
          tracks: [],
        },
      ] as any);

      const res = await app.inject({
        method: "GET",
        url: "/api/voice/ch1/participants",
        headers: authHeader(token),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.participants).toHaveLength(1);
      expect(body.participants[0].userId).toBe("user1");
      expect(body.participants[0].name).toBe("Test User");
      await app.close();
    });
  });
});
