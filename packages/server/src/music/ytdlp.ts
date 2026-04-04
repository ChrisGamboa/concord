import { spawn, execFile, type ChildProcess } from "child_process";
import { promisify } from "util";
import type { MusicSearchResult } from "@concord/shared";

const execFileAsync = promisify(execFile);

/**
 * Search YouTube for tracks via yt-dlp.
 */
export async function searchYouTube(
  query: string,
  maxResults = 5
): Promise<MusicSearchResult[]> {
  const { stdout } = await execFileAsync("yt-dlp", [
    `ytsearch${maxResults}:${query}`,
    "--dump-json",
    "--flat-playlist",
    "--no-download",
    "--no-warnings",
  ], { timeout: 30_000 });

  const results: MusicSearchResult[] = [];
  for (const line of stdout.trim().split("\n")) {
    if (!line) continue;
    try {
      const data = JSON.parse(line);
      results.push({
        id: data.id,
        title: data.title ?? "Unknown",
        duration: data.duration ?? 0,
        thumbnail: data.thumbnail ?? data.thumbnails?.[0]?.url ?? null,
        url: data.url ?? data.webpage_url ?? `https://www.youtube.com/watch?v=${data.id}`,
      });
    } catch {
      // skip malformed lines
    }
  }

  return results;
}

/**
 * Get the direct audio stream URL and HTTP headers for a YouTube video.
 */
export async function getAudioStreamInfo(url: string): Promise<{
  streamUrl: string;
  title: string;
  duration: number;
  httpHeaders: Record<string, string>;
}> {
  console.log(`[yt-dlp] Getting audio stream info for: ${url}`);
  const { stdout } = await execFileAsync("yt-dlp", [
    url,
    "--dump-json",
    "-f", "bestaudio",
    "--no-download",
    "--no-warnings",
  ], { timeout: 30_000 });

  const data = JSON.parse(stdout.trim());
  if (!data.url) {
    throw new Error(`yt-dlp returned no stream URL for: ${url}`);
  }
  const httpHeaders: Record<string, string> = data.http_headers ?? {};
  console.log(`[yt-dlp] Got stream URL for "${data.title}" (${data.duration}s)`);
  return {
    streamUrl: data.url,
    title: data.title ?? "Unknown",
    duration: data.duration ?? 0,
    httpHeaders,
  };
}

/**
 * Spawn an ffmpeg process that reads from a URL (with proper HTTP headers)
 * and outputs raw PCM audio.
 */
export function spawnFfmpegStream(audioUrl: string, httpHeaders: Record<string, string>): ChildProcess {
  // Build ffmpeg HTTP header string: "Key: Value\r\nKey: Value\r\n"
  const headerStr = Object.entries(httpHeaders)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\r\n");

  const args: string[] = [];

  if (headerStr) {
    args.push("-headers", headerStr + "\r\n");
  }

  args.push(
    "-reconnect", "1",
    "-reconnect_streamed", "1",
    "-reconnect_delay_max", "5",
    "-i", audioUrl,
    "-vn",
    "-f", "s16le",
    "-acodec", "pcm_s16le",
    "-ar", "48000",
    "-ac", "2",
    "-",
  );

  const proc = spawn("ffmpeg", args, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  // Log ffmpeg errors for debugging
  let stderrBuf = "";
  proc.stderr?.on("data", (chunk: Buffer) => { stderrBuf += chunk.toString(); });
  proc.on("close", (code) => {
    if (code !== 0 && code !== null && stderrBuf) {
      console.error(`[ffmpeg] exited ${code}:`, stderrBuf.slice(-500));
    }
  });

  return proc;
}

/**
 * Check if yt-dlp is available on this system.
 */
export async function isYtdlpAvailable(): Promise<boolean> {
  try {
    await execFileAsync("yt-dlp", ["--version"]);
    return true;
  } catch {
    return false;
  }
}
