import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { Permissions } from "@concord/shared";
import { checkPermission } from "../permissions.js";
import { createChannelMessage, serializeMessage, MESSAGE_INCLUDE } from "../services/messageService.js";
import { validateBody } from "../validate.js";

const createMessageBody = z.object({
  content: z.string().max(4000, "Message must be 1-4000 characters").refine((s) => s.trim().length > 0, { message: "Message must be 1-4000 characters" }),
  replyToId: z.string().optional(),
  nonce: z.string().optional(),
});

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
    if (!(await checkPermission(userId, channel.serverId, Permissions.READ_MESSAGES))) {
      return reply.code(403).send({ error: "Missing READ_MESSAGES permission" });
    }

    const messages = await prisma.message.findMany({
      where: {
        channelId,
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      include: MESSAGE_INCLUDE,
      orderBy: { createdAt: "desc" },
      take: limit + 1,
    });

    const hasMore = messages.length > limit;
    const page = hasMore ? messages.slice(0, limit) : messages;

    return {
      messages: page.reverse().map(serializeMessage),
      hasMore,
    };
  });

  // Create a message over HTTP (parity with the WebSocket send path; shares the
  // same service so validation, broadcast, and unread fan-out stay identical).
  app.post<{
    Params: { channelId: string };
    Body: { content: string; replyToId?: string; nonce?: string };
  }>("/channel/:channelId", { preHandler: validateBody(createMessageBody) }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { channelId } = request.params;
    const { content, replyToId, nonce } = request.body;

    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      select: { serverId: true },
    });
    if (!channel) return reply.code(404).send({ error: "Channel not found" });
    const member = await prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId: channel.serverId } },
    });
    if (!member) return reply.code(403).send({ error: "Not a member of this server" });
    if (!(await checkPermission(userId, channel.serverId, Permissions.SEND_MESSAGES))) {
      return reply.code(403).send({ error: "Missing SEND_MESSAGES permission" });
    }

    return createChannelMessage({
      channelId,
      serverId: channel.serverId,
      authorId: userId,
      content: content.trim(),
      replyToId,
      nonce,
    });
  });

  // Search messages in a server or channel
  app.get<{
    Querystring: {
      q?: string;
      serverId?: string;
      channelId?: string;
      authorId?: string;
      before?: string;
      after?: string;
      limit?: string;
    };
  }>("/search", async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { q, serverId, channelId, authorId, before, after, limit: limitStr } = request.query;
    const limit = Math.min(parseInt(limitStr ?? "25", 10), 50);

    const text = q?.trim() ?? "";
    // Allow filter-only searches (e.g. everything from one author), but not unfiltered dumps
    if (text.length < 2 && !authorId) {
      return reply.code(400).send({ error: "Query must be at least 2 characters (or include a from: filter)" });
    }

    const beforeDate = before ? new Date(before) : null;
    const afterDate = after ? new Date(after) : null;
    if ((beforeDate && isNaN(beforeDate.getTime())) || (afterDate && isNaN(afterDate.getTime()))) {
      return reply.code(400).send({ error: "Invalid date filter" });
    }

    // Build filter: either a specific channel or all channels in a server
    const channelIds: string[] = [];
    if (channelId) {
      const channel = await prisma.channel.findUnique({ where: { id: channelId }, select: { serverId: true } });
      if (!channel) return reply.code(404).send({ error: "Channel not found" });
      const member = await prisma.serverMember.findUnique({
        where: { userId_serverId: { userId, serverId: channel.serverId } },
      });
      if (!member) return reply.code(403).send({ error: "Not a member" });
      if (!(await checkPermission(userId, channel.serverId, Permissions.READ_MESSAGES))) {
        return reply.code(403).send({ error: "Missing READ_MESSAGES permission" });
      }
      channelIds.push(channelId);
    } else if (serverId) {
      const member = await prisma.serverMember.findUnique({
        where: { userId_serverId: { userId, serverId } },
      });
      if (!member) return reply.code(403).send({ error: "Not a member" });
      if (!(await checkPermission(userId, serverId, Permissions.READ_MESSAGES))) {
        return reply.code(403).send({ error: "Missing READ_MESSAGES permission" });
      }
      const channels = await prisma.channel.findMany({ where: { serverId }, select: { id: true } });
      channelIds.push(...channels.map((c) => c.id));
    } else {
      return reply.code(400).send({ error: "serverId or channelId required" });
    }

    const messages = await prisma.message.findMany({
      where: {
        channelId: { in: channelIds },
        ...(text.length >= 2 ? { content: { contains: text, mode: "insensitive" } } : {}),
        ...(authorId ? { authorId } : {}),
        ...(beforeDate || afterDate
          ? {
              createdAt: {
                ...(beforeDate ? { lt: beforeDate } : {}),
                ...(afterDate ? { gt: afterDate } : {}),
              },
            }
          : {}),
      },
      include: {
        author: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        channel: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return {
      results: messages.map((m) => ({
        id: m.id,
        channelId: m.channelId,
        channelName: m.channel.name,
        authorId: m.authorId,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
        author: m.author,
      })),
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
      if (!(await checkPermission(userId, channel.serverId, Permissions.READ_MESSAGES))) {
        return reply.code(403).send({ error: "Missing READ_MESSAGES permission" });
      }

      const pins = await prisma.message.findMany({
        where: { channelId, pinnedAt: { not: null } },
        include: {
          author: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        },
        orderBy: { pinnedAt: "desc" },
      });

      // pinnedBy is a bare user id (no relation) -- resolve display names in one query
      const pinnerIds = [...new Set(pins.map((p) => p.pinnedBy).filter((id): id is string => id !== null))];
      const pinners = await prisma.user.findMany({
        where: { id: { in: pinnerIds } },
        select: { id: true, displayName: true },
      });
      const pinnerNames = new Map(pinners.map((u) => [u.id, u.displayName]));

      return {
        pins: pins.map((m) => ({
          id: m.id,
          channelId: m.channelId,
          authorId: m.authorId,
          content: m.content,
          createdAt: m.createdAt.toISOString(),
          pinnedAt: m.pinnedAt?.toISOString() ?? null,
          pinnedByName: m.pinnedBy ? pinnerNames.get(m.pinnedBy) ?? null : null,
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
