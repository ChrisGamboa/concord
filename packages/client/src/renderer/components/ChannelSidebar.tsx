import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useChatStore } from "../stores/chat";
import { ChannelType, type VoiceParticipant } from "@concord/shared";
import { api } from "../lib/api";

export function ChannelSidebar() {
  const channels = useChatStore((s) => s.channels);
  const { serverId, channelId } = useParams();
  const navigate = useNavigate();
  const servers = useChatStore((s) => s.servers);
  const server = servers.find((s) => s.id === serverId);

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
  }, [voiceChannels.map((c) => c.id).join(",")]);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.serverName}>{server?.name ?? "Server"}</h3>
        <button
          style={styles.copyId}
          onClick={() => {
            if (serverId) {
              navigator.clipboard.writeText(serverId);
            }
          }}
          title="Copy server ID to share with others"
        >
          Copy ID
        </button>
      </div>

      <div style={styles.channels}>
        {textChannels.length > 0 && (
          <div style={styles.category}>
            <span style={styles.categoryLabel}>Text Channels</span>
            {textChannels.map((channel) => (
              <button
                key={channel.id}
                onClick={() => navigate(`/channels/${serverId}/${channel.id}`)}
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
                <span style={styles.hash}>#</span>
                {channel.name}
              </button>
            ))}
          </div>
        )}

        {voiceChannels.length > 0 && (
          <div style={styles.category}>
            <span style={styles.categoryLabel}>Voice Channels</span>
            {voiceChannels.map((channel) => {
              const participants = voiceParticipants[channel.id] ?? [];
              return (
                <div key={channel.id}>
                  <button
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
                      {participants.map((p) => (
                        <div key={p.userId} style={styles.voiceUser}>
                          <div style={styles.voiceUserDot} />
                          <span style={styles.voiceUserName}>
                            {p.name || p.userId}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
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
    padding: "12px 16px",
    borderBottom: "1px solid var(--bg-primary)",
    boxShadow: "0 1px 0 rgba(0,0,0,0.2)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
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
  category: {
    marginBottom: "16px",
  },
  categoryLabel: {
    display: "block",
    fontSize: "11px",
    fontWeight: 700,
    textTransform: "uppercase",
    color: "var(--text-muted)",
    padding: "0 8px",
    marginBottom: "4px",
    letterSpacing: "0.02em",
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
};
