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
  width?: number;
  height?: number;
  text?: string;
}

export interface TocItem {
  title: string;
  page: number;
  level?: number;
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
  backgroundType?: 'image' | 'color' | 'style';
  backgroundImage?: string;
  backgroundStyle?: string;
  themePreset?: string;
  defaultReadingMode?: 'flip' | 'scroll' | 'reader';
  pageEffect?: 'magazine' | 'book' | 'album' | 'notebook' | 'slider' | 'cards' | 'coverflow' | 'one_page';
  soundEnabled?: boolean;
  horizontalTurn?: boolean;
  rightToLeft?: boolean;
  allowDownload?: boolean;
  brandText?: string;
  customLogoUrl?: string;
  companyName?: string;
  catalogueSubtitle?: string;
  disclaimerTitle?: string;
  disclaimerText?: string;
  showDisclaimer?: boolean;
  showPoweredBy?: boolean;
  showToolbar?: boolean;
  showThumbnailsButton?: boolean;
  showSearchButton?: boolean;
  showShareButton?: boolean;
  showFullscreenButton?: boolean;
  bgAudioUrl?: string;
  bgAudioAutoplay?: boolean;
  bgAudioLoop?: boolean;
}

interface ViewerProps {
  pages: PageInfo[];
  title?: string;
  description?: string;
  tenantName?: string;
  slug?: string;
  settings?: ViewerSettings;
  hotspots?: Record<number, ViewerHotspot[]>;
  toc?: TocItem[];
  initialPage?: number;
  enableTelemetry?: boolean;
  sessionId?: string;
  utmParams?: Record<string, string>;
}

const VIEWER_THEMES: Record<string, { name: string; bg: string; barBg: string; text: string }> = {
  white: { name: 'Clean White', bg: '#ffffff', barBg: 'rgba(15, 23, 42, 0.88)', text: '#0f172a' },
  obsidian: { name: 'Obsidian Gold', bg: '#18191c', barBg: 'rgba(15, 23, 42, 0.88)', text: '#f8fafc' },
  midnight: { name: 'Midnight Slate', bg: '#0f172a', barBg: 'rgba(2, 6, 23, 0.9)', text: '#f8fafc' },
  cream: { name: 'Warm Ivory', bg: '#f6f3ec', barBg: 'rgba(28, 25, 23, 0.86)', text: '#1c1917' },
  light: { name: 'Studio Light', bg: '#e2e8f0', barBg: 'rgba(15, 23, 42, 0.85)', text: '#0f172a' },
  forest: { name: 'Forest Executive', bg: '#112218', barBg: 'rgba(10, 22, 15, 0.9)', text: '#ecfdf5' },
};

export default function FlipbookViewer({
  pages,
  title,
  description,
  tenantName,
  slug,
  settings = {},
  hotspots = {},
  toc = [],
  initialPage,
  enableTelemetry = false,
  sessionId = '',
  utmParams = {},
}: ViewerProps) {
  const storageKey = slug || title || 'default_book';
  const lastPageStorageKey = `flipex_last_page_${storageKey}`;
  const bookmarksStorageKey = `flipex_bookmarks_${storageKey}`;
  const offlineStorageKey = `flipex_offline_${storageKey}`;

  const host = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const flip = useRef<PageFlip | null>(null);

  // Reading mode: 'flip' (3D Page-Turn), 'scroll' (Continuous Vertical Scroll), 'reader' (Accessible Screen-Reader Text)
  const [readingMode, setReadingMode] = useState<'flip' | 'scroll' | 'reader'>(
    settings.defaultReadingMode || 'flip'
  );
  const [current, setCurrent] = useState<number>(() => {
    if (initialPage && initialPage >= 1 && initialPage <= pages.length) {
      return initialPage - 1;
    }
    try {
      const saved = Number(localStorage.getItem(lastPageStorageKey));
      if (!isNaN(saved) && saved >= 0 && saved < pages.length) {
        return saved;
      }
    } catch {
      // ignore
    }
    return 0;
  });

  const [resumedBanner, setResumedBanner] = useState<number | null>(() => {
    if (initialPage && initialPage > 1) return null;
    try {
      const saved = Number(localStorage.getItem(lastPageStorageKey));
      if (!isNaN(saved) && saved > 0 && saved < pages.length) {
        return saved + 1;
      }
    } catch {
      // ignore
    }
    return null;
  });

  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<'portrait' | 'landscape'>('landscape');
  const [soundMuted, setSoundMuted] = useState(false);

  // Drawers & Modals
  const [showThumbs, setShowThumbs] = useState(false);
  const [showToc, setShowToc] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ page: number; snippet: string }>>([]);

  // Bookmarks state
  const [bookmarks, setBookmarks] = useState<number[]>(() => {
    try {
      const raw = localStorage.getItem(bookmarksStorageKey);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  // Offline caching state
  const [offlineSaved, setOfflineSaved] = useState<boolean>(() => {
    try {
      return localStorage.getItem(offlineStorageKey) === '1';
    } catch {
      return false;
    }
  });
  const [cachingOffline, setCachingOffline] = useState(false);

  // Share state
  const [shareSpecificPage, setShareSpecificPage] = useState(true);
  const [copiedShareLink, setCopiedShareLink] = useState(false);

  // Accessible reader font size
  const [readerFontSize, setReaderFontSize] = useState(17);

  // Theme override state
  const [activeBg, setActiveBg] = useState<string>(settings.background || '#1e2026');

  useEffect(() => {
    if (settings.background) setActiveBg(settings.background);
  }, [settings.background]);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeVideo, setActiveVideo] = useState<{ url: string; title: string } | null>(null);

  // Zoom & Pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDraggingState, setIsDraggingState] = useState(false);
  const [hdLoadedPages, setHdLoadedPages] = useState<Record<number, string>>({});
  const [bookBounds, setBookBounds] = useState<{ left: number; top: number; width: number; height: number; pageWidth: number } | null>(null);
  const preloadedSet = useRef<Set<number>>(new Set());
  const dragStart = useRef({ x: 0, y: 0, startPanX: 0, startPanY: 0 });
  const pinchStartDist = useRef<number | null>(null);
  const pinchStartZoom = useRef<number>(1);
  const pageEnterTimestamp = useRef<number>(Date.now());

  // Send telemetry helper
  const sendTelemetry = useCallback(
    (eventType: string, payload: Record<string, any> = {}) => {
      if (!enableTelemetry || !slug) return;
      fetch(`/api/v1/public/${slug}/telemetry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          eventType,
          utmSource: utmParams.utm_source || undefined,
          utmMedium: utmParams.utm_medium || undefined,
          utmCampaign: utmParams.utm_campaign || undefined,
          ...payload,
        }),
      }).catch(() => {});
    },
    [enableTelemetry, slug, sessionId, utmParams]
  );

  // Persist last-read page and send dwell-time telemetry on page change
  useEffect(() => {
    try {
      localStorage.setItem(lastPageStorageKey, String(current));
    } catch {
      // ignore
    }

    const now = Date.now();
    const dwellMs = now - pageEnterTimestamp.current;
    pageEnterTimestamp.current = now;

    if (dwellMs >= 800) {
      sendTelemetry('page_view', {
        pageNumber: current + 1,
        durationMs: Math.min(dwellMs, 300000),
      });
    }
  }, [current, lastPageStorageKey, sendTelemetry]);

  const handleZoomChange = useCallback((newZoom: number) => {
    const clamped = Math.round(Math.min(2.5, Math.max(1, newZoom)) * 100) / 100;
    setZoom(clamped);
    if (clamped <= 1) {
      setPan({ x: 0, y: 0 });
    }
  }, []);

  // Progressive & Lazy Multi-Resolution Page Preloader with Memory Virtualization
  useEffect(() => {
    if (!pages.length) return;

    // Active spread + next/prev window indices (eager preload with async decoding)
    const windowIndices: number[] = [];
    for (let offset = 0; offset <= 3; offset++) {
      if (current + offset < pages.length) windowIndices.push(current + offset);
      if (offset > 0 && current - offset >= 0) windowIndices.push(current - offset);
    }

    // 1. Browser background decoding for near pages
    windowIndices.forEach((idx) => {
      if (preloadedSet.current.has(idx)) return;
      preloadedSet.current.add(idx);
      const pg = pages[idx];
      if (!pg) return;
      const img = new Image();
      img.decoding = 'async';
      if (idx === current || idx === current + 1) {
        (img as any).fetchPriority = 'high';
      }
      img.src = pg.image;
    });

    // 2. Flipbook PageFlip canvas promotion & memory release
    try {
      const pf = flip.current;
      if (pf) {
        const coll = (pf as any).getPageCollection?.();
        const pageObjs = coll?.getPages?.();
        if (pageObjs && pageObjs.length) {
          // Promote pages in active window to standard crisp resolution
          windowIndices.forEach((idx) => {
            const pageObj = pageObjs[idx];
            const pg = pages[idx];
            if (pageObj && pg && pageObj.image && pageObj.image.src !== pg.image) {
              const stdImg = new Image();
              stdImg.decoding = 'async';
              stdImg.onload = () => {
                pageObj.image = stdImg;
                pageObj.isLoad = true;
                (pf as any).getRender?.()?.update?.();
              };
              stdImg.src = pg.image;
            }
          });

          // Memory Release: For long publications (> 12 pages), release distant decoded canvases to avoid mobile GPU exhaustion
          if (pages.length > 12) {
            for (let i = 0; i < pages.length; i++) {
              if (Math.abs(i - current) > 8) {
                const distantObj = pageObjs[i];
                const pg = pages[i];
                if (distantObj && pg && pg.thumb && distantObj.image && distantObj.image.src !== pg.thumb) {
                  const tImg = new Image();
                  tImg.decoding = 'async';
                  tImg.src = pg.thumb;
                  distantObj.image = tImg;
                }
              }
            }
          }
        }
      }
    } catch {
      // Non-fatal optimization
    }
  }, [current, pages]);

  // On-Demand High-Resolution Zoom Loader (loads 180 DPI assets only when zoom > 1.25)
  useEffect(() => {
    if (zoom <= 1.25 || !pages.length) return;
    const visibleIndices = [current];
    if (mode === 'landscape' && current > 0 && current + 1 < pages.length) {
      visibleIndices.push(current + 1);
    }
    visibleIndices.forEach((idx) => {
      const pg = pages[idx];
      const hdUrl = pg?.imageHigh || pg?.image;
      if (!pg || !hdUrl || hdLoadedPages[pg.n]) return;
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
    if (zoom <= 1 || readingMode !== 'flip') return;
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

  // Mobile Two-Finger Pinch-to-Zoom Gestures
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDist.current = Math.hypot(dx, dy);
      pinchStartZoom.current = zoom;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchStartDist.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const scaleRatio = dist / Math.max(1, pinchStartDist.current);
      handleZoomChange(pinchStartZoom.current * scaleRatio);
    }
  };

  const handleTouchEnd = () => {
    pinchStartDist.current = null;
  };

  const handleStageDoubleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.reader-hotspot') || (e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('input')) return;
    if (zoom > 1) {
      handleZoomChange(1);
    } else {
      handleZoomChange(1.75);
    }
  };

  const soundConfigEnabled = settings.soundEnabled ?? true;
  const isSoundActive = soundConfigEnabled && !soundMuted;

  const first = pages[0];
  const singleWidth = first?.w || 600;
  const singleHeight = first?.h || 800;
  const spreadAspect = (2 * singleWidth) / singleHeight;

  // Compute Automatic Table of Contents fallback if none provided
  const effectiveToc: TocItem[] =
    toc && toc.length > 0
      ? toc
      : pages.map((p) => {
          const firstLine = (p.text || '')
            .split('\n')
            .map((l) => l.trim())
            .find((l) => l.length >= 4 && l.length <= 65);
          return {
            title: firstLine ? `Page ${p.n}: ${firstLine}` : `Page ${p.n}`,
            page: p.n,
            level: 1,
          };
        });

  const updateBookPageStacks = useCallback((pageIdx: number, totalPages: number, orientation: string) => {
    if (!host.current || !flip.current) return;
    const parent = host.current.querySelector('.stf__parent') as HTMLElement | null;
    if (!parent) return;

    parent.style.overflow = 'visible';

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

    let spineCrease = parent.querySelector('.stf-spine-crease') as HTMLElement | null;
    if (!spineCrease) {
      spineCrease = document.createElement('div');
      spineCrease.className = 'stf-spine-crease';
      parent.appendChild(spineCrease);
    }

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

    const isBackSingle = orientation === 'landscape' && totalPages > 1 && pageIdx >= totalPages - 1 && totalPages % 2 === 0;

    if (orientation === 'landscape' && pageIdx === 0) {
      leftEdge = left + pageWidth;
      rightEdge = left + width;
    } else if (isBackSingle) {
      leftEdge = left;
      rightEdge = left + pageWidth;
    } else if (orientation === 'portrait') {
      leftEdge = left;
      rightEdge = left + pageWidth;
    }

    const spreadWidth = rightEdge - leftEdge;

    if (spreadWidth > 0 && height > 0) {
      bookFrame.style.display = 'block';
      bookFrame.style.left = `${Math.round(leftEdge)}px`;
      bookFrame.style.top = `${Math.round(top)}px`;
      bookFrame.style.width = `${Math.round(spreadWidth)}px`;
      bookFrame.style.height = `${Math.round(height)}px`;
    } else {
      bookFrame.style.display = 'none';
    }

    if (orientation === 'landscape') {
      spineCrease.style.display = 'block';
      spineCrease.style.left = `${Math.round(left + pageWidth)}px`;
      spineCrease.style.top = `${Math.round(top)}px`;
      spineCrease.style.height = `${Math.round(height)}px`;
      spineCrease.classList.remove('is-cover', 'is-back-cover');
      if (pageIdx === 0) {
        spineCrease.classList.add('is-cover');
      } else if (isBackSingle) {
        spineCrease.classList.add('is-back-cover');
      }
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
      } else {
        rightStack.style.display = 'none';
      }
    } else {
      if (hasLeftPages) {
        const leftRatio = Math.min(1, pageIdx / totalPages);
        const leftWidth = Math.min(14, Math.max(5, Math.round(leftRatio * 14)));
        leftStack.style.display = 'block';
        leftStack.style.left = `${Math.round(leftEdge - leftWidth)}px`;
        leftStack.style.right = 'auto';
        leftStack.style.top = `${Math.round(top)}px`;
        leftStack.style.height = `${Math.round(height)}px`;
        leftStack.style.width = `${leftWidth}px`;
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
      } else {
        rightStack.style.display = 'none';
      }
    }
  }, []);

  // Initialize 3D PageFlip when in 'flip' mode
  const initFlip = useCallback(() => {
    if (readingMode !== 'flip' || !host.current || pages.length === 0) return;

    host.current.innerHTML = '';
    const container = document.createElement('div');
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.display = 'flex';
    container.style.justifyContent = 'center';
    container.style.alignItems = 'center';
    host.current.appendChild(container);

    const isMobilePortrait = window.innerWidth < 768 && window.innerWidth < window.innerHeight;
    const isExplicitSinglePage = ['one_page', 'slider', 'cards', 'coverflow'].includes(
      settings.pageEffect || ''
    );
    const isHardCoverEffect = ['book', 'album', 'notebook'].includes(settings.pageEffect || 'magazine');
    const shouldUsePortrait = isExplicitSinglePage || isMobilePortrait;

    const pf = new PageFlip(container, {
      width: singleWidth,
      height: singleHeight,
      size: 'stretch',
      minWidth: 200,
      maxWidth: 2400,
      minHeight: 260,
      maxHeight: 1800,
      showCover: !isExplicitSinglePage,
      maxShadowOpacity: isHardCoverEffect ? 0.8 : 0.6,
      mobileScrollSupport: false,
      usePortrait: shouldUsePortrait,
      flippingTime: isHardCoverEffect ? 850 : 700,
      useMouseEvents: true,
      swipeDistance: 24,
      startPage: current,
    });

    // Multi-resolution progressive initial loader:
    // Active spreads load standard reading URLs immediately; distant pages on long publications load lightweight thumbnail placeholders (~15KB)
    const initialUrls = pages.map((p, idx) => {
      if (pages.length <= 8 || Math.abs(idx - current) <= 2) {
        return p.image;
      }
      return p.thumb || p.image;
    });

    pf.loadFromImages(initialUrls);

    // Patch CanvasRenderer after loadFromImages creates `pf.render` so transparent background is preserved
    // and the bound magazine spine crease is drawn on the cover's left binding edge as well as open spreads.
    const render = (pf as any).getRender?.();
    if (render) {
      render.clear = function () {
        if (this.ctx && this.canvas) {
          this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
      };
      const origDrawBookShadow = render.drawBookShadow?.bind(render);
      if (origDrawBookShadow) {
        render.drawBookShadow = function () {
          if ((this.leftPage && this.rightPage) || this.flippingPage) {
            origDrawBookShadow();
          } else if (this.rightPage && !this.leftPage && this.ctx) {
            // Closed Front Cover: draw realistic magazine binding hinge & spine groove along the left edge of the cover
            const t = this.getRect();
            const spineW = Math.max(18, t.pageWidth / 22);
            const startX = t.left + t.pageWidth;
            this.ctx.save();
            this.ctx.beginPath();
            this.ctx.rect(startX, t.top, spineW, t.height);
            this.ctx.clip();
            const grad = this.ctx.createLinearGradient(startX, 0, startX + spineW, 0);
            grad.addColorStop(0, 'rgba(0, 0, 0, 0.34)');
            grad.addColorStop(0.14, 'rgba(0, 0, 0, 0.14)');
            grad.addColorStop(0.26, 'rgba(255, 255, 255, 0.32)');
            grad.addColorStop(0.42, 'rgba(0, 0, 0, 0.11)');
            grad.addColorStop(0.65, 'rgba(0, 0, 0, 0.03)');
            grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            this.ctx.fillStyle = grad;
            this.ctx.fillRect(startX, t.top, spineW, t.height);
            this.ctx.restore();
          } else if (this.leftPage && !this.rightPage && this.ctx) {
            // Closed Back Cover: draw realistic magazine binding hinge & spine groove along the right edge of the back cover
            const t = this.getRect();
            const spineW = Math.max(18, t.pageWidth / 22);
            const endX = t.left + t.pageWidth;
            const startX = endX - spineW;
            this.ctx.save();
            this.ctx.beginPath();
            this.ctx.rect(startX, t.top, spineW, t.height);
            this.ctx.clip();
            const grad = this.ctx.createLinearGradient(startX, 0, endX, 0);
            grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
            grad.addColorStop(0.35, 'rgba(0, 0, 0, 0.03)');
            grad.addColorStop(0.58, 'rgba(0, 0, 0, 0.11)');
            grad.addColorStop(0.74, 'rgba(255, 255, 255, 0.32)');
            grad.addColorStop(0.86, 'rgba(0, 0, 0, 0.14)');
            grad.addColorStop(1, 'rgba(0, 0, 0, 0.34)');
            this.ctx.fillStyle = grad;
            this.ctx.fillRect(startX, t.top, spineW, t.height);
            this.ctx.restore();
          }
        };
      }
    }

    pf.on('flip', (e) => {
      const pageIdx = e.data as number;
      setCurrent(pageIdx);
      setResumedBanner(null);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages, readingMode, isSoundActive, updateBookPageStacks, singleWidth, singleHeight, settings.pageEffect]);

  useEffect(() => {
    if (readingMode !== 'flip') {
      setReady(true);
      return;
    }
    initFlip();

    let lastPortraitState = window.innerWidth < 768 && window.innerWidth < window.innerHeight;

    const handleResize = () => {
      const nowPortrait = window.innerWidth < 768 && window.innerWidth < window.innerHeight;
      if (nowPortrait !== lastPortraitState) {
        lastPortraitState = nowPortrait;
        if (flip.current) {
          try {
            flip.current.destroy();
            flip.current = null;
          } catch {
            // ignore
          }
        }
        initFlip();
        return;
      }
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
    window.addEventListener('orientationchange', handleResize);
    (screen.orientation as any)?.addEventListener?.('change', handleResize);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      (screen.orientation as any)?.removeEventListener?.('change', handleResize);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      if (flip.current) {
        try {
          flip.current.destroy();
          flip.current = null;
        } catch {
          // cleanup
        }
      }
    };
  }, [initFlip, readingMode, updateBookPageStacks, pages.length]);

  const goto = useCallback(
    (i: number) => {
      const target = Math.max(0, Math.min(pages.length - 1, i));
      setCurrent(target);
      setResumedBanner(null);
      if (readingMode === 'flip' && flip.current) {
        try {
          flip.current.flip(target);
        } catch {
          // fallback
        }
      } else if (readingMode === 'scroll' || readingMode === 'reader') {
        const el = document.getElementById(`flipex-scroll-page-${target + 1}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    },
    [pages.length, readingMode]
  );

  const next = useCallback(() => {
    if (readingMode === 'flip' && flip.current) {
      flip.current.flipNext();
    } else {
      goto(current + 1);
    }
  }, [readingMode, goto, current]);

  const prev = useCallback(() => {
    if (readingMode === 'flip' && flip.current) {
      flip.current.flipPrev();
    } else {
      goto(current - 1);
    }
  }, [readingMode, goto, current]);

  const toggleBookmark = useCallback(
    (pageNum = current + 1) => {
      setBookmarks((prevBms) => {
        const nextBms = prevBms.includes(pageNum)
          ? prevBms.filter((p) => p !== pageNum)
          : [...prevBms, pageNum].sort((a, b) => a - b);
        try {
          localStorage.setItem(bookmarksStorageKey, JSON.stringify(nextBms));
        } catch {
          // ignore
        }
        return nextBms;
      });
    },
    [current, bookmarksStorageKey]
  );

  const toggleFullscreen = useCallback(async () => {
    const el = (document.querySelector('.heyzine-viewer') || document.documentElement) as HTMLElement | null;
    try {
      if (document.fullscreenElement) {
        if ((screen.orientation as any)?.unlock) {
          try {
            (screen.orientation as any).unlock();
          } catch {
            // ignore
          }
        }
        await document.exitFullscreen?.();
      } else {
        await el?.requestFullscreen?.();
        // On mobile devices, automatically lock to landscape full mode when entering fullscreen
        if (window.innerWidth <= 920 && (screen.orientation as any)?.lock) {
          try {
            await (screen.orientation as any).lock('landscape');
          } catch {
            // ignore on browsers that do not support orientation lock
          }
        }
      }
    } catch {
      // ignore fullscreen errors
    }
  }, []);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        prev();
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        handleZoomChange(zoom + 0.25);
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        handleZoomChange(zoom - 0.25);
      } else if (e.key === '0') {
        e.preventDefault();
        handleZoomChange(1);
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === '/') {
        e.preventDefault();
        setShowSearch((s) => !s);
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        setShowToc((s) => !s);
      } else if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        toggleBookmark(current + 1);
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        setReadingMode((m) => (m === 'flip' ? 'scroll' : m === 'scroll' ? 'reader' : 'flip'));
      } else if (e.key === '?') {
        e.preventDefault();
        setShowShortcutsModal((s) => !s);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [next, prev, zoom, handleZoomChange, toggleFullscreen, toggleBookmark, current]);

  // Execute full-text search across pages
  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }

    const localMatches: Array<{ page: number; snippet: string }> = [];
    pages.forEach((p) => {
      const txt = p.text || '';
      const idx = txt.toLowerCase().indexOf(q);
      if (idx !== -1) {
        const start = Math.max(0, idx - 45);
        let snippet = txt.slice(start, start + 130);
        if (start > 0) snippet = '…' + snippet;
        if (start + 130 < txt.length) snippet += '…';
        localMatches.push({ page: p.n, snippet });
      }
    });

    if (localMatches.length > 0) {
      setSearchResults(localMatches);
      sendTelemetry('search', { meta: { query: q, count: localMatches.length } });
    } else if (slug) {
      fetch(`/api/v1/public/${slug}/search?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : { results: [] }))
        .then((d) => {
          setSearchResults(d.results || []);
          sendTelemetry('search', { meta: { query: q, count: (d.results || []).length } });
        })
        .catch(() => {});
    }
  }, [searchQuery, pages, slug, sendTelemetry]);

  // Save publication for Offline Reading using CacheStorage API
  const handleSaveOffline = async () => {
    if (cachingOffline) return;
    setCachingOffline(true);
    try {
      if ('caches' in window) {
        const cache = await caches.open('nuvis-flipex-offline-v1');
        const urlsToCache = pages.flatMap((p) => [p.image, p.thumb].filter(Boolean));
        await Promise.allSettled(urlsToCache.map((u) => cache.add(u)));
      }
      localStorage.setItem(offlineStorageKey, '1');
      setOfflineSaved(true);
    } catch {
      // fallback
    } finally {
      setCachingOffline(false);
    }
  };

  const handleHotspotClick = (h: ViewerHotspot, pageNum?: number) => {
    if (h.type === 'video' && h.payload.url) {
      sendTelemetry('video_play', { pageNumber: pageNum || current + 1, targetUrl: h.payload.url });
      setActiveVideo({ url: h.payload.url, title: h.payload.title || 'Video' });
    } else if (h.payload.url) {
      sendTelemetry('link_click', { pageNumber: pageNum || current + 1, targetUrl: h.payload.url });
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

  const total = pages.length;
  let pageDisplay = `${current + 1} / ${total}`;
  if (readingMode === 'flip' && mode === 'landscape') {
    if (current === 0) {
      pageDisplay = `1 / ${total}`;
    } else if (current >= total - 1) {
      pageDisplay = `${total} / ${total}`;
    } else {
      pageDisplay = `${current + 1} - ${Math.min(current + 2, total)} / ${total}`;
    }
  }

  const leftPageNum = current + 1;
  const rightPageNum = readingMode === 'flip' && mode === 'landscape' && current > 0 ? current + 2 : null;
  const activeHotspots = [
    ...(hotspots[leftPageNum] || []),
    ...(rightPageNum ? (hotspots[rightPageNum] || []) : []),
  ];

  const isCurrentBookmarked = bookmarks.includes(current + 1);
  const baseShareUrl = slug ? `${window.location.origin}/v/${slug}` : window.location.href.split('?')[0];
  const computedShareUrl = shareSpecificPage ? `${baseShareUrl}?page=${current + 1}` : baseShareUrl;

  return (
    <div
      className={`heyzine-viewer effect-${settings.pageEffect || 'magazine'} ${isFullscreen ? 'is-fullscreen' : ''}`}
      dir={settings.rightToLeft ? 'rtl' : 'ltr'}
      style={{
        background: settings.backgroundImage ? settings.backgroundImage : activeBg,
        backgroundSize:
          settings.backgroundImage?.includes('1.5px') ? '18px 18px' : 'cover',
        backgroundPosition: 'center center',
        ['--spread-aspect' as any]: `${spreadAspect}`,
      }}
    >
      {settings.bgAudioUrl && (
        <audio
          src={settings.bgAudioUrl}
          autoPlay={!!settings.bgAudioAutoplay}
          loop={settings.bgAudioLoop !== false}
          style={{ display: 'none' }}
        />
      )}
      {/* Top Floating Header Bar (Minimalist Heyzine-Style Overlay) */}
      <div className="hz-header">
        <div className="hz-title-wrap">
          {title && <span className="hz-book-title">{title}</span>}
        </div>

        <div className="hz-top-actions">
          {/* One-Tap Mobile Landscape Fullscreen Button */}
          {!isFullscreen && (
            <button
              type="button"
              className="hz-mobile-landscape-btn"
              onClick={toggleFullscreen}
              title="Open in Landscape Full Mode"
            >
              🔄 Landscape Full
            </button>
          )}

          {/* Search Inside Publication */}
          {settings.showSearchButton !== false && (
            <button
              className={`hz-icon-btn ${showSearch ? 'ring-2 ring-amber-400' : ''}`}
              onClick={() => {
                setShowSearch(!showSearch);
                setShowToc(false);
                setShowBookmarks(false);
              }}
              title="Search Inside Publication (Shortcut: /)"
              aria-label="Search Inside Publication"
            >
              🔍
            </button>
          )}

          {/* Automatic Table of Contents */}
          <button
            className={`hz-icon-btn ${showToc ? 'ring-2 ring-amber-400' : ''}`}
            onClick={() => {
              setShowToc(!showToc);
              setShowSearch(false);
              setShowBookmarks(false);
            }}
            title="Table of Contents (Shortcut: T)"
            aria-label="Table of Contents"
          >
            ☰
          </button>

          {/* Bookmark Current Page (Desktop) */}
          <button
            className={`hz-icon-btn hz-desktop-only ${isCurrentBookmarked ? 'ring-2 ring-amber-400' : ''}`}
            onClick={() => toggleBookmark(current + 1)}
            onContextMenu={(e) => {
              e.preventDefault();
              setShowBookmarks(!showBookmarks);
            }}
            title={
              isCurrentBookmarked
                ? `Page ${current + 1} Bookmarked (Click to remove · Right-click for list)`
                : `Bookmark Page ${current + 1} (Shortcut: B)`
            }
            aria-label="Bookmark current page"
          >
            {isCurrentBookmarked ? '🔖' : '🏷️'}
          </button>

          {/* Share Current Page / Publication */}
          {settings.showShareButton !== false && (
            <button
              className="hz-icon-btn"
              onClick={() => {
                setCopiedShareLink(false);
                setShowShareModal(true);
              }}
              title={`Share Page ${current + 1} or Publication`}
              aria-label="Share Page"
            >
              🔗
            </button>
          )}

          {/* Offline Caching Toggle (Desktop) */}
          <button
            className="hz-icon-btn hz-desktop-only"
            onClick={handleSaveOffline}
            title={
              offlineSaved
                ? 'Saved for Offline Reading'
                : cachingOffline
                  ? 'Caching pages for offline reading…'
                  : 'Save Publication for Offline Reading'
            }
            aria-label="Save for Offline Reading"
          >
            {offlineSaved ? '✅' : cachingOffline ? '⏳' : '💾'}
          </button>

          {soundConfigEnabled && readingMode === 'flip' && (
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

          {settings.showThumbnailsButton !== false && (
            <button
              className={`hz-icon-btn ${showThumbs ? 'ring-2 ring-amber-400' : ''}`}
              onClick={() => setShowThumbs(!showThumbs)}
              title="Toggle Page Thumbnails"
            >
              📑
            </button>
          )}

          <button
            className="hz-icon-btn hz-desktop-only"
            onClick={() => setShowShortcutsModal(true)}
            title="Keyboard Shortcuts & Theme Settings (Shortcut: ?)"
          >
            ⌨️
          </button>

          {settings.showFullscreenButton !== false && (
            <button
              className="hz-icon-btn"
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
            >
              {isFullscreen ? '✕' : '⛶'}
            </button>
          )}
        </div>
      </div>

      {/* Last-Read Page Resume Toast */}
      {resumedBanner !== null && (
        <div className="fixed top-16 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-amber-400/50 bg-slate-950/90 px-4 py-1.5 text-xs text-white shadow-xl backdrop-blur-md">
          <span>📖 Resumed at your last-read page (Page {resumedBanner})</span>
          <button
            type="button"
            onClick={() => goto(0)}
            className="font-bold text-amber-400 underline hover:text-amber-300"
          >
            Start from Cover
          </button>
          <button
            type="button"
            onClick={() => setResumedBanner(null)}
            className="text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* Slide-Out Search Inside Publication Panel */}
      {showSearch && (
        <div
          className="fixed top-16 right-4 z-40 flex max-h-[75vh] w-80 flex-col overflow-hidden rounded-2xl border border-white/15 bg-slate-950/95 text-white shadow-2xl backdrop-blur-lg"
          role="dialog"
          aria-label="Search Inside Publication"
        >
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
              🔍 Search Inside Publication
            </span>
            <button onClick={() => setShowSearch(false)} className="text-slate-400 hover:text-white">
              ✕
            </button>
          </div>
          <div className="p-3 border-b border-white/10">
            <input
              type="search"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search keywords, topics, names…"
              className="w-full rounded-xl border border-white/20 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-400 outline-none focus:border-amber-400"
            />
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-white/10 p-2">
            {searchQuery.trim().length < 2 ? (
              <p className="p-4 text-center text-xs text-slate-400">
                Type at least 2 characters to search across all {pages.length} pages.
              </p>
            ) : searchResults.length === 0 ? (
              <p className="p-4 text-center text-xs text-slate-400">
                No matches found for “{searchQuery}”.
              </p>
            ) : (
              searchResults.map((res, i) => (
                <button
                  key={`${res.page}-${i}`}
                  type="button"
                  onClick={() => {
                    goto(res.page - 1);
                    setShowSearch(false);
                  }}
                  className="w-full rounded-xl p-2.5 text-left transition-colors hover:bg-white/10"
                >
                  <div className="flex items-center justify-between text-xs font-bold text-amber-400">
                    <span>Page {res.page}</span>
                    <span>Jump →</span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-300 line-clamp-3">{res.snippet}</p>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Slide-Out Table of Contents & Bookmarks Panel */}
      {(showToc || showBookmarks) && (
        <div
          className="fixed top-16 left-4 z-40 flex max-h-[75vh] w-80 flex-col overflow-hidden rounded-2xl border border-white/15 bg-slate-950/95 text-white shadow-2xl backdrop-blur-lg"
          role="navigation"
          aria-label="Table of Contents and Bookmarks"
        >
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div className="flex gap-3 text-xs font-bold">
              <button
                type="button"
                onClick={() => { setShowToc(true); setShowBookmarks(false); }}
                className={showToc ? 'text-amber-400 underline' : 'text-slate-400 hover:text-white'}
              >
                ☰ Contents ({effectiveToc.length})
              </button>
              <button
                type="button"
                onClick={() => { setShowBookmarks(true); setShowToc(false); }}
                className={showBookmarks ? 'text-amber-400 underline' : 'text-slate-400 hover:text-white'}
              >
                🔖 Bookmarks ({bookmarks.length})
              </button>
            </div>
            <button
              onClick={() => { setShowToc(false); setShowBookmarks(false); }}
              className="text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {showToc ? (
              effectiveToc.map((item, idx) => (
                <button
                  key={`${item.page}-${idx}`}
                  type="button"
                  onClick={() => {
                    goto(item.page - 1);
                    setShowToc(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition-colors ${
                    current + 1 === item.page
                      ? 'bg-amber-400/20 font-bold text-amber-300'
                      : 'text-slate-200 hover:bg-white/10'
                  }`}
                >
                  <span className="truncate pr-2">{item.title}</span>
                  <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-slate-300">
                    p. {item.page}
                  </span>
                </button>
              ))
            ) : bookmarks.length === 0 ? (
              <p className="p-4 text-center text-xs text-slate-400">
                No bookmarked pages yet. Click 🏷️ or press <b>B</b> to bookmark any page.
              </p>
            ) : (
              bookmarks.map((bmPage) => (
                <div
                  key={bmPage}
                  className="flex items-center justify-between rounded-xl px-3 py-2 text-xs hover:bg-white/10"
                >
                  <button
                    type="button"
                    onClick={() => {
                      goto(bmPage - 1);
                      setShowBookmarks(false);
                    }}
                    className="flex-1 text-left font-semibold text-amber-300"
                  >
                    🔖 Page {bmPage}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleBookmark(bmPage)}
                    className="text-slate-400 hover:text-red-400"
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Main Reading Stage: Supports 3 Modes ('flip' | 'scroll' | 'reader') */}
      {readingMode === 'flip' && (
        <div
          className="hz-stage"
          onMouseDown={handleStageMouseDown}
          onDoubleClick={handleStageDoubleClick}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{
            cursor: zoom > 1 ? (isDraggingState ? 'grabbing' : 'grab') : 'default',
          }}
        >
          {/* Left-Side Company Heading, Subtitle & Optional Disclaimer Overlay (Heyzine Style) */}
          {(() => {
            const bgVal = (settings.backgroundImage || activeBg || '').toLowerCase();
            const isLightStage =
              ['#ffffff', '#fbf9f4', '#f6f3ec', '#f1f5f9', '#e2e8f0', '#f8fafc'].includes(bgVal) ||
              bgVal.includes('#f8fafc') ||
              bgVal.includes('#eaff3b') ||
              bgVal.includes('#fdfcfb');
            // Optional: Only display the left-side title/disclaimer block when the tenant turns on "Show titles on the flipbook's background"
            const showDisclaimerBlock = settings.showDisclaimer === true;
            const companyHeading = (settings.companyName || tenantName || title || '').toUpperCase();
            const subtitleHeading = (settings.catalogueSubtitle || '').toUpperCase();
            const discTitle = settings.disclaimerTitle ?? '';
            const discBody = settings.disclaimerText ?? '';

            const isFlippedOpen = current > 0;

            return (
              <>
                {showDisclaimerBlock && (companyHeading || subtitleHeading || discBody) && (
                  <aside
                    className={`hz-side-disclaimer ${isLightStage ? 'is-light-bg' : 'is-dark-bg'} ${
                      isFlippedOpen ? 'is-flipped-transparent' : ''
                    }`}
                    aria-label="Publication Info and Disclaimer"
                  >
                    {companyHeading && <h2 className="hz-disclaimer-company">{companyHeading}</h2>}
                    {subtitleHeading && <div className="hz-disclaimer-subtitle">{subtitleHeading}</div>}
                    {discBody && discTitle && <div className="hz-disclaimer-heading">{discTitle}</div>}
                    {discBody && <div className="hz-disclaimer-body">{discBody}</div>}
                  </aside>
                )}

                {settings.showPoweredBy !== false && (
                  <div
                    className={`hz-powered-by-badge ${isLightStage ? 'is-light-bg' : 'is-dark-bg'} ${
                      isFlippedOpen ? 'is-flipped-transparent' : ''
                    }`}
                  >
                    <div className="hz-powered-logo-box">
                      <img
                        src={settings.customLogoUrl || '/logo.png'}
                        alt="Nuvis Flipex"
                        className="hz-powered-logo-img"
                      />
                    </div>
                    <span className="hz-powered-vertical">Powered by</span>
                    <div className="hz-powered-brand-col">
                      <span className="hz-powered-brand-main">Nuvis</span>
                      <span className="hz-powered-brand-sub">Flipex</span>
                    </div>
                  </div>
                )}
              </>
            );
          })()}

          <button
            className={`hz-side-arrow left ${current === 0 ? 'disabled' : ''}`}
            onClick={prev}
            title="Previous Page (←)"
            disabled={current === 0}
          >
            ‹
          </button>

          <button
            className={`hz-side-arrow right ${current >= total - 1 ? 'disabled' : ''}`}
            onClick={next}
            title="Next Page (→)"
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

          {(() => {
            // Heyzine-style cover centering:
            // In landscape mode with showCover: true:
            // - Front cover (current === 0) is drawn by PageFlip on the right half (+pageWidth/2 from center),
            //   so we shift left by -pageWidth/2 to place the single front cover dead-center!
            // - Back cover (current === total - 1 when even page count) is drawn on the left half (-pageWidth/2 from center),
            //   so we shift right by +pageWidth/2 to place the single back cover dead-center!
            // - Only shift when `current` actually changes (not on hover/fold_corner), preventing any hover jitter!
            const pageW = bookBounds?.pageWidth || 0;
            let coverCenterOffsetX = 0;
            if (mode === 'landscape' && pageW > 0) {
              if (current === 0) {
                coverCenterOffsetX = -Math.round(pageW / 2);
              } else if (total > 1 && current >= total - 1 && total % 2 === 0) {
                coverCenterOffsetX = Math.round(pageW / 2);
              }
            }

            return (
              <div
                className="hz-canvas-wrap"
                style={{
                  aspectRatio: mode === 'landscape' ? `${spreadAspect}` : `${singleWidth / singleHeight}`,
                  transform: `translate3d(${pan.x + coverCenterOffsetX}px, ${pan.y}px, 0) scale(${zoom})`,
                  transformOrigin: 'center center',
                  transition: isDraggingState
                    ? 'none'
                    : 'transform 0.42s cubic-bezier(0.22, 1, 0.36, 1)',
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
                          (mode === 'landscape' && (current === 0 || (current >= total - 1 && total % 2 === 0)))
                          ? bookBounds.pageWidth
                          : bookBounds.width
                      )}px`,
                      height: `${Math.round(bookBounds.height)}px`,
                      display: 'flex',
                    }}
                  >
                    {mode === 'portrait' || current === 0 || (current >= total - 1 && total % 2 === 0) ? (
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
                        onClick={() => handleHotspotClick(h, current + 1)}
                        title={h.payload.title || (h.type === 'video' ? 'Watch Video' : 'Open Link')}
                      >
                        <span className="hotspot-icon">{h.type === 'video' ? '▶' : '🔗'}</span>
                        {h.payload.title && <span className="hotspot-text">{h.payload.title}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Mode 2: Continuous Vertical Scroll Mode (No 3D dependency) */}
      {readingMode === 'scroll' && (
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto px-4 pt-16 pb-24"
          onScroll={(e) => {
            const target = e.currentTarget;
            const pageEls = target.querySelectorAll('[data-scroll-page]');
            const viewCenter = target.scrollTop + target.clientHeight / 2;
            pageEls.forEach((el) => {
              const htmlEl = el as HTMLElement;
              if (
                htmlEl.offsetTop <= viewCenter &&
                htmlEl.offsetTop + htmlEl.offsetHeight >= viewCenter
              ) {
                const pNum = Number(htmlEl.dataset.scrollPage);
                if (!isNaN(pNum) && pNum - 1 !== current) {
                  setCurrent(pNum - 1);
                }
              }
            });
          }}
        >
          <div
            className="mx-auto flex flex-col items-center gap-6"
            style={{
              maxWidth: `${Math.round(780 * zoom)}px`,
              transition: 'max-width 0.15s ease',
            }}
          >
            {pages.map((p) => {
              const pageHotspots = hotspots[p.n] || [];
              const isVisibleOrNear = Math.abs(p.n - 1 - current) <= 2;
              const isCurrentPage = p.n - 1 === current;
              const pw = p.w || p.width || 1200;
              const ph = p.h || p.height || 1600;
              return (
                <div
                  key={p.n}
                  id={`flipex-scroll-page-${p.n}`}
                  data-scroll-page={p.n}
                  className="relative w-full overflow-hidden rounded-xl bg-white shadow-2xl"
                  style={{
                    aspectRatio: `${pw} / ${ph}`,
                    backgroundImage: `url(${p.thumb})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                >
                  <img
                    src={zoom > 1.25 && p.imageHigh ? p.imageHigh : p.image}
                    alt={`Page ${p.n}`}
                    loading={isVisibleOrNear ? 'eager' : 'lazy'}
                    decoding="async"
                    fetchPriority={isCurrentPage ? 'high' : 'auto'}
                    width={pw}
                    height={ph}
                    className="block w-full h-auto select-none"
                  />
                  <div className="absolute bottom-3 right-3 rounded-full bg-slate-950/75 px-3 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
                    Page {p.n} of {total}
                  </div>
                  {pageHotspots.map((h) => (
                    <div
                      key={h.id}
                      className={`reader-hotspot ${h.type}`}
                      style={{
                        left: `${h.x}%`,
                        top: `${h.y}%`,
                        width: `${h.w}%`,
                        height: `${h.h}%`,
                      }}
                      onClick={() => handleHotspotClick(h, p.n)}
                      title={h.payload.title || (h.type === 'video' ? 'Watch Video' : 'Open Link')}
                    >
                      <span className="hotspot-icon">{h.type === 'video' ? '▶' : '🔗'}</span>
                      {h.payload.title && <span className="hotspot-text">{h.payload.title}</span>}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Mode 3: Screen-Reader-Friendly Accessible Text Mode */}
      {readingMode === 'reader' && (
        <div
          className="flex-1 overflow-y-auto px-4 pt-16 pb-24"
          role="document"
          aria-label={`Accessible text version of ${title || 'Publication'}`}
        >
          <div className="mx-auto max-w-3xl space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-400/30 bg-slate-900/90 p-4 text-white shadow-lg">
              <div>
                <h2 className="text-sm font-bold text-amber-400">
                  ♿ Screen-Reader & High-Legibility Article Mode
                </h2>
                <p className="text-xs text-slate-300">
                  Semantic text extracted from all {pages.length} pages for assistive technology and comfortable reading.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setReaderFontSize((s) => Math.max(13, s - 2))}
                  className="rounded-lg border border-white/20 px-2.5 py-1 text-xs font-bold text-white hover:bg-white/10"
                  aria-label="Decrease font size"
                >
                  A−
                </button>
                <span className="text-xs text-slate-300">{readerFontSize}px</span>
                <button
                  type="button"
                  onClick={() => setReaderFontSize((s) => Math.min(26, s + 2))}
                  className="rounded-lg border border-white/20 px-2.5 py-1 text-xs font-bold text-white hover:bg-white/10"
                  aria-label="Increase font size"
                >
                  A+
                </button>
              </div>
            </div>

            {pages.map((p) => (
              <article
                key={p.n}
                id={`flipex-scroll-page-${p.n}`}
                aria-label={`Page ${p.n}`}
                className="rounded-2xl border border-white/10 bg-slate-900/95 p-6 text-slate-100 shadow-xl"
              >
                <header className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
                  <h3 className="text-sm font-bold text-amber-400">
                    Page {p.n} of {total}
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setReadingMode('flip');
                      setTimeout(() => goto(p.n - 1), 100);
                    }}
                    className="text-xs text-slate-400 hover:text-amber-300"
                  >
                    View Visual Page →
                  </button>
                </header>
                <div className="flex flex-col gap-5 sm:flex-row">
                  <img
                    src={p.thumb}
                    alt={`Thumbnail of Page ${p.n}`}
                    loading="lazy"
                    className="h-36 w-28 shrink-0 rounded-lg border border-white/15 object-cover"
                  />
                  <div
                    className="flex-1 whitespace-pre-line leading-relaxed text-slate-100"
                    style={{ fontSize: `${readerFontSize}px` }}
                  >
                    {p.text && p.text.trim() !== ''
                      ? p.text
                      : `[Visual graphic page ${p.n} — switch to Scroll or 3D Flip mode to inspect full layout.]`}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {/* Bottom Floating Navigation Pill */}
      {settings.showToolbar !== false && (
        <div className="hz-bottom-bar">
          <div className="hz-nav-pill">
            <button className="hz-pill-btn" onClick={prev} disabled={current === 0} title="Previous Page (←)">
              ‹
            </button>
            <span className="hz-pill-counter">{pageDisplay}</span>
            <button className="hz-pill-btn" onClick={next} disabled={current >= total - 1} title="Next Page (→)">
              ›
            </button>

            {/* Zoom Controls (Available in 3D Flip & Scroll Modes with On-Demand HD Zoom) */}
            {readingMode !== 'reader' && (
              <div className="hz-zoom-controls hz-desktop-only">
                <button
                  className="hz-pill-btn hz-zoom-btn"
                  onClick={() => handleZoomChange(zoom - 0.25)}
                  disabled={zoom <= 1}
                  title="Zoom Out (-)"
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
                  title="Zoom In (+)"
                >
                  +
                </button>
                <button
                  className="hz-pill-btn hz-zoom-label"
                  onClick={() => handleZoomChange(1)}
                  title="Reset zoom to 100% (0)"
                >
                  {Math.round(zoom * 100)}%{zoom > 1.25 ? ' HD' : ''}
                </button>
              </div>
            )}

            {settings.showFullscreenButton !== false && (
              <button
                className="hz-pill-btn fs"
                onClick={toggleFullscreen}
                title={isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
              >
                {isFullscreen ? '✕ Exit' : '⛶ Fullscreen'}
              </button>
            )}
          </div>
        </div>
      )}

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

      {/* Share Individual Page / Publication Modal */}
      {showShareModal && (
        <div className="modal" onClick={() => setShowShareModal(false)}>
          <div
            className="card max-w-md w-full space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Share Publication</h3>
              <button className="link" onClick={() => setShowShareModal(false)}>
                ✕ Close
              </button>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShareSpecificPage(true)}
                className={`flex-1 rounded-xl border px-3 py-2 text-xs font-bold ${
                  shareSpecificPage
                    ? 'border-amber-400 bg-amber-400/15 text-amber-600'
                    : 'border-slate-200 text-slate-600'
                }`}
              >
                📄 Share Page {current + 1}
              </button>
              <button
                type="button"
                onClick={() => setShareSpecificPage(false)}
                className={`flex-1 rounded-xl border px-3 py-2 text-xs font-bold ${
                  !shareSpecificPage
                    ? 'border-amber-400 bg-amber-400/15 text-amber-600'
                    : 'border-slate-200 text-slate-600'
                }`}
              >
                📚 Entire Flipbook
              </button>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={computedShareUrl}
                className="boardui-input flex-1 text-xs"
              />
              <button
                type="button"
                className="btn-primary boardui-btn-sm"
                onClick={() => {
                  navigator.clipboard?.writeText(computedShareUrl);
                  setCopiedShareLink(true);
                  sendTelemetry('share', { pageNumber: current + 1, targetUrl: computedShareUrl });
                }}
              >
                {copiedShareLink ? '✓ Copied!' : 'Copy Link'}
              </button>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <a
                href={`https://wa.me/?text=${encodeURIComponent((title || 'Publication') + ' - ' + computedShareUrl)}`}
                target="_blank"
                rel="noreferrer"
                onClick={() => sendTelemetry('share', { pageNumber: current + 1, targetUrl: 'whatsapp' })}
                className="btn-secondary boardui-btn-sm"
              >
                WhatsApp
              </a>
              <a
                href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(computedShareUrl)}`}
                target="_blank"
                rel="noreferrer"
                onClick={() => sendTelemetry('share', { pageNumber: current + 1, targetUrl: 'linkedin' })}
                className="btn-secondary boardui-btn-sm"
              >
                LinkedIn
              </a>
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(title || 'Publication')}&url=${encodeURIComponent(computedShareUrl)}`}
                target="_blank"
                rel="noreferrer"
                onClick={() => sendTelemetry('share', { pageNumber: current + 1, targetUrl: 'twitter' })}
                className="btn-secondary boardui-btn-sm"
              >
                X / Twitter
              </a>
              <a
                href={`mailto:?subject=${encodeURIComponent(title || 'Publication')}&body=${encodeURIComponent(computedShareUrl)}`}
                onClick={() => sendTelemetry('share', { pageNumber: current + 1, targetUrl: 'email' })}
                className="btn-secondary boardui-btn-sm"
              >
                Email
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Keyboard Shortcuts & Viewer Theme Picker Modal */}
      {showShortcutsModal && (
        <div className="modal" onClick={() => setShowShortcutsModal(false)}>
          <div
            className="card max-w-lg w-full space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                ⌨️ Keyboard Shortcuts & Reader Themes
              </h3>
              <button className="link" onClick={() => setShowShortcutsModal(false)}>
                ✕ Close
              </button>
            </div>

            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-2">
                Custom Viewer Themes
              </span>
              <div className="flex flex-wrap gap-2">
                {Object.entries(VIEWER_THEMES).map(([key, th]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveBg(th.bg)}
                    className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all ${
                      activeBg === th.bg ? 'ring-2 ring-amber-400 border-amber-400' : 'border-slate-300'
                    }`}
                    style={{
                      background: th.bg,
                      color: th.bg === '#f6f3ec' || th.bg === '#e2e8f0' ? '#0f172a' : '#ffffff',
                    }}
                  >
                    {th.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-slate-50 p-2.5 flex justify-between">
                <span>Next / Prev Page</span>
                <kbd className="font-bold text-slate-800">← / →</kbd>
              </div>
              <div className="rounded-lg bg-slate-50 p-2.5 flex justify-between">
                <span>Switch Reading Mode</span>
                <kbd className="font-bold text-slate-800">M</kbd>
              </div>
              <div className="rounded-lg bg-slate-50 p-2.5 flex justify-between">
                <span>Search Publication</span>
                <kbd className="font-bold text-slate-800">/</kbd>
              </div>
              <div className="rounded-lg bg-slate-50 p-2.5 flex justify-between">
                <span>Table of Contents</span>
                <kbd className="font-bold text-slate-800">T</kbd>
              </div>
              <div className="rounded-lg bg-slate-50 p-2.5 flex justify-between">
                <span>Bookmark Page</span>
                <kbd className="font-bold text-slate-800">B</kbd>
              </div>
              <div className="rounded-lg bg-slate-50 p-2.5 flex justify-between">
                <span>Zoom In / Out / Reset</span>
                <kbd className="font-bold text-slate-800">+ / - / 0</kbd>
              </div>
              <div className="rounded-lg bg-slate-50 p-2.5 flex justify-between">
                <span>Toggle Fullscreen</span>
                <kbd className="font-bold text-slate-800">F</kbd>
              </div>
              <div className="rounded-lg bg-slate-50 p-2.5 flex justify-between">
                <span>Shortcuts Guide</span>
                <kbd className="font-bold text-slate-800">?</kbd>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Video Modal Popup */}
      {activeVideo && (
        <div className="modal" onClick={() => setActiveVideo(null)}>
          <div className="card video-modal" onClick={(e) => e.stopPropagation()}>
            <div className="video-modal-header">
              <h3>{activeVideo.title}</h3>
              <button className="link" onClick={() => setActiveVideo(null)}>
                ✕ Close
              </button>
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
