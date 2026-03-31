import type { ChildProcess } from "child_process";
import { getAudioStreamUrl, spawnFfmpegStream } from "./ytdlp.js";
import { popNext, setPlaying, setNotPlaying, getState } from "./queue.js";
import type { MusicQueueItem } from "@concord/shared";

/**
 * Active players per voice channel.
 * Each channel can have at most one active ffmpeg process.
 */
const activePlayers = new Map<
  string,
  { process: ChildProcess; track: MusicQueueItem }
>();

/**
 * Start playing a track in a voice channel.
 * In a full implementation, this would publish the audio into the LiveKit room
 * via a server-side participant. For now, it manages the ffmpeg process lifecycle
 * and queue progression.
 *
 * LiveKit audio injection requires the livekit-server-sdk's Room Agent or
 * Ingress API — this will be wired up as a follow-up when we have a running
 * LiveKit instance to test against.
 */
export async function playTrack(
  voiceChannelId: string,
  track: MusicQueueItem
): Promise<void> {
  // Stop any existing playback
  stopPlayback(voiceChannelId);

  try {
    const { streamUrl, title } = await getAudioStreamUrl(track.url);
    const ffmpeg = spawnFfmpegStream(streamUrl);

    activePlayers.set(voiceChannelId, { process: ffmpeg, track });
    setPlaying(voiceChannelId, { ...track, title });

    // When ffmpeg finishes (track ended), play next in queue
    ffmpeg.on("close", () => {
      activePlayers.delete(voiceChannelId);
      playNext(voiceChannelId);
    });

    ffmpeg.on("error", () => {
      activePlayers.delete(voiceChannelId);
      setNotPlaying(voiceChannelId);
    });

    // Consume stdout to prevent backpressure
    // In production, this data would be sent to LiveKit
    ffmpeg.stdout?.resume();
  } catch (err) {
    console.error(`[music] Failed to play track: ${err}`);
    setNotPlaying(voiceChannelId);
    // Try next track
    playNext(voiceChannelId);
  }
}

/**
 * Play the next track in the queue, or stop if empty.
 */
export function playNext(voiceChannelId: string): void {
  const next = popNext(voiceChannelId);
  if (next) {
    playTrack(voiceChannelId, next);
  } else {
    setNotPlaying(voiceChannelId);
  }
}

/**
 * Stop current playback.
 */
export function stopPlayback(voiceChannelId: string): void {
  const active = activePlayers.get(voiceChannelId);
  if (active) {
    active.process.kill("SIGTERM");
    activePlayers.delete(voiceChannelId);
  }
  setNotPlaying(voiceChannelId);
}

/**
 * Skip the current track and play the next one.
 */
export function skipTrack(voiceChannelId: string): void {
  stopPlayback(voiceChannelId);
  playNext(voiceChannelId);
}

/**
 * Check if a channel currently has active playback.
 */
export function isPlaying(voiceChannelId: string): boolean {
  return activePlayers.has(voiceChannelId);
}
