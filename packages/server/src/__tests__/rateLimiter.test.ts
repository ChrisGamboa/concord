import { describe, it, expect } from "vitest";
import { TokenBucket, createConnectionLimiter, SEND_TYPES } from "../ws/rateLimiter.js";

describe("TokenBucket", () => {
  it("allows up to capacity as a burst, then denies", () => {
    const b = new TokenBucket(3, 1, 0);
    expect(b.tryConsume(1, 0)).toBe(true);
    expect(b.tryConsume(1, 0)).toBe(true);
    expect(b.tryConsume(1, 0)).toBe(true);
    expect(b.tryConsume(1, 0)).toBe(false); // empty
  });

  it("refills over time at the configured rate", () => {
    const b = new TokenBucket(3, 1, 0); // 1 token/sec
    b.tryConsume(1, 0);
    b.tryConsume(1, 0);
    b.tryConsume(1, 0);
    expect(b.tryConsume(1, 0)).toBe(false);
    expect(b.tryConsume(1, 1000)).toBe(true); // 1s → 1 token
    expect(b.tryConsume(1, 1000)).toBe(false);
  });

  it("never refills beyond capacity", () => {
    const b = new TokenBucket(2, 5, 0);
    // 10s of refill at 5/s would be 50, but capacity caps at 2
    expect(b.tryConsume(1, 10_000)).toBe(true);
    expect(b.tryConsume(1, 10_000)).toBe(true);
    expect(b.tryConsume(1, 10_000)).toBe(false);
  });

  it("does not consume when it denies", () => {
    const b = new TokenBucket(1, 1, 0);
    expect(b.tryConsume(2, 0)).toBe(false); // cost > available
    expect(b.tryConsume(1, 0)).toBe(true); // token still there
  });
});

describe("createConnectionLimiter", () => {
  it("permits normal usage and blocks a send flood", () => {
    const lim = createConnectionLimiter(0);
    // 10 rapid sends fit the send burst
    for (let i = 0; i < 10; i++) expect(lim.allowSend(0)).toBe(true);
    expect(lim.allowSend(0)).toBe(false); // 11th blocked at t=0
    expect(lim.allowSend(1000)).toBe(true); // 1s later → ~2 tokens back
  });

  it("SEND_TYPES covers the content-creating actions", () => {
    expect(SEND_TYPES.has("send_message")).toBe(true);
    expect(SEND_TYPES.has("edit_message")).toBe(true);
    expect(SEND_TYPES.has("delete_message")).toBe(true);
    expect(SEND_TYPES.has("toggle_reaction")).toBe(true);
    expect(SEND_TYPES.has("typing_start")).toBe(false);
    expect(SEND_TYPES.has("subscribe_channel")).toBe(false);
  });
});
