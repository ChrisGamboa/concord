import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";

export const userRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);

  // Search users the caller shares a server with (for starting a DM). Replaces the
  // client fanning out getMembers() across every server on each keystroke.
  app.get<{ Querystring: { q?: string } }>("/search", async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const q = request.query.q?.trim();
    if (!q) return { users: [] };
    if (q.length > 100) return reply.code(400).send({ error: "Query too long" });

    const myServers = await prisma.serverMember.findMany({
      where: { userId },
      select: { serverId: true },
    });
    const serverIds = myServers.map((s) => s.serverId);
    if (serverIds.length === 0) return { users: [] };

    const members = await prisma.serverMember.findMany({
      where: {
        serverId: { in: serverIds },
        userId: { not: userId },
        user: {
          OR: [
            { username: { contains: q, mode: "insensitive" } },
            { displayName: { contains: q, mode: "insensitive" } },
          ],
        },
      },
      select: {
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true, status: true } },
      },
      distinct: ["userId"],
      take: 20,
    });

    return { users: members.map((m) => m.user) };
  });
};
