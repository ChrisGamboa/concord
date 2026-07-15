import React, { useEffect, useRef, useState } from "react";
import { useAsyncAction } from "../hooks/useAsyncAction";
import { useSettingsStore } from "../stores/settings";
import { useAuthStore } from "../stores/auth";
import { usePresenceStore } from "../stores/presence";
import { api } from "../lib/api";
import { sendWs } from "../lib/ws";
import { avatarColor, avatarUrl } from "../lib/avatar";
import { PRESENCE_COLORS } from "../lib/presenceColors";

const PRESENCE_OPTIONS = [
  { value: "online" as const, label: "Online", color: PRESENCE_COLORS.online },
  { value: "idle" as const, label: "Idle", color: PRESENCE_COLORS.idle },
  { value: "dnd" as const, label: "Do Not Disturb", color: PRESENCE_COLORS.dnd },
];

interface MediaDeviceOption {
  deviceId: string;
  label: string;
}

type Section = "account" | "notifications" | "audio" | "video";

function PresenceSelector({ userId }: { userId?: string }) {
  const statuses = usePresenceStore((s) => s.statuses);
  const setPresence = usePresenceStore((s) => s.setPresence);
  const current = (userId && statuses[userId]) || "online";

  const choose = (status: "online" | "idle" | "dnd") => {
    // Remember the manual choice so DND survives restarts and idle detection respects it
    if (status === "dnd") localStorage.setItem("concord-presence", "dnd");
    else localStorage.removeItem("concord-presence");
    sendWs({ type: "presence_set", status });
    if (userId) setPresence(userId, status);
  };

  return (
    <div style={{ display: "flex", gap: "8px" }}>
      {PRESENCE_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          className={`presence-option${current === opt.value ? " presence-option--active" : ""}`}
          onClick={() => choose(opt.value)}
        >
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: opt.color, flexShrink: 0 }} />
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function SettingsPage({ onClose }: { onClose: () => void }) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const updateUser = useAuthStore((s) => s.updateUser);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [activeSection, setActiveSection] = useState<Section>("account");

  // Profile editing
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(user?.displayName ?? "");
  const [statusInput, setStatusInput] = useState(user?.status ?? "");
  const { saving, msg: profileMsg, run } = useAsyncAction();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSaveName = () => {
    if (!nameInput.trim() || nameInput.trim() === user?.displayName) {
      setEditingName(false);
      return;
    }
    return run(async () => {
      const res = await api.updateProfile({ displayName: nameInput.trim() });
      updateUser(res.user);
      setEditingName(false);
    }, "Display name updated");
  };

  const handleAvatarUpload = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    return run(async () => {
      const res = await api.updateProfile({ avatar: file });
      updateUser(res.user);
    }, "Avatar updated");
  };

  const handleRemoveAvatar = () => run(async () => {
    const res = await api.updateProfile({ removeAvatar: true });
    updateUser(res.user);
  }, "Avatar removed");

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

  // Device/notification prefs live in the shared settings store.
  const selectedAudioInput = useSettingsStore((s) => s.audioInput);
  const selectedAudioOutput = useSettingsStore((s) => s.audioOutput);
  const selectedVideoInput = useSettingsStore((s) => s.videoInput);
  const notificationsEnabled = useSettingsStore((s) => s.notificationsEnabled);
  const setAudioInput = useSettingsStore((s) => s.setAudioInput);
  const setAudioOutput = useSettingsStore((s) => s.setAudioOutput);
  const setVideoInput = useSettingsStore((s) => s.setVideoInput);
  const setNotificationsEnabled = useSettingsStore((s) => s.setNotificationsEnabled);

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
                <div className="settings-field-col">
                  <span className="settings-label">Presence</span>
                  <span className="settings-hint">
                    Do Not Disturb suppresses desktop notifications. Idle is set automatically after inactivity.
                  </span>
                  <PresenceSelector userId={user?.id} />
                </div>
                <div className="settings-field-col">
                  <span className="settings-label">Status</span>
                  <span className="settings-hint">What are you up to? Visible to other members.</span>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <input
                      className="settings-select"
                      value={statusInput}
                      onChange={(e) => setStatusInput(e.target.value)}
                      placeholder="Set a status..."
                      maxLength={128}
                    />
                    <button className="settings-save-btn" disabled={saving} onClick={() => run(async () => {
                      const res = await api.updateProfile({ status: statusInput });
                      updateUser(res.user);
                    }, "Status updated")}>
                      Save
                    </button>
                  </div>
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
                    onClick={() => setNotificationsEnabled(!notificationsEnabled)}
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
                    onChange={(e) => setAudioInput(e.target.value)}
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
                    onChange={(e) => setAudioOutput(e.target.value)}
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
                    onChange={(e) => setVideoInput(e.target.value)}
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
