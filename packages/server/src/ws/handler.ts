import type { FastifyPluginAsync } from "fastify";
import { randomUUID } from "crypto";
import { prisma } from "../db.js";
import type { ClientMessage, ServerMessage } from "@concord/shared";
import {
  addConnection,
  removeConnection,
  subscribeToChannel,
  unsubscribeFromChannel,
  broadcastToChannel,
  broadcastToAll,
  isUserOnline,
  getOnlineUserIds,
} from "./connections.js";

export const wsHandler: FastifyPluginAsync = async (app) => {
  app.get("/ws", { websocket: true }, (socket, request) => {
    const sessionId = randomUUID();
    let userId: string | null = null;

    // Authenticate via first message or query param
    const token =
      (request.query as Record<string, string>).token ?? null;

    if (token) {
      try {
        const decoded = app.jwt.verify<{ userId: string }>(token);
        userId = decoded.userId;
        const wasOnline = isUserOnline(userId);
        addConnection(sessionId, socket, userId);
        send({ type: "ready", userId, sessionId });

        // Broadcast online presence if this is their first connection
        if (!wasOnline) {
          broadcastToAll(
            { type: "presence_update", userId, status: "online" },
            sessionId
          );
        }
      } catch {
        send({ type: "error", message: "Invalid token" });
        socket.close();
        return;
      }
    } else {
      send({ type: "error", message: "Token required as query param" });
      socket.close();
      return;
    }

    socket.on("message", async (raw: Buffer) => {
      if (!userId) return;

      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        send({ type: "error", message: "Invalid JSON" });
        return;
      }

      try {
        await handleMessage(sessionId, userId, msg);
      } catch (err) {
        app.log.error(err);
        send({ type: "error", message: "Internal error" });
      }
    });

    socket.on("close", () => {
      const disconnectedUserId = userId;
      removeConnection(sessionId);

      // Broadcast offline if user has no remaining connections
      if (disconnectedUserId && !isUserOnline(disconnectedUserId)) {
        broadcastToAll({
          type: "presence_update",
          userId: disconnectedUserId,
          status: "offline",
        });
      }
    });

    function send(msg: ServerMessage) {
      if (socket.readyState === 1) {
        socket.send(JSON.stringify(msg));
      }
    }
  });
};

async function verifyChannelAccess(
  userId: string,
  channelId: string
): Promise<boolean> {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { serverId: true },
  });
  if (!channel) return false;
  const member = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId, serverId: channel.serverId } },
  });
  return member !== null;
}

async function handleMessage(
  sessionId: string,
  userId: string,
  msg: ClientMessage
) {
  switch (msg.type) {
    case "subscribe_channel": {
      if (!(await verifyChannelAccess(userId, msg.channelId))) return;
      subscribeToChannel(sessionId, msg.channelId);
      break;
    }
    case "unsubscribe_channel": {
      unsubscribeFromChannel(sessionId, msg.channelId);
      break;
    }
    case "send_message": {
      if (!msg.content || msg.content.trim().length === 0 || msg.content.length > 4000) return;
      if (!(await verifyChannelAccess(userId, msg.channelId))) return;

      const message = await prisma.message.create({
        data: {
          channelId: msg.channelId,
          authorId: userId,
          content: msg.content,
        },
        include: {
          author: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
        },
      });

      const serverMsg: ServerMessage = {
        type: "message_created",
        message: {
          id: message.id,
          channelId: message.channelId,
          authorId: message.authorId,
          content: message.content,
          createdAt: message.createdAt.toISOString(),
          editedAt: null,
          author: message.author,
        },
      };

      broadcastToChannel(msg.channelId, serverMsg);
      break;
    }
    case "edit_message": {
      const existing = await prisma.message.findUnique({
        where: { id: msg.messageId },
      });
      if (!existing || existing.authorId !== userId) return;

      const updated = await prisma.message.update({
        where: { id: msg.messageId },
        data: { content: msg.content, editedAt: new Date() },
        include: {
          author: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
        },
      });

      broadcastToChannel(updated.channelId, {
        type: "message_updated",
        message: {
          id: updated.id,
          channelId: updated.channelId,
          authorId: updated.authorId,
          content: updated.content,
          createdAt: updated.createdAt.toISOString(),
          editedAt: updated.editedAt?.toISOString() ?? null,
          author: updated.author,
        },
      });
      break;
    }
    case "delete_message": {
      const toDelete = await prisma.message.findUnique({
        where: { id: msg.messageId },
      });
      if (!toDelete || toDelete.authorId !== userId) return;

      await prisma.message.delete({ where: { id: msg.messageId } });

      broadcastToChannel(toDelete.channelId, {
        type: "message_deleted",
        channelId: toDelete.channelId,
        messageId: toDelete.id,
      });
      break;
    }
    case "typing_start": {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { username: true },
      });
      if (!user) return;

      broadcastToChannel(
        msg.channelId,
        {
          type: "typing",
          channelId: msg.channelId,
          userId,
          username: user.username,
        },
        sessionId
      );
      break;
    }
  }
}
