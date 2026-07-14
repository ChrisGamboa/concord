import { getRedis, isBusEnabled } from "./bus.js";

// Presence (who is online + their status) shared across server instances via Redis.
//
// Each user has a ZSET `pres:u:<userId>` of active sessionIds scored by an expiry
// timestamp; a global ZSET `pres:users` indexes online userIds the same way. Live
// sessions refresh their scores on a heartbeat, so a crashed instance's sessions
// simply expire (via score) instead of leaking "online" forever.
//
// When Redis is not enabled the module falls back to in-process maps, preserving
// exact single-instance behaviour (and keeping tests hermetic).

export type PresenceStatus = "online" | "idle" | "dnd";

const TTL_MS = 60_000;
const HEARTBEAT_MS = TTL_MS / 2;

const userKey = (userId: string) => `pres:u:${userId}`;
const USERS_KEY = "pres:users";
const statusKey = (userId: string) => `pres:status:${userId}`;

// In-process state: authoritative in single-instance mode, and the set of this
// instance's local sessions to heartbeat in multi-instance mode.
const localSessions = new Map<string, string>(); // sessionId -> userId
const localStatuses = new Map<string, PresenceStatus>();

function localSessionCount(userId: string): number {
  let n = 0;
  for (const uid of localSessions.values()) if (uid === userId) n++;
  return n;
}

// Add/remove run as atomic Lua so the per-user ZSET and the global users index
// never drift, and concurrent first-connects across instances see distinct counts
// (exactly one observes count == 1 and broadcasts "online").
const ADD_LUA = `
redis.call('ZADD', KEYS[1], ARGV[1], ARGV[2])
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, ARGV[4])
local c = redis.call('ZCARD', KEYS[1])
redis.call('ZADD', KEYS[2], ARGV[1], ARGV[3])
return c`;

const REMOVE_LUA = `
redis.call('ZREM', KEYS[1], ARGV[1])
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, ARGV[3])
local c = redis.call('ZCARD', KEYS[1])
if c == 0 then redis.call('ZREM', KEYS[2], ARGV[2]) end
return c`;

/** Register a session. Returns true if it is the user's first active session. */
export async function addSession(sessionId: string, userId: string): Promise<boolean> {
  localSessions.set(sessionId, userId);
  const r = getRedis();
  if (r) {
    try {
      const now = Date.now();
      const count = (await r.eval(
        ADD_LUA, 2, userKey(userId), USERS_KEY,
        String(now + TTL_MS), sessionId, userId, String(now),
      )) as number;
      return count === 1;
    } catch {
      /* fall through to local */
    }
  }
  return localSessionCount(userId) === 1;
}

/** Deregister a session. Returns true if the user now has no active sessions. */
export async function removeSession(sessionId: string, userId: string): Promise<boolean> {
  localSessions.delete(sessionId);
  const r = getRedis();
  if (r) {
    try {
      const now = Date.now();
      const count = (await r.eval(
        REMOVE_LUA, 2, userKey(userId), USERS_KEY,
        sessionId, userId, String(now),
      )) as number;
      return count === 0;
    } catch {
      /* fall through to local */
    }
  }
  return localSessionCount(userId) === 0;
}

export async function isUserOnline(userId: string): Promise<boolean> {
  const r = getRedis();
  if (r) {
    try {
      const now = Date.now();
      await r.zremrangebyscore(userKey(userId), 0, now);
      return (await r.zcard(userKey(userId))) > 0;
    } catch {
      /* fall through to local */
    }
  }
  return localSessionCount(userId) > 0;
}

export async function getOnlineUserIds(): Promise<string[]> {
  const r = getRedis();
  if (r) {
    try {
      const now = Date.now();
      await r.zremrangebyscore(USERS_KEY, 0, now);
      return await r.zrangebyscore(USERS_KEY, now, "+inf");
    } catch {
      /* fall through to local */
    }
  }
  return [...new Set(localSessions.values())];
}

export async function setUserStatus(userId: string, status: PresenceStatus): Promise<void> {
  localStatuses.set(userId, status);
  const r = getRedis();
  if (r) {
    try {
      await r.set(statusKey(userId), status, "PX", TTL_MS);
    } catch {
      /* ignore */
    }
  }
}

export async function getUserStatus(userId: string): Promise<PresenceStatus | undefined> {
  const r = getRedis();
  if (r) {
    try {
      return (await r.get(statusKey(userId))) as PresenceStatus | null ?? undefined;
    } catch {
      /* fall through to local */
    }
  }
  return localStatuses.get(userId);
}

/** Batch status lookup for a member list; missing users are simply absent. */
export async function getUserStatuses(userIds: string[]): Promise<Map<string, PresenceStatus>> {
  const result = new Map<string, PresenceStatus>();
  if (userIds.length === 0) return result;
  const r = getRedis();
  if (r) {
    try {
      const values = await r.mget(userIds.map(statusKey));
      userIds.forEach((uid, i) => {
        if (values[i]) result.set(uid, values[i] as PresenceStatus);
      });
      return result;
    } catch {
      /* fall through to local */
    }
  }
  for (const uid of userIds) {
    const st = localStatuses.get(uid);
    if (st) result.set(uid, st);
  }
  return result;
}

export async function clearUserStatus(userId: string): Promise<void> {
  localStatuses.delete(userId);
  const r = getRedis();
  if (r) {
    try {
      await r.del(statusKey(userId));
    } catch {
      /* ignore */
    }
  }
}

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

/** Periodically refresh this instance's live sessions so their Redis TTLs stay fresh. */
export function startPresenceHeartbeat(): void {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(async () => {
    if (!isBusEnabled()) return;
    const r = getRedis();
    if (!r) return;
    const now = Date.now();
    for (const [sessionId, userId] of localSessions) {
      try {
        await r.zadd(userKey(userId), now + TTL_MS, sessionId);
        await r.zadd(USERS_KEY, now + TTL_MS, userId);
        await r.pexpire(statusKey(userId), TTL_MS);
      } catch {
        /* ignore transient errors; the next tick retries */
      }
    }
  }, HEARTBEAT_MS);
  heartbeatTimer.unref?.();
}

export function stopPresenceHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}
