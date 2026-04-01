import { useCallback, useEffect, useRef, useState, type FormEvent, type DragEvent } from "react";
import { useParams } from "react-router-dom";
import { useChatStore } from "../stores/chat";
import { useAuthStore } from "../stores/auth";
import { usePresenceStore } from "../stores/presence";
import { sendWs } from "../lib/ws";
import { api } from "../lib/api";

const IMAGE_REGEX = /\.(png|jpe?g|gif|webp)$/i;
const UPLOAD_URL_REGEX = /^\/uploads\/.+/;
const SERVER_BASE = "http://localhost:3001";

function isImageUrl(text: string): boolean {
  return IMAGE_REGEX.test(text) || (UPLOAD_URL_REGEX.test(text) && IMAGE_REGEX.test(text));
}

export function ChatArea() {
  const { channelId } = useParams();
  const messages = useChatStore((s) => s.messages);
  const channels = useChatStore((s) => s.channels);
  const userId = useAuthStore((s) => s.user?.id);
  const [input, setInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
        console.error("Upload failed:", err);
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
              <MessageBody content={msg.content} />
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div style={styles.inputArea}>
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
        </form>
      </div>
    </div>
  );
}

/** Renders message content with inline image previews for uploaded files. */
function MessageBody({ content }: { content: string }) {
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

  return <div style={styles.messageText}>{content}</div>;
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
};
