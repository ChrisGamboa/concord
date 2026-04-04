import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { onWsMessage } from "../lib/ws";
import { useChatStore } from "../stores/chat";
import { useAuthStore } from "../stores/auth";
import { usePresenceStore } from "../stores/presence";
import { useVoiceStore } from "../stores/voice";
import { ServerList } from "./ServerList";
import { ChannelSidebar } from "./ChannelSidebar";
import { ChatArea } from "./ChatArea";
import { VoiceJoinPrompt, VoiceSession } from "./VoiceChannel";
import { MusicPlayer } from "./MusicPlayer";
import { MemberList } from "./MemberList";
import { SettingsPage } from "./SettingsPage";
import { ServerSettings } from "./ServerSettings";

export function AppLayout() {
  const { serverId, channelId } = useParams();
  const navigate = useNavigate();
  const {
    setServers,
    setChannels,
    addMessage,
    updateMessage,
    removeMessage,
    setActiveServer,
  } = useChatStore();

  const [serversLoading, setServersLoading] = useState(true);

  // Load servers on mount
  useEffect(() => {
    api.getServers()
      .then((res) => setServers(res.servers))
      .finally(() => setServersLoading(false));
  }, [setServers]);

  // Load channels when server changes
  const prevServerRef = useRef<string | null>(null);
  useEffect(() => {
    if (!serverId) return;
    setActiveServer(serverId);

    // Only fetch channels if server actually changed
    if (prevServerRef.current !== serverId) {
      prevServerRef.current = serverId;
      api.getChannels(serverId).then((res) => {
        setChannels(res.channels);
        // Auto-select first text channel only if no channel is selected
        if (!channelId) {
          const firstText = res.channels.find((c) => c.type === "text");
          if (firstText) {
            navigate(`/channels/${serverId}/${firstText.id}`, { replace: true });
          }
        }
      });
    }
  }, [serverId, channelId, navigate, setActiveServer, setChannels]);

  // Determine if current channel is voice or text
  const channels = useChatStore((s) => s.channels);
  const currentChannel = channels.find((c) => c.id === channelId);
  const isVoiceChannel = currentChannel?.type === "voice";

  // Voice connection state
  const voiceConnection = useVoiceStore((s) => s.connection);
  const isViewingActiveVoice =
    isVoiceChannel && voiceConnection?.channelId === channelId;
  const isViewingUnconnectedVoice =
    isVoiceChannel && voiceConnection?.channelId !== channelId;

  const userId = useAuthStore((s) => s.user?.id);
  const { setUserOnline, setUserOffline, addTyping } = usePresenceStore();
  const [showSettings, setShowSettings] = useState(false);
  const [showServerSettings, setShowServerSettings] = useState(false);

  // Listen for settings open events
  useEffect(() => {
    const handler = () => setShowSettings(true);
    const serverHandler = () => setShowServerSettings(true);
    window.addEventListener("concord:open-settings", handler);
    window.addEventListener("concord:open-server-settings", serverHandler);
    return () => {
      window.removeEventListener("concord:open-settings", handler);
      window.removeEventListener("concord:open-server-settings", serverHandler);
    };
  }, []);

  // Handle incoming WebSocket messages
  useEffect(() => {
    return onWsMessage((msg) => {
      switch (msg.type) {
        case "message_created":
          addMessage(msg.message);
          // Desktop notification when window is not focused
          if (!document.hasFocus() && msg.message.authorId !== userId) {
            const electron = (window as any).electron;
            electron?.sendNotification?.(
              msg.message.author?.displayName ?? "New message",
              msg.message.content.length > 100
                ? msg.message.content.slice(0, 100) + "..."
                : msg.message.content
            );
          }
          break;
        case "message_updated":
          updateMessage(msg.message);
          break;
        case "message_deleted":
          removeMessage(msg.channelId, msg.messageId);
          break;
        case "presence_update":
          if (msg.status === "online") setUserOnline(msg.userId);
          else setUserOffline(msg.userId);
          break;
        case "typing":
          addTyping(msg.channelId, msg.userId, msg.username);
          break;
      }
    });
  }, [addMessage, updateMessage, removeMessage, setUserOnline, setUserOffline, addTyping]);

  return (
    <div style={styles.layout}>
      <ServerList loading={serversLoading} />
      <div style={styles.contentColumn}>
        <div style={styles.contentRow}>
          {serverId && <ChannelSidebar />}

          {/* Voice session - always mounted when connected, visible or hidden */}
          {voiceConnection && (
            <VoiceSession isViewing={!!isViewingActiveVoice} />
          )}

          {/* Join prompt for unconnected voice channels */}
          {channelId && serverId && isViewingUnconnectedVoice && (
            <VoiceJoinPrompt
              serverId={serverId}
              channelId={channelId}
              channelName={currentChannel?.name ?? "voice"}
            />
          )}

          {/* Text channel */}
          {channelId && !isVoiceChannel && <ChatArea />}

          {serverId && !channelId && (
            <div style={styles.welcome}>
              <p style={{ color: "var(--text-muted)" }}>Loading channels...</p>
            </div>
          )}
          {serverId && !isVoiceChannel && channelId && <MemberList />}
          {!serverId && (
            <div style={styles.welcome}>
              <h2>Welcome to Concord</h2>
              <p style={{ color: "var(--text-secondary)", marginTop: "8px" }}>
                Select or create a server to get started
              </p>
            </div>
          )}
        </div>
        <MusicPlayer />
      </div>
      {showSettings && <SettingsPage onClose={() => setShowSettings(false)} />}
      {showServerSettings && serverId && (
        <ServerSettings serverId={serverId} onClose={() => setShowServerSettings(false)} />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  layout: {
    display: "flex",
    height: "100%",
  },
  contentColumn: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    minHeight: 0,
  },
  contentRow: {
    flex: 1,
    display: "flex",
    minHeight: 0,
  },
  welcome: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--bg-chat)",
  },
};
