import type { FastifyPluginAsync } from "fastify";
import { randomUUID } from "crypto";
import { prisma } from "../db.js";
import type { ClientMessage, ServerMessage } from "@concord/shared";
import { Permissions } from "@concord/shared";
import { checkPermission } from "../permissions.js";
import {
  addConnection,
  removeConnection,
  subscribeToChannel,
  unsubscribeFromChannel,
  broadcastToChannel,
  broadcastToAll,
  sendToUser,
} from "./connections.js";
import {
  createChannelMessage,
  serializeMessage,
  MESSAGE_INCLUDE,
} from "../services/messageService.js";
import {
  addSession,
  removeSession,
  setUserStatus,
  getUserStatus,
  clearUserStatus,
} from "./presence.js";
import { createConnectionLimiter, SEND_TYPES } from "./rateLimiter.js";
import { consumeTicket } from "./tickets.js";

export const wsHandler: FastifyPluginAsync = async (app) => {
  app.get("/ws", { websocket: true }, (socket, request) => {
    const sessionId = randomUUID();
    let userId: string | null = null;
    const limiter = createConnectionLimiter();
    // Resolves once this session's presence registration completes, so the close
    // handler never races ahead of its own connect (which would strand a session).
    let presenceReady: Promise<boolean> = Promise.resolve(false);

    // Register listeners up front; they no-op until async auth sets userId.
    socket.on("message", async (raw: Buffer) => {
      if (!userId) return;

      // Flood control: drop frames over the broad per-connection limit.
      if (!limiter.allowFrame()) {
        send({ type: "error", message: "Rate limit exceeded" });
        return;
      }

      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        send({ type: "error", message: "Invalid JSON" });
        return;
      }

      // Tighter limit on content-creating actions (DB writes + fan-out).
      if (SEND_TYPES.has(msg.type) && !limiter.allowSend()) {
        send({ type: "error", message: "You're sending messages too fast" });
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
      if (!disconnectedUserId) return;

      // Broadcast offline if the user has no remaining sessions on any instance.
      // Wait for this session's own registration first so add/remove stay ordered.
      void presenceReady.then(() => removeSession(sessionId, disconnectedUserId)).then((isLast) => {
        if (!isLast) return;
        return clearUserStatus(disconnectedUserId).then(() => {
          broadcastToAll({
            type: "presence_update",
            userId: disconnectedUserId,
            status: "offline",
          });
        });
      });
    });

    function send(msg: ServerMessage) {
      if (socket.readyState === 1) {
        socket.send(JSON.stringify(msg));
      }
    }

    // Authenticate: prefer a single-use ticket (keeps the JWT out of the URL/logs),
    // fall back to a token query param. Then check tokenVersion for revocation.
    void (async () => {
      const query = request.query as Record<string, string>;
      let authedUserId: string | null = null;
      let authedTokenVersion = 0;

      if (query.ticket) {
        const data = await consumeTicket(query.ticket);
        if (data) {
          authedUserId = data.userId;
          authedTokenVersion = data.tokenVersion;
        }
      } else if (query.token) {
        try {
          const decoded = app.jwt.verify<{ userId: string; tokenVersion?: number }>(query.token);
          authedUserId = decoded.userId;
          authedTokenVersion = decoded.tokenVersion ?? 0;
        } catch {
          /* invalid token → rejected below */
        }
      }

      if (!authedUserId) {
        send({ type: "error", message: "Authentication required" });
        socket.close();
        return;
      }

      // Revocation: reject if the token was invalidated (logout-all).
      const dbUser = await prisma.user?.findUnique?.({
        where: { id: authedUserId },
        select: { tokenVersion: true },
      });
      if (dbUser && (dbUser.tokenVersion ?? 0) !== authedTokenVersion) {
        send({ type: "error", message: "Session expired" });
        socket.close();
        return;
      }

      // The socket may have closed during the async auth above; the close handler
      // ran with userId still null and skipped cleanup, so registering now would
      // strand presence. Bail if it's no longer open.
      if (socket.readyState !== 1) return;

      userId = authedUserId;
      addConnection(sessionId, socket, userId);
      send({ type: "ready", userId, sessionId });

      // Broadcast presence if this is their first connection. A status set by
      // another recent session (e.g. dnd) survives reconnects within a run.
      presenceReady = addSession(sessionId, userId);
      void presenceReady.then(async (isFirst) => {
        if (!isFirst || !authedUserId) return;
        const existing = await getUserStatus(authedUserId);
        if (!existing) await setUserStatus(authedUserId, "online");
        broadcastToAll(
          { type: "presence_update", userId: authedUserId, status: existing ?? "online" },
          sessionId
        );
      });
    })();
  });
};


async function handleMessage(
  sessionId: string,
  userId: string,
  msg: ClientMessage
) {
  switch (msg.type) {
    case "subscribe_channel": {
      const ch = await prisma.channel.findUnique({
        where: { id: msg.channelId },
        select: { serverId: true },
      });
      if (!ch) return;
      const mem = await prisma.serverMember.findUnique({
        where: { userId_serverId: { userId, serverId: ch.serverId } },
      });
      if (!mem) return;
      // Live delivery must honor READ_MESSAGES just like the REST fetch does.
      if (!(await checkPermission(userId, ch.serverId, Permissions.READ_MESSAGES))) return;
      subscribeToChannel(sessionId, msg.channelId);
      break;
    }
    case "unsubscribe_channel": {
      unsubscribeFromChannel(sessionId, msg.channelId);
      break;
    }
    case "send_message": {
      if (!msg.content || msg.content.trim().length === 0 || msg.content.length > 4000) return;
      const sendChannel = await prisma.channel.findUnique({
        where: { id: msg.channelId },
        select: { serverId: true },
      });
      if (!sendChannel) return;
      const sender = await prisma.serverMember.findUnique({
        where: { userId_serverId: { userId, serverId: sendChannel.serverId } },
      });
      if (!sender) return;
      if (!(await checkPermission(userId, sendChannel.serverId, Permissions.SEND_MESSAGES))) return;

      await createChannelMessage({
        channelId: msg.channelId,
        serverId: sendChannel.serverId,
        authorId: userId,
        content: msg.content,
        replyToId: msg.replyToId,
        nonce: msg.nonce,
      });
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
        include: MESSAGE_INCLUDE,
      });

      broadcastToChannel(updated.channelId, {
        type: "message_updated",
        message: serializeMessage(updated),
      });
      break;
    }
    case "delete_message": {
      const toDelete = await prisma.message.findUnique({
        where: { id: msg.messageId },
        include: { channel: { select: { serverId: true } } },
      });
      if (!toDelete) return;

      // Allow if author OR has MANAGE_MESSAGES permission
      if (toDelete.authorId !== userId) {
        const canManage = await checkPermission(userId, toDelete.channel.serverId, Permissions.MANAGE_MESSAGES);
        if (!canManage) return;
      }

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
    case "toggle_reaction": {
      const message = await prisma.message.findUnique({
        where: { id: msg.messageId },
        select: { channelId: true },
      });
      if (!message) return;

      const existing = await prisma.reaction.findUnique({
        where: { messageId_userId_emoji: { messageId: msg.messageId, userId, emoji: msg.emoji } },
      });

      if (existing) {
        await prisma.reaction.delete({ where: { id: existing.id } });
      } else {
        await prisma.reaction.create({ data: { messageId: msg.messageId, userId, emoji: msg.emoji } });
      }

      // Get updated reaction groups for this message
      const reactions = await prisma.reaction.findMany({ where: { messageId: msg.messageId } });
      const groups: Record<string, string[]> = {};
      for (const r of reactions) {
        (groups[r.emoji] ??= []).push(r.userId);
      }
      const reactionGroups = Object.entries(groups).map(([emoji, userIds]) => ({
        emoji,
        count: userIds.length,
        userIds,
      }));

      broadcastToChannel(message.channelId, {
        type: "reaction_update",
        channelId: message.channelId,
        messageId: msg.messageId,
        reactions: reactionGroups,
      });
      break;
    }
    case "dm_typing": {
      const conv = await prisma.conversation.findUnique({
        where: { id: msg.conversationId },
      });
      if (!conv || (conv.participant1 !== userId && conv.participant2 !== userId)) return;
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { username: true },
      });
      if (!user) return;
      const otherId = conv.participant1 === userId ? conv.participant2 : conv.participant1;
      sendToUser(otherId, {
        type: "dm_typing",
        conversationId: msg.conversationId,
        userId,
        username: user.username,
      });
      break;
    }
    case "presence_set": {
      if (!["online", "idle", "dnd"].includes(msg.status)) return;
      await setUserStatus(userId, msg.status);
      // Broadcast to everyone including the sender's other sessions
      broadcastToAll({ type: "presence_update", userId, status: msg.status });
      break;
    }
    case "mark_read": {
      await prisma.lastRead.upsert({
        where: { userId_channelId: { userId, channelId: msg.channelId } },
        create: { userId, channelId: msg.channelId, readAt: new Date() },
        update: { readAt: new Date() },
      });
      sendToUser(userId, { type: "unread_count", channelId: msg.channelId, count: 0 });
      break;
    }
  }
}
