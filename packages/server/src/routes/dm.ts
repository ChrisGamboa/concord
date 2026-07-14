import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";
import { sendToUser } from "../ws/connections.js";
import { serializeDm, groupReactions, DM_INCLUDE } from "../services/messageService.js";

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
        include: DM_INCLUDE,
        orderBy: { createdAt: "desc" },
        take: limit + 1,
      });

      const hasMore = messages.length > limit;
      const page = hasMore ? messages.slice(0, limit) : messages;

      return {
        messages: page.reverse().map(serializeDm),
        hasMore,
      };
    }
  );

  // Send a DM
  app.post<{ Params: { conversationId: string }; Body: { content: string; replyToId?: string; nonce?: string } }>(
    "/conversations/:conversationId/messages",
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { conversationId } = request.params;
      const { content, nonce } = request.body;

      if (!content?.trim() || content.length > 4000) {
        return reply.code(400).send({ error: "Message must be 1-4000 characters" });
      }

      const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
      if (!conv || (conv.participant1 !== userId && conv.participant2 !== userId)) {
        return reply.code(403).send({ error: "Not a participant" });
      }

      // A reply must reference a message in the same conversation
      let replyToId: string | null = null;
      if (request.body.replyToId) {
        const target = await prisma.directMessage.findUnique({
          where: { id: request.body.replyToId },
          select: { conversationId: true },
        });
        if (target?.conversationId === conversationId) replyToId = request.body.replyToId;
      }

      const dm = await prisma.directMessage.create({
        data: { conversationId, authorId: userId, content: content.trim(), replyToId },
        include: DM_INCLUDE,
      });

      const msg = serializeDm(dm);

      // Send to both participants via WS. The nonce is echoed only to the sender
      // so they can reconcile their optimistic (pending) copy with the persisted one.
      const otherId = conv.participant1 === userId ? conv.participant2 : conv.participant1;
      sendToUser(userId, { type: "dm_created", message: msg, ...(nonce ? { nonce } : {}) });
      sendToUser(otherId, { type: "dm_created", message: msg });

      return msg;
    }
  );

  // Edit a DM (author only)
  app.patch<{ Params: { messageId: string }; Body: { content: string } }>(
    "/messages/:messageId",
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { messageId } = request.params;
      const { content } = request.body;

      if (!content?.trim() || content.length > 4000) {
        return reply.code(400).send({ error: "Message must be 1-4000 characters" });
      }

      const existing = await prisma.directMessage.findUnique({
        where: { id: messageId },
        include: { conversation: true },
      });
      if (!existing) return reply.code(404).send({ error: "Message not found" });
      if (existing.authorId !== userId) return reply.code(403).send({ error: "Not your message" });

      const updated = await prisma.directMessage.update({
        where: { id: messageId },
        data: { content: content.trim(), editedAt: new Date() },
        include: DM_INCLUDE,
      });

      const msg = serializeDm(updated);

      sendToUser(existing.conversation.participant1, { type: "dm_updated", message: msg });
      sendToUser(existing.conversation.participant2, { type: "dm_updated", message: msg });

      return msg;
    }
  );

  // Delete a DM (author only)
  app.delete<{ Params: { messageId: string } }>(
    "/messages/:messageId",
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { messageId } = request.params;

      const existing = await prisma.directMessage.findUnique({
        where: { id: messageId },
        include: { conversation: true },
      });
      if (!existing) return reply.code(404).send({ error: "Message not found" });
      if (existing.authorId !== userId) return reply.code(403).send({ error: "Not your message" });

      await prisma.directMessage.delete({ where: { id: messageId } });

      const event = {
        type: "dm_deleted" as const,
        conversationId: existing.conversationId,
        messageId: existing.id,
      };
      sendToUser(existing.conversation.participant1, event);
      sendToUser(existing.conversation.participant2, event);

      return { deleted: true };
    }
  );

  // Toggle a reaction on a DM (participants only)
  app.post<{ Params: { messageId: string }; Body: { emoji: string } }>(
    "/messages/:messageId/reactions",
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { messageId } = request.params;
      const { emoji } = request.body;

      if (!emoji || emoji.length > 16) {
        return reply.code(400).send({ error: "Invalid emoji" });
      }

      const message = await prisma.directMessage.findUnique({
        where: { id: messageId },
        include: { conversation: true },
      });
      if (!message) return reply.code(404).send({ error: "Message not found" });
      const { participant1, participant2 } = message.conversation;
      if (userId !== participant1 && userId !== participant2) {
        return reply.code(403).send({ error: "Not a participant" });
      }

      const existing = await prisma.dmReaction.findUnique({
        where: { messageId_userId_emoji: { messageId, userId, emoji } },
      });
      if (existing) {
        await prisma.dmReaction.delete({ where: { id: existing.id } });
      } else {
        await prisma.dmReaction.create({ data: { messageId, userId, emoji } });
      }

      const reactions = await prisma.dmReaction.findMany({
        where: { messageId },
        select: { emoji: true, userId: true },
      });
      const groups = groupReactions(reactions);

      const event = {
        type: "dm_reaction_update" as const,
        conversationId: message.conversationId,
        messageId,
        reactions: groups,
      };
      sendToUser(participant1, event);
      sendToUser(participant2, event);

      return { reactions: groups };
    }
  );
};
