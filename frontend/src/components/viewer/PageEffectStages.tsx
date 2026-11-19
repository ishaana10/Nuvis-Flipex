import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { PageInfo } from '../FlipbookViewer';

interface EffectStageProps {
  pages: PageInfo[];
  current: number;
  total: number;
  next: () => void;
  prev: () => void;
  goto: (idx: number) => void;
  fitWidth: number;
  fitHeight: number;
  zoom: number;
  crispImgStyle: React.CSSProperties;
  hdLoadedPages: Record<number, string>;
  mode?: 'portrait' | 'landscape';
  rightToLeft?: boolean;
}

/**
 * 1. Presentation Slider Stage
 * Sleek, touch-enabled horizontal sliding presentation deck (Heyzine style)
 */
export const SliderStage: React.FC<EffectStageProps> = ({
  pages,
  current,
  total,
  next,
  prev,
  goto,
  fitWidth,
  fitHeight,
  zoom,
  crispImgStyle,
  hdLoadedPages,
  mode = 'landscape',
}) => {
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const isLandscape = mode === 'landscape';

  const cardW = fitWidth > 0 ? (isLandscape ? fitWidth * 0.48 : fitWidth * 0.85) : 520;
  const cardH = fitHeight > 0 ? fitHeight * 0.92 : 720;

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (dx < -40) next();
    else if (dx > 40) prev();
    setTouchStartX(null);
  };

  return (
    <div
      className="hz-slider-stage"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
    >
      <div className="hz-slider-track" style={{ gap: '24px' }}>
        {isLandscape && current > 0 && current < total - 1 ? (
          // Landscape 2-page slide spread
          <div className="flex items-center gap-0 hz-slider-slide shadow-2xl">
            <div
              className="relative overflow-hidden bg-white"
              style={{ width: `${cardW}px`, height: `${cardH}px` }}
            >
              {pages[current] && (
                <img
                  src={hdLoadedPages[pages[current].n] || pages[current].imageHigh || pages[current].image}
                  alt={`Page ${pages[current].n}`}
                  className="h-full w-full object-fill select-none"
                  draggable={false}
                  style={crispImgStyle}
                />
              )}
            </div>
            <div
              className="relative overflow-hidden bg-white"
              style={{ width: `${cardW}px`, height: `${cardH}px` }}
            >
              {pages[current + 1] && (
                <img
                  src={hdLoadedPages[pages[current + 1].n] || pages[current + 1].imageHigh || pages[current + 1].image}
                  alt={`Page ${pages[current + 1].n}`}
                  className="h-full w-full object-fill select-none"
                  draggable={false}
                  style={crispImgStyle}
                />
              )}
            </div>
            {/* Soft presentation centerfold crease */}
            <div
              className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 w-8 z-10"
              style={{
                background:
                  'linear-gradient(to right, transparent, rgba(0,0,0,0.12) 48%, rgba(0,0,0,0.2) 50%, rgba(255,255,255,0.15) 52%, transparent)',
              }}
            />
          </div>
        ) : (
          // Single-page slide (Cover, Back Cover, or Portrait)
          <div
            className="hz-slider-slide shadow-2xl"
            style={{ width: `${cardW}px`, height: `${cardH}px` }}
          >
            {pages[current] && (
              <img
                src={hdLoadedPages[pages[current].n] || pages[current].imageHigh || pages[current].image}
                alt={`Page ${pages[current].n}`}
                className="h-full w-full object-fill select-none"
                draggable={false}
                style={crispImgStyle}
              />
            )}
          </div>
        )}
      </div>

      {/* Floating Bottom Slide Dots Scrubber */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/60 backdrop-blur-md rounded-full z-20">
        {pages.map((_, i) => (
          <button
            key={i}
            type="button"
            className={`w-2 h-2 rounded-full transition-all ${
              i === current ? 'w-5 bg-amber-400' : 'bg-white/40 hover:bg-white/70'
            }`}
            onClick={() => goto(i)}
            title={`Slide ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
};

/**
 * 2. 3D Card Stack Deck Stage
 * Tactile physical flashcard deck where cards peel & flip in 3D perspective
 */
export const CardsDeckStage: React.FC<EffectStageProps> = ({
  pages,
  current,
  total,
  next,
  prev,
  goto,
  fitWidth,
  fitHeight,
  zoom,
  crispImgStyle,
  hdLoadedPages,
}) => {
  const [turningDir, setTurningDir] = useState<'next' | 'prev' | null>(null);
  const cardW = fitWidth > 0 ? Math.min(fitWidth * 0.7, 560) : 480;
  const cardH = fitHeight > 0 ? Math.min(fitHeight * 0.88, 760) : 680;

  const handleNextCard = () => {
    if (current >= total - 1) return;
    setTurningDir('next');
    setTimeout(() => {
      next();
      setTurningDir(null);
    }, 280);
  };

  const handlePrevCard = () => {
    if (current <= 0) return;
    setTurningDir('prev');
    setTimeout(() => {
      prev();
      setTurningDir(null);
    }, 280);
  };

  return (
    <div
      className="hz-cards-stage"
      style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
    >
      <div className="hz-cards-stack" style={{ width: `${cardW}px`, height: `${cardH}px` }}>
        {/* Underneath Card 2 */}
        {current + 2 < total && (
          <div
            className="hz-card-item pointer-events-none"
            style={{
              width: `${cardW}px`,
              height: `${cardH}px`,
              transform: 'translate3d(0, 24px, -60px) scale(0.90)',
              opacity: 0.65,
              zIndex: 1,
            }}
          >
            <img
              src={hdLoadedPages[pages[current + 2].n] || pages[current + 2].image}
              alt=""
              className="h-full w-full object-fill opacity-90"
            />
          </div>
        )}

        {/* Underneath Card 1 */}
        {current + 1 < total && (
          <div
            className="hz-card-item pointer-events-none"
            style={{
              width: `${cardW}px`,
              height: `${cardH}px`,
              transform: 'translate3d(0, 12px, -30px) scale(0.95)',
              opacity: 0.85,
              zIndex: 2,
            }}
          >
            <img
              src={hdLoadedPages[pages[current + 1].n] || pages[current + 1].image}
              alt=""
              className="h-full w-full object-fill opacity-95"
            />
          </div>
        )}

        {/* Active Front Card */}
        {pages[current] && (
          <div
            className="hz-card-item cursor-pointer"
            onClick={handleNextCard}
            style={{
              width: `${cardW}px`,
              height: `${cardH}px`,
              transform:
                turningDir === 'next'
                  ? 'translate3d(140%, -10px, 40px) rotateZ(10deg) scale(0.95)'
                  : turningDir === 'prev'
                  ? 'translate3d(-140%, -10px, 40px) rotateZ(-10deg) scale(0.95)'
                  : 'translate3d(0, 0, 0) scale(1)',
              opacity: turningDir ? 0.2 : 1,
              zIndex: 10,
            }}
          >
            <img
              src={hdLoadedPages[pages[current].n] || pages[current].imageHigh || pages[current].image}
              alt={`Card ${pages[current].n}`}
              className="h-full w-full object-fill select-none"
              draggable={false}
              style={crispImgStyle}
            />
            {/* Subtle card sheen */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-black/10 via-transparent to-white/20" />
          </div>
        )}
      </div>

      {/* Card Deck Controls Pill */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2 bg-slate-900/80 backdrop-blur-md rounded-full shadow-xl border border-white/10 z-30">
        <button
          type="button"
          disabled={current === 0}
          onClick={handlePrevCard}
          className="text-xs font-bold text-white/80 hover:text-white disabled:opacity-40 px-2 py-1"
        >
          ‹ Previous
        </button>
        <span className="text-xs font-mono font-medium text-amber-400">
          {current + 1} / {total}
        </span>
        <button
          type="button"
          disabled={current >= total - 1}
          onClick={handleNextCard}
          className="text-xs font-bold text-white/80 hover:text-white disabled:opacity-40 px-2 py-1"
        >
          Next ›
        </button>
      </div>
    </div>
  );
};

/**
 * 3. 3D Coverflow Carousel Stage
 * Authentic 3D Coverflow carousel with angled perspective cards and specular floor reflections
 */
export const CoverflowStage: React.FC<EffectStageProps> = ({
  pages,
  current,
  total,
  next,
  prev,
  goto,
  fitWidth,
  fitHeight,
  zoom,
  crispImgStyle,
  hdLoadedPages,
}) => {
  const cardW = fitWidth > 0 ? Math.min(fitWidth * 0.44, 460) : 380;
  const cardH = fitHeight > 0 ? Math.min(fitHeight * 0.78, 620) : 540;

  // Render a window of items around the current index
  const renderRange = 4;
  const minIdx = Math.max(0, current - renderRange);
  const maxIdx = Math.min(total - 1, current + renderRange);
  const visiblePages: number[] = [];
  for (let i = minIdx; i <= maxIdx; i++) {
    visiblePages.push(i);
  }

  return (
    <div
      className="hz-coverflow-stage"
      style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
    >
      <div className="hz-coverflow-track" style={{ width: `${cardW}px`, height: `${cardH}px` }}>
        {visiblePages.map((pageIdx) => {
          const diff = pageIdx - current;
          const isActive = diff === 0;
          const absDiff = Math.abs(diff);

          // 3D positioning
          let transX = 0;
          let transZ = 0;
          let rotY = 0;
          let zIndex = 50 - absDiff * 5;
          let opacity = 1;

          if (diff < 0) {
            // Angled to the left
            rotY = 46;
            transX = diff * (cardW * 0.38) - 40;
            transZ = -absDiff * 80 - 40;
            opacity = Math.max(0.3, 1 - absDiff * 0.18);
          } else if (diff > 0) {
            // Angled to the right
            rotY = -46;
            transX = diff * (cardW * 0.38) + 40;
            transZ = -absDiff * 80 - 40;
            opacity = Math.max(0.3, 1 - absDiff * 0.18);
          } else {
            // Active center
            rotY = 0;
            transX = 0;
            transZ = 70;
            zIndex = 100;
          }

          const page = pages[pageIdx];
          if (!page) return null;

          return (
            <div
              key={page.n}
              className={`hz-coverflow-item ${isActive ? 'is-active' : ''}`}
              onClick={() => {
                if (!isActive) goto(pageIdx);
              }}
              style={{
                width: `${cardW}px`,
                height: `${cardH}px`,
                transform: `translateX(${transX}px) translateZ(${transZ}px) rotateY(${rotY}deg)`,
                opacity,
                zIndex,
              }}
            >
              <img
                src={hdLoadedPages[page.n] || page.imageHigh || page.image}
                alt={`Page ${page.n}`}
                className="h-full w-full object-fill select-none"
                draggable={false}
                style={crispImgStyle}
              />
              {/* Darkening gradient over side items */}
              {!isActive && (
                <div
                  className="pointer-events-none absolute inset-0 bg-black"
                  style={{ opacity: Math.min(0.55, absDiff * 0.16) }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Floating Scrubber Slider Bar */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-5 py-2.5 bg-slate-900/80 backdrop-blur-md rounded-full shadow-2xl border border-white/10 z-30">
        <button
          type="button"
          disabled={current === 0}
          onClick={prev}
          className="text-amber-400 hover:text-amber-300 disabled:opacity-30 font-bold text-sm px-1.5"
          title="Previous (←)"
        >
          ‹
        </button>
        <input
          type="range"
          min={0}
          max={total - 1}
          value={current}
          onChange={(e) => goto(Number(e.target.value))}
          className="w-36 accent-amber-400 cursor-pointer h-1.5 bg-slate-700 rounded-lg"
        />
        <span className="text-xs font-mono font-bold text-white min-w-[50px] text-center">
          {current + 1} / {total}
        </span>
        <button
          type="button"
          disabled={current >= total - 1}
          onClick={next}
          className="text-amber-400 hover:text-amber-300 disabled:opacity-30 font-bold text-sm px-1.5"
          title="Next (→)"
        >
          ›
        </button>
      </div>
    </div>
  );
};
