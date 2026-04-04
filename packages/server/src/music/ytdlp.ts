import { spawn, execFile, type ChildProcess } from "child_process";
import { promisify } from "util";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
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
 * Download audio to a temp file using yt-dlp, then return metadata and file path.
 * yt-dlp handles all YouTube auth, DASH segments, and format conversion.
 */
export async function downloadAudio(url: string): Promise<{
  filePath: string;
  tempDir: string;
  title: string;
  duration: number;
}> {
  const tempDir = await mkdtemp(join(tmpdir(), "concord-music-"));
  const outputTemplate = join(tempDir, "audio.%(ext)s");

  console.log(`[yt-dlp] Downloading audio for: ${url}`);
  const { stdout } = await execFileAsync("yt-dlp", [
    url,
    "-f", "bestaudio",
    "-o", outputTemplate,
    "--print-json",
    "--no-warnings",
  ], { timeout: 120_000 }); // 2 min timeout for download

  const data = JSON.parse(stdout.trim());
  const filePath = data._filename ?? data.filename ?? join(tempDir, "audio");
  console.log(`[yt-dlp] Downloaded "${data.title}" (${data.duration}s) -> ${filePath}`);

  return {
    filePath,
    tempDir,
    title: data.title ?? "Unknown",
    duration: data.duration ?? 0,
  };
}

/**
 * Spawn ffmpeg to read a local audio file and output raw PCM.
 */
export function spawnFfmpegStream(filePath: string): ChildProcess {
  const proc = spawn("ffmpeg", [
    "-i", filePath,
    "-vn",
    "-f", "s16le",
    "-acodec", "pcm_s16le",
    "-ar", "48000",
    "-ac", "2",
    "-",
  ], {
    stdio: ["ignore", "pipe", "pipe"],
  });

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
 * Clean up a temp directory.
 */
export async function cleanupTempDir(tempDir: string): Promise<void> {
  try {
    await rm(tempDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
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
