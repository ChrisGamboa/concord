import { create } from "zustand";
import { Room, RoomEvent, VideoPresets } from "livekit-client";

interface VoiceState {
  room: Room | null;
  activeChannelId: string | null;
  isConnected: boolean;
  isMicEnabled: boolean;
  isCameraEnabled: boolean;
  isScreenShareEnabled: boolean;

  connect: (url: string, token: string, channelId: string) => Promise<void>;
  disconnect: () => void;
  toggleMic: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
}

export const useVoiceStore = create<VoiceState>()((set, get) => ({
  room: null,
  activeChannelId: null,
  isConnected: false,
  isMicEnabled: false,
  isCameraEnabled: false,
  isScreenShareEnabled: false,

  connect: async (url, token, channelId) => {
    const { room: existing } = get();
    if (existing) {
      existing.disconnect();
    }

    const room = new Room({
      videoCaptureDefaults: {
        resolution: VideoPresets.h1080.resolution,
      },
      publishDefaults: {
        videoCodec: "vp9",
        screenShareEncoding: {
          maxBitrate: 5_000_000,
          maxFramerate: 60,
        },
        videoEncoding: {
          maxBitrate: 5_000_000,
          maxFramerate: 60,
        },
      },
    });

    room.on(RoomEvent.Disconnected, () => {
      set({
        room: null,
        activeChannelId: null,
        isConnected: false,
        isMicEnabled: false,
        isCameraEnabled: false,
        isScreenShareEnabled: false,
      });
    });

    await room.connect(url, token);
    await room.localParticipant.setMicrophoneEnabled(true);

    set({
      room,
      activeChannelId: channelId,
      isConnected: true,
      isMicEnabled: true,
    });
  },

  disconnect: () => {
    const { room } = get();
    if (room) {
      room.disconnect();
    }
    set({
      room: null,
      activeChannelId: null,
      isConnected: false,
      isMicEnabled: false,
      isCameraEnabled: false,
      isScreenShareEnabled: false,
    });
  },

  toggleMic: async () => {
    const { room, isMicEnabled } = get();
    if (!room) return;
    await room.localParticipant.setMicrophoneEnabled(!isMicEnabled);
    set({ isMicEnabled: !isMicEnabled });
  },

  toggleCamera: async () => {
    const { room, isCameraEnabled } = get();
    if (!room) return;
    await room.localParticipant.setCameraEnabled(!isCameraEnabled);
    set({ isCameraEnabled: !isCameraEnabled });
  },

  toggleScreenShare: async () => {
    const { room, isScreenShareEnabled } = get();
    if (!room) return;
    await room.localParticipant.setScreenShareEnabled(!isScreenShareEnabled, {
      resolution: { width: 1920, height: 1080, frameRate: 60 },
      contentHint: "detail",
    });
    set({ isScreenShareEnabled: !isScreenShareEnabled });
  },
}));
