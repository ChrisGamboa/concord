import { create } from "zustand";

interface PresenceState {
  onlineUsers: Set<string>;
  typingUsers: Map<string, { username: string; timeout: ReturnType<typeof setTimeout> }>;

  setUserOnline: (userId: string) => void;
  setUserOffline: (userId: string) => void;
  setOnlineUsers: (userIds: string[]) => void;
  addTyping: (channelId: string, userId: string, username: string) => void;
  getTypingUsers: (channelId: string) => string[];
}

// Typing indicators are keyed by "channelId:userId"
export const usePresenceStore = create<PresenceState>()((set, get) => ({
  onlineUsers: new Set<string>(),
  typingUsers: new Map(),

  setUserOnline: (userId) =>
    set((s) => {
      const next = new Set(s.onlineUsers);
      next.add(userId);
      return { onlineUsers: next };
    }),

  setUserOffline: (userId) =>
    set((s) => {
      const next = new Set(s.onlineUsers);
      next.delete(userId);
      return { onlineUsers: next };
    }),

  setOnlineUsers: (userIds) =>
    set({ onlineUsers: new Set(userIds) }),

  addTyping: (channelId, userId, username) => {
    const key = `${channelId}:${userId}`;
    const { typingUsers } = get();

    // Clear existing timeout for this user
    const existing = typingUsers.get(key);
    if (existing) clearTimeout(existing.timeout);

    // Auto-clear after 3 seconds
    const timeout = setTimeout(() => {
      set((s) => {
        const next = new Map(s.typingUsers);
        next.delete(key);
        return { typingUsers: next };
      });
    }, 3000);

    set((s) => {
      const next = new Map(s.typingUsers);
      next.set(key, { username, timeout });
      return { typingUsers: next };
    });
  },

  getTypingUsers: (channelId) => {
    const { typingUsers } = get();
    const result: string[] = [];
    for (const [key, val] of typingUsers) {
      if (key.startsWith(`${channelId}:`)) {
        result.push(val.username);
      }
    }
    return result;
  },
}));
