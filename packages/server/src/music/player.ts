import type { ChildProcess } from "child_process";
import {
  Room,
  RoomEvent,
  AudioFrame,
  AudioSource,
  LocalAudioTrack,
  TrackPublishOptions,
  TrackSource,
} from "@livekit/rtc-node";
import { downloadAudio, spawnFfmpegStream, cleanupTempDir } from "./ytdlp.js";
import { getQueue, popNext, setPlaying, setNotPlaying } from "./queue.js";
import { createLiveKitToken, voiceRoomName } from "../livekit.js";
import { env } from "../env.js";
import type { MusicQueueItem } from "@concord/shared";

const SAMPLE_RATE = 48000;
const CHANNELS = 2;
const FRAME_DURATION_MS = 20;
const SAMPLES_PER_FRAME = (SAMPLE_RATE * FRAME_DURATION_MS) / 1000; // 960
const BYTES_PER_FRAME = SAMPLES_PER_FRAME * CHANNELS * 2; // 3840 bytes (16-bit stereo)
const BOT_IDENTITY = "concord-music-bot";

interface ActivePlayer {
  ffmpeg: ChildProcess;
  room: Room;
  track: MusicQueueItem;
  tempDir: string;
}

interface PrefetchedTrack {
  trackUrl: string;
  filePath: string;
  tempDir: string;
  title: string;
  duration: number;
}

const activePlayers = new Map<string, ActivePlayer>();
const prefetchCache = new Map<string, PrefetchedTrack>();
const prefetchInFlight = new Map<string, Promise<PrefetchedTrack | null>>();

/**
 * Prefetch the next track in a channel's queue (if any).
 * Runs in the background, doesn't block playback.
 */
function prefetchNext(voiceChannelId: string): void {
  const queue = getQueue(voiceChannelId);
  if (queue.length === 0) return;

  const nextTrack = queue[0];
  const existing = prefetchCache.get(voiceChannelId);
  if (existing && existing.trackUrl === nextTrack.url) return; // already cached

  // Don't start a duplicate prefetch
  if (prefetchInFlight.has(voiceChannelId)) return;

  console.log(`[music] Prefetching next track: "${nextTrack.title}"`);
  const promise = downloadAudio(nextTrack.url)
    .then(({ filePath, tempDir, title, duration }) => {
      const cached: PrefetchedTrack = {
        trackUrl: nextTrack.url,
        filePath,
        tempDir,
        title,
        duration,
      };
      prefetchCache.set(voiceChannelId, cached);
      prefetchInFlight.delete(voiceChannelId);
      console.log(`[music] Prefetch complete: "${title}"`);
      return cached;
    })
    .catch((err) => {
      console.warn(`[music] Prefetch failed:`, err);
      prefetchInFlight.delete(voiceChannelId);
      return null;
    });

  prefetchInFlight.set(voiceChannelId, promise);
}

/**
 * Clear prefetch cache for a channel (e.g. on queue clear, stop, or skip).
 */
async function clearPrefetch(voiceChannelId: string): Promise<void> {
  prefetchInFlight.delete(voiceChannelId);
  const cached = prefetchCache.get(voiceChannelId);
  if (cached) {
    prefetchCache.delete(voiceChannelId);
    await cleanupTempDir(cached.tempDir);
  }
}

/**
 * Try to get a prefetched download for a track. Returns null if not cached or URL doesn't match.
 */
function consumePrefetch(
  voiceChannelId: string,
  trackUrl: string
): PrefetchedTrack | null {
  const cached = prefetchCache.get(voiceChannelId);
  if (cached && cached.trackUrl === trackUrl) {
    prefetchCache.delete(voiceChannelId);
    return cached;
  }
  return null;
}

/**
 * Start playing a track in a voice channel by joining the LiveKit room
 * as a bot participant and streaming audio from a downloaded file.
 */
export async function playTrack(
  voiceChannelId: string,
  track: MusicQueueItem
): Promise<void> {
  console.log(`[music] Starting playback of "${track.title}" in channel ${voiceChannelId}`);

  // Stop any existing playback
  await stopPlayback(voiceChannelId);

  try {
    // Check prefetch cache first
    let filePath: string;
    let tempDir: string;
    let title: string;

    const cached = consumePrefetch(voiceChannelId, track.url);
    if (cached) {
      console.log(`[music] Using prefetched audio for "${cached.title}"`);
      filePath = cached.filePath;
      tempDir = cached.tempDir;
      title = cached.title;
    } else {
      const download = await downloadAudio(track.url);
      filePath = download.filePath;
      tempDir = download.tempDir;
      title = download.title;
    }

    const roomName = voiceRoomName(voiceChannelId);

    const token = await createLiveKitToken(
      BOT_IDENTITY,
      "Music Bot",
      roomName
    );

    const room = new Room();
    await room.connect(env.LIVEKIT_URL, token, {
      autoSubscribe: false,
      dynacast: false,
    });

    room.on(RoomEvent.Disconnected, (reason: unknown) => {
      console.log(`[music] Bot room disconnected, reason: ${reason}`);
    });

    const audioSource = new AudioSource(SAMPLE_RATE, CHANNELS);
    const audioTrack = LocalAudioTrack.createAudioTrack("music", audioSource);
    const publishOptions = new TrackPublishOptions();
    publishOptions.source = TrackSource.SOURCE_MICROPHONE;
    publishOptions.dtx = false;
    await room.localParticipant!.publishTrack(audioTrack, publishOptions);

    const ffmpeg = spawnFfmpegStream(filePath);

    activePlayers.set(voiceChannelId, { ffmpeg, room, track, tempDir });
    setPlaying(voiceChannelId, { ...track, title });

    console.log(`[music] Playing "${title}" in ${roomName}`);

    // Start prefetching the next track in the background
    prefetchNext(voiceChannelId);

    // Buffer all PCM data from ffmpeg, then drain at real-time rate via captureFrame.
    let buffer = Buffer.alloc(0);
    let processing = false;
    let stopped = false;
    let ffmpegDone = false;
    let frameCount = 0;

    const processFrames = async () => {
      if (processing) return;
      processing = true;

      while (buffer.length >= BYTES_PER_FRAME && !stopped) {
        const frameData = buffer.subarray(0, BYTES_PER_FRAME);
        buffer = buffer.subarray(BYTES_PER_FRAME);

        const aligned = new ArrayBuffer(BYTES_PER_FRAME);
        new Uint8Array(aligned).set(frameData);
        const int16 = new Int16Array(aligned);

        const frame = new AudioFrame(
          int16,
          SAMPLE_RATE,
          CHANNELS,
          SAMPLES_PER_FRAME
        );

        try {
          await audioSource.captureFrame(frame);
          frameCount++;
          if (frameCount === 50) {
            console.log(`[music] Streaming audio (${frameCount} frames sent)`);
          }
        } catch (err) {
          console.error("[music] captureFrame error:", err);
          stopped = true;
          break;
        }
      }

      processing = false;

      // Buffer fully drained after ffmpeg finished -> track is done
      if (ffmpegDone && buffer.length < BYTES_PER_FRAME && !stopped) {
        console.log(`[music] Track finished (${frameCount} frames total)`);
        const player = activePlayers.get(voiceChannelId);
        if (player?.ffmpeg === ffmpeg) {
          activePlayers.delete(voiceChannelId);
          try {
            await audioTrack.close();
            await room.disconnect();
          } catch {
            // ignore cleanup errors
          }
          await cleanupTempDir(tempDir);
          playNext(voiceChannelId);
        }
      }
    };

    ffmpeg.stdout?.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      processFrames();
    });

    ffmpeg.on("close", () => {
      ffmpegDone = true;
      processFrames();
    });

    ffmpeg.on("error", async (err) => {
      stopped = true;
      console.error(`[music] ffmpeg error:`, err);
      const player = activePlayers.get(voiceChannelId);
      if (player?.ffmpeg === ffmpeg) {
        activePlayers.delete(voiceChannelId);
        try {
          await audioTrack.close();
          await room.disconnect();
        } catch {
          // ignore cleanup errors
        }
        await cleanupTempDir(tempDir);
        setNotPlaying(voiceChannelId);
      }
    });
  } catch (err) {
    console.error(`[music] Failed to play track: ${err}`);
    setNotPlaying(voiceChannelId);
    playNext(voiceChannelId);
  }
}

/**
 * Play the next track in the queue, or stop if empty.
 */
export function playNext(voiceChannelId: string): void {
  const next = popNext(voiceChannelId);
  if (next) {
    playTrack(voiceChannelId, next).catch((err) => {
      console.error(`[music] playNext failed: ${err}`);
      setNotPlaying(voiceChannelId);
    });
  } else {
    setNotPlaying(voiceChannelId);
  }
}

/**
 * Stop current playback and disconnect the bot from the room.
 */
export async function stopPlayback(voiceChannelId: string): Promise<void> {
  const player = activePlayers.get(voiceChannelId);
  if (player) {
    player.ffmpeg.kill("SIGTERM");
    try {
      await player.room.disconnect();
    } catch {
      // ignore
    }
    await cleanupTempDir(player.tempDir);
    activePlayers.delete(voiceChannelId);
  }
  await clearPrefetch(voiceChannelId);
  setNotPlaying(voiceChannelId);
}

/**
 * Skip the current track and play the next one.
 */
export async function skipTrack(voiceChannelId: string): Promise<void> {
  await stopPlayback(voiceChannelId);
  playNext(voiceChannelId);
}

/**
 * Check if a channel currently has active playback.
 */
export function isPlaying(voiceChannelId: string): boolean {
  return activePlayers.has(voiceChannelId);
}

/**
 * Called when queue changes (add/remove) to trigger prefetch if needed.
 */
export function onQueueChanged(voiceChannelId: string): void {
  if (activePlayers.has(voiceChannelId)) {
    prefetchNext(voiceChannelId);
  }
}

/**
 * Stop all active players. Called during server shutdown.
 */
export async function stopAll(): Promise<void> {
  const channelIds = Array.from(activePlayers.keys());
  await Promise.all(channelIds.map((id) => stopPlayback(id)));

  // Clean up any remaining prefetch files
  for (const [id, cached] of prefetchCache) {
    await cleanupTempDir(cached.tempDir);
  }
  prefetchCache.clear();
  prefetchInFlight.clear();

  console.log(`[music] Stopped ${channelIds.length} active player(s)`);
}
