import { describe, it, expect, vi, beforeEach } from "vitest";
import { Permissions } from "@concord/shared";

vi.mock("../db.js", () => ({
  prisma: {
    server: { findUnique: vi.fn() },
    memberRole: { findMany: vi.fn() },
    role: { findFirst: vi.fn() },
  },
}));

const { prisma } = await import("../db.js");
const { getUserPermissions, checkPermission } = await import("../permissions.js");
const mockPrisma = vi.mocked(prisma);

function setup(opts: { owner?: boolean; everyone?: number; roles?: number[] }) {
  mockPrisma.server.findUnique.mockResolvedValue(
    (opts.owner ? { ownerId: "user1" } : { ownerId: "someone-else" }) as any
  );
  mockPrisma.memberRole.findMany.mockResolvedValue(
    (opts.roles ?? []).map((permissions) => ({ role: { permissions } })) as any
  );
  mockPrisma.role.findFirst.mockResolvedValue(
    (opts.everyone !== undefined ? { permissions: opts.everyone } : null) as any
  );
}

describe("getUserPermissions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("gives the server owner all permissions", async () => {
    setup({ owner: true });
    expect(await getUserPermissions("user1", "srv1")).toBe(0xffffffff);
  });

  it("returns @everyone permissions when the user has no roles", async () => {
    setup({ everyone: Permissions.SEND_MESSAGES | Permissions.READ_MESSAGES });
    const perms = await getUserPermissions("user1", "srv1");
    expect(perms).toBe(Permissions.SEND_MESSAGES | Permissions.READ_MESSAGES);
  });

  it("ORs assigned role permissions with @everyone", async () => {
    setup({
      everyone: Permissions.READ_MESSAGES,
      roles: [Permissions.KICK_MEMBERS, Permissions.MANAGE_MESSAGES],
    });
    const perms = await getUserPermissions("user1", "srv1");
    expect(perms).toBe(Permissions.READ_MESSAGES | Permissions.KICK_MEMBERS | Permissions.MANAGE_MESSAGES);
  });

  it("treats a missing @everyone role as no base permissions", async () => {
    setup({ roles: [Permissions.SEND_MESSAGES] });
    expect(await getUserPermissions("user1", "srv1")).toBe(Permissions.SEND_MESSAGES);
  });
});

describe("checkPermission", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is true when the bit is present", async () => {
    setup({ everyone: Permissions.SEND_MESSAGES });
    expect(await checkPermission("user1", "srv1", Permissions.SEND_MESSAGES)).toBe(true);
  });

  it("is false when the bit is absent", async () => {
    setup({ everyone: Permissions.READ_MESSAGES });
    expect(await checkPermission("user1", "srv1", Permissions.SEND_MESSAGES)).toBe(false);
  });

  it("ADMIN grants every permission", async () => {
    setup({ everyone: Permissions.ADMIN });
    expect(await checkPermission("user1", "srv1", Permissions.BAN_MEMBERS)).toBe(true);
    expect(await checkPermission("user1", "srv1", Permissions.MANAGE_SERVER)).toBe(true);
  });

  it("owner passes any permission check", async () => {
    setup({ owner: true });
    expect(await checkPermission("user1", "srv1", Permissions.BAN_MEMBERS)).toBe(true);
  });
});
