// Simple token-bucket rate limiter for WebSocket frames. HTTP is covered by
// @fastify/rate-limit, but the WS message path (send_message, reactions, typing)
// is persistent and otherwise unthrottled, so each connection gets its own buckets.

export class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSec: number,
    now: number = Date.now()
  ) {
    this.tokens = capacity;
    this.lastRefill = now;
  }

  /** Try to consume `cost` tokens; returns false (and consumes nothing) if empty. */
  tryConsume(cost = 1, now: number = Date.now()): boolean {
    this.tokens = Math.min(
      this.capacity,
      this.tokens + ((now - this.lastRefill) / 1000) * this.refillPerSec
    );
    this.lastRefill = now;
    if (this.tokens < cost) return false;
    this.tokens -= cost;
    return true;
  }
}

/** Per-connection limits: a broad frame limit plus a tighter one for message sends. */
export function createConnectionLimiter(now: number = Date.now()) {
  const frames = new TokenBucket(40, 8, now); // ~8 frames/s sustained, burst 40
  const sends = new TokenBucket(10, 2, now); // ~2 sends/s sustained, burst 10

  return {
    /** Charge a frame; false → over the broad limit. */
    allowFrame: (now?: number) => frames.tryConsume(1, now),
    /** Charge a message-creation action; false → over the send limit. */
    allowSend: (now?: number) => sends.tryConsume(1, now),
  };
}

// Note: limits are per-connection. A user opening many sockets multiplies their
// effective rate; socket count is bounded per-IP by the global HTTP rate limit on
// the /ws upgrade. A per-user connection cap would close the multi-socket path.

/** Client message types that create/persist content (DB write + fan-out) and warrant the tighter send limit. */
export const SEND_TYPES = new Set(["send_message", "edit_message", "delete_message", "toggle_reaction"]);
