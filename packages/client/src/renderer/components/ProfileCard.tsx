import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { avatarColor, avatarUrl } from "../lib/avatar";
import { usePresenceStore } from "../stores/presence";
import type { Role } from "@concord/shared";

interface ProfileCardProps {
  userId: string;
  x: number;
  y: number;
  /** "left" positions card to the left of (x,y), "right" to the right */
  anchor?: "left" | "right";
  onClose: () => void;
}

interface MemberData {
  displayName: string;
  username: string;
  avatarUrl: string | null;
  status: string | null;
  joinedAt: string;
  roleIds: string[];
}

export function ProfileCard({ userId, x, y, anchor = "left", onClose }: ProfileCardProps) {
  const { serverId } = useParams();
  const navigate = useNavigate();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const onlineUsers = usePresenceStore((s) => s.onlineUsers);
  const isOnline = onlineUsers.has(userId);
  const isOwnProfile = userId === currentUserId;
  const [member, setMember] = useState<MemberData | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useEffect(() => {
    if (!serverId) return;
    api.getMembers(serverId).then((res) => {
      const m = (res.members as any[]).find((m: any) => m.userId === userId);
      if (m) {
        setMember({
          displayName: m.user?.displayName ?? m.nickname ?? "Unknown",
          username: m.user?.username ?? "",
          avatarUrl: m.user?.avatarUrl ?? null,
          status: m.user?.status ?? null,
          joinedAt: m.joinedAt,
          roleIds: m.roleIds ?? [],
        });
      }
    }).catch(() => {});
    api.getRoles(serverId).then((res) => {
      setRoles(res.roles.filter((r) => r.position > 0));
    }).catch(() => {});
  }, [serverId, userId]);

  // Position card within viewport
  useEffect(() => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    let left = anchor === "right" ? x : x - rect.width;
    let top = y;
    left = Math.max(8, Math.min(left, window.innerWidth - rect.width - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - rect.height - 8));
    setPos({ left, top });
  }, [x, y, anchor, member]);

  // Close on click outside
  useEffect(() => {
    const close = () => onClose();
    const timer = setTimeout(() => window.addEventListener("click", close, { once: true }), 0);
    return () => { clearTimeout(timer); window.removeEventListener("click", close); };
  }, [onClose]);

  const memberRoles = roles.filter((r) => member?.roleIds.includes(r.id));

  return (
    <div
      ref={cardRef}
      className="profile-card"
      style={{ left: pos.left, top: pos.top, right: "auto" }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="profile-card-banner" style={{ background: avatarColor(userId) }} />
      <div className="profile-card-avatar-wrap">
        {avatarUrl(member?.avatarUrl) ? (
          <img className="profile-card-avatar" src={avatarUrl(member?.avatarUrl)!} alt="" />
        ) : (
          <div className="profile-card-avatar" style={{ background: avatarColor(userId), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 700, color: "white" }}>
            {(member?.displayName ?? "?").charAt(0).toUpperCase()}
          </div>
        )}
        <div className="profile-card-status-dot" style={{ background: isOnline ? "var(--success)" : "var(--text-muted)" }} />
      </div>
      <div className="profile-card-body">
        <div className="profile-card-name">{member?.displayName ?? "Loading..."}</div>
        <div className="profile-card-username">{member?.username}</div>
        {member?.status && (
          <div className="profile-card-user-status">{member.status}</div>
        )}

        <div style={{ height: 1, background: "var(--border)", margin: "10px 0" }} />

        {memberRoles.length > 0 && (
          <div>
            <div className="profile-card-section-label">Roles</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {memberRoles.map((r) => (
                <span key={r.id} style={{ fontSize: 11, fontWeight: 600, padding: "1px 6px", borderRadius: 3, border: `1px solid ${r.color ?? "var(--border)"}`, color: r.color ?? "var(--text-muted)" }}>
                  {r.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {member?.joinedAt && (
          <div style={{ marginTop: 8 }}>
            <div className="profile-card-section-label">Member Since</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              {new Date(member.joinedAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
            </div>
          </div>
        )}

        {!isOwnProfile && (
          <button
            style={{
              marginTop: 10,
              width: "100%",
              padding: "6px 0",
              background: "var(--accent)",
              color: "white",
              border: "none",
              borderRadius: 4,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
            onClick={async () => {
              try {
                const conv = await api.createConversation(userId);
                onClose();
                navigate(`/channels/@me/${conv.id}`);
              } catch {
                // ignore
              }
            }}
          >
            Message
          </button>
        )}
      </div>
    </div>
  );
}
