import { create } from "zustand";
import type { Room } from "livekit-client";
import { api } from "../lib/api";

interface VoiceConnection {
  url: string;
  token: string;
  serverId: string;
  channelId: string;
  channelName: string;
}

interface VoiceState {
  connection: VoiceConnection | null;
  joining: boolean;
  error: string;
  isMuted: boolean;
  /** Per-participant volume (0-1), keyed by participant identity */
  participantVolumes: Record<string, number>;
  /** Internal: set by VoiceSession when LiveKitRoom connects */
  _room: Room | null;

  join: (serverId: string, channelId: string, channelName: string) => Promise<void>;
  disconnect: () => void;
  clearError: () => void;
  setRoom: (room: Room | null) => void;
  setMuted: (muted: boolean) => void;
  toggleMic: () => Promise<void>;
  setParticipantVolume: (identity: string, volume: number) => void;
}

export const useVoiceStore = create<VoiceState>()((set, get) => ({
  connection: null,
  joining: false,
  error: "",
  isMuted: false,
  participantVolumes: {},
  _room: null,

  join: async (serverId, channelId, channelName) => {
    set({ joining: true, error: "" });
    try {
      const res = await api.joinVoiceChannel(channelId);
      set({
        connection: {
          url: res.url,
          token: res.token,
          serverId,
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
    set({ connection: null, error: "", isMuted: false, participantVolumes: {}, _room: null });
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

  setParticipantVolume: (identity, volume) => {
    const { _room, participantVolumes } = get();
    // Apply to LiveKit participant
    if (_room) {
      for (const p of _room.remoteParticipants.values()) {
        if (p.identity === identity) {
          p.setVolume(volume);
          break;
        }
      }
    }
    set({ participantVolumes: { ...participantVolumes, [identity]: volume } });
  },
}));
