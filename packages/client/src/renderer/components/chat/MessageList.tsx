import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
  type ReactElement,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { GROUP_THRESHOLD_MS, formatDateSeparator, type ListMessage } from "./MessageParts";

/**
 * Virtualized, bottom-anchored message list shared by channel chat and DMs.
 *
 * Owns the scroll behaviors:
 * - stick to bottom while the user is at the bottom (incl. late image measurement)
 * - follow new tail messages only at the bottom or for own sends; otherwise show a pill
 * - keep the previously-first message anchored when older messages are prepended
 * - date separators, NEW divider, and message grouping
 *
 * Row content is delegated to `renderMessage`; data fetching stays in the caller.
 */

export interface MessageListHandle {
  scrollToBottom: (smooth?: boolean) => void;
  /** Scroll a loaded message into center view and flash-highlight it */
  focusMessage: (messageId: string) => void;
}

interface MessageListProps<M extends ListMessage> {
  messages: M[];
  loading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadOlder: () => void;
  currentUserId?: string;
  /** Message that gets the NEW divider above it */
  unreadMarkerId?: string | null;
  /** Identity of the channel/conversation; changing it resets scroll state */
  resetKey: string;
  emptyState: ReactNode;
  /** Called when the user is caught up (followed a new tail or returned to the bottom) */
  onTailRead?: () => void;
  /** Rows that must stack above neighbors (open popover/picker) */
  rowElevated?: (msg: M) => boolean;
  renderMessage: (msg: M, ctx: { isGrouped: boolean }) => ReactNode;
}

function MessageListInner<M extends ListMessage>(
  {
    messages,
    loading,
    hasMore,
    loadingMore,
    onLoadOlder,
    currentUserId,
    unreadMarkerId,
    resetKey,
    emptyState,
    onTailRead,
    rowElevated,
    renderMessage,
  }: MessageListProps<M>,
  ref: Ref<MessageListHandle>
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const lastTailIdRef = useRef<string | null>(null);
  const firstIdRef = useRef<string | null>(null);
  const [showNewBelow, setShowNewBelow] = useState(false);
  const [highlightMsgId, setHighlightMsgId] = useState<string | null>(null);

  // Latest messages for use inside rAF callbacks
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const rowVirtualizer = useVirtualizer({
    count: messages.length > 0 ? messages.length + 1 : 0,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 56,
    overscan: 12,
    getItemKey: (i) => (i === 0 ? "__header" : messages[i - 1].id),
  });

  const scrollToBottom = useCallback((smooth = false) => {
    const el = containerRef.current;
    if (!el) return;
    atBottomRef.current = true;
    setShowNewBelow(false);
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  const focusMessage = useCallback((messageId: string) => {
    // Jumping into history: stop bottom-anchoring from fighting the jump
    atBottomRef.current = false;
    requestAnimationFrame(() => {
      const idx = messagesRef.current.findIndex((m) => m.id === messageId);
      if (idx !== -1) rowVirtualizer.scrollToIndex(idx + 1, { align: "center" });
    });
    setHighlightMsgId(messageId);
    setTimeout(() => {
      setHighlightMsgId((curr) => (curr === messageId ? null : curr));
    }, 2000);
  }, [rowVirtualizer]);

  useImperativeHandle(ref, () => ({ scrollToBottom, focusMessage }), [scrollToBottom, focusMessage]);

  // Reset scroll state when switching channel/conversation
  useEffect(() => {
    atBottomRef.current = true;
    lastTailIdRef.current = null;
    firstIdRef.current = null;
    setShowNewBelow(false);
    setHighlightMsgId(null);
  }, [resetKey]);

  // While the user sits at the bottom, keep them pinned there as rows measure in
  // (late-loading images and embeds grow the total size after the initial scroll).
  const totalSize = rowVirtualizer.getTotalSize();
  useLayoutEffect(() => {
    if (atBottomRef.current && !loading && !loadingMore) {
      const el = containerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [totalSize, loading, loadingMore]);

  // Keep the previously-first message anchored when older messages are prepended
  useEffect(() => {
    const first = messages[0]?.id ?? null;
    const prevFirst = firstIdRef.current;
    firstIdRef.current = first;
    if (!prevFirst || !first || prevFirst === first || atBottomRef.current) return;
    const idx = messages.findIndex((m) => m.id === prevFirst);
    if (idx > 0) {
      requestAnimationFrame(() => {
        rowVirtualizer.scrollToIndex(idx + 1, { align: "start" });
      });
    }
  }, [messages, rowVirtualizer]);

  // Follow new tail messages only when already at the bottom (or for own sends);
  // otherwise show the "new messages" pill instead of yanking the scroll position.
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last) return;
    if (last.id === lastTailIdRef.current) return; // edit/reaction/prepend, not a new tail
    const isFirstLoad = lastTailIdRef.current === null;
    lastTailIdRef.current = last.id;
    if (isFirstLoad) return; // initial positioning is the caller's call (bottom or jump)
    const isOwn = last.authorId === currentUserId;
    if (atBottomRef.current || isOwn) {
      scrollToBottom(true);
      if (!isOwn && document.hasFocus()) onTailRead?.();
    } else if (!isOwn) {
      setShowNewBelow(true);
    }
  }, [messages, currentUserId, scrollToBottom, onTailRead]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    atBottomRef.current = atBottom;
    if (atBottom) {
      setShowNewBelow(false);
      if (document.hasFocus()) onTailRead?.();
    }
  }, [onTailRead]);

  return (
    <div style={styles.wrapper}>
      <div ref={containerRef} style={styles.scroller} onScroll={handleScroll}>
        {loading && (
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

        {!loading && messages.length === 0 && emptyState}

        {/* Virtualized rows: row 0 is the load-older header; row i+1 is messages[i] */}
        {!loading && messages.length > 0 && (
          <div style={{ height: `${totalSize}px`, width: "100%", position: "relative" }}>
            {rowVirtualizer.getVirtualItems().map((vRow) => {
              const rowStyle: React.CSSProperties = {
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${vRow.start}px)`,
              };

              if (vRow.index === 0) {
                return (
                  <div key={vRow.key} data-index={vRow.index} ref={rowVirtualizer.measureElement} style={rowStyle}>
                    {hasMore && (
                      <div style={styles.loadMoreContainer}>
                        <button onClick={onLoadOlder} disabled={loadingMore} style={styles.loadMoreButton}>
                          {loadingMore ? "Loading..." : "Load older messages"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              }

              const i = vRow.index - 1;
              const msg = messages[i];
              if (!msg) return null;
              // Rows with an open popover/picker must stack above their neighbors
              // (each transformed row is its own stacking context)
              if (rowElevated?.(msg)) rowStyle.zIndex = 2;

              const prev = i > 0 ? messages[i - 1] : null;
              const msgDate = new Date(msg.createdAt);
              const prevDate = prev ? new Date(prev.createdAt) : null;
              const showDateSep = !prevDate || msgDate.toDateString() !== prevDate.toDateString();
              const isUnreadMarker = msg.id === unreadMarkerId;

              const isGrouped =
                !showDateSep &&
                !isUnreadMarker &&
                !msg.replyTo &&
                prev !== null &&
                prev.authorId === msg.authorId &&
                msgDate.getTime() - prevDate!.getTime() < GROUP_THRESHOLD_MS;

              return (
                <div
                  key={vRow.key}
                  data-index={vRow.index}
                  ref={rowVirtualizer.measureElement}
                  className={highlightMsgId === msg.id ? "msg-highlight" : undefined}
                  style={rowStyle}
                >
                  {showDateSep && (
                    <div className="date-separator">
                      <span className="date-separator-text">{formatDateSeparator(msgDate)}</span>
                    </div>
                  )}
                  {isUnreadMarker && (
                    <div className="unread-divider">
                      <span className="unread-divider-label">NEW</span>
                    </div>
                  )}
                  {renderMessage(msg, { isGrouped })}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showNewBelow && (
        <button
          className="new-messages-pill"
          style={{ top: "auto", bottom: "8px" }}
          onClick={() => {
            scrollToBottom(true);
            onTailRead?.();
          }}
        >
          New messages below
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14" />
            <path d="m19 12-7 7-7-7" />
          </svg>
        </button>
      )}
    </div>
  );
}

export const MessageList = forwardRef(MessageListInner) as <M extends ListMessage>(
  props: MessageListProps<M> & { ref?: Ref<MessageListHandle> }
) => ReactElement;

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    flex: 1,
    minHeight: 0,
    position: "relative",
    display: "flex",
    flexDirection: "column",
  },
  scroller: {
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
};
