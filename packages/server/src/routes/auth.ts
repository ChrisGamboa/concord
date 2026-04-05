import type { FastifyPluginAsync } from "fastify";
import bcrypt from "bcrypt";
import sharp from "sharp";
import { randomUUID } from "crypto";
import { join } from "path";
import { mkdir, writeFile } from "fs/promises";
import { prisma } from "../db.js";
import type { AuthResponse, LoginRequest, RegisterRequest } from "@concord/shared";

const UPLOADS_DIR = join(process.cwd(), "uploads");
const AVATAR_SIZE = 256;

function toUserResponse(user: { id: string; username: string; displayName: string; avatarUrl: string | null; status: string | null; createdAt: Date }) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    status: user.status,
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

  // Update profile (display name and/or avatar)
  app.patch("/profile", { preHandler: [app.authenticate] }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const updates: { displayName?: string; avatarUrl?: string | null; status?: string | null } = {};

    // Handle multipart form data (avatar file + fields)
    const contentType = request.headers["content-type"] ?? "";
    if (contentType.includes("multipart")) {
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === "field" && part.fieldname === "displayName") {
          const val = (part.value as string)?.trim();
          if (val && val.length >= 1 && val.length <= 64) {
            updates.displayName = val;
          }
        }
        if (part.type === "field" && part.fieldname === "status") {
          const val = (part.value as string)?.trim();
          updates.status = val || null; // empty string clears status
        }
        if (part.type === "field" && part.fieldname === "removeAvatar") {
          if (part.value === "true") {
            updates.avatarUrl = null;
          }
        }
        if (part.type === "file" && part.fieldname === "avatar") {
          const chunks: Buffer[] = [];
          for await (const chunk of part.file) {
            chunks.push(chunk);
          }
          const raw = Buffer.concat(chunks);
          if (raw.length === 0) continue;
          if (raw.length > 8 * 1024 * 1024) {
            return reply.code(413).send({ error: "Avatar too large (max 8MB)" });
          }

          // Resize and crop to square, convert to webp
          await mkdir(UPLOADS_DIR, { recursive: true });
          const id = randomUUID();
          const filename = `avatar-${id}.webp`;
          const processed = await sharp(raw)
            .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover", position: "centre" })
            .webp({ quality: 85 })
            .toBuffer();
          await writeFile(join(UPLOADS_DIR, filename), processed);
          updates.avatarUrl = `/uploads/${filename}`;
        }
      }
    } else {
      // JSON body for display name only
      const body = request.body as { displayName?: string; status?: string; removeAvatar?: boolean };
      if (body.displayName?.trim()) {
        const val = body.displayName.trim();
        if (val.length >= 1 && val.length <= 64) {
          updates.displayName = val;
        }
      }
      if (body.status !== undefined) {
        updates.status = body.status?.trim() || null;
      }
      if (body.removeAvatar) {
        updates.avatarUrl = null;
      }
    }

    if (Object.keys(updates).length === 0) {
      return reply.code(400).send({ error: "No valid fields to update" });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: updates,
    });

    return { user: toUserResponse(user) };
  });
};
