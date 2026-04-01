import { loadRnnoise, RnnoiseWorkletNode } from "@sapphi-red/web-noise-suppressor";
// Use the package's exported paths for worklet and WASM
// @ts-expect-error -- Vite URL import
import rnnoiseWorkletUrl from "@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url";
// @ts-expect-error -- Vite URL import
import rnnoiseWasmUrl from "@sapphi-red/web-noise-suppressor/rnnoise.wasm?url";
// @ts-expect-error -- Vite URL import
import rnnoiseSimdWasmUrl from "@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url";

let wasmBinary: ArrayBuffer | null = null;
let workletRegistered = false;

/**
 * Initialize the RNNoise WASM module and register the AudioWorklet processor.
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

  // Create RNNoise worklet node (works on mono, 48kHz)
  const rnnoise = new RnnoiseWorkletNode(ctx, {
    maxChannels: 1,
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
