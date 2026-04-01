import type { FastifyPluginAsync } from "fastify";
import { randomUUID } from "crypto";
import { join, extname } from "path";
import { mkdir, writeFile } from "fs/promises";

const UPLOADS_DIR = join(process.cwd(), "uploads");
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/webm",
  "audio/mpeg",
  "audio/ogg",
  "application/pdf",
  "text/plain",
]);

export const uploadRoutes: FastifyPluginAsync = async (app) => {
  // Ensure uploads dir exists
  await mkdir(UPLOADS_DIR, { recursive: true });

  app.addHook("preHandler", app.authenticate);

  app.post("/", async (request, reply) => {
    const file = await request.file();
    if (!file) {
      return reply.code(400).send({ error: "No file provided" });
    }

    if (file.file.bytesRead > MAX_FILE_SIZE) {
      return reply.code(413).send({ error: "File too large (max 25MB)" });
    }

    const mimeType = file.mimetype;
    if (!ALLOWED_TYPES.has(mimeType)) {
      return reply.code(415).send({ error: `File type ${mimeType} not allowed` });
    }

    const ext = extname(file.filename) || "";
    const id = randomUUID();
    const storedName = `${id}${ext}`;
    const chunks: Buffer[] = [];

    for await (const chunk of file.file) {
      chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);

    if (buffer.length > MAX_FILE_SIZE) {
      return reply.code(413).send({ error: "File too large (max 25MB)" });
    }

    await writeFile(join(UPLOADS_DIR, storedName), buffer);

    return {
      id,
      filename: file.filename,
      mimeType,
      size: buffer.length,
      url: `/uploads/${storedName}`,
    };
  });
};
