import { useEffect, useState } from 'react';
import './FlipexLoader.css';

// Gold book badge: closed → page lifts → pages fan → page turns away → the X mark → back to the cover.
const FRAMES = [1, 2, 3, 4, 5, 6].map((n) => `/assets/flipex-loader/gold-${n}.webp`);
// Slow, smooth timing: how long each frame is held before cross-fading to the next (ms).
const HOLD = [1100, 800, 800, 800, 900, 1300];
const FADE_MS = 650;

// Sparkle positions around the badge (percent of the stage) and their twinkle timing.
const SPARKLES = [
  { x: 6, y: 18, s: 0.9, d: 0 },
  { x: 90, y: 12, s: 1.2, d: 0.7 },
  { x: 96, y: 58, s: 0.7, d: 1.4 },
  { x: 14, y: 84, s: 1.0, d: 2.1 },
  { x: 76, y: 92, s: 0.8, d: 0.35 },
  { x: 48, y: 2, s: 0.6, d: 1.05 },
];

export interface FlipexLoaderProps {
  size?: 'xs' | 'icon' | 'sm' | 'md' | 'lg' | 'hero';
  label?: string | null;
  /** Kept for backwards compatibility; the gold badge always has a transparent background. */
  transparent?: boolean;
  centered?: boolean;
  /** Multiplier for the hold time between flips (1 = default, 1.5 = slower). */
  speedMs?: number;
  className?: string;
}

export default function FlipexLoader({
  size = 'md',
  label = 'Loading interactive pages…',
  centered = true,
  speedMs,
  className = '',
}: FlipexLoaderProps) {
  const [active, setActive] = useState(0);
  const [prev, setPrev] = useState<number | null>(null);
  const slow = speedMs && speedMs > 0 ? Math.max(0.6, speedMs / 450) : 1;

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const t = window.setTimeout(() => {
      setPrev(active);
      setActive((a) => (a + 1) % FRAMES.length);
    }, HOLD[active] * slow);
    return () => window.clearTimeout(t);
  }, [active, slow]);

  return (
    <div
      className={`flipex-loader-container flipex-loader-${size} ${centered ? 'flipex-loader-centered' : ''} ${className}`}
      role="status"
      aria-label={label || 'Loading…'}
    >
      <div className="flipex-book-stage" style={{ ['--fx-fade' as any]: `${FADE_MS}ms` }}>
        <div className="flipex-book-glow" />
        {FRAMES.map((src, i) => (
          <img
            key={src}
            src={src}
            alt=""
            aria-hidden="true"
            draggable={false}
            className={`flipex-book-frame ${active === i ? 'active' : ''} ${prev === i ? 'leaving' : ''}`}
            loading="eager"
          />
        ))}
        {SPARKLES.map((p, i) => (
          <svg
            key={i}
            className="flipex-sparkle"
            viewBox="0 0 24 24"
            aria-hidden="true"
            style={{ left: `${p.x}%`, top: `${p.y}%`, ['--s' as any]: p.s, animationDelay: `${p.d}s` }}
          >
            <path d="M12 0c.9 6.2 2.8 9.1 12 12-9.2 2.9-11.1 5.8-12 12-.9-6.2-2.8-9.1-12-12C9.2 9.1 11.1 6.2 12 0z" />
          </svg>
        ))}
      </div>

      {label && (
        <div className="flipex-loader-label">
          <span>{label}</span>
        </div>
      )}
    </div>
  );
}
