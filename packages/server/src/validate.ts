import type { FastifyRequest, FastifyReply } from "fastify";
import type { ZodType } from "zod";

// Reusable zod body validation as a Fastify preHandler. Replaces untyped
// `request.body as {...}` casts with runtime-checked, typed bodies; the first
// zod issue message is surfaced as a 400 (consistent with the global error handler).
export function validateBody<T>(schema: ZodType<T>) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const result = schema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({ error: result.error.issues[0]?.message ?? "Invalid request body" });
    }
    // Replace the raw body with the parsed/validated value.
    request.body = result.data;
  };
}
