import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useChatStore } from "../stores/chat";
import { api } from "../lib/api";
import { avatarUrl } from "../lib/avatar";

export function ServerList({ loading }: { loading?: boolean }) {
  const servers = useChatStore((s) => s.servers);
  const setServers = useChatStore((s) => s.setServers);
  const { serverId: activeServerId } = useParams();
  const navigate = useNavigate();
  const [showMenu, setShowMenu] = useState(false);
  const [mode, setMode] = useState<"create" | "join" | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState("");

  const handleCreate = async () => {
    if (!inputValue.trim()) return;
    setError("");
    try {
      const server = await api.createServer(inputValue.trim());
      setServers([...servers, server]);
      close();
      navigate(`/channels/${server.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create server");
    }
  };

  const handleJoin = async () => {
    if (!inputValue.trim()) return;
    setError("");
    const value = inputValue.trim();
    try {
      // Try as invite code first (8 hex chars), then fall back to server ID
      let joinedServerId = value;
      if (/^[a-f0-9]{8}$/i.test(value)) {
        const result = await api.joinViaInvite(value);
        joinedServerId = result.serverId;
      } else {
        await api.joinServer(value);
      }
      const res = await api.getServers();
      setServers(res.servers);
      close();
      navigate(`/channels/${joinedServerId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join server");
    }
  };

  const close = () => {
    setShowMenu(false);
    setMode(null);
    setInputValue("");
    setError("");
  };

  // Close popup on ESC
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showMenu]);

  return (
    <div style={styles.container}>
      <div style={styles.scrollArea}>
        <button
          className="hover-brighten"
          onClick={() => window.dispatchEvent(new CustomEvent("concord:open-dms"))}
          style={{ ...styles.serverButton, background: "var(--bg-tertiary)", color: "var(--text-muted)" }}
          title="Direct Messages"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
        <div style={styles.divider} />
        {loading && [0, 1, 2].map((i) => (
          <div key={i} style={{ ...styles.serverButton, background: "var(--bg-tertiary)", opacity: 0.4 }} />
        ))}
        {servers.map((server) => (
          <button
            key={server.id}
            className="hover-brighten"
            onClick={() => navigate(`/channels/${server.id}`)}
            style={{
              ...styles.serverButton,
              borderRadius: server.id === activeServerId ? "16px" : "24px",
              background:
                server.id === activeServerId
                  ? "var(--accent)"
                  : "var(--bg-tertiary)",
            }}
            title={server.name}
          >
            {avatarUrl(server.iconUrl) ? (
              <img src={avatarUrl(server.iconUrl)!} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }} />
            ) : (
              server.name.charAt(0).toUpperCase()
            )}
          </button>
        ))}

        <div style={styles.divider} />

        <button
          onClick={() => setShowMenu(!showMenu)}
          style={{
            ...styles.serverButton,
            background: showMenu ? "var(--success)" : "var(--bg-tertiary)",
            color: showMenu ? "white" : "var(--success)",
            fontSize: "24px",
          }}
          title="Add Server"
        >
          +
        </button>
      </div>

      {showMenu && (
        <div style={styles.popupOverlay} onClick={close} />
      )}

      {showMenu && !mode && (
        <div style={styles.popup}>
          <button
            style={styles.menuButton}
            onClick={() => setMode("create")}
          >
            Create Server
          </button>
          <button
            style={styles.menuButton}
            onClick={() => setMode("join")}
          >
            Join Server
          </button>
        </div>
      )}

      {showMenu && mode === "create" && (
        <div style={styles.popup}>
          <p style={styles.popupLabel}>Create a new server</p>
          {error && <p style={styles.error}>{error}</p>}
          <input
            style={styles.input}
            placeholder="Server name"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            autoFocus
          />
          <div style={styles.popupActions}>
            <button style={styles.backButton} onClick={() => { setMode(null); setInputValue(""); setError(""); }}>
              Back
            </button>
            <button style={styles.actionButton} onClick={handleCreate}>
              Create
            </button>
          </div>
        </div>
      )}

      {showMenu && mode === "join" && (
        <div style={styles.popup}>
          <p style={styles.popupLabel}>Join an existing server</p>
          <p style={styles.popupHint}>Enter an invite code or server ID</p>
          {error && <p style={styles.error}>{error}</p>}
          <input
            style={styles.input}
            placeholder="Invite code or server ID"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            autoFocus
          />
          <div style={styles.popupActions}>
            <button style={styles.backButton} onClick={() => { setMode(null); setInputValue(""); setError(""); }}>
              Back
            </button>
            <button style={styles.actionButton} onClick={handleJoin}>
              Join
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => {
          const event = new CustomEvent("concord:open-settings");
          window.dispatchEvent(event);
        }}
        className="hover-brighten"
        style={{ ...styles.serverButton, background: "var(--bg-tertiary)", color: "var(--text-muted)", marginTop: "auto" }}
        title="Settings"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: "var(--server-list-width)",
    background: "var(--bg-primary)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "12px 0",
    gap: "8px",
    flexShrink: 0,
    position: "relative",
  },
  scrollArea: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "8px",
    overflowY: "auto",
    flex: 1,
    width: "100%",
    paddingBottom: "8px",
  },
  serverButton: {
    width: "48px",
    height: "48px",
    borderRadius: "24px",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--text-primary)",
    fontSize: "18px",
    fontWeight: 600,
    transition: "border-radius 0.15s ease",
    flexShrink: 0,
  },
  divider: {
    width: "32px",
    height: "2px",
    background: "var(--border)",
    borderRadius: "1px",
  },
  popupOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 9,
  },
  popup: {
    position: "absolute",
    left: "80px",
    top: "50%",
    transform: "translateY(-50%)",
    background: "var(--bg-secondary)",
    padding: "16px",
    borderRadius: "8px",
    boxShadow: "0 8px 16px rgba(0,0,0,0.3)",
    zIndex: 10,
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    minWidth: "240px",
  },
  popupLabel: {
    fontSize: "14px",
    fontWeight: 600,
    color: "var(--text-primary)",
  },
  popupHint: {
    fontSize: "12px",
    color: "var(--text-muted)",
  },
  popupActions: {
    display: "flex",
    gap: "8px",
    justifyContent: "flex-end",
  },
  menuButton: {
    padding: "10px 12px",
    background: "var(--bg-tertiary)",
    border: "none",
    borderRadius: "4px",
    color: "var(--text-primary)",
    fontSize: "14px",
    cursor: "pointer",
    textAlign: "left",
    width: "100%",
  },
  error: {
    fontSize: "12px",
    color: "var(--danger)",
  },
  input: {
    padding: "8px 12px",
    background: "var(--input-bg)",
    border: "none",
    borderRadius: "4px",
    color: "var(--text-primary)",
    fontSize: "14px",
    outline: "none",
    width: "100%",
  },
  backButton: {
    padding: "6px 12px",
    background: "var(--bg-tertiary)",
    color: "var(--text-secondary)",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "13px",
  },
  actionButton: {
    padding: "6px 16px",
    background: "var(--accent)",
    color: "white",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: "13px",
  },
};
