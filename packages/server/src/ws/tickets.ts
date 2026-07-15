import { randomUUID } from "crypto";
import { getRedis } from "./bus.js";

// Short-lived, single-use tickets for authenticating the WebSocket upgrade, so the
// long-lived JWT never appears in the /ws URL (and thus never in access logs).
// Backed by Redis (works across instances) with an in-process fallback.

const TTL_MS = 30_000;

export interface TicketData {
  userId: string;
  tokenVersion: number;
}

const local = new Map<string, { data: TicketData; expires: number }>();

export async function issueTicket(userId: string, tokenVersion: number): Promise<string> {
  const ticket = randomUUID();
  const r = getRedis();
  if (r) {
    try {
      await r.set(`ws:ticket:${ticket}`, JSON.stringify({ userId, tokenVersion }), "PX", TTL_MS);
      return ticket;
    } catch {
      /* fall through to in-memory */
    }
  }
  local.set(ticket, { data: { userId, tokenVersion }, expires: Date.now() + TTL_MS });
  return ticket;
}

/** Redeem a ticket exactly once; returns null if unknown/expired/already used. */
export async function consumeTicket(ticket: string): Promise<TicketData | null> {
  const r = getRedis();
  if (r) {
    try {
      const raw = await r.getdel(`ws:ticket:${ticket}`); // atomic get + delete (single-use)
      return raw ? (JSON.parse(raw) as TicketData) : null;
    } catch {
      /* fall through to in-memory */
    }
  }
  const entry = local.get(ticket);
  local.delete(ticket);
  if (!entry || entry.expires < Date.now()) return null;
  return entry.data;
}
