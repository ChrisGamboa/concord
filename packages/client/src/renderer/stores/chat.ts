import { create } from "zustand";
import type { Server, Channel, Message, ReactionGroup } from "@concord/shared";

/** A channel message plus client-only optimistic-send state. */
export type ChatMessage = Message & {
  /** Sent but not yet confirmed by the server */
  pending?: boolean;
  /** Send failed (socket closed or no confirmation in time) */
  failed?: boolean;
  /** Client-generated id used to match the server confirmation */
  nonce?: string;
};

interface ChatState {
  servers: Server[];
  channels: Channel[];
  messages: ChatMessage[];
  activeServerId: string | null;
  activeChannelId: string | null;
  hasMoreMessages: boolean;
  messagesLoading: boolean;
  unreadCounts: Record<string, number>;
  /** Unread messages that mention the current user, per channel */
  mentionCounts: Record<string, number>;
  /** Channels/servers the user muted (no notifications, subdued sidebar) */
  mutedChannels: string[];
  mutedServers: string[];
  /** Conversations with DMs received while not viewing them (client-session state) */
  dmUnreadConvIds: string[];
  /** Unread count captured at the moment each channel was opened (drives the NEW divider) */
  channelEntryUnread: Record<string, number>;
  /** False when viewing a historical page (after jump-to-message); live messages are not appended */
  isAtLatest: boolean;
  /** Jump target handed across a channel navigation (e.g. search result in another channel) */
  pendingJump: { channelId: string; messageId: string; createdAt: string } | null;

  setServers: (servers: Server[]) => void;
  setChannels: (channels: Channel[]) => void;
  setUnreadCounts: (counts: Record<string, number>) => void;
  setUnreadCount: (channelId: string, count: number, mentions?: number) => void;
  setMentionCounts: (counts: Record<string, number>) => void;
  setMutes: (mutes: { channels: string[]; servers: string[] }) => void;
  setChannelMuted: (channelId: string, muted: boolean) => void;
  setServerMuted: (serverId: string, muted: boolean) => void;
  addDmUnread: (conversationId: string) => void;
  clearDmUnread: (conversationId: string) => void;
  setChannelEntryUnread: (channelId: string, count: number) => void;
  setMessages: (messages: Message[], hasMore: boolean, isAtLatest?: boolean) => void;
  setPendingJump: (jump: ChatState["pendingJump"]) => void;
  setMessagesLoading: (loading: boolean) => void;
  prependMessages: (messages: Message[], hasMore: boolean) => void;
  addMessage: (message: Message, nonce?: string) => void;
  addPendingMessage: (message: ChatMessage) => void;
  markMessageFailed: (nonce: string) => void;
  markMessagePending: (nonce: string) => void;
  removeMessageByNonce: (nonce: string) => void;
  updateMessage: (message: Message) => void;
  removeMessage: (channelId: string, messageId: string) => void;
  setActiveServer: (serverId: string | null) => void;
  setActiveChannel: (channelId: string | null) => void;
  updateReactions: (messageId: string, reactions: ReactionGroup[]) => void;
}

export const useChatStore = create<ChatState>()((set) => ({
  servers: [],
  channels: [],
  messages: [],
  activeServerId: null,
  activeChannelId: null,
  hasMoreMessages: false,
  messagesLoading: false,
  unreadCounts: {},
  mentionCounts: {},
  mutedChannels: [],
  mutedServers: [],
  dmUnreadConvIds: [],
  channelEntryUnread: {},
  isAtLatest: true,
  pendingJump: null,

  setServers: (servers) => set({ servers }),
  setUnreadCounts: (counts) => set({ unreadCounts: counts }),
  setUnreadCount: (channelId, count, mentions) =>
    set((s) => {
      if (count === 0) {
        const { [channelId]: _, ...restUnread } = s.unreadCounts;
        const { [channelId]: __, ...restMentions } = s.mentionCounts;
        return { unreadCounts: restUnread, mentionCounts: restMentions };
      }
      const next: Partial<ChatState> = {
        unreadCounts: { ...s.unreadCounts, [channelId]: count },
      };
      if (mentions !== undefined) {
        if (mentions === 0) {
          const { [channelId]: _, ...rest } = s.mentionCounts;
          next.mentionCounts = rest;
        } else {
          next.mentionCounts = { ...s.mentionCounts, [channelId]: mentions };
        }
      }
      return next;
    }),
  setMentionCounts: (counts) => set({ mentionCounts: counts }),
  setMutes: (mutes) => set({ mutedChannels: mutes.channels, mutedServers: mutes.servers }),
  setChannelMuted: (channelId, muted) =>
    set((s) => ({
      mutedChannels: muted
        ? [...new Set([...s.mutedChannels, channelId])]
        : s.mutedChannels.filter((id) => id !== channelId),
    })),
  setServerMuted: (serverId, muted) =>
    set((s) => ({
      mutedServers: muted
        ? [...new Set([...s.mutedServers, serverId])]
        : s.mutedServers.filter((id) => id !== serverId),
    })),
  addDmUnread: (conversationId) =>
    set((s) => ({
      dmUnreadConvIds: [...new Set([...s.dmUnreadConvIds, conversationId])],
    })),
  clearDmUnread: (conversationId) =>
    set((s) => ({
      dmUnreadConvIds: s.dmUnreadConvIds.filter((id) => id !== conversationId),
    })),
  setChannelEntryUnread: (channelId, count) =>
    set((s) => ({ channelEntryUnread: { ...s.channelEntryUnread, [channelId]: count } })),
  setChannels: (channels) => set({ channels }),
  setMessages: (messages, hasMore, isAtLatest = true) =>
    set({ messages, hasMoreMessages: hasMore, messagesLoading: false, isAtLatest }),
  setPendingJump: (jump) => set({ pendingJump: jump }),
  setMessagesLoading: (loading) => set({ messagesLoading: loading }),
  prependMessages: (messages, hasMore) =>
    set((s) => ({
      messages: [...messages, ...s.messages],
      hasMoreMessages: hasMore,
    })),
  addMessage: (message, nonce) =>
    set((s) => {
      if (message.channelId !== s.activeChannelId) return s;
      // Viewing history: don't append live messages; the "Jump to present" bar covers catch-up
      if (!s.isAtLatest) return s;
      // Reconcile the sender's optimistic message with the confirmed one
      if (nonce) {
        const idx = s.messages.findIndex((m) => m.nonce === nonce);
        if (idx !== -1) {
          const next = [...s.messages];
          next[idx] = message;
          return { messages: next };
        }
      }
      if (s.messages.some((m) => m.id === message.id)) return s;
      return { messages: [...s.messages, message] };
    }),
  addPendingMessage: (message) =>
    set((s) => {
      if (message.channelId !== s.activeChannelId) return s;
      return { messages: [...s.messages, message] };
    }),
  markMessageFailed: (nonce) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.nonce === nonce ? { ...m, pending: false, failed: true } : m
      ),
    })),
  markMessagePending: (nonce) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.nonce === nonce ? { ...m, pending: true, failed: false } : m
      ),
    })),
  removeMessageByNonce: (nonce) =>
    set((s) => ({
      messages: s.messages.filter((m) => m.nonce !== nonce),
    })),
  updateMessage: (message) =>
    set((s) => ({
      // Merge so fields the payload omits (reactions, pinnedAt) survive an edit broadcast
      messages: s.messages.map((m) => (m.id === message.id ? { ...m, ...message } : m)),
    })),
  removeMessage: (_channelId, messageId) =>
    set((s) => ({
      messages: s.messages.filter((m) => m.id !== messageId),
    })),
  setActiveServer: (serverId) => set({ activeServerId: serverId }),
  setActiveChannel: (channelId) => set({ activeChannelId: channelId }),
  updateReactions: (messageId, reactions) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === messageId ? { ...m, reactions } : m
      ),
    })),
}));
