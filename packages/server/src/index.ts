import "./types.js";
import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import websocket from "@fastify/websocket";
import multipart from "@fastify/multipart";
import staticPlugin from "@fastify/static";
import { join } from "path";
import { env } from "./env.js";
import { prisma } from "./db.js";
import { authRoutes } from "./routes/auth.js";
import { serverRoutes } from "./routes/servers.js";
import { channelRoutes } from "./routes/channels.js";
import { messageRoutes } from "./routes/messages.js";
import { voiceRoutes } from "./routes/voice.js";
import { musicRoutes } from "./routes/music.js";
import { uploadRoutes } from "./routes/uploads.js";
import { roleRoutes } from "./routes/roles.js";
import { gifRoutes } from "./routes/gif.js";
import { wsHandler } from "./ws/handler.js";
import { stopAll as stopAllMusic } from "./music/player.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true, methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] });
await app.register(jwt, { secret: env.JWT_SECRET });
await app.register(websocket);
await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024 } });
await app.register(staticPlugin, {
  root: join(process.cwd(), "uploads"),
  prefix: "/uploads/",
  decorateReply: false,
});

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
await app.register(musicRoutes, { prefix: "/api/music" });
await app.register(uploadRoutes, { prefix: "/api/uploads" });
await app.register(roleRoutes, { prefix: "/api/servers" });
await app.register(gifRoutes, { prefix: "/api/gif" });

// WebSocket
await app.register(wsHandler);

// Health check
app.get("/health", async () => ({ status: "ok" }));

// Graceful shutdown with hard exit timeout
const shutdown = async () => {
  // Force exit after 3s if cleanup hangs (prevents orphaned processes)
  const forceExit = setTimeout(() => process.exit(1), 3000);
  forceExit.unref();

  await stopAllMusic();
  await prisma.$disconnect();
  await app.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Start
try {
  // Check for yt-dlp availability
  const { isYtdlpAvailable } = await import("./music/ytdlp.js");
  const ytdlp = await isYtdlpAvailable();
  console.log(`[music] yt-dlp: ${ytdlp ? "available" : "NOT FOUND — music features disabled"}`);

  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  console.log(`Server running on port ${env.PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
