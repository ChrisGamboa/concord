import { describe, it, expect, beforeEach } from "vitest";
import {
  addToQueue,
  getQueue,
  removeFromQueue,
  clearQueue,
  popNext,
  getState,
  setPlaying,
  setNotPlaying,
} from "../music/queue";
import type { MusicQueueItem } from "@concord/shared";

function makeTrack(id: string): MusicQueueItem {
  return {
    id,
    title: `Track ${id}`,
    duration: 180,
    thumbnail: null,
    url: `https://youtube.com/watch?v=${id}`,
    requestedBy: "user1",
  };
}

describe("Music Queue", () => {
  const channelId = "test-channel";

  beforeEach(() => {
    clearQueue(channelId);
    setNotPlaying(channelId);
  });

  it("should add and retrieve items from queue", () => {
    const track = makeTrack("1");
    addToQueue(channelId, track);

    const queue = getQueue(channelId);
    expect(queue).toHaveLength(1);
    expect(queue[0].id).toBe("1");
  });

  it("should maintain order (FIFO)", () => {
    addToQueue(channelId, makeTrack("1"));
    addToQueue(channelId, makeTrack("2"));
    addToQueue(channelId, makeTrack("3"));

    const queue = getQueue(channelId);
    expect(queue.map((t) => t.id)).toEqual(["1", "2", "3"]);
  });

  it("should pop next item from front of queue", () => {
    addToQueue(channelId, makeTrack("1"));
    addToQueue(channelId, makeTrack("2"));

    const next = popNext(channelId);
    expect(next?.id).toBe("1");
    expect(getQueue(channelId)).toHaveLength(1);
    expect(getQueue(channelId)[0].id).toBe("2");
  });

  it("should return null when popping from empty queue", () => {
    expect(popNext(channelId)).toBeNull();
  });

  it("should remove item by index", () => {
    addToQueue(channelId, makeTrack("1"));
    addToQueue(channelId, makeTrack("2"));
    addToQueue(channelId, makeTrack("3"));

    const removed = removeFromQueue(channelId, 1);
    expect(removed?.id).toBe("2");
    expect(getQueue(channelId).map((t) => t.id)).toEqual(["1", "3"]);
  });

  it("should return null for invalid remove index", () => {
    expect(removeFromQueue(channelId, 0)).toBeNull();
    addToQueue(channelId, makeTrack("1"));
    expect(removeFromQueue(channelId, 5)).toBeNull();
    expect(removeFromQueue(channelId, -1)).toBeNull();
  });

  it("should clear entire queue", () => {
    addToQueue(channelId, makeTrack("1"));
    addToQueue(channelId, makeTrack("2"));
    clearQueue(channelId);
    expect(getQueue(channelId)).toHaveLength(0);
  });

  it("should track playing state", () => {
    const track = makeTrack("1");
    setPlaying(channelId, track);

    const state = getState(channelId);
    expect(state.isPlaying).toBe(true);
    expect(state.currentTrack?.id).toBe("1");
  });

  it("should reset playing state", () => {
    setPlaying(channelId, makeTrack("1"));
    setNotPlaying(channelId);

    const state = getState(channelId);
    expect(state.isPlaying).toBe(false);
    expect(state.currentTrack).toBeNull();
  });

  it("should return full state including queue", () => {
    addToQueue(channelId, makeTrack("2"));
    addToQueue(channelId, makeTrack("3"));
    setPlaying(channelId, makeTrack("1"));

    const state = getState(channelId);
    expect(state.isPlaying).toBe(true);
    expect(state.currentTrack?.id).toBe("1");
    expect(state.queue).toHaveLength(2);
    expect(state.voiceChannelId).toBe(channelId);
  });

  it("should isolate queues between channels", () => {
    addToQueue("ch1", makeTrack("a"));
    addToQueue("ch2", makeTrack("b"));

    expect(getQueue("ch1")).toHaveLength(1);
    expect(getQueue("ch1")[0].id).toBe("a");
    expect(getQueue("ch2")).toHaveLength(1);
    expect(getQueue("ch2")[0].id).toBe("b");

    clearQueue("ch1");
    clearQueue("ch2");
  });
});
