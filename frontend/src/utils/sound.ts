// Synthesizes a realistic, audible, satisfying magazine page-turn sound using Web Audio API

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      try {
        audioCtx = new AudioContextClass();
      } catch {
        return null;
      }
    }
  }
  return audioCtx;
}

/**
 * Resumes existing AudioContext within a user interaction gesture if already instantiated.
 * Does NOT eagerly instantiate AudioContext to avoid browser autoplay warnings.
 */
export function unlockAudio(): void {
  try {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
  } catch {
    // Autoplay or unsupported environment
  }
}

function synthesizePageFlip(ctx: AudioContext): void {
  const now = ctx.currentTime;
  const duration = 0.32;

  // 1. Generate pink/brown filtered noise buffer for realistic paper texture
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + white * 0.0990460;
    b1 = 0.96300 * b1 + white * 0.1472500;
    b2 = 0.57000 * b2 + white * 0.3835900;
    data[i] = (b0 + b1 + b2 + white * 0.12) * 0.35;
  }

  const noiseNode = ctx.createBufferSource();
  noiseNode.buffer = buffer;

  // 2. Dual-filter chain for authentic page turn sound:
  // Layer A: Bandpass filter sweeping through air friction frequencies (450Hz -> 1800Hz -> 300Hz)
  const bandpass = ctx.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.setValueAtTime(450, now);
  bandpass.frequency.exponentialRampToValueAtTime(1850, now + duration * 0.35);
  bandpass.frequency.exponentialRampToValueAtTime(280, now + duration);
  bandpass.Q.setValueAtTime(1.8, now);

  // Layer B: Subtle highpass filter to give paper a crisp, glossy magazine finish
  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.setValueAtTime(180, now);
  highpass.frequency.exponentialRampToValueAtTime(320, now + duration * 0.5);

  // 3. Crisp gain envelope with clear attack, body, and decay
  const gainNode = ctx.createGain();
  gainNode.gain.setValueAtTime(0.001, now);
  gainNode.gain.linearRampToValueAtTime(0.52, now + 0.035);
  gainNode.gain.exponentialRampToValueAtTime(0.18, now + duration * 0.45);
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

  noiseNode.connect(highpass);
  highpass.connect(bandpass);
  bandpass.connect(gainNode);
  gainNode.connect(ctx.destination);

  noiseNode.start(now);
  noiseNode.stop(now + duration);
}

/**
 * Plays a realistic glossy paper page-turn sound.
 * Handles both running and suspended AudioContext states reliably.
 */
export function playPageFlipSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'running') {
      synthesizePageFlip(ctx);
    } else if (ctx.state === 'suspended') {
      ctx.resume().then(() => {
        if (ctx.state === 'running') {
          synthesizePageFlip(ctx);
        }
      }).catch(() => {});
    }
  } catch {
    // Audio restrictions or unsupported
  }
}
