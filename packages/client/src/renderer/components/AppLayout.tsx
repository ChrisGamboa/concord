import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { onWsMessage, sendWs } from "../lib/ws";
import { useChatStore } from "../stores/chat";
import { useAuthStore } from "../stores/auth";
import { usePresenceStore } from "../stores/presence";
import { ServerList } from "./ServerList";
import { ChannelSidebar } from "./ChannelSidebar";
import { ChatArea } from "./ChatArea";
import { VoiceChannel } from "./VoiceChannel";
import { MusicPlayer } from "./MusicPlayer";
import { MemberList } from "./MemberList";
import { SettingsPage } from "./SettingsPage";

export function AppLayout() {
  const { serverId, channelId } = useParams();
  const navigate = useNavigate();
  const {
    setServers,
    setChannels,
    setMessages,
    setMessagesLoading,
    addMessage,
    updateMessage,
    removeMessage,
    setActiveServer,
    setActiveChannel,
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

  // Load messages & subscribe when text channel changes
  useEffect(() => {
    if (!channelId || isVoiceChannel) return;
    setActiveChannel(channelId);
    setMessagesLoading(true);

    api.getMessages(channelId).then((res) => {
      setMessages(res.messages, res.hasMore);
    });

    sendWs({ type: "subscribe_channel", channelId });
    return () => {
      sendWs({ type: "unsubscribe_channel", channelId });
    };
  }, [channelId, isVoiceChannel, setActiveChannel, setMessages]);

  const userId = useAuthStore((s) => s.user?.id);
  const { setUserOnline, setUserOffline, addTyping } = usePresenceStore();
  const [showSettings, setShowSettings] = useState(false);

  // Listen for settings open event from ServerList
  useEffect(() => {
    const handler = () => setShowSettings(true);
    window.addEventListener("concord:open-settings", handler);
    return () => window.removeEventListener("concord:open-settings", handler);
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
      {serverId && <ChannelSidebar />}
      {channelId && isVoiceChannel && (
        <VoiceChannel
          channelId={channelId}
          channelName={currentChannel?.name ?? "voice"}
        />
      )}
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
      <MusicPlayer />
      {showSettings && <SettingsPage onClose={() => setShowSettings(false)} />}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  layout: {
    display: "flex",
    height: "100%",
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
