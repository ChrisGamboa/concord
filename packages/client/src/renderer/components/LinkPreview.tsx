import { useEffect, useState } from "react";
import { api } from "../lib/api";

const URL_REGEX = /https?:\/\/[^\s<]+/;

interface OgData {
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  url: string;
}

const previewCache = new Map<string, OgData | null>();

export function LinkPreview({ content }: { content: string }) {
  const [preview, setPreview] = useState<OgData | null>(null);

  const match = content.match(URL_REGEX);
  const url = match?.[0];

  useEffect(() => {
    if (!url) return;

    // Don't preview images/GIFs (they're already rendered inline)
    if (/\.(gif|png|jpe?g|webp)(\?.*)?$/i.test(url)) return;
    if (/static\.klipy\.com|media\.giphy\.com|media\.tenor\.com/i.test(url)) return;

    if (previewCache.has(url)) {
      setPreview(previewCache.get(url) ?? null);
      return;
    }

    api.getLinkPreview(url).then((data) => {
      const result = data.title ? data : null;
      if (result) previewCache.set(url, result); // only cache successes
      setPreview(result);
    }).catch(() => {
      // Don't cache failures -- allow retry on next render
    });
  }, [url]);

  if (!preview) return null;

  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      className="link-preview"
    >
      {preview.image && (
        <img className="link-preview-image" src={preview.image} alt="" />
      )}
      <div className="link-preview-body">
        {preview.siteName && (
          <span className="link-preview-site">{preview.siteName}</span>
        )}
        <span className="link-preview-title">{preview.title}</span>
        {preview.description && (
          <span className="link-preview-desc">{preview.description}</span>
        )}
      </div>
    </a>
  );
}
