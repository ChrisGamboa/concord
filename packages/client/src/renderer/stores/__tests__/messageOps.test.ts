import { describe, it, expect } from "vitest";
import * as ops from "../messageOps";

interface M extends ops.BaseMessage {
  content?: string;
}

const msg = (id: string, extra: Partial<M> = {}): M => ({ id, ...extra });

describe("messageOps.reconcile", () => {
  it("replaces the optimistic copy matched by nonce", () => {
    const list = [msg("real-1"), msg("pending-x", { nonce: "x", pending: true })];
    const confirmed = msg("real-2", { nonce: "x" });
    const next = ops.reconcile(list, confirmed, "x");
    expect(next).toHaveLength(2);
    expect(next[1]).toEqual(confirmed);
    expect(next[1].pending).toBeUndefined();
  });

  it("appends when no nonce match and id is new", () => {
    const list = [msg("a")];
    const next = ops.reconcile(list, msg("b"), "no-match");
    expect(next.map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("is idempotent by id when the message already exists (returns same ref)", () => {
    const list = [msg("a"), msg("b")];
    const next = ops.reconcile(list, msg("b"), "no-match");
    expect(next).toBe(list);
  });

  it("appends without a nonce when id is new", () => {
    const list = [msg("a")];
    const next = ops.reconcile(list, msg("b"));
    expect(next.map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("dedupes a WS echo arriving after nonce reconciliation", () => {
    // Send flow: pending -> reconciled by nonce -> WS echo (same real id) is a no-op
    let list: M[] = [msg("pending-x", { nonce: "x", pending: true })];
    list = ops.reconcile(list, msg("real", { nonce: "x" }), "x");
    const after = ops.reconcile(list, msg("real", { nonce: "x" }), "x");
    expect(after.map((m) => m.id)).toEqual(["real"]);
  });
});

describe("messageOps status transitions", () => {
  it("markFailed clears pending and sets failed on the nonce match", () => {
    const list = [msg("p", { nonce: "n", pending: true })];
    const next = ops.markFailed(list, "n");
    expect(next[0]).toMatchObject({ pending: false, failed: true });
  });

  it("markPending clears failed", () => {
    const list = [msg("p", { nonce: "n", failed: true })];
    const next = ops.markPending(list, "n");
    expect(next[0]).toMatchObject({ pending: true, failed: false });
  });

  it("removeByNonce drops the optimistic copy", () => {
    const list = [msg("a"), msg("p", { nonce: "n" })];
    expect(ops.removeByNonce(list, "n").map((m) => m.id)).toEqual(["a"]);
  });
});

describe("messageOps list mutations", () => {
  it("merge keeps fields the payload omits", () => {
    const list: M[] = [msg("a", { content: "old", reactions: [{ emoji: "👍", count: 1, userIds: ["u"] }] })];
    const next = ops.merge(list, { id: "a", content: "new" });
    expect(next[0].content).toBe("new");
    expect(next[0].reactions).toHaveLength(1);
  });

  it("removeById drops the message", () => {
    expect(ops.removeById([msg("a"), msg("b")], "a").map((m) => m.id)).toEqual(["b"]);
  });

  it("prepend puts older messages first", () => {
    expect(ops.prepend([msg("c")], [msg("a"), msg("b")]).map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  it("setReactions replaces reactions on the target message", () => {
    const list = [msg("a", { reactions: [] })];
    const next = ops.setReactions(list, "a", [{ emoji: "🔥", count: 2, userIds: ["u1", "u2"] }]);
    expect(next[0].reactions).toEqual([{ emoji: "🔥", count: 2, userIds: ["u1", "u2"] }]);
  });
});
