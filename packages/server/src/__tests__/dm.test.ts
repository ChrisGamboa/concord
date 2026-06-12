import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApp, authHeader } from "./helpers";

vi.mock("../db.js", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    conversation: { findUnique: vi.fn() },
    directMessage: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    dmReaction: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

const { prisma } = await import("../db.js");
const mockPrisma = vi.mocked(prisma);

const CONV = { id: "conv1", participant1: "user1", participant2: "user2", createdAt: new Date() };

function mockCreatedDm(replyTo: unknown = null) {
  mockPrisma.directMessage.create.mockResolvedValue({
    id: "dm1",
    conversationId: "conv1",
    authorId: "user1",
    content: "hello",
    createdAt: new Date(),
    editedAt: null,
    author: { id: "user1", username: "u1", displayName: "User One", avatarUrl: null, status: null },
    replyTo,
  } as any);
}

describe("DM Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.conversation.findUnique.mockResolvedValue(CONV as any);
  });

  it("rejects sends from non-participants", async () => {
    const app = await buildApp();
    const token = app.jwt.sign({ userId: "stranger" });

    const res = await app.inject({
      method: "POST",
      url: "/api/dm/conversations/conv1/messages",
      headers: authHeader(token),
      payload: { content: "hi" },
    });

    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("persists a reply when the target is in the same conversation", async () => {
    const app = await buildApp();
    const token = app.jwt.sign({ userId: "user1" });

    mockPrisma.directMessage.findUnique.mockResolvedValue({ conversationId: "conv1" } as any);
    mockCreatedDm({
      id: "orig1",
      content: "original",
      authorId: "user2",
      createdAt: new Date(),
      author: { id: "user2", username: "u2", displayName: "User Two", avatarUrl: null, status: null },
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/dm/conversations/conv1/messages",
      headers: authHeader(token),
      payload: { content: "hello", replyToId: "orig1" },
    });

    expect(res.statusCode).toBe(200);
    expect(mockPrisma.directMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ replyToId: "orig1" }),
      })
    );
    expect(res.json().replyTo.id).toBe("orig1");
    await app.close();
  });

  it("drops a reply reference from another conversation", async () => {
    const app = await buildApp();
    const token = app.jwt.sign({ userId: "user1" });

    mockPrisma.directMessage.findUnique.mockResolvedValue({ conversationId: "other-conv" } as any);
    mockCreatedDm(null);

    const res = await app.inject({
      method: "POST",
      url: "/api/dm/conversations/conv1/messages",
      headers: authHeader(token),
      payload: { content: "hello", replyToId: "foreign-msg" },
    });

    expect(res.statusCode).toBe(200);
    expect(mockPrisma.directMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ replyToId: null }),
      })
    );
    await app.close();
  });

  it("only allows the author to edit a DM", async () => {
    const app = await buildApp();
    const token = app.jwt.sign({ userId: "user2" });

    mockPrisma.directMessage.findUnique.mockResolvedValue({
      id: "dm1",
      authorId: "user1",
      conversationId: "conv1",
      conversation: CONV,
    } as any);

    const res = await app.inject({
      method: "PATCH",
      url: "/api/dm/messages/dm1",
      headers: authHeader(token),
      payload: { content: "hacked" },
    });

    expect(res.statusCode).toBe(403);
    expect(mockPrisma.directMessage.update).not.toHaveBeenCalled();
    await app.close();
  });
});
