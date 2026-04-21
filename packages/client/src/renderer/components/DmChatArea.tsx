import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuthStore } from "../stores/auth";
import { api } from "../lib/api";
import { avatarColor, avatarUrl } from "../lib/avatar";
import { onWsMessage } from "../lib/ws";
import { MarkdownContent } from "./MarkdownContent";

interface DmMessage {
  id: string;
  conversationId: string;
  authorId: string;
  content: string;
  createdAt: string;
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

const GROUP_THRESHOLD_MS = 5 * 60 * 1000;

export function DmChatArea() {
  const { channelId: conversationId } = useParams();
  const userId = useAuthStore((s) => s.user?.id);
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [input, setInput] = useState("");
  const [otherUser, setOtherUser] = useState<OtherUser | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

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
    setLoading(true);
    api.getDmMessages(conversationId).then((res) => {
      setMessages(res.messages);
      setHasMore(res.hasMore);
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView();
      });
    }).finally(() => setLoading(false));
  }, [conversationId]);

  // Listen for new DMs
  useEffect(() => {
    return onWsMessage((msg) => {
      if (msg.type === "dm_created") {
        const dm = (msg as any).message;
        if (dm.conversationId === conversationId) {
          setMessages((prev) => [...prev, dm]);
          requestAnimationFrame(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
          });
        }
      }
    });
  }, [conversationId]);

  // Load older messages
  const loadOlder = useCallback(async () => {
    if (!conversationId || messages.length === 0 || loadingMore) return;
    const container = messagesContainerRef.current;
    const prevHeight = container?.scrollHeight ?? 0;
    setLoadingMore(true);
    try {
      const res = await api.getDmMessages(conversationId, messages[0].createdAt);
      setMessages((prev) => [...res.messages, ...prev]);
      setHasMore(res.hasMore);
      requestAnimationFrame(() => {
        if (container) {
          container.scrollTop = container.scrollHeight - prevHeight;
        }
      });
    } finally {
      setLoadingMore(false);
    }
  }, [conversationId, messages, loadingMore]);

  const handleSend = () => {
    if (!input.trim() || !conversationId) return;
    api.sendDm(conversationId, input.trim()).catch(() => {});
    setInput("");
  };

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
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.atIcon}>@</span>
        <span style={styles.headerName}>{otherUser?.displayName ?? "..."}</span>
        {otherUser?.status && (
          <span style={styles.headerStatus}>{otherUser.status}</span>
        )}
      </div>

      <div ref={messagesContainerRef} style={styles.messages}>
        {hasMore && !loading && (
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

        {loading && (
          <div style={styles.loadingState}>Loading messages...</div>
        )}

        {!loading && messages.length === 0 && otherUser && (
          <div style={styles.emptyState}>
            <h2 style={styles.emptyTitle}>{otherUser.displayName}</h2>
            <p style={styles.emptySubtitle}>
              This is the beginning of your conversation with {otherUser.displayName}.
            </p>
          </div>
        )}

        {messages.map((msg, i) => {
          const prev = i > 0 ? messages[i - 1] : null;
          const isGrouped =
            prev !== null &&
            prev.authorId === msg.authorId &&
            new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime() < GROUP_THRESHOLD_MS;

          if (isGrouped) {
            return (
              <div key={msg.id} className="message-grouped hover-bg" style={styles.messageGrouped}>
                <span className="grouped-timestamp" style={styles.groupedTimestamp}>
                  {new Date(msg.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <div style={styles.groupedContent}>
                  <div style={styles.messageText}><MarkdownContent content={msg.content} /></div>
                </div>
              </div>
            );
          }

          return (
            <div key={msg.id} className="hover-bg" style={styles.message}>
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
                <div style={styles.messageText}><MarkdownContent content={msg.content} /></div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <div style={styles.inputArea}>
        <form
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          style={styles.inputContainer}
        >
          <input
            style={styles.input}
            placeholder={`Message ${otherUser?.displayName ?? "..."}`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoFocus
          />
        </form>
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
    flex: 1,
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
  inputArea: {
    flexShrink: 0,
  },
  inputContainer: {
    padding: "0 16px 24px",
    display: "flex",
    gap: "8px",
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
};
