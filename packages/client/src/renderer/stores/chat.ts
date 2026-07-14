import { create } from "zustand";
import type { Server, Channel, Message, ReactionGroup, DmMessagePayload } from "@concord/shared";
import * as ops from "./messageOps";

/** A channel message plus client-only optimistic-send state. */
export type ChatMessage = Message & ops.OptimisticFields;

/** A direct message plus client-only optimistic-send state. */
export type DmChatMessage = DmMessagePayload & ops.OptimisticFields;

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

  // ---- DM message slice (mirrors the channel slice; only one surface is mounted at a time) ----
  dmMessages: DmChatMessage[];
  activeConversationId: string | null;
  dmHasMore: boolean;
  dmLoading: boolean;
  dmIsAtLatest: boolean;

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

  // ---- DM message slice actions ----
  setActiveConversation: (conversationId: string | null) => void;
  setDmMessages: (messages: DmMessagePayload[], hasMore: boolean, isAtLatest?: boolean) => void;
  setDmMessagesLoading: (loading: boolean) => void;
  prependDmMessages: (messages: DmMessagePayload[], hasMore: boolean) => void;
  addDmMessage: (message: DmMessagePayload, nonce?: string) => void;
  addPendingDmMessage: (message: DmChatMessage) => void;
  markDmMessageFailed: (nonce: string) => void;
  markDmMessagePending: (nonce: string) => void;
  removeDmMessageByNonce: (nonce: string) => void;
  updateDmMessage: (message: DmMessagePayload) => void;
  removeDmMessage: (messageId: string) => void;
  updateDmReactions: (messageId: string, reactions: ReactionGroup[]) => void;
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

  dmMessages: [],
  activeConversationId: null,
  dmHasMore: false,
  dmLoading: false,
  dmIsAtLatest: true,

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
      messages: ops.prepend(s.messages, messages as ChatMessage[]),
      hasMoreMessages: hasMore,
    })),
  addMessage: (message, nonce) =>
    set((s) => {
      if (message.channelId !== s.activeChannelId) return s;
      // Viewing history: don't append live messages; the "Jump to present" bar covers catch-up
      if (!s.isAtLatest) return s;
      return { messages: ops.reconcile(s.messages, message as ChatMessage, nonce) };
    }),
  addPendingMessage: (message) =>
    set((s) => {
      if (message.channelId !== s.activeChannelId) return s;
      return { messages: [...s.messages, message] };
    }),
  markMessageFailed: (nonce) => set((s) => ({ messages: ops.markFailed(s.messages, nonce) })),
  markMessagePending: (nonce) => set((s) => ({ messages: ops.markPending(s.messages, nonce) })),
  removeMessageByNonce: (nonce) => set((s) => ({ messages: ops.removeByNonce(s.messages, nonce) })),
  updateMessage: (message) => set((s) => ({ messages: ops.merge(s.messages, message as ChatMessage) })),
  removeMessage: (_channelId, messageId) => set((s) => ({ messages: ops.removeById(s.messages, messageId) })),
  setActiveServer: (serverId) => set({ activeServerId: serverId }),
  setActiveChannel: (channelId) => set({ activeChannelId: channelId }),
  updateReactions: (messageId, reactions) => set((s) => ({ messages: ops.setReactions(s.messages, messageId, reactions) })),

  // ---- DM message slice ----
  setActiveConversation: (conversationId) => set({ activeConversationId: conversationId }),
  setDmMessages: (messages, hasMore, isAtLatest = true) =>
    set({ dmMessages: messages as DmChatMessage[], dmHasMore: hasMore, dmLoading: false, dmIsAtLatest: isAtLatest }),
  setDmMessagesLoading: (loading) => set({ dmLoading: loading }),
  prependDmMessages: (messages, hasMore) =>
    set((s) => ({
      dmMessages: ops.prepend(s.dmMessages, messages as DmChatMessage[]),
      dmHasMore: hasMore,
    })),
  addDmMessage: (message, nonce) =>
    set((s) => {
      if (message.conversationId !== s.activeConversationId) return s;
      if (!s.dmIsAtLatest) return s;
      return { dmMessages: ops.reconcile(s.dmMessages, message as DmChatMessage, nonce) };
    }),
  addPendingDmMessage: (message) =>
    set((s) => {
      if (message.conversationId !== s.activeConversationId) return s;
      return { dmMessages: [...s.dmMessages, message] };
    }),
  markDmMessageFailed: (nonce) => set((s) => ({ dmMessages: ops.markFailed(s.dmMessages, nonce) })),
  markDmMessagePending: (nonce) => set((s) => ({ dmMessages: ops.markPending(s.dmMessages, nonce) })),
  removeDmMessageByNonce: (nonce) => set((s) => ({ dmMessages: ops.removeByNonce(s.dmMessages, nonce) })),
  updateDmMessage: (message) => set((s) => ({ dmMessages: ops.merge(s.dmMessages, message as DmChatMessage) })),
  removeDmMessage: (messageId) => set((s) => ({ dmMessages: ops.removeById(s.dmMessages, messageId) })),
  updateDmReactions: (messageId, reactions) => set((s) => ({ dmMessages: ops.setReactions(s.dmMessages, messageId, reactions) })),
}));
