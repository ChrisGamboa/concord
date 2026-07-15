import { create } from "zustand";

// Local user preferences (audio/video devices, notifications). Backed by the same
// localStorage keys used previously, so existing settings carry over — but now
// centralized and reactive, so VoiceChannel can apply device changes live and the
// notification toggle actually gates desktop notifications.

const read = (key: string, fallback = "default") => localStorage.getItem(key) ?? fallback;

interface SettingsState {
  audioInput: string;
  audioOutput: string;
  videoInput: string;
  notificationsEnabled: boolean;
  setAudioInput: (v: string) => void;
  setAudioOutput: (v: string) => void;
  setVideoInput: (v: string) => void;
  setNotificationsEnabled: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()((set) => ({
  audioInput: read("concord:audioInput"),
  audioOutput: read("concord:audioOutput"),
  videoInput: read("concord:videoInput"),
  notificationsEnabled: localStorage.getItem("concord:notifications") !== "false",
  setAudioInput: (v) => { localStorage.setItem("concord:audioInput", v); set({ audioInput: v }); },
  setAudioOutput: (v) => { localStorage.setItem("concord:audioOutput", v); set({ audioOutput: v }); },
  setVideoInput: (v) => { localStorage.setItem("concord:videoInput", v); set({ videoInput: v }); },
  setNotificationsEnabled: (v) => { localStorage.setItem("concord:notifications", String(v)); set({ notificationsEnabled: v }); },
}));

/** A concrete deviceId, or undefined for the system default ("default"/empty). */
export function deviceIdOrDefault(v: string): string | undefined {
  return v && v !== "default" ? v : undefined;
}
