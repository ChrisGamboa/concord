import Fastify from "fastify";
import jwt from "@fastify/jwt";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { authRoutes } from "../routes/auth.js";
import { serverRoutes } from "../routes/servers.js";
import { channelRoutes } from "../routes/channels.js";
import { messageRoutes } from "../routes/messages.js";
import "../types.js";

export async function buildApp() {
  const app = Fastify({ logger: false });

  await app.register(cors, { origin: true });
  await app.register(jwt, { secret: "test-secret" });
  await app.register(websocket);

  app.decorate(
    "authenticate",
    async (request: any, reply: any) => {
      try {
        await request.jwtVerify();
      } catch {
        reply.code(401).send({ error: "Unauthorized" });
      }
    }
  );

  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(serverRoutes, { prefix: "/api/servers" });
  await app.register(channelRoutes, { prefix: "/api/channels" });
  await app.register(messageRoutes, { prefix: "/api/messages" });

  return app;
}

export function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}
