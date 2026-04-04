import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useChatStore } from "../stores/chat";
import { avatarColor, avatarUrl } from "../lib/avatar";
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

type Tab = "overview" | "invites" | "roles";

export function ServerSettings({
  serverId,
  onClose,
}: {
  serverId: string;
  onClose: () => void;
}) {
  const servers = useChatStore((s) => s.servers);
  const setServers = useChatStore((s) => s.setServers);
  const server = servers.find((s) => s.id === serverId);

  const [tab, setTab] = useState<Tab>("overview");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  // Overview state
  const [serverName, setServerName] = useState(server?.name ?? "");
  const iconInputRef = useRef<HTMLInputElement>(null);

  // Roles state
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [editRoleName, setEditRoleName] = useState("");
  const [editRoleColor, setEditRoleColor] = useState("");
  const [editRolePerms, setEditRolePerms] = useState(0);

  // Invites state
  const [invites, setInvites] = useState<Array<{ code: string; createdBy: string; maxUses: number | null; uses: number; expiresAt: string | null }>>([]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const loadRoles = useCallback(async () => {
    const res = await api.getRoles(serverId);
    setRoles(res.roles);
  }, [serverId]);

  const loadInvites = useCallback(async () => {
    const res = await api.getInvites(serverId);
    setInvites(res.invites);
  }, [serverId]);

  useEffect(() => { loadRoles(); }, [loadRoles]);
  useEffect(() => { if (tab === "invites") loadInvites(); }, [tab, loadInvites]);

  const selectedRole = roles.find((r) => r.id === selectedRoleId);
  useEffect(() => {
    if (selectedRole) {
      setEditRoleName(selectedRole.name);
      setEditRoleColor(selectedRole.color ?? "");
      setEditRolePerms(selectedRole.permissions);
      setMsg("");
    }
  }, [selectedRole]);

  // Overview handlers
  const handleSaveServer = async () => {
    setSaving(true); setMsg("");
    try {
      const updated = await api.updateServer(serverId, { name: serverName.trim() || undefined });
      setServers(servers.map((s) => s.id === serverId ? { ...s, name: updated.name, iconUrl: updated.iconUrl } : s));
      setMsg("Saved");
    } catch (err) { setMsg(err instanceof Error ? err.message : "Failed"); }
    finally { setSaving(false); }
  };

  const handleIconUpload = async (file: File) => {
    setSaving(true); setMsg("");
    try {
      const updated = await api.updateServer(serverId, { icon: file });
      setServers(servers.map((s) => s.id === serverId ? { ...s, iconUrl: updated.iconUrl } : s));
      setMsg("Icon updated");
    } catch (err) { setMsg(err instanceof Error ? err.message : "Failed"); }
    finally { setSaving(false); }
  };

  const handleRemoveIcon = async () => {
    setSaving(true); setMsg("");
    try {
      const updated = await api.updateServer(serverId, { removeIcon: true });
      setServers(servers.map((s) => s.id === serverId ? { ...s, iconUrl: updated.iconUrl } : s));
      setMsg("Icon removed");
    } catch (err) { setMsg(err instanceof Error ? err.message : "Failed"); }
    finally { setSaving(false); }
  };

  // Invite handlers
  const handleCreateInvite = async () => {
    setSaving(true);
    try {
      await api.createInvite(serverId);
      await loadInvites();
    } catch (err) { setMsg(err instanceof Error ? err.message : "Failed"); }
    finally { setSaving(false); }
  };

  const handleDeleteInvite = async (code: string) => {
    await api.deleteInvite(serverId, code);
    await loadInvites();
  };

  // Role handlers
  const handleCreateRole = async () => {
    setSaving(true);
    try { await api.createRole(serverId, { name: "New Role", permissions: 0 }); await loadRoles(); }
    catch (err) { setMsg(err instanceof Error ? err.message : "Failed"); }
    finally { setSaving(false); }
  };

  const handleSaveRole = async () => {
    if (!selectedRoleId) return;
    setSaving(true); setMsg("");
    try {
      await api.updateRole(serverId, selectedRoleId, { name: editRoleName, color: editRoleColor || null, permissions: editRolePerms });
      await loadRoles(); setMsg("Saved");
    } catch (err) { setMsg(err instanceof Error ? err.message : "Failed"); }
    finally { setSaving(false); }
  };

  const handleDeleteRole = async () => {
    if (!selectedRoleId) return;
    setSaving(true);
    try { await api.deleteRole(serverId, selectedRoleId); setSelectedRoleId(null); await loadRoles(); }
    catch (err) { setMsg(err instanceof Error ? err.message : "Failed"); }
    finally { setSaving(false); }
  };

  return (
    <div className="settings-overlay">
      <div className="settings-sidebar">
        <div className="settings-sidebar-scroll">
          <div className="settings-nav-label">Server Settings</div>
          <button className={`settings-nav-item ${tab === "overview" && !selectedRoleId ? "settings-nav-item--active" : ""}`}
            onClick={() => { setTab("overview"); setSelectedRoleId(null); }}>
            Overview
          </button>
          <button className={`settings-nav-item ${tab === "invites" ? "settings-nav-item--active" : ""}`}
            onClick={() => { setTab("invites"); setSelectedRoleId(null); }}>
            Invites
          </button>

          <div className="settings-nav-divider" />
          <div className="settings-nav-label">Roles</div>
          {roles.map((role) => (
            <button key={role.id}
              className={`settings-nav-item ${selectedRoleId === role.id ? "settings-nav-item--active" : ""}`}
              onClick={() => { setTab("roles"); setSelectedRoleId(role.id); }}>
              {role.color && <span style={{ width: 10, height: 10, borderRadius: "50%", background: role.color, flexShrink: 0 }} />}
              {role.name}
            </button>
          ))}
          <button className="settings-nav-item" onClick={handleCreateRole} disabled={saving} style={{ color: "var(--accent)" }}>
            + Create Role
          </button>
        </div>
      </div>

      <div className="settings-content">
        <div className="settings-content-scroll">
          <button className="settings-close" onClick={onClose} title="Close (ESC)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          {msg && <div className="settings-profile-msg">{msg}</div>}

          {/* Overview */}
          {tab === "overview" && !selectedRoleId && (
            <div className="settings-section">
              <h2 className="settings-section-title">Server Overview</h2>
              <div className="settings-card">
                <div className="settings-field" style={{ gap: "16px" }}>
                  <div style={{ flexShrink: 0 }}>
                    {avatarUrl(server?.iconUrl) ? (
                      <img src={avatarUrl(server?.iconUrl)!} alt="" style={{ width: 64, height: 64, borderRadius: "16px", objectFit: "cover", cursor: "pointer" }}
                        onClick={() => iconInputRef.current?.click()} title="Change icon" />
                    ) : (
                      <div onClick={() => iconInputRef.current?.click()} title="Upload icon"
                        style={{ width: 64, height: 64, borderRadius: "16px", background: avatarColor(serverId), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 700, color: "white", cursor: "pointer" }}>
                        {(server?.name ?? "?").charAt(0).toUpperCase()}
                      </div>
                    )}
                    <input ref={iconInputRef} type="file" accept="image/*" style={{ display: "none" }}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleIconUpload(f); e.target.value = ""; }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <span className="settings-hint" style={{ marginBottom: 4, display: "block" }}>Click the icon to upload. Recommended: 128x128.</span>
                    {server?.iconUrl && (
                      <button className="settings-remove-btn" onClick={handleRemoveIcon} disabled={saving} style={{ marginTop: 4 }}>
                        Remove Icon
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="settings-card" style={{ marginTop: 16 }}>
                <div className="settings-field-col">
                  <span className="settings-label">Server Name</span>
                  <input className="settings-select" value={serverName} onChange={(e) => setServerName(e.target.value)} maxLength={100} />
                </div>
              </div>

              <button className="settings-save-btn" onClick={handleSaveServer} disabled={saving}
                style={{ marginTop: 16, padding: "8px 24px", fontSize: 14 }}>
                Save Changes
              </button>
            </div>
          )}

          {/* Invites */}
          {tab === "invites" && !selectedRoleId && (
            <div className="settings-section">
              <h2 className="settings-section-title">Invite Links</h2>
              <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 16 }}>
                Share an invite code so others can join. They can paste it in the "Join Server" dialog.
              </p>
              <button className="settings-save-btn" onClick={handleCreateInvite} disabled={saving}
                style={{ marginBottom: 16, padding: "8px 20px", fontSize: 13 }}>
                Generate Invite
              </button>

              {invites.length > 0 && (
                <div className="settings-card">
                  {invites.map((inv) => (
                    <div key={inv.code} className="settings-field">
                      <div>
                        <span style={{ fontFamily: "monospace", fontSize: 15, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.05em" }}>{inv.code}</span>
                        <span className="settings-hint">
                          by {inv.createdBy} -- {inv.uses} use{inv.uses !== 1 ? "s" : ""}
                          {inv.maxUses ? ` / ${inv.maxUses} max` : ""}
                          {inv.expiresAt ? ` -- expires ${new Date(inv.expiresAt).toLocaleDateString()}` : ""}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <button className="settings-save-btn" style={{ padding: "4px 10px", fontSize: 11 }}
                          onClick={() => { navigator.clipboard.writeText(inv.code); }}>
                          Copy
                        </button>
                        <button className="settings-remove-btn" style={{ padding: "4px 10px", fontSize: 11 }}
                          onClick={() => handleDeleteInvite(inv.code)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Role editor */}
          {selectedRole && (
            <div className="settings-section">
              <h2 className="settings-section-title">Edit Role: {selectedRole.name}</h2>
              <div className="settings-card">
                <div className="settings-field-col">
                  <span className="settings-label">Role Name</span>
                  <input className="settings-select" value={editRoleName} onChange={(e) => setEditRoleName(e.target.value)} maxLength={50} />
                </div>
                <div className="settings-field-col">
                  <span className="settings-label">Color</span>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input type="color" value={editRoleColor || "#5865f2"} onChange={(e) => setEditRoleColor(e.target.value)}
                      style={{ width: 36, height: 36, border: "none", borderRadius: 4, cursor: "pointer", background: "none" }} />
                    <input className="settings-select" value={editRoleColor} onChange={(e) => setEditRoleColor(e.target.value)} placeholder="No color" style={{ width: 120 }} />
                  </div>
                </div>
              </div>

              <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: "20px 0 12px" }}>Permissions</h3>
              <div className="settings-card">
                {PERMISSION_LABELS.map((p) => (
                  <div key={p.key} className="settings-field">
                    <div>
                      <span className="settings-label">{p.label}</span>
                      <span className="settings-hint">{p.description}</span>
                    </div>
                    <button className={`settings-toggle ${(editRolePerms & p.perm) ? "settings-toggle--on" : ""}`}
                      onClick={() => setEditRolePerms((prev) => (prev & p.perm) ? prev & ~p.perm : prev | p.perm)}>
                      <div className="settings-toggle-knob" />
                    </button>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "space-between" }}>
                {selectedRole.position > 0 && (
                  <button className="settings-remove-btn" onClick={handleDeleteRole} disabled={saving}>Delete Role</button>
                )}
                <button className="settings-save-btn" onClick={handleSaveRole} disabled={saving}
                  style={{ marginLeft: "auto", padding: "8px 24px", fontSize: 14 }}>
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
