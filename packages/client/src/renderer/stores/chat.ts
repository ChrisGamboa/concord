import { create } from "zustand";
import type { Server, Channel, Message } from "@concord/shared";

interface ChatState {
  servers: Server[];
  channels: Channel[];
  messages: Message[];
  activeServerId: string | null;
  activeChannelId: string | null;
  hasMoreMessages: boolean;
  messagesLoading: boolean;
  unreadCounts: Record<string, number>;

  setServers: (servers: Server[]) => void;
  setChannels: (channels: Channel[]) => void;
  setUnreadCounts: (counts: Record<string, number>) => void;
  setUnreadCount: (channelId: string, count: number) => void;
  setMessages: (messages: Message[], hasMore: boolean) => void;
  setMessagesLoading: (loading: boolean) => void;
  prependMessages: (messages: Message[], hasMore: boolean) => void;
  addMessage: (message: Message) => void;
  updateMessage: (message: Message) => void;
  removeMessage: (channelId: string, messageId: string) => void;
  setActiveServer: (serverId: string | null) => void;
  setActiveChannel: (channelId: string | null) => void;
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

  setServers: (servers) => set({ servers }),
  setUnreadCounts: (counts) => set({ unreadCounts: counts }),
  setUnreadCount: (channelId, count) =>
    set((s) => {
      if (count === 0) {
        const { [channelId]: _, ...rest } = s.unreadCounts;
        return { unreadCounts: rest };
      }
      return { unreadCounts: { ...s.unreadCounts, [channelId]: count } };
    }),
  setChannels: (channels) => set({ channels }),
  setMessages: (messages, hasMore) => set({ messages, hasMoreMessages: hasMore, messagesLoading: false }),
  setMessagesLoading: (loading) => set({ messagesLoading: loading }),
  prependMessages: (messages, hasMore) =>
    set((s) => ({
      messages: [...messages, ...s.messages],
      hasMoreMessages: hasMore,
    })),
  addMessage: (message) =>
    set((s) => {
      if (message.channelId !== s.activeChannelId) return s;
      return { messages: [...s.messages, message] };
    }),
  updateMessage: (message) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === message.id ? message : m)),
    })),
  removeMessage: (_channelId, messageId) =>
    set((s) => ({
      messages: s.messages.filter((m) => m.id !== messageId),
    })),
  setActiveServer: (serverId) => set({ activeServerId: serverId }),
  setActiveChannel: (channelId) => set({ activeChannelId: channelId }),
}));
