import React, { useEffect, useState } from 'react';
import './FlipexLoader.css';

const FRAMES_TRANSPARENT = [
  '/assets/flipex-loader/frame-1-transparent.png',
  '/assets/flipex-loader/frame-2-transparent.png',
  '/assets/flipex-loader/frame-3-transparent.png',
  '/assets/flipex-loader/frame-4-transparent.png',
];

const FRAMES_SOLID = [
  '/assets/flipex-loader/frame-1.png',
  '/assets/flipex-loader/frame-2.png',
  '/assets/flipex-loader/frame-3.png',
  '/assets/flipex-loader/frame-4.png',
];

export interface FlipexLoaderProps {
  size?: 'icon' | 'sm' | 'md' | 'lg' | 'hero';
  label?: string | null;
  transparent?: boolean;
  centered?: boolean;
  speedMs?: number;
  className?: string;
}

export default function FlipexLoader({
  size = 'md',
  label = 'Loading interactive pages…',
  transparent = true,
  centered = true,
  speedMs = 240,
  className = '',
}: FlipexLoaderProps) {
  const [activeFrame, setActiveFrame] = useState(0);
  const frames = transparent ? FRAMES_TRANSPARENT : FRAMES_SOLID;

  // Fluid page-turning frame cycle
  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveFrame((prev) => (prev + 1) % frames.length);
    }, speedMs);
    return () => window.clearInterval(timer);
  }, [frames.length, speedMs]);

  return (
    <div
      className={`flipex-loader-container flipex-loader-${size} ${centered ? 'flipex-loader-centered' : ''} ${className}`}
      role="status"
      aria-label={label || 'Loading…'}
    >
      <div className="flipex-book-stage">
        <div className="flipex-book-glow" />
        {frames.map((src, index) => (
          <img
            key={src}
            src={src}
            alt=""
            aria-hidden="true"
            className={`flipex-book-frame ${activeFrame === index ? 'active' : ''}`}
            loading="eager"
          />
        ))}
      </div>

      {label && (
        <div className="flipex-loader-label">
          <span>{label}</span>
          <span className="flipex-loader-dots" aria-hidden="true">
            <span>•</span>
            <span>•</span>
            <span>•</span>
          </span>
        </div>
      )}
    </div>
  );
}
