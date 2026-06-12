import React from "react";
import type { ReactionGroup } from "@concord/shared";
import { LinkPreview } from "../LinkPreview";
import { MarkdownContent } from "../MarkdownContent";
import { SERVER_URL as SERVER_BASE } from "../../lib/config";

// Shared building blocks for chat surfaces (server channels and DMs).

export const GROUP_THRESHOLD_MS = 5 * 60 * 1000; // group consecutive messages within 5 minutes

export const QUICK_EMOJIS = ["👍", "❤️", "😂", "🎉", "😮", "😢", "🔥", "👀"];

/** Minimal message shape the shared chat components operate on. */
export interface ListMessage {
  id: string;
  authorId: string;
  content: string;
  createdAt: string;
  editedAt?: string | null;
  reactions?: ReactionGroup[];
  replyTo?: { id: string; createdAt: string } | null;
  pending?: boolean;
  failed?: boolean;
  nonce?: string;
}

export function formatDateSeparator(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

const IMAGE_REGEX = /\.(png|jpe?g|gif|webp)$/i;
const UPLOAD_URL_REGEX = /^\/uploads\/.+/;
const EXTERNAL_IMAGE_REGEX = /^https?:\/\/.+\.(gif|png|jpe?g|webp)(\?.*)?$/i;
const EXTERNAL_GIF_DOMAIN_REGEX = /^https?:\/\/(static\.klipy\.com|media[0-9]*\.giphy\.com|media\.tenor\.com)\//i;

function isImageUrl(text: string): boolean {
  return IMAGE_REGEX.test(text) || (UPLOAD_URL_REGEX.test(text) && IMAGE_REGEX.test(text));
}

/** Renders message content with inline image previews for uploaded files and GIFs. */
export function MessageBody({ content, onImageClick, mentionUsers }: {
  content: string;
  onImageClick?: (src: string) => void;
  mentionUsers?: Map<string, string>;
}) {
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

export function SendFailureNotice({ onRetry, onDiscard }: { onRetry: () => void; onDiscard: () => void }) {
  return (
    <div className="send-failure">
      <span>Failed to send.</span>
      <button className="send-failure-btn" onClick={onRetry}>Retry</button>
      <span className="send-failure-sep">·</span>
      <button className="send-failure-btn" onClick={onDiscard}>Discard</button>
    </div>
  );
}

export function ReactionBar({ reactions, userId, onToggle }: {
  reactions?: ReactionGroup[];
  userId?: string;
  onToggle: (emoji: string) => void;
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
            onClick={() => onToggle(r.emoji)}
          >
            <span className="reaction-pill-emoji">{r.emoji}</span>
            <span className="reaction-pill-count">{r.count}</span>
          </button>
        );
      })}
    </div>
  );
}

export function MessageActions({
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
  onToggleReaction,
  onReply,
  onStartEdit,
  onDelete,
  onCancelDelete,
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
  onToggleReaction: (msgId: string, emoji: string) => void;
  /** Omit to hide the Reply action (e.g. DMs until replies land there) */
  onReply?: (msgId: string) => void;
  onStartEdit: (id: string, content: string) => void;
  onDelete: (id: string, skipConfirm: boolean) => void;
  onCancelDelete: () => void;
  /** Omit to hide the Pin action */
  onPin?: (id: string) => void;
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

  const showDeleteConfirm = confirmDeleteId === msgId;
  if (!isHovered && !showReactionPicker && !showDeleteConfirm) return null;

  return (
    <div className="msg-action-bar">
      {showReactionPicker && (
        <div className="emoji-picker-float" onClick={(e) => e.stopPropagation()}>
          {QUICK_EMOJIS.map((e) => (
            <button
              key={e}
              className="emoji-picker-btn hover-bg"
              onClick={() => {
                onToggleReaction(msgId, e);
                onReact(msgId);
              }}
            >
              {e}
            </button>
          ))}
        </div>
      )}

      {onReply && (
        <button className="msg-action-btn" onClick={() => onReply(msgId)} title="Reply">
          Reply
        </button>
      )}
      <button className="msg-action-btn" onClick={() => onReact(msgId)} title="Add reaction">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M8 14s1.5 2 4 2 4-2 4-2" />
          <line x1="9" y1="9" x2="9.01" y2="9" />
          <line x1="15" y1="9" x2="15.01" y2="9" />
        </svg>
      </button>
      {onPin && canModerate && (
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
          className="msg-action-btn msg-action-btn--danger"
          onClick={(e) => onDelete(msgId, e.shiftKey)}
          title="Delete message (shift-click to skip confirmation)"
        >
          Del
        </button>
      )}
      {showDeleteConfirm && (
        <div className="delete-confirm-popover" onClick={(e) => e.stopPropagation()}>
          <span className="delete-confirm-text">Delete this message?</span>
          <button
            className="delete-confirm-btn delete-confirm-btn--danger"
            onClick={() => onDelete(msgId, true)}
          >
            Delete
          </button>
          <button className="delete-confirm-btn" onClick={onCancelDelete}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
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
  gifEmbed: {
    maxWidth: "300px",
    maxHeight: "250px",
    borderRadius: "8px",
    marginTop: "4px",
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
};
