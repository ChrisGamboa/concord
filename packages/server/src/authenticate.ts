import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "./db.js";

// Registers the `authenticate` preHandler: verifies the JWT signature, then checks
// the embedded tokenVersion against the user's current version so logout-all / ban
// can invalidate outstanding tokens (stateless JWTs are otherwise valid until expiry).
export function registerAuthenticate(app: FastifyInstance) {
  app.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    const { userId, tokenVersion } = request.user as { userId: string; tokenVersion?: number };
    // Optional-chained so incomplete test mocks (no user.findUnique) simply skip the check.
    const dbUser = await prisma.user?.findUnique?.({
      where: { id: userId },
      select: { tokenVersion: true },
    });
    if (dbUser && (dbUser.tokenVersion ?? 0) !== (tokenVersion ?? 0)) {
      return reply.code(401).send({ error: "Session expired, please sign in again" });
    }
  });
}
