import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { onWsMessage, sendWs } from "../lib/ws";
import { useChatStore } from "../stores/chat";
import { useAuthStore } from "../stores/auth";
import { usePresenceStore } from "../stores/presence";
import { useVoiceStore } from "../stores/voice";
import { toast } from "../stores/toast";
import { ServerList } from "./ServerList";
import { ChannelSidebar } from "./ChannelSidebar";
import { ChatArea } from "./ChatArea";
import { DmSidebar } from "./DmSidebar";
import { DmChatArea } from "./DmChatArea";
import { VoiceJoinPrompt, VoiceSession } from "./VoiceChannel";
import { MusicPlayer } from "./MusicPlayer";
import { MemberList } from "./MemberList";
import { SettingsPage } from "./SettingsPage";
import { ServerSettings } from "./ServerSettings";
import { QuickSwitcher } from "./QuickSwitcher";

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
    setUnreadCount,
    updateReactions,
  } = useChatStore();

  const [serversLoading, setServersLoading] = useState(true);

  // Load servers on mount
  const logout = useAuthStore((s) => s.logout);
  useEffect(() => {
    api.getServers()
      .then((res) => setServers(res.servers))
      .catch((err) => {
        // If unauthorized, token is expired -- force re-login
        if (err?.message?.includes("Unauthorized") || err?.message?.includes("401")) {
          logout();
        }
      })
      .finally(() => setServersLoading(false));
  }, [setServers, logout]);

  // Load channels when server changes (skip for DM view)
  const prevServerRef = useRef<string | null>(null);
  useEffect(() => {
    if (!serverId || serverId === "@me") return;
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

  // Fetch unread counts when server changes (skip for DM view)
  const setUnreadCounts = useChatStore((s) => s.setUnreadCounts);
  const setMentionCounts = useChatStore((s) => s.setMentionCounts);
  useEffect(() => {
    if (!serverId || serverId === "@me") return;
    api.getUnreadCounts(serverId).then((res) => {
      setUnreadCounts(res.unread);
      setMentionCounts(res.mentions ?? {});
    }).catch(() => {});
  }, [serverId, setUnreadCounts, setMentionCounts]);

  // Load notification mutes once on mount
  const setMutes = useChatStore((s) => s.setMutes);
  useEffect(() => {
    api.getMutes().then(setMutes).catch(() => {});
  }, [setMutes]);

  // Auto-idle after inactivity (skipped while DND is chosen manually)
  useEffect(() => {
    const IDLE_AFTER_MS = 5 * 60 * 1000;
    const ACTIVITY_THROTTLE_MS = 1000;
    let idleTimer: ReturnType<typeof setTimeout>;
    let isIdle = false;
    let lastActivity = 0;

    const manualDnd = () => localStorage.getItem("concord-presence") === "dnd";
    const goIdle = () => {
      if (manualDnd()) return;
      isIdle = true;
      sendWs({ type: "presence_set", status: "idle" });
    };
    const onActivity = () => {
      const now = Date.now();
      if (now - lastActivity < ACTIVITY_THROTTLE_MS) return;
      lastActivity = now;
      if (isIdle && !manualDnd()) {
        isIdle = false;
        sendWs({ type: "presence_set", status: "online" });
      }
      clearTimeout(idleTimer);
      idleTimer = setTimeout(goIdle, IDLE_AFTER_MS);
    };

    const events = ["mousemove", "keydown", "mousedown"] as const;
    events.forEach((e) => window.addEventListener(e, onActivity));
    idleTimer = setTimeout(goIdle, IDLE_AFTER_MS);
    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      clearTimeout(idleTimer);
    };
  }, []);

  // Mark channel as read when viewing it (skip for DM view)
  useEffect(() => {
    if (!channelId || isVoiceChannel || serverId === "@me") return;
    // Snapshot the unread count before zeroing it so ChatArea can place the NEW divider
    const store = useChatStore.getState();
    store.setChannelEntryUnread(channelId, store.unreadCounts[channelId] ?? 0);
    sendWs({ type: "mark_read", channelId });
    setUnreadCount(channelId, 0);
  }, [channelId, isVoiceChannel, setUnreadCount, serverId]);

  // Voice connection state
  const voiceConnection = useVoiceStore((s) => s.connection);
  const isViewingActiveVoice =
    isVoiceChannel && voiceConnection?.channelId === channelId;
  const isViewingUnconnectedVoice =
    isVoiceChannel && voiceConnection?.channelId !== channelId;

  const userId = useAuthStore((s) => s.user?.id);
  const { setPresence, addTyping } = usePresenceStore();
  const [showSettings, setShowSettings] = useState(false);
  const [showServerSettings, setShowServerSettings] = useState(false);
  const [showQuickSwitcher, setShowQuickSwitcher] = useState(false);

  // Ctrl/Cmd+K opens the quick switcher
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowQuickSwitcher((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const isDmView = serverId === "@me";

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
        case "message_created": {
          addMessage(msg.message, msg.nonce);
          // Desktop notification when window is not focused (unless channel/server is muted)
          const chatState = useChatStore.getState();
          const msgChannel = chatState.channels.find((c) => c.id === msg.message.channelId);
          const isMuted =
            chatState.mutedChannels.includes(msg.message.channelId) ||
            (msgChannel !== undefined && chatState.mutedServers.includes(msgChannel.serverId));
          const isDnd = userId !== undefined &&
            usePresenceStore.getState().statuses[userId] === "dnd";
          if (!isMuted && !isDnd && !document.hasFocus() && msg.message.authorId !== userId) {
            const electron = window.electron;
            electron?.sendNotification?.(
              msg.message.author?.displayName ?? "New message",
              msg.message.content.length > 100
                ? msg.message.content.slice(0, 100) + "..."
                : msg.message.content
            );
          }
          break;
        }
        case "message_updated":
          updateMessage(msg.message);
          break;
        case "message_deleted":
          removeMessage(msg.channelId, msg.messageId);
          break;
        case "presence_update":
          setPresence(msg.userId, msg.status);
          break;
        case "ready":
          // Restore a manually chosen DND status across reconnects
          if (localStorage.getItem("concord-presence") === "dnd") {
            sendWs({ type: "presence_set", status: "dnd" });
          }
          break;
        case "typing":
          addTyping(msg.channelId, msg.userId, msg.username);
          break;
        case "reaction_update":
          updateReactions(msg.messageId, msg.reactions);
          break;
        case "unread_count":
          setUnreadCount(msg.channelId, msg.count, msg.mentions ?? 0);
          break;
        case "dm_created": {
          // Reconcile/append into the open conversation (no-op if not viewing it).
          useChatStore.getState().addDmMessage(msg.message, msg.nonce);
          if (msg.message.authorId === userId) break;
          const viewingThisConv = serverId === "@me" && channelId === msg.message.conversationId;
          if (!viewingThisConv) {
            useChatStore.getState().addDmUnread(msg.message.conversationId);
          }
          const isDnd = userId !== undefined &&
            usePresenceStore.getState().statuses[userId] === "dnd";
          if (!isDnd && (!viewingThisConv || !document.hasFocus())) {
            const electron = window.electron;
            electron?.sendNotification?.(
              msg.message.author?.displayName ?? "New message",
              msg.message.content.length > 100
                ? msg.message.content.slice(0, 100) + "..."
                : msg.message.content
            );
          }
          break;
        }
        case "dm_updated":
          useChatStore.getState().updateDmMessage(msg.message);
          break;
        case "dm_deleted":
          useChatStore.getState().removeDmMessage(msg.messageId);
          break;
        case "dm_reaction_update":
          useChatStore.getState().updateDmReactions(msg.messageId, msg.reactions);
          break;
        case "dm_typing":
          addTyping(msg.conversationId, msg.userId, msg.username);
          break;
        case "error":
          toast(msg.message);
          break;
      }
    });
  }, [addMessage, updateMessage, removeMessage, setPresence, addTyping, setUnreadCount, updateReactions, userId, serverId, channelId]);

  return (
    <div style={styles.layout}>
      <ServerList loading={serversLoading} />
      <div style={styles.contentColumn}>
        <div style={styles.contentRow}>
          {/* DM view */}
          {isDmView && (
            <>
              <DmSidebar />
              <DmChatArea />
            </>
          )}

          {/* Server view */}
          {serverId && !isDmView && <ChannelSidebar />}

          {/* Voice session - always mounted when connected, visible or hidden */}
          {voiceConnection && (
            <VoiceSession isViewing={!!isViewingActiveVoice} />
          )}

          {/* Join prompt for unconnected voice channels */}
          {channelId && serverId && !isDmView && isViewingUnconnectedVoice && (
            <VoiceJoinPrompt
              serverId={serverId}
              channelId={channelId}
              channelName={currentChannel?.name ?? "voice"}
            />
          )}

          {/* Text channel */}
          {channelId && !isDmView && !isVoiceChannel && <ChatArea />}

          {serverId && !isDmView && !channelId && (
            <div style={styles.welcome}>
              <p style={{ color: "var(--text-muted)" }}>Loading channels...</p>
            </div>
          )}
          {serverId && !isDmView && !isVoiceChannel && channelId && <MemberList />}
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
      {showQuickSwitcher && <QuickSwitcher onClose={() => setShowQuickSwitcher(false)} />}
      {showSettings && <SettingsPage onClose={() => setShowSettings(false)} />}
      {showServerSettings && serverId && !isDmView && (
        <ServerSettings serverId={serverId} onClose={() => setShowServerSettings(false)} />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  layout: {
    display: "flex",
    flex: 1,
    minHeight: 0,
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
