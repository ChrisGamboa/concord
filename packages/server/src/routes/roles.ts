import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";
import { Permissions } from "@concord/shared";
import { checkPermission } from "../permissions.js";

export const roleRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);

  // List roles for a server
  app.get<{ Params: { serverId: string } }>(
    "/:serverId/roles",
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { serverId } = request.params;

      const member = await prisma.serverMember.findUnique({
        where: { userId_serverId: { userId, serverId } },
      });
      if (!member) return reply.code(404).send({ error: "Not a member" });

      const roles = await prisma.role.findMany({
        where: { serverId },
        orderBy: { position: "desc" },
      });

      return { roles };
    }
  );

  // Create a role
  app.post<{
    Params: { serverId: string };
    Body: { name: string; color?: string; permissions?: number };
  }>(
    "/:serverId/roles",
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { serverId } = request.params;
      const { name, color, permissions } = request.body;

      if (!await checkPermission(userId, serverId, Permissions.MANAGE_ROLES)) {
        return reply.code(403).send({ error: "Missing MANAGE_ROLES permission" });
      }

      if (!name || name.length < 1 || name.length > 50) {
        return reply.code(400).send({ error: "Role name must be 1-50 characters" });
      }

      // Get highest position for ordering
      const maxPos = await prisma.role.aggregate({
        where: { serverId },
        _max: { position: true },
      });

      const role = await prisma.role.create({
        data: {
          serverId,
          name,
          color: color ?? null,
          permissions: permissions ?? 0,
          position: (maxPos._max.position ?? 0) + 1,
        },
      });

      return reply.code(201).send({ role });
    }
  );

  // Update a role
  app.patch<{
    Params: { serverId: string; roleId: string };
    Body: { name?: string; color?: string | null; permissions?: number };
  }>(
    "/:serverId/roles/:roleId",
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { serverId, roleId } = request.params;
      const { name, color, permissions } = request.body;

      if (!await checkPermission(userId, serverId, Permissions.MANAGE_ROLES)) {
        return reply.code(403).send({ error: "Missing MANAGE_ROLES permission" });
      }

      const existing = await prisma.role.findFirst({
        where: { id: roleId, serverId },
      });
      if (!existing) return reply.code(404).send({ error: "Role not found" });

      const data: Record<string, unknown> = {};
      if (name !== undefined) data.name = name;
      if (color !== undefined) data.color = color;
      if (permissions !== undefined) data.permissions = permissions;

      const role = await prisma.role.update({
        where: { id: roleId },
        data,
      });

      return { role };
    }
  );

  // Delete a role
  app.delete<{ Params: { serverId: string; roleId: string } }>(
    "/:serverId/roles/:roleId",
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { serverId, roleId } = request.params;

      if (!await checkPermission(userId, serverId, Permissions.MANAGE_ROLES)) {
        return reply.code(403).send({ error: "Missing MANAGE_ROLES permission" });
      }

      const existing = await prisma.role.findFirst({
        where: { id: roleId, serverId },
      });
      if (!existing) return reply.code(404).send({ error: "Role not found" });

      // Don't allow deleting @everyone
      if (existing.position === 0) {
        return reply.code(400).send({ error: "Cannot delete the @everyone role" });
      }

      await prisma.role.delete({ where: { id: roleId } });
      return { deleted: true };
    }
  );

  // Assign a role to a member
  app.post<{ Params: { serverId: string; userId: string; roleId: string } }>(
    "/:serverId/members/:userId/roles/:roleId",
    async (request, reply) => {
      const { userId: actorId } = request.user as { userId: string };
      const { serverId, userId: targetId, roleId } = request.params;

      if (!await checkPermission(actorId, serverId, Permissions.MANAGE_ROLES)) {
        return reply.code(403).send({ error: "Missing MANAGE_ROLES permission" });
      }

      // Verify the role and member exist
      const [role, member] = await Promise.all([
        prisma.role.findFirst({ where: { id: roleId, serverId } }),
        prisma.serverMember.findUnique({
          where: { userId_serverId: { userId: targetId, serverId } },
        }),
      ]);
      if (!role) return reply.code(404).send({ error: "Role not found" });
      if (!member) return reply.code(404).send({ error: "Member not found" });

      await prisma.memberRole.upsert({
        where: { userId_serverId_roleId: { userId: targetId, serverId, roleId } },
        create: { userId: targetId, serverId, roleId },
        update: {},
      });

      return { assigned: true };
    }
  );

  // Remove a role from a member
  app.delete<{ Params: { serverId: string; userId: string; roleId: string } }>(
    "/:serverId/members/:userId/roles/:roleId",
    async (request, reply) => {
      const { userId: actorId } = request.user as { userId: string };
      const { serverId, userId: targetId, roleId } = request.params;

      if (!await checkPermission(actorId, serverId, Permissions.MANAGE_ROLES)) {
        return reply.code(403).send({ error: "Missing MANAGE_ROLES permission" });
      }

      await prisma.memberRole.deleteMany({
        where: { userId: targetId, serverId, roleId },
      });

      return { removed: true };
    }
  );

  // Get a user's computed permissions
  app.get<{ Params: { serverId: string; userId: string } }>(
    "/:serverId/members/:userId/permissions",
    async (request, reply) => {
      const { userId: actorId } = request.user as { userId: string };
      const { serverId, userId: targetId } = request.params;

      const member = await prisma.serverMember.findUnique({
        where: { userId_serverId: { userId: actorId, serverId } },
      });
      if (!member) return reply.code(404).send({ error: "Not a member" });

      const { getUserPermissions } = await import("../permissions.js");
      const permissions = await getUserPermissions(targetId, serverId);
      return { permissions };
    }
  );
};
