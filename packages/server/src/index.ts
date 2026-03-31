import "./types.js";
import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import websocket from "@fastify/websocket";
import { env } from "./env.js";
import { prisma } from "./db.js";
import { authRoutes } from "./routes/auth.js";
import { serverRoutes } from "./routes/servers.js";
import { channelRoutes } from "./routes/channels.js";
import { messageRoutes } from "./routes/messages.js";
import { voiceRoutes } from "./routes/voice.js";
import { wsHandler } from "./ws/handler.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(jwt, { secret: env.JWT_SECRET });
await app.register(websocket);

// Auth decorator
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

// Routes
await app.register(authRoutes, { prefix: "/api/auth" });
await app.register(serverRoutes, { prefix: "/api/servers" });
await app.register(channelRoutes, { prefix: "/api/channels" });
await app.register(messageRoutes, { prefix: "/api/messages" });
await app.register(voiceRoutes, { prefix: "/api/voice" });

// WebSocket
await app.register(wsHandler);

// Health check
app.get("/health", async () => ({ status: "ok" }));

// Graceful shutdown
const shutdown = async () => {
  await prisma.$disconnect();
  await app.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Start
try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  console.log(`Server running on port ${env.PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
