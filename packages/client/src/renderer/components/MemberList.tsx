import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { usePresenceStore } from "../stores/presence";
import type { ServerMember, PublicUser, Role } from "@concord/shared";
import { avatarColor, avatarUrl } from "../lib/avatar";

interface MemberWithOnline extends ServerMember {
  user?: PublicUser;
  online?: boolean;
}

export function MemberList() {
  const { serverId } = useParams();
  const [members, setMembers] = useState<MemberWithOnline[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const onlineUsers = usePresenceStore((s) => s.onlineUsers);
  const setOnlineUsers = usePresenceStore((s) => s.setOnlineUsers);

  useEffect(() => {
    if (!serverId) return;
    api.getMembers(serverId).then((res) => {
      setMembers(res.members as MemberWithOnline[]);
      const onlineIds = (res.members as MemberWithOnline[])
        .filter((m) => m.online)
        .map((m) => m.userId);
      setOnlineUsers(onlineIds);
    });
    api.getRoles(serverId).then((res) => {
      setRoles(res.roles.filter((r) => r.position > 0)); // exclude @everyone
    }).catch(() => {});
  }, [serverId, setOnlineUsers]);

  const online = members.filter((m) => onlineUsers.has(m.userId));
  const offline = members.filter((m) => !onlineUsers.has(m.userId));

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
            <MemberItem key={m.userId} member={m} isOnline roles={roles} />
          ))}
        </div>
      )}
      {offline.length > 0 && (
        <div style={styles.section}>
          <span style={styles.sectionLabel}>
            Offline — {offline.length}
          </span>
          {offline.map((m) => (
            <MemberItem key={m.userId} member={m} isOnline={false} roles={roles} />
          ))}
        </div>
      )}
    </div>
  );
}

function MemberItem({
  member,
  isOnline,
  roles,
}: {
  member: MemberWithOnline;
  isOnline: boolean;
  roles: Role[];
}) {
  const memberRoles = roles.filter((r) => member.roleIds.includes(r.id));
  const topRole = memberRoles[0]; // highest position (roles sorted by position desc)

  return (
    <div className="hover-bg" style={{ ...styles.member, opacity: isOnline ? 1 : 0.4 }}>
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
            background: isOnline ? "var(--success)" : "var(--text-muted)",
          }}
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
