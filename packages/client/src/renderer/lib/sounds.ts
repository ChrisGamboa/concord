/**
 * Procedural notification sounds using Web Audio API.
 * No audio files needed — sounds are synthesized on the fly.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

function playTone(
  frequency: number,
  duration: number,
  type: OscillatorType = "sine",
  volume = 0.15,
  rampDown = true
) {
  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, ctx.currentTime);
  gain.gain.setValueAtTime(volume, ctx.currentTime);

  if (rampDown) {
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  }

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

/**
 * Two ascending tones — "you joined"
 */
export function playJoinSelf() {
  const ctx = getAudioContext();
  // First tone
  playTone(440, 0.12, "sine", 0.15);
  // Second tone (higher, slight delay)
  setTimeout(() => playTone(587, 0.15, "sine", 0.15), 100);
}

/**
 * Single short high tone — "someone else joined"
 */
export function playUserJoined() {
  playTone(523, 0.12, "sine", 0.1);
}

/**
 * Single short low tone — "someone left"
 */
export function playUserLeft() {
  playTone(330, 0.15, "sine", 0.1);
}

/**
 * Descending two tones — "you disconnected"
 */
export function playDisconnect() {
  playTone(523, 0.12, "sine", 0.12);
  setTimeout(() => playTone(392, 0.18, "sine", 0.12), 100);
}
