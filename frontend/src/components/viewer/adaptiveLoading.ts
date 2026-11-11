/**
 * Adaptive reader resource profile (image window + canvas pixel ratio).
 * Chosen from device memory, CPU cores, network conditions and viewport size so low-powered
 * phones load/hold fewer page images and use a smaller canvas than desktops.
 */
export interface ReaderProfile {
  /** Pages kept loaded ahead of the current spread. */
  ahead: number;
  /** Pages kept loaded behind the current spread. */
  behind: number;
  /** Maximum canvas device-pixel-ratio. */
  maxDpr: number;
  tier: 'low' | 'mid' | 'high';
}

interface NavExtras {
  deviceMemory?: number;
  hardwareConcurrency?: number;
  connection?: { saveData?: boolean; effectiveType?: string };
}

export function getReaderProfile(): ReaderProfile {
  const nav = (typeof navigator !== 'undefined' ? navigator : {}) as NavExtras;
  const mem = nav.deviceMemory ?? 4;
  const cores = nav.hardwareConcurrency ?? 4;
  const conn = nav.connection;
  const slowNet = !!conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType ?? '') || conn?.effectiveType === '3g';
  const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  const narrow = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 700;
  const isMobile = coarse || narrow;

  let tier: ReaderProfile['tier'];
  if (slowNet || mem <= 2 || cores <= 2) tier = 'low';
  else if (isMobile && (mem < 6 || cores < 8)) tier = 'mid';
  else tier = isMobile ? 'mid' : 'high';
  if (!isMobile && mem >= 4 && !slowNet) tier = 'high';

  switch (tier) {
    case 'low':
      return { ahead: 2, behind: 1, maxDpr: 1, tier };
    case 'mid':
      return { ahead: 2, behind: 1, maxDpr: isMobile && mem >= 6 ? 2 : 1.5, tier };
    default:
      return { ahead: 3, behind: 2, maxDpr: 2, tier };
  }
}

/** Canvas DPR: real device ratio clamped by the adaptive cap (never above 2, never below 1). */
export function getCanvasDpr(): number {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  return Math.min(getReaderProfile().maxDpr, Math.max(1, dpr));
}

/**
 * Page indexes that should hold a real image: cover + the current spread (2 pages) + `ahead` pages after it
 * + `behind` pages before it. Large publications are strictly windowed; everything else stays a placeholder.
 */
export function pagesToLoad(currentIdx: number, total: number, profile = getReaderProfile()): Set<number> {
  const out = new Set<number>([0]);
  const spreadStart = Math.max(0, currentIdx);
  const spreadEnd = Math.min(total - 1, spreadStart + 1);
  for (let i = spreadStart - profile.behind; i <= spreadEnd + profile.ahead; i++) {
    if (i >= 0 && i < total) out.add(i);
  }
  return out;
}
