import { useEffect, useRef, useState, useCallback } from 'react';
import { PageFlip } from 'page-flip';
import { playPageFlipSound } from '../utils/sound';

export interface PageInfo {
  n: number;
  image: string;
  imageJpg?: string;
  imageHigh?: string;
  webp?: string | null;
  avif?: string | null;
  thumb: string;
  w: number;
  h: number;
}

export interface ViewerHotspot {
  id: number;
  type: 'link' | 'video';
  x: number;
  y: number;
  w: number;
  h: number;
  payload: { url?: string; title?: string };
}

export interface ViewerSettings {
  background?: string;
  soundEnabled?: boolean;
  allowDownload?: boolean;
  brandText?: string;
}

interface ViewerProps {
  pages: PageInfo[];
  title?: string;
  slug?: string;
  settings?: ViewerSettings;
  hotspots?: Record<number, ViewerHotspot[]>;
}

export default function FlipbookViewer({
  pages,
  title,
  slug,
  settings = {},
  hotspots = {},
}: ViewerProps) {
  const host = useRef<HTMLDivElement>(null);
  const flip = useRef<PageFlip | null>(null);
  const [current, setCurrent] = useState(0);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<'portrait' | 'landscape'>('landscape');
  const [soundMuted, setSoundMuted] = useState(false);
  const [showThumbs, setShowThumbs] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeVideo, setActiveVideo] = useState<{ url: string; title: string } | null>(null);

  // Zoom & Pan state (available in both normal and fullscreen modes)
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDraggingState, setIsDraggingState] = useState(false);
  const [hdLoadedPages, setHdLoadedPages] = useState<Record<number, string>>({});
  const [bookBounds, setBookBounds] = useState<{ left: number; top: number; width: number; height: number; pageWidth: number } | null>(null);
  const preloadedSet = useRef<Set<number>>(new Set());
  const dragStart = useRef({ x: 0, y: 0, startPanX: 0, startPanY: 0 });

  const handleZoomChange = useCallback((newZoom: number) => {
    const clamped = Math.round(Math.min(2.5, Math.max(1, newZoom)) * 100) / 100;
    setZoom(clamped);
    if (clamped <= 1) {
      setPan({ x: 0, y: 0 });
    }
  }, []);

  // Progressive & Lazy Page Preloader: prioritize current spread ± 3 pages
  useEffect(() => {
    if (!pages.length) return;
    const windowIndices: number[] = [];
    for (let offset = 0; offset <= 4; offset++) {
      if (current + offset < pages.length) windowIndices.push(current + offset);
      if (offset > 0 && current - offset >= 0) windowIndices.push(current - offset);
    }
    windowIndices.forEach((idx) => {
      if (preloadedSet.current.has(idx)) return;
      preloadedSet.current.add(idx);
      const pg = pages[idx];
      if (!pg) return;
      const img = new Image();
      img.decoding = 'async';
      img.src = pg.image;
    });
  }, [current, pages]);

  // On-Demand High-Resolution Zoom Loader (loads 180-200 DPI assets only when zoom > 1.25)
  useEffect(() => {
    if (zoom <= 1.25 || !pages.length) return;
    const visibleIndices = [current];
    if (mode === 'landscape' && current > 0 && current + 1 < pages.length) {
      visibleIndices.push(current + 1);
    }
    visibleIndices.forEach((idx) => {
      const pg = pages[idx];
      const hdUrl = pg?.imageHigh || pg?.image;
      if (!pg || !hdUrl || hdLoadedPages[ pg.n ]) return;
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        setHdLoadedPages((prev) => ({ ...prev, [pg.n]: hdUrl }));
      };
      img.src = hdUrl;
    });
  }, [zoom, current, mode, pages, hdLoadedPages]);

  // Global mousemove/mouseup listeners when panning while zoomed in
  useEffect(() => {
    if (!isDraggingState || zoom <= 1) return;

    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      const maxPanX = Math.max(120, (window.innerWidth * (zoom - 1)) / 1.5);
      const maxPanY = Math.max(120, (window.innerHeight * (zoom - 1)) / 1.5);
      const nextX = Math.max(-maxPanX, Math.min(maxPanX, dragStart.current.startPanX + dx));
      const nextY = Math.max(-maxPanY, Math.min(maxPanY, dragStart.current.startPanY + dy));
      setPan({ x: nextX, y: nextY });
    };

    const onUp = () => {
      setIsDraggingState(false);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDraggingState, zoom]);

  const handleStageMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    if ((e.target as HTMLElement).closest('.reader-hotspot')) return;

    setIsDraggingState(true);
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      startPanX: pan.x,
      startPanY: pan.y,
    };
    e.preventDefault();
  };

  const handleStageDoubleClick = (e: React.MouseEvent) => {
    if (!isFullscreen) return;
    if ((e.target as HTMLElement).closest('.reader-hotspot') || (e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('input')) return;
    if (zoom > 1) {
      handleZoomChange(1);
    } else {
      handleZoomChange(1.8);
    }
  };

  const bg = settings.background || '#1e2026';
  const soundConfigEnabled = settings.soundEnabled ?? true;
  const isSoundActive = soundConfigEnabled && !soundMuted;

  const first = pages[0];
  const singleWidth = first?.w || 600;
  const singleHeight = first?.h || 800;
  const spreadAspect = (2 * singleWidth) / singleHeight;

  // Helper to accurately attach 3D book edge stacks, spine crease, and frame directly flush to the page bounds
  const updateBookPageStacks = useCallback((pageIdx: number, totalPages: number, orientation: string) => {
    if (!host.current || !flip.current) return;
    const parent = host.current.querySelector('.stf__parent') as HTMLElement | null;
    if (!parent) return;

    parent.style.overflow = 'visible';

    // 1. Left stacked pages
    let leftStack = parent.querySelector('.stf-page-stack-left') as HTMLElement | null;
    if (!leftStack) {
      leftStack = document.createElement('div');
      leftStack.className = 'stf-page-stack stf-page-stack-left';
      leftStack.innerHTML = '<div class="stf-stack-stepped top"></div><div class="stf-stack-stepped bottom"></div>';
      leftStack.addEventListener('click', (e) => {
        e.stopPropagation();
        flip.current?.flipPrev();
      });
      parent.appendChild(leftStack);
    }

    // 2. Right stacked pages
    let rightStack = parent.querySelector('.stf-page-stack-right') as HTMLElement | null;
    if (!rightStack) {
      rightStack = document.createElement('div');
      rightStack.className = 'stf-page-stack stf-page-stack-right';
      rightStack.innerHTML = '<div class="stf-stack-stepped top"></div><div class="stf-stack-stepped bottom"></div>';
      rightStack.addEventListener('click', (e) => {
        e.stopPropagation();
        flip.current?.flipNext();
      });
      parent.appendChild(rightStack);
    }

    // 3. Center spine crease shadow
    let spineCrease = parent.querySelector('.stf-spine-crease') as HTMLElement | null;
    if (!spineCrease) {
      spineCrease = document.createElement('div');
      spineCrease.className = 'stf-spine-crease';
      parent.appendChild(spineCrease);
    }

    // 4. Outer book frame with realistic 3D shadow and crisp border
    let bookFrame = parent.querySelector('.stf-book-frame') as HTMLElement | null;
    if (!bookFrame) {
      bookFrame = document.createElement('div');
      bookFrame.className = 'stf-book-frame';
      parent.appendChild(bookFrame);
    }

    let bounds: { left: number; top: number; width: number; height: number; pageWidth: number } | null = null;
    try {
      bounds = flip.current.getBoundsRect();
    } catch {
      // fallback
    }

    if (!bounds || bounds.width <= 0) {
      leftStack.style.display = 'none';
      rightStack.style.display = 'none';
      spineCrease.style.display = 'none';
      bookFrame.style.display = 'none';
      return;
    }

    const { left, top, width, height, pageWidth } = bounds;
    setBookBounds({ left, top, width, height, pageWidth });
    const hasLeftPages = pageIdx > 0;
    const hasRightPages = pageIdx < totalPages - 1;

    let leftEdge = left;
    let rightEdge = left + width;

    if (orientation === 'landscape' && pageIdx === 0) {
      leftEdge = left + pageWidth;
      rightEdge = left + width;
    } else if (orientation === 'landscape' && pageIdx >= totalPages - 1) {
      leftEdge = left;
      rightEdge = left + pageWidth;
    } else if (orientation === 'portrait') {
      leftEdge = left;
      rightEdge = left + pageWidth;
    }

    const spreadWidth = rightEdge - leftEdge;

    // Apply book frame
    if (spreadWidth > 0 && height > 0) {
      bookFrame.style.display = 'block';
      bookFrame.style.left = `${Math.round(leftEdge)}px`;
      bookFrame.style.top = `${Math.round(top)}px`;
      bookFrame.style.width = `${Math.round(spreadWidth)}px`;
      bookFrame.style.height = `${Math.round(height)}px`;
    } else {
      bookFrame.style.display = 'none';
    }

    // Center spine crease in landscape 2-page spread
    if (orientation === 'landscape' && pageIdx > 0 && pageIdx < totalPages - 1) {
      spineCrease.style.display = 'block';
      spineCrease.style.left = `${Math.round(left + pageWidth)}px`;
      spineCrease.style.top = `${Math.round(top)}px`;
      spineCrease.style.height = `${Math.round(height)}px`;
    } else {
      spineCrease.style.display = 'none';
    }

    if (orientation === 'portrait') {
      leftStack.style.display = 'none';
      if (hasRightPages) {
        const remaining = totalPages - (pageIdx + 1);
        const rightWidth = Math.min(14, Math.max(6, Math.round((remaining / totalPages) * 14)));
        rightStack.style.display = 'block';
        rightStack.style.left = `${Math.round(rightEdge)}px`;
        rightStack.style.right = 'auto';
        rightStack.style.top = `${Math.round(top)}px`;
        rightStack.style.height = `${Math.round(height)}px`;
        rightStack.style.width = `${rightWidth}px`;
        rightStack.title = `Next page (${remaining} pages remaining)`;
      } else {
        rightStack.style.display = 'none';
      }
    } else {
      // Two-page spread: flush to the actual page boundaries
      if (hasLeftPages) {
        const leftRatio = Math.min(1, pageIdx / totalPages);
        const leftWidth = Math.min(14, Math.max(5, Math.round(leftRatio * 14)));
        leftStack.style.display = 'block';
        leftStack.style.left = `${Math.round(leftEdge - leftWidth)}px`;
        leftStack.style.right = 'auto';
        leftStack.style.top = `${Math.round(top)}px`;
        leftStack.style.height = `${Math.round(height)}px`;
        leftStack.style.width = `${leftWidth}px`;
        leftStack.title = `Previous page (${pageIdx} pages on left)`;
      } else {
        leftStack.style.display = 'none';
      }

      if (hasRightPages) {
        const remaining = totalPages - (pageIdx + 1);
        const rightRatio = Math.min(1, remaining / totalPages);
        const rightWidth = Math.min(14, Math.max(5, Math.round(rightRatio * 14)));
        rightStack.style.display = 'block';
        rightStack.style.left = `${Math.round(rightEdge)}px`;
        rightStack.style.right = 'auto';
        rightStack.style.top = `${Math.round(top)}px`;
        rightStack.style.height = `${Math.round(height)}px`;
        rightStack.style.width = `${rightWidth}px`;
        rightStack.title = `Next page (${remaining} pages on right)`;
      } else {
        rightStack.style.display = 'none';
      }
    }
  }, []);

  // Initialize PageFlip
  const initFlip = useCallback(() => {
    if (!host.current || pages.length === 0) return;

    host.current.innerHTML = '';
    const container = document.createElement('div');
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.display = 'flex';
    container.style.justifyContent = 'center';
    container.style.alignItems = 'center';
    host.current.appendChild(container);

    const isMobile = window.innerWidth < 768;

    const pf = new PageFlip(container, {
      width: singleWidth,
      height: singleHeight,
      size: 'stretch',
      minWidth: 260,
      maxWidth: 2400,
      minHeight: 360,
      maxHeight: 1800,
      showCover: true,
      maxShadowOpacity: 0.6,
      mobileScrollSupport: false,
      usePortrait: isMobile,
      flippingTime: 700,
      useMouseEvents: true,
      swipeDistance: 30,
    });

    // Override StPageFlip's internal clear() so it never paints the background canvas white!
    const render = (pf as any).getRender?.();
    if (render) {
      render.clear = function () {
        if (this.ctx && this.canvas) {
          this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
      };
    }

    pf.loadFromImages(pages.map((p) => p.image));

    pf.on('flip', (e) => {
      const pageIdx = e.data as number;
      setCurrent(pageIdx);
      if (isSoundActive) {
        playPageFlipSound();
      }
      setPan({ x: 0, y: 0 });
      setTimeout(() => {
        updateBookPageStacks(pageIdx, pages.length, pf.getOrientation());
      }, 50);
      setTimeout(() => {
        updateBookPageStacks(pageIdx, pages.length, pf.getOrientation());
      }, 200);
    });

    pf.on('changeOrientation', (e) => {
      const o = e.data as 'portrait' | 'landscape';
      setMode(o);
      setTimeout(() => {
        updateBookPageStacks(pf.getCurrentPageIndex(), pages.length, o);
      }, 60);
    });

    pf.on('init', () => {
      setReady(true);
      const o = pf.getOrientation();
      setMode(o);
      setTimeout(() => {
        updateBookPageStacks(pf.getCurrentPageIndex(), pages.length, o);
      }, 100);
      setTimeout(() => {
        updateBookPageStacks(pf.getCurrentPageIndex(), pages.length, o);
      }, 300);
    });

    flip.current = pf;
  }, [pages, isSoundActive, updateBookPageStacks, singleWidth, singleHeight]);

  useEffect(() => {
    initFlip();

    const handleResize = () => {
      if (flip.current) {
        try {
          flip.current.update();
          updateBookPageStacks(flip.current.getCurrentPageIndex(), pages.length, flip.current.getOrientation());
        } catch {
          // ignore
        }
      }
    };

    const handleFullscreenChange = () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      if (!fs) {
        setZoom(1);
        setPan({ x: 0, y: 0 });
      }
      setTimeout(handleResize, 100);
      setTimeout(handleResize, 350);
    };

    window.addEventListener('resize', handleResize);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      if (flip.current) {
        try {
          flip.current.destroy();
        } catch {
          // cleanup
        }
      }
    };
  }, [initFlip, updateBookPageStacks, pages.length]);

  const goto = (i: number) => flip.current?.flip(i);
  const next = () => flip.current?.flipNext();
  const prev = () => flip.current?.flipPrev();

  const toggleFullscreen = () => {
    const el = host.current?.closest('.heyzine-viewer') as HTMLElement | null;
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      (el ?? host.current)?.requestFullscreen?.();
    }
  };

  const handleHotspotClick = (h: ViewerHotspot) => {
    if (h.type === 'video' && h.payload.url) {
      setActiveVideo({ url: h.payload.url, title: h.payload.title || 'Video' });
    } else if (h.payload.url) {
      window.open(h.payload.url, '_blank', 'noopener,noreferrer');
    }
  };

  const getEmbedUrl = (url: string) => {
    const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    if (ytMatch) {
      return `https://www.youtube-nocookie.com/embed/${ytMatch[1]}?autoplay=1`;
    }
    return url;
  };

  // Compute displayed page numbers (Heyzine style: e.g. "8 - 9 / 17" or "1 / 17")
  const total = pages.length;
  let pageDisplay = `${current + 1} / ${total}`;
  if (mode === 'landscape') {
    if (current === 0) {
      pageDisplay = `1 / ${total}`;
    } else if (current >= total - 1) {
      pageDisplay = `${total} / ${total}`;
    } else {
      pageDisplay = `${current + 1} - ${Math.min(current + 2, total)} / ${total}`;
    }
  }

  // Active hotspots on visible page(s)
  const leftPageNum = current + 1;
  const rightPageNum = mode === 'landscape' && current > 0 ? current + 2 : null;
  const activeHotspots = [
    ...(hotspots[leftPageNum] || []),
    ...(rightPageNum ? (hotspots[rightPageNum] || []) : []),
  ];

  return (
    <div
      className={`heyzine-viewer ${isFullscreen ? 'is-fullscreen' : ''}`}
      style={{
        background: bg,
        ['--spread-aspect' as any]: `${spreadAspect}`,
      }}
    >
      {/* Top Floating Header Bar */}
      <div className="hz-header">
        <div className="hz-title-wrap">
          <img src="/logo.png" alt="Nuvis Flipex" className="hz-header-logo" />
          {title && <span className="hz-book-title">{title}</span>}
          <span className="nuvis-brand-text hz-brand-badge-golden">
            {settings.brandText || 'Nuvis Flipex'}
          </span>
        </div>

        <div className="hz-top-actions">
          {soundConfigEnabled && (
            <button
              className="hz-icon-btn"
              onClick={() => setSoundMuted(!soundMuted)}
              title={soundMuted ? 'Turn Sound On' : 'Mute Sound'}
            >
              {soundMuted ? '🔇' : '🔊'}
            </button>
          )}

          {settings.allowDownload && slug && (
            <a
              href={`/api/v1/public/${slug}/download`}
              target="_blank"
              rel="noreferrer"
              className="hz-icon-btn"
              title="Download PDF"
            >
              📥
            </a>
          )}

          <button
            className="hz-icon-btn"
            onClick={() => setShowThumbs(!showThumbs)}
            title="Toggle Thumbnails"
          >
            📑
          </button>

          <button
            className="hz-icon-btn"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? '✕' : '⛶'}
          </button>
        </div>
      </div>

      {/* Main Reading Stage */}
      <div
        className="hz-stage"
        onMouseDown={handleStageMouseDown}
        onDoubleClick={handleStageDoubleClick}
        style={{
          cursor: zoom > 1 ? (isDraggingState ? 'grabbing' : 'grab') : 'default',
        }}
      >
        {/* Floating Side Flip Arrows */}
        <button
          className={`hz-side-arrow left ${current === 0 ? 'disabled' : ''}`}
          onClick={prev}
          title="Previous Page"
          disabled={current === 0}
        >
          ‹
        </button>

        <button
          className={`hz-side-arrow right ${current >= total - 1 ? 'disabled' : ''}`}
          onClick={next}
          title="Next Page"
          disabled={current >= total - 1}
        >
          ›
        </button>

        {!ready && (
          <div className="hz-loading-pill">
            <div className="hz-spinner" />
            <span>Loading publication…</span>
          </div>
        )}

        <div
          className="hz-canvas-wrap"
          style={{
            aspectRatio: mode === 'landscape' ? `${spreadAspect}` : `${singleWidth / singleHeight}`,
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
            transformOrigin: 'center center',
            transition: isDraggingState ? 'none' : 'transform 0.15s ease-out',
          }}
        >
          <div
            ref={host}
            className="hz-flip-host"
            style={{
              pointerEvents: zoom > 1 ? 'none' : 'auto',
            }}
          />

          {/* On-Demand High-Resolution Zoom Layer (Active when zoom > 1.25) */}
          {ready && zoom > 1.25 && bookBounds && (
            <div
              className="pointer-events-none absolute z-10 overflow-hidden"
              style={{
                left: `${Math.round(
                  mode === 'landscape' && current === 0
                    ? bookBounds.left + bookBounds.pageWidth
                    : bookBounds.left
                )}px`,
                top: `${Math.round(bookBounds.top)}px`,
                width: `${Math.round(
                  mode === 'portrait' ||
                    (mode === 'landscape' && (current === 0 || current >= total - 1))
                    ? bookBounds.pageWidth
                    : bookBounds.width
                )}px`,
                height: `${Math.round(bookBounds.height)}px`,
                display: 'flex',
              }}
            >
              {mode === 'portrait' || current === 0 || current >= total - 1 ? (
                pages[current] && hdLoadedPages[pages[current].n] ? (
                  <img
                    src={hdLoadedPages[pages[current].n]}
                    alt={`HD Page ${pages[current].n}`}
                    className="h-full w-full object-fill select-none"
                    draggable={false}
                  />
                ) : null
              ) : (
                <>
                  <div className="h-full w-1/2 overflow-hidden">
                    {pages[current] && hdLoadedPages[pages[current].n] && (
                      <img
                        src={hdLoadedPages[pages[current].n]}
                        alt={`HD Page ${pages[current].n}`}
                        className="h-full w-full object-fill select-none"
                        draggable={false}
                      />
                    )}
                  </div>
                  <div className="h-full w-1/2 overflow-hidden">
                    {pages[current + 1] && hdLoadedPages[pages[current + 1].n] && (
                      <img
                        src={hdLoadedPages[pages[current + 1].n]}
                        alt={`HD Page ${pages[current + 1].n}`}
                        className="h-full w-full object-fill select-none"
                        draggable={false}
                      />
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Interactive Hotspots Layer */}
          {ready && activeHotspots.length > 0 && (
            <div className="hz-hotspots-layer">
              {activeHotspots.map((h) => (
                <div
                  key={h.id}
                  className={`reader-hotspot ${h.type}`}
                  style={{
                    left: `${h.x}%`,
                    top: `${h.y}%`,
                    width: `${h.w}%`,
                    height: `${h.h}%`,
                  }}
                  onClick={() => handleHotspotClick(h)}
                  title={h.payload.title || (h.type === 'video' ? 'Watch Video' : 'Open Link')}
                >
                  <span className="hotspot-icon">{h.type === 'video' ? '▶' : '🔗'}</span>
                  {h.payload.title && <span className="hotspot-text">{h.payload.title}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Floating Navigation Pill */}
      <div className="hz-bottom-bar">
        <div className="hz-nav-pill">
          <button className="hz-pill-btn" onClick={prev} disabled={current === 0} title="Previous">‹</button>
          <span className="hz-pill-counter">{pageDisplay}</span>
          <button className="hz-pill-btn" onClick={next} disabled={current >= total - 1} title="Next">›</button>

          {/* Zoom Controls (Available in both Standard & Fullscreen Modes with On-Demand HD Zoom) */}
          <div className="hz-zoom-controls">
            <button
              className="hz-pill-btn hz-zoom-btn"
              onClick={() => handleZoomChange(zoom - 0.25)}
              disabled={zoom <= 1}
              title="Zoom Out"
            >
              −
            </button>
            <input
              type="range"
              className="hz-zoom-slider"
              min="1"
              max="2.5"
              step="0.05"
              value={zoom}
              onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
              title={`Zoom: ${Math.round(zoom * 100)}% (Drag to pan · High-Res HD activates > 125%)`}
            />
            <button
              className="hz-pill-btn hz-zoom-btn"
              onClick={() => handleZoomChange(zoom + 0.25)}
              disabled={zoom >= 2.5}
              title="Zoom In"
            >
              +
            </button>
            <button
              className="hz-pill-btn hz-zoom-label"
              onClick={() => handleZoomChange(1)}
              title="Reset zoom to 100%"
            >
              {Math.round(zoom * 100)}%{zoom > 1.25 ? ' HD' : ''}
            </button>
          </div>

          <button className="hz-pill-btn fs" onClick={toggleFullscreen} title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}>
            {isFullscreen ? '✕ Exit' : '⛶ Fullscreen'}
          </button>
        </div>
      </div>

      {/* Slide-Up Thumbnails Strip */}
      {showThumbs && (
        <div className="hz-thumbs-drawer">
          <div className="hz-thumbs-scroll">
            {pages.map((p, i) => (
              <div
                key={p.n}
                className={`hz-thumb-item ${i === current ? 'active' : ''}`}
                onClick={() => goto(i)}
              >
                <img src={p.thumb} alt={`Page ${p.n}`} loading="lazy" decoding="async" />
                <span className="hz-thumb-num">{p.n}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Video Modal Popup */}
      {activeVideo && (
        <div className="modal" onClick={() => setActiveVideo(null)}>
          <div className="card video-modal" onClick={(e) => e.stopPropagation()}>
            <div className="video-modal-header">
              <h3>{activeVideo.title}</h3>
              <button className="link" onClick={() => setActiveVideo(null)}>✕ Close</button>
            </div>
            <div className="video-frame-wrap">
              <iframe
                src={getEmbedUrl(activeVideo.url)}
                title={activeVideo.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
