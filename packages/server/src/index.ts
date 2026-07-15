import "./types.js";
import Fastify from "fastify";
import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import jwt from "@fastify/jwt";
import websocket from "@fastify/websocket";
import multipart from "@fastify/multipart";
import staticPlugin from "@fastify/static";
import { join } from "path";
import { env } from "./env.js";
import { Permissions } from "@concord/shared";
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
import { dmRoutes } from "./routes/dm.js";
import { userRoutes } from "./routes/users.js";
import { previewRoutes } from "./routes/preview.js";
import { muteRoutes } from "./routes/mutes.js";
import { wsHandler } from "./ws/handler.js";
import { registerAuthenticate } from "./authenticate.js";
import { initConnections } from "./ws/connections.js";
import { closeBus } from "./ws/bus.js";
import { startPresenceHeartbeat, stopPresenceHeartbeat } from "./ws/presence.js";
import { stopAll as stopAllMusic } from "./music/player.js";

// Trust exactly one proxy hop (the documented nginx in front) so the client IP is
// read correctly for rate limiting. `true` would trust the whole X-Forwarded-For
// chain, letting a client spoof its IP and evade the limiter.
const app = Fastify({ logger: true, trustProxy: 1 });

// Security headers. CSP is off (this is a JSON API, not an HTML app) and CORP is
// cross-origin so the Electron client can load /uploads images from another origin.
await app.register(helmet, {
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
});
// Global rate limit (per IP). Auth routes tighten this further via route config.
await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });

await app.register(cors, { origin: true, methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] });
await app.register(jwt, { secret: env.JWT_SECRET });
await app.register(websocket);
await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024 } });
await app.register(staticPlugin, {
  root: join(process.cwd(), "uploads"),
  prefix: "/uploads/",
  decorateReply: false,
});

// Auth decorator (verifies JWT + tokenVersion for revocation)
registerAuthenticate(app);

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
await app.register(dmRoutes, { prefix: "/api/dm" });
await app.register(userRoutes, { prefix: "/api/users" });
await app.register(previewRoutes, { prefix: "/api/preview" });
await app.register(muteRoutes, { prefix: "/api/mutes" });

// WebSocket
await app.register(wsHandler);

// Central error handler: surface validation/4xx cleanly, hide 5xx internals.
app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
  if (error.validation) {
    return reply.code(400).send({ error: "Invalid request", details: error.message });
  }
  const status = error.statusCode ?? 500;
  if (status < 500) {
    return reply.code(status).send({ error: error.message });
  }
  request.log.error(error);
  return reply.code(500).send({ error: "Internal server error" });
});

// Health check
app.get("/health", async () => ({ status: "ok" }));

// Graceful shutdown with hard exit timeout
const shutdown = async () => {
  // Force exit after 3s if cleanup hangs (prevents orphaned processes)
  const forceExit = setTimeout(() => process.exit(1), 3000);
  forceExit.unref();

  stopPresenceHeartbeat();
  await stopAllMusic();
  await closeBus();
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

  // Backfill: grant STREAM to legacy @everyone roles created before it became a
  // default, so screen-share keeps working after voice-permission enforcement.
  const backfilled = await prisma.$executeRaw`
    UPDATE "Role" SET permissions = permissions | ${Permissions.STREAM}
    WHERE position = 0 AND (permissions & ${Permissions.STREAM}) = 0`;
  if (backfilled > 0) console.log(`[migrate] granted STREAM to ${backfilled} legacy @everyone role(s)`);

  // Backfill: mark legacy @everyone roles (identified by position 0) as default.
  const markedDefault = await prisma.$executeRaw`
    UPDATE "Role" SET "isDefault" = true WHERE position = 0 AND "isDefault" = false`;
  if (markedDefault > 0) console.log(`[migrate] marked ${markedDefault} legacy @everyone role(s) as default`);

  // Connect the cross-instance message bus (degrades to single-instance if Redis is down)
  await initConnections();
  startPresenceHeartbeat();

  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  console.log(`Server running on port ${env.PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
