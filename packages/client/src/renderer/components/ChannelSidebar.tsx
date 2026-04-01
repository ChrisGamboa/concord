import { useNavigate, useParams } from "react-router-dom";
import { useChatStore } from "../stores/chat";
import { useVoiceStore } from "../stores/voice";
import { ChannelType } from "@concord/shared";

export function ChannelSidebar() {
  const channels = useChatStore((s) => s.channels);
  const { serverId, channelId } = useParams();
  const navigate = useNavigate();
  const servers = useChatStore((s) => s.servers);
  const server = servers.find((s) => s.id === serverId);

  const voiceChannelId = useVoiceStore((s) => s.activeChannelId);

  const textChannels = channels.filter((c) => c.type === ChannelType.Text);
  const voiceChannels = channels.filter((c) => c.type === ChannelType.Voice);

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
            {voiceChannels.map((channel) => (
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
                <span style={styles.voiceIcon}>V</span>
                {channel.name}
                {voiceChannelId === channel.id && (
                  <span style={styles.connectedDot} />
                )}
              </button>
            ))}
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
  connectedDot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    background: "var(--success)",
    marginLeft: "auto",
    flexShrink: 0,
  },
};
