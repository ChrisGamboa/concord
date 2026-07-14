import React, { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useParams } from "react-router-dom";
import { useAuthStore } from "../stores/auth";
import { useChatStore, type DmChatMessage } from "../stores/chat";
import { usePresenceStore } from "../stores/presence";
import { toast } from "../stores/toast";
import { api } from "../lib/api";
import { sendWs } from "../lib/ws";
import type { MessageReference } from "@concord/shared";
import { Lightbox } from "./Lightbox";
import { MessageList, type MessageListHandle } from "./chat/MessageList";
import { MessageRow, type RowMessage } from "./chat/MessageRow";
import { MessageComposer } from "./chat/MessageComposer";
import { chatStyles } from "./chat/chatStyles";

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

  // DM message state lives in the shared chat store (mirrors channel messages,
  // reusing the same optimistic-send/nonce reconciliation).
  const messages = useChatStore((s) => s.dmMessages);
  const hasMore = useChatStore((s) => s.dmHasMore);
  const loading = useChatStore((s) => s.dmLoading);
  const isAtLatest = useChatStore((s) => s.dmIsAtLatest);
  const clearDmUnread = useChatStore((s) => s.clearDmUnread);

  const [input, setInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [otherUser, setOtherUser] = useState<OtherUser | null>(null);
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  // Message currently being replied to (consumed by the next send)
  const [replyTarget, setReplyTarget] = useState<MessageReference | null>(null);
  const listRef = useRef<MessageListHandle>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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

  // Activate the conversation and load its messages into the store
  useEffect(() => {
    if (!conversationId) return;
    let stale = false;
    const store = useChatStore.getState();
    store.setActiveConversation(conversationId);
    store.setDmMessagesLoading(true);
    store.setDmMessages([], false);
    setReplyTarget(null);
    api.getDmMessages(conversationId).then((res) => {
      if (stale) return;
      useChatStore.getState().setDmMessages(res.messages, res.hasMore);
      requestAnimationFrame(() => listRef.current?.scrollToBottom());
    }).catch(() => {
      if (!stale) {
        useChatStore.getState().setDmMessagesLoading(false);
        toast("Failed to load messages");
      }
    });
    return () => {
      stale = true;
      useChatStore.getState().setActiveConversation(null);
    };
  }, [conversationId]);

  const [loadingMore, setLoadingMore] = useState(false);
  // Load older messages (MessageList keeps the viewport anchored on prepend)
  const loadOlder = useCallback(async () => {
    if (!conversationId || messages.length === 0 || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api.getDmMessages(conversationId, messages[0].createdAt);
      useChatStore.getState().prependDmMessages(res.messages, res.hasMore);
    } catch {
      toast("Failed to load older messages");
    } finally {
      setLoadingMore(false);
    }
  }, [conversationId, messages, loadingMore]);

  // Optimistic send: pending until the server echo (matched by nonce) reconciles it,
  // failed with retry if the POST errors.
  const sendDmMessage = useCallback((content: string, opts?: { nonce?: string; replyTo?: MessageReference | null }) => {
    if (!conversationId || !userId) return;
    const store = useChatStore.getState();
    const nonce = opts?.nonce ?? `pending-${crypto.randomUUID()}`;
    // Retries carry their original reply reference; new sends consume the chip
    const reply = opts?.nonce ? opts.replyTo ?? null : replyTarget;
    if (opts?.nonce) {
      store.markDmMessagePending(nonce);
    } else {
      setReplyTarget(null);
      const me = useAuthStore.getState().user;
      store.addPendingDmMessage({
        id: nonce,
        conversationId,
        authorId: userId,
        content,
        createdAt: new Date().toISOString(),
        editedAt: null,
        reactions: [],
        replyTo: reply,
        author: me ? { id: me.id, username: me.username, displayName: me.displayName, avatarUrl: me.avatarUrl, status: me.status } : undefined,
        pending: true,
        nonce,
      } as DmChatMessage);
    }
    api.sendDm(conversationId, content, reply?.id, nonce)
      .then((created) => {
        // Fallback reconcile in case the WS echo is delayed/dropped (idempotent with it)
        useChatStore.getState().addDmMessage(created, nonce);
      })
      .catch(() => useChatStore.getState().markDmMessageFailed(nonce));
  }, [conversationId, userId, replyTarget]);

  // Return from a historical page to the live view
  const jumpToPresent = useCallback(async () => {
    if (!conversationId) return;
    try {
      const res = await api.getDmMessages(conversationId);
      useChatStore.getState().setDmMessages(res.messages, res.hasMore, true);
      requestAnimationFrame(() => listRef.current?.scrollToBottom());
    } catch {
      toast("Failed to load latest messages");
    }
  }, [conversationId]);

  // Jump to a message (e.g. a reply's original), fetching its page if not loaded
  const jumpToMessage = useCallback(async (messageId: string, createdAt: string) => {
    if (!conversationId) return;
    if (useChatStore.getState().dmMessages.some((m) => m.id === messageId)) {
      listRef.current?.focusMessage(messageId);
      return;
    }
    try {
      const before = new Date(new Date(createdAt).getTime() + 1).toISOString();
      const res = await api.getDmMessages(conversationId, before);
      useChatStore.getState().setDmMessages(res.messages, res.hasMore, false);
      listRef.current?.focusMessage(messageId);
    } catch {
      toast("Failed to jump to message");
    }
  }, [conversationId]);

  const handleStartReply = useCallback((msgId: string) => {
    const m = useChatStore.getState().dmMessages.find((x) => x.id === msgId);
    if (!m) return;
    setReplyTarget({
      id: m.id,
      content: m.content,
      authorId: m.authorId,
      createdAt: m.createdAt,
      author: m.author as MessageReference["author"],
    });
    inputRef.current?.focus();
  }, []);

  const handleSend = useCallback(async () => {
    if (!input.trim() || !conversationId) return;
    const content = input.trim();
    setInput("");
    // Sending from a historical view returns to the live view first
    if (!useChatStore.getState().dmIsAtLatest) await jumpToPresent();
    sendDmMessage(content);
  }, [input, conversationId, jumpToPresent, sendDmMessage]);

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
    // The store updates when the server broadcasts dm_updated back to us.
    try {
      await api.editDm(msgId, content);
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
    } catch {
      toast("Failed to delete message");
    }
  };

  const toggleReaction = useCallback((msgId: string, emoji: string) => {
    // The store updates when the server broadcasts dm_reaction_update back to us.
    api.toggleDmReaction(msgId, emoji).catch(() => toast("Failed to update reaction"));
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
      <div style={chatStyles.container}>
        <div style={chatStyles.emptyState}>
          <h2 style={chatStyles.emptyTitle}>Direct Messages</h2>
          <p style={chatStyles.emptySubtitle}>Select a conversation or start a new one</p>
        </div>
      </div>
    );
  }

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
        <span style={styles.atIcon}>@</span>
        <span style={styles.headerName}>{otherUser?.displayName ?? "..."}</span>
        {otherUser?.status && <span style={styles.headerStatus}>{otherUser.status}</span>}
      </div>

      <MessageList<DmChatMessage>
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
            <div style={chatStyles.emptyState}>
              <h2 style={chatStyles.emptyTitle}>{otherUser.displayName}</h2>
              <p style={chatStyles.emptySubtitle}>
                This is the beginning of your conversation with {otherUser.displayName}.
              </p>
            </div>
          ) : null
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
            onCancelEdit={() => { setEditingMsgId(null); setEditContent(""); }}
            confirmDeleteId={confirmDeleteId}
            onCancelDelete={() => setConfirmDeleteId(null)}
            reactionPickerMsgId={reactionPickerMsgId}
            onReact={(id) => setReactionPickerMsgId((prev) => prev === id ? null : id)}
            onToggleReaction={toggleReaction}
            onReply={handleStartReply}
            onStartEdit={handleStartEdit}
            onDelete={handleDelete}
            onImageClick={setLightboxSrc}
            onJumpToMessage={jumpToMessage}
            canModerate={false}
            onRetryFailed={(m) => sendDmMessage(m.content, { nonce: m.nonce, replyTo: m.replyTo })}
            onDiscardFailed={(m) => m.nonce && useChatStore.getState().removeDmMessageByNonce(m.nonce)}
          />
        )}
      />

      <MessageComposer
        inputRef={inputRef}
        value={input}
        setInput={setInput}
        onChange={(e) => {
          setInput(e.target.value);
          if (e.target.value.trim()) sendTyping();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && replyTarget) setReplyTarget(null);
        }}
        onSubmit={handleSend}
        placeholder={uploading ? "Uploading..." : `Message ${otherUser?.displayName ?? "..."}`}
        uploading={uploading}
        onFileSelected={handleFileUpload}
        onGifSelected={(url) => sendDmMessage(url)}
        replyTarget={replyTarget}
        onCancelReply={() => setReplyTarget(null)}
        typingText={typingText}
        isAtLatest={isAtLatest}
        onJumpToPresent={jumpToPresent}
      />
      {lightboxSrc && <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
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
};
