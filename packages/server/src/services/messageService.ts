import { prisma } from "../db.js";
import type { Message, DmMessagePayload, MessageReference, ReactionGroup } from "@concord/shared";
import { broadcastToChannel, sendToUser } from "../ws/connections.js";

// Single source of truth for turning Prisma message rows into wire payloads and
// for creating channel messages (used by both the WS handler and the HTTP route).

export const AUTHOR_SELECT = {
  select: { id: true, username: true, displayName: true, avatarUrl: true, status: true },
} as const;

export const REPLY_SELECT = {
  select: {
    id: true,
    content: true,
    authorId: true,
    createdAt: true,
    author: AUTHOR_SELECT,
  },
} as const;

/** Include for channel messages: author, reactions, and the replied-to reference. */
export const MESSAGE_INCLUDE = {
  author: AUTHOR_SELECT,
  reactions: { select: { emoji: true, userId: true } },
  replyTo: REPLY_SELECT,
} as const;

/** Include for direct messages (same shape). */
export const DM_INCLUDE = {
  author: AUTHOR_SELECT,
  reactions: { select: { emoji: true, userId: true } },
  replyTo: REPLY_SELECT,
} as const;

export function groupReactions(reactions?: Array<{ emoji: string; userId: string }>): ReactionGroup[] {
  if (!reactions) return [];
  const groups: Record<string, string[]> = {};
  for (const r of reactions) (groups[r.emoji] ??= []).push(r.userId);
  return Object.entries(groups).map(([emoji, userIds]) => ({ emoji, count: userIds.length, userIds }));
}

type ReplyRow = {
  id: string;
  content: string;
  authorId: string;
  createdAt: Date;
  author?: unknown;
} | null | undefined;

export function mapReplyTo(replyTo: ReplyRow): MessageReference | null {
  if (!replyTo) return null;
  return {
    id: replyTo.id,
    content: replyTo.content,
    authorId: replyTo.authorId,
    createdAt: replyTo.createdAt.toISOString(),
    author: replyTo.author as MessageReference["author"],
  };
}

type ChannelMessageRow = {
  id: string;
  channelId: string;
  authorId: string;
  content: string;
  createdAt: Date;
  editedAt: Date | null;
  pinnedAt?: Date | null;
  author?: unknown;
  reactions?: Array<{ emoji: string; userId: string }>;
  replyTo?: ReplyRow;
};

export function serializeMessage(m: ChannelMessageRow): Message {
  return {
    id: m.id,
    channelId: m.channelId,
    authorId: m.authorId,
    content: m.content,
    createdAt: m.createdAt.toISOString(),
    editedAt: m.editedAt?.toISOString() ?? null,
    pinnedAt: m.pinnedAt ? m.pinnedAt.toISOString() : null,
    author: m.author as Message["author"],
    reactions: groupReactions(m.reactions),
    replyTo: mapReplyTo(m.replyTo),
  };
}

type DmMessageRow = {
  id: string;
  conversationId: string;
  authorId: string;
  content: string;
  createdAt: Date;
  editedAt: Date | null;
  author?: unknown;
  reactions?: Array<{ emoji: string; userId: string }>;
  replyTo?: ReplyRow;
};

export function serializeDm(m: DmMessageRow): DmMessagePayload {
  return {
    id: m.id,
    conversationId: m.conversationId,
    authorId: m.authorId,
    content: m.content,
    createdAt: m.createdAt.toISOString(),
    editedAt: m.editedAt?.toISOString() ?? null,
    reactions: groupReactions(m.reactions),
    replyTo: mapReplyTo(m.replyTo),
    author: m.author,
  };
}

/**
 * Push updated unread/mention counts to every server member who isn't the sender.
 * Set-based: 3 queries total (members, their lastReads, the unread window) instead
 * of the previous per-member fan-out (1 + 2N–3N queries).
 */
async function fanOutUnread(channelId: string, serverId: string, senderId: string): Promise<void> {
  const members = await prisma.serverMember.findMany({
    where: { serverId, NOT: { userId: senderId } },
    select: { userId: true, user: { select: { username: true } } },
  });
  if (members.length === 0) return;

  const lastReads = await prisma.lastRead.findMany({
    where: { channelId, userId: { in: members.map((m) => m.userId) } },
    select: { userId: true, readAt: true },
  });
  const readMap = new Map(lastReads.map((lr) => [lr.userId, lr.readAt]));
  const EPOCH = new Date(0);

  // Fetch just the window of messages any member could still have unread.
  let earliest = new Date();
  for (const m of members) {
    const since = readMap.get(m.userId) ?? EPOCH;
    if (since < earliest) earliest = since;
  }
  const unreadWindow = await prisma.message.findMany({
    where: { channelId, createdAt: { gt: earliest } },
    select: { createdAt: true, content: true },
  });

  for (const m of members) {
    const since = readMap.get(m.userId) ?? EPOCH;
    const tag = `@${m.user.username}`;
    let count = 0;
    let mentions = 0;
    for (const msg of unreadWindow) {
      if (msg.createdAt > since) {
        count++;
        if (msg.content.includes(tag)) mentions++;
      }
    }
    if (count > 0) {
      sendToUser(m.userId, { type: "unread_count", channelId, count, mentions });
    }
  }
}

export interface CreateChannelMessageInput {
  channelId: string;
  serverId: string;
  authorId: string;
  content: string;
  replyToId?: string | null;
  /** Client nonce echoed back to the sender for optimistic reconciliation. */
  nonce?: string;
}

/** Create a channel message, broadcast it, and fan out unread counts. */
export async function createChannelMessage(input: CreateChannelMessageInput): Promise<Message> {
  const { channelId, serverId, authorId, content, nonce } = input;

  // A reply must reference a message in the same channel.
  let replyToId: string | null = null;
  if (input.replyToId) {
    const target = await prisma.message.findUnique({
      where: { id: input.replyToId },
      select: { channelId: true },
    });
    if (target?.channelId === channelId) replyToId = input.replyToId;
  }

  const message = await prisma.message.create({
    data: { channelId, authorId, content, replyToId },
    include: MESSAGE_INCLUDE,
  });
  const serialized = serializeMessage(message);

  broadcastToChannel(channelId, {
    type: "message_created",
    message: serialized,
    ...(nonce ? { nonce } : {}),
  });
  await fanOutUnread(channelId, serverId, authorId);

  return serialized;
}
