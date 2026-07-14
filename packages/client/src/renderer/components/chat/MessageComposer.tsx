import React, { useRef, useState, type FormEvent } from "react";
import type { MessageReference } from "@concord/shared";
import { GifPicker } from "../GifPicker";
import { EmojiPicker } from "../EmojiPicker";
import { chatStyles as s } from "./chatStyles";

export interface MessageComposerProps {
  inputRef: React.RefObject<HTMLInputElement | null>;
  value: string;
  /** Used for emoji insertion at the caret. */
  setInput: (v: string) => void;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onSelect?: (e: React.SyntheticEvent<HTMLInputElement>) => void;
  onSubmit: () => void;
  placeholder: string;
  uploading: boolean;
  onFileSelected: (file: File) => void;
  onGifSelected: (url: string) => void;
  replyTarget: MessageReference | null;
  onCancelReply: () => void;
  typingText: string | null;
  isAtLatest: boolean;
  onJumpToPresent: () => void;
  /** Optional slot rendered above the form (e.g. the @mention dropdown). */
  extraDropdown?: React.ReactNode;
}

/** Shared message input for channels and DMs: file upload, emoji/GIF pickers,
 * reply chip, typing indicator, and the historical-view jump bar. */
export function MessageComposer(props: MessageComposerProps) {
  const {
    inputRef, value, setInput, onChange, onKeyDown, onSelect, onSubmit, placeholder, uploading,
    onFileSelected, onGifSelected, replyTarget, onCancelReply, typingText, isAtLatest,
    onJumpToPresent, extraDropdown,
  } = props;

  const [showGifPicker, setShowGifPicker] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  const insertEmoji = (emoji: string) => {
    const pos = inputRef.current?.selectionStart ?? value.length;
    setInput(value.slice(0, pos) + emoji + value.slice(pos));
    setShowEmojiPicker(false);
    requestAnimationFrame(() => {
      const newPos = pos + emoji.length;
      inputRef.current?.setSelectionRange(newPos, newPos);
      inputRef.current?.focus();
    });
  };

  return (
    <div style={{ ...s.inputArea, position: "relative" as const }}>
      {!isAtLatest && (
        <button className="history-bar" onClick={onJumpToPresent}>
          You're viewing older messages
          <span className="history-bar-action">Jump to present</span>
        </button>
      )}
      {showGifPicker && (
        <GifPicker
          onSelect={(gifUrl) => { onGifSelected(gifUrl); setShowGifPicker(false); }}
          onClose={() => setShowGifPicker(false)}
        />
      )}
      {replyTarget && (
        <div className="reply-chip">
          <span className="reply-chip-text">
            Replying to <strong>{replyTarget.author?.displayName ?? "Unknown"}</strong>
          </span>
          <button className="reply-chip-close" onClick={onCancelReply} title="Cancel reply (Esc)">×</button>
        </div>
      )}
      {typingText && <div style={s.typingIndicator}>{typingText}</div>}
      {extraDropdown}
      <form onSubmit={handleSubmit} style={s.inputContainer}>
        <input
          type="file"
          ref={fileInputRef}
          onChange={() => {
            const file = fileInputRef.current?.files?.[0];
            if (file) onFileSelected(file);
            if (fileInputRef.current) fileInputRef.current.value = "";
          }}
          style={{ display: "none" }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          style={s.uploadButton}
          disabled={uploading}
          title="Upload file"
        >
          +
        </button>
        <input
          ref={inputRef}
          style={s.input}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onSelect={onSelect}
          disabled={uploading}
          autoFocus
        />
        <button
          type="button"
          onClick={() => { setShowEmojiPicker((v) => !v); setShowGifPicker(false); }}
          style={s.iconButton}
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
          onClick={() => { setShowGifPicker((v) => !v); setShowEmojiPicker(false); }}
          style={s.iconButton}
          title="Send a GIF"
        >
          GIF
        </button>
      </form>
      {showEmojiPicker && (
        <EmojiPicker onSelect={insertEmoji} onClose={() => setShowEmojiPicker(false)} />
      )}
    </div>
  );
}
