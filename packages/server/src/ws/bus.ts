import Redis from "ioredis";
import { randomUUID } from "crypto";
import { env } from "../env.js";

// Cross-instance message bus backed by Redis pub/sub. When Redis is reachable,
// broadcasts fan out to every server instance; otherwise the server runs
// single-instance and everything falls back to in-process delivery.

/** Identifies this process so it can ignore its own re-published broadcasts. */
export const INSTANCE_ID = randomUUID();

const BUS_CHANNEL = "concord:bus";

let pub: Redis | null = null;
let sub: Redis | null = null;
let enabled = false;

export function isBusEnabled(): boolean {
  return enabled;
}

/** The command connection (safe for normal commands; the sub connection is not). */
export function getRedis(): Redis | null {
  return enabled ? pub : null;
}

type EnvelopeHandler = (raw: string) => void;

/**
 * Connect to Redis and start relaying published envelopes to `onEnvelope`.
 * Never throws — if Redis is unavailable, the bus stays disabled and the caller
 * transparently degrades to single-instance behaviour.
 */
export async function initBus(onEnvelope: EnvelopeHandler): Promise<void> {
  try {
    pub = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 2 });
    await pub.connect();
    sub = pub.duplicate();
    await sub.connect();
    await sub.subscribe(BUS_CHANNEL);
    sub.on("message", (_channel, message) => onEnvelope(message));
    // A dropped connection should degrade gracefully rather than crash the process.
    pub.on("error", () => {});
    sub.on("error", () => {});
    enabled = true;
    console.log(`[bus] Redis pub/sub enabled (instance ${INSTANCE_ID})`);
  } catch (err) {
    enabled = false;
    pub = null;
    sub = null;
    console.warn(`[bus] Redis unavailable, running single-instance: ${(err as Error).message}`);
  }
}

/** Publish a broadcast envelope to peer instances (fire-and-forget). */
export function publishEnvelope(envelope: unknown): void {
  if (!enabled || !pub) return;
  pub.publish(BUS_CHANNEL, JSON.stringify(envelope)).catch(() => {});
}

export async function closeBus(): Promise<void> {
  try { await sub?.quit(); } catch { /* ignore */ }
  try { await pub?.quit(); } catch { /* ignore */ }
  enabled = false;
}
