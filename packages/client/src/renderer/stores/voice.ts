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
  /** Saved volume before muting, for restore on unmute */
  _preMuteVolumes: Record<string, number>;
  /** Internal: set by VoiceSession when LiveKitRoom connects */
  _room: Room | null;

  join: (serverId: string, channelId: string, channelName: string) => Promise<void>;
  disconnect: () => void;
  clearError: () => void;
  setRoom: (room: Room | null) => void;
  setMuted: (muted: boolean) => void;
  toggleMic: () => Promise<void>;
  setParticipantVolume: (identity: string, volume: number) => void;
  muteParticipant: (identity: string) => void;
  unmuteParticipant: (identity: string) => void;
}

export const useVoiceStore = create<VoiceState>()((set, get) => ({
  connection: null,
  joining: false,
  error: "",
  isMuted: false,
  participantVolumes: {},
  _preMuteVolumes: {},
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
    set({ connection: null, error: "", isMuted: false, participantVolumes: {}, _preMuteVolumes: {}, _room: null });
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

  muteParticipant: (identity) => {
    const { participantVolumes, _preMuteVolumes } = get();
    const current = participantVolumes[identity] ?? 1;
    if (current === 0) return; // already muted
    // Save current volume, then set to 0
    get().setParticipantVolume(identity, 0);
    set({ _preMuteVolumes: { ..._preMuteVolumes, [identity]: current } });
  },

  unmuteParticipant: (identity) => {
    const { _preMuteVolumes } = get();
    const restored = _preMuteVolumes[identity] ?? 1;
    get().setParticipantVolume(identity, restored);
    const updated = { ..._preMuteVolumes };
    delete updated[identity];
    set({ _preMuteVolumes: updated });
  },
}));
