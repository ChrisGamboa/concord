import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { Permissions, type Role } from "@concord/shared";

const PERMISSION_LABELS: { key: string; perm: number; label: string; description: string }[] = [
  { key: "ADMIN", perm: Permissions.ADMIN, label: "Administrator", description: "Full access to everything" },
  { key: "MANAGE_SERVER", perm: Permissions.MANAGE_SERVER, label: "Manage Server", description: "Edit server name and settings" },
  { key: "MANAGE_CHANNELS", perm: Permissions.MANAGE_CHANNELS, label: "Manage Channels", description: "Create, edit, and delete channels" },
  { key: "MANAGE_ROLES", perm: Permissions.MANAGE_ROLES, label: "Manage Roles", description: "Create and assign roles" },
  { key: "MANAGE_MESSAGES", perm: Permissions.MANAGE_MESSAGES, label: "Manage Messages", description: "Delete any user's messages" },
  { key: "KICK_MEMBERS", perm: Permissions.KICK_MEMBERS, label: "Kick Members", description: "Remove members from server or voice" },
  { key: "BAN_MEMBERS", perm: Permissions.BAN_MEMBERS, label: "Ban Members", description: "Ban members from the server" },
  { key: "SEND_MESSAGES", perm: Permissions.SEND_MESSAGES, label: "Send Messages", description: "Send messages in text channels" },
  { key: "READ_MESSAGES", perm: Permissions.READ_MESSAGES, label: "Read Messages", description: "View messages in text channels" },
  { key: "CONNECT_VOICE", perm: Permissions.CONNECT_VOICE, label: "Connect to Voice", description: "Join voice channels" },
  { key: "SPEAK", perm: Permissions.SPEAK, label: "Speak", description: "Talk in voice channels" },
  { key: "STREAM", perm: Permissions.STREAM, label: "Stream", description: "Share screen or camera" },
];

export function ServerSettings({
  serverId,
  onClose,
}: {
  serverId: string;
  onClose: () => void;
}) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [editPerms, setEditPerms] = useState(0);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const loadRoles = useCallback(async () => {
    const res = await api.getRoles(serverId);
    setRoles(res.roles);
  }, [serverId]);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const selectedRole = roles.find((r) => r.id === selectedRoleId);

  useEffect(() => {
    if (selectedRole) {
      setEditName(selectedRole.name);
      setEditColor(selectedRole.color ?? "");
      setEditPerms(selectedRole.permissions);
      setMsg("");
    }
  }, [selectedRole]);

  const handleCreateRole = async () => {
    setSaving(true);
    try {
      await api.createRole(serverId, { name: "New Role", permissions: 0 });
      await loadRoles();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRole = async () => {
    if (!selectedRoleId) return;
    setSaving(true);
    setMsg("");
    try {
      await api.updateRole(serverId, selectedRoleId, {
        name: editName,
        color: editColor || null,
        permissions: editPerms,
      });
      await loadRoles();
      setMsg("Saved");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRole = async () => {
    if (!selectedRoleId) return;
    setSaving(true);
    try {
      await api.deleteRole(serverId, selectedRoleId);
      setSelectedRoleId(null);
      await loadRoles();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const togglePerm = (perm: number) => {
    setEditPerms((prev) => (prev & perm) ? prev & ~perm : prev | perm);
  };

  return (
    <div className="settings-overlay">
      <div className="settings-sidebar">
        <div className="settings-sidebar-scroll">
          <div className="settings-nav-label">Server Settings</div>

          <div className="settings-nav-label" style={{ marginTop: "16px" }}>Roles</div>
          {roles.map((role) => (
            <button
              key={role.id}
              className={`settings-nav-item ${selectedRoleId === role.id ? "settings-nav-item--active" : ""}`}
              onClick={() => setSelectedRoleId(role.id)}
            >
              {role.color && (
                <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: role.color, flexShrink: 0 }} />
              )}
              {role.name}
            </button>
          ))}

          <button
            className="settings-nav-item"
            onClick={handleCreateRole}
            disabled={saving}
            style={{ color: "var(--accent)" }}
          >
            + Create Role
          </button>
        </div>
      </div>

      <div className="settings-content">
        <div className="settings-content-scroll">
          <button className="settings-close" onClick={onClose} title="Close (ESC)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          {!selectedRole ? (
            <div className="settings-section">
              <h2 className="settings-section-title">Roles</h2>
              <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>
                Select a role from the sidebar to edit its permissions, or create a new one.
              </p>
            </div>
          ) : (
            <div className="settings-section">
              <h2 className="settings-section-title">Edit Role: {selectedRole.name}</h2>

              {msg && (
                <div className="settings-profile-msg">{msg}</div>
              )}

              <div className="settings-card">
                <div className="settings-field-col">
                  <span className="settings-label">Role Name</span>
                  <input
                    className="settings-select"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    maxLength={50}
                  />
                </div>
                <div className="settings-field-col">
                  <span className="settings-label">Color</span>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <input
                      type="color"
                      value={editColor || "#5865f2"}
                      onChange={(e) => setEditColor(e.target.value)}
                      style={{ width: "36px", height: "36px", border: "none", borderRadius: "4px", cursor: "pointer", background: "none" }}
                    />
                    <input
                      className="settings-select"
                      value={editColor}
                      onChange={(e) => setEditColor(e.target.value)}
                      placeholder="No color"
                      style={{ width: "120px" }}
                    />
                  </div>
                </div>
              </div>

              <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", margin: "20px 0 12px" }}>
                Permissions
              </h3>
              <div className="settings-card">
                {PERMISSION_LABELS.map((p) => (
                  <div key={p.key} className="settings-field">
                    <div>
                      <span className="settings-label">{p.label}</span>
                      <span className="settings-hint">{p.description}</span>
                    </div>
                    <button
                      className={`settings-toggle ${(editPerms & p.perm) ? "settings-toggle--on" : ""}`}
                      onClick={() => togglePerm(p.perm)}
                    >
                      <div className="settings-toggle-knob" />
                    </button>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: "8px", marginTop: "16px", justifyContent: "space-between" }}>
                {selectedRole.position > 0 && (
                  <button className="settings-remove-btn" onClick={handleDeleteRole} disabled={saving}>
                    Delete Role
                  </button>
                )}
                <button
                  className="settings-save-btn"
                  onClick={handleSaveRole}
                  disabled={saving}
                  style={{ marginLeft: "auto", padding: "8px 24px", fontSize: "14px" }}
                >
                  Save Changes
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
