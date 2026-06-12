import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApp, authHeader } from "./helpers";

vi.mock("../db.js", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    server: { findUnique: vi.fn() },
    serverMember: { findUnique: vi.fn() },
    channel: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    message: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    memberRole: { findMany: vi.fn() },
    role: { findFirst: vi.fn() },
  },
}));

const { prisma } = await import("../db.js");
const mockPrisma = vi.mocked(prisma);

function mockServerMembership() {
  mockPrisma.serverMember.findUnique.mockResolvedValue({ userId: "user1", serverId: "srv1" } as any);
  mockPrisma.channel.findMany.mockResolvedValue([{ id: "ch1" }, { id: "ch2" }] as any);
}

describe("Message Search Filters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects short queries without a from: filter", async () => {
    const app = await buildApp();
    const token = app.jwt.sign({ userId: "user1" });

    const res = await app.inject({
      method: "GET",
      url: "/api/messages/search?q=a&serverId=srv1",
      headers: authHeader(token),
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("allows a filter-only search by author", async () => {
    const app = await buildApp();
    const token = app.jwt.sign({ userId: "user1" });
    mockServerMembership();
    mockPrisma.message.findMany.mockResolvedValue([] as any);

    const res = await app.inject({
      method: "GET",
      url: "/api/messages/search?serverId=srv1&authorId=user2",
      headers: authHeader(token),
    });

    expect(res.statusCode).toBe(200);
    const where = (mockPrisma.message.findMany.mock.calls[0][0] as any).where;
    expect(where.authorId).toBe("user2");
    expect(where.content).toBeUndefined();
    await app.close();
  });

  it("applies author and date range filters alongside text", async () => {
    const app = await buildApp();
    const token = app.jwt.sign({ userId: "user1" });
    mockServerMembership();
    mockPrisma.message.findMany.mockResolvedValue([] as any);

    const res = await app.inject({
      method: "GET",
      url: "/api/messages/search?q=deploy&serverId=srv1&authorId=user2&after=2026-06-01&before=2026-06-10",
      headers: authHeader(token),
    });

    expect(res.statusCode).toBe(200);
    const where = (mockPrisma.message.findMany.mock.calls[0][0] as any).where;
    expect(where.content).toEqual({ contains: "deploy", mode: "insensitive" });
    expect(where.authorId).toBe("user2");
    expect(where.createdAt.gt).toEqual(new Date("2026-06-01"));
    expect(where.createdAt.lt).toEqual(new Date("2026-06-10"));
    await app.close();
  });

  it("rejects invalid date filters", async () => {
    const app = await buildApp();
    const token = app.jwt.sign({ userId: "user1" });

    const res = await app.inject({
      method: "GET",
      url: "/api/messages/search?q=deploy&serverId=srv1&before=not-a-date",
      headers: authHeader(token),
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("rejects non-members", async () => {
    const app = await buildApp();
    const token = app.jwt.sign({ userId: "stranger" });
    mockPrisma.serverMember.findUnique.mockResolvedValue(null);

    const res = await app.inject({
      method: "GET",
      url: "/api/messages/search?q=deploy&serverId=srv1",
      headers: authHeader(token),
    });

    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe("Pinned Messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns pins with resolved pinnedByName", async () => {
    const app = await buildApp();
    const token = app.jwt.sign({ userId: "user1" });

    mockPrisma.channel.findUnique.mockResolvedValue({ serverId: "srv1" } as any);
    mockPrisma.serverMember.findUnique.mockResolvedValue({ userId: "user1", serverId: "srv1" } as any);
    mockPrisma.message.findMany.mockResolvedValue([
      {
        id: "msg1",
        channelId: "ch1",
        authorId: "user2",
        content: "important",
        createdAt: new Date("2026-06-01"),
        pinnedAt: new Date("2026-06-02"),
        pinnedBy: "mod1",
        author: { id: "user2", username: "u2", displayName: "User Two", avatarUrl: null },
      },
    ] as any);
    mockPrisma.user.findMany.mockResolvedValue([
      { id: "mod1", displayName: "The Mod" },
    ] as any);

    const res = await app.inject({
      method: "GET",
      url: "/api/messages/channel/ch1/pins",
      headers: authHeader(token),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pins).toHaveLength(1);
    expect(body.pins[0].pinnedByName).toBe("The Mod");
    await app.close();
  });

  it("rejects pinning without MANAGE_MESSAGES", async () => {
    const app = await buildApp();
    const token = app.jwt.sign({ userId: "user1" });

    mockPrisma.message.findUnique.mockResolvedValue({
      id: "msg1",
      channel: { serverId: "srv1" },
    } as any);
    mockPrisma.server.findUnique.mockResolvedValue({ ownerId: "owner1" } as any);
    mockPrisma.memberRole.findMany.mockResolvedValue([] as any);
    mockPrisma.role.findFirst.mockResolvedValue({ permissions: 0 } as any);

    const res = await app.inject({
      method: "POST",
      url: "/api/messages/msg1/pin",
      headers: authHeader(token),
    });

    expect(res.statusCode).toBe(403);
    expect(mockPrisma.message.update).not.toHaveBeenCalled();
    await app.close();
  });

  it("records who pinned the message", async () => {
    const app = await buildApp();
    const token = app.jwt.sign({ userId: "owner1" });

    mockPrisma.message.findUnique.mockResolvedValue({
      id: "msg1",
      channel: { serverId: "srv1" },
    } as any);
    mockPrisma.server.findUnique.mockResolvedValue({ ownerId: "owner1" } as any);

    const res = await app.inject({
      method: "POST",
      url: "/api/messages/msg1/pin",
      headers: authHeader(token),
    });

    expect(res.statusCode).toBe(200);
    expect(mockPrisma.message.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ pinnedBy: "owner1" }),
      })
    );
    await app.close();
  });
});
