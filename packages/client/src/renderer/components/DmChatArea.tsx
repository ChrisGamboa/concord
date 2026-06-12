import React, { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useParams } from "react-router-dom";
import { useAuthStore } from "../stores/auth";
import { useChatStore } from "../stores/chat";
import { usePresenceStore } from "../stores/presence";
import { toast } from "../stores/toast";
import { api } from "../lib/api";
import { avatarColor, avatarUrl } from "../lib/avatar";
import { onWsMessage, sendWs } from "../lib/ws";
import type { ReactionGroup } from "@concord/shared";
import { GifPicker } from "./GifPicker";
import { Lightbox } from "./Lightbox";
import { EmojiPicker } from "./EmojiPicker";
import { MessageList, type MessageListHandle } from "./chat/MessageList";
import { MessageActions, MessageBody, ReactionBar, SendFailureNotice, type ListMessage } from "./chat/MessageParts";

interface DmMessage extends ListMessage {
  conversationId: string;
  editedAt?: string | null;
  reactions?: ReactionGroup[];
  author?: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

interface OtherUser {
  id: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  status: string | null;
}

export function DmChatArea() {
  const { channelId: conversationId } = useParams();
  const userId = useAuthStore((s) => s.user?.id);
  const clearDmUnread = useChatStore((s) => s.clearDmUnread);
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [input, setInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [otherUser, setOtherUser] = useState<OtherUser | null>(null);
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState<string | null>(null);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const listRef = useRef<MessageListHandle>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close reaction picker / delete confirm on click-outside or Escape
  useEffect(() => {
    if (!reactionPickerMsgId && !confirmDeleteId) return;
    const close = () => {
      setReactionPickerMsgId(null);
      setConfirmDeleteId(null);
    };
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
  }, [reactionPickerMsgId, confirmDeleteId]);

  // Viewing a conversation clears its unread state
  useEffect(() => {
    if (conversationId) clearDmUnread(conversationId);
  }, [conversationId, clearDmUnread]);

  // Load conversation info
  useEffect(() => {
    if (!conversationId) return;
    api.getConversations().then((res) => {
      const conv = res.conversations.find((c) => c.id === conversationId);
      if (conv) setOtherUser(conv.otherUser);
    }).catch(() => {});
  }, [conversationId]);

  // Load messages
  useEffect(() => {
    if (!conversationId) return;
    let stale = false;
    setLoading(true);
    setMessages([]);
    api.getDmMessages(conversationId).then((res) => {
      if (stale) return;
      setMessages(res.messages);
      setHasMore(res.hasMore);
      requestAnimationFrame(() => listRef.current?.scrollToBottom());
    }).catch(() => toast("Failed to load messages")).finally(() => {
      if (!stale) setLoading(false);
    });
    return () => { stale = true; };
  }, [conversationId]);

  // Live updates for this conversation
  useEffect(() => {
    return onWsMessage((msg) => {
      if (msg.type === "dm_created" && msg.message.conversationId === conversationId) {
        const dm = msg.message as DmMessage;
        setMessages((prev) => {
          if (prev.some((m) => m.id === dm.id)) return prev;
          // Our own echo: the REST response reconciles the pending copy instead
          if (dm.authorId === userId && prev.some((m) => m.pending && m.content === dm.content)) return prev;
          return [...prev, dm];
        });
      } else if (msg.type === "dm_updated" && msg.message.conversationId === conversationId) {
        setMessages((prev) => prev.map((m) => (m.id === msg.message.id ? { ...m, ...(msg.message as DmMessage) } : m)));
      } else if (msg.type === "dm_deleted" && msg.conversationId === conversationId) {
        setMessages((prev) => prev.filter((m) => m.id !== msg.messageId));
      } else if (msg.type === "dm_reaction_update" && msg.conversationId === conversationId) {
        setMessages((prev) => prev.map((m) => (m.id === msg.messageId ? { ...m, reactions: msg.reactions } : m)));
      }
    });
  }, [conversationId, userId]);

  // Load older messages (MessageList keeps the viewport anchored on prepend)
  const loadOlder = useCallback(async () => {
    if (!conversationId || messages.length === 0 || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api.getDmMessages(conversationId, messages[0].createdAt);
      setMessages((prev) => [...res.messages, ...prev]);
      setHasMore(res.hasMore);
    } catch {
      toast("Failed to load older messages");
    } finally {
      setLoadingMore(false);
    }
  }, [conversationId, messages, loadingMore]);

  // Optimistic send: pending until the POST resolves, failed with retry on error
  const sendDmMessage = useCallback(async (content: string, existingTempId?: string) => {
    if (!conversationId || !userId) return;
    const tempId = existingTempId ?? `pending-${crypto.randomUUID()}`;
    if (existingTempId) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: true, failed: false } : m)));
    } else {
      const me = useAuthStore.getState().user;
      setMessages((prev) => [...prev, {
        id: tempId,
        conversationId,
        authorId: userId,
        content,
        createdAt: new Date().toISOString(),
        editedAt: null,
        reactions: [],
        author: me ? { id: me.id, displayName: me.displayName, avatarUrl: me.avatarUrl } : undefined,
        pending: true,
        nonce: tempId,
      }]);
    }
    try {
      const created = await api.sendDm(conversationId, content);
      setMessages((prev) => {
        if (prev.some((m) => m.id === created.id)) {
          return prev.filter((m) => m.id !== tempId);
        }
        return prev.map((m) => (m.id === tempId ? created : m));
      });
    } catch {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)));
    }
  }, [conversationId, userId]);

  const handleSend = () => {
    if (!input.trim() || !conversationId) return;
    const content = input.trim();
    setInput("");
    sendDmMessage(content);
  };

  const sendTyping = useCallback(() => {
    if (!conversationId) return;
    if (typingTimeoutRef.current) return;
    sendWs({ type: "dm_typing", conversationId });
    typingTimeoutRef.current = setTimeout(() => {
      typingTimeoutRef.current = null;
    }, 2000);
  }, [conversationId]);

  const handleFileUpload = useCallback(async (file: File) => {
    if (!conversationId) return;
    setUploading(true);
    try {
      const result = await api.uploadFile(file);
      sendDmMessage(result.url);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [conversationId, sendDmMessage]);

  const handleStartEdit = (msgId: string, content: string) => {
    setEditingMsgId(msgId);
    setEditContent(content);
  };

  const handleSaveEdit = async () => {
    if (!editingMsgId || !editContent.trim()) return;
    const msgId = editingMsgId;
    const content = editContent.trim();
    setEditingMsgId(null);
    setEditContent("");
    try {
      const updated = await api.editDm(msgId, content);
      setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, ...updated } : m)));
    } catch {
      toast("Failed to edit message");
    }
  };

  const handleDelete = async (msgId: string, skipConfirm: boolean) => {
    if (!skipConfirm && confirmDeleteId !== msgId) {
      setConfirmDeleteId(msgId);
      return;
    }
    setConfirmDeleteId(null);
    try {
      await api.deleteDm(msgId);
      setMessages((prev) => prev.filter((m) => m.id !== msgId));
    } catch {
      toast("Failed to delete message");
    }
  };

  const toggleReaction = useCallback((msgId: string, emoji: string) => {
    api.toggleDmReaction(msgId, emoji).then((res) => {
      setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, reactions: res.reactions } : m)));
    }).catch(() => toast("Failed to update reaction"));
  }, []);

  const typingUsersMap = usePresenceStore((s) => s.typingUsers);
  const typingText = useMemo(() => {
    if (!conversationId) return null;
    for (const [key, val] of typingUsersMap) {
      if (key.startsWith(`${conversationId}:`)) return `${val.username} is typing...`;
    }
    return null;
  }, [conversationId, typingUsersMap]);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }, [handleFileUpload]);

  if (!conversationId) {
    return (
      <div style={styles.container}>
        <div style={styles.emptyState}>
          <h2 style={styles.emptyTitle}>Direct Messages</h2>
          <p style={styles.emptySubtitle}>Select a conversation or start a new one</p>
        </div>
      </div>
    );
  }

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
        <span style={styles.atIcon}>@</span>
        <span style={styles.headerName}>{otherUser?.displayName ?? "..."}</span>
        {otherUser?.status && (
          <span style={styles.headerStatus}>{otherUser.status}</span>
        )}
      </div>

      <MessageList<DmMessage>
        ref={listRef}
        messages={messages}
        loading={loading}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadOlder={loadOlder}
        currentUserId={userId}
        resetKey={conversationId}
        rowElevated={(m) => hoveredMsgId === m.id || reactionPickerMsgId === m.id || confirmDeleteId === m.id}
        emptyState={
          otherUser ? (
            <div style={styles.emptyState}>
              <h2 style={styles.emptyTitle}>{otherUser.displayName}</h2>
              <p style={styles.emptySubtitle}>
                This is the beginning of your conversation with {otherUser.displayName}.
              </p>
            </div>
          ) : null
        }
        renderMessage={(msg, { isGrouped }) => {
          const isOwn = msg.authorId === userId;
          const isHovered = hoveredMsgId === msg.id;
          const isEditing = editingMsgId === msg.id;

          const actions = (editing: boolean) => (
            <MessageActions
              msgId={msg.id} content={msg.content} isOwn={isOwn} canModerate={false} isPinned={false}
              isHovered={isHovered} isEditing={editing} editContent={editContent}
              confirmDeleteId={confirmDeleteId} onCancelDelete={() => setConfirmDeleteId(null)}
              showReactionPicker={reactionPickerMsgId === msg.id}
              onReact={(id) => setReactionPickerMsgId((prev) => prev === id ? null : id)}
              onToggleReaction={toggleReaction}
              onStartEdit={handleStartEdit} onDelete={handleDelete}
              onSaveEdit={handleSaveEdit} onCancelEdit={() => { setEditingMsgId(null); setEditContent(""); }}
              onEditChange={setEditContent}
            />
          );

          if (isGrouped) {
            return (
              <div
                className="message-grouped hover-bg"
                style={styles.messageGrouped}
                onMouseEnter={() => setHoveredMsgId(msg.id)}
                onMouseLeave={() => setHoveredMsgId(null)}
              >
                <span className="grouped-timestamp" style={styles.groupedTimestamp}>
                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                <div style={{ ...styles.groupedContent, ...(msg.pending ? styles.pendingContent : {}) }}>
                  {isEditing ? (
                    actions(true)
                  ) : (
                    <>
                      <MessageBody content={msg.content} onImageClick={setLightboxSrc} />
                      {msg.editedAt && <span style={styles.editedTag}>(edited)</span>}
                      {msg.failed && msg.nonce && (
                        <SendFailureNotice
                          onRetry={() => sendDmMessage(msg.content, msg.nonce)}
                          onDiscard={() => setMessages((prev) => prev.filter((m) => m.id !== msg.id))}
                        />
                      )}
                    </>
                  )}
                </div>
                {!isEditing && !msg.pending && !msg.failed && actions(false)}
              </div>
            );
          }

          return (
            <div
              className="hover-bg"
              style={styles.message}
              onMouseEnter={() => setHoveredMsgId(msg.id)}
              onMouseLeave={() => setHoveredMsgId(null)}
            >
              {avatarUrl(msg.author?.avatarUrl) ? (
                <img
                  style={{ ...styles.avatar, objectFit: "cover" as const }}
                  src={avatarUrl(msg.author?.avatarUrl)!}
                  alt=""
                />
              ) : (
                <div style={{ ...styles.avatar, background: avatarColor(msg.authorId) }}>
                  {(msg.author?.displayName ?? "?").charAt(0).toUpperCase()}
                </div>
              )}
              <div style={{ ...styles.messageContent, ...(msg.pending ? styles.pendingContent : {}) }}>
                <div style={styles.messageHeader}>
                  <span style={styles.authorName}>
                    {msg.author?.displayName ?? "Unknown"}
                  </span>
                  <span style={styles.timestamp}>
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                {isEditing ? (
                  actions(true)
                ) : (
                  <>
                    <MessageBody content={msg.content} onImageClick={setLightboxSrc} />
                    {msg.editedAt && <span style={styles.editedTag}>(edited)</span>}
                    {msg.failed && msg.nonce && (
                      <SendFailureNotice
                        onRetry={() => sendDmMessage(msg.content, msg.nonce)}
                        onDiscard={() => setMessages((prev) => prev.filter((m) => m.id !== msg.id))}
                      />
                    )}
                  </>
                )}
                <ReactionBar
                  reactions={msg.reactions}
                  userId={userId}
                  onToggle={(emoji) => toggleReaction(msg.id, emoji)}
                />
              </div>
              {!isEditing && !msg.pending && !msg.failed && actions(false)}
            </div>
          );
        }}
      />

      <div style={{ ...styles.inputArea, position: "relative" as const }}>
        {showGifPicker && (
          <GifPicker
            onSelect={(gifUrl) => {
              sendDmMessage(gifUrl);
              setShowGifPicker(false);
            }}
            onClose={() => setShowGifPicker(false)}
          />
        )}
        {typingText && <div style={styles.typingIndicator}>{typingText}</div>}
        <form
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          style={styles.inputContainer}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={() => {
              const file = fileInputRef.current?.files?.[0];
              if (file) handleFileUpload(file);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
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
            ref={inputRef}
            style={styles.input}
            placeholder={uploading ? "Uploading..." : `Message ${otherUser?.displayName ?? "..."}`}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (e.target.value.trim()) sendTyping();
            }}
            disabled={uploading}
            autoFocus
          />
          <button
            type="button"
            onClick={() => { setShowEmojiPicker(!showEmojiPicker); setShowGifPicker(false); }}
            style={styles.iconButton}
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
            style={styles.iconButton}
            title="Send a GIF"
          >
            GIF
          </button>
        </form>
        {showEmojiPicker && (
          <EmojiPicker
            onSelect={(emoji) => {
              const pos = inputRef.current?.selectionStart ?? input.length;
              setInput(input.slice(0, pos) + emoji + input.slice(pos));
              setShowEmojiPicker(false);
              requestAnimationFrame(() => {
                const newPos = pos + emoji.length;
                inputRef.current?.setSelectionRange(newPos, newPos);
                inputRef.current?.focus();
              });
            }}
            onClose={() => setShowEmojiPicker(false)}
          />
        )}
      </div>
      {lightboxSrc && <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
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
  atIcon: {
    fontSize: "18px",
    color: "var(--text-muted)",
    fontWeight: 600,
  },
  headerName: {
    fontSize: "15px",
    fontWeight: 600,
  },
  headerStatus: {
    fontSize: "12px",
    color: "var(--text-muted)",
    marginLeft: "4px",
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
  editedTag: {
    fontSize: "11px",
    color: "var(--text-muted)",
    marginLeft: "4px",
  },
  pendingContent: {
    opacity: 0.55,
  },
  typingIndicator: {
    padding: "0 16px 4px",
    fontSize: "12px",
    color: "var(--text-muted)",
    fontStyle: "italic",
    height: "18px",
  },
  inputArea: {
    flexShrink: 0,
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
  iconButton: {
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
  },
};
