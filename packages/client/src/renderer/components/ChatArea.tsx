import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { useChatStore } from "../stores/chat";
import { useAuthStore } from "../stores/auth";
import { usePresenceStore } from "../stores/presence";
import { sendWs } from "../lib/ws";

export function ChatArea() {
  const { channelId } = useParams();
  const messages = useChatStore((s) => s.messages);
  const channels = useChatStore((s) => s.channels);
  const userId = useAuthStore((s) => s.user?.id);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channel = channels.find((c) => c.id === channelId);

  const typingUsers = usePresenceStore(
    useCallback(
      (s) => (channelId ? s.getTypingUsers(channelId) : []),
      [channelId]
    )
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendTyping = useCallback(() => {
    if (!channelId) return;
    // Debounce: only send typing every 2 seconds
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

  const typingText =
    typingUsers.length === 0
      ? null
      : typingUsers.length === 1
        ? `${typingUsers[0]} is typing...`
        : typingUsers.length === 2
          ? `${typingUsers[0]} and ${typingUsers[1]} are typing...`
          : `${typingUsers[0]} and ${typingUsers.length - 1} others are typing...`;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.hash}>#</span>
        <span style={styles.channelName}>{channel?.name ?? "channel"}</span>
      </div>

      <div style={styles.messages}>
        {messages.map((msg) => (
          <div key={msg.id} style={styles.message}>
            <div style={styles.avatar}>
              {(msg.author?.displayName ?? "?").charAt(0).toUpperCase()}
            </div>
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
              <div style={styles.messageText}>{msg.content}</div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div style={styles.inputArea}>
        {typingText && <div style={styles.typingIndicator}>{typingText}</div>}
        <form onSubmit={handleSubmit} style={styles.inputContainer}>
          <input
            style={styles.input}
            placeholder={`Message #${channel?.name ?? "channel"}`}
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
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
    padding: "12px 16px",
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
  message: {
    display: "flex",
    gap: "16px",
    padding: "2px 16px",
    marginTop: "16px",
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
  typingIndicator: {
    padding: "0 16px 4px",
    fontSize: "12px",
    color: "var(--text-muted)",
    fontStyle: "italic",
    height: "18px",
  },
  inputContainer: {
    padding: "0 16px 24px",
  },
  input: {
    width: "100%",
    padding: "12px 16px",
    background: "var(--input-bg)",
    border: "none",
    borderRadius: "8px",
    color: "var(--text-primary)",
    fontSize: "14px",
    outline: "none",
  },
};
