import { spawn, execFile } from "child_process";
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
  ]);

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
 * Get the direct audio stream URL for a YouTube video.
 * Returns the best audio-only format URL.
 */
export async function getAudioStreamUrl(url: string): Promise<{
  streamUrl: string;
  title: string;
  duration: number;
}> {
  const { stdout } = await execFileAsync("yt-dlp", [
    url,
    "--dump-json",
    "-f", "bestaudio",
    "--no-download",
    "--no-warnings",
  ]);

  const data = JSON.parse(stdout.trim());
  return {
    streamUrl: data.url,
    title: data.title ?? "Unknown",
    duration: data.duration ?? 0,
  };
}

/**
 * Spawn an ffmpeg process that reads from a URL and outputs raw PCM audio.
 * Returns the spawned process (pipe stdout for audio data).
 */
export function spawnFfmpegStream(audioUrl: string) {
  return spawn("ffmpeg", [
    "-i", audioUrl,
    "-f", "s16le",        // raw PCM 16-bit little-endian
    "-acodec", "pcm_s16le",
    "-ar", "48000",        // 48kHz sample rate (Opus standard)
    "-ac", "2",            // stereo
    "-",                   // output to stdout
  ], {
    stdio: ["ignore", "pipe", "ignore"],
  });
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
