import { create } from "zustand";

export type UserPresence = "online" | "idle" | "dnd" | "offline";

interface PresenceState {
  onlineUsers: Set<string>;
  /** Presence per user; absent or "offline" means offline */
  statuses: Record<string, UserPresence>;
  typingUsers: Map<string, { username: string; timeout: ReturnType<typeof setTimeout> }>;

  setPresence: (userId: string, status: UserPresence) => void;
  setOnlineUsers: (userIds: string[]) => void;
  setPresences: (statuses: Record<string, UserPresence>) => void;
  addTyping: (channelId: string, userId: string, username: string) => void;
  getTypingUsers: (channelId: string) => string[];
}

// Typing indicators are keyed by "channelId:userId"
export const usePresenceStore = create<PresenceState>()((set, get) => ({
  onlineUsers: new Set<string>(),
  statuses: {},
  typingUsers: new Map(),

  setPresence: (userId, status) =>
    set((s) => {
      const online = new Set(s.onlineUsers);
      const statuses = { ...s.statuses };
      if (status === "offline") {
        online.delete(userId);
        delete statuses[userId];
      } else {
        online.add(userId);
        statuses[userId] = status;
      }
      return { onlineUsers: online, statuses };
    }),

  setOnlineUsers: (userIds) =>
    set((s) => ({
      onlineUsers: new Set(userIds),
      statuses: Object.fromEntries(
        userIds.map((id) => [id, s.statuses[id] ?? "online"])
      ) as Record<string, UserPresence>,
    })),

  setPresences: (statuses) =>
    set({
      statuses,
      onlineUsers: new Set(
        Object.entries(statuses)
          .filter(([, st]) => st !== "offline")
          .map(([id]) => id)
      ),
    }),

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
