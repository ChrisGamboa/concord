import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useChatStore } from "../stores/chat";
import { useVoiceStore } from "../stores/voice";
import { ChannelType, type VoiceParticipant } from "@concord/shared";
import { api } from "../lib/api";
import { playDisconnect } from "../lib/sounds";

export function ChannelSidebar() {
  const channels = useChatStore((s) => s.channels);
  const { serverId, channelId } = useParams();
  const navigate = useNavigate();
  const servers = useChatStore((s) => s.servers);
  const server = servers.find((s) => s.id === serverId);

  const setChannels = useChatStore((s) => s.setChannels);
  const [copied, setCopied] = useState(false);
  const [creatingChannel, setCreatingChannel] = useState<"text" | "voice" | null>(null);
  const [newChannelName, setNewChannelName] = useState("");
  const voiceConnection = useVoiceStore((s) => s.connection);
  const voiceDisconnect = useVoiceStore((s) => s.disconnect);
  const voiceMuted = useVoiceStore((s) => s.isMuted);
  const voiceToggleMic = useVoiceStore((s) => s.toggleMic);
  const voiceJoinedAt = useVoiceStore((s) => s.joinedAt);

  // Call timer
  const [timerElapsed, setTimerElapsed] = useState(0);
  useEffect(() => {
    if (!voiceJoinedAt) { setTimerElapsed(0); return; }
    setTimerElapsed(Math.floor((Date.now() - voiceJoinedAt) / 1000));
    const interval = setInterval(() => {
      setTimerElapsed(Math.floor((Date.now() - voiceJoinedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [voiceJoinedAt]);
  const callTime = useMemo(() => {
    const m = Math.floor(timerElapsed / 60);
    const s = timerElapsed % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }, [timerElapsed]);

  const handleCreateChannel = async () => {
    if (!newChannelName.trim() || !serverId || !creatingChannel) return;
    try {
      await api.createChannel(serverId, newChannelName.trim(), creatingChannel);
      const res = await api.getChannels(serverId);
      setChannels(res.channels);
      setCreatingChannel(null);
      setNewChannelName("");
    } catch {
      // ignore
    }
  };

  const unreadCounts = useChatStore((s) => s.unreadCounts);
  const textChannels = channels.filter((c) => c.type === ChannelType.Text);
  const voiceChannels = channels.filter((c) => c.type === ChannelType.Voice);

  // Poll voice channel participants
  const [voiceParticipants, setVoiceParticipants] = useState<
    Record<string, VoiceParticipant[]>
  >({});

  useEffect(() => {
    if (voiceChannels.length === 0) return;

    const fetchParticipants = async () => {
      const results: Record<string, VoiceParticipant[]> = {};
      for (const vc of voiceChannels) {
        try {
          const res = await api.getVoiceParticipants(vc.id);
          if (res.participants.length > 0) {
            results[vc.id] = res.participants;
          }
        } catch {
          // ignore - room may not exist yet
        }
      }
      setVoiceParticipants(results);
    };

    fetchParticipants();
    const interval = setInterval(fetchParticipants, 5000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels]);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.serverName}>{server?.name ?? "Server"}</h3>
        <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
          <button
            style={styles.copyId}
            onClick={() => {
              window.dispatchEvent(new CustomEvent("concord:open-server-settings"));
            }}
            title="Server Settings"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          <button
            style={{
              ...styles.copyId,
              ...(copied ? { background: "var(--success)", color: "white" } : {}),
            }}
            onClick={() => {
              if (serverId) {
                navigator.clipboard.writeText(serverId);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }
            }}
            title="Copy server ID to share with others"
          >
            {copied ? "Copied!" : "Copy ID"}
          </button>
        </div>
      </div>

      <div style={styles.channels}>
        {channels.length === 0 && (
          <div style={styles.loadingChannels}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={styles.skeletonChannel} />
            ))}
          </div>
        )}
        <div style={styles.category}>
          <div style={styles.categoryHeader}>
            <span style={styles.categoryLabel}>Text Channels</span>
            <button
              style={styles.categoryAdd}
              onClick={() => { setCreatingChannel(creatingChannel === "text" ? null : "text"); setNewChannelName(""); }}
              title="Create text channel"
            >+</button>
          </div>
          {creatingChannel === "text" && (
            <div style={styles.createChannelForm}>
              <input
                style={styles.createChannelInput}
                placeholder="channel-name"
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""))}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreateChannel(); if (e.key === "Escape") setCreatingChannel(null); }}
                autoFocus
                maxLength={50}
              />
            </div>
          )}
            {textChannels.map((channel) => {
              const unread = unreadCounts[channel.id] ?? 0;
              const isActive = channel.id === channelId;
              return (
                <button
                  key={channel.id}
                  className="hover-bg"
                  onClick={() => navigate(`/channels/${serverId}/${channel.id}`)}
                  style={{
                    ...styles.channelButton,
                    background: isActive ? "rgba(255,255,255,0.06)" : "transparent",
                    color: isActive ? "var(--text-primary)" : unread > 0 ? "var(--text-primary)" : "var(--text-muted)",
                    fontWeight: unread > 0 && !isActive ? 700 : 500,
                  }}
                >
                  <span style={styles.hash}>#</span>
                  {channel.name}
                  {unread > 0 && !isActive && (
                    <span style={styles.unreadBadge}>{unread > 99 ? "99+" : unread}</span>
                  )}
                </button>
              );
            })}
        </div>

        <div style={styles.category}>
          <div style={styles.categoryHeader}>
            <span style={styles.categoryLabel}>Voice Channels</span>
            <button
              style={styles.categoryAdd}
              onClick={() => { setCreatingChannel(creatingChannel === "voice" ? null : "voice"); setNewChannelName(""); }}
              title="Create voice channel"
            >+</button>
          </div>
          {creatingChannel === "voice" && (
            <div style={styles.createChannelForm}>
              <input
                style={styles.createChannelInput}
                placeholder="Channel Name"
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreateChannel(); if (e.key === "Escape") setCreatingChannel(null); }}
                autoFocus
                maxLength={50}
              />
            </div>
          )}
            {voiceChannels.map((channel) => {
              const participants = voiceParticipants[channel.id] ?? [];
              return (
                <div key={channel.id}>
                  <button
                    className="hover-bg"
                    onClick={() =>
                      navigate(`/channels/${serverId}/${channel.id}`)
                    }
                    style={{
                      ...styles.channelButton,
                      background:
                        channel.id === channelId
                          ? "rgba(255,255,255,0.06)"
                          : "transparent",
                      color:
                        channel.id === channelId
                          ? "var(--text-primary)"
                          : "var(--text-muted)",
                    }}
                  >
                    <span style={styles.voiceIcon}>V</span>
                    {channel.name}
                    {participants.length > 0 && (
                      <span style={styles.participantCount}>
                        {participants.length}
                      </span>
                    )}
                  </button>
                  {participants.length > 0 && (
                    <div style={styles.voiceUsers}>
                      {participants.map((p) => {
                        const isBot = p.userId === "concord-music-bot";
                        const micTrack = p.tracks.find((t) => t.source === 2);
                        const isMicMuted = !isBot && (!micTrack || micTrack.muted);
                        return (
                          <div key={p.userId} style={styles.voiceUser}>
                            <div style={{
                              ...styles.voiceUserDot,
                              background: isMicMuted ? "var(--danger)" : "var(--success)",
                            }} />
                            <span style={styles.voiceUserName}>
                              {isBot ? "Music Bot" : (p.name || p.userId)}
                            </span>
                            {isMicMuted && (
                              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.6 }}>
                                <line x1="1" y1="1" x2="23" y2="23" />
                                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                                <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.13 1.49-.35 2.17" />
                              </svg>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>

      {/* Voice connection status panel */}
      {voiceConnection && (
        <div style={styles.voiceStatus}>
          <div style={styles.voiceStatusInfo}>
            <span style={styles.voiceStatusLabel}>Voice Connected</span>
            <span style={styles.voiceStatusChannel}>
              {voiceConnection.channelName}
              <span style={styles.voiceStatusTimer}>{callTime}</span>
            </span>
          </div>
          <div style={styles.voiceStatusActions}>
            <button
              style={{
                ...styles.voiceStatusBtn,
                background: voiceMuted ? "var(--danger)" : "var(--bg-secondary)",
              }}
              onClick={voiceToggleMic}
              title={voiceMuted ? "Unmute" : "Mute"}
            >
              {voiceMuted ? (
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="1" y1="1" x2="23" y2="23" />
                  <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                  <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.13 1.49-.35 2.17" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              ) : (
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
                </svg>
              )}
            </button>
            {voiceConnection.channelId !== channelId && (
              <button
                style={styles.voiceStatusBtn}
                onClick={() =>
                  navigate(
                    `/channels/${voiceConnection.serverId}/${voiceConnection.channelId}`
                  )
                }
                title="Return to voice channel"
              >
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" />
                </svg>
              </button>
            )}
            <button
              style={{ ...styles.voiceStatusBtn, background: "var(--danger)", color: "white" }}
              onClick={() => {
                voiceDisconnect();
                playDisconnect();
              }}
              title="Disconnect"
            >
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
                <line x1="23" y1="1" x2="1" y2="23" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: "var(--sidebar-width)",
    background: "var(--bg-secondary)",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
  },
  header: {
    height: "48px",
    padding: "0 16px",
    borderBottom: "1px solid var(--bg-primary)",
    boxShadow: "0 1px 0 rgba(0,0,0,0.2)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexShrink: 0,
  },
  serverName: {
    fontSize: "15px",
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  copyId: {
    padding: "2px 8px",
    background: "var(--bg-tertiary)",
    border: "none",
    borderRadius: "4px",
    color: "var(--text-muted)",
    fontSize: "11px",
    cursor: "pointer",
    flexShrink: 0,
  },
  channels: {
    flex: 1,
    overflowY: "auto",
    padding: "12px 8px",
  },
  loadingChannels: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    padding: "8px",
  },
  skeletonChannel: {
    height: "28px",
    background: "var(--bg-tertiary)",
    borderRadius: "4px",
    opacity: 0.3,
  },
  category: {
    marginBottom: "16px",
  },
  categoryHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 8px",
    marginBottom: "4px",
  },
  categoryLabel: {
    fontSize: "11px",
    fontWeight: 700,
    textTransform: "uppercase",
    color: "var(--text-muted)",
    letterSpacing: "0.02em",
  },
  categoryAdd: {
    width: "16px",
    height: "16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "none",
    border: "none",
    color: "var(--text-muted)",
    fontSize: "14px",
    cursor: "pointer",
    borderRadius: "3px",
    transition: "color 0.12s",
  },
  createChannelForm: {
    padding: "2px 8px 6px",
  },
  createChannelInput: {
    width: "100%",
    padding: "6px 8px",
    background: "var(--input-bg)",
    border: "1px solid var(--border)",
    borderRadius: "4px",
    color: "var(--text-primary)",
    fontSize: "13px",
    outline: "none",
  },
  channelButton: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    width: "100%",
    padding: "6px 8px",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "14px",
    textAlign: "left",
    background: "transparent",
  },
  hash: {
    fontSize: "18px",
    fontWeight: 500,
    opacity: 0.5,
  },
  unreadBadge: {
    marginLeft: "auto",
    fontSize: "11px",
    color: "white",
    background: "var(--accent)",
    padding: "1px 6px",
    borderRadius: "8px",
    fontWeight: 700,
  },
  voiceIcon: {
    fontSize: "14px",
    fontWeight: 700,
    opacity: 0.5,
  },
  participantCount: {
    marginLeft: "auto",
    fontSize: "11px",
    color: "var(--success)",
    background: "rgba(87, 242, 135, 0.1)",
    padding: "1px 6px",
    borderRadius: "8px",
    fontWeight: 600,
  },
  voiceUsers: {
    paddingLeft: "28px",
    paddingBottom: "4px",
  },
  voiceUser: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "2px 8px",
  },
  voiceUserDot: {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    background: "var(--success)",
    flexShrink: 0,
  },
  voiceUserName: {
    fontSize: "13px",
    color: "var(--text-secondary)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  voiceStatus: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "10px 12px",
    borderTop: "1px solid var(--bg-primary)",
    background: "var(--bg-tertiary)",
    flexShrink: 0,
  },
  voiceStatusInfo: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "1px",
    flex: 1,
    minWidth: 0,
  },
  voiceStatusLabel: {
    fontSize: "11px",
    fontWeight: 700,
    color: "var(--success)",
  },
  voiceStatusChannel: {
    fontSize: "12px",
    color: "var(--text-secondary)",
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  voiceStatusTimer: {
    fontSize: "11px",
    color: "var(--text-muted)",
    fontVariantNumeric: "tabular-nums",
  },
  voiceStatusActions: {
    display: "flex",
    gap: "4px",
    flexShrink: 0,
  },
  voiceStatusBtn: {
    width: "28px",
    height: "28px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--bg-secondary)",
    border: "none",
    borderRadius: "4px",
    color: "var(--text-secondary)",
    cursor: "pointer",
  },
};
