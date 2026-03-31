import { describe, it, expect } from "vitest";
import { Permissions, hasPermission } from "../types";

describe("Permissions", () => {
  it("should define all permission flags as unique powers of 2", () => {
    const values = Object.values(Permissions);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);

    for (const val of values) {
      expect(val).toBeGreaterThan(0);
      expect(val & (val - 1)).toBe(0); // power of 2 check
    }
  });

  it("should grant all permissions when ADMIN flag is set", () => {
    const adminPerms = Permissions.ADMIN;
    expect(hasPermission(adminPerms, Permissions.SEND_MESSAGES)).toBe(true);
    expect(hasPermission(adminPerms, Permissions.MANAGE_CHANNELS)).toBe(true);
    expect(hasPermission(adminPerms, Permissions.BAN_MEMBERS)).toBe(true);
    expect(hasPermission(adminPerms, Permissions.MANAGE_SERVER)).toBe(true);
  });

  it("should only grant specific permissions when set", () => {
    const perms = Permissions.SEND_MESSAGES | Permissions.READ_MESSAGES;
    expect(hasPermission(perms, Permissions.SEND_MESSAGES)).toBe(true);
    expect(hasPermission(perms, Permissions.READ_MESSAGES)).toBe(true);
    expect(hasPermission(perms, Permissions.MANAGE_CHANNELS)).toBe(false);
    expect(hasPermission(perms, Permissions.ADMIN)).toBe(false);
  });

  it("should return false for zero permissions", () => {
    expect(hasPermission(0, Permissions.SEND_MESSAGES)).toBe(false);
    expect(hasPermission(0, Permissions.ADMIN)).toBe(false);
  });

  it("should support combining multiple permissions", () => {
    const perms =
      Permissions.SEND_MESSAGES |
      Permissions.READ_MESSAGES |
      Permissions.CONNECT_VOICE |
      Permissions.SPEAK;

    expect(hasPermission(perms, Permissions.SEND_MESSAGES)).toBe(true);
    expect(hasPermission(perms, Permissions.SPEAK)).toBe(true);
    expect(hasPermission(perms, Permissions.STREAM)).toBe(false);
    expect(hasPermission(perms, Permissions.KICK_MEMBERS)).toBe(false);
  });

  it("should check compound permissions correctly", () => {
    const required = Permissions.SEND_MESSAGES | Permissions.READ_MESSAGES;
    const userPerms = Permissions.SEND_MESSAGES | Permissions.READ_MESSAGES | Permissions.SPEAK;
    const insufficientPerms = Permissions.SEND_MESSAGES;

    expect(hasPermission(userPerms, required)).toBe(true);
    expect(hasPermission(insufficientPerms, required)).toBe(false);
  });
});
