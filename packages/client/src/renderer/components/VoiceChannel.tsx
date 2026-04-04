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
import { avatarColor, avatarUrl } from "../lib/avatar";
import { playJoinSelf, playDisconnect, playUserJoined, playUserLeft } from "../lib/sounds";
import { createRnnoiseTrack } from "../lib/rnnoise-processor";
import { useVoiceStore } from "../stores/voice";
import type { RemoteParticipant } from "livekit-client";

/** Extract avatar URL from LiveKit participant metadata */
function getParticipantAvatar(metadata?: string): string | null {
  if (!metadata) return null;
  try {
    const data = JSON.parse(metadata);
    return avatarUrl(data.avatarUrl) ?? null;
  } catch {
    return null;
  }
}

// ---- Join prompt: shown when viewing a voice channel you're not connected to ----

export function VoiceJoinPrompt({
  serverId,
  channelId,
  channelName,
}: {
  serverId: string;
  channelId: string;
  channelName: string;
}) {
  const { join, joining, error } = useVoiceStore();

  return (
    <div style={styles.disconnected}>
      <button
        onClick={() => join(serverId, channelId, channelName)}
        style={styles.joinButton}
        disabled={joining}
      >
        {joining ? "Joining..." : "Join Voice"}
      </button>
      {error && <p style={styles.error}>{error}</p>}
    </div>
  );
}

// ---- Persistent voice session: always mounted in AppLayout when connected ----

export function VoiceSession({ isViewing }: { isViewing: boolean }) {
  const connection = useVoiceStore((s) => s.connection);
  const disconnect = useVoiceStore((s) => s.disconnect);

  const handleDisconnect = useCallback(() => {
    disconnect();
    playDisconnect();
  }, [disconnect]);

  if (!connection) return null;

  return (
    <LiveKitRoom
      serverUrl={connection.url}
      token={connection.token}
      connect={true}
      audio={true}
      video={false}
      onConnected={() => playJoinSelf()}
      onDisconnected={handleDisconnect}
      onError={(err) => {
        console.error("[livekit] error", err);
        if (err.message?.includes("Audio context")) return;
        disconnect();
      }}
      options={{
        audioCaptureDefaults: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: false,
          channelCount: 2,
          sampleRate: 48000,
        },
        videoCaptureDefaults: {
          resolution: VideoPresets.h1080.resolution,
        },
        publishDefaults: {
          audioPreset: { maxBitrate: 128_000 },
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
      style={isViewing ? styles.room : styles.roomHidden}
    >
      <VoiceStoreSync />
      <RoomAudioRenderer />
      {isViewing && (
        <VoiceContent
          channelName={connection.channelName}
          onLeave={handleDisconnect}
        />
      )}
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

/** Syncs LiveKit room state to the voice store so components outside LiveKitRoom can read/control it */
function VoiceStoreSync() {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const setRoom = useVoiceStore((s) => s.setRoom);
  const setMuted = useVoiceStore((s) => s.setMuted);

  useEffect(() => {
    setRoom(room);
    return () => setRoom(null);
  }, [room, setRoom]);

  useEffect(() => {
    setMuted(!localParticipant.isMicrophoneEnabled);
  }, [localParticipant.isMicrophoneEnabled, setMuted]);

  return null;
}

function useCallTimer() {
  const joinedAt = useVoiceStore((s) => s.joinedAt);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!joinedAt) return;
    // Immediately compute current elapsed time
    setElapsed(Math.floor((Date.now() - joinedAt) / 1000));
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - joinedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [joinedAt]);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

// ---- Right-click volume menu for participants ----

function useParticipantContextMenu() {
  const [menu, setMenu] = useState<{ identity: string; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!menu) return;
    // Delay listener registration so the opening right-click doesn't immediately close it
    const timer = setTimeout(() => {
      const close = () => setMenu(null);
      window.addEventListener("click", close, { once: true });
      window.addEventListener("contextmenu", close, { once: true });
    }, 0);
    return () => clearTimeout(timer);
  }, [menu]);

  const onContextMenu = useCallback((e: React.MouseEvent, identity: string) => {
    e.preventDefault();
    setMenu({ identity, x: e.clientX, y: e.clientY });
  }, []);

  return { menu, onContextMenu, closeMenu: () => setMenu(null) };
}

function ParticipantVolumeMenu({
  identity,
  name,
  x,
  y,
}: {
  identity: string;
  name: string;
  x: number;
  y: number;
}) {
  const volume = useVoiceStore((s) => s.participantVolumes[identity] ?? 1);
  const setVolume = useVoiceStore((s) => s.setParticipantVolume);
  const mute = useVoiceStore((s) => s.muteParticipant);
  const unmute = useVoiceStore((s) => s.unmuteParticipant);
  const menuRef = useRef<HTMLDivElement>(null);

  // Adjust position so menu doesn't go off-screen
  const [pos, setPos] = useState({ left: x, top: y });
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const left = Math.min(x, window.innerWidth - rect.width - 8);
      const top = Math.min(y, window.innerHeight - rect.height - 8);
      setPos({ left, top });
    }
  }, [x, y]);

  return (
    <div
      ref={menuRef}
      className="voice-ctx-menu"
      style={{ left: pos.left, top: pos.top }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="voice-ctx-header">{name}</div>
      <div className="voice-ctx-row">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          {volume > 0 && <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />}
          {volume > 0.5 && <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />}
        </svg>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={volume}
          onChange={(e) => setVolume(identity, parseFloat(e.target.value))}
          className="voice-volume-slider"
        />
        <span className="voice-ctx-pct">{Math.round(volume * 100)}%</span>
      </div>
      <button
        className="voice-ctx-mute"
        onClick={() => volume === 0 ? unmute(identity) : mute(identity)}
      >
        {volume === 0 ? (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            </svg>
            Unmute
          </>
        ) : (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
            Mute
          </>
        )}
      </button>
    </div>
  );
}

// ---- Full voice UI (rendered inside LiveKitRoom when viewing the channel) ----

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
  const { menu: volumeMenu, onContextMenu: onParticipantRightClick } = useParticipantContextMenu();

  // Track participant join/leave for sound effects
  const prevParticipantIds = useRef<Set<string>>(new Set());
  const initialLoadDone = useRef(false);

  useEffect(() => {
    const currentIds = new Set(participants.map((p) => p.identity));

    if (!initialLoadDone.current) {
      initialLoadDone.current = true;
      prevParticipantIds.current = currentIds;
      return;
    }

    const prev = prevParticipantIds.current;

    for (const id of currentIds) {
      if (!prev.has(id) && id !== localParticipant.identity) {
        playUserJoined();
        break;
      }
    }

    for (const id of prev) {
      if (!currentIds.has(id) && id !== localParticipant.identity) {
        playUserLeft();
        break;
      }
    }

    prevParticipantIds.current = currentIds;
  }, [participants, localParticipant.identity]);

  // Apply stored volume levels to remote participants
  const participantVolumes = useVoiceStore((s) => s.participantVolumes);
  useEffect(() => {
    for (const p of participants) {
      if (p.identity === localParticipant.identity) continue;
      const stored = participantVolumes[p.identity];
      if (stored !== undefined) {
        (p as RemoteParticipant).setVolume?.(stored);
      }
    }
  }, [participants, participantVolumes, localParticipant.identity]);

  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const callTime = useCallTimer();

  // Apply RNNoise to microphone track for noise suppression
  const rnnoiseCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!localParticipant.isMicrophoneEnabled) return;
    let cancelled = false;

    const applyRnnoise = async () => {
      const micPub = localParticipant.getTrackPublication(Track.Source.Microphone);
      const mediaTrack = micPub?.track?.mediaStreamTrack;
      if (!mediaTrack || cancelled) return;

      try {
        rnnoiseCleanupRef.current?.();

        const { processedTrack, cleanup } = await createRnnoiseTrack(mediaTrack);
        if (cancelled) { cleanup(); return; }

        rnnoiseCleanupRef.current = cleanup;
        await micPub!.track!.replaceTrack(processedTrack);
        console.log("[rnnoise] Noise suppression enabled");
      } catch (err) {
        console.warn("[rnnoise] Failed to enable noise suppression:", err);
      }
    };

    const timer = setTimeout(applyRnnoise, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [localParticipant, localParticipant.isMicrophoneEnabled]);

  useEffect(() => {
    return () => { rnnoiseCleanupRef.current?.(); };
  }, []);

  const allVideoTracks = useTracks(
    [Track.Source.Camera, Track.Source.ScreenShare],
    { onlySubscribed: false }
  );
  const videoTracks = allVideoTracks.filter((t) => !t.publication.isMuted);

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
    try {
      await localParticipant.setScreenShareEnabled(next, {
        resolution: { width: 1920, height: 1080, frameRate: 60 },
        contentHint: "detail",
      });
      setIsScreenSharing(next);
    } catch {
      // User cancelled the picker
    }
  };

  const hasVideo = videoTracks.length > 0;

  return (
    <div style={styles.voiceContainer}>
      {hasVideo ? (
        <>
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

          <div style={styles.participantStrip}>
            {participants.map((p) => {
              const isBot = p.identity === "concord-music-bot";
              const isMicMuted = !isBot && !p.isMicrophoneEnabled;
              const isLocal = p.identity === localParticipant.identity;
              return (
                <div
                  key={p.identity}
                  style={styles.participantCompact}
                  onContextMenu={!isLocal ? (e) => onParticipantRightClick(e, p.identity) : undefined}
                >
                  <div
                    style={{
                      ...styles.speakingIndicator,
                      borderColor: p.isSpeaking ? "var(--success)" : "transparent",
                    }}
                  >
                    {!isBot && getParticipantAvatar(p.metadata) ? (
                      <img
                        style={{ ...styles.participantAvatarSmall, objectFit: "cover" }}
                        src={getParticipantAvatar(p.metadata)!}
                        alt=""
                      />
                    ) : (
                      <div style={{ ...styles.participantAvatarSmall, background: isBot ? "#57f287" : avatarColor(p.identity) }}>
                        {isBot ? "M" : (p.name ?? "?").charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <span
                    style={{
                      ...styles.participantNameSmall,
                      color: p.isSpeaking ? "var(--success)" : isBot ? "var(--success)" : "var(--text-secondary)",
                    }}
                  >
                    {isBot ? "Music Bot" : (p.name ?? p.identity)}
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
        </>
      ) : (
        <div style={styles.audioCenter}>
          <div style={styles.audioCenterInner}>
            {participants.map((p) => {
              const isBot = p.identity === "concord-music-bot";
              const isMicMuted = !isBot && !p.isMicrophoneEnabled;
              const isLocal = p.identity === localParticipant.identity;
              return (
                <div
                  key={p.identity}
                  style={styles.participantCard}
                  onContextMenu={!isLocal ? (e) => onParticipantRightClick(e, p.identity) : undefined}
                >
                  <div
                    style={{
                      ...styles.speakingRing,
                      boxShadow: p.isSpeaking
                        ? "0 0 0 3px var(--success)"
                        : "none",
                    }}
                  >
                    {!isBot && getParticipantAvatar(p.metadata) ? (
                      <img
                        style={{ ...styles.participantAvatarLarge, objectFit: "cover" }}
                        src={getParticipantAvatar(p.metadata)!}
                        alt=""
                      />
                    ) : (
                      <div
                        style={{
                          ...styles.participantAvatarLarge,
                          background: isBot ? "#57f287" : avatarColor(p.identity),
                        }}
                      >
                        {isBot ? "M" : (p.name ?? "?").charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <span
                    style={{
                      ...styles.participantCardName,
                      color: p.isSpeaking
                        ? "var(--success)"
                        : isBot
                          ? "var(--success)"
                          : "var(--text-primary)",
                    }}
                  >
                    {isBot ? "Music Bot" : (p.name ?? p.identity)}
                    {isLocal ? " (You)" : ""}
                  </span>
                  {isMicMuted && (
                    <span style={styles.mutedLabel}>
                      <MicOffIcon /> Muted
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

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
            style={styles.leaveButton}
            title="Disconnect"
          >
            <PhoneOffIcon />
            <span>Leave</span>
          </button>
        </div>
      </div>

      {/* Right-click volume menu */}
      {volumeMenu && (() => {
        const p = participants.find((p) => p.identity === volumeMenu.identity);
        if (!p) return null;
        const isBot = p.identity === "concord-music-bot";
        return (
          <ParticipantVolumeMenu
            identity={volumeMenu.identity}
            name={isBot ? "Music Bot" : (p.name ?? p.identity)}
            x={volumeMenu.x}
            y={volumeMenu.y}
          />
        );
      })()}
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
    minHeight: 0,
    overflow: "hidden",
  },
  roomHidden: {
    position: "fixed" as const,
    width: "1px",
    height: "1px",
    overflow: "hidden",
    opacity: 0,
    pointerEvents: "none" as const,
  },
  voiceContainer: {
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    height: "100%",
    minHeight: 0,
    overflow: "hidden",
  },

  // Audio-only mode
  audioCenter: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 0,
  },
  audioCenterInner: {
    display: "flex",
    flexWrap: "wrap" as const,
    justifyContent: "center",
    alignItems: "center",
    gap: "24px",
    padding: "24px",
    maxWidth: "600px",
  },
  participantCard: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: "8px",
    width: "100px",
  },
  speakingRing: {
    borderRadius: "50%",
    overflow: "hidden",
    transition: "box-shadow 0.2s ease",
  },
  participantAvatarLarge: {
    width: "72px",
    height: "72px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    fontSize: "28px",
    color: "white",
  },
  participantCardName: {
    fontSize: "13px",
    fontWeight: 600,
    textAlign: "center" as const,
    lineHeight: "1.2",
    wordBreak: "break-word" as const,
  },
  mutedLabel: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    fontSize: "11px",
    color: "var(--text-muted)",
    opacity: 0.7,
  },

  // Video mode
  videoGrid: {
    flex: 1,
    minHeight: 0,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: "4px",
    padding: "8px",
    overflowY: "auto" as const,
    alignContent: "center",
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
  participantStrip: {
    display: "flex",
    flexWrap: "wrap" as const,
    justifyContent: "center",
    gap: "8px",
    padding: "8px 16px",
    borderTop: "1px solid var(--bg-primary)",
    flexShrink: 0,
  },
  participantCompact: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  speakingIndicator: {
    borderRadius: "50%",
    border: "2px solid transparent",
    padding: "2px",
    transition: "border-color 0.15s ease",
  },
  participantAvatarSmall: {
    width: "28px",
    height: "28px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 600,
    fontSize: "12px",
    color: "white",
  },
  participantNameSmall: {
    fontSize: "12px",
    fontWeight: 500,
  },
  mutedBadge: {
    color: "var(--text-muted)",
    display: "flex",
    alignItems: "center",
    opacity: 0.6,
    marginLeft: "-2px",
  },

  // Controls
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
