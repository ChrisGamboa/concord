import { useCallback, useEffect, useRef, useState } from "react";
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

// ---- SVG Icons (inline, no dependency) ----
const Icon = ({ d, size = 20, color = "currentColor" }: { d: string; size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const MicIcon = () => <Icon d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />;
const MicOffIcon = () => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="1" y1="1" x2="23" y2="23" />
    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.13 1.49-.35 2.17" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);
const CameraIcon = () => <Icon d="M23 7l-7 5 7 5V7zM1 5h15a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H1a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />;
const CameraOffIcon = () => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="1" y1="1" x2="23" y2="23" />
    <path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34m-7.72-2.06a4 4 0 1 1-5.56-5.56" />
  </svg>
);
const ScreenIcon = () => <Icon d="M2 3h20v14H2zM8 21h8M12 17v4" />;
const PhoneOffIcon = () => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
    <line x1="23" y1="1" x2="1" y2="23" />
  </svg>
);

function useCallTimer() {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
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
  const callTime = useCallTimer();

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
        {participants.map((p) => {
          const isMicMuted = !p.isMicrophoneEnabled;
          const isLocal = p.identity === localParticipant.identity;
          return (
            <div key={p.identity} style={styles.participant}>
              <div
                style={{
                  ...styles.speakingIndicator,
                  borderColor: p.isSpeaking ? "var(--success)" : "transparent",
                }}
              >
                <div style={{ ...styles.participantAvatar, background: avatarColor(p.identity) }}>
                  {(p.name ?? "?").charAt(0).toUpperCase()}
                </div>
              </div>
              <span
                style={{
                  ...styles.participantName,
                  color: p.isSpeaking ? "var(--success)" : "var(--text-secondary)",
                }}
              >
                {p.name ?? p.identity}
                {isLocal ? " (You)" : ""}
              </span>
              {isMicMuted && (
                <span style={styles.mutedBadge} title="Muted">
                  <MicOffIcon />
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Controls */}
      <div style={styles.controlBar}>
        <div style={styles.controlBarInfo}>
          <span style={styles.callTimer}>{callTime}</span>
          <span style={styles.callChannel}>{channelName}</span>
        </div>

        <div style={styles.controls}>
          <button
            className="hover-brighten"
            onClick={toggleMic}
            style={{
              ...styles.controlCircle,
              background: !isMuted ? "var(--bg-tertiary)" : "var(--danger)",
            }}
            title={!isMuted ? "Mute" : "Unmute"}
          >
            {!isMuted ? <MicIcon /> : <MicOffIcon />}
          </button>
          <button
            className="hover-brighten"
            onClick={toggleCamera}
            style={{
              ...styles.controlCircle,
              background: isCameraOn ? "var(--accent)" : "var(--bg-tertiary)",
            }}
            title={isCameraOn ? "Turn Off Camera" : "Turn On Camera"}
          >
            {isCameraOn ? <CameraIcon /> : <CameraOffIcon />}
          </button>
          <button
            className="hover-brighten"
            onClick={toggleScreenShare}
            style={{
              ...styles.controlCircle,
              background: isScreenSharing ? "var(--accent)" : "var(--bg-tertiary)",
            }}
            title={isScreenSharing ? "Stop Sharing" : "Share Screen"}
          >
            <ScreenIcon />
          </button>

          <div style={styles.controlDivider} />

          <button
            className="hover-brighten"
            onClick={onLeave}
            style={{
              ...styles.leaveButton,
            }}
            title="Disconnect"
          >
            <PhoneOffIcon />
            <span>Leave</span>
          </button>
        </div>
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
  mutedBadge: {
    color: "var(--text-muted)",
    display: "flex",
    alignItems: "center",
    opacity: 0.6,
    marginLeft: "-2px",
  },
  controlBar: {
    borderTop: "1px solid var(--bg-primary)",
    background: "var(--bg-secondary)",
    padding: "12px 16px",
    flexShrink: 0,
  },
  controlBarInfo: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: "8px",
    marginBottom: "10px",
  },
  callTimer: {
    fontSize: "13px",
    fontWeight: 600,
    color: "var(--success)",
    fontVariantNumeric: "tabular-nums",
  },
  callChannel: {
    fontSize: "12px",
    color: "var(--text-muted)",
  },
  controls: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: "8px",
  },
  controlCircle: {
    width: "44px",
    height: "44px",
    borderRadius: "50%",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "white",
    transition: "background 0.15s ease, transform 0.1s ease",
  },
  controlDivider: {
    width: "1px",
    height: "28px",
    background: "var(--border)",
    margin: "0 4px",
  },
  leaveButton: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "10px 20px",
    borderRadius: "22px",
    border: "none",
    cursor: "pointer",
    background: "var(--danger)",
    color: "white",
    fontSize: "13px",
    fontWeight: 600,
    transition: "background 0.15s ease",
  },
};
