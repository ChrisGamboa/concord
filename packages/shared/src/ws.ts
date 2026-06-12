import type {
  ChannelId,
  Message,
  MessageId,
  ReactionGroup,
  ServerId,
  UserId,
} from "./types.js";

// ---- WebSocket message protocol ----

/** Presence a user can hold while connected; "offline" is derived from disconnection. */
export type PresenceStatus = "online" | "idle" | "dnd";

/** Direct message payload carried by dm_created/dm_updated. */
export interface DmMessagePayload {
  id: string;
  conversationId: string;
  authorId: string;
  content: string;
  createdAt: string;
  editedAt: string | null;
  reactions?: ReactionGroup[];
  author?: any;
}

// Client -> Server
export type ClientMessage =
  // nonce: client-generated id echoed back in message_created so the sender
  // can reconcile its optimistic (pending) message with the persisted one
  | { type: "send_message"; channelId: ChannelId; content: string; nonce?: string; replyToId?: MessageId }
  | { type: "edit_message"; messageId: MessageId; content: string }
  | { type: "delete_message"; messageId: MessageId }
  | { type: "typing_start"; channelId: ChannelId }
  | { type: "subscribe_channel"; channelId: ChannelId }
  | { type: "unsubscribe_channel"; channelId: ChannelId }
  | { type: "mark_read"; channelId: ChannelId }
  | { type: "toggle_reaction"; messageId: MessageId; emoji: string }
  | { type: "presence_set"; status: PresenceStatus }
  | { type: "dm_typing"; conversationId: string };

// Server -> Client
export type ServerMessage =
  | { type: "message_created"; message: Message; nonce?: string }
  | { type: "message_updated"; message: Message }
  | { type: "message_deleted"; channelId: ChannelId; messageId: MessageId }
  | { type: "typing"; channelId: ChannelId; userId: UserId; username: string }
  | {
      type: "presence_update";
      userId: UserId;
      status: PresenceStatus | "offline";
    }
  | { type: "reaction_update"; channelId: ChannelId; messageId: MessageId; reactions: ReactionGroup[] }
  | { type: "dm_created"; message: DmMessagePayload }
  | { type: "dm_updated"; message: DmMessagePayload }
  | { type: "dm_deleted"; conversationId: string; messageId: string }
  | { type: "dm_reaction_update"; conversationId: string; messageId: string; reactions: ReactionGroup[] }
  | { type: "dm_typing"; conversationId: string; userId: UserId; username: string }
  | { type: "unread_count"; channelId: ChannelId; count: number; mentions?: number }
  | { type: "error"; message: string }
  | { type: "ready"; userId: UserId; sessionId: string };
