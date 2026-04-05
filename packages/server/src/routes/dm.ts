import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";
import { sendToUser } from "../ws/connections.js";

export const dmRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);

  // List conversations for the current user
  app.get("/conversations", async (request) => {
    const { userId } = request.user as { userId: string };

    const convs = await prisma.conversation.findMany({
      where: { OR: [{ participant1: userId }, { participant2: userId }] },
      include: {
        user1: { select: { id: true, username: true, displayName: true, avatarUrl: true, status: true } },
        user2: { select: { id: true, username: true, displayName: true, avatarUrl: true, status: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    });

    return {
      conversations: convs.map((c) => ({
        id: c.id,
        otherUser: c.participant1 === userId ? c.user2 : c.user1,
        lastMessage: c.messages[0] ? {
          content: c.messages[0].content,
          createdAt: c.messages[0].createdAt.toISOString(),
        } : null,
      })),
    };
  });

  // Get or create a conversation with another user
  app.post<{ Body: { targetUserId: string } }>("/conversations", async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { targetUserId } = request.body;

    if (userId === targetUserId) {
      return reply.code(400).send({ error: "Cannot DM yourself" });
    }

    const target = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) return reply.code(404).send({ error: "User not found" });

    // Order participant IDs consistently
    const [p1, p2] = [userId, targetUserId].sort();

    const conv = await prisma.conversation.upsert({
      where: { participant1_participant2: { participant1: p1, participant2: p2 } },
      create: { participant1: p1, participant2: p2 },
      update: {},
      include: {
        user1: { select: { id: true, username: true, displayName: true, avatarUrl: true, status: true } },
        user2: { select: { id: true, username: true, displayName: true, avatarUrl: true, status: true } },
      },
    });

    return {
      id: conv.id,
      otherUser: conv.participant1 === userId ? conv.user2 : conv.user1,
    };
  });

  // Get messages for a conversation
  app.get<{ Params: { conversationId: string }; Querystring: { before?: string; limit?: string } }>(
    "/conversations/:conversationId/messages",
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { conversationId } = request.params;
      const { before, limit: limitStr } = request.query;
      const limit = Math.min(parseInt(limitStr ?? "50", 10), 100);

      const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
      if (!conv || (conv.participant1 !== userId && conv.participant2 !== userId)) {
        return reply.code(403).send({ error: "Not a participant" });
      }

      const messages = await prisma.directMessage.findMany({
        where: {
          conversationId,
          ...(before ? { createdAt: { lt: new Date(before) } } : {}),
        },
        include: {
          author: { select: { id: true, username: true, displayName: true, avatarUrl: true, status: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit + 1,
      });

      const hasMore = messages.length > limit;
      const page = hasMore ? messages.slice(0, limit) : messages;

      return {
        messages: page.reverse().map((m) => ({
          id: m.id,
          conversationId: m.conversationId,
          authorId: m.authorId,
          content: m.content,
          createdAt: m.createdAt.toISOString(),
          author: m.author,
        })),
        hasMore,
      };
    }
  );

  // Send a DM
  app.post<{ Params: { conversationId: string }; Body: { content: string } }>(
    "/conversations/:conversationId/messages",
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { conversationId } = request.params;
      const { content } = request.body;

      if (!content?.trim() || content.length > 4000) {
        return reply.code(400).send({ error: "Message must be 1-4000 characters" });
      }

      const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
      if (!conv || (conv.participant1 !== userId && conv.participant2 !== userId)) {
        return reply.code(403).send({ error: "Not a participant" });
      }

      const dm = await prisma.directMessage.create({
        data: { conversationId, authorId: userId, content: content.trim() },
        include: {
          author: { select: { id: true, username: true, displayName: true, avatarUrl: true, status: true } },
        },
      });

      const msg = {
        id: dm.id,
        conversationId: dm.conversationId,
        authorId: dm.authorId,
        content: dm.content,
        createdAt: dm.createdAt.toISOString(),
        author: dm.author,
      };

      // Send to both participants via WS
      const otherId = conv.participant1 === userId ? conv.participant2 : conv.participant1;
      sendToUser(userId, { type: "dm_created", message: msg } as any);
      sendToUser(otherId, { type: "dm_created", message: msg } as any);

      return msg;
    }
  );
};
