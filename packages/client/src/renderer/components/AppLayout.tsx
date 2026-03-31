import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { onWsMessage, sendWs } from "../lib/ws";
import { useChatStore } from "../stores/chat";
import { ServerList } from "./ServerList";
import { ChannelSidebar } from "./ChannelSidebar";
import { ChatArea } from "./ChatArea";
import { VoiceChannel } from "./VoiceChannel";
import { MusicPlayer } from "./MusicPlayer";

export function AppLayout() {
  const { serverId, channelId } = useParams();
  const navigate = useNavigate();
  const {
    setServers,
    setChannels,
    setMessages,
    addMessage,
    updateMessage,
    removeMessage,
    setActiveServer,
    setActiveChannel,
  } = useChatStore();

  // Load servers on mount
  useEffect(() => {
    api.getServers().then((res) => setServers(res.servers));
  }, [setServers]);

  // Load channels when server changes
  useEffect(() => {
    if (!serverId) return;
    setActiveServer(serverId);
    api.getChannels(serverId).then((res) => {
      setChannels(res.channels);
      // Auto-select first text channel if none selected
      if (!channelId) {
        const firstText = res.channels.find((c) => c.type === "text");
        if (firstText) {
          navigate(`/channels/${serverId}/${firstText.id}`, { replace: true });
        }
      }
    });
  }, [serverId, channelId, navigate, setActiveServer, setChannels]);

  // Determine if current channel is voice or text
  const channels = useChatStore((s) => s.channels);
  const currentChannel = channels.find((c) => c.id === channelId);
  const isVoiceChannel = currentChannel?.type === "voice";

  // Load messages & subscribe when text channel changes
  useEffect(() => {
    if (!channelId || isVoiceChannel) return;
    setActiveChannel(channelId);

    api.getMessages(channelId).then((res) => {
      setMessages(res.messages, res.hasMore);
    });

    sendWs({ type: "subscribe_channel", channelId });
    return () => {
      sendWs({ type: "unsubscribe_channel", channelId });
    };
  }, [channelId, isVoiceChannel, setActiveChannel, setMessages]);

  // Handle incoming WebSocket messages
  useEffect(() => {
    return onWsMessage((msg) => {
      switch (msg.type) {
        case "message_created":
          addMessage(msg.message);
          break;
        case "message_updated":
          updateMessage(msg.message);
          break;
        case "message_deleted":
          removeMessage(msg.channelId, msg.messageId);
          break;
      }
    });
  }, [addMessage, updateMessage, removeMessage]);

  return (
    <div style={styles.layout}>
      <ServerList />
      {serverId && <ChannelSidebar />}
      {channelId && isVoiceChannel && (
        <VoiceChannel
          channelId={channelId}
          channelName={currentChannel?.name ?? "voice"}
        />
      )}
      {channelId && !isVoiceChannel && <ChatArea />}
      {!serverId && (
        <div style={styles.welcome}>
          <h2>Welcome to Concord</h2>
          <p style={{ color: "var(--text-secondary)", marginTop: "8px" }}>
            Select or create a server to get started
          </p>
        </div>
      )}
      <MusicPlayer />
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
