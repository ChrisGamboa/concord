import React, { useEffect, useRef, useState } from "react";
import { useAuthStore } from "../stores/auth";
import { api } from "../lib/api";
import { avatarColor, avatarUrl } from "../lib/avatar";

interface MediaDeviceOption {
  deviceId: string;
  label: string;
}

type Section = "account" | "notifications" | "audio" | "video";

export function SettingsPage({ onClose }: { onClose: () => void }) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const updateUser = useAuthStore((s) => s.updateUser);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [activeSection, setActiveSection] = useState<Section>("account");

  // Profile editing
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(user?.displayName ?? "");
  const [saving, setSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSaveName = async () => {
    if (!nameInput.trim() || nameInput.trim() === user?.displayName) {
      setEditingName(false);
      return;
    }
    setSaving(true);
    setProfileMsg("");
    try {
      const res = await api.updateProfile({ displayName: nameInput.trim() });
      updateUser(res.user);
      setEditingName(false);
      setProfileMsg("Display name updated");
    } catch (err) {
      setProfileMsg(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setSaving(true);
    setProfileMsg("");
    try {
      const res = await api.updateProfile({ avatar: file });
      updateUser(res.user);
      setProfileMsg("Avatar updated");
    } catch (err) {
      setProfileMsg(err instanceof Error ? err.message : "Failed to upload");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setSaving(true);
    setProfileMsg("");
    try {
      const res = await api.updateProfile({ removeAvatar: true });
      updateUser(res.user);
      setProfileMsg("Avatar removed");
    } catch (err) {
      setProfileMsg(err instanceof Error ? err.message : "Failed to remove");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    if (!confirmLogout) return;
    const t = setTimeout(() => setConfirmLogout(false), 3000);
    return () => clearTimeout(t);
  }, [confirmLogout]);

  const [audioInputs, setAudioInputs] = useState<MediaDeviceOption[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceOption[]>([]);
  const [videoInputs, setVideoInputs] = useState<MediaDeviceOption[]>([]);

  const [selectedAudioInput, setSelectedAudioInput] = useState(
    localStorage.getItem("concord:audioInput") ?? "default"
  );
  const [selectedAudioOutput, setSelectedAudioOutput] = useState(
    localStorage.getItem("concord:audioOutput") ?? "default"
  );
  const [selectedVideoInput, setSelectedVideoInput] = useState(
    localStorage.getItem("concord:videoInput") ?? "default"
  );
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    localStorage.getItem("concord:notifications") !== "false"
  );

  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      setAudioInputs(
        devices
          .filter((d) => d.kind === "audioinput")
          .map((d) => ({
            deviceId: d.deviceId,
            label: d.label || `Mic ${d.deviceId.slice(0, 8)}`,
          }))
      );
      setAudioOutputs(
        devices
          .filter((d) => d.kind === "audiooutput")
          .map((d) => ({
            deviceId: d.deviceId,
            label: d.label || `Speaker ${d.deviceId.slice(0, 8)}`,
          }))
      );
      setVideoInputs(
        devices
          .filter((d) => d.kind === "videoinput")
          .map((d) => ({
            deviceId: d.deviceId,
            label: d.label || `Camera ${d.deviceId.slice(0, 8)}`,
          }))
      );
    });
  }, []);

  const save = (key: string, value: string) => {
    localStorage.setItem(key, value);
  };

  const sections: { id: Section; label: string; icon: React.ReactNode }[] = [
    {
      id: "account",
      label: "My Account",
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      ),
    },
    {
      id: "notifications",
      label: "Notifications",
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      ),
    },
    {
      id: "audio",
      label: "Voice & Audio",
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        </svg>
      ),
    },
    {
      id: "video",
      label: "Video",
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M23 7l-7 5 7 5V7z" />
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
        </svg>
      ),
    },
  ];

  return (
    <div className="settings-overlay">
      {/* Sidebar */}
      <div className="settings-sidebar">
        <div className="settings-sidebar-scroll">
          <div className="settings-nav-label">User Settings</div>
          {sections.map((s) => (
            <button
              key={s.id}
              className={`settings-nav-item ${activeSection === s.id ? "settings-nav-item--active" : ""}`}
              onClick={() => setActiveSection(s.id)}
            >
              {s.icon}
              {s.label}
            </button>
          ))}

          <div className="settings-nav-divider" />

          <button
            className="settings-nav-item settings-nav-item--danger"
            onClick={confirmLogout ? logout : () => setConfirmLogout(true)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            {confirmLogout ? "Click again to confirm" : "Log Out"}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="settings-content">
        <div className="settings-content-scroll">
          {/* Close button */}
          <button className="settings-close" onClick={onClose} title="Close (ESC)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          {activeSection === "account" && (
            <div className="settings-section">
              <h2 className="settings-section-title">My Account</h2>

              {/* Profile preview card */}
              <div className="settings-profile-card">
                <div className="settings-profile-banner" style={{ background: avatarColor(user?.id ?? "") }} />
                <div className="settings-profile-body">
                  <div className="settings-avatar-wrapper">
                    {avatarUrl(user?.avatarUrl) ? (
                      <img
                        className="settings-avatar"
                        src={avatarUrl(user?.avatarUrl)!}
                        alt=""
                      />
                    ) : (
                      <div
                        className="settings-avatar"
                        style={{ background: avatarColor(user?.id ?? ""), display: "flex", alignItems: "center", justifyContent: "center", fontSize: "32px", fontWeight: 700, color: "white" }}
                      >
                        {(user?.displayName ?? "?").charAt(0).toUpperCase()}
                      </div>
                    )}
                    <button
                      className="settings-avatar-edit"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={saving}
                      title="Change avatar"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                        <circle cx="12" cy="13" r="4" />
                      </svg>
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleAvatarUpload(file);
                        e.target.value = "";
                      }}
                    />
                  </div>
                  <div className="settings-profile-info">
                    <span className="settings-profile-name">{user?.displayName}</span>
                    <span className="settings-profile-username">{user?.username}</span>
                  </div>
                </div>
              </div>

              {profileMsg && (
                <div className="settings-profile-msg">{profileMsg}</div>
              )}

              {/* Editable fields */}
              <div className="settings-card" style={{ marginTop: "16px" }}>
                <div className="settings-field">
                  <span className="settings-label">Username</span>
                  <span className="settings-value">{user?.username}</span>
                </div>
                <div className="settings-field">
                  <span className="settings-label">Display Name</span>
                  {editingName ? (
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <input
                        className="settings-inline-input"
                        value={nameInput}
                        onChange={(e) => setNameInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveName();
                          if (e.key === "Escape") { setEditingName(false); setNameInput(user?.displayName ?? ""); }
                        }}
                        autoFocus
                        maxLength={64}
                        disabled={saving}
                      />
                      <button className="settings-save-btn" onClick={handleSaveName} disabled={saving}>
                        Save
                      </button>
                      <button className="settings-cancel-btn" onClick={() => { setEditingName(false); setNameInput(user?.displayName ?? ""); }}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      className="settings-edit-btn"
                      onClick={() => { setEditingName(true); setNameInput(user?.displayName ?? ""); }}
                    >
                      {user?.displayName}
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                  )}
                </div>
                {user?.avatarUrl && (
                  <div className="settings-field">
                    <span className="settings-label">Avatar</span>
                    <button className="settings-remove-btn" onClick={handleRemoveAvatar} disabled={saving}>
                      Remove Avatar
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeSection === "notifications" && (
            <div className="settings-section">
              <h2 className="settings-section-title">Notifications</h2>
              <div className="settings-card">
                <div className="settings-field">
                  <div>
                    <span className="settings-label">Desktop Notifications</span>
                    <span className="settings-hint">
                      Show a notification when you receive a message while the app is not focused
                    </span>
                  </div>
                  <button
                    className={`settings-toggle ${notificationsEnabled ? "settings-toggle--on" : ""}`}
                    onClick={() => {
                      const next = !notificationsEnabled;
                      setNotificationsEnabled(next);
                      save("concord:notifications", String(next));
                    }}
                  >
                    <div className="settings-toggle-knob" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeSection === "audio" && (
            <div className="settings-section">
              <h2 className="settings-section-title">Voice & Audio</h2>
              <div className="settings-card">
                <div className="settings-field-col">
                  <span className="settings-label">Input Device</span>
                  <select
                    className="settings-select"
                    value={selectedAudioInput}
                    onChange={(e) => {
                      setSelectedAudioInput(e.target.value);
                      save("concord:audioInput", e.target.value);
                    }}
                  >
                    <option value="default">Default</option>
                    {audioInputs.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="settings-field-col">
                  <span className="settings-label">Output Device</span>
                  <select
                    className="settings-select"
                    value={selectedAudioOutput}
                    onChange={(e) => {
                      setSelectedAudioOutput(e.target.value);
                      save("concord:audioOutput", e.target.value);
                    }}
                  >
                    <option value="default">Default</option>
                    {audioOutputs.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {activeSection === "video" && (
            <div className="settings-section">
              <h2 className="settings-section-title">Video</h2>
              <div className="settings-card">
                <div className="settings-field-col">
                  <span className="settings-label">Camera</span>
                  <select
                    className="settings-select"
                    value={selectedVideoInput}
                    onChange={(e) => {
                      setSelectedVideoInput(e.target.value);
                      save("concord:videoInput", e.target.value);
                    }}
                  >
                    <option value="default">Default</option>
                    {videoInputs.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
