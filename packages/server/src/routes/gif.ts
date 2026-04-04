import type { FastifyPluginAsync } from "fastify";
import { env } from "../env.js";

const KLIPY_BASE = "https://api.klipy.com/api/v1";

export const gifRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);

  // Search GIFs
  app.get<{ Querystring: { q?: string; page?: string; limit?: string } }>(
    "/search",
    async (request, reply) => {
      if (!env.KLIPY_API_KEY) {
        return reply.code(503).send({ error: "GIF search not configured (set KLIPY_API_KEY)" });
      }

      const { q, page, limit } = request.query;
      const { userId } = request.user as { userId: string };

      const params = new URLSearchParams({
        customer_id: userId,
        per_page: limit ?? "20",
        page: page ?? "1",
        content_filter: "medium",
      });
      if (q?.trim()) params.set("q", q.trim());

      const endpoint = q?.trim() ? "search" : "trending";
      const url = `${KLIPY_BASE}/${env.KLIPY_API_KEY}/gifs/${endpoint}?${params}`;

      const res = await fetch(url);
      if (!res.ok) {
        return reply.code(res.status).send({ error: "Klipy API error" });
      }

      const json = await res.json() as {
        result: boolean;
        data: {
          data: Array<{
            id: number;
            title: string;
            slug: string;
            file: {
              sm: { gif: { url: string; width: number; height: number } };
              md: { gif: { url: string; width: number; height: number }; mp4?: { url: string } };
            };
          }>;
          has_next: boolean;
        };
      };

      return {
        gifs: json.data.data
          .filter((g) => g.file?.sm?.gif && g.file?.md?.gif)
          .map((g) => ({
            id: String(g.id),
            title: g.title ?? "",
            previewUrl: g.file.sm.gif.url,
            url: g.file.md.gif.url,
            mp4Url: g.file.md.mp4?.url ?? null,
            width: g.file.md.gif.width,
            height: g.file.md.gif.height,
          })),
        hasMore: json.data.has_next,
      };
    }
  );
};
