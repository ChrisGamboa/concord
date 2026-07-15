export interface ParsedSearchQuery {
  text: string;
  from: string | null;
  inChannel: string | null;
  before: string | null;
  after: string | null;
}

/** Extract from:/in:/before:/after: filter tokens from a message-search query. */
export function parseSearchQuery(raw: string): ParsedSearchQuery {
  const textParts: string[] = [];
  let from: string | null = null;
  let inChannel: string | null = null;
  let before: string | null = null;
  let after: string | null = null;
  for (const token of raw.trim().split(/\s+/).filter(Boolean)) {
    const m = token.match(/^(from|in|before|after):(.+)$/i);
    if (!m) {
      textParts.push(token);
      continue;
    }
    const value = m[2];
    switch (m[1].toLowerCase()) {
      case "from": from = value.replace(/^@/, ""); break;
      case "in": inChannel = value.replace(/^#/, ""); break;
      case "before": before = value; break;
      case "after": after = value; break;
    }
  }
  return { text: textParts.join(" "), from, inChannel, before, after };
}
