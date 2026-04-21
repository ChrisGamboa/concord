import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { avatarColor, avatarUrl } from "../lib/avatar";
import { usePresenceStore } from "../stores/presence";
import { onWsMessage } from "../lib/ws";

interface Conversation {
  id: string;
  otherUser: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    status: string | null;
  };
  lastMessage: { content: string; createdAt: string } | null;
}

export function DmSidebar() {
  const { channelId: activeConvId } = useParams();
  const navigate = useNavigate();
  const onlineUsers = usePresenceStore((s) => s.onlineUsers);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [showNewDm, setShowNewDm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Conversation["otherUser"][]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    api.getConversations().then((res) => setConversations(res.conversations)).catch(() => {});
  }, []);

  // Update conversation list when new DMs arrive
  useEffect(() => {
    return onWsMessage((msg) => {
      if (msg.type === "dm_created") {
        const dm = (msg as any).message;
        setConversations((prev) => {
          const idx = prev.findIndex((c) => c.id === dm.conversationId);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = {
              ...updated[idx],
              lastMessage: { content: dm.content, createdAt: dm.createdAt },
            };
            // Move to top
            const [item] = updated.splice(idx, 1);
            updated.unshift(item);
            return updated;
          }
          // New conversation -- refetch to get full data
          api.getConversations().then((res) => setConversations(res.conversations)).catch(() => {});
          return prev;
        });
      }
    });
  }, []);

  const handleStartConversation = useCallback(async (targetUserId: string) => {
    try {
      const conv = await api.createConversation(targetUserId);
      // Add to list if not already there
      setConversations((prev) => {
        if (prev.some((c) => c.id === conv.id)) return prev;
        return [{ id: conv.id, otherUser: conv.otherUser, lastMessage: null }, ...prev];
      });
      setShowNewDm(false);
      setSearchQuery("");
      setSearchResults([]);
      navigate(`/channels/@me/${conv.id}`);
    } catch {
      // ignore
    }
  }, [navigate]);

  // Search for users to DM -- search members from all servers the user is in
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    // Fetch all servers, then get members from each and deduplicate
    const doSearch = async () => {
      try {
        const { servers } = await api.getServers();
        const seen = new Set<string>();
        const results: Conversation["otherUser"][] = [];
        for (const server of servers) {
          const { members } = await api.getMembers(server.id);
          for (const m of members as any[]) {
            const user = m.user;
            if (!user || seen.has(user.id)) continue;
            seen.add(user.id);
            const q = searchQuery.toLowerCase();
            if (
              user.username.toLowerCase().includes(q) ||
              user.displayName.toLowerCase().includes(q)
            ) {
              results.push({
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                avatarUrl: user.avatarUrl,
                status: user.status ?? null,
              });
            }
          }
        }
        // Exclude users who already have conversations
        const existingIds = new Set(conversations.map((c) => c.otherUser.id));
        setSearchResults(results.filter((u) => !existingIds.has(u.id)));
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    };
    const timer = setTimeout(doSearch, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, conversations]);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>Direct Messages</h3>
        <button
          style={styles.newDmButton}
          onClick={() => setShowNewDm(!showNewDm)}
          title="New Message"
        >
          +
        </button>
      </div>

      <div style={styles.list}>
        {showNewDm && (
          <div style={styles.searchBox}>
            <input
              style={styles.searchInput}
              placeholder="Find a user..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") { setShowNewDm(false); setSearchQuery(""); setSearchResults([]); } }}
              autoFocus
            />
            {searching && (
              <div style={styles.searchHint}>Searching...</div>
            )}
            {!searching && searchQuery.trim() && searchResults.length === 0 && (
              <div style={styles.searchHint}>No users found</div>
            )}
            {searchResults.map((user) => (
              <button
                key={user.id}
                className="hover-bg"
                style={styles.convButton}
                onClick={() => handleStartConversation(user.id)}
              >
                {avatarUrl(user.avatarUrl) ? (
                  <img src={avatarUrl(user.avatarUrl)!} alt="" style={styles.avatarImg} />
                ) : (
                  <div style={{ ...styles.avatar, background: avatarColor(user.id) }}>
                    {user.displayName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div style={styles.convInfo}>
                  <div style={styles.convName}>{user.displayName}</div>
                  <div style={styles.convPreview}>{user.username}</div>
                </div>
              </button>
            ))}
          </div>
        )}

        {conversations.map((conv) => {
          const isActive = conv.id === activeConvId;
          const isOnline = onlineUsers.has(conv.otherUser.id);
          return (
            <button
              key={conv.id}
              className="hover-bg"
              onClick={() => navigate(`/channels/@me/${conv.id}`)}
              style={{
                ...styles.convButton,
                background: isActive ? "rgba(255,255,255,0.06)" : "transparent",
              }}
            >
              <div style={styles.avatarWrap}>
                {avatarUrl(conv.otherUser.avatarUrl) ? (
                  <img src={avatarUrl(conv.otherUser.avatarUrl)!} alt="" style={styles.avatarImg} />
                ) : (
                  <div style={{ ...styles.avatar, background: avatarColor(conv.otherUser.id) }}>
                    {conv.otherUser.displayName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div
                  style={{
                    ...styles.statusDot,
                    background: isOnline ? "var(--success)" : "var(--text-muted)",
                  }}
                />
              </div>
              <div style={styles.convInfo}>
                <div style={styles.convName}>{conv.otherUser.displayName}</div>
                {conv.lastMessage && (
                  <div style={styles.convPreview}>
                    {conv.lastMessage.content.length > 30
                      ? conv.lastMessage.content.slice(0, 30) + "..."
                      : conv.lastMessage.content}
                  </div>
                )}
              </div>
            </button>
          );
        })}

        {conversations.length === 0 && !showNewDm && (
          <div style={styles.empty}>
            No conversations yet. Click + to start one.
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: "var(--sidebar-width)",
    background: "var(--bg-secondary)",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
  },
  header: {
    height: "48px",
    padding: "0 16px",
    borderBottom: "1px solid var(--bg-primary)",
    boxShadow: "0 1px 0 rgba(0,0,0,0.2)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexShrink: 0,
  },
  title: {
    fontSize: "15px",
    fontWeight: 600,
  },
  newDmButton: {
    width: "24px",
    height: "24px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "none",
    border: "none",
    color: "var(--text-muted)",
    fontSize: "18px",
    cursor: "pointer",
    borderRadius: "4px",
  },
  list: {
    flex: 1,
    overflowY: "auto",
    padding: "8px",
  },
  searchBox: {
    marginBottom: "8px",
  },
  searchInput: {
    width: "100%",
    padding: "8px 10px",
    background: "var(--input-bg)",
    border: "1px solid var(--border)",
    borderRadius: "4px",
    color: "var(--text-primary)",
    fontSize: "13px",
    outline: "none",
    marginBottom: "4px",
  },
  searchHint: {
    padding: "6px 8px",
    fontSize: "12px",
    color: "var(--text-muted)",
  },
  convButton: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    width: "100%",
    padding: "8px",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "14px",
    textAlign: "left",
    background: "transparent",
    color: "var(--text-primary)",
  },
  avatarWrap: {
    position: "relative",
    flexShrink: 0,
  },
  avatar: {
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "13px",
    fontWeight: 600,
    color: "white",
    flexShrink: 0,
  },
  avatarImg: {
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    objectFit: "cover" as const,
    flexShrink: 0,
  },
  statusDot: {
    position: "absolute" as const,
    bottom: "-1px",
    right: "-1px",
    width: "10px",
    height: "10px",
    borderRadius: "50%",
    border: "2px solid var(--bg-secondary)",
  },
  convInfo: {
    minWidth: 0,
    flex: 1,
  },
  convName: {
    fontSize: "13px",
    fontWeight: 500,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  convPreview: {
    fontSize: "11px",
    color: "var(--text-muted)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  empty: {
    padding: "16px 8px",
    color: "var(--text-muted)",
    fontSize: "13px",
    textAlign: "center",
  },
};
