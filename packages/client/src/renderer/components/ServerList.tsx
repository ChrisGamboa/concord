import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useChatStore } from "../stores/chat";
import { useAuthStore } from "../stores/auth";
import { api } from "../lib/api";

export function ServerList() {
  const servers = useChatStore((s) => s.servers);
  const setServers = useChatStore((s) => s.setServers);
  const { serverId: activeServerId } = useParams();
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const server = await api.createServer(newName.trim());
    setServers([...servers, server]);
    setNewName("");
    setShowCreate(false);
    navigate(`/channels/${server.id}`);
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
          onClick={() => setShowCreate(!showCreate)}
          style={{
            ...styles.serverButton,
            background: showCreate ? "var(--success)" : "var(--bg-tertiary)",
            color: showCreate ? "white" : "var(--success)",
            fontSize: "24px",
          }}
          title="Create Server"
        >
          +
        </button>
      </div>

      {showCreate && (
        <div style={styles.createPopup}>
          <input
            style={styles.input}
            placeholder="Server name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            autoFocus
          />
          <button style={styles.createButton} onClick={handleCreate}>
            Create
          </button>
        </div>
      )}

      <button
        onClick={logout}
        style={{ ...styles.serverButton, background: "var(--bg-tertiary)", color: "var(--danger)", fontSize: "12px", marginTop: "auto" }}
        title="Logout"
      >
        Out
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
  createPopup: {
    position: "absolute",
    left: "80px",
    top: "50%",
    transform: "translateY(-50%)",
    background: "var(--bg-secondary)",
    padding: "12px",
    borderRadius: "8px",
    boxShadow: "0 8px 16px rgba(0,0,0,0.3)",
    zIndex: 10,
    display: "flex",
    gap: "8px",
  },
  input: {
    padding: "8px 12px",
    background: "var(--input-bg)",
    border: "none",
    borderRadius: "4px",
    color: "var(--text-primary)",
    fontSize: "14px",
    outline: "none",
    width: "180px",
  },
  createButton: {
    padding: "8px 16px",
    background: "var(--accent)",
    color: "white",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontWeight: 600,
  },
};
