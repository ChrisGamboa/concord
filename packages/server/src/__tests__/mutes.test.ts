import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApp, authHeader } from "./helpers";

vi.mock("../db.js", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    mute: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

const { prisma } = await import("../db.js");
const mockPrisma = vi.mocked(prisma);

describe("Mute Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the user's mutes split by target type", async () => {
    const app = await buildApp();
    const token = app.jwt.sign({ userId: "user1" });

    mockPrisma.mute.findMany.mockResolvedValue([
      { userId: "user1", targetId: "ch1", targetType: "channel", createdAt: new Date() },
      { userId: "user1", targetId: "srv1", targetType: "server", createdAt: new Date() },
    ] as any);

    const res = await app.inject({
      method: "GET",
      url: "/api/mutes",
      headers: authHeader(token),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ channels: ["ch1"], servers: ["srv1"] });
    await app.close();
  });

  it("mutes a channel via PUT", async () => {
    const app = await buildApp();
    const token = app.jwt.sign({ userId: "user1" });

    const res = await app.inject({
      method: "PUT",
      url: "/api/mutes/channel/ch1",
      headers: authHeader(token),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().muted).toBe(true);
    expect(mockPrisma.mute.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { userId: "user1", targetId: "ch1", targetType: "channel" },
      })
    );
    await app.close();
  });

  it("unmutes a server via DELETE", async () => {
    const app = await buildApp();
    const token = app.jwt.sign({ userId: "user1" });

    const res = await app.inject({
      method: "DELETE",
      url: "/api/mutes/server/srv1",
      headers: authHeader(token),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().muted).toBe(false);
    expect(mockPrisma.mute.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user1", targetId: "srv1" },
    });
    await app.close();
  });

  it("rejects unauthenticated requests", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/mutes" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
