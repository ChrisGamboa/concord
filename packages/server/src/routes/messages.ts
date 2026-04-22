import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";
import { Permissions } from "@concord/shared";
import { checkPermission } from "../permissions.js";

export const messageRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);

  // Get messages for a channel (paginated, newest first)
  app.get<{
    Params: { channelId: string };
    Querystring: { before?: string; limit?: string };
  }>("/channel/:channelId", async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { channelId } = request.params;
    const { before, limit: limitStr } = request.query;
    const limit = Math.min(parseInt(limitStr ?? "50", 10), 100);

    // Verify user has access to this channel's server
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      select: { serverId: true },
    });
    if (!channel) {
      return reply.code(404).send({ error: "Channel not found" });
    }

    const member = await prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId: channel.serverId } },
    });
    if (!member) {
      return reply.code(403).send({ error: "Not a member of this server" });
    }

    const messages = await prisma.message.findMany({
      where: {
        channelId,
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      include: {
        author: {
          select: { id: true, username: true, displayName: true, avatarUrl: true, status: true },
        },
        reactions: { select: { emoji: true, userId: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
    });

    const hasMore = messages.length > limit;
    const page = hasMore ? messages.slice(0, limit) : messages;

    return {
      messages: page.reverse().map((m) => ({
        id: m.id,
        channelId: m.channelId,
        authorId: m.authorId,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
        editedAt: m.editedAt?.toISOString() ?? null,
        pinnedAt: m.pinnedAt?.toISOString() ?? null,
        author: m.author,
        reactions: (() => {
          const groups: Record<string, string[]> = {};
          for (const r of m.reactions) (groups[r.emoji] ??= []).push(r.userId);
          return Object.entries(groups).map(([emoji, userIds]) => ({ emoji, count: userIds.length, userIds }));
        })(),
      })),
      hasMore,
    };
  });

  // Get pinned messages for a channel
  app.get<{ Params: { channelId: string } }>(
    "/channel/:channelId/pins",
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { channelId } = request.params;

      const channel = await prisma.channel.findUnique({
        where: { id: channelId },
        select: { serverId: true },
      });
      if (!channel) return reply.code(404).send({ error: "Channel not found" });

      const member = await prisma.serverMember.findUnique({
        where: { userId_serverId: { userId, serverId: channel.serverId } },
      });
      if (!member) return reply.code(403).send({ error: "Not a member" });

      const pins = await prisma.message.findMany({
        where: { channelId, pinnedAt: { not: null } },
        include: {
          author: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        },
        orderBy: { pinnedAt: "desc" },
      });

      return {
        pins: pins.map((m) => ({
          id: m.id,
          channelId: m.channelId,
          authorId: m.authorId,
          content: m.content,
          createdAt: m.createdAt.toISOString(),
          pinnedAt: m.pinnedAt?.toISOString() ?? null,
          author: m.author,
        })),
      };
    }
  );

  // Pin a message
  app.post<{ Params: { messageId: string } }>(
    "/:messageId/pin",
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { messageId } = request.params;

      const message = await prisma.message.findUnique({
        where: { id: messageId },
        include: { channel: { select: { serverId: true } } },
      });
      if (!message) return reply.code(404).send({ error: "Message not found" });

      const canPin = await checkPermission(userId, message.channel.serverId, Permissions.MANAGE_MESSAGES);
      if (!canPin) return reply.code(403).send({ error: "Missing MANAGE_MESSAGES permission" });

      await prisma.message.update({
        where: { id: messageId },
        data: { pinnedAt: new Date(), pinnedBy: userId },
      });

      return { pinned: true };
    }
  );

  // Unpin a message
  app.delete<{ Params: { messageId: string } }>(
    "/:messageId/pin",
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { messageId } = request.params;

      const message = await prisma.message.findUnique({
        where: { id: messageId },
        include: { channel: { select: { serverId: true } } },
      });
      if (!message) return reply.code(404).send({ error: "Message not found" });

      const canPin = await checkPermission(userId, message.channel.serverId, Permissions.MANAGE_MESSAGES);
      if (!canPin) return reply.code(403).send({ error: "Missing MANAGE_MESSAGES permission" });

      await prisma.message.update({
        where: { id: messageId },
        data: { pinnedAt: null, pinnedBy: null },
      });

      return { unpinned: true };
    }
  );
};
