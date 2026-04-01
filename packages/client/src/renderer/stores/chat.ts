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

  setServers: (servers: Server[]) => void;
  setChannels: (channels: Channel[]) => void;
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

  setServers: (servers) => set({ servers }),
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
