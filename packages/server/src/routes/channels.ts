import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";
import type { ChannelType } from "@concord/shared";

export const channelRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);

  // List channels for a server
  app.get<{ Params: { serverId: string } }>(
    "/server/:serverId",
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { serverId } = request.params;

      const member = await prisma.serverMember.findUnique({
        where: { userId_serverId: { userId, serverId } },
      });
      if (!member) {
        return reply.code(403).send({ error: "Not a member of this server" });
      }

      const channels = await prisma.channel.findMany({
        where: { serverId },
        orderBy: { position: "asc" },
      });

      return {
        channels: channels.map((c) => ({
          id: c.id,
          serverId: c.serverId,
          name: c.name,
          type: c.type.toLowerCase() as ChannelType,
          position: c.position,
          createdAt: c.createdAt.toISOString(),
        })),
      };
    }
  );

  // Get unread counts for all channels in a server
  app.get<{ Params: { serverId: string } }>(
    "/server/:serverId/unread",
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { serverId } = request.params;

      const member = await prisma.serverMember.findUnique({
        where: { userId_serverId: { userId, serverId } },
      });
      if (!member) return reply.code(403).send({ error: "Not a member" });

      const channels = await prisma.channel.findMany({
        where: { serverId, type: "TEXT" },
        select: { id: true },
      });

      const lastReads = await prisma.lastRead.findMany({
        where: { userId, channelId: { in: channels.map((c) => c.id) } },
      });
      const readMap = new Map(lastReads.map((lr) => [lr.channelId, lr.readAt]));

      const counts: Record<string, number> = {};
      for (const ch of channels) {
        const readAt = readMap.get(ch.id) ?? new Date(0);
        const count = await prisma.message.count({
          where: { channelId: ch.id, createdAt: { gt: readAt } },
        });
        if (count > 0) counts[ch.id] = count;
      }

      return { unread: counts };
    }
  );

  // Create a channel
  app.post<{ Params: { serverId: string }; Body: { name: string; type: string } }>(
    "/server/:serverId",
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { serverId } = request.params;
      const { name, type } = request.body;

      const server = await prisma.server.findUnique({ where: { id: serverId } });
      if (!server || server.ownerId !== userId) {
        return reply.code(403).send({ error: "Only the server owner can create channels" });
      }

      if (!name || name.length < 1 || name.length > 100) {
        return reply.code(400).send({ error: "Channel name must be 1-100 characters" });
      }

      const channelType = type?.toUpperCase() === "VOICE" ? "VOICE" : "TEXT";

      const maxPos = await prisma.channel.aggregate({
        where: { serverId },
        _max: { position: true },
      });

      const channel = await prisma.channel.create({
        data: {
          serverId,
          name,
          type: channelType,
          position: (maxPos._max.position ?? -1) + 1,
        },
      });

      return reply.code(201).send({
        id: channel.id,
        serverId: channel.serverId,
        name: channel.name,
        type: channel.type.toLowerCase(),
        position: channel.position,
        createdAt: channel.createdAt.toISOString(),
      });
    }
  );
};
