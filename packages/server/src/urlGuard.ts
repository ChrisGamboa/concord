import dns from "dns/promises";
import net from "net";

// SSRF guard for server-side fetches of user-supplied URLs (link previews).
// Blocks non-http(s) schemes and hosts that resolve to private/loopback/link-local
// addresses, and re-validates every redirect hop.

function ipv4IsPrivate(ip: string): boolean {
  const parts = ip.split(".").map((n) => parseInt(n, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 127) return true; // this-host, loopback
  if (a === 10) return true; // private
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 169 && b === 254) return true; // link-local
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

export function isPrivateIp(ip: string): boolean {
  const type = net.isIP(ip);
  if (type === 4) return ipv4IsPrivate(ip);
  if (type === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true; // loopback, unspecified
    // IPv4-mapped (::ffff:a.b.c.d)
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return ipv4IsPrivate(mapped[1]);
    const head = parseInt(lower.split(":")[0] || "0", 16);
    if ((head & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
    if ((head & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    return false;
  }
  return true; // not a valid IP literal — treat as unsafe
}

/** Validate scheme + resolve host, throwing if it points at a private address. */
export async function assertPublicUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Unsupported URL scheme");
  }
  const host = url.hostname;
  const addresses = net.isIP(host)
    ? [host]
    : (await dns.lookup(host, { all: true })).map((a) => a.address);
  if (addresses.length === 0) throw new Error("Host did not resolve");
  for (const addr of addresses) {
    if (isPrivateIp(addr)) throw new Error("Blocked non-public address");
  }
}

/** fetch() that validates the target (and each redirect hop) against assertPublicUrl. */
export async function safeFetch(
  rawUrl: string,
  init: RequestInit,
  maxRedirects = 4
): Promise<Response> {
  let current = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertPublicUrl(current);
    const res = await fetch(current, { ...init, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return res;
      current = new URL(location, current).toString();
      continue;
    }
    return res;
  }
  throw new Error("Too many redirects");
}
