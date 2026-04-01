import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useChatStore } from "../stores/chat";
import { api } from "../lib/api";

export function ServerList() {
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
    try {
      await api.joinServer(inputValue.trim());
      // Refresh server list
      const res = await api.getServers();
      setServers(res.servers);
      close();
      navigate(`/channels/${inputValue.trim()}`);
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

  return (
    <div style={styles.container}>
      <div style={styles.scrollArea}>
        {servers.map((server) => (
          <button
            key={server.id}
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
            {server.name.charAt(0).toUpperCase()}
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
          <p style={styles.popupHint}>Enter the server ID to join</p>
          {error && <p style={styles.error}>{error}</p>}
          <input
            style={styles.input}
            placeholder="Server ID"
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
        style={{ ...styles.serverButton, background: "var(--bg-tertiary)", color: "var(--text-muted)", fontSize: "16px", marginTop: "auto" }}
        title="Settings"
      >
        S
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
