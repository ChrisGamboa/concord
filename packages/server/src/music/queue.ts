import type { MusicQueueItem, MusicState } from "@concord/shared";

/**
 * In-memory music queue per voice channel.
 * For a small-scale app (< 50 users), this is sufficient.
 * Could be backed by Redis for persistence across restarts.
 */
const channelQueues = new Map<string, MusicQueueItem[]>();
const channelState = new Map<
  string,
  { isPlaying: boolean; isPaused: boolean; currentTrack: MusicQueueItem | null }
>();

export function getQueue(voiceChannelId: string): MusicQueueItem[] {
  return channelQueues.get(voiceChannelId) ?? [];
}

export function addToQueue(
  voiceChannelId: string,
  item: MusicQueueItem
): void {
  const queue = channelQueues.get(voiceChannelId) ?? [];
  queue.push(item);
  channelQueues.set(voiceChannelId, queue);
}

export function removeFromQueue(
  voiceChannelId: string,
  index: number
): MusicQueueItem | null {
  const queue = channelQueues.get(voiceChannelId);
  if (!queue || index < 0 || index >= queue.length) return null;
  return queue.splice(index, 1)[0];
}

export function clearQueue(voiceChannelId: string): void {
  channelQueues.delete(voiceChannelId);
}

export function popNext(voiceChannelId: string): MusicQueueItem | null {
  const queue = channelQueues.get(voiceChannelId);
  if (!queue || queue.length === 0) return null;
  return queue.shift()!;
}

export function getState(voiceChannelId: string): MusicState {
  const state = channelState.get(voiceChannelId) ?? {
    isPlaying: false,
    isPaused: false,
    currentTrack: null,
  };
  return {
    isPlaying: state.isPlaying,
    isPaused: state.isPaused,
    currentTrack: state.currentTrack,
    queue: getQueue(voiceChannelId),
    voiceChannelId,
  };
}

export function setPlaying(
  voiceChannelId: string,
  track: MusicQueueItem | null
): void {
  channelState.set(voiceChannelId, {
    isPlaying: track !== null,
    isPaused: false,
    currentTrack: track,
  });
}

export function setPaused(voiceChannelId: string, paused: boolean): void {
  const state = channelState.get(voiceChannelId);
  if (state) {
    state.isPaused = paused;
  }
}

export function setNotPlaying(voiceChannelId: string): void {
  channelState.set(voiceChannelId, {
    isPlaying: false,
    isPaused: false,
    currentTrack: null,
  });
}
