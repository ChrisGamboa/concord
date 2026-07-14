import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useChatStore, type ChatMessage } from "../stores/chat";
import { useAuthStore } from "../stores/auth";
import { usePresenceStore } from "../stores/presence";
import { toast } from "../stores/toast";
import { sendWs } from "../lib/ws";
import { api } from "../lib/api";
import { Permissions, hasPermission, type MessageReference } from "@concord/shared";
import { Lightbox } from "./Lightbox";
import { ProfileCard } from "./ProfileCard";
import { MentionDropdown, useMentionAutocomplete } from "./MentionAutocomplete";
import { MessageList, type MessageListHandle } from "./chat/MessageList";
import { MessageRow, type RowMessage } from "./chat/MessageRow";
import { MessageComposer } from "./chat/MessageComposer";
import { chatStyles } from "./chat/chatStyles";

const SEND_TIMEOUT_MS = 10_000; // mark a send as failed if unconfirmed after this

/** Extract from:/in:/before:/after: filter tokens from a search query. */
function parseSearchQuery(raw: string) {
  const textParts: string[] = [];
  let from: string | null = null;
  let inChannel: string | null = null;
  let before: string | null = null;
  let after: string | null = null;
  for (const token of raw.trim().split(/\s+/).filter(Boolean)) {
    const m = token.match(/^(from|in|before|after):(.+)$/i);
    if (!m) {
      textParts.push(token);
      continue;
    }
    const value = m[2];
    switch (m[1].toLowerCase()) {
      case "from": from = value.replace(/^@/, ""); break;
      case "in": inChannel = value.replace(/^#/, ""); break;
      case "before": before = value; break;
      case "after": after = value; break;
    }
  }
  return { text: textParts.join(" "), from, inChannel, before, after };
}

export function ChatArea() {
  const { channelId } = useParams();
  const navigate = useNavigate();
  const messages = useChatStore((s) => s.messages);
  const channels = useChatStore((s) => s.channels);
  const hasMore = useChatStore((s) => s.hasMoreMessages);
  const isAtLatest = useChatStore((s) => s.isAtLatest);
  const setMessages = useChatStore((s) => s.setMessages);
  const setMessagesLoading = useChatStore((s) => s.setMessagesLoading);
  const prependMessages = useChatStore((s) => s.prependMessages);
  const setActiveChannel = useChatStore((s) => s.setActiveChannel);
  const userId = useAuthStore((s) => s.user?.id);
  const messagesLoading = useChatStore((s) => s.messagesLoading);
  const [input, setInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [profilePopup, setProfilePopup] = useState<{ userId: string; x: number; y: number } | null>(null);
  const [cursorPos, setCursorPos] = useState(0);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<MessageListHandle>(null);
  // First unread message on channel entry (where the NEW divider renders)
  const [unreadMarkerId, setUnreadMarkerId] = useState<string | null>(null);
  // Message currently being replied to (consumed by the next send)
  const [replyTarget, setReplyTarget] = useState<MessageReference | null>(null);

  // Close reaction picker on click-outside or Escape
  useEffect(() => {
    if (!reactionPickerMsgId) return;
    const close = () => setReactionPickerMsgId(null);
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    // Delay so the opening click doesn't immediately close it
    const timer = setTimeout(() => {
      window.addEventListener("click", close);
      window.addEventListener("keydown", handleKey);
    }, 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", handleKey);
    };
  }, [reactionPickerMsgId]);

  // Close delete-confirm popover on click-outside or Escape
  useEffect(() => {
    if (!confirmDeleteId) return;
    const close = () => setConfirmDeleteId(null);
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    const timer = setTimeout(() => {
      window.addEventListener("click", close);
      window.addEventListener("keydown", handleKey);
    }, 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", handleKey);
    };
  }, [confirmDeleteId]);

  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { serverId } = useParams() as { serverId?: string };
  const channel = channels.find((c) => c.id === channelId);

  // Fetch permissions for moderation actions
  const [myPermissions, setMyPermissions] = useState(0);
  useEffect(() => {
    if (!serverId || !userId) return;
    api.getMyPermissions(serverId, userId).then((res) => {
      setMyPermissions(res.permissions);
    }).catch(() => {});
  }, [serverId, userId]);
  const canModerate = hasPermission(myPermissions, Permissions.MANAGE_MESSAGES);

  // Fetch members for @mention autocomplete and rendering
  const [members, setMembers] = useState<Array<{ userId: string; username: string; displayName: string; avatarUrl: string | null }>>([]);
  useEffect(() => {
    if (!serverId) return;
    api.getMembers(serverId).then((res) => {
      setMembers((res.members as any[]).map((m: any) => ({
        userId: m.user?.id ?? m.userId,
        username: m.user?.username ?? "",
        displayName: m.user?.displayName ?? m.nickname ?? "",
        avatarUrl: m.user?.avatarUrl ?? null,
      })));
    }).catch(() => toast("Failed to load server members"));
  }, [serverId]);

  // Build username -> userId map for mention rendering
  const mentionUsers = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) {
      map.set(m.username, m.userId);
    }
    return map;
  }, [members]);

  // @mention autocomplete
  const mention = useMentionAutocomplete(members, input, cursorPos, setInput, chatInputRef);

  const focusMessage = useCallback((messageId: string) => {
    listRef.current?.focusMessage(messageId);
  }, []);

  // Load messages and subscribe to WS channel
  useEffect(() => {
    if (!channelId) return;
    let stale = false;
    setActiveChannel(channelId);
    setMessagesLoading(true);
    setUnreadMarkerId(null);
    setReplyTarget(null);

    // A jump target handed over from another channel (search result) loads
    // the page around the target instead of the latest messages.
    const jump = useChatStore.getState().pendingJump;
    if (jump && jump.channelId === channelId) {
      useChatStore.getState().setPendingJump(null);
      const before = new Date(new Date(jump.createdAt).getTime() + 1).toISOString();
      api.getMessages(channelId, before).then((res) => {
        if (stale) return;
        setMessages(res.messages, res.hasMore, false);
        focusMessage(jump.messageId);
      }).catch(() => {
        if (stale) return;
        setMessagesLoading(false);
        toast("Failed to load messages");
      });
    } else {
      api.getMessages(channelId).then((res) => {
        if (stale) return;
        setMessages(res.messages, res.hasMore);
        // Place the NEW divider at the first unread message (count snapshotted on entry)
        const entryUnread = useChatStore.getState().channelEntryUnread[channelId] ?? 0;
        if (entryUnread > 0 && res.messages.length > 0) {
          const idx = Math.max(0, res.messages.length - entryUnread);
          setUnreadMarkerId(res.messages[idx].id);
        }
        // Scroll to bottom after messages render
        requestAnimationFrame(() => listRef.current?.scrollToBottom());
      }).catch(() => {
        if (stale) return;
        setMessagesLoading(false);
        toast("Failed to load messages");
      });
    }

    sendWs({ type: "subscribe_channel", channelId });
    return () => {
      stale = true;
      sendWs({ type: "unsubscribe_channel", channelId });
    };
  }, [channelId]);

  // Jump to a message in the current channel, fetching its page if not loaded
  const jumpToMessage = useCallback(async (messageId: string, createdAt: string) => {
    if (!channelId) return;
    const loaded = useChatStore.getState().messages.some((m) => m.id === messageId);
    if (loaded) {
      focusMessage(messageId);
      return;
    }
    try {
      const before = new Date(new Date(createdAt).getTime() + 1).toISOString();
      const res = await api.getMessages(channelId, before);
      setMessages(res.messages, res.hasMore, false);
      focusMessage(messageId);
    } catch {
      toast("Failed to jump to message");
    }
  }, [channelId, setMessages, focusMessage]);

  // Return from a historical page to the live view
  const jumpToPresent = useCallback(async () => {
    if (!channelId) return;
    try {
      const res = await api.getMessages(channelId);
      setMessages(res.messages, res.hasMore, true);
      requestAnimationFrame(() => listRef.current?.scrollToBottom());
    } catch {
      toast("Failed to load latest messages");
    }
  }, [channelId, setMessages]);

  // Load older messages (MessageList keeps the viewport anchored on prepend)
  const loadOlder = useCallback(async () => {
    if (!channelId || messages.length === 0 || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api.getMessages(channelId, messages[0].createdAt);
      prependMessages(res.messages, res.hasMore);
    } catch {
      toast("Failed to load older messages");
    } finally {
      setLoadingMore(false);
    }
  }, [channelId, messages, loadingMore, prependMessages]);

  const typingUsersMap = usePresenceStore((s) => s.typingUsers);
  const typingUsers = useMemo(() => {
    if (!channelId) return [];
    const result: string[] = [];
    for (const [key, val] of typingUsersMap) {
      if (key.startsWith(`${channelId}:`)) {
        result.push(val.username);
      }
    }
    return result;
  }, [channelId, typingUsersMap]);

  // Reading at the bottom keeps the channel marked as read
  const handleTailRead = useCallback(() => {
    if (!channelId) return;
    sendWs({ type: "mark_read", channelId });
    useChatStore.getState().setUnreadCount(channelId, 0);
  }, [channelId]);

  const sendTyping = useCallback(() => {
    if (!channelId) return;
    if (typingTimeoutRef.current) return;
    sendWs({ type: "typing_start", channelId });
    typingTimeoutRef.current = setTimeout(() => {
      typingTimeoutRef.current = null;
    }, 2000);
  }, [channelId]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    setCursorPos(e.target.selectionStart ?? e.target.value.length);
    if (e.target.value.trim()) sendTyping();
  };

  // Optimistic send: show the message immediately, reconcile when the server
  // echoes it back (matched by nonce), mark failed if no echo in time.
  const watchDelivery = useCallback((nonce: string) => {
    setTimeout(() => {
      const store = useChatStore.getState();
      const msg = store.messages.find((m) => m.nonce === nonce);
      if (msg?.pending) store.markMessageFailed(nonce);
    }, SEND_TIMEOUT_MS);
  }, []);

  const sendChannelMessage = useCallback((content: string) => {
    if (!channelId || !userId) return;
    const nonce = crypto.randomUUID();
    const me = useAuthStore.getState().user;
    const reply = replyTarget;
    setReplyTarget(null);
    useChatStore.getState().addPendingMessage({
      id: `pending-${nonce}`,
      channelId,
      authorId: userId,
      content,
      createdAt: new Date().toISOString(),
      editedAt: null,
      author: me
        ? { id: me.id, username: me.username, displayName: me.displayName, avatarUrl: me.avatarUrl, status: me.status }
        : undefined,
      replyTo: reply,
      pending: true,
      nonce,
    });
    if (sendWs({ type: "send_message", channelId, content, nonce, replyToId: reply?.id })) {
      watchDelivery(nonce);
    } else {
      useChatStore.getState().markMessageFailed(nonce);
    }
  }, [channelId, userId, watchDelivery, replyTarget]);

  const handleStartReply = useCallback((msgId: string) => {
    const m = useChatStore.getState().messages.find((x) => x.id === msgId);
    if (!m) return;
    setReplyTarget({
      id: m.id,
      content: m.content,
      authorId: m.authorId,
      createdAt: m.createdAt,
      author: m.author,
    });
    chatInputRef.current?.focus();
  }, []);

  const retrySend = useCallback((nonce: string, content: string) => {
    if (!channelId) return;
    useChatStore.getState().markMessagePending(nonce);
    if (sendWs({ type: "send_message", channelId, content, nonce })) {
      watchDelivery(nonce);
    } else {
      useChatStore.getState().markMessageFailed(nonce);
    }
  }, [channelId, watchDelivery]);

  const discardSend = useCallback((nonce: string) => {
    useChatStore.getState().removeMessageByNonce(nonce);
  }, []);

  const submitMessage = useCallback(async () => {
    if (mention.isOpen) return; // Don't submit while mention dropdown is open
    if (!input.trim() || !channelId) return;
    const content = input.trim();
    setInput("");
    setCursorPos(0);
    // Sending from a historical view returns to the live view first
    if (!useChatStore.getState().isAtLatest) {
      await jumpToPresent();
    }
    sendChannelMessage(content);
  }, [mention.isOpen, input, channelId, jumpToPresent, sendChannelMessage]);

  const handleFileUpload = useCallback(
    async (file: File) => {
      if (!channelId) return;
      setUploading(true);
      try {
        const result = await api.uploadFile(file);
        sendChannelMessage(result.url);
      } catch (err) {
        toast(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [channelId, sendChannelMessage]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileUpload(file);
    },
    [handleFileUpload]
  );

  const handleStartEdit = (msgId: string, content: string) => {
    setEditingMsgId(msgId);
    setEditContent(content);
  };

  const handleSaveEdit = () => {
    if (!editingMsgId || !editContent.trim()) return;
    sendWs({ type: "edit_message", messageId: editingMsgId, content: editContent.trim() });
    setEditingMsgId(null);
    setEditContent("");
  };

  const handleCancelEdit = () => {
    setEditingMsgId(null);
    setEditContent("");
  };

  const handleDelete = (msgId: string, skipConfirm: boolean) => {
    if (skipConfirm || confirmDeleteId === msgId) {
      sendWs({ type: "delete_message", messageId: msgId });
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(msgId);
    }
  };

  const handlePin = async (msgId: string) => {
    const msg = messages.find((m) => m.id === msgId);
    if (!msg) return;
    try {
      if (msg.pinnedAt) {
        await api.unpinMessage(msgId);
      } else {
        await api.pinMessage(msgId);
      }
      // Toggle locally instead of refetching (keeps scroll position and history view)
      useChatStore.getState().updateMessage({
        ...msg,
        pinnedAt: msg.pinnedAt ? null : new Date().toISOString(),
      });
    } catch {
      toast(msg.pinnedAt ? "Failed to unpin message" : "Failed to pin message");
    }
  };

  // Pinned messages panel
  const [showPins, setShowPins] = useState(false);
  const [pinnedMessages, setPinnedMessages] = useState<Array<{ id: string; content: string; createdAt: string; pinnedByName: string | null; author: any }>>([]);

  const handleUnpinFromPanel = async (pinId: string) => {
    try {
      await api.unpinMessage(pinId);
      setPinnedMessages((prev) => prev.filter((p) => p.id !== pinId));
      // Keep the loaded message's pin state in sync if it's on screen
      const loaded = useChatStore.getState().messages.find((m) => m.id === pinId);
      if (loaded) {
        useChatStore.getState().updateMessage({ ...loaded, pinnedAt: null });
      }
    } catch {
      toast("Failed to unpin message");
    }
  };
  useEffect(() => {
    if (!showPins || !channelId) return;
    api.getPinnedMessages(channelId).then((res) => setPinnedMessages(res.pins)).catch(() => toast("Failed to load pinned messages"));
  }, [showPins, channelId]);

  // Message search
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ id: string; channelId: string; channelName: string; content: string; createdAt: string; author: any }>>([]);
  const [searching, setSearching] = useState(false);

  // Resolve filter tokens against loaded members/channels
  const searchPlan = useMemo(() => {
    const parsed = parseSearchQuery(searchQuery);
    const author = parsed.from
      ? members.find(
          (m) =>
            m.username.toLowerCase() === parsed.from!.toLowerCase() ||
            m.displayName.toLowerCase() === parsed.from!.toLowerCase()
        ) ?? null
      : null;
    const channelFilter = parsed.inChannel
      ? channels.find((c) => c.name.toLowerCase() === parsed.inChannel!.toLowerCase()) ?? null
      : null;
    const unresolved =
      (parsed.from !== null && author === null) ||
      (parsed.inChannel !== null && channelFilter === null);
    const ready = !unresolved && (parsed.text.length >= 2 || author !== null);
    return { ...parsed, author, channelFilter, unresolved, ready };
  }, [searchQuery, members, channels]);

  useEffect(() => {
    if (!showSearch || !serverId || !searchPlan.ready) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      api.searchMessages({
        q: searchPlan.text,
        serverId,
        channelId: searchPlan.channelFilter?.id,
        authorId: searchPlan.author?.userId,
        before: searchPlan.before ?? undefined,
        after: searchPlan.after ?? undefined,
      })
        .then((res) => setSearchResults(res.results))
        .catch(() => {
          setSearchResults([]);
          toast("Search failed");
        })
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchPlan, showSearch, serverId]);

  const typingText =
    typingUsers.length === 0
      ? null
      : typingUsers.length === 1
        ? `${typingUsers[0]} is typing...`
        : typingUsers.length === 2
          ? `${typingUsers[0]} and ${typingUsers[1]} are typing...`
          : `${typingUsers[0]} and ${typingUsers.length - 1} others are typing...`;

  return (
    <div
      style={{
        ...chatStyles.container,
        ...(dragOver ? { outline: "2px dashed var(--accent)" } : {}),
      }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <div style={chatStyles.header}>
        <span style={styles.hash}>#</span>
        <span style={styles.channelName}>{channel?.name ?? "channel"}</span>
        <button
          style={styles.pinButton}
          onClick={() => { setShowSearch(!showSearch); if (showPins) setShowPins(false); }}
          title="Search Messages"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
        <button
          style={styles.pinButton}
          onClick={() => { setShowPins(!showPins); if (showSearch) setShowSearch(false); }}
          title="Pinned Messages"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill={showPins ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 17v5" />
            <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 1 1 0 0 0 1-1V4a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v1a1 1 0 0 0 1 1 1 1 0 0 1 1 1z" />
          </svg>
        </button>
      </div>

      {showPins && (
        <div style={styles.pinsPanel}>
          <div style={styles.pinsPanelHeader}>Pinned Messages</div>
          {pinnedMessages.length === 0 ? (
            <div style={styles.pinsPanelEmpty}>No pinned messages in this channel</div>
          ) : (
            pinnedMessages.map((pin) => (
              <div
                key={pin.id}
                style={{ ...styles.pinItem, cursor: "pointer" }}
                className="hover-bg"
                onClick={() => {
                  setShowPins(false);
                  jumpToMessage(pin.id, pin.createdAt);
                }}
                title="Jump to message"
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <div style={{ ...styles.pinItemAuthor, flex: 1 }}>{pin.author?.displayName ?? "Unknown"}</div>
                  {canModerate && (
                    <button
                      className="pin-remove-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUnpinFromPanel(pin.id);
                      }}
                      title="Unpin"
                    >
                      Unpin
                    </button>
                  )}
                </div>
                <div style={styles.pinItemContent}>{pin.content}</div>
                <div style={styles.pinItemDate}>
                  {new Date(pin.createdAt).toLocaleDateString()}
                  {pin.pinnedByName ? ` · pinned by ${pin.pinnedByName}` : ""}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {showSearch && (
        <div style={styles.pinsPanel}>
          <div style={{ padding: "8px 16px", borderBottom: "1px solid var(--border)" }}>
            <input
              style={styles.searchInput}
              placeholder="Search messages in this server..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
            <div style={styles.searchHint}>
              Filters: from:user &middot; in:channel &middot; before:YYYY-MM-DD &middot; after:YYYY-MM-DD
            </div>
          </div>
          {searching && (
            <div style={styles.pinsPanelEmpty}>Searching...</div>
          )}
          {!searching && searchPlan.from !== null && searchPlan.author === null && (
            <div style={styles.pinsPanelEmpty}>No member matching "{searchPlan.from}"</div>
          )}
          {!searching && searchPlan.inChannel !== null && searchPlan.channelFilter === null && (
            <div style={styles.pinsPanelEmpty}>No channel named "#{searchPlan.inChannel}"</div>
          )}
          {!searching && searchPlan.ready && searchResults.length === 0 && (
            <div style={styles.pinsPanelEmpty}>No results found</div>
          )}
          {!searching && !searchPlan.ready && !searchPlan.unresolved && searchQuery.trim().length > 0 && (
            <div style={styles.pinsPanelEmpty}>Type at least 2 characters</div>
          )}
          {searchResults.map((result) => (
            <div
              key={result.id}
              style={{ ...styles.pinItem, cursor: "pointer" }}
              className="hover-bg"
              onClick={() => {
                setShowSearch(false);
                setSearchQuery("");
                if (result.channelId === channelId) {
                  jumpToMessage(result.id, result.createdAt);
                } else {
                  // Hand the target to the destination channel's load effect
                  useChatStore.getState().setPendingJump({
                    channelId: result.channelId,
                    messageId: result.id,
                    createdAt: result.createdAt,
                  });
                  navigate(`/channels/${serverId}/${result.channelId}`);
                }
              }}
              title="Jump to message"
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
                <span style={styles.pinItemAuthor}>{result.author?.displayName ?? "Unknown"}</span>
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>#{result.channelName}</span>
                <span style={styles.pinItemDate}>{new Date(result.createdAt).toLocaleDateString()}</span>
              </div>
              <div style={styles.pinItemContent}>{result.content}</div>
            </div>
          ))}
        </div>
      )}

      <MessageList<ChatMessage>
        ref={listRef}
        messages={messages}
        loading={messagesLoading}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadOlder={loadOlder}
        currentUserId={userId}
        unreadMarkerId={unreadMarkerId}
        resetKey={channelId ?? ""}
        onTailRead={handleTailRead}
        rowElevated={(m) => hoveredMsgId === m.id || reactionPickerMsgId === m.id || confirmDeleteId === m.id}
        emptyState={
          <div style={chatStyles.emptyState}>
            <h2 style={chatStyles.emptyTitle}>
              Welcome to #{channel?.name ?? "channel"}
            </h2>
            <p style={chatStyles.emptySubtitle}>
              This is the beginning of the #{channel?.name ?? "channel"} channel.
            </p>
          </div>
        }
        renderMessage={(msg, { isGrouped }) => (
          <MessageRow
            msg={msg as RowMessage}
            isGrouped={isGrouped}
            currentUserId={userId}
            isHovered={hoveredMsgId === msg.id}
            onHover={setHoveredMsgId}
            isEditing={editingMsgId === msg.id}
            editContent={editContent}
            onEditChange={setEditContent}
            onSaveEdit={handleSaveEdit}
            onCancelEdit={handleCancelEdit}
            confirmDeleteId={confirmDeleteId}
            onCancelDelete={() => setConfirmDeleteId(null)}
            reactionPickerMsgId={reactionPickerMsgId}
            onReact={(id) => setReactionPickerMsgId((prev) => prev === id ? null : id)}
            onToggleReaction={(id, emoji) => sendWs({ type: "toggle_reaction", messageId: id, emoji })}
            onReply={handleStartReply}
            onStartEdit={handleStartEdit}
            onDelete={handleDelete}
            onPin={handlePin}
            canModerate={canModerate}
            mentionUsers={mentionUsers}
            onImageClick={setLightboxSrc}
            onJumpToMessage={jumpToMessage}
            onAvatarClick={(uid, e) => setProfilePopup({ userId: uid, x: e.clientX, y: e.clientY })}
            onRetryFailed={(m) => m.nonce && retrySend(m.nonce, m.content)}
            onDiscardFailed={(m) => m.nonce && discardSend(m.nonce)}
          />
        )}
      />

      <MessageComposer
        inputRef={chatInputRef}
        value={input}
        setInput={setInput}
        onChange={handleInputChange}
        onKeyDown={(e) => {
          mention.handleKeyDown(e);
          if (e.defaultPrevented) return;
          if (e.key === "Escape" && replyTarget) {
            setReplyTarget(null);
            return;
          }
          // Up arrow in empty input -> edit last own message
          if (e.key === "ArrowUp" && !input.trim()) {
            const lastOwn = [...messages].reverse().find((m) => m.authorId === userId);
            if (lastOwn) {
              e.preventDefault();
              handleStartEdit(lastOwn.id, lastOwn.content);
            }
          }
        }}
        onSelect={(e) => setCursorPos((e.target as HTMLInputElement).selectionStart ?? 0)}
        onSubmit={submitMessage}
        placeholder={uploading ? "Uploading..." : `Message #${channel?.name ?? "channel"}`}
        uploading={uploading}
        onFileSelected={handleFileUpload}
        onGifSelected={(url) => sendChannelMessage(url)}
        replyTarget={replyTarget}
        onCancelReply={() => setReplyTarget(null)}
        typingText={typingText}
        isAtLatest={isAtLatest}
        onJumpToPresent={jumpToPresent}
        extraDropdown={mention.isOpen ? (
          <MentionDropdown
            filtered={mention.filtered}
            activeIndex={mention.activeIndex}
            onSelect={mention.selectMember}
            listRef={mention.listRef}
          />
        ) : null}
      />
      {lightboxSrc && <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
      {profilePopup && (
        <ProfileCard
          userId={profilePopup.userId}
          x={profilePopup.x}
          y={profilePopup.y}
          anchor="right"
          onClose={() => setProfilePopup(null)}
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  hash: {
    fontSize: "20px",
    color: "var(--text-muted)",
    fontWeight: 500,
  },
  channelName: {
    fontSize: "15px",
    fontWeight: 600,
    flex: 1,
  },
  pinButton: {
    background: "none",
    border: "none",
    color: "var(--text-muted)",
    cursor: "pointer",
    padding: "4px",
    borderRadius: "4px",
    display: "flex",
    alignItems: "center",
    flexShrink: 0,
  },
  pinsPanel: {
    borderBottom: "1px solid var(--border)",
    background: "var(--bg-secondary)",
    maxHeight: "250px",
    overflowY: "auto" as const,
    flexShrink: 0,
  },
  pinsPanelHeader: {
    padding: "8px 16px",
    fontSize: "12px",
    fontWeight: 700,
    color: "var(--text-muted)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.02em",
    borderBottom: "1px solid var(--border)",
  },
  pinsPanelEmpty: {
    padding: "24px 16px",
    textAlign: "center" as const,
    color: "var(--text-muted)",
    fontSize: "13px",
  },
  pinItem: {
    padding: "10px 16px",
    borderBottom: "1px solid var(--border)",
  },
  pinItemAuthor: {
    fontSize: "13px",
    fontWeight: 600,
    marginBottom: "2px",
  },
  pinItemContent: {
    fontSize: "13px",
    color: "var(--text-secondary)",
    wordBreak: "break-word" as const,
  },
  pinItemDate: {
    fontSize: "11px",
    color: "var(--text-muted)",
    marginTop: "4px",
  },
  searchInput: {
    width: "100%",
    padding: "8px 12px",
    background: "var(--input-bg)",
    border: "1px solid var(--border)",
    borderRadius: "4px",
    color: "var(--text-primary)",
    fontSize: "13px",
    outline: "none",
  },
  searchHint: {
    marginTop: "4px",
    fontSize: "11px",
    color: "var(--text-muted)",
  },
};
