import { create } from "zustand";
import type { Room } from "livekit-client";
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
  isMuted: boolean;
  /** Internal: set by VoiceSession when LiveKitRoom connects */
  _room: Room | null;

  join: (channelId: string, channelName: string) => Promise<void>;
  disconnect: () => void;
  clearError: () => void;
  setRoom: (room: Room | null) => void;
  setMuted: (muted: boolean) => void;
  toggleMic: () => Promise<void>;
}

export const useVoiceStore = create<VoiceState>()((set, get) => ({
  connection: null,
  joining: false,
  error: "",
  isMuted: false,
  _room: null,

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
    set({ connection: null, error: "", isMuted: false, _room: null });
  },

  clearError: () => set({ error: "" }),

  setRoom: (room) => set({ _room: room }),

  setMuted: (muted) => set({ isMuted: muted }),

  toggleMic: async () => {
    const { _room, isMuted } = get();
    if (!_room) return;
    await _room.localParticipant.setMicrophoneEnabled(isMuted);
    set({ isMuted: !isMuted });
  },
}));
