import { onWsMessage, sendWs } from "./ws";
import { api } from "./api";
import { useChatStore } from "../stores/chat";
import { usePresenceStore } from "../stores/presence";
import { useAuthStore } from "../stores/auth";
import { useSettingsStore } from "../stores/settings";
import { toast } from "../stores/toast";
import type { DmMessagePayload, Message } from "@concord/shared";

// The single WebSocket dispatcher: every server event is routed here and fans out
// into the stores, so components subscribe to stores rather than the raw socket.

function notify(title: string, body: string) {
  // Respect the user's desktop-notification preference.
  if (!useSettingsStore.getState().notificationsEnabled) return;
  window.electron?.sendNotification?.(title, body.length > 100 ? body.slice(0, 100) + "..." : body);
}

function isDnd(userId: string | undefined): boolean {
  return userId !== undefined && usePresenceStore.getState().statuses[userId] === "dnd";
}

function maybeNotifyChannelMessage(message: Message) {
  const userId = useAuthStore.getState().user?.id;
  if (message.authorId === userId) return;
  const chat = useChatStore.getState();
  const channel = chat.channels.find((c) => c.id === message.channelId);
  const muted =
    chat.mutedChannels.includes(message.channelId) ||
    (channel !== undefined && chat.mutedServers.includes(channel.serverId));
  if (!muted && !isDnd(userId) && !document.hasFocus()) {
    notify(message.author?.displayName ?? "New message", message.content);
  }
}

function handleDmCreated(message: DmMessagePayload, nonce?: string) {
  const chat = useChatStore.getState();
  // Reconcile/append into the open conversation (no-op if not viewing it).
  chat.addDmMessage(message, nonce);
  // Keep the conversation list ordered/current; refetch if it's a brand-new conversation.
  if (chat.conversations.some((c) => c.id === message.conversationId)) {
    chat.bumpConversation({ conversationId: message.conversationId, content: message.content, createdAt: message.createdAt });
  } else {
    api.getConversations().then((r) => chat.setConversations(r.conversations)).catch(() => {});
  }

  const userId = useAuthStore.getState().user?.id;
  if (message.authorId === userId) return;
  const viewing = chat.activeConversationId === message.conversationId;
  if (!viewing) chat.addDmUnread(message.conversationId);
  if (!isDnd(userId) && (!viewing || !document.hasFocus())) {
    notify(message.author?.displayName ?? "New message", message.content);
  }
}

/** Install the router once (returns an unsubscribe). */
export function installWsRouter(): () => void {
  return onWsMessage((msg) => {
    const chat = useChatStore.getState();
    const presence = usePresenceStore.getState();
    switch (msg.type) {
      case "message_created":
        chat.addMessage(msg.message, msg.nonce);
        maybeNotifyChannelMessage(msg.message);
        break;
      case "message_updated":
        chat.updateMessage(msg.message);
        break;
      case "message_deleted":
        chat.removeMessage(msg.channelId, msg.messageId);
        break;
      case "reaction_update":
        chat.updateReactions(msg.messageId, msg.reactions);
        break;
      case "presence_update":
        presence.setPresence(msg.userId, msg.status);
        break;
      case "typing":
        presence.addTyping(msg.channelId, msg.userId, msg.username);
        break;
      case "unread_count":
        chat.setUnreadCount(msg.channelId, msg.count, msg.mentions ?? 0);
        break;
      case "dm_created":
        handleDmCreated(msg.message, msg.nonce);
        break;
      case "dm_updated":
        chat.updateDmMessage(msg.message);
        break;
      case "dm_deleted":
        chat.removeDmMessage(msg.messageId);
        break;
      case "dm_reaction_update":
        chat.updateDmReactions(msg.messageId, msg.reactions);
        break;
      case "dm_typing":
        presence.addTyping(msg.conversationId, msg.userId, msg.username);
        break;
      case "ready":
        // Restore a manually chosen DND status across reconnects.
        if (localStorage.getItem("concord-presence") === "dnd") {
          sendWs({ type: "presence_set", status: "dnd" });
        }
        break;
      case "error":
        toast(msg.message);
        break;
    }
  });
}
