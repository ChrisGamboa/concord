import { loadRnnoise, RnnoiseWorkletNode } from "@sapphi-red/web-noise-suppressor";
// @ts-expect-error -- worklet processor URL import
import rnnoiseWorkletUrl from "@sapphi-red/web-noise-suppressor/dist/rnnoise/workletProcessor.js?url";
// @ts-expect-error -- wasm URL import
import rnnoiseWasmUrl from "@sapphi-red/web-noise-suppressor/dist/rnnoise.wasm?url";
// @ts-expect-error -- simd wasm URL import
import rnnoiseSimdWasmUrl from "@sapphi-red/web-noise-suppressor/dist/rnnoise_simd.wasm?url";

let wasmBinary: ArrayBuffer | null = null;
let workletRegistered = false;

/**
 * Initialize the RNNoise WASM module and register the AudioWorklet processor.
 * Call once before creating processor instances.
 */
async function ensureInitialized(ctx: AudioContext): Promise<ArrayBuffer> {
  if (!wasmBinary) {
    wasmBinary = await loadRnnoise({
      url: rnnoiseWasmUrl,
      simdUrl: rnnoiseSimdWasmUrl,
    });
  }

  if (!workletRegistered) {
    await ctx.audioWorklet.addModule(rnnoiseWorkletUrl);
    workletRegistered = true;
  }

  return wasmBinary;
}

/**
 * Creates a processed MediaStreamTrack with RNNoise applied.
 * Takes the original mic track, routes through RNNoise, returns the clean track.
 */
export async function createRnnoiseTrack(
  originalTrack: MediaStreamTrack
): Promise<{
  processedTrack: MediaStreamTrack;
  cleanup: () => void;
}> {
  const ctx = new AudioContext({ sampleRate: 48000 });
  const binary = await ensureInitialized(ctx);

  // Create source from original mic track
  const source = ctx.createMediaStreamSource(new MediaStream([originalTrack]));

  // Create RNNoise worklet node
  const rnnoise = new RnnoiseWorkletNode(ctx, {
    maxChannels: 1, // RNNoise works on mono
    wasmBinary: binary,
  });

  // Create destination to get the processed track
  const dest = ctx.createMediaStreamDestination();

  // Connect: mic -> rnnoise -> output
  source.connect(rnnoise);
  rnnoise.connect(dest);

  const processedTrack = dest.stream.getAudioTracks()[0];

  const cleanup = () => {
    source.disconnect();
    rnnoise.disconnect();
    rnnoise.destroy();
    dest.disconnect();
    ctx.close();
  };

  return { processedTrack, cleanup };
}
