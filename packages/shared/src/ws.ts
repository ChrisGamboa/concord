import type {
  ChannelId,
  Message,
  MessageId,
  ReactionGroup,
  ServerId,
  UserId,
} from "./types.js";

// ---- WebSocket message protocol ----

// Client -> Server
export type ClientMessage =
  | { type: "send_message"; channelId: ChannelId; content: string }
  | { type: "edit_message"; messageId: MessageId; content: string }
  | { type: "delete_message"; messageId: MessageId }
  | { type: "typing_start"; channelId: ChannelId }
  | { type: "subscribe_channel"; channelId: ChannelId }
  | { type: "unsubscribe_channel"; channelId: ChannelId }
  | { type: "mark_read"; channelId: ChannelId }
  | { type: "toggle_reaction"; messageId: MessageId; emoji: string };

// Server -> Client
export type ServerMessage =
  | { type: "message_created"; message: Message }
  | { type: "message_updated"; message: Message }
  | { type: "message_deleted"; channelId: ChannelId; messageId: MessageId }
  | { type: "typing"; channelId: ChannelId; userId: UserId; username: string }
  | {
      type: "presence_update";
      userId: UserId;
      status: "online" | "offline";
    }
  | { type: "reaction_update"; channelId: ChannelId; messageId: MessageId; reactions: ReactionGroup[] }
  | { type: "dm_created"; message: { id: string; conversationId: string; authorId: string; content: string; createdAt: string; author?: any } }
  | { type: "unread_count"; channelId: ChannelId; count: number }
  | { type: "error"; message: string }
  | { type: "ready"; userId: UserId; sessionId: string };
