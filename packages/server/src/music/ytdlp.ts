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
 * Get metadata (title, duration) for a YouTube video without downloading.
 */
export async function getTrackMetadata(url: string): Promise<{
  title: string;
  duration: number;
}> {
  console.log(`[yt-dlp] Getting metadata for: ${url}`);
  const { stdout } = await execFileAsync("yt-dlp", [
    url,
    "--dump-json",
    "-f", "bestaudio",
    "--no-download",
    "--no-warnings",
  ], { timeout: 30_000 });

  const data = JSON.parse(stdout.trim());
  console.log(`[yt-dlp] Got metadata for "${data.title}" (${data.duration}s)`);
  return {
    title: data.title ?? "Unknown",
    duration: data.duration ?? 0,
  };
}

/**
 * Spawn yt-dlp piped to ffmpeg to stream audio as raw PCM.
 * yt-dlp handles HTTP auth/headers, ffmpeg converts to PCM.
 * Returns the ffmpeg process (read stdout for PCM data).
 * Also returns the yt-dlp process so both can be cleaned up.
 */
export function spawnAudioStream(videoUrl: string): {
  ffmpeg: ChildProcess;
  ytdlp: ChildProcess;
} {
  // yt-dlp streams audio to stdout
  const ytdlp = spawn("yt-dlp", [
    "-f", "bestaudio",
    "-o", "-",
    "--no-warnings",
    videoUrl,
  ], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  // ffmpeg reads from stdin (piped from yt-dlp) and outputs raw PCM
  const ffmpeg = spawn("ffmpeg", [
    "-i", "pipe:0",
    "-f", "s16le",
    "-acodec", "pcm_s16le",
    "-ar", "48000",
    "-ac", "2",
    "-",
  ], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  // Pipe yt-dlp stdout -> ffmpeg stdin
  ytdlp.stdout!.pipe(ffmpeg.stdin!);

  // Log errors from both processes
  let ytdlpStderr = "";
  ytdlp.stderr?.on("data", (chunk: Buffer) => { ytdlpStderr += chunk.toString(); });
  ytdlp.on("close", (code) => {
    if (code !== 0 && ytdlpStderr) {
      console.error(`[yt-dlp] stream exited ${code}:`, ytdlpStderr.slice(-300));
    }
    // Close ffmpeg's stdin when yt-dlp finishes
    ffmpeg.stdin?.end();
  });

  let ffmpegStderr = "";
  ffmpeg.stderr?.on("data", (chunk: Buffer) => { ffmpegStderr += chunk.toString(); });
  ffmpeg.on("close", (code) => {
    if (code !== 0 && code !== null && ffmpegStderr) {
      console.error(`[ffmpeg] exited ${code}:`, ffmpegStderr.slice(-300));
    }
  });

  return { ffmpeg, ytdlp };
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
