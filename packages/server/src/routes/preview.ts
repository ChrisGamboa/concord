import type { FastifyPluginAsync } from "fastify";

interface OgData {
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  url: string;
}

const cache = new Map<string, { data: OgData; ts: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function fetchOgData(url: string): Promise<OgData> {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Concord/1.0; +https://github.com/ChrisGamboa/concord)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!res.ok) return { title: null, description: null, image: null, siteName: null, url };

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("html")) return { title: null, description: null, image: null, siteName: null, url };

    // Only read first 50KB to extract meta tags
    const text = await res.text().then((t) => t.slice(0, 50_000));

    const getTag = (property: string): string | null => {
      const regex = new RegExp(`<meta[^>]*(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']`, "i");
      const altRegex = new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${property}["']`, "i");
      return regex.exec(text)?.[1] ?? altRegex.exec(text)?.[1] ?? null;
    };

    const title = getTag("og:title") ?? text.match(/<title[^>]*>([^<]*)</i)?.[1] ?? null;

    const data: OgData = {
      title: title?.slice(0, 200) ?? null,
      description: (getTag("og:description") ?? getTag("description"))?.slice(0, 500) ?? null,
      image: getTag("og:image") ?? null,
      siteName: getTag("og:site_name") ?? null,
      url,
    };

    cache.set(url, { data, ts: Date.now() });
    return data;
  } catch {
    clearTimeout(timeout);
    return { title: null, description: null, image: null, siteName: null, url };
  }
}

export const previewRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);

  app.get<{ Querystring: { url: string } }>("/link", async (request, reply) => {
    const { url } = request.query;
    if (!url || !url.startsWith("http")) {
      return reply.code(400).send({ error: "Invalid URL" });
    }
    const data = await fetchOgData(url);
    return data;
  });
};
