import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";
import { Permissions } from "@concord/shared";

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
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        memberRoles: { select: { roleId: true } },
      },
    });

    return {
      members: members.map((m) => ({
        userId: m.userId,
        serverId: m.serverId,
        nickname: m.nickname,
        roleIds: m.memberRoles.map((r) => r.roleId),
        joinedAt: m.joinedAt.toISOString(),
        user: m.user,
      })),
    };
  });
};
