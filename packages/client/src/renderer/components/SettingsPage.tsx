import { useEffect, useState } from "react";
import { useAuthStore } from "../stores/auth";

interface MediaDeviceOption {
  deviceId: string;
  label: string;
}

export function SettingsPage({ onClose }: { onClose: () => void }) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [confirmLogout, setConfirmLogout] = useState(false);

  // Close on ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Auto-reset logout confirmation after 3 seconds
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
          .map((d) => ({ deviceId: d.deviceId, label: d.label || `Mic ${d.deviceId.slice(0, 8)}` }))
      );
      setAudioOutputs(
        devices
          .filter((d) => d.kind === "audiooutput")
          .map((d) => ({ deviceId: d.deviceId, label: d.label || `Speaker ${d.deviceId.slice(0, 8)}` }))
      );
      setVideoInputs(
        devices
          .filter((d) => d.kind === "videoinput")
          .map((d) => ({ deviceId: d.deviceId, label: d.label || `Camera ${d.deviceId.slice(0, 8)}` }))
      );
    });
  }, []);

  const save = (key: string, value: string) => {
    localStorage.setItem(key, value);
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>Settings</h2>
          <button onClick={onClose} style={styles.closeButton}>
            X
          </button>
        </div>

        <div style={styles.content}>
          {/* Account */}
          <section style={styles.section}>
            <h3 style={styles.sectionTitle}>Account</h3>
            <div style={styles.field}>
              <span style={styles.label}>Username</span>
              <span style={styles.value}>{user?.username}</span>
            </div>
            <div style={styles.field}>
              <span style={styles.label}>Display Name</span>
              <span style={styles.value}>{user?.displayName}</span>
            </div>
            <button
              onClick={confirmLogout ? logout : () => setConfirmLogout(true)}
              style={{
                ...styles.dangerButton,
                ...(confirmLogout ? { background: "#a12d2f" } : {}),
              }}
            >
              {confirmLogout ? "Click again to confirm" : "Log Out"}
            </button>
          </section>

          {/* Notifications */}
          <section style={styles.section}>
            <h3 style={styles.sectionTitle}>Notifications</h3>
            <div style={styles.field}>
              <span style={styles.label}>Desktop Notifications</span>
              <button
                onClick={() => {
                  const next = !notificationsEnabled;
                  setNotificationsEnabled(next);
                  save("concord:notifications", String(next));
                }}
                style={{
                  ...styles.toggle,
                  background: notificationsEnabled
                    ? "var(--success)"
                    : "var(--bg-tertiary)",
                }}
              >
                {notificationsEnabled ? "On" : "Off"}
              </button>
            </div>
          </section>

          {/* Audio */}
          <section style={styles.section}>
            <h3 style={styles.sectionTitle}>Voice & Audio</h3>
            <div style={styles.field}>
              <span style={styles.label}>Input Device</span>
              <select
                style={styles.select}
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
            <div style={styles.field}>
              <span style={styles.label}>Output Device</span>
              <select
                style={styles.select}
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
          </section>

          {/* Video */}
          <section style={styles.section}>
            <h3 style={styles.sectionTitle}>Video</h3>
            <div style={styles.field}>
              <span style={styles.label}>Camera</span>
              <select
                style={styles.select}
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
          </section>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 200,
  },
  panel: {
    background: "var(--bg-secondary)",
    borderRadius: "8px",
    width: "600px",
    maxHeight: "80vh",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 24px",
    borderBottom: "1px solid var(--border)",
  },
  title: {
    fontSize: "20px",
    fontWeight: 600,
  },
  closeButton: {
    width: "32px",
    height: "32px",
    background: "var(--bg-tertiary)",
    border: "none",
    borderRadius: "50%",
    color: "var(--text-secondary)",
    fontSize: "14px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: "16px 24px",
    overflowY: "auto",
    flex: 1,
  },
  section: {
    marginBottom: "24px",
  },
  sectionTitle: {
    fontSize: "12px",
    fontWeight: 700,
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: "12px",
    letterSpacing: "0.02em",
  },
  field: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "12px",
  },
  label: {
    fontSize: "14px",
    color: "var(--text-secondary)",
  },
  value: {
    fontSize: "14px",
    color: "var(--text-primary)",
  },
  select: {
    padding: "6px 12px",
    background: "var(--input-bg)",
    border: "1px solid var(--border)",
    borderRadius: "4px",
    color: "var(--text-primary)",
    fontSize: "13px",
    minWidth: "200px",
  },
  toggle: {
    padding: "6px 16px",
    border: "none",
    borderRadius: "12px",
    color: "white",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
  },
  dangerButton: {
    padding: "8px 16px",
    background: "var(--danger)",
    color: "white",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: 600,
    marginTop: "8px",
  },
};
