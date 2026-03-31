import { useCallback } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useParticipants,
  useLocalParticipant,
  useTracks,
  VideoTrack,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { useVoiceStore } from "../stores/voice";
import { api } from "../lib/api";

interface VoiceChannelProps {
  channelId: string;
  channelName: string;
}

export function VoiceChannel({ channelId, channelName }: VoiceChannelProps) {
  const { room, isConnected, activeChannelId } = useVoiceStore();
  const connect = useVoiceStore((s) => s.connect);
  const disconnect = useVoiceStore((s) => s.disconnect);

  const isInThisChannel = isConnected && activeChannelId === channelId;

  const handleJoin = useCallback(async () => {
    const res = await api.joinVoiceChannel(channelId);
    await connect(res.url, res.token, channelId);
  }, [channelId, connect]);

  if (!isInThisChannel) {
    return (
      <div style={styles.disconnected}>
        <button onClick={handleJoin} style={styles.joinButton}>
          Join Voice
        </button>
      </div>
    );
  }

  return (
    <LiveKitRoom
      room={room!}
      serverUrl=""
      token=""
      connect={false}
      style={styles.room}
    >
      <VoiceContent channelName={channelName} />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

function VoiceContent({ channelName }: { channelName: string }) {
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();
  const disconnect = useVoiceStore((s) => s.disconnect);
  const toggleMic = useVoiceStore((s) => s.toggleMic);
  const toggleCamera = useVoiceStore((s) => s.toggleCamera);
  const toggleScreenShare = useVoiceStore((s) => s.toggleScreenShare);
  const isMicEnabled = useVoiceStore((s) => s.isMicEnabled);
  const isCameraEnabled = useVoiceStore((s) => s.isCameraEnabled);
  const isScreenShareEnabled = useVoiceStore((s) => s.isScreenShareEnabled);

  // Get all video/screen share tracks for display
  const videoTracks = useTracks(
    [Track.Source.Camera, Track.Source.ScreenShare],
    { onlySubscribed: true }
  );

  return (
    <div style={styles.voiceContainer}>
      <div style={styles.header}>
        <span style={styles.channelLabel}>Voice Connected - {channelName}</span>
      </div>

      {/* Video grid */}
      {videoTracks.length > 0 && (
        <div style={styles.videoGrid}>
          {videoTracks.map((trackRef) => (
            <div key={trackRef.publication.trackSid} style={styles.videoTile}>
              <VideoTrack
                trackRef={trackRef}
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
              <span style={styles.videoLabel}>
                {trackRef.participant.name ?? trackRef.participant.identity}
                {trackRef.source === Track.Source.ScreenShare ? " (Screen)" : ""}
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
              <div style={styles.participantAvatar}>
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
            background: isMicEnabled ? "var(--bg-tertiary)" : "var(--danger)",
          }}
          title={isMicEnabled ? "Mute" : "Unmute"}
        >
          {isMicEnabled ? "Mic" : "Muted"}
        </button>
        <button
          onClick={toggleCamera}
          style={{
            ...styles.controlButton,
            background: isCameraEnabled ? "var(--accent)" : "var(--bg-tertiary)",
          }}
          title={isCameraEnabled ? "Turn Off Camera" : "Turn On Camera"}
        >
          Cam
        </button>
        <button
          onClick={toggleScreenShare}
          style={{
            ...styles.controlButton,
            background: isScreenShareEnabled
              ? "var(--accent)"
              : "var(--bg-tertiary)",
          }}
          title={isScreenShareEnabled ? "Stop Sharing" : "Share Screen"}
        >
          Screen
        </button>
        <button
          onClick={disconnect}
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
    alignItems: "center",
    justifyContent: "center",
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
