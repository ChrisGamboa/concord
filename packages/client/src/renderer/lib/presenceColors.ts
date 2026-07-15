// Single source of truth for presence status colors, previously duplicated across
// MemberList, DmSidebar, ProfileCard, and SettingsPage.

export const PRESENCE_COLORS: Record<string, string> = {
  online: "var(--success)",
  idle: "#f0b232",
  dnd: "var(--danger)",
  offline: "var(--text-muted)",
};

/** Color for a presence status; unknown/undefined falls back to offline. */
export function presenceColor(status: string | undefined | null): string {
  return PRESENCE_COLORS[status ?? "offline"] ?? PRESENCE_COLORS.offline;
}
