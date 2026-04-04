import { create } from "zustand";
import { api } from "../lib/api";

interface VoiceConnection {
  url: string;
  token: string;
  channelId: string;
  channelName: string;
}

interface VoiceState {
  connection: VoiceConnection | null;
  joining: boolean;
  error: string;

  join: (channelId: string, channelName: string) => Promise<void>;
  disconnect: () => void;
  clearError: () => void;
}

export const useVoiceStore = create<VoiceState>()((set, get) => ({
  connection: null,
  joining: false,
  error: "",

  join: async (channelId, channelName) => {
    set({ joining: true, error: "" });
    try {
      const res = await api.joinVoiceChannel(channelId);
      set({
        connection: {
          url: res.url,
          token: res.token,
          channelId,
          channelName,
        },
        joining: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to join",
        joining: false,
      });
    }
  },

  disconnect: () => {
    set({ connection: null, error: "" });
  },

  clearError: () => set({ error: "" }),
}));
