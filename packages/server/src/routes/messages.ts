import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";

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
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
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
        author: m.author,
      })),
      hasMore,
    };
  });
};
