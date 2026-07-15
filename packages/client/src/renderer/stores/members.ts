import { create } from "zustand";
import { api } from "../lib/api";

/** Raw member row as returned by the members API (shape kept loose on purpose). */
export type MemberRow = {
  userId: string;
  nickname?: string | null;
  roleIds?: string[];
  joinedAt?: string;
  online?: boolean;
  presence?: string;
  user?: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    status?: string | null;
  } | null;
};

interface MembersState {
  byServer: Record<string, MemberRow[]>;
  inflight: Record<string, Promise<MemberRow[]> | undefined>;
  /** Fetch members once per server; concurrent callers share the in-flight request. */
  ensureMembers: (serverId: string) => Promise<MemberRow[]>;
  getCached: (serverId: string) => MemberRow[] | undefined;
  /** Overwrite the cache for a server (called by the live MemberList so cached
   *  consumers stay fresh after joins/leaves/bans/role changes). */
  setMembers: (serverId: string, members: MemberRow[]) => void;
}

export const useMembersStore = create<MembersState>()((set, get) => ({
  byServer: {},
  inflight: {},
  ensureMembers: (serverId) => {
    const cached = get().byServer[serverId];
    if (cached) return Promise.resolve(cached);
    const existing = get().inflight[serverId];
    if (existing) return existing;
    const p = api.getMembers(serverId)
      .then((res) => {
        const members = res.members as MemberRow[];
        set((s) => ({
          byServer: { ...s.byServer, [serverId]: members },
          inflight: { ...s.inflight, [serverId]: undefined },
        }));
        return members;
      })
      .catch((err) => {
        set((s) => ({ inflight: { ...s.inflight, [serverId]: undefined } }));
        throw err;
      });
    set((s) => ({ inflight: { ...s.inflight, [serverId]: p } }));
    return p;
  },
  getCached: (serverId) => get().byServer[serverId],
  setMembers: (serverId, members) =>
    set((s) => ({ byServer: { ...s.byServer, [serverId]: members } })),
}));
