import React, { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type DragEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useChatStore } from "../stores/chat";
import { useAuthStore } from "../stores/auth";
import { usePresenceStore } from "../stores/presence";
import { sendWs } from "../lib/ws";
import { api } from "../lib/api";
import { avatarColor, avatarUrl } from "../lib/avatar";
import { Permissions, hasPermission, type ReactionGroup } from "@concord/shared";
import { GifPicker } from "./GifPicker";
import { LinkPreview } from "./LinkPreview";
import { Lightbox } from "./Lightbox";
import { ProfileCard } from "./ProfileCard";
import { MarkdownContent } from "./MarkdownContent";
import { MentionDropdown, useMentionAutocomplete } from "./MentionAutocomplete";
import { EmojiPicker } from "./EmojiPicker";

const IMAGE_REGEX = /\.(png|jpe?g|gif|webp)$/i;
const UPLOAD_URL_REGEX = /^\/uploads\/.+/;
import { SERVER_URL as SERVER_BASE } from "../lib/config";
const GROUP_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

function isImageUrl(text: string): boolean {
  return IMAGE_REGEX.test(text) || (UPLOAD_URL_REGEX.test(text) && IMAGE_REGEX.test(text));
}

function formatDateSeparator(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export function ChatArea() {
  const { channelId } = useParams();
  const navigate = useNavigate();
  const messages = useChatStore((s) => s.messages);
  const channels = useChatStore((s) => s.channels);
  const hasMore = useChatStore((s) => s.hasMoreMessages);
  const setMessages = useChatStore((s) => s.setMessages);
  const setMessagesLoading = useChatStore((s) => s.setMessagesLoading);
  const prependMessages = useChatStore((s) => s.prependMessages);
  const setActiveChannel = useChatStore((s) => s.setActiveChannel);
  const userId = useAuthStore((s) => s.user?.id);
  const messagesLoading = useChatStore((s) => s.messagesLoading);
  const [input, setInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [profilePopup, setProfilePopup] = useState<{ userId: string; x: number; y: number } | null>(null);
  const [cursorPos, setCursorPos] = useState(0);
  const chatInputRef = useRef<HTMLInputElement>(null);

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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
    }).catch(() => {});
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

  // Load messages and subscribe to WS channel
  useEffect(() => {
    if (!channelId) return;
    let stale = false;
    setActiveChannel(channelId);
    setMessagesLoading(true);

    api.getMessages(channelId).then((res) => {
      if (stale) return;
      setMessages(res.messages, res.hasMore);
      // Scroll to bottom after messages render
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView();
      });
    });

    sendWs({ type: "subscribe_channel", channelId });
    return () => {
      stale = true;
      sendWs({ type: "unsubscribe_channel", channelId });
    };
  }, [channelId]);

  // Load older messages
  const loadOlder = useCallback(async () => {
    if (!channelId || messages.length === 0 || loadingMore) return;
    const container = messagesContainerRef.current;
    const prevHeight = container?.scrollHeight ?? 0;
    setLoadingMore(true);
    try {
      const res = await api.getMessages(channelId, messages[0].createdAt);
      prependMessages(res.messages, res.hasMore);
      requestAnimationFrame(() => {
        if (container) {
          container.scrollTop = container.scrollHeight - prevHeight;
        }
      });
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (mention.isOpen) return; // Don't submit while mention dropdown is open
    if (!input.trim() || !channelId) return;
    sendWs({ type: "send_message", channelId, content: input.trim() });
    setInput("");
    setCursorPos(0);
  };

  const handleFileUpload = useCallback(
    async (file: File) => {
      if (!channelId) return;
      setUploading(true);
      try {
        const result = await api.uploadFile(file);
        sendWs({
          type: "send_message",
          channelId,
          content: result.url,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        setUploadError(msg);
        setTimeout(() => setUploadError(""), 5000);
      } finally {
        setUploading(false);
      }
    },
    [channelId]
  );

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileUpload(file);
    },
    [handleFileUpload]
  );

  const handleFileSelect = useCallback(() => {
    const file = fileInputRef.current?.files?.[0];
    if (file) handleFileUpload(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [handleFileUpload]);

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

  const handleDelete = (msgId: string) => {
    if (confirmDeleteId === msgId) {
      sendWs({ type: "delete_message", messageId: msgId });
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(msgId);
      setTimeout(() => setConfirmDeleteId((curr) => curr === msgId ? null : curr), 2000);
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
      // Refresh messages to reflect pin state
      if (channelId) {
        const res = await api.getMessages(channelId);
        setMessages(res.messages, res.hasMore);
      }
    } catch { /* ignore */ }
  };

  // Pinned messages panel
  const [showPins, setShowPins] = useState(false);
  const [pinnedMessages, setPinnedMessages] = useState<Array<{ id: string; content: string; createdAt: string; author: any }>>([]);
  useEffect(() => {
    if (!showPins || !channelId) return;
    api.getPinnedMessages(channelId).then((res) => setPinnedMessages(res.pins)).catch(() => {});
  }, [showPins, channelId]);

  // Message search
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ id: string; channelId: string; channelName: string; content: string; createdAt: string; author: any }>>([]);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    if (!showSearch || searchQuery.trim().length < 2 || !serverId) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      api.searchMessages({ q: searchQuery.trim(), serverId })
        .then((res) => setSearchResults(res.results))
        .catch(() => setSearchResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, showSearch, serverId]);

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
        ...styles.container,
        ...(dragOver ? { outline: "2px dashed var(--accent)" } : {}),
      }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <div style={styles.header}>
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
              <div key={pin.id} style={styles.pinItem}>
                <div style={styles.pinItemAuthor}>{pin.author?.displayName ?? "Unknown"}</div>
                <div style={styles.pinItemContent}>{pin.content}</div>
                <div style={styles.pinItemDate}>{new Date(pin.createdAt).toLocaleDateString()}</div>
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
          </div>
          {searching && (
            <div style={styles.pinsPanelEmpty}>Searching...</div>
          )}
          {!searching && searchQuery.trim().length >= 2 && searchResults.length === 0 && (
            <div style={styles.pinsPanelEmpty}>No results found</div>
          )}
          {!searching && searchQuery.trim().length < 2 && searchQuery.trim().length > 0 && (
            <div style={styles.pinsPanelEmpty}>Type at least 2 characters</div>
          )}
          {searchResults.map((result) => (
            <div
              key={result.id}
              style={{ ...styles.pinItem, cursor: "pointer" }}
              className="hover-bg"
              onClick={() => {
                navigate(`/channels/${serverId}/${result.channelId}`);
                setShowSearch(false);
                setSearchQuery("");
              }}
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

      <div ref={messagesContainerRef} style={styles.messages}>
        {hasMore && !messagesLoading && (
          <div style={styles.loadMoreContainer}>
            <button
              onClick={loadOlder}
              disabled={loadingMore}
              style={styles.loadMoreButton}
            >
              {loadingMore ? "Loading..." : "Load older messages"}
            </button>
          </div>
        )}
        {messagesLoading && (
          <div style={styles.skeletonContainer}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="skeleton-message">
                <div className="skeleton-avatar skeleton-pulse" />
                <div className="skeleton-content">
                  <div className="skeleton-header skeleton-pulse" style={{ width: `${60 + (i % 3) * 30}px` }} />
                  <div className="skeleton-line skeleton-pulse" style={{ width: `${120 + (i % 4) * 50}px` }} />
                  {i % 2 === 0 && <div className="skeleton-line skeleton-pulse" style={{ width: `${80 + (i % 3) * 40}px` }} />}
                </div>
              </div>
            ))}
          </div>
        )}

        {!messagesLoading && messages.length === 0 && (
          <div style={styles.emptyState}>
            <h2 style={styles.emptyTitle}>
              Welcome to #{channel?.name ?? "channel"}
            </h2>
            <p style={styles.emptySubtitle}>
              This is the beginning of the #{channel?.name ?? "channel"} channel.
            </p>
          </div>
        )}

        {messages.map((msg, i) => {
          const prev = i > 0 ? messages[i - 1] : null;
          const msgDate = new Date(msg.createdAt);
          const prevDate = prev ? new Date(prev.createdAt) : null;
          const showDateSep = !prevDate ||
            msgDate.toDateString() !== prevDate.toDateString();

          const isGrouped =
            !showDateSep &&
            prev !== null &&
            prev.authorId === msg.authorId &&
            msgDate.getTime() - prevDate!.getTime() < GROUP_THRESHOLD_MS;

          const dateSeparator = showDateSep ? (
            <div key={`sep-${msg.id}`} className="date-separator">
              <span className="date-separator-text">{formatDateSeparator(msgDate)}</span>
            </div>
          ) : null;

          if (isGrouped) {
            const isOwnG = msg.authorId === userId;
            const isHoveredG = hoveredMsgId === msg.id;
            const isEditingG = editingMsgId === msg.id;

            return (
              <div
                key={msg.id}
                className="message-grouped hover-bg"
                style={styles.messageGrouped}
                onMouseEnter={() => setHoveredMsgId(msg.id)}
                onMouseLeave={() => setHoveredMsgId(null)}
              >
                <span className="grouped-timestamp" style={styles.groupedTimestamp}>
                  {new Date(msg.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <div style={styles.groupedContent}>
                  {isEditingG ? (
                    <MessageActions
                      msgId={msg.id} content={msg.content} isOwn={isOwnG} canModerate={canModerate} isPinned={!!msg.pinnedAt}
                      isHovered={isHoveredG} isEditing={true} editContent={editContent}
                      confirmDeleteId={confirmDeleteId}
                      showReactionPicker={reactionPickerMsgId === msg.id} onReact={(id) => setReactionPickerMsgId((prev) => prev === id ? null : id)} onStartEdit={handleStartEdit} onDelete={handleDelete} onPin={handlePin}
                      onSaveEdit={handleSaveEdit} onCancelEdit={handleCancelEdit}
                      onEditChange={setEditContent}
                    />
                  ) : (
                    <>
                      <MessageBody content={msg.content} onImageClick={setLightboxSrc} mentionUsers={mentionUsers} />
                      {msg.editedAt && <span style={styles.editedTag}>(edited)</span>}
                    </>
                  )}
                </div>
                {!isEditingG && (
                  <MessageActions
                    msgId={msg.id} content={msg.content} isOwn={isOwnG} canModerate={canModerate} isPinned={!!msg.pinnedAt}
                    isHovered={isHoveredG} isEditing={false} editContent={editContent}
                    confirmDeleteId={confirmDeleteId}
                    showReactionPicker={reactionPickerMsgId === msg.id} onReact={(id) => setReactionPickerMsgId((prev) => prev === id ? null : id)} onStartEdit={handleStartEdit} onDelete={handleDelete} onPin={handlePin}
                    onSaveEdit={handleSaveEdit} onCancelEdit={handleCancelEdit}
                    onEditChange={setEditContent}
                  />
                )}
              </div>
            );
          }

          const isOwn = msg.authorId === userId;
          const isHovered = hoveredMsgId === msg.id;
          const isEditing = editingMsgId === msg.id;

          return (
            <React.Fragment key={msg.id}>
              {dateSeparator}
              <div
                className="hover-bg"
                style={styles.message}
                onMouseEnter={() => setHoveredMsgId(msg.id)}
                onMouseLeave={() => setHoveredMsgId(null)}
              >
                <div
                  style={{ cursor: "pointer", flexShrink: 0, alignSelf: "flex-start" }}
                  onClick={(e) => { e.stopPropagation(); setProfilePopup({ userId: msg.authorId, x: e.clientX, y: e.clientY }); }}
                >
                  {avatarUrl(msg.author?.avatarUrl) ? (
                    <img
                      style={{ ...styles.avatar, objectFit: "cover" }}
                      src={avatarUrl(msg.author?.avatarUrl)!}
                      alt=""
                    />
                  ) : (
                    <div style={{ ...styles.avatar, background: avatarColor(msg.authorId) }}>
                      {(msg.author?.displayName ?? "?").charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div style={styles.messageContent}>
                  <div style={styles.messageHeader}>
                    <span
                      style={{ ...styles.authorName, cursor: "pointer" }}
                      onClick={(e) => { e.stopPropagation(); setProfilePopup({ userId: msg.authorId, x: e.clientX, y: e.clientY }); }}
                    >
                      {msg.author?.displayName ?? "Unknown"}
                    </span>
                    <span style={styles.timestamp}>
                      {new Date(msg.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  {isEditing ? (
                    <MessageActions
                      msgId={msg.id} content={msg.content} isOwn={isOwn} canModerate={canModerate} isPinned={!!msg.pinnedAt}
                      isHovered={isHovered} isEditing={true} editContent={editContent}
                      confirmDeleteId={confirmDeleteId}
                      showReactionPicker={reactionPickerMsgId === msg.id} onReact={(id) => setReactionPickerMsgId((prev) => prev === id ? null : id)} onStartEdit={handleStartEdit} onDelete={handleDelete} onPin={handlePin}
                      onSaveEdit={handleSaveEdit} onCancelEdit={handleCancelEdit}
                      onEditChange={setEditContent}
                    />
                  ) : (
                    <>
                      <MessageBody content={msg.content} onImageClick={setLightboxSrc} mentionUsers={mentionUsers} />
                      {msg.editedAt && <span style={styles.editedTag}>(edited)</span>}
                    </>
                  )}
                  <ReactionBar reactions={msg.reactions} messageId={msg.id} userId={userId} />
                </div>
                {!isEditing && (
                  <MessageActions
                    msgId={msg.id} content={msg.content} isOwn={isOwn} canModerate={canModerate} isPinned={!!msg.pinnedAt}
                    isHovered={isHovered} isEditing={false} editContent={editContent}
                    confirmDeleteId={confirmDeleteId}
                    showReactionPicker={reactionPickerMsgId === msg.id} onReact={(id) => setReactionPickerMsgId((prev) => prev === id ? null : id)} onStartEdit={handleStartEdit} onDelete={handleDelete} onPin={handlePin}
                    onSaveEdit={handleSaveEdit} onCancelEdit={handleCancelEdit}
                    onEditChange={setEditContent}
                  />
                )}
              </div>
            </React.Fragment>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <div style={{ ...styles.inputArea, position: "relative" as const }}>
        {showGifPicker && (
          <GifPicker
            onSelect={(gifUrl) => {
              if (channelId) {
                sendWs({ type: "send_message", channelId, content: gifUrl });
              }
              setShowGifPicker(false);
            }}
            onClose={() => setShowGifPicker(false)}
          />
        )}
        {uploadError && <div style={styles.uploadError}>{uploadError}</div>}
        {typingText && <div style={styles.typingIndicator}>{typingText}</div>}
        {mention.isOpen && (
          <MentionDropdown
            filtered={mention.filtered}
            activeIndex={mention.activeIndex}
            onSelect={mention.selectMember}
            listRef={mention.listRef}
          />
        )}
        <form onSubmit={handleSubmit} style={styles.inputContainer}>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            style={{ display: "none" }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={styles.uploadButton}
            disabled={uploading}
            title="Upload file"
          >
            +
          </button>
          <input
            ref={chatInputRef}
            style={styles.input}
            placeholder={
              uploading
                ? "Uploading..."
                : `Message #${channel?.name ?? "channel"}`
            }
            value={input}
            onChange={handleInputChange}
            onKeyDown={(e) => {
              mention.handleKeyDown(e);
              if (e.defaultPrevented) return;
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
            disabled={uploading}
            autoFocus
          />
          <button
            type="button"
            onClick={() => { setShowEmojiPicker(!showEmojiPicker); setShowGifPicker(false); }}
            style={styles.gifButton}
            title="Emoji"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M8 14s1.5 2 4 2 4-2 4-2" />
              <line x1="9" y1="9" x2="9.01" y2="9" />
              <line x1="15" y1="9" x2="15.01" y2="9" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => { setShowGifPicker(!showGifPicker); setShowEmojiPicker(false); }}
            style={styles.gifButton}
            title="Send a GIF"
          >
            GIF
          </button>
        </form>
        {showEmojiPicker && (
          <EmojiPicker
            onSelect={(emoji) => {
              const pos = chatInputRef.current?.selectionStart ?? input.length;
              const before = input.slice(0, pos);
              const after = input.slice(pos);
              setInput(before + emoji + after);
              setShowEmojiPicker(false);
              requestAnimationFrame(() => {
                const newPos = pos + emoji.length;
                chatInputRef.current?.setSelectionRange(newPos, newPos);
                chatInputRef.current?.focus();
              });
            }}
            onClose={() => setShowEmojiPicker(false)}
          />
        )}
      </div>
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

function MessageActions({
  msgId,
  content,
  isOwn,
  canModerate,
  isPinned,
  isHovered,
  isEditing,
  editContent,
  confirmDeleteId,
  showReactionPicker,
  onReact,
  onStartEdit,
  onDelete,
  onPin,
  onSaveEdit,
  onCancelEdit,
  onEditChange,
}: {
  msgId: string;
  content: string;
  isOwn: boolean;
  canModerate: boolean;
  isPinned: boolean;
  isHovered: boolean;
  isEditing: boolean;
  editContent: string;
  confirmDeleteId: string | null;
  showReactionPicker: boolean;
  onReact: (msgId: string) => void;
  onStartEdit: (id: string, content: string) => void;
  onDelete: (id: string) => void;
  onPin: (id: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onEditChange: (val: string) => void;
}) {
  if (isEditing) {
    return (
      <div style={styles.editContainer}>
        <input
          style={styles.editInput}
          value={editContent}
          onChange={(e) => onEditChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSaveEdit();
            if (e.key === "Escape") onCancelEdit();
          }}
          autoFocus
        />
        <span style={styles.editHint}>
          escape to cancel, enter to save
        </span>
      </div>
    );
  }

  if (!isHovered && !showReactionPicker) return null;

  return (
    <div className="msg-action-bar">
      {showReactionPicker && (
        <div className="emoji-picker-float" onClick={(e) => e.stopPropagation()}>
          {QUICK_EMOJIS.map((e) => (
            <button
              key={e}
              className="emoji-picker-btn hover-bg"
              onClick={() => {
                sendWs({ type: "toggle_reaction", messageId: msgId, emoji: e });
                onReact(msgId);
              }}
            >
              {e}
            </button>
          ))}
        </div>
      )}

      <button className="msg-action-btn" onClick={() => onReact(msgId)} title="Add reaction">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M8 14s1.5 2 4 2 4-2 4-2" />
          <line x1="9" y1="9" x2="9.01" y2="9" />
          <line x1="15" y1="9" x2="15.01" y2="9" />
        </svg>
      </button>
      {canModerate && (
        <button className="msg-action-btn" onClick={() => onPin(msgId)} title={isPinned ? "Unpin" : "Pin"}>
          {isPinned ? "Unpin" : "Pin"}
        </button>
      )}
      {isOwn && (
        <button className="msg-action-btn" onClick={() => onStartEdit(msgId, content)}>
          Edit
        </button>
      )}
      {(isOwn || canModerate) && (
        <button
          className={`msg-action-btn ${confirmDeleteId === msgId ? "msg-action-btn--confirm" : "msg-action-btn--danger"}`}
          onClick={() => onDelete(msgId)}
        >
          {confirmDeleteId === msgId ? "Sure?" : "Del"}
        </button>
      )}
    </div>
  );
}

const EXTERNAL_IMAGE_REGEX = /^https?:\/\/.+\.(gif|png|jpe?g|webp)(\?.*)?$/i;
const EXTERNAL_GIF_DOMAIN_REGEX = /^https?:\/\/(static\.klipy\.com|media[0-9]*\.giphy\.com|media\.tenor\.com)\//i;

/** Renders message content with inline image previews for uploaded files and GIFs. */
function MessageBody({ content, onImageClick, mentionUsers }: { content: string; onImageClick?: (src: string) => void; mentionUsers?: Map<string, string> }) {
  // External GIF/image URL (from Klipy, Giphy, Tenor, or any direct image link)
  const trimmed = content.trim();
  if (EXTERNAL_GIF_DOMAIN_REGEX.test(trimmed) || (EXTERNAL_IMAGE_REGEX.test(trimmed) && trimmed.startsWith("http"))) {
    return (
      <div>
        <img
          className="chat-image-clickable"
          src={trimmed}
          alt="GIF"
          style={styles.gifEmbed}
          loading="lazy"
          onClick={() => onImageClick?.(trimmed)}
        />
      </div>
    );
  }

  if (UPLOAD_URL_REGEX.test(content) && isImageUrl(content)) {
    return (
      <div>
        <img
          className="chat-image-clickable"
          src={`${SERVER_BASE}${content}`}
          alt="uploaded image"
          style={styles.imageEmbed}
          loading="lazy"
          onClick={() => onImageClick?.(`${SERVER_BASE}${content}`)}
        />
      </div>
    );
  }

  if (UPLOAD_URL_REGEX.test(content)) {
    const filename = content.split("/").pop() ?? "file";
    return (
      <a
        href={`${SERVER_BASE}${content}`}
        target="_blank"
        rel="noopener noreferrer"
        style={styles.fileLink}
      >
        {filename}
      </a>
    );
  }

  return (
    <div>
      <div style={styles.messageText}>
        <MarkdownContent content={content} mentionUsers={mentionUsers} />
      </div>
      <LinkPreview content={content} />
    </div>
  );
}


const QUICK_EMOJIS = ["👍", "❤️", "😂", "🎉", "😮", "😢", "🔥", "👀"];

function ReactionBar({ reactions, messageId, userId }: {
  reactions?: ReactionGroup[];
  messageId: string;
  userId?: string;
}) {
  const hasReactions = (reactions ?? []).length > 0;
  if (!hasReactions) return null;

  return (
    <div className="reaction-bar">
      {reactions!.map((r) => {
        const isMine = r.userIds.includes(userId ?? "");
        return (
          <button
            key={r.emoji}
            className={`reaction-pill ${isMine ? "reaction-pill--mine" : ""}`}
            onClick={() => sendWs({ type: "toggle_reaction", messageId, emoji: r.emoji })}
          >
            <span className="reaction-pill-emoji">{r.emoji}</span>
            <span className="reaction-pill-count">{r.count}</span>
          </button>
        );
      })}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-chat)",
    minWidth: 0,
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    height: "48px",
    padding: "0 16px",
    borderBottom: "1px solid var(--bg-primary)",
    boxShadow: "0 1px 0 rgba(0,0,0,0.2)",
    flexShrink: 0,
  },
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
  messages: {
    flex: 1,
    overflowY: "auto",
    padding: "16px 0",
  },
  loadMoreContainer: {
    display: "flex",
    justifyContent: "center",
    padding: "8px 16px",
  },
  loadMoreButton: {
    padding: "6px 16px",
    background: "var(--bg-secondary)",
    border: "none",
    borderRadius: "4px",
    color: "var(--text-secondary)",
    fontSize: "13px",
    cursor: "pointer",
  },
  skeletonContainer: {
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "48px 16px",
    textAlign: "center",
  },
  emptyTitle: {
    fontSize: "24px",
    fontWeight: 700,
    marginBottom: "8px",
  },
  emptySubtitle: {
    color: "var(--text-muted)",
    fontSize: "14px",
  },
  message: {
    display: "flex",
    gap: "16px",
    padding: "2px 16px",
    marginTop: "16px",
    position: "relative",
  },
  messageGrouped: {
    display: "flex",
    alignItems: "flex-start",
    padding: "1px 16px",
    paddingLeft: "16px",
    position: "relative",
  },
  groupedTimestamp: {
    width: "40px",
    fontSize: "10px",
    color: "transparent",
    textAlign: "right",
    paddingRight: "4px",
    paddingTop: "2px",
    flexShrink: 0,
    userSelect: "none",
  },
  groupedContent: {
    flex: 1,
    marginLeft: "16px",
  },
  avatar: {
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    background: "var(--accent)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 600,
    fontSize: "16px",
    flexShrink: 0,
  },
  messageContent: {
    minWidth: 0,
    flex: 1,
  },
  messageHeader: {
    display: "flex",
    alignItems: "baseline",
    gap: "8px",
    marginBottom: "2px",
  },
  authorName: {
    fontWeight: 600,
    fontSize: "14px",
  },
  timestamp: {
    fontSize: "11px",
    color: "var(--text-muted)",
  },
  messageText: {
    color: "var(--text-secondary)",
    wordBreak: "break-word",
  },
  editedTag: {
    fontSize: "11px",
    color: "var(--text-muted)",
    marginLeft: "4px",
  },
  actionBar: {
    position: "absolute",
    top: "-12px",
    right: "16px",
    display: "flex",
    gap: "2px",
    background: "var(--bg-secondary)",
    borderRadius: "4px",
    padding: "2px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
    zIndex: 1,
  },
  actionButton: {
    padding: "2px 8px",
    background: "transparent",
    border: "none",
    borderRadius: "3px",
    color: "var(--text-muted)",
    fontSize: "12px",
    cursor: "pointer",
  },
  editContainer: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  editInput: {
    padding: "8px 12px",
    background: "var(--input-bg)",
    border: "1px solid var(--accent)",
    borderRadius: "4px",
    color: "var(--text-primary)",
    fontSize: "14px",
    outline: "none",
  },
  editHint: {
    fontSize: "11px",
    color: "var(--text-muted)",
  },
  imageEmbed: {
    maxWidth: "400px",
    maxHeight: "300px",
    borderRadius: "8px",
    marginTop: "4px",
    cursor: "pointer",
  },
  fileLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "8px 12px",
    background: "var(--bg-secondary)",
    borderRadius: "6px",
    color: "var(--accent)",
    fontSize: "13px",
    marginTop: "4px",
    textDecoration: "none",
  },
  inputArea: {
    flexShrink: 0,
  },
  uploadError: {
    padding: "6px 16px",
    fontSize: "12px",
    color: "var(--danger)",
    background: "rgba(237, 66, 69, 0.1)",
    borderRadius: "4px",
    margin: "0 16px 4px",
  },
  typingIndicator: {
    padding: "0 16px 4px",
    fontSize: "12px",
    color: "var(--text-muted)",
    fontStyle: "italic",
    height: "18px",
  },
  inputContainer: {
    padding: "0 16px 24px",
    display: "flex",
    gap: "8px",
  },
  uploadButton: {
    width: "44px",
    height: "44px",
    background: "var(--bg-secondary)",
    border: "none",
    borderRadius: "8px",
    color: "var(--text-muted)",
    fontSize: "22px",
    cursor: "pointer",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    flex: 1,
    padding: "12px 16px",
    background: "var(--input-bg)",
    border: "none",
    borderRadius: "8px",
    color: "var(--text-primary)",
    fontSize: "14px",
    outline: "none",
  },
  gifButton: {
    padding: "6px 10px",
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: "6px",
    color: "var(--text-muted)",
    fontSize: "11px",
    fontWeight: 700,
    cursor: "pointer",
    flexShrink: 0,
    letterSpacing: "0.02em",
    transition: "color 0.15s, border-color 0.15s",
  },
  gifEmbed: {
    maxWidth: "300px",
    maxHeight: "250px",
    borderRadius: "8px",
    marginTop: "4px",
  },
};
