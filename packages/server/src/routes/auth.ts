import type { FastifyPluginAsync } from "fastify";
import bcrypt from "bcrypt";
import { prisma } from "../db.js";
import type { AuthResponse, LoginRequest, RegisterRequest } from "@concord/shared";

function toUserResponse(user: { id: string; username: string; displayName: string; avatarUrl: string | null; createdAt: Date }) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt.toISOString(),
  };
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: RegisterRequest }>("/register", async (request, reply) => {
    const { username, password, displayName } = request.body;

    if (!username || !password || !displayName) {
      return reply.code(400).send({ error: "Missing required fields" });
    }

    if (username.length < 3 || username.length > 32) {
      return reply.code(400).send({ error: "Username must be 3-32 characters" });
    }

    if (password.length < 6) {
      return reply.code(400).send({ error: "Password must be at least 6 characters" });
    }

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return reply.code(409).send({ error: "Username already taken" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { username, displayName, passwordHash },
    });

    const token = app.jwt.sign({ userId: user.id }, { expiresIn: "7d" });
    const response: AuthResponse = { token, user: toUserResponse(user) };
    return reply.code(201).send(response);
  });

  app.post<{ Body: LoginRequest }>("/login", async (request, reply) => {
    const { username, password } = request.body;

    if (!username || !password) {
      return reply.code(400).send({ error: "Missing required fields" });
    }

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      return reply.code(401).send({ error: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return reply.code(401).send({ error: "Invalid credentials" });
    }

    const token = app.jwt.sign({ userId: user.id }, { expiresIn: "7d" });
    const response: AuthResponse = { token, user: toUserResponse(user) };
    return reply.send(response);
  });

  app.get("/me", { preHandler: [app.authenticate] }, async (request) => {
    const { userId } = request.user as { userId: string };
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return { user: toUserResponse(user) };
  });
};
