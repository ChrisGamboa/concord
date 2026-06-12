import { useEffect, useState } from "react";
import { ProfileCard } from "./ProfileCard";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { usePresenceStore } from "../stores/presence";
import { useAuthStore } from "../stores/auth";
import { useChatStore } from "../stores/chat";
import { toast } from "../stores/toast";
import { Permissions, hasPermission, type ServerMember, type PublicUser, type Role } from "@concord/shared";
import { avatarColor, avatarUrl } from "../lib/avatar";

interface MemberWithOnline extends ServerMember {
  user?: PublicUser;
  online?: boolean;
  presence?: "online" | "idle" | "dnd" | "offline";
}

export const PRESENCE_COLORS: Record<string, string> = {
  online: "var(--success)",
  idle: "#f0b232",
  dnd: "var(--danger)",
  offline: "var(--text-muted)",
};

export function MemberList() {
  const { serverId } = useParams();
  const [members, setMembers] = useState<MemberWithOnline[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const onlineUsers = usePresenceStore((s) => s.onlineUsers);
  const statuses = usePresenceStore((s) => s.statuses);
  const setPresences = usePresenceStore((s) => s.setPresences);
  const myUserId = useAuthStore((s) => s.user?.id);
  const serverOwnerId = useChatStore((s) => s.servers.find((sv) => sv.id === serverId)?.ownerId);

  // Permissions for moderation (ban)
  const [myPerms, setMyPerms] = useState(0);
  useEffect(() => {
    if (!serverId || !myUserId) return;
    api.getMyPermissions(serverId, myUserId).then((r) => setMyPerms(r.permissions)).catch(() => {});
  }, [serverId, myUserId]);
  const canBan = hasPermission(myPerms, Permissions.BAN_MEMBERS);

  // Right-click context menu for moderation
  const [ctxMenu, setCtxMenu] = useState<{ userId: string; name: string; x: number; y: number } | null>(null);
  const [confirmingBan, setConfirmingBan] = useState(false);
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => { setCtxMenu(null); setConfirmingBan(false); };
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    const timer = setTimeout(() => {
      window.addEventListener("click", close);
      window.addEventListener("keydown", handleKey);
    }, 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", handleKey);
    };
  }, [ctxMenu]);

  const reloadMembers = () => {
    if (!serverId) return;
    api.getMembers(serverId).then((res) => {
      setMembers(res.members as MemberWithOnline[]);
    }).catch(() => {});
  };

  const handleBan = async () => {
    if (!ctxMenu || !serverId) return;
    if (!confirmingBan) {
      setConfirmingBan(true);
      return;
    }
    try {
      await api.banMember(serverId, ctxMenu.userId);
      toast(`${ctxMenu.name} was banned`, "success");
      reloadMembers();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to ban member");
    } finally {
      setCtxMenu(null);
      setConfirmingBan(false);
    }
  };

  useEffect(() => {
    if (!serverId) return;
    api.getMembers(serverId).then((res) => {
      const fetched = res.members as MemberWithOnline[];
      setMembers(fetched);
      setPresences(
        Object.fromEntries(
          fetched.filter((m) => m.online).map((m) => [m.userId, m.presence ?? "online"])
        )
      );
    }).catch(() => toast("Failed to load member list"));
    api.getRoles(serverId).then((res) => {
      setRoles(res.roles.filter((r) => r.position > 0)); // exclude @everyone
    }).catch(() => {});
  }, [serverId, setPresences]);

  const online = members.filter((m) => onlineUsers.has(m.userId));
  const offline = members.filter((m) => !onlineUsers.has(m.userId));

  const [profilePopup, setProfilePopup] = useState<{ userId: string; x: number; y: number } | null>(null);

  return (
    <div style={styles.container}>
      {members.length === 0 && (
        <div style={{ padding: "12px 8px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "4px 8px" }}>
              <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "var(--bg-tertiary)", opacity: 0.3 }} />
              <div style={{ height: "12px", width: "80px", background: "var(--bg-tertiary)", borderRadius: "4px", opacity: 0.3 }} />
            </div>
          ))}
        </div>
      )}
      {online.length > 0 && (
        <div style={styles.section}>
          <span style={styles.sectionLabel}>
            Online — {online.length}
          </span>
          {online.map((m) => (
            <MemberItem
              key={m.userId} member={m} isOnline presence={statuses[m.userId] ?? "online"} roles={roles}
              onClickProfile={(member, x, y) => setProfilePopup({ userId: member.userId, x, y })}
              onContextMenu={canBan && m.userId !== myUserId && m.userId !== serverOwnerId
                ? (member, x, y) => { setConfirmingBan(false); setCtxMenu({ userId: member.userId, name: member.user?.displayName ?? "user", x, y }); }
                : undefined}
            />
          ))}
        </div>
      )}
      {offline.length > 0 && (
        <div style={styles.section}>
          <span style={styles.sectionLabel}>
            Offline — {offline.length}
          </span>
          {offline.map((m) => (
            <MemberItem
              key={m.userId} member={m} isOnline={false} presence="offline" roles={roles}
              onClickProfile={(member, x, y) => setProfilePopup({ userId: member.userId, x, y })}
              onContextMenu={canBan && m.userId !== myUserId && m.userId !== serverOwnerId
                ? (member, x, y) => { setConfirmingBan(false); setCtxMenu({ userId: member.userId, name: member.user?.displayName ?? "user", x, y }); }
                : undefined}
            />
          ))}
        </div>
      )}

      {profilePopup && (
        <ProfileCard
          userId={profilePopup.userId}
          x={profilePopup.x}
          y={profilePopup.y}
          anchor="left"
          onClose={() => setProfilePopup(null)}
        />
      )}

      {ctxMenu && (
        <div
          className="member-ctx-menu"
          style={{ top: Math.min(ctxMenu.y, window.innerHeight - 80), left: Math.max(8, ctxMenu.x - 160) }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="member-ctx-item member-ctx-item--danger"
            onClick={handleBan}
          >
            {confirmingBan ? `Confirm ban of ${ctxMenu.name}?` : `Ban ${ctxMenu.name}`}
          </button>
        </div>
      )}
    </div>
  );
}

function MemberItem({
  member,
  isOnline,
  presence,
  roles,
  onClickProfile,
  onContextMenu,
}: {
  member: MemberWithOnline;
  isOnline: boolean;
  presence: "online" | "idle" | "dnd" | "offline";
  roles: Role[];
  onClickProfile: (member: MemberWithOnline, x: number, y: number) => void;
  onContextMenu?: (member: MemberWithOnline, x: number, y: number) => void;
}) {
  const memberRoles = roles.filter((r) => member.roleIds.includes(r.id));
  const topRole = memberRoles[0];

  return (
    <div
      className="hover-bg"
      style={{ ...styles.member, opacity: isOnline ? 1 : 0.4, cursor: "pointer" }}
      onClick={(e) => onClickProfile(member, e.currentTarget.getBoundingClientRect().left, e.currentTarget.getBoundingClientRect().top)}
      onContextMenu={onContextMenu ? (e) => { e.preventDefault(); onContextMenu(member, e.clientX, e.clientY); } : undefined}
    >
      <div style={styles.avatarWrapper}>
        {avatarUrl(member.user?.avatarUrl) ? (
          <img style={{ ...styles.avatar, objectFit: "cover" }} src={avatarUrl(member.user?.avatarUrl)!} alt="" />
        ) : (
          <div style={{ ...styles.avatar, background: avatarColor(member.userId) }}>
            {(member.user?.displayName ?? "?").charAt(0).toUpperCase()}
          </div>
        )}
        <div
          style={{
            ...styles.statusDot,
            background: PRESENCE_COLORS[presence],
          }}
          title={presence === "dnd" ? "Do Not Disturb" : presence}
        />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <span style={{ ...styles.memberName, color: topRole?.color ?? undefined }}>
          {member.nickname ?? member.user?.displayName ?? member.user?.username ?? "Unknown"}
        </span>
        {(member.user as any)?.status && (
          <span style={styles.memberStatus}>{(member.user as any).status}</span>
        )}
        {memberRoles.length > 0 && (
          <div style={styles.roleBadges}>
            {memberRoles.map((r) => (
              <span key={r.id} style={{ ...styles.roleBadge, borderColor: r.color ?? "var(--border)", color: r.color ?? "var(--text-muted)" }}>
                {r.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


const styles: Record<string, React.CSSProperties> = {
  container: {
    width: "var(--member-list-width)",
    background: "var(--bg-secondary)",
    overflowY: "auto",
    padding: "12px 8px",
    flexShrink: 0,
  },
  section: {
    marginBottom: "16px",
  },
  sectionLabel: {
    display: "block",
    fontSize: "11px",
    fontWeight: 700,
    textTransform: "uppercase",
    color: "var(--text-muted)",
    padding: "0 8px",
    marginBottom: "4px",
    letterSpacing: "0.02em",
  },
  member: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "4px 8px",
    borderRadius: "4px",
  },
  avatarWrapper: {
    position: "relative",
    flexShrink: 0,
  },
  avatar: {
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    background: "var(--accent)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 600,
    fontSize: "13px",
  },
  statusDot: {
    position: "absolute",
    bottom: "-1px",
    right: "-1px",
    width: "10px",
    height: "10px",
    borderRadius: "50%",
    border: "2px solid var(--bg-secondary)",
  },
  memberName: {
    fontSize: "13px",
    fontWeight: 500,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    display: "block",
  },
  roleBadges: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "3px",
    marginTop: "2px",
  },
  memberStatus: {
    fontSize: "11px",
    color: "var(--text-muted)",
    display: "block",
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  roleBadge: {
    fontSize: "10px",
    fontWeight: 600,
    padding: "0 4px",
    borderRadius: "3px",
    border: "1px solid",
    lineHeight: "16px",
  },
};
