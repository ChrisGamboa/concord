import { prisma } from "./db.js";
import { Permissions, hasPermission } from "@concord/shared";

/**
 * Compute the effective permissions bitmask for a user in a server.
 * Combines permissions from all assigned roles + the @everyone role.
 * Server owner always gets full admin.
 */
export async function getUserPermissions(
  userId: string,
  serverId: string
): Promise<number> {
  // Server owner is always admin
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: { ownerId: true },
  });
  if (server?.ownerId === userId) return 0xffffffff; // all permissions

  // Get all roles for this user in this server
  const memberRoles = await prisma.memberRole.findMany({
    where: { userId, serverId },
    include: { role: { select: { permissions: true } } },
  });

  // Also get the @everyone role (position 0)
  const everyoneRole = await prisma.role.findFirst({
    where: { serverId, position: 0 },
    select: { permissions: true },
  });

  let perms = everyoneRole?.permissions ?? 0;
  for (const mr of memberRoles) {
    perms |= mr.role.permissions;
  }

  return perms;
}

/**
 * Check if a user has a specific permission in a server.
 */
export async function checkPermission(
  userId: string,
  serverId: string,
  permission: number
): Promise<boolean> {
  const perms = await getUserPermissions(userId, serverId);
  return hasPermission(perms, permission);
}
