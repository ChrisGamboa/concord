import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { avatarColor, avatarUrl } from "../lib/avatar";
import { onWsMessage } from "../lib/ws";

interface Conversation {
  id: string;
  otherUser: { id: string; username: string; displayName: string; avatarUrl: string | null; status: string | null };
  lastMessage: { content: string; createdAt: string } | null;
}

interface DmMessage {
  id: string;
  conversationId: string;
  authorId: string;
  content: string;
  createdAt: string;
  author?: { id: string; displayName: string; avatarUrl: string | null };
}

export function DirectMessages({ onClose }: { onClose: () => void }) {
  const userId = useAuthStore((s) => s.user?.id);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getConversations().then((res) => setConversations(res.conversations)).catch(() => {});
  }, []);

  const activeConv = conversations.find((c) => c.id === activeConvId);

  const loadMessages = useCallback(async (convId: string) => {
    const res = await api.getDmMessages(convId);
    setMessages(res.messages);
    setTimeout(() => messagesEndRef.current?.scrollIntoView(), 50);
  }, []);

  useEffect(() => {
    if (activeConvId) loadMessages(activeConvId);
  }, [activeConvId, loadMessages]);

  // Listen for new DMs via WS
  useEffect(() => {
    return onWsMessage((msg) => {
      if (msg.type === "dm_created") {
        const dm = (msg as any).message;
        if (dm.conversationId === activeConvId) {
          setMessages((prev) => [...prev, dm]);
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
        }
        // Update conversation list
        setConversations((prev) => {
          const idx = prev.findIndex((c) => c.id === dm.conversationId);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = { ...updated[idx], lastMessage: { content: dm.content, createdAt: dm.createdAt } };
            return updated;
          }
          return prev;
        });
      }
    });
  }, [activeConvId]);

  const handleSend = async () => {
    if (!input.trim() || !activeConvId) return;
    await api.sendDm(activeConvId, input.trim());
    setInput("");
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="settings-overlay">
      <div className="settings-sidebar">
        <div className="settings-sidebar-scroll">
          <div className="settings-nav-label">Direct Messages</div>
          {conversations.map((conv) => (
            <button
              key={conv.id}
              className={`settings-nav-item ${activeConvId === conv.id ? "settings-nav-item--active" : ""}`}
              onClick={() => setActiveConvId(conv.id)}
              style={{ gap: "8px" }}
            >
              {avatarUrl(conv.otherUser.avatarUrl) ? (
                <img src={avatarUrl(conv.otherUser.avatarUrl)!} alt="" style={{ width: 24, height: 24, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
              ) : (
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: avatarColor(conv.otherUser.id), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: "white", flexShrink: 0 }}>
                  {conv.otherUser.displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{conv.otherUser.displayName}</div>
                {conv.lastMessage && (
                  <div style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {conv.lastMessage.content.slice(0, 40)}
                  </div>
                )}
              </div>
            </button>
          ))}
          {conversations.length === 0 && (
            <div style={{ padding: "12px 8px", color: "var(--text-muted)", fontSize: 13 }}>No conversations yet</div>
          )}
        </div>
      </div>

      <div className="settings-content">
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
          <button className="settings-close" onClick={onClose} title="Close (ESC)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          {!activeConv ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
              Select a conversation
            </div>
          ) : (
            <>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontWeight: 600, fontSize: 15 }}>
                {activeConv.otherUser.displayName}
                {activeConv.otherUser.status && (
                  <span style={{ fontSize: 12, fontWeight: 400, color: "var(--text-muted)", marginLeft: 8 }}>{activeConv.otherUser.status}</span>
                )}
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
                {messages.map((m) => (
                  <div key={m.id} style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                    {avatarUrl(m.author?.avatarUrl) ? (
                      <img src={avatarUrl(m.author?.avatarUrl)!} alt="" style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 32, height: 32, borderRadius: "50%", background: avatarColor(m.authorId), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600, color: "white", flexShrink: 0 }}>
                        {(m.author?.displayName ?? "?").charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize: 13 }}>
                        <strong>{m.author?.displayName ?? "Unknown"}</strong>
                        <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 6 }}>
                          {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <div style={{ fontSize: 14, color: "var(--text-primary)" }}>{m.content}</div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
              <div style={{ padding: "0 16px 16px" }}>
                <input
                  style={{ width: "100%", padding: "10px 14px", background: "var(--input-bg)", border: "none", borderRadius: 8, color: "var(--text-primary)", fontSize: 14, outline: "none" }}
                  placeholder={`Message ${activeConv.otherUser.displayName}`}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
                  autoFocus
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
