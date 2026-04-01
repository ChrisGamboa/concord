import type { ChildProcess } from "child_process";
import {
  Room,
  AudioFrame,
  AudioSource,
  LocalAudioTrack,
  TrackPublishOptions,
  TrackSource,
} from "@livekit/rtc-node";
import { getAudioStreamUrl, spawnFfmpegStream } from "./ytdlp.js";
import { popNext, setPlaying, setNotPlaying } from "./queue.js";
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
}

const activePlayers = new Map<string, ActivePlayer>();

/**
 * Start playing a track in a voice channel by joining the LiveKit room
 * as a bot participant and publishing audio from ffmpeg.
 */
export async function playTrack(
  voiceChannelId: string,
  track: MusicQueueItem
): Promise<void> {
  // Stop any existing playback
  await stopPlayback(voiceChannelId);

  try {
    const { streamUrl, title } = await getAudioStreamUrl(track.url);
    const roomName = voiceRoomName(voiceChannelId);

    // Create a token for the music bot to join the room
    const token = await createLiveKitToken(
      BOT_IDENTITY,
      "Music Bot",
      roomName
    );

    // Connect to the LiveKit room
    const room = new Room();
    await room.connect(env.LIVEKIT_URL, token, {
      autoSubscribe: false,
      dynacast: false,
    });

    // Create audio source and track
    const audioSource = new AudioSource(SAMPLE_RATE, CHANNELS);
    const audioTrack = LocalAudioTrack.createAudioTrack("music", audioSource);
    const publishOptions = new TrackPublishOptions();
    publishOptions.source = TrackSource.SOURCE_MICROPHONE;
    await room.localParticipant!.publishTrack(audioTrack, publishOptions);

    // Spawn ffmpeg to extract audio
    const ffmpeg = spawnFfmpegStream(streamUrl);

    activePlayers.set(voiceChannelId, { ffmpeg, room, track });
    setPlaying(voiceChannelId, { ...track, title });

    console.log(`[music] Playing "${title}" in ${roomName}`);

    // Pipe ffmpeg PCM output into LiveKit audio frames
    let buffer = Buffer.alloc(0);

    ffmpeg.stdout?.on("data", async (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);

      // Send complete frames
      while (buffer.length >= BYTES_PER_FRAME) {
        const frameData = buffer.subarray(0, BYTES_PER_FRAME);
        buffer = buffer.subarray(BYTES_PER_FRAME);

        const int16 = new Int16Array(
          frameData.buffer,
          frameData.byteOffset,
          frameData.byteLength / 2
        );

        const frame = new AudioFrame(
          int16,
          SAMPLE_RATE,
          CHANNELS,
          SAMPLES_PER_FRAME
        );

        try {
          await audioSource.captureFrame(frame);
        } catch {
          // Room disconnected or source closed
          break;
        }
      }
    });

    // When ffmpeg finishes, clean up and play next
    ffmpeg.on("close", async () => {
      const player = activePlayers.get(voiceChannelId);
      if (player?.ffmpeg === ffmpeg) {
        activePlayers.delete(voiceChannelId);
        try {
          await audioTrack.close();
          await room.disconnect();
        } catch {
          // ignore cleanup errors
        }
        playNext(voiceChannelId);
      }
    });

    ffmpeg.on("error", async () => {
      const player = activePlayers.get(voiceChannelId);
      if (player?.ffmpeg === ffmpeg) {
        activePlayers.delete(voiceChannelId);
        try {
          await audioTrack.close();
          await room.disconnect();
        } catch {
          // ignore cleanup errors
        }
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
    activePlayers.delete(voiceChannelId);
  }
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
