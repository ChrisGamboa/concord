import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";

/** Notification mutes for channels and servers (row present = muted). */
export const muteRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);

  // All mutes for the current user
  app.get("/", async (request) => {
    const { userId } = request.user as { userId: string };
    const mutes = await prisma.mute.findMany({ where: { userId } });
    return {
      channels: mutes.filter((m) => m.targetType === "channel").map((m) => m.targetId),
      servers: mutes.filter((m) => m.targetType === "server").map((m) => m.targetId),
    };
  });

  for (const targetType of ["channel", "server"] as const) {
    app.put<{ Params: { targetId: string } }>(`/${targetType}/:targetId`, async (request) => {
      const { userId } = request.user as { userId: string };
      const { targetId } = request.params;
      await prisma.mute.upsert({
        where: { userId_targetId: { userId, targetId } },
        create: { userId, targetId, targetType },
        update: {},
      });
      return { muted: true };
    });

    app.delete<{ Params: { targetId: string } }>(`/${targetType}/:targetId`, async (request) => {
      const { userId } = request.user as { userId: string };
      const { targetId } = request.params;
      await prisma.mute.deleteMany({ where: { userId, targetId } });
      return { muted: false };
    });
  }
};
