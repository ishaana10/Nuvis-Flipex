import { useEffect, useRef } from 'react';

/**
 * Ambient background particles for the reader (falling leaves, snow, dust, stars, bubbles, petals, rain, fireflies).
 * Pure canvas, no dependencies. Respects prefers-reduced-motion, pauses while the tab is hidden and never
 * intercepts pointer events, so page turns, hotspots and zoom keep working underneath.
 */
export type AmbientKind =
  | 'none' | 'falling_leaves' | 'snow_flakes' | 'golden_dust' | 'starfield'
  | 'bubbles' | 'sakura' | 'rain' | 'fireflies';

interface P {
  x: number; y: number; r: number; vx: number; vy: number;
  rot: number; vr: number; ph: number; hue: number; a: number;
}

const COUNT: Record<string, number> = {
  falling_leaves: 26, snow_flakes: 90, golden_dust: 70, starfield: 110,
  bubbles: 28, sakura: 34, rain: 120, fireflies: 24,
};

const LEAF_COLORS = ['#c2410c', '#d97706', '#b45309', '#a16207', '#9a3412', '#ca8a04'];

function spawn(kind: string, w: number, h: number, initial: boolean): P {
  const rnd = Math.random;
  const p: P = { x: rnd() * w, y: initial ? rnd() * h : -20, r: 4 + rnd() * 6, vx: 0, vy: 0, rot: rnd() * Math.PI * 2, vr: (rnd() - 0.5) * 0.04, ph: rnd() * 6.28, hue: rnd(), a: 0.5 + rnd() * 0.5 };
  switch (kind) {
    case 'falling_leaves': p.r = 7 + rnd() * 7; p.vy = 0.6 + rnd() * 0.9; p.vx = (rnd() - 0.3) * 0.6; break;
    case 'snow_flakes': p.r = 1.2 + rnd() * 3; p.vy = 0.4 + rnd() * 1.0; p.vx = (rnd() - 0.5) * 0.4; break;
    case 'golden_dust': p.y = initial ? rnd() * h : h + 10; p.r = 0.8 + rnd() * 2.2; p.vy = -(0.08 + rnd() * 0.25); p.vx = (rnd() - 0.5) * 0.2; break;
    case 'starfield': p.y = rnd() * h; p.r = 0.4 + rnd() * 1.6; break;
    case 'bubbles': p.y = initial ? rnd() * h : h + 20; p.r = 5 + rnd() * 16; p.vy = -(0.3 + rnd() * 0.7); p.vx = (rnd() - 0.5) * 0.3; break;
    case 'sakura': p.r = 5 + rnd() * 5; p.vy = 0.5 + rnd() * 0.8; p.vx = 0.3 + rnd() * 0.6; break;
    case 'rain': p.r = 10 + rnd() * 14; p.vy = 11 + rnd() * 8; p.vx = -2.2; p.a = 0.15 + rnd() * 0.3; break;
    case 'fireflies': p.y = rnd() * h; p.r = 1.6 + rnd() * 2.2; p.vx = (rnd() - 0.5) * 0.5; p.vy = (rnd() - 0.5) * 0.5; break;
  }
  return p;
}

function drawLeaf(c: CanvasRenderingContext2D, p: P, color: string) {
  c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.fillStyle = color; c.globalAlpha = 0.85;
  c.beginPath(); c.moveTo(0, -p.r); c.quadraticCurveTo(p.r * 0.9, -p.r * 0.2, 0, p.r); c.quadraticCurveTo(-p.r * 0.9, -p.r * 0.2, 0, -p.r); c.fill();
  c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(0, -p.r); c.lineTo(0, p.r); c.stroke();
  c.restore();
}

function drawPetal(c: CanvasRenderingContext2D, p: P) {
  c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.globalAlpha = 0.9;
  c.fillStyle = p.hue > 0.5 ? '#fbcfe8' : '#f9a8d4';
  c.beginPath(); c.moveTo(0, -p.r); c.bezierCurveTo(p.r, -p.r, p.r, p.r * 0.6, 0, p.r); c.bezierCurveTo(-p.r, p.r * 0.6, -p.r, -p.r, 0, -p.r); c.fill();
  c.restore();
}

export default function AmbientEffect({ kind, className }: { kind?: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !kind || kind === 'none' || !(kind in COUNT)) return;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = 0, h = 0, raf = 0, parts: P[] = [], t = 0;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr)); canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!parts.length) parts = Array.from({ length: COUNT[kind] }, () => spawn(kind, w, h, true));
    };
    resize();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    ro?.observe(canvas);

    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (document.hidden || !w || !h) return;
      t += 1;
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        p.ph += 0.03;
        switch (kind) {
          case 'falling_leaves': p.x += p.vx + Math.sin(p.ph) * 0.7; p.y += p.vy; p.rot += p.vr + Math.sin(p.ph) * 0.02; drawLeaf(ctx, p, LEAF_COLORS[Math.floor(p.hue * LEAF_COLORS.length)]); break;
          case 'snow_flakes': p.x += p.vx + Math.sin(p.ph) * 0.35; p.y += p.vy; ctx.globalAlpha = 0.5 + p.a * 0.4; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill(); break;
          case 'golden_dust': p.x += p.vx + Math.sin(p.ph) * 0.15; p.y += p.vy; ctx.globalAlpha = (0.25 + 0.65 * Math.abs(Math.sin(p.ph))) * p.a; ctx.fillStyle = '#fbbf24'; ctx.shadowColor = '#f59e0b'; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill(); ctx.shadowBlur = 0; break;
          case 'starfield': ctx.globalAlpha = 0.25 + 0.75 * Math.abs(Math.sin(p.ph * 0.6 + i)); ctx.fillStyle = '#e0f2fe'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill(); break;
          case 'bubbles': p.x += p.vx + Math.sin(p.ph) * 0.4; p.y += p.vy; ctx.globalAlpha = 0.55; ctx.strokeStyle = 'rgba(186,230,253,.9)'; ctx.fillStyle = 'rgba(186,230,253,.12)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill(); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(p.x - p.r * 0.35, p.y - p.r * 0.35, p.r * 0.18, 0, 6.283); ctx.fill(); break;
          case 'sakura': p.x += p.vx + Math.sin(p.ph) * 0.5; p.y += p.vy; p.rot += p.vr * 2; drawPetal(ctx, p); break;
          case 'rain': p.x += p.vx; p.y += p.vy; ctx.globalAlpha = p.a; ctx.strokeStyle = '#bae6fd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.vx * 1.4, p.y - p.r); ctx.stroke(); break;
          case 'fireflies': p.x += p.vx + Math.sin(p.ph * 0.7) * 0.5; p.y += p.vy + Math.cos(p.ph * 0.5) * 0.5; if (p.x < 0 || p.x > w) p.vx *= -1; if (p.y < 0 || p.y > h) p.vy *= -1; ctx.globalAlpha = 0.2 + 0.8 * Math.abs(Math.sin(p.ph)); ctx.fillStyle = '#fde047'; ctx.shadowColor = '#facc15'; ctx.shadowBlur = 14; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill(); ctx.shadowBlur = 0; break;
        }
        ctx.globalAlpha = 1;
        if (p.y > h + 24 || p.y < -30 || p.x > w + 30 || p.x < -30) {
          if (kind !== 'fireflies' && kind !== 'starfield') parts[i] = spawn(kind, w, h, false);
        }
      }
    };
    frame();
    return () => { cancelAnimationFrame(raf); ro?.disconnect(); };
  }, [kind]);

  if (!kind || kind === 'none' || !(kind in COUNT)) return null;
  return (
    <canvas
      ref={ref}
      className={className || 'hz-ambient'}
      aria-hidden="true"
      data-testid="ambient-effect"
      data-kind={kind}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 2 }}
    />
  );
}
