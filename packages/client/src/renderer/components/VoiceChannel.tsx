import { useCallback, useEffect, useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useParticipants,
  useLocalParticipant,
  useRoomContext,
  useTracks,
  VideoTrack,
} from "@livekit/components-react";
import { Track, VideoPresets } from "livekit-client";
import {
  KrispNoiseFilter,
  isKrispNoiseFilterSupported,
} from "@livekit/krisp-noise-filter";
import { api } from "../lib/api";
import { avatarColor } from "../lib/avatar";

interface VoiceChannelProps {
  channelId: string;
  channelName: string;
}

export function VoiceChannel({ channelId, channelName }: VoiceChannelProps) {
  const [connectionInfo, setConnectionInfo] = useState<{
    url: string;
    token: string;
  } | null>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");

  const handleJoin = useCallback(async () => {
    setJoining(true);
    setError("");
    try {
      const res = await api.joinVoiceChannel(channelId);
      setConnectionInfo({ url: res.url, token: res.token });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join");
    } finally {
      setJoining(false);
    }
  }, [channelId]);

  const handleDisconnect = useCallback(() => {
    setConnectionInfo(null);
  }, []);

  if (!connectionInfo) {
    return (
      <div style={styles.disconnected}>
        <button
          onClick={handleJoin}
          style={styles.joinButton}
          disabled={joining}
        >
          {joining ? "Joining..." : "Join Voice"}
        </button>
        {error && <p style={styles.error}>{error}</p>}
      </div>
    );
  }

  return (
    <LiveKitRoom
      serverUrl={connectionInfo.url}
      token={connectionInfo.token}
      connect={true}
      audio={true}
      video={false}
      onDisconnected={handleDisconnect}
      onError={(err) => {
        console.error("[livekit] error", err);
        // Don't disconnect for non-fatal processor errors
        if (err.message?.includes("Audio context")) return;
        setError(err.message);
        setConnectionInfo(null);
      }}
      options={{
        audioCaptureDefaults: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 2,
          sampleRate: 48000,
        },
        videoCaptureDefaults: {
          resolution: VideoPresets.h1080.resolution,
        },
        publishDefaults: {
          audioPreset: {
            maxBitrate: 128_000,
          },
          dtx: false,
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
      }}
      style={styles.room}
    >
      <VoiceContent
        channelName={channelName}
        onLeave={handleDisconnect}
      />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

function VoiceContent({
  channelName,
  onLeave,
}: {
  channelName: string;
  onLeave: () => void;
}) {
  const room = useRoomContext();
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  // Apply Krisp noise filter after mic track is fully published
  useEffect(() => {
    if (!isKrispNoiseFilterSupported()) return;

    const applyKrisp = async () => {
      const micPub = localParticipant.getTrackPublication(Track.Source.Microphone);
      if (!micPub?.track || micPub.track.getProcessor()) return;
      try {
        // @ts-expect-error -- version mismatch between krisp plugin and livekit-client types
        await micPub.track.setProcessor(KrispNoiseFilter());
        console.log("[krisp] Noise filter enabled");
      } catch {
        // AudioContext not ready yet, retry shortly
        setTimeout(applyKrisp, 500);
      }
    };

    // Small delay to let AudioContext initialize after track publish
    const timer = setTimeout(applyKrisp, 300);
    return () => clearTimeout(timer);
  }, [localParticipant, localParticipant.isMicrophoneEnabled]);

  const videoTracks = useTracks(
    [Track.Source.Camera, Track.Source.ScreenShare],
    { onlySubscribed: false }
  );

  const isMuted = !localParticipant.isMicrophoneEnabled;

  const toggleMic = async () => {
    await localParticipant.setMicrophoneEnabled(isMuted);
  };

  const toggleCamera = async () => {
    const next = !isCameraOn;
    await localParticipant.setCameraEnabled(next);
    setIsCameraOn(next);
  };

  const toggleScreenShare = async () => {
    const next = !isScreenSharing;
    await localParticipant.setScreenShareEnabled(next, {
      resolution: { width: 1920, height: 1080, frameRate: 60 },
      contentHint: "detail",
    });
    setIsScreenSharing(next);
  };

  return (
    <div style={styles.voiceContainer}>
      <div style={styles.header}>
        <span style={styles.channelLabel}>
          Voice Connected - {channelName}
        </span>
      </div>

      {/* Video grid */}
      {videoTracks.length > 0 && (
        <div style={styles.videoGrid}>
          {videoTracks.map((trackRef) => (
            <div
              key={trackRef.publication.trackSid}
              style={styles.videoTile}
            >
              <VideoTrack
                trackRef={trackRef}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                }}
              />
              <span style={styles.videoLabel}>
                {trackRef.participant.name ?? trackRef.participant.identity}
                {trackRef.source === Track.Source.ScreenShare
                  ? " (Screen)"
                  : ""}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Participant list */}
      <div style={styles.participants}>
        {participants.map((p) => (
          <div key={p.identity} style={styles.participant}>
            <div
              style={{
                ...styles.speakingIndicator,
                borderColor: p.isSpeaking
                  ? "var(--success)"
                  : "transparent",
              }}
            >
              <div style={{ ...styles.participantAvatar, background: avatarColor(p.identity) }}>
                {(p.name ?? "?").charAt(0).toUpperCase()}
              </div>
            </div>
            <span
              style={{
                ...styles.participantName,
                color: p.isSpeaking
                  ? "var(--success)"
                  : "var(--text-secondary)",
              }}
            >
              {p.name ?? p.identity}
              {p.identity === localParticipant.identity ? " (You)" : ""}
            </span>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div style={styles.controls}>
        <button
          onClick={toggleMic}
          style={{
            ...styles.controlButton,
            background: !isMuted ? "var(--bg-tertiary)" : "var(--danger)",
          }}
          title={!isMuted ? "Mute" : "Unmute"}
        >
          {!isMuted ? "Mic" : "Muted"}
        </button>
        <button
          onClick={toggleCamera}
          style={{
            ...styles.controlButton,
            background: isCameraOn
              ? "var(--accent)"
              : "var(--bg-tertiary)",
          }}
          title={isCameraOn ? "Turn Off Camera" : "Turn On Camera"}
        >
          Cam
        </button>
        <button
          onClick={toggleScreenShare}
          style={{
            ...styles.controlButton,
            background: isScreenSharing
              ? "var(--accent)"
              : "var(--bg-tertiary)",
          }}
          title={isScreenSharing ? "Stop Sharing" : "Share Screen"}
        >
          Screen
        </button>
        <button
          onClick={onLeave}
          style={{ ...styles.controlButton, background: "var(--danger)" }}
          title="Disconnect"
        >
          Leave
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  disconnected: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "12px",
    background: "var(--bg-chat)",
  },
  joinButton: {
    padding: "12px 24px",
    background: "var(--success)",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "16px",
    fontWeight: 600,
    cursor: "pointer",
  },
  error: {
    color: "var(--danger)",
    fontSize: "13px",
  },
  room: {
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    background: "var(--bg-chat)",
  },
  voiceContainer: {
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    height: "100%",
  },
  header: {
    padding: "12px 16px",
    borderBottom: "1px solid var(--bg-primary)",
    flexShrink: 0,
  },
  channelLabel: {
    color: "var(--success)",
    fontWeight: 600,
    fontSize: "14px",
  },
  videoGrid: {
    flex: 1,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: "4px",
    padding: "8px",
    minHeight: 0,
    overflow: "auto",
  },
  videoTile: {
    position: "relative" as const,
    background: "#000",
    borderRadius: "8px",
    overflow: "hidden",
    aspectRatio: "16/9",
  },
  videoLabel: {
    position: "absolute" as const,
    bottom: "8px",
    left: "8px",
    background: "rgba(0,0,0,0.7)",
    color: "white",
    padding: "2px 8px",
    borderRadius: "4px",
    fontSize: "12px",
  },
  participants: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "8px",
    padding: "12px 16px",
    borderTop: "1px solid var(--bg-primary)",
  },
  participant: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  speakingIndicator: {
    borderRadius: "50%",
    border: "2px solid transparent",
    padding: "2px",
    transition: "border-color 0.15s ease",
  },
  participantAvatar: {
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    background: "var(--accent)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 600,
    fontSize: "13px",
  },
  participantName: {
    fontSize: "13px",
    fontWeight: 500,
  },
  controls: {
    display: "flex",
    justifyContent: "center",
    gap: "8px",
    padding: "12px",
    borderTop: "1px solid var(--bg-primary)",
    flexShrink: 0,
  },
  controlButton: {
    padding: "8px 16px",
    border: "none",
    borderRadius: "20px",
    color: "white",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
  },
};
