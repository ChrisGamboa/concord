import dns from "dns/promises";
import net from "net";
import { Agent } from "undici";

// SSRF guard for server-side fetches of user-supplied URLs (link previews).
// Blocks non-http(s) schemes and hosts that resolve to private/loopback/link-local
// addresses, re-validates every redirect hop, and — crucially — pins DNS resolution
// through a dispatcher so the IP that is validated is the exact IP connected to
// (defeating DNS-rebinding, where a second unpinned lookup returns a private IP).

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
    // Expand to 8 hextets to catch both compressed (::1) and full (0:0:...:1) forms.
    const groups = expandIpv6(lower);
    if (!groups) return true;
    if (groups.every((g) => g === 0)) return true; // :: unspecified
    if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) return true; // ::1 loopback
    // IPv4-mapped ::ffff:a.b.c.d — last 32 bits carry the v4 address
    if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
      const v4 = `${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}`;
      return ipv4IsPrivate(v4);
    }
    if ((groups[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
    if ((groups[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    return false;
  }
  return true; // not a valid IP literal — treat as unsafe
}

/** Expand an IPv6 string (compressed or full) into 8 numeric hextets, or null if malformed. */
function expandIpv6(ip: string): number[] | null {
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const parse = (s: string): number[] => {
    if (s === "") return [];
    const out: number[] = [];
    for (const seg of s.split(":")) {
      if (seg.includes(".")) {
        // Embedded IPv4 (e.g. ::ffff:127.0.0.1) → two 16-bit hextets
        const v4 = seg.split(".").map((n) => parseInt(n, 10));
        if (v4.length !== 4 || v4.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return [NaN];
        out.push((v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]);
      } else {
        out.push(parseInt(seg, 16));
      }
    }
    return out;
  };
  const head = parse(halves[0]);
  const tail = halves.length === 2 ? parse(halves[1]) : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 && head.length !== 8) return null;
  if (halves.length === 2 && missing < 0) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill(0), ...tail];
  if (groups.length !== 8 || groups.some((g) => Number.isNaN(g) || g < 0 || g > 0xffff)) return null;
  return groups;
}

function stripBrackets(host: string): string {
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
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
  const host = stripBrackets(url.hostname);
  const addresses = net.isIP(host)
    ? [host]
    : (await dns.lookup(host, { all: true })).map((a) => a.address);
  if (addresses.length === 0) throw new Error("Host did not resolve");
  for (const addr of addresses) {
    if (isPrivateIp(addr)) throw new Error("Blocked non-public address");
  }
}

// Dispatcher whose DNS lookup rejects private addresses. Because undici uses this
// exact resolution to open the socket, the validated IP is the connected IP — no
// TOCTOU window between validation and connection.
const guardedDispatcher = new Agent({
  connect: {
    lookup: (hostname, options, callback) => {
      dns.lookup(hostname, { all: true })
        .then((addrs) => {
          for (const a of addrs) {
            if (isPrivateIp(a.address)) {
              callback(new Error(`Blocked non-public address: ${a.address}`), []);
              return;
            }
          }
          if (options && (options as { all?: boolean }).all) {
            callback(null, addrs as unknown as never);
          } else {
            callback(null, addrs[0].address as unknown as never, addrs[0].family as unknown as never);
          }
        })
        .catch((err) => callback(err as Error, []));
    },
  },
});

/** fetch() that validates the target (and each redirect hop) and pins DNS so the
 * connected IP is the validated one. */
export async function safeFetch(
  rawUrl: string,
  init: RequestInit,
  maxRedirects = 4
): Promise<Response> {
  let current = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertPublicUrl(current);
    const res = await fetch(current, {
      ...init,
      redirect: "manual",
      // @ts-expect-error Node's fetch accepts an undici dispatcher not in lib.dom types
      dispatcher: guardedDispatcher,
    });
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
