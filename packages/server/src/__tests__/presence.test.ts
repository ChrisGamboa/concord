import { describe, it, expect } from "vitest";
import {
  addSession,
  removeSession,
  isUserOnline,
  getOnlineUserIds,
  setUserStatus,
  getUserStatus,
  getUserStatuses,
  clearUserStatus,
} from "../ws/presence.js";

// The Redis bus is never initialised in tests, so these exercise the in-process
// fallback path — i.e. exact single-instance behaviour.

describe("presence (single-instance fallback)", () => {
  it("reports the first session as first and the last as last", async () => {
    const u = "user-A";
    expect(await addSession("sA1", u)).toBe(true); // first
    expect(await addSession("sA2", u)).toBe(false); // second
    expect(await isUserOnline(u)).toBe(true);
    expect(await removeSession("sA1", u)).toBe(false); // still one left
    expect(await isUserOnline(u)).toBe(true);
    expect(await removeSession("sA2", u)).toBe(true); // last
    expect(await isUserOnline(u)).toBe(false);
  });

  it("lists distinct online user ids and drops them when they leave", async () => {
    await addSession("sB1", "user-B");
    await addSession("sB2", "user-B"); // same user, one entry
    await addSession("sC1", "user-C");
    const online = new Set(await getOnlineUserIds());
    expect(online.has("user-B")).toBe(true);
    expect(online.has("user-C")).toBe(true);
    await removeSession("sB1", "user-B");
    await removeSession("sB2", "user-B");
    expect(new Set(await getOnlineUserIds()).has("user-B")).toBe(false);
  });

  it("stores, batch-reads, and clears status", async () => {
    await setUserStatus("user-D", "dnd");
    expect(await getUserStatus("user-D")).toBe("dnd");
    const map = await getUserStatuses(["user-D", "user-missing"]);
    expect(map.get("user-D")).toBe("dnd");
    expect(map.has("user-missing")).toBe(false);
    await clearUserStatus("user-D");
    expect(await getUserStatus("user-D")).toBeUndefined();
  });

  it("returns an empty status map for no ids", async () => {
    expect((await getUserStatuses([])).size).toBe(0);
  });
});
