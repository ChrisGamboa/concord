import type { FastifyPluginAsync } from "fastify";
import { randomBytes } from "crypto";
import { join } from "path";
import { mkdir, writeFile } from "fs/promises";
import sharp from "sharp";
import { prisma } from "../db.js";
import { Permissions } from "@concord/shared";
import { checkPermission } from "../permissions.js";
import { getOnlineUserIds } from "../ws/connections.js";
import { randomUUID } from "crypto";

const UPLOADS_DIR = join(process.cwd(), "uploads");
const ICON_SIZE = 128;

export const serverRoutes: FastifyPluginAsync = async (app) => {
  // All server routes require auth
  app.addHook("preHandler", app.authenticate);

  // List servers the user is a member of
  app.get("/", async (request) => {
    const { userId } = request.user as { userId: string };
    const memberships = await prisma.serverMember.findMany({
      where: { userId },
      include: { server: true },
    });
    return { servers: memberships.map((m) => ({
      id: m.server.id,
      name: m.server.name,
      iconUrl: m.server.iconUrl,
      ownerId: m.server.ownerId,
      createdAt: m.server.createdAt.toISOString(),
    })) };
  });

  // Create a server
  app.post<{ Body: { name: string } }>("/", async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { name } = request.body;

    if (!name || name.length < 1 || name.length > 100) {
      return reply.code(400).send({ error: "Server name must be 1-100 characters" });
    }

    const server = await prisma.server.create({
      data: {
        name,
        ownerId: userId,
        channels: {
          create: [
            { name: "general", type: "TEXT", position: 0 },
            { name: "General", type: "VOICE", position: 1 },
          ],
        },
        roles: {
          create: {
            name: "@everyone",
            permissions:
              Permissions.SEND_MESSAGES |
              Permissions.READ_MESSAGES |
              Permissions.CONNECT_VOICE |
              Permissions.SPEAK,
            position: 0,
          },
        },
        members: {
          create: { userId },
        },
      },
    });

    return reply.code(201).send({
      id: server.id,
      name: server.name,
      iconUrl: server.iconUrl,
      ownerId: server.ownerId,
      createdAt: server.createdAt.toISOString(),
    });
  });

  // Get server details
  app.get<{ Params: { serverId: string } }>("/:serverId", async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { serverId } = request.params;

    const member = await prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId } },
      include: { server: true },
    });

    if (!member) {
      return reply.code(404).send({ error: "Server not found" });
    }

    return {
      id: member.server.id,
      name: member.server.name,
      iconUrl: member.server.iconUrl,
      ownerId: member.server.ownerId,
      createdAt: member.server.createdAt.toISOString(),
    };
  });

  // Join a server (via invite code — simplified: just by server ID for now)
  app.post<{ Params: { serverId: string } }>("/:serverId/join", async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { serverId } = request.params;

    const server = await prisma.server.findUnique({ where: { id: serverId } });
    if (!server) {
      return reply.code(404).send({ error: "Server not found" });
    }

    const existing = await prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId } },
    });
    if (existing) {
      return reply.code(409).send({ error: "Already a member" });
    }

    await prisma.serverMember.create({ data: { userId, serverId } });
    return reply.code(201).send({ joined: true });
  });

  // Get server members
  app.get<{ Params: { serverId: string } }>("/:serverId/members", async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { serverId } = request.params;

    const member = await prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId } },
    });
    if (!member) {
      return reply.code(404).send({ error: "Server not found" });
    }

    const members = await prisma.serverMember.findMany({
      where: { serverId },
      include: {
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true, status: true } },
        memberRoles: { select: { roleId: true } },
      },
    });

    const onlineIds = new Set(getOnlineUserIds());

    return {
      members: members.map((m) => ({
        userId: m.userId,
        serverId: m.serverId,
        nickname: m.nickname,
        roleIds: m.memberRoles.map((r) => r.roleId),
        joinedAt: m.joinedAt.toISOString(),
        user: m.user,
        online: onlineIds.has(m.userId),
      })),
    };
  });

  // Update server (name, icon)
  app.patch<{ Params: { serverId: string } }>(
    "/:serverId",
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { serverId } = request.params;

      if (!await checkPermission(userId, serverId, Permissions.MANAGE_SERVER)) {
        return reply.code(403).send({ error: "Missing MANAGE_SERVER permission" });
      }

      const updates: { name?: string; iconUrl?: string | null } = {};

      const contentType = request.headers["content-type"] ?? "";
      if (contentType.includes("multipart")) {
        const parts = request.parts();
        for await (const part of parts) {
          if (part.type === "field" && part.fieldname === "name") {
            const val = (part.value as string)?.trim();
            if (val && val.length >= 1 && val.length <= 100) updates.name = val;
          }
          if (part.type === "field" && part.fieldname === "removeIcon") {
            if (part.value === "true") updates.iconUrl = null;
          }
          if (part.type === "file" && part.fieldname === "icon") {
            const chunks: Buffer[] = [];
            for await (const chunk of part.file) chunks.push(chunk);
            const raw = Buffer.concat(chunks);
            if (raw.length === 0) continue;
            if (raw.length > 8 * 1024 * 1024) {
              return reply.code(413).send({ error: "Icon too large (max 8MB)" });
            }
            await mkdir(UPLOADS_DIR, { recursive: true });
            const filename = `server-icon-${randomUUID()}.webp`;
            const processed = await sharp(raw)
              .resize(ICON_SIZE, ICON_SIZE, { fit: "cover", position: "centre" })
              .webp({ quality: 85 })
              .toBuffer();
            await writeFile(join(UPLOADS_DIR, filename), processed);
            updates.iconUrl = `/uploads/${filename}`;
          }
        }
      } else {
        const body = request.body as { name?: string; removeIcon?: boolean };
        if (body.name?.trim()) {
          const val = body.name.trim();
          if (val.length >= 1 && val.length <= 100) updates.name = val;
        }
        if (body.removeIcon) updates.iconUrl = null;
      }

      if (Object.keys(updates).length === 0) {
        return reply.code(400).send({ error: "No valid fields to update" });
      }

      const server = await prisma.server.update({
        where: { id: serverId },
        data: updates,
      });

      return {
        id: server.id,
        name: server.name,
        iconUrl: server.iconUrl,
        ownerId: server.ownerId,
        createdAt: server.createdAt.toISOString(),
      };
    }
  );

  // Create an invite link
  app.post<{ Params: { serverId: string }; Body: { maxUses?: number; expiresInHours?: number } }>(
    "/:serverId/invites",
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { serverId } = request.params;
      const { maxUses, expiresInHours } = request.body ?? {};

      const member = await prisma.serverMember.findUnique({
        where: { userId_serverId: { userId, serverId } },
      });
      if (!member) return reply.code(404).send({ error: "Not a member" });

      const code = randomBytes(4).toString("hex"); // 8-char code
      const expiresAt = expiresInHours
        ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000)
        : null;

      const invite = await prisma.invite.create({
        data: { code, serverId, creatorId: userId, maxUses: maxUses ?? null, expiresAt },
      });

      return reply.code(201).send({ invite: { code: invite.code, maxUses: invite.maxUses, uses: invite.uses, expiresAt: invite.expiresAt?.toISOString() ?? null } });
    }
  );

  // List invites for a server
  app.get<{ Params: { serverId: string } }>(
    "/:serverId/invites",
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { serverId } = request.params;

      const member = await prisma.serverMember.findUnique({
        where: { userId_serverId: { userId, serverId } },
      });
      if (!member) return reply.code(404).send({ error: "Not a member" });

      const invites = await prisma.invite.findMany({
        where: { serverId },
        orderBy: { createdAt: "desc" },
        include: { creator: { select: { displayName: true } } },
      });

      return {
        invites: invites.map((i) => ({
          code: i.code,
          createdBy: i.creator.displayName,
          maxUses: i.maxUses,
          uses: i.uses,
          expiresAt: i.expiresAt?.toISOString() ?? null,
          createdAt: i.createdAt.toISOString(),
        })),
      };
    }
  );

  // Delete an invite
  app.delete<{ Params: { serverId: string; code: string } }>(
    "/:serverId/invites/:code",
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { serverId, code } = request.params;

      if (!await checkPermission(userId, serverId, Permissions.MANAGE_SERVER)) {
        return reply.code(403).send({ error: "Missing permission" });
      }

      await prisma.invite.deleteMany({ where: { code, serverId } });
      return { deleted: true };
    }
  );

  // Join via invite code (replaces the raw server ID join)
  app.post<{ Params: { code: string } }>(
    "/join/invite/:code",
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { code } = request.params;

      const invite = await prisma.invite.findUnique({
        where: { code },
        include: { server: true },
      });

      if (!invite) return reply.code(404).send({ error: "Invalid invite" });
      if (invite.expiresAt && invite.expiresAt < new Date()) {
        return reply.code(410).send({ error: "Invite expired" });
      }
      if (invite.maxUses && invite.uses >= invite.maxUses) {
        return reply.code(410).send({ error: "Invite has reached max uses" });
      }

      const existing = await prisma.serverMember.findUnique({
        where: { userId_serverId: { userId, serverId: invite.serverId } },
      });
      if (existing) {
        return reply.code(409).send({ error: "Already a member" });
      }

      await prisma.$transaction([
        prisma.serverMember.create({ data: { userId, serverId: invite.serverId } }),
        prisma.invite.update({ where: { code }, data: { uses: { increment: 1 } } }),
      ]);

      return reply.code(201).send({
        joined: true,
        serverId: invite.serverId,
        serverName: invite.server.name,
      });
    }
  );

  // Leave a server (non-owners only)
  app.post<{ Params: { serverId: string } }>(
    "/:serverId/leave",
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { serverId } = request.params;

      const server = await prisma.server.findUnique({ where: { id: serverId } });
      if (!server) return reply.code(404).send({ error: "Server not found" });
      if (server.ownerId === userId) {
        return reply.code(400).send({ error: "Owner cannot leave. Delete the server instead." });
      }

      const member = await prisma.serverMember.findUnique({
        where: { userId_serverId: { userId, serverId } },
      });
      if (!member) return reply.code(404).send({ error: "Not a member" });

      await prisma.serverMember.delete({
        where: { userId_serverId: { userId, serverId } },
      });

      return { left: true };
    }
  );

  // Delete a server (owner only)
  app.delete<{ Params: { serverId: string } }>(
    "/:serverId",
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { serverId } = request.params;

      const server = await prisma.server.findUnique({ where: { id: serverId } });
      if (!server) return reply.code(404).send({ error: "Server not found" });
      if (server.ownerId !== userId) {
        return reply.code(403).send({ error: "Only the server owner can delete it" });
      }

      // Cascade deletes handled by Prisma schema relations
      await prisma.server.delete({ where: { id: serverId } });

      return { deleted: true };
    }
  );
};
