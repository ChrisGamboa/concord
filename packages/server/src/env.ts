import "dotenv/config";
import { z } from "zod";

const isProduction = process.env.NODE_ENV === "production";

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  JWT_SECRET: z.string().default("dev-secret-change-in-production"),
  PORT: z.coerce.number().int().positive().default(3001),
  LIVEKIT_URL: z.string().default("ws://localhost:7880"),
  LIVEKIT_API_KEY: z.string().default("devkey"),
  LIVEKIT_API_SECRET: z.string().default("secret"),
  KLIPY_API_KEY: z.string().default(""),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("[env] Invalid environment configuration:");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;

// Refuse to boot in production with the shipped insecure defaults.
if (isProduction) {
  const insecure: string[] = [];
  if (env.JWT_SECRET === "dev-secret-change-in-production" || env.JWT_SECRET.length < 32) {
    insecure.push("JWT_SECRET (set a random string of 32+ chars)");
  }
  if (env.LIVEKIT_API_KEY === "devkey") insecure.push("LIVEKIT_API_KEY");
  if (env.LIVEKIT_API_SECRET === "secret") insecure.push("LIVEKIT_API_SECRET");
  if (insecure.length > 0) {
    console.error(
      `[env] Refusing to start in production with insecure defaults:\n  - ${insecure.join("\n  - ")}`
    );
    process.exit(1);
  }
}
