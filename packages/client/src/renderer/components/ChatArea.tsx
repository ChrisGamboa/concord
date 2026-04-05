import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type DragEvent } from "react";
import { useParams } from "react-router-dom";
import { useChatStore } from "../stores/chat";
import { useAuthStore } from "../stores/auth";
import { usePresenceStore } from "../stores/presence";
import { sendWs } from "../lib/ws";
import { api } from "../lib/api";
import { avatarColor, avatarUrl } from "../lib/avatar";
import { Permissions, hasPermission, type ReactionGroup } from "@concord/shared";
import { GifPicker } from "./GifPicker";
import { LinkPreview } from "./LinkPreview";

const IMAGE_REGEX = /\.(png|jpe?g|gif|webp)$/i;
const UPLOAD_URL_REGEX = /^\/uploads\/.+/;
import { SERVER_URL as SERVER_BASE } from "../lib/config";
const GROUP_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

function isImageUrl(text: string): boolean {
  return IMAGE_REGEX.test(text) || (UPLOAD_URL_REGEX.test(text) && IMAGE_REGEX.test(text));
}

export function ChatArea() {
  const { channelId } = useParams();
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

  // Load messages and subscribe to WS channel
  useEffect(() => {
    if (!channelId) return;
    let stale = false;
    setActiveChannel(channelId);
    setMessagesLoading(true);

    api.getMessages(channelId).then((res) => {
      if (stale) return; // channel changed before response arrived
      setMessages(res.messages, res.hasMore);
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

  const handleInputChange = (value: string) => {
    setInput(value);
    if (value.trim()) sendTyping();
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !channelId) return;
    sendWs({ type: "send_message", channelId, content: input.trim() });
    setInput("");
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
      </div>

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
          <div style={styles.loadingState}>Loading messages...</div>
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
          const isGrouped =
            prev !== null &&
            prev.authorId === msg.authorId &&
            new Date(msg.createdAt).getTime() -
              new Date(prev.createdAt).getTime() <
              GROUP_THRESHOLD_MS;

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
                      msgId={msg.id} content={msg.content} isOwn={isOwnG} canModerate={canModerate}
                      isHovered={isHoveredG} isEditing={true} editContent={editContent}
                      confirmDeleteId={confirmDeleteId}
                      onStartEdit={handleStartEdit} onDelete={handleDelete}
                      onSaveEdit={handleSaveEdit} onCancelEdit={handleCancelEdit}
                      onEditChange={setEditContent}
                    />
                  ) : (
                    <>
                      <MessageBody content={msg.content} />
                      {msg.editedAt && <span style={styles.editedTag}>(edited)</span>}
                    </>
                  )}
                </div>
                {!isEditingG && (
                  <MessageActions
                    msgId={msg.id} content={msg.content} isOwn={isOwnG} canModerate={canModerate}
                    isHovered={isHoveredG} isEditing={false} editContent={editContent}
                    confirmDeleteId={confirmDeleteId}
                    onStartEdit={handleStartEdit} onDelete={handleDelete}
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
            <div
              key={msg.id}
              className="hover-bg"
              style={styles.message}
              onMouseEnter={() => setHoveredMsgId(msg.id)}
              onMouseLeave={() => setHoveredMsgId(null)}
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
              <div style={styles.messageContent}>
                <div style={styles.messageHeader}>
                  <span style={styles.authorName}>
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
                    msgId={msg.id} content={msg.content} isOwn={isOwn} canModerate={canModerate}
                    isHovered={isHovered} isEditing={true} editContent={editContent}
                    confirmDeleteId={confirmDeleteId}
                    onStartEdit={handleStartEdit} onDelete={handleDelete}
                    onSaveEdit={handleSaveEdit} onCancelEdit={handleCancelEdit}
                    onEditChange={setEditContent}
                  />
                ) : (
                  <>
                    <MessageBody content={msg.content} />
                    {msg.editedAt && <span style={styles.editedTag}>(edited)</span>}
                  </>
                )}
                <ReactionBar reactions={msg.reactions} messageId={msg.id} userId={userId} />
              </div>
              {!isEditing && (
                <MessageActions
                  msgId={msg.id} content={msg.content} isOwn={isOwn} canModerate={canModerate}
                  isHovered={isHovered} isEditing={false} editContent={editContent}
                  confirmDeleteId={confirmDeleteId}
                  onStartEdit={handleStartEdit} onDelete={handleDelete}
                  onSaveEdit={handleSaveEdit} onCancelEdit={handleCancelEdit}
                  onEditChange={setEditContent}
                />
              )}
            </div>
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
            style={styles.input}
            placeholder={
              uploading
                ? "Uploading..."
                : `Message #${channel?.name ?? "channel"}`
            }
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            disabled={uploading}
            autoFocus
          />
          <button
            type="button"
            onClick={() => setShowGifPicker(!showGifPicker)}
            style={styles.gifButton}
            title="Send a GIF"
          >
            GIF
          </button>
        </form>
      </div>
    </div>
  );
}

function MessageActions({
  msgId,
  content,
  isOwn,
  canModerate,
  isHovered,
  isEditing,
  editContent,
  confirmDeleteId,
  onStartEdit,
  onDelete,
  onSaveEdit,
  onCancelEdit,
  onEditChange,
}: {
  msgId: string;
  content: string;
  isOwn: boolean;
  canModerate: boolean;
  isHovered: boolean;
  isEditing: boolean;
  editContent: string;
  confirmDeleteId: string | null;
  onStartEdit: (id: string, content: string) => void;
  onDelete: (id: string) => void;
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

  const showActions = isHovered && (isOwn || canModerate);
  if (!showActions) return null;

  return (
    <div style={styles.actionBar}>
      {isOwn && (
        <button
          style={styles.actionButton}
          onClick={() => onStartEdit(msgId, content)}
        >
          Edit
        </button>
      )}
      <button
        style={{
          ...styles.actionButton,
          ...(confirmDeleteId === msgId ? { background: "var(--danger)", color: "white" } : {}),
        }}
        onClick={() => onDelete(msgId)}
      >
        {confirmDeleteId === msgId ? "Sure?" : "Del"}
      </button>
    </div>
  );
}

const EXTERNAL_IMAGE_REGEX = /^https?:\/\/.+\.(gif|png|jpe?g|webp)(\?.*)?$/i;
const EXTERNAL_GIF_DOMAIN_REGEX = /^https?:\/\/(static\.klipy\.com|media[0-9]*\.giphy\.com|media\.tenor\.com)\//i;

/** Renders message content with inline image previews for uploaded files and GIFs. */
function MessageBody({ content }: { content: string }) {
  // External GIF/image URL (from Klipy, Giphy, Tenor, or any direct image link)
  const trimmed = content.trim();
  if (EXTERNAL_GIF_DOMAIN_REGEX.test(trimmed) || (EXTERNAL_IMAGE_REGEX.test(trimmed) && trimmed.startsWith("http"))) {
    return (
      <div>
        <img
          src={trimmed}
          alt="GIF"
          style={styles.gifEmbed}
          loading="lazy"
        />
      </div>
    );
  }

  if (UPLOAD_URL_REGEX.test(content) && isImageUrl(content)) {
    return (
      <div>
        <img
          src={`${SERVER_BASE}${content}`}
          alt="uploaded image"
          style={styles.imageEmbed}
          loading="lazy"
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
      <div style={styles.messageText}>{content}</div>
      <LinkPreview content={content} />
    </div>
  );
}

const QUICK_EMOJIS = ["👍", "❤️", "😂", "🎉", "😮", "😢", "🔥", "👀"];

function ReactionBar({ reactions, messageId, userId }: { reactions?: ReactionGroup[]; messageId: string; userId?: string }) {
  const [showPicker, setShowPicker] = useState(false);

  const toggle = (emoji: string) => {
    sendWs({ type: "toggle_reaction", messageId, emoji });
    setShowPicker(false);
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "4px", alignItems: "center" }}>
      {(reactions ?? []).map((r) => (
        <button
          key={r.emoji}
          onClick={() => toggle(r.emoji)}
          style={{
            padding: "2px 6px",
            fontSize: "13px",
            background: r.userIds.includes(userId ?? "") ? "rgba(88, 101, 242, 0.3)" : "var(--bg-tertiary)",
            border: r.userIds.includes(userId ?? "") ? "1px solid var(--accent)" : "1px solid transparent",
            borderRadius: "4px",
            cursor: "pointer",
            color: "var(--text-primary)",
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          {r.emoji} <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{r.count}</span>
        </button>
      ))}
      <div style={{ position: "relative" }}>
        <button
          onClick={() => setShowPicker(!showPicker)}
          style={{
            padding: "2px 6px",
            fontSize: "13px",
            background: "transparent",
            border: "1px solid transparent",
            borderRadius: "4px",
            cursor: "pointer",
            color: "var(--text-muted)",
            opacity: 0.5,
          }}
          title="Add reaction"
        >
          +
        </button>
        {showPicker && (
          <div style={{
            position: "absolute",
            bottom: "100%",
            left: 0,
            background: "var(--bg-primary)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "6px",
            display: "flex",
            gap: "2px",
            zIndex: 50,
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          }}>
            {QUICK_EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => toggle(e)}
                style={{ fontSize: "18px", background: "none", border: "none", cursor: "pointer", padding: "4px", borderRadius: "4px" }}
                className="hover-bg"
              >
                {e}
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
  loadingState: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "48px 16px",
    color: "var(--text-muted)",
    fontSize: "14px",
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
