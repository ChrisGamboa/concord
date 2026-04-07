import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";
import { Permissions } from "@concord/shared";
import type { ChannelType } from "@concord/shared";
import { checkPermission } from "../permissions.js";

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

      if (!await checkPermission(userId, serverId, Permissions.MANAGE_CHANNELS)) {
        return reply.code(403).send({ error: "Missing MANAGE_CHANNELS permission" });
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

  // Rename a channel
  app.patch<{ Params: { channelId: string }; Body: { name: string } }>(
    "/:channelId",
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { channelId } = request.params;
      const { name } = request.body;

      const channel = await prisma.channel.findUnique({ where: { id: channelId }, select: { serverId: true } });
      if (!channel) return reply.code(404).send({ error: "Channel not found" });

      if (!await checkPermission(userId, channel.serverId, Permissions.MANAGE_CHANNELS)) {
        return reply.code(403).send({ error: "Missing MANAGE_CHANNELS permission" });
      }

      if (!name || name.length < 1 || name.length > 100) {
        return reply.code(400).send({ error: "Channel name must be 1-100 characters" });
      }

      const updated = await prisma.channel.update({ where: { id: channelId }, data: { name } });
      return { id: updated.id, name: updated.name };
    }
  );

  // Delete a channel
  app.delete<{ Params: { channelId: string } }>(
    "/:channelId",
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { channelId } = request.params;

      const channel = await prisma.channel.findUnique({ where: { id: channelId }, select: { serverId: true } });
      if (!channel) return reply.code(404).send({ error: "Channel not found" });

      if (!await checkPermission(userId, channel.serverId, Permissions.MANAGE_CHANNELS)) {
        return reply.code(403).send({ error: "Missing MANAGE_CHANNELS permission" });
      }

      await prisma.channel.delete({ where: { id: channelId } });
      return { deleted: true };
    }
  );
};
