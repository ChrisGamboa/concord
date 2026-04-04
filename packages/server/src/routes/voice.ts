import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";
import { createLiveKitToken, roomService, voiceRoomName } from "../livekit.js";
import { env } from "../env.js";

export const voiceRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);

  // Get a LiveKit token to join a voice channel
  app.post<{ Params: { channelId: string } }>(
    "/:channelId/join",
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { channelId } = request.params;

      // Verify the channel exists and is a voice channel
      const channel = await prisma.channel.findUnique({
        where: { id: channelId },
        include: { server: true },
      });

      if (!channel) {
        return reply.code(404).send({ error: "Channel not found" });
      }

      if (channel.type !== "VOICE") {
        return reply.code(400).send({ error: "Not a voice channel" });
      }

      // Verify user is a member of the server
      const member = await prisma.serverMember.findUnique({
        where: {
          userId_serverId: { userId, serverId: channel.serverId },
        },
      });

      if (!member) {
        return reply.code(403).send({ error: "Not a member of this server" });
      }

      // Get user info for display name and avatar
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { username: true, displayName: true, avatarUrl: true },
      });

      const roomName = voiceRoomName(channelId);
      const metadata = JSON.stringify({ avatarUrl: user?.avatarUrl ?? null });
      const token = await createLiveKitToken(
        userId,
        user?.displayName ?? user?.username ?? "Unknown",
        roomName,
        { metadata }
      );

      return {
        token,
        url: env.LIVEKIT_URL,
        roomName,
      };
    }
  );

  // Get participants currently in a voice channel
  app.get<{ Params: { channelId: string } }>(
    "/:channelId/participants",
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { channelId } = request.params;

      const channel = await prisma.channel.findUnique({
        where: { id: channelId },
        select: { serverId: true, type: true },
      });

      if (!channel) {
        return reply.code(404).send({ error: "Channel not found" });
      }

      const member = await prisma.serverMember.findUnique({
        where: {
          userId_serverId: { userId, serverId: channel.serverId },
        },
      });

      if (!member) {
        return reply.code(403).send({ error: "Not a member of this server" });
      }

      const roomName = voiceRoomName(channelId);

      try {
        const participants = await roomService.listParticipants(roomName);
        return {
          participants: participants.map((p) => ({
            userId: p.identity,
            name: p.name,
            joinedAt: p.joinedAt
              ? new Date(Number(p.joinedAt) * 1000).toISOString()
              : null,
            tracks: p.tracks.map((t) => ({
              sid: t.sid,
              type: t.type,
              source: t.source,
              muted: t.muted,
              width: t.width,
              height: t.height,
            })),
          })),
        };
      } catch {
        // Room doesn't exist yet (no one has joined)
        return { participants: [] };
      }
    }
  );
};
