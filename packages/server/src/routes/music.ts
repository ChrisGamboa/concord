import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { randomUUID } from "crypto";
import { prisma } from "../db.js";
import { Permissions } from "@concord/shared";
import { checkPermission } from "../permissions.js";
import { searchYouTube, isYtdlpAvailable } from "../music/ytdlp.js";
import {
  addToQueue,
  getState,
  removeFromQueue,
  clearQueue,
} from "../music/queue.js";
import { playTrack, skipTrack, stopPlayback, pausePlayback, resumePlayback, onQueueChanged } from "../music/player.js";
import type { MusicQueueItem } from "@concord/shared";

/**
 * Music targets a voice channel. Require that the caller is a member of the
 * channel's server, that the id really is a VOICE channel, and that they hold
 * CONNECT_VOICE. Returns the serverId on success, or null after sending an error.
 */
async function authorizeVoiceChannel(
  userId: string,
  voiceChannelId: string,
  reply: FastifyReply
): Promise<string | null> {
  const channel = await prisma.channel.findUnique({
    where: { id: voiceChannelId },
    select: { serverId: true, type: true },
  });
  if (!channel || channel.type !== "VOICE") {
    reply.code(404).send({ error: "Voice channel not found" });
    return null;
  }
  const member = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId, serverId: channel.serverId } },
  });
  if (!member) {
    reply.code(403).send({ error: "Not a member of this server" });
    return null;
  }
  if (!(await checkPermission(userId, channel.serverId, Permissions.CONNECT_VOICE))) {
    reply.code(403).send({ error: "Missing CONNECT_VOICE permission" });
    return null;
  }
  return channel.serverId;
}

export const musicRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);

  // Check if music features are available
  app.get("/status", async () => {
    const available = await isYtdlpAvailable();
    return {
      available,
      message: available
        ? "Music features are available"
        : "yt-dlp is not installed. Install it with: pip install yt-dlp",
    };
  });

  // Search YouTube
  app.get<{ Querystring: { q: string } }>("/search", async (request, reply) => {
    const { q } = request.query;
    if (!q || q.trim().length === 0) {
      return reply.code(400).send({ error: "Query parameter 'q' is required" });
    }

    try {
      const results = await searchYouTube(q.trim());
      return { results };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Search failed";
      if (message.includes("ENOENT") || message.includes("not found")) {
        return reply.code(503).send({
          error: "yt-dlp is not installed on this server",
        });
      }
      return reply.code(500).send({ error: message });
    }
  });

  // Get music state for a voice channel
  app.get<{ Params: { voiceChannelId: string } }>(
    "/state/:voiceChannelId",
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      if (!(await authorizeVoiceChannel(userId, request.params.voiceChannelId, reply))) return;
      return getState(request.params.voiceChannelId);
    }
  );

  // Add a track to the queue and optionally start playing
  app.post<{
    Params: { voiceChannelId: string };
    Body: { url: string; title?: string; duration?: number; thumbnail?: string };
  }>(
    "/queue/:voiceChannelId",
    async (request, reply) => {
      const { voiceChannelId } = request.params;
      const { url, title, duration, thumbnail } = request.body;
      const { userId } = request.user as { userId: string };
      if (!(await authorizeVoiceChannel(userId, voiceChannelId, reply))) return;

      const item: MusicQueueItem = {
        id: randomUUID(),
        title: title ?? url,
        duration: duration ?? 0,
        thumbnail: thumbnail ?? null,
        url,
        requestedBy: userId,
      };

      addToQueue(voiceChannelId, item);

      // If nothing is currently playing, start playback
      const state = getState(voiceChannelId);
      if (!state.isPlaying) {
        const next = removeFromQueue(voiceChannelId, 0);
        if (next) {
          playTrack(voiceChannelId, next).catch((err) => {
            console.error("[music] playTrack failed:", err);
          });
        }
      } else {
        // Currently playing - prefetch next if this is the first queued track
        onQueueChanged(voiceChannelId);
      }

      return getState(voiceChannelId);
    }
  );

  // Skip current track
  app.post<{ Params: { voiceChannelId: string } }>(
    "/skip/:voiceChannelId",
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      if (!(await authorizeVoiceChannel(userId, request.params.voiceChannelId, reply))) return;
      await skipTrack(request.params.voiceChannelId);
      return getState(request.params.voiceChannelId);
    }
  );

  // Pause playback
  app.post<{ Params: { voiceChannelId: string } }>(
    "/pause/:voiceChannelId",
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      if (!(await authorizeVoiceChannel(userId, request.params.voiceChannelId, reply))) return;
      pausePlayback(request.params.voiceChannelId);
      return getState(request.params.voiceChannelId);
    }
  );

  // Resume playback
  app.post<{ Params: { voiceChannelId: string } }>(
    "/resume/:voiceChannelId",
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      if (!(await authorizeVoiceChannel(userId, request.params.voiceChannelId, reply))) return;
      resumePlayback(request.params.voiceChannelId);
      return getState(request.params.voiceChannelId);
    }
  );

  // Stop playback
  app.post<{ Params: { voiceChannelId: string } }>(
    "/stop/:voiceChannelId",
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      if (!(await authorizeVoiceChannel(userId, request.params.voiceChannelId, reply))) return;
      await stopPlayback(request.params.voiceChannelId);
      return getState(request.params.voiceChannelId);
    }
  );

  // Clear queue
  app.delete<{ Params: { voiceChannelId: string } }>(
    "/queue/:voiceChannelId",
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      if (!(await authorizeVoiceChannel(userId, request.params.voiceChannelId, reply))) return;
      clearQueue(request.params.voiceChannelId);
      return getState(request.params.voiceChannelId);
    }
  );

  // Remove a specific item from the queue
  app.delete<{
    Params: { voiceChannelId: string; index: string };
  }>(
    "/queue/:voiceChannelId/:index",
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      if (!(await authorizeVoiceChannel(userId, request.params.voiceChannelId, reply))) return;
      const index = parseInt(request.params.index, 10);
      if (isNaN(index)) {
        return reply.code(400).send({ error: "Invalid index" });
      }
      const removed = removeFromQueue(request.params.voiceChannelId, index);
      if (!removed) {
        return reply.code(404).send({ error: "Item not found at index" });
      }
      return getState(request.params.voiceChannelId);
    }
  );
};
