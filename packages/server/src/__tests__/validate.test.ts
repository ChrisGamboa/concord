import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { validateBody } from "../validate.js";

function fakeReply() {
  const reply = {
    statusCode: 0,
    payload: undefined as unknown,
    code(c: number) { this.statusCode = c; return this; },
    send(p: unknown) { this.payload = p; return this; },
  };
  return reply;
}

const schema = z.object({
  content: z.string().max(10, "too long").refine((s) => s.trim().length > 0, { message: "empty" }),
});

describe("validateBody", () => {
  it("rejects an invalid body with 400 and the first issue message", async () => {
    const reply = fakeReply();
    await validateBody(schema)({ body: { content: "   " } } as never, reply as never);
    expect(reply.statusCode).toBe(400);
    expect((reply.payload as { error: string }).error).toBe("empty");
  });

  it("rejects a wrong-typed field", async () => {
    const reply = fakeReply();
    await validateBody(schema)({ body: { content: 123 } } as never, reply as never);
    expect(reply.statusCode).toBe(400);
  });

  it("rejects an over-long value", async () => {
    const reply = fakeReply();
    await validateBody(schema)({ body: { content: "01234567890" } } as never, reply as never);
    expect(reply.statusCode).toBe(400);
    expect((reply.payload as { error: string }).error).toBe("too long");
  });

  it("passes a valid body and replaces request.body with the parsed value", async () => {
    const reply = fakeReply();
    const request = { body: { content: "hello", extra: "stripped" } } as { body: unknown };
    await validateBody(schema)(request as never, reply as never);
    expect(reply.statusCode).toBe(0); // not set
    expect(request.body).toEqual({ content: "hello" }); // unknown key stripped
  });
});
