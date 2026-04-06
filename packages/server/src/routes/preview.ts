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

/** Try oEmbed first (works great for YouTube, Twitter, etc.), fall back to HTML scraping */
async function fetchOgData(url: string): Promise<OgData> {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const empty: OgData = { title: null, description: null, image: null, siteName: null, url };

  // Try oEmbed for known providers
  const oembedResult = await tryOembed(url);
  if (oembedResult) {
    cache.set(url, { data: oembedResult, ts: Date.now() });
    return oembedResult;
  }

  // Fall back to HTML OG tag scraping
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!res.ok) return empty;

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("html")) return empty;

    // Stream and scan for </head> to avoid reading megabytes of body
    const reader = res.body?.getReader();
    if (!reader) return empty;

    let text = "";
    const decoder = new TextDecoder();
    while (text.length < 500_000) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      // Stop once we've found the closing head tag
      if (text.includes("</head>")) break;
    }
    reader.cancel().catch(() => {});

    const getTag = (property: string): string | null => {
      const regex = new RegExp(`<meta[^>]*(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']`, "i");
      const altRegex = new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${property}["']`, "i");
      return regex.exec(text)?.[1] ?? altRegex.exec(text)?.[1] ?? null;
    };

    const title = getTag("og:title") ?? text.match(/<title[^>]*>([^<]*)</i)?.[1] ?? null;
    if (!title) return empty;

    const data: OgData = {
      title: decodeEntities(title).slice(0, 200),
      description: decodeEntities(getTag("og:description") ?? getTag("description") ?? "").slice(0, 500) || null,
      image: getTag("og:image") ?? null,
      siteName: getTag("og:site_name") ?? null,
      url,
    };

    cache.set(url, { data, ts: Date.now() });
    return data;
  } catch {
    clearTimeout(timeout);
    return empty;
  }
}

async function tryOembed(url: string): Promise<OgData | null> {
  // YouTube
  if (/youtube\.com\/watch|youtu\.be\//.test(url)) {
    return fetchOembedProvider(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`, url);
  }
  return null;
}

async function fetchOembedProvider(endpoint: string, originalUrl: string): Promise<OgData | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(endpoint, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json() as { title?: string; author_name?: string; thumbnail_url?: string; provider_name?: string };
    if (!data.title) return null;
    return {
      title: data.title,
      description: data.author_name ?? null,
      image: data.thumbnail_url ?? null,
      siteName: data.provider_name ?? null,
      url: originalUrl,
    };
  } catch {
    return null;
  }
}

function decodeEntities(str: string): string {
  return str.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
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
