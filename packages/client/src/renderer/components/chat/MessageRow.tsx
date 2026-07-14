import React from "react";
import type { ReactionGroup, MessageReference } from "@concord/shared";
import { avatarColor, avatarUrl } from "../../lib/avatar";
import { MessageActions, MessageBody, ReactionBar, SendFailureNotice } from "./MessageParts";
import { chatStyles as s } from "./chatStyles";

/** The message shape MessageRow renders. Both channel and DM messages satisfy it. */
export interface RowMessage {
  id: string;
  authorId: string;
  content: string;
  createdAt: string;
  editedAt?: string | null;
  pending?: boolean;
  failed?: boolean;
  nonce?: string;
  pinnedAt?: string | null;
  reactions?: ReactionGroup[];
  replyTo?: MessageReference | null;
  author?: { id?: string; displayName: string; avatarUrl: string | null } | undefined;
}

export interface MessageRowProps {
  msg: RowMessage;
  isGrouped: boolean;
  currentUserId?: string;
  isHovered: boolean;
  onHover: (id: string | null) => void;
  isEditing: boolean;
  editContent: string;
  onEditChange: (v: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  confirmDeleteId: string | null;
  onCancelDelete: () => void;
  reactionPickerMsgId: string | null;
  onReact: (id: string) => void;
  onToggleReaction: (id: string, emoji: string) => void;
  onReply: (id: string) => void;
  onStartEdit: (id: string, content: string) => void;
  onDelete: (id: string, skipConfirm: boolean) => void;
  onImageClick: (src: string) => void;
  onJumpToMessage: (id: string, createdAt: string) => void;
  canModerate: boolean;
  /** Retry/discard a failed optimistic send (varies per surface). */
  onRetryFailed: (msg: RowMessage) => void;
  onDiscardFailed: (msg: RowMessage) => void;
  /** Omit to hide the Pin action (DMs). */
  onPin?: (id: string) => void;
  /** Channel-only: resolves @username spans to profile links. */
  mentionUsers?: Map<string, string>;
  /** Channel-only: opens the author profile popup from avatar/name clicks. */
  onAvatarClick?: (userId: string, e: React.MouseEvent) => void;
}

export function MessageRow(props: MessageRowProps) {
  const {
    msg, isGrouped, currentUserId, isHovered, onHover, isEditing, editContent, onEditChange,
    onSaveEdit, onCancelEdit, confirmDeleteId, onCancelDelete, reactionPickerMsgId, onReact,
    onToggleReaction, onReply, onStartEdit, onDelete, onImageClick, onJumpToMessage, canModerate,
    onRetryFailed, onDiscardFailed, onPin, mentionUsers, onAvatarClick,
  } = props;

  const isOwn = msg.authorId === currentUserId;

  const actions = (editing: boolean) => (
    <MessageActions
      msgId={msg.id} content={msg.content} isOwn={isOwn} canModerate={canModerate} isPinned={!!msg.pinnedAt}
      isHovered={isHovered} isEditing={editing} editContent={editContent}
      confirmDeleteId={confirmDeleteId} onCancelDelete={onCancelDelete} onReply={onReply}
      showReactionPicker={reactionPickerMsgId === msg.id}
      onReact={onReact}
      onToggleReaction={onToggleReaction}
      onStartEdit={onStartEdit} onDelete={onDelete} onPin={onPin}
      onSaveEdit={onSaveEdit} onCancelEdit={onCancelEdit}
      onEditChange={onEditChange}
    />
  );

  const content = (
    <>
      <MessageBody content={msg.content} onImageClick={onImageClick} mentionUsers={mentionUsers} />
      {msg.editedAt && <span style={s.editedTag}>(edited)</span>}
      {msg.failed && msg.nonce && (
        <SendFailureNotice onRetry={() => onRetryFailed(msg)} onDiscard={() => onDiscardFailed(msg)} />
      )}
    </>
  );

  if (isGrouped) {
    return (
      <div
        className="message-grouped hover-bg"
        style={s.messageGrouped}
        onMouseEnter={() => onHover(msg.id)}
        onMouseLeave={() => onHover(null)}
      >
        <span className="grouped-timestamp" style={s.groupedTimestamp}>
          {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
        <div style={{ ...s.groupedContent, ...(msg.pending ? s.pendingContent : {}) }}>
          {isEditing ? actions(true) : content}
        </div>
        {!isEditing && !msg.pending && !msg.failed && actions(false)}
      </div>
    );
  }

  return (
    <div
      className="hover-bg"
      style={s.message}
      onMouseEnter={() => onHover(msg.id)}
      onMouseLeave={() => onHover(null)}
    >
      <div
        style={onAvatarClick
          ? { cursor: "pointer", flexShrink: 0, alignSelf: "flex-start" }
          : { flexShrink: 0, alignSelf: "flex-start" }}
        onClick={onAvatarClick ? (e) => { e.stopPropagation(); onAvatarClick(msg.authorId, e); } : undefined}
      >
        {avatarUrl(msg.author?.avatarUrl) ? (
          <img style={{ ...s.avatar, objectFit: "cover" as const }} src={avatarUrl(msg.author?.avatarUrl)!} alt="" />
        ) : (
          <div style={{ ...s.avatar, background: avatarColor(msg.authorId) }}>
            {(msg.author?.displayName ?? "?").charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <div style={{ ...s.messageContent, ...(msg.pending ? s.pendingContent : {}) }}>
        {msg.replyTo && (
          <div
            className="reply-preview"
            onClick={() => onJumpToMessage(msg.replyTo!.id, msg.replyTo!.createdAt)}
            title="Jump to original message"
          >
            <span className="reply-preview-author">{msg.replyTo.author?.displayName ?? "Unknown"}</span>
            <span className="reply-preview-content">{msg.replyTo.content}</span>
          </div>
        )}
        <div style={s.messageHeader}>
          <span
            style={onAvatarClick ? { ...s.authorName, cursor: "pointer" } : s.authorName}
            onClick={onAvatarClick ? (e) => { e.stopPropagation(); onAvatarClick(msg.authorId, e); } : undefined}
          >
            {msg.author?.displayName ?? "Unknown"}
          </span>
          <span style={s.timestamp}>
            {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        {isEditing ? actions(true) : content}
        <ReactionBar
          reactions={msg.reactions}
          userId={currentUserId}
          onToggle={(emoji) => onToggleReaction(msg.id, emoji)}
        />
      </div>
      {!isEditing && !msg.pending && !msg.failed && actions(false)}
    </div>
  );
}
