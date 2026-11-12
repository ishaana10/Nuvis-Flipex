import { useEffect, useRef, useState, useCallback } from 'react';
import { PageFlip } from 'page-flip';
import { playPageFlipSound, unlockAudio } from '../utils/sound';
import { getCanvasDpr, getReaderProfile, pagesToLoad } from './viewer/adaptiveLoading';
import type { FlipbookSettings } from './CustomizationDialog';

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

export type ViewerSettings = FlipbookSettings;

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
  const [mode, setMode] = useState<'portrait' | 'landscape'>(() => {
    if (typeof window !== 'undefined') {
      const normalizedEffect = (settings.pageEffect || 'magazine').toLowerCase().replace(/\s+/g, '_');
      const isSingle = ['one_page', 'slider', 'cards', 'coverflow'].includes(normalizedEffect);
      const isMobPortrait = window.innerWidth < 768 && window.innerWidth < window.innerHeight;
      if (isSingle || isMobPortrait) return 'portrait';
    }
    return 'landscape';
  });
  const currentRef = useRef(current);
  currentRef.current = current;
  const [soundMuted, setSoundMuted] = useState(false);

  // Drawers & Modals
  const [showThumbs, setShowThumbs] = useState(false);
  const [showToc, setShowToc] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [pageToast, setPageToast] = useState<string | null>(null);

  // Favicon customization (Image 1)
  useEffect(() => {
    if (settings.faviconUrl) {
      let link: HTMLLinkElement | null = document.querySelector("link[rel*='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'shortcut icon';
        document.head.appendChild(link);
      }
      link.href = settings.faviconUrl;
    }
  }, [settings.faviconUrl]);

  // Initial navigation panel (Image 2)
  useEffect(() => {
    if (settings.initialNavPanel === 'thumbnails') setShowThumbs(true);
    else if (settings.initialNavPanel === 'toc') setShowToc(true);
    else if (settings.initialNavPanel === 'bookmarks') setShowBookmarks(true);
  }, [settings.initialNavPanel]);

  // First / Last page prompt toast
  const toastTimerRef = useRef<any>(null);
  const showToast = useCallback((msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setPageToast(msg);
    toastTimerRef.current = setTimeout(() => {
      setPageToast(null);
    }, 2800);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

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
  const [isFlipping, setIsFlipping] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const flippingTimer = useRef<any>(null);
  const preloadedSet = useRef<Set<number>>(new Set());
  const dragStart = useRef({ x: 0, y: 0, startPanX: 0, startPanY: 0 });
  const pinchStartDist = useRef<number | null>(null);
  const pinchStartZoom = useRef<number>(1);
  const pinchMidpoint = useRef<{ x: number; y: number; startPanX: number; startPanY: number } | null>(null);
  const lastTouchTap = useRef<{ time: number; x: number; y: number }>({ time: 0, x: 0, y: 0 });
  const pageEnterTimestamp = useRef<number>(Date.now());

  // Dynamically observe stage dimensions to compute aspect-constrained page fitting with zero mobile side/bottom cutoff
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      const cs = window.getComputedStyle(el);
      const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0) + 4;
      const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0) + 4;
      const availW = Math.max(100, Math.floor(rect.width - padX));
      const availH = Math.max(100, Math.floor(rect.height - padY));
      setStageSize({ width: availW, height: availH });
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    window.addEventListener('resize', updateSize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, [readingMode]);

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

  const getMaxPan = useCallback((targetZoom: number) => {
    if (targetZoom <= 1) return { maxPanX: 0, maxPanY: 0 };
    const stageW = window.innerWidth;
    const stageH = window.innerHeight;
    const baseW = bookBounds?.width || (stageW * 0.9);
    const baseH = bookBounds?.height || (stageH * 0.85);
    const scaledW = baseW * targetZoom;
    const scaledH = baseH * targetZoom;

    // Generous pan limits: allows moving all the way to each corner with comfortable margin
    const maxPanX = Math.max(300, Math.round((scaledW - stageW * 0.2) / 2 + 160));
    const maxPanY = Math.max(300, Math.round((scaledH - stageH * 0.2) / 2 + 160));
    return { maxPanX, maxPanY };
  }, [bookBounds]);

  const handleZoomChange = useCallback((newZoom: number) => {
    const clamped = Math.round(Math.min(3.5, Math.max(1, newZoom)) * 100) / 100;
    setZoom(clamped);
    if (clamped <= 1) {
      setPan({ x: 0, y: 0 });
    }
  }, []);

  // Progressive & Lazy Multi-Resolution Page Preloader with Sliding Window Virtualization
  useEffect(() => {
    if (!pages.length) return;

    const BLANK_SVG =
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="100%" height="100%" fill="%23ffffff"/></svg>';

    // Active reading window: current spread + 6 pages ahead + 6 pages behind
    const windowIndices: number[] = [];
    for (let offset = -6; offset <= 7; offset++) {
      const idx = current + offset;
      if (idx >= 0 && idx < pages.length) {
        windowIndices.push(idx);
      }
    }

    // 1. Browser background decoding for near pages
    windowIndices.forEach((idx) => {
      if (preloadedSet.current.has(idx)) return;
      preloadedSet.current.add(idx);
      const pg = pages[idx];
      if (!pg) return;
      const img = new Image();
      img.decoding = 'async';
      if (idx >= current - 1 && idx <= current + 3) {
        (img as any).fetchPriority = 'high';
      }
      img.src = pg.image;
    });

    // 2. Sliding window promotion & distant page virtualization
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
            if (
              pageObj &&
              pg &&
              pageObj.image &&
              (pageObj.image.src.startsWith('data:image/svg+xml') || !pageObj.image.src.endsWith(pg.image))
            ) {
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

          // Memory Release: For large publications (> 30 pages), downgrade distant pages (> 10 pages away) to free mobile GPU memory
          if (pages.length > 30) {
            for (let i = 0; i < pages.length; i++) {
              if (Math.abs(i - current) > 10) {
                const distantObj = pageObjs[i];
                if (distantObj && distantObj.image && !distantObj.image.src.startsWith('data:image/svg+xml')) {
                  const blankImg = new Image();
                  blankImg.src = BLANK_SVG;
                  distantObj.image = blankImg;
                  preloadedSet.current.delete(i);
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

  // Global mousemove/mouseup listeners when panning while zoomed in (Desktop)
  useEffect(() => {
    if (!isDraggingState || zoom <= 1) return;

    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      const { maxPanX, maxPanY } = getMaxPan(zoom);
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
  }, [isDraggingState, zoom, getMaxPan]);

  const handleStageMouseDown = (e: React.MouseEvent) => {
    unlockAudio();
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

  // Mobile Touch Gestures: 1-Finger Pan when Zoomed, 2-Finger Pinch-to-Zoom, and Double-Tap Zoom
  const handleTouchStart = (e: React.TouchEvent) => {
    unlockAudio();
    if ((e.target as HTMLElement).closest('.reader-hotspot') || (e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('input')) return;

    if (e.touches.length === 2) {
      // 2-Finger Pinch Start: cancel any single-finger page fold
      if (flip.current) {
        const pfAny = flip.current as any;
        pfAny.isUserTouch = false;
        pfAny.isUserMove = false;
        if (pfAny.ui) pfAny.ui.touchPoint = null;
      }
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const dx = t0.clientX - t1.clientX;
      const dy = t0.clientY - t1.clientY;
      pinchStartDist.current = Math.hypot(dx, dy);
      pinchStartZoom.current = zoom;
      pinchMidpoint.current = {
        x: (t0.clientX + t1.clientX) / 2,
        y: (t0.clientY + t1.clientY) / 2,
        startPanX: pan.x,
        startPanY: pan.y,
      };
      setIsDraggingState(true);
    } else if (e.touches.length === 1) {
      const touch = e.touches[0];
      const now = Date.now();
      const timeDiff = now - lastTouchTap.current.time;
      const distDiff = Math.hypot(touch.clientX - lastTouchTap.current.x, touch.clientY - lastTouchTap.current.y);

      // Mobile Double-Tap to Zoom In / Out
      if (timeDiff < 320 && distDiff < 40) {
        lastTouchTap.current = { time: 0, x: 0, y: 0 };
        if (flip.current) {
          const pfAny = flip.current as any;
          pfAny.isUserTouch = false;
          pfAny.isUserMove = false;
          if (pfAny.ui) pfAny.ui.touchPoint = null;
        }
        if (zoom > 1) {
          handleZoomChange(1);
          setPan({ x: 0, y: 0 });
        } else {
          const targetZoom = 2.2;
          handleZoomChange(targetZoom);
          const stageW = window.innerWidth;
          const stageH = window.innerHeight;
          const offsetX = (stageW / 2 - touch.clientX) * (targetZoom - 1);
          const offsetY = (stageH / 2 - touch.clientY) * (targetZoom - 1);
          const { maxPanX, maxPanY } = getMaxPan(targetZoom);
          setPan({
            x: Math.max(-maxPanX, Math.min(maxPanX, offsetX)),
            y: Math.max(-maxPanY, Math.min(maxPanY, offsetY)),
          });
        }
        return;
      }

      lastTouchTap.current = { time: now, x: touch.clientX, y: touch.clientY };

      if (zoom > 1) {
        setIsDraggingState(true);
        dragStart.current = {
          x: touch.clientX,
          y: touch.clientY,
          startPanX: pan.x,
          startPanY: pan.y,
        };
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchStartDist.current !== null) {
      if (e.cancelable) e.preventDefault();
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const dx = t0.clientX - t1.clientX;
      const dy = t0.clientY - t1.clientY;
      const dist = Math.hypot(dx, dy);
      const scaleRatio = dist / Math.max(1, pinchStartDist.current);
      const targetZoom = Math.round(Math.min(3.5, Math.max(1, pinchStartZoom.current * scaleRatio)) * 100) / 100;

      setZoom(targetZoom);

      if (targetZoom <= 1) {
        setPan({ x: 0, y: 0 });
      } else if (pinchMidpoint.current) {
        const curMidX = (t0.clientX + t1.clientX) / 2;
        const curMidY = (t0.clientY + t1.clientY) / 2;
        const moveDx = curMidX - pinchMidpoint.current.x;
        const moveDy = curMidY - pinchMidpoint.current.y;
        const { maxPanX, maxPanY } = getMaxPan(targetZoom);
        const nextX = Math.max(-maxPanX, Math.min(maxPanX, pinchMidpoint.current.startPanX + moveDx));
        const nextY = Math.max(-maxPanY, Math.min(maxPanY, pinchMidpoint.current.startPanY + moveDy));
        setPan({ x: nextX, y: nextY });
      }
    } else if (e.touches.length === 1 && zoom > 1 && isDraggingState) {
      if (e.cancelable) e.preventDefault();
      const touch = e.touches[0];
      const dx = touch.clientX - dragStart.current.x;
      const dy = touch.clientY - dragStart.current.y;
      const { maxPanX, maxPanY } = getMaxPan(zoom);
      const nextX = Math.max(-maxPanX, Math.min(maxPanX, dragStart.current.startPanX + dx));
      const nextY = Math.max(-maxPanY, Math.min(maxPanY, dragStart.current.startPanY + dy));
      setPan({ x: nextX, y: nextY });
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && zoom > 1) {
      // Transition smoothly from 2-finger pinch to 1-finger drag without sudden jumping
      const touch = e.touches[0];
      dragStart.current = {
        x: touch.clientX,
        y: touch.clientY,
        startPanX: pan.x,
        startPanY: pan.y,
      };
      pinchStartDist.current = null;
      pinchMidpoint.current = null;
    } else if (e.touches.length === 0) {
      pinchStartDist.current = null;
      pinchMidpoint.current = null;
      setIsDraggingState(false);
    }
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
  const isSoundActiveRef = useRef(isSoundActive);
  isSoundActiveRef.current = isSoundActive;
  const userTriggeredFlipRef = useRef(false);
  const isInitializedRef = useRef(false);

  const first = pages[0];
  const singleWidth = first?.width || first?.w || 600;
  const singleHeight = first?.height || first?.h || 800;
  const spreadAspect = (2 * singleWidth) / singleHeight;
  const pageAspect = singleWidth / singleHeight;

  // Compute exact aspect-constrained fitting box so pages fit comfortably within screen with zero cutoff on sides
  const targetAspect = mode === 'landscape' ? spreadAspect : pageAspect;
  let fitWidth = 0;
  let fitHeight = 0;
  if (stageSize.width > 0 && stageSize.height > 0) {
    if (stageSize.width / stageSize.height > targetAspect) {
      // Height-constrained (desktop widescreen or short viewport)
      fitHeight = Math.round(stageSize.height);
      fitWidth = Math.round(fitHeight * targetAspect);
    } else {
      // Width-constrained (mobile portrait & narrow screens)
      fitWidth = Math.round(stageSize.width);
      fitHeight = Math.round(fitWidth / targetAspect);
    }
  }

  // Compute Automatic Table of Contents fallback if none provided
  const effectiveToc: TocItem[] =
    toc && toc.length > 0
      ? toc
      : pages.map((p) => {
          const firstLine = p.text
            ? p.text
                .split('\n')
                .map((l) => l.trim())
                .find((l) => l.length >= 4 && l.length <= 65)
            : null;
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
      parent.appendChild(leftStack);
    }

    let rightStack = parent.querySelector('.stf-page-stack-right') as HTMLElement | null;
    if (!rightStack) {
      rightStack = document.createElement('div');
      rightStack.className = 'stf-page-stack stf-page-stack-right';
      rightStack.innerHTML = '<div class="stf-stack-stepped top"></div><div class="stf-stack-stepped bottom"></div>';
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
      leftEdge = left + pageWidth;
      rightEdge = left + width;
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

    // Spine crease is drawn directly on the <canvas> (in render.drawBookShadow) underneath the curling page,
    // so we hide the HTML overlay crease to prevent it from bleeding through on top of turning pages.
    spineCrease.style.display = 'none';

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

    isInitializedRef.current = false;
    userTriggeredFlipRef.current = false;

    host.current.innerHTML = '';
    const container = document.createElement('div');
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.display = 'flex';
    container.style.justifyContent = 'center';
    container.style.alignItems = 'center';
    host.current.appendChild(container);

    const isMobilePortrait = window.innerWidth < 768 && window.innerWidth < window.innerHeight;
    const normalizedPageEffect = (settings.pageEffect || 'magazine').toLowerCase().replace(/\s+/g, '_');
    const isExplicitSinglePage = ['one_page', 'slider', 'cards', 'coverflow'].includes(normalizedPageEffect);
    const isHardCoverEffect = ['book', 'album', 'notebook'].includes(normalizedPageEffect);
    const shouldUsePortrait = isExplicitSinglePage || isMobilePortrait;
    const startPageIdx = Math.max(0, Math.min(pages.length - 1, currentRef.current));

    setMode(shouldUsePortrait ? 'portrait' : 'landscape');

    const pf = new PageFlip(container, {
      width: singleWidth,
      height: singleHeight,
      size: 'stretch',
      minWidth: shouldUsePortrait ? 9999 : 100,
      maxWidth: 2400,
      minHeight: 100,
      maxHeight: 1800,
      showCover: true,
      maxShadowOpacity: 0.85,
      mobileScrollSupport: false,
      usePortrait: shouldUsePortrait,
      flippingTime: isHardCoverEffect ? 1100 : 950,
      useMouseEvents: true,
      showPageCorners: false,
      swipeDistance: 30,
      startPage: startPageIdx,
    });

    const BLANK_PAGE_SVG =
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="100%" height="100%" fill="%23ffffff"/></svg>';

    // Adaptive sliding image window (device memory / network / viewport aware):
    // cover + current spread + a few pages ahead/behind only; everything else is a cheap placeholder
    // that is swapped for the real image on demand (see syncImageWindow on 'flip').
    const readerProfile = getReaderProfile();
    const initialWindow = pagesToLoad(startPageIdx, pages.length, readerProfile);
    const initialUrls = pages.map((p, idx) => (initialWindow.has(idx) ? p.image : BLANK_PAGE_SVG));

    const syncImageWindow = (centerIdx: number) => {
      const stPages = (pf as any).getPageCollection?.()?.getPages?.() as any[] | undefined;
      if (!stPages) return;
      const wanted = pagesToLoad(centerIdx, pages.length, readerProfile);
      stPages.forEach((sp, idx) => {
        const img: HTMLImageElement | undefined = sp?.image;
        if (!img || !pages[idx]) return;
        if (wanted.has(idx)) {
          if (img.dataset.nvLoaded !== '1' && img.dataset.nvLoading !== '1') {
            img.dataset.nvLoading = '1';
            img.onload = () => {
              img.dataset.nvLoaded = '1';
              img.dataset.nvLoading = '';
              sp.isLoad = true;
              try { pf.update(); } catch { /* ignore */ }
            };
            img.src = pages[idx].image;
          }
        } else if (img.dataset.nvLoaded === '1' && Math.abs(idx - centerIdx) > readerProfile.ahead + readerProfile.behind + 4) {
          // Release decoded bitmaps far from the reader on constrained devices / large publications.
          img.dataset.nvLoaded = '';
          img.src = BLANK_PAGE_SVG;
        }
      });
    };
    (pf as any).__nvSyncImageWindow = syncImageWindow;
    // Mark the pages loaded up-front as loaded so they are not re-fetched or released prematurely.
    window.setTimeout(() => {
      const stPages = (pf as any).getPageCollection?.()?.getPages?.() as any[] | undefined;
      stPages?.forEach((sp, idx) => {
        if (sp?.image && initialWindow.has(idx)) sp.image.dataset.nvLoaded = '1';
      });
    }, 0);

    pf.loadFromImages(initialUrls);

    // Patch CanvasRenderer and UI after loadFromImages to support High-DPI Retina displays,
    // exact 100% container fitting (zero bottom/right cutoff), and magazine spine creases.
    const render = (pf as any).getRender?.();
    const ui = (pf as any).getUI?.();

    container.style.minWidth = '0px';
    container.style.minHeight = '0px';
    container.style.width = '100%';
    container.style.height = '100%';

    if (ui) {
      if (ui.wrapper) {
        ui.wrapper.style.paddingBottom = '0px';
        ui.wrapper.style.width = '100%';
        ui.wrapper.style.height = '100%';
      }

      if (ui.setOrientationStyle) {
        const origSetOrientationStyle = ui.setOrientationStyle.bind(ui);
        ui.setOrientationStyle = function (orientation: any) {
          origSetOrientationStyle(orientation);
          if (this.wrapper) {
            this.wrapper.style.paddingBottom = '0px';
            this.wrapper.style.width = '100%';
            this.wrapper.style.height = '100%';
          }
          this.resizeCanvas?.();
        };
      }

      if (ui.canvas) {
        ui.resizeCanvas = function () {
          const dpr = getCanvasDpr();
          const cssW =
            this.canvas.offsetWidth ||
            this.canvas.clientWidth ||
            parseInt(getComputedStyle(this.canvas).getPropertyValue('width'), 10) ||
            300;
          const cssH =
            this.canvas.offsetHeight ||
            this.canvas.clientHeight ||
            parseInt(getComputedStyle(this.canvas).getPropertyValue('height'), 10) ||
            400;
          const targetW = Math.round(cssW * dpr);
          const targetH = Math.round(cssH * dpr);
          if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
            this.canvas.width = targetW;
            this.canvas.height = targetH;
          }
          const ctx = this.app?.getRender()?.getContext?.();
          if (ctx) {
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
          }
        };
        ui.resizeCanvas();
      }
    }

    const origPfUpdate = pf.update.bind(pf);
    pf.update = function () {
      if (ui?.wrapper) {
        ui.wrapper.style.paddingBottom = '0px';
        ui.wrapper.style.width = '100%';
        ui.wrapper.style.height = '100%';
      }
      ui?.resizeCanvas?.();
      origPfUpdate();
      ui?.resizeCanvas?.();
    };

    const limitPointToCircle = (
      centerPoint: { x: number; y: number },
      radius: number,
      targetPoint: { x: number; y: number }
    ) => {
      const dx = targetPoint.x - centerPoint.x;
      const dy = targetPoint.y - centerPoint.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= radius || dist === 0) {
        return targetPoint;
      }
      return {
        x: centerPoint.x + (dx / dist) * radius,
        y: centerPoint.y + (dy / dist) * radius,
      };
    };

    // Patch PageCollection pages for 100% Solid Opaque Paper rendering
    // Eliminates any transparent/see-through curl during page flip
    const coll = (pf as any).getPageCollection?.();
    const pageObjs = coll?.getPages?.() || [];
    pageObjs.forEach((p: any, idx: number) => {
      p.__pageIdx = idx;
      const origSimpleDraw = p.simpleDraw?.bind(p);
      if (origSimpleDraw) {
        p.simpleDraw = function (orient: number) {
          const ctx = this.render?.getContext?.();
          const rect = this.render?.getRect?.();
          if (ctx && rect) {
            const x = orient === 1 ? rect.left + rect.pageWidth : rect.left;
            const y = rect.top;
            ctx.save();
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(x, y, rect.pageWidth, rect.height);
            ctx.restore();
          }
          origSimpleDraw(orient);
        };
      }

      const origDraw = p.draw?.bind(p);
      if (origDraw) {
        p.draw = function (tempDensity?: any) {
          const ctx = this.render?.getContext?.();
          const rect = this.render?.getRect?.();
          if (ctx && rect && this.state?.position && this.state?.area) {
            const pos = this.render.convertToGlobal(this.state.position);
            const s = rect.pageWidth;
            const n = rect.height;
            ctx.save();
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
            ctx.translate(pos.x, pos.y);
            ctx.beginPath();
            let firstPt = true;
            for (let pt of this.state.area) {
              if (pt !== null) {
                pt = this.render.convertToGlobal(pt);
                if (firstPt) {
                  ctx.moveTo(pt.x - pos.x, pt.y - pos.y);
                  firstPt = false;
                } else {
                  ctx.lineTo(pt.x - pos.x, pt.y - pos.y);
                }
              }
            }
            ctx.closePath();
            ctx.rotate(this.state.angle);
            ctx.clip();

            const isFlipping = this === this.render.flippingPage;
            const isPortraitBackside =
              isFlipping && this.render.orientation === 'portrait' && this.render.direction === 0;

            // 1. Solid opaque white paper sheet (100% opaque across entire clipped area, never see-through)
            ctx.fillStyle = isPortraitBackside ? '#fafaf9' : '#ffffff';
            ctx.fillRect(-s, -n, s * 3, n * 3);

            // 2. Draw page content image
            if (isPortraitBackside) {
              // In single-page portrait mode, the underside of the forward-curling page is the reverse side of the paper sheet
              if (this.isLoad && this.image) {
                ctx.save();
                ctx.globalAlpha = 0.06;
                ctx.translate(s, 0);
                ctx.scale(-1, 1);
                ctx.drawImage(this.image, 0, 0, s, n);
                ctx.restore();
              }
            } else if (this.isLoad && this.image) {
              ctx.drawImage(this.image, 0, 0, s, n);
            } else if (this.drawLoader) {
              this.drawLoader(ctx, { x: 0, y: 0 }, s, n);
            }

            // 3. Authentic 3D paper curl lighting & gradient across fold (FlippingBook style)
            if (isFlipping) {
              const dir = this.render.direction;
              const foldGrad =
                dir === 1
                  ? ctx.createLinearGradient(s, 0, 0, 0)
                  : ctx.createLinearGradient(0, 0, s, 0);
              foldGrad.addColorStop(0, 'rgba(0, 0, 0, 0.16)');
              foldGrad.addColorStop(0.12, 'rgba(0, 0, 0, 0.05)');
              foldGrad.addColorStop(0.32, 'rgba(255, 255, 255, 0.22)');
              foldGrad.addColorStop(0.85, 'rgba(0, 0, 0, 0.03)');
              foldGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
              ctx.fillStyle = foldGrad;
              ctx.fillRect(0, 0, s, n);
            }

            ctx.restore();
            return;
          }
          origDraw(tempDensity);
        };
      }
    });

    if (render) {
      render.clear = function () {
        if (this.ctx && this.canvas) {
          const dpr = getCanvasDpr();
          this.ctx.setTransform(1, 0, 0, 1, 0, 0);
          this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
          this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          this.ctx.imageSmoothingEnabled = true;
          this.ctx.imageSmoothingQuality = 'high';
        }
      };

      // Patch drawFrame:
      // 1. Remove destructive portrait clip so mobile page flip is 100% visible and never chopped off.
      // 2. Properly handle single-page spreads (Front/Back cover & Portrait mode) where bottomPage === flippingPage.
      // 3. Fix: Prevent rightPage from bleeding through on the right when closing back to Front Cover.
      render.drawFrame = function () {
        if (!this.ctx) return;
        this.ctx.save();
        this.clear();

        const flipCalc = (pf as any).getFlipController?.()?.calc;
        const dir = flipCalc ? flipCalc.getDirection() : this.direction;
        // FlipDirection.FORWARD is 0, FlipDirection.BACK is 1
        const isClosingToFrontCover =
          dir === 1 &&
          ((this.bottomPage != null && (this.bottomPage as any).__pageIdx === 0) ||
           (this.flippingPage != null && (this.flippingPage as any).__pageIdx === 0));

        const isClosingToBackCover =
          dir === 0 &&
          pageObjs.length > 1 &&
          ((this.bottomPage != null && (this.bottomPage as any).__pageIdx === pageObjs.length - 1) ||
           (this.flippingPage != null && (this.flippingPage as any).__pageIdx === pageObjs.length - 1));

        if (this.orientation !== 'portrait') {
          if (this.leftPage != null && !isClosingToBackCover) this.leftPage.simpleDraw(0);
        }

        // When closing to the front cover, do NOT draw rightPage so its edge never bleeds through before disappearing
        if (this.rightPage != null && !isClosingToFrontCover) this.rightPage.simpleDraw(1);

        // Ensure right half is completely clean when folding back onto front cover
        if (isClosingToFrontCover) {
          const rect = this.getRect();
          this.ctx.clearRect(rect.left + rect.pageWidth - 2, rect.top - 2, rect.pageWidth + 4, rect.height + 4);
        } else if (isClosingToBackCover) {
          const rect = this.getRect();
          this.ctx.clearRect(rect.left - 2, rect.top - 2, rect.pageWidth + 4, rect.height + 4);
        }

        if (this.bottomPage != null) {
          if (this.bottomPage === this.flippingPage && flipCalc) {
            if (this.orientation === 'landscape') {
              // Closing to Front Cover or Back Cover: clear the lifted corner area so the old page underneath is not visible
              const botArea = flipCalc.getBottomClipArea?.() || [];
              const validPts = botArea.filter(Boolean);
              if (validPts.length >= 3) {
                const rect = this.getRect();
                this.ctx.save();
                this.ctx.beginPath();
                validPts.forEach((pt: any, i: number) => {
                  const g = this.convertToGlobal(pt);
                  if (i === 0) this.ctx.moveTo(g.x, g.y);
                  else this.ctx.lineTo(g.x, g.y);
                });
                this.ctx.closePath();
                this.ctx.clip();
                this.ctx.clearRect(rect.left - 10, rect.top - 10, rect.width + 20, rect.height + 20);
                this.ctx.restore();
              }
            } else {
              // Portrait mode turning back: bottomPage and flippingPage share the same Page instance
              this.bottomPage.setArea(flipCalc.getBottomClipArea());
              this.bottomPage.setPosition(flipCalc.getBottomPagePosition());
              this.bottomPage.setAngle(0);
              this.bottomPage.draw();
            }
          } else {
            this.bottomPage.draw();
          }
        }

        this.drawBookShadow();

        if (this.flippingPage != null) {
          if (this.bottomPage === this.flippingPage && flipCalc) {
            this.flippingPage.setArea(flipCalc.getFlippingClipArea());
            this.flippingPage.setPosition(flipCalc.getActiveCorner());
            this.flippingPage.setAngle(flipCalc.getAngle());
          }
          this.flippingPage.draw();
        }

        if (this.shadow != null) {
          this.drawOuterShadow();
          this.drawInnerShadow();
        }

        this.ctx.restore();
      };

      // Patch animation rendering for smooth cubic-bezier easing across every flip frame
      const origRender = render.render?.bind(render);
      if (origRender) {
        render.render = function (timer: number) {
          if (this.animation !== null) {
            const elapsed = timer - this.animation.startedAt;
            const progress = Math.min(1, Math.max(0, elapsed / this.animation.duration));
            // Luxurious cubic-bezier easeInOut for authentic paper physics
            const eased = progress < 0.5
              ? 4 * progress * progress * progress
              : 1 - Math.pow(-2 * progress + 2, 3) / 2;
            const frameIndex = Math.min(
              this.animation.frames.length - 1,
              Math.floor(eased * this.animation.frames.length)
            );

            if (progress < 1) {
              if (this.animation.frames[frameIndex]) {
                this.animation.frames[frameIndex]();
              }
            } else {
              if (this.animation.frames[this.animation.frames.length - 1]) {
                this.animation.frames[this.animation.frames.length - 1]();
              }
              this.animation.onAnimateEnd();
              this.animation = null;
            }
          }

          this.timer = timer;
          this.drawFrame();
        };
      }

      // Enhanced multi-stop diffuse shadows (FlippingBook style depth & penumbra)
      render.drawOuterShadow = function () {
        const rect = this.getRect();
        if (!this.shadow || !this.ctx) return;

        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(rect.left, rect.top, rect.width, rect.height);

        const shadowPos = this.convertToGlobal({ x: this.shadow.pos.x, y: this.shadow.pos.y });
        this.ctx.translate(shadowPos.x, shadowPos.y);
        this.ctx.rotate(Math.PI + this.shadow.angle + Math.PI / 2);

        const shadowWidth = this.shadow.width * 1.35;
        const outerGradient = this.ctx.createLinearGradient(0, 0, shadowWidth, 0);
        const op = Math.min(0.65, Math.max(0.1, this.shadow.opacity));

        if (this.shadow.direction === 0) {
          this.ctx.translate(0, -100);
          outerGradient.addColorStop(0, `rgba(0, 0, 0, ${op * 0.95})`);
          outerGradient.addColorStop(0.15, `rgba(0, 0, 0, ${op * 0.55})`);
          outerGradient.addColorStop(0.4, `rgba(0, 0, 0, ${op * 0.22})`);
          outerGradient.addColorStop(0.75, `rgba(0, 0, 0, ${op * 0.06})`);
          outerGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        } else {
          this.ctx.translate(-shadowWidth, -100);
          outerGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
          outerGradient.addColorStop(0.25, `rgba(0, 0, 0, ${op * 0.06})`);
          outerGradient.addColorStop(0.6, `rgba(0, 0, 0, ${op * 0.22})`);
          outerGradient.addColorStop(0.85, `rgba(0, 0, 0, ${op * 0.55})`);
          outerGradient.addColorStop(1, `rgba(0, 0, 0, ${op * 0.95})`);
        }

        this.ctx.clip();
        this.ctx.fillStyle = outerGradient;
        this.ctx.fillRect(0, 0, shadowWidth, rect.height * 2);
        this.ctx.restore();
      };

      render.drawInnerShadow = function () {
        const rect = this.getRect();
        if (!this.shadow || !this.ctx || !this.pageRect) return;

        this.ctx.save();
        this.ctx.beginPath();

        const shadowPos = this.convertToGlobal({ x: this.shadow.pos.x, y: this.shadow.pos.y });
        const pageRect = this.convertRectToGlobal(this.pageRect);
        this.ctx.moveTo(pageRect.topLeft.x, pageRect.topLeft.y);
        this.ctx.lineTo(pageRect.topRight.x, pageRect.topRight.y);
        this.ctx.lineTo(pageRect.bottomRight.x, pageRect.bottomRight.y);
        this.ctx.lineTo(pageRect.bottomLeft.x, pageRect.bottomLeft.y);
        this.ctx.translate(shadowPos.x, shadowPos.y);
        this.ctx.rotate(Math.PI + this.shadow.angle + Math.PI / 2);

        const isw = (this.shadow.width * 3) / 4;
        const innerGradient = this.ctx.createLinearGradient(0, 0, isw, 0);
        const op = Math.min(0.7, Math.max(0.12, this.shadow.opacity));

        if (this.shadow.direction === 0) {
          this.ctx.translate(-isw, -100);
          innerGradient.addColorStop(1, `rgba(0, 0, 0, ${op * 0.9})`);
          innerGradient.addColorStop(0.88, `rgba(0, 0, 0, ${op * 0.15})`);
          innerGradient.addColorStop(0.65, `rgba(0, 0, 0, ${op * 0.7})`);
          innerGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
        } else {
          this.ctx.translate(0, -100);
          innerGradient.addColorStop(0, `rgba(0, 0, 0, ${op * 0.9})`);
          innerGradient.addColorStop(0.12, `rgba(0, 0, 0, ${op * 0.15})`);
          innerGradient.addColorStop(0.35, `rgba(0, 0, 0, ${op * 0.7})`);
          innerGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        }

        this.ctx.clip();
        this.ctx.fillStyle = innerGradient;
        this.ctx.fillRect(0, 0, isw, rect.height * 2);
        this.ctx.restore();
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

    // Patch FlipController for silky smooth FlippingBook-style physics:
    // 1. Natural arched 3D cone curl trajectory (lifts corner over spine rather than flat diagonal line)
    // 2. Minimum ~820ms animation duration so page flips are graceful and visible
    // 3. Patches FlipCalculation to prevent premature snap and preserve continuous cursor tracking
    const flipController = (pf as any).getFlipController?.();
    if (flipController) {
      flipController.getAnimationDuration = function (size: number) {
        const defaultTime = this.app?.getSettings()?.flippingTime || 950;
        const calculated = (size / 1000) * defaultTime;
        return Math.max(820, Math.min(defaultTime, calculated));
      };

      const origAnimateFlippingTo = flipController.animateFlippingTo?.bind(flipController);
      flipController.animateFlippingTo = function (
        start: any,
        dest: any,
        isTurned: boolean,
        needReset = true
      ) {
        if (!this.calc) {
          return origAnimateFlippingTo?.(start, dest, isTurned, needReset);
        }

        const rect = this.getBoundsRect();
        const numSteps = Math.max(60, Math.min(180, Math.round(Math.abs(start.x - dest.x))));
        const isBottom = this.calc?.getCorner?.() === 'bottom';
        const arcSign = isBottom ? -1 : 1;
        // Natural 3D cone lift arc (FlippingBook style): corner lifts over the spine before settling
        const arcHeight = isTurned ? arcSign * (rect.height * 0.16) : 0;

        const points: any[] = [];
        for (let i = 0; i <= numSteps; i++) {
          const t = i / numSteps;
          const rawX = start.x + (dest.x - start.x) * t;
          const rawY = start.y + (dest.y - start.y) * t + arcHeight * Math.sin(Math.PI * t);
          points.push({ x: rawX, y: rawY });
        }

        const frames = points.map((p) => () => this.do(p));
        const duration = this.getAnimationDuration(points.length);

        this.render.startAnimation(frames, duration, () => {
          if (!this.calc) return;

          if (isTurned) {
            if (this.calc.getDirection() === 1) this.app.turnToPrevPage();
            else this.app.turnToNextPage();
          }

          if (needReset) {
            this.render.setBottomPage(null);
            this.render.setFlippingPage(null);
            this.render.clearShadow();

            this.setState('read');
            this.reset();
          }
        });
      };

      const origFold = flipController.fold?.bind(flipController);
      if (origFold) {
        flipController.fold = function (globalPos: any) {
          // If an animation was running (e.g., from corner hover or interrupted return), cancel it without resetting calc
          if (this.render && this.render.animation) {
            this.render.animation = null;
          }
          return origFold(globalPos);
        };
      }

      const origStart = flipController.start.bind(flipController);
      flipController.start = function (globalPos: any) {
        const res = origStart(globalPos);

        // Ensure flippingPage and bottomPage immediately have their real page images loaded if they were distant
        [this.flippingPage, this.bottomPage].forEach((pgObj: any) => {
          if (pgObj && typeof pgObj.__pageIdx === 'number') {
            const pData = pages[pgObj.__pageIdx];
            if (pData && pgObj.image && pgObj.image.src.startsWith('data:image/svg+xml')) {
              const realImg = new Image();
              realImg.decoding = 'async';
              realImg.onload = () => {
                pgObj.image = realImg;
                pgObj.isLoad = true;
                this.render?.update?.();
              };
              realImg.src = pData.image;
            }
          }
        });

        if (this.calc) {
          const proto = Object.getPrototypeOf(this.calc);
          if (!proto.__smoothPatched) {
            proto.__smoothPatched = true;
            proto.checkPositionAtCenterLine = function (
              checkedPos: { x: number; y: number },
              centerOne: { x: number; y: number },
              centerTwo: { x: number; y: number }
            ) {
              const W = this.pageWidth;
              const H = this.pageHeight;
              const clampedX = Math.max(-W + 1.5, Math.min(W - 1.5, checkedPos.x));

              // Smoothly guide y toward target corner as x approaches the far end of the opposite page (-W)
              // so the user can hold and drag the page all the way across the opposite page from any grab height y
              const u = Math.max(0, Math.min(1, (-clampedX - W * 0.15) / (W * 0.82)));
              const ease = 1 - u * u;
              let rawY = checkedPos.y;
              if (this.corner === 'bottom') {
                rawY = Math.min(H - 2, rawY);
                rawY = H - Math.max(2, (H - rawY) * ease);
              } else {
                rawY = Math.max(2, rawY);
                rawY = Math.max(2, rawY * ease);
              }

              let result = { x: clampedX, y: rawY };
              this.updateAngleAndGeometry(result);

              const tmp = limitPointToCircle(centerOne, W - 0.5, result);
              if (tmp !== result) {
                result = tmp;
                this.updateAngleAndGeometry(result);
              }

              const rad = Math.hypot(W, H) - 0.5;
              const checkPointTwo = this.corner === 'bottom' ? this.rect.bottomLeft : this.rect.topLeft;
              const bottomPoint = limitPointToCircle(centerTwo, rad, checkPointTwo);
              if (bottomPoint !== checkPointTwo) {
                result = bottomPoint;
                this.updateAngleAndGeometry(result);
              }

              return result;
            };
          }
        }
        return res;
      };

      const origGetDirectionByPoint = flipController.getDirectionByPoint?.bind(flipController);
      if (origGetDirectionByPoint) {
        flipController.getDirectionByPoint = function (bookPos: { x: number; y: number }) {
          if (this.render?.getOrientation?.() === 'portrait' && (pf as any).__lastDragDx !== undefined) {
            const dx = (pf as any).__lastDragDx as number;
            if (Math.abs(dx) > 2) {
              return dx > 0 ? 1 : 0;
            }
          }
          return origGetDirectionByPoint(bookPos);
        };
      }

      flipController.stopMove = function (forceSwipeTurn = false) {
        if (this.calc === null) return;
        const pos = this.calc.getPosition();
        const bounds = this.getBoundsRect();
        const destY = this.calc.getCorner() === 'bottom' ? bounds.height : 0;
        const isPortrait = this.render?.getOrientation?.() === 'portrait';
        const dir = this.calc.getDirection();

        const crossedThreshold = isPortrait
          ? dir === 0
            ? pos.x <= bounds.pageWidth * 0.55
            : pos.x <= -bounds.pageWidth * 0.45
          : pos.x <= 0;

        if (forceSwipeTurn || crossedThreshold) {
          this.animateFlippingTo(pos, { x: -bounds.pageWidth, y: destY }, true);
        } else {
          this.animateFlippingTo(pos, { x: bounds.pageWidth, y: destY }, false);
        }
      };
    }

    // Restrict page flip trigger strictly to:
    // 1. Clicking navigation arrows (flipNext / flipPrev), OR
    // 2. Actively dragging/flopping the page with mouse or finger (never on a simple click or tap!)
    (pf as any).userMove = function (pos: { x: number; y: number }, isTouch: boolean) {
      // If user started touching on mobile, start folding immediately on drag (> 6px) without 250ms delay
      if (isTouch && !this.isUserTouch && this.ui?.touchPoint) {
        const startPt = this.ui.touchPoint.point;
        if (Math.hypot(pos.x - startPt.x, pos.y - startPt.y) > 6) {
          this.__touchStartTime = this.ui.touchPoint.time;
          this.ui.touchPoint = null;
          this.startUserTouch(startPt);
        }
      }

      if (this.isUserTouch) {
        const dx = pos.x - this.mousePosition.x;
        const dy = pos.y - this.mousePosition.y;
        if (Math.hypot(dx, dy) > 6) {
          this.__lastDragDx = dx;
          if (!this.isUserMove && this.render?.getOrientation?.() === 'landscape') {
            // In landscape mode, only start folding when pulling inward toward the spine
            const bounds = this.render.getRect();
            const bookX = pos.x - bounds.left;
            if ((bookX >= bounds.width / 2 && dx > 2) || (bookX < bounds.width / 2 && dx < -2)) {
              return;
            }
          }
          this.isUserMove = true;
          this.flipController.fold(pos);
        }
      }
    };

    (pf as any).userStop = function (pos: { x: number; y: number }, isSwipe = false) {
      if (this.isUserTouch) {
        this.isUserTouch = false;
        if (!isSwipe && this.isUserMove) {
          const dx = this.mousePosition ? pos.x - this.mousePosition.x : 0;
          const dir = this.flipController?.calc?.getDirection?.();
          const swipeTurn =
            (dir === 0 && dx < -35) ||
            (dir === 1 && dx > 35);
          this.flipController.stopMove(swipeTurn);
        }
      }
      this.isUserMove = false;
      this.__lastDragDx = undefined;
    };

    pf.on('changeState', (e: any) => {
      const st = e.data;
      if (st === 'user_fold' || st === 'fold_corner') {
        // User is actively folding or holding the page corner with mouse or touch
        userTriggeredFlipRef.current = true;
        if (flippingTimer.current) clearTimeout(flippingTimer.current);
        setIsFlipping(true);
      } else if (st === 'flipping') {
        if (flippingTimer.current) clearTimeout(flippingTimer.current);
        setIsFlipping(true);
        flippingTimer.current = setTimeout(() => {
          setIsFlipping(false);
        }, 1400);
      } else if (st === 'read') {
        if (flippingTimer.current) clearTimeout(flippingTimer.current);
        setIsFlipping(false);
      }
    });

    pf.on('flip', (e) => {
      const pageIdx = e.data as number;
      const isActualPageChange = pageIdx !== currentRef.current;
      const isUserAction = userTriggeredFlipRef.current;
      userTriggeredFlipRef.current = false;

      setCurrent(pageIdx);
      setResumedBanner(null);
      (pf as any).__nvSyncImageWindow?.(pageIdx);

      // Play sound strictly when flipping the page (never on initial load, resize, thumbnails, search, or zoom)
      if (isUserAction && isActualPageChange && isSoundActiveRef.current && isInitializedRef.current) {
        playPageFlipSound();
      }

      // Prompt message when arriving at last page or first page
      if (isInitializedRef.current && isActualPageChange) {
        if (pageIdx >= pages.length - 1) {
          showToast('This is the last page.');
        } else if (pageIdx === 0) {
          showToast('This is the first page.');
        }
      }

      setPan({ x: 0, y: 0 });
      if (flippingTimer.current) clearTimeout(flippingTimer.current);
      flippingTimer.current = setTimeout(() => {
        setIsFlipping(false);
      }, 70);
      setTimeout(() => {
        updateBookPageStacks(pageIdx, pages.length, pf.getOrientation());
      }, 50);
      setTimeout(() => {
        updateBookPageStacks(pageIdx, pages.length, pf.getOrientation());
      }, 200);
    });

    pf.on('changeOrientation', (e) => {
      const o = e.data as 'portrait' | 'landscape';
      const actualIdx = pf.getCurrentPageIndex();
      userTriggeredFlipRef.current = false;
      setMode(o);
      setCurrent(actualIdx);
      setTimeout(() => {
        pf.update();
        updateBookPageStacks(pf.getCurrentPageIndex(), pages.length, o);
      }, 60);
    });

    pf.on('init', () => {
      setReady(true);
      setIsFlipping(false);
      userTriggeredFlipRef.current = false;
      pf.update();
      const o = pf.getOrientation();
      const actualIdx = pf.getCurrentPageIndex();
      setMode(o);
      setCurrent(actualIdx);
      setTimeout(() => {
        isInitializedRef.current = true;
      }, 400);
      setTimeout(() => {
        pf.update();
        updateBookPageStacks(pf.getCurrentPageIndex(), pages.length, o);
      }, 60);
      setTimeout(() => {
        pf.update();
        updateBookPageStacks(pf.getCurrentPageIndex(), pages.length, o);
      }, 200);
      setTimeout(() => {
        pf.update();
        updateBookPageStacks(pf.getCurrentPageIndex(), pages.length, o);
      }, 400);
    });

    flip.current = pf;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages, readingMode, updateBookPageStacks, singleWidth, singleHeight, settings.pageEffect]);

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

  // When container fit dimensions update, notify PageFlip to resize canvas and keep stacks aligned
  useEffect(() => {
    if (flip.current && fitWidth > 0 && fitHeight > 0) {
      try {
        flip.current.update();
        updateBookPageStacks(flip.current.getCurrentPageIndex(), pages.length, flip.current.getOrientation());
      } catch {
        // ignore
      }
    }
  }, [fitWidth, fitHeight, updateBookPageStacks, pages.length]);

  const goto = useCallback(
    (i: number) => {
      // Non-flip navigation (jumping via thumbnails, TOC, bookmarks, search) must not play flip sound
      userTriggeredFlipRef.current = false;
      const target = Math.max(0, Math.min(pages.length - 1, i));
      setCurrent(target);
      setResumedBanner(null);
      if (target >= pages.length - 1 && isInitializedRef.current) {
        showToast('This is the last page.');
      } else if (target === 0 && isInitializedRef.current) {
        showToast('This is the first page.');
      }
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
    [pages.length, readingMode, showToast]
  );

  const next = useCallback(() => {
    unlockAudio();
    if (current >= pages.length - 1) {
      showToast('This is the last page.');
      return;
    }
    if (readingMode === 'flip' && flip.current) {
      userTriggeredFlipRef.current = true;
      flip.current.flipNext();
    } else {
      goto(current + 1);
    }
  }, [readingMode, goto, current, pages.length, showToast]);

  const prev = useCallback(() => {
    unlockAudio();
    if (current === 0) {
      showToast('This is the first page.');
      return;
    }
    if (readingMode === 'flip' && flip.current) {
      userTriggeredFlipRef.current = true;
      flip.current.flipPrev();
    } else {
      goto(current - 1);
    }
  }, [readingMode, goto, current, showToast]);

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

  // Execute full-text search across publication pages via server endpoint or local cache
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }

    const t = setTimeout(() => {
      const localMatches: Array<{ page: number; snippet: string }> = [];
      pages.forEach((p) => {
        if (!p.text) return;
        const txt = p.text;
        const idx = txt.toLowerCase().indexOf(q.toLowerCase());
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
    }, 220);

    return () => clearTimeout(t);
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
    } else if (total > 1 && current >= total - 1 && total % 2 === 0) {
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
      onContextMenu={(e) => {
        if (settings.rightClickMenu === false) {
          e.preventDefault();
        }
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
      {/* Top Floating Header Bar (Minimalist Heyzine-Style Overlay with Full Customization) */}
      <div
        className="hz-header"
        style={{
          background: settings.toolbarColor
            ? (settings.toolbarOpacity !== undefined
                ? `${settings.toolbarColor}${Math.round(Math.min(1, Math.max(0, settings.toolbarOpacity)) * 255).toString(16).padStart(2, '0')}`
                : settings.toolbarColor)
            : undefined,
          color: settings.toolbarFontColor,
        }}
      >
        <div className="hz-title-wrap" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {settings.customLogoUrl ? (
            settings.openLogoIn !== 'none' && settings.logoTargetUrl ? (
              <a
                href={settings.logoTargetUrl}
                target={settings.openLogoIn === 'current_window' ? '_self' : '_blank'}
                rel="noopener noreferrer"
                className="hz-custom-header-logo"
                style={{
                  paddingLeft: settings.logoLeftPadding ? `${settings.logoLeftPadding}px` : undefined,
                  paddingTop: settings.logoTopPadding ? `${settings.logoTopPadding}px` : undefined,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <img
                  src={settings.customLogoUrl}
                  alt={settings.companyName || 'Logo'}
                  style={{ height: `${settings.logoHeight || 36}px`, objectFit: 'contain' }}
                />
              </a>
            ) : (
              <div
                className="hz-custom-header-logo"
                style={{
                  paddingLeft: settings.logoLeftPadding ? `${settings.logoLeftPadding}px` : undefined,
                  paddingTop: settings.logoTopPadding ? `${settings.logoTopPadding}px` : undefined,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <img
                  src={settings.customLogoUrl}
                  alt={settings.companyName || 'Logo'}
                  style={{ height: `${settings.logoHeight || 36}px`, objectFit: 'contain' }}
                />
              </div>
            )
          ) : null}
          {title && (
            <span className="hz-book-title" style={{ color: settings.toolbarFontColor }}>
              {title}
            </span>
          )}
        </div>

        <div className="hz-top-actions">
          {/* Author / Publisher Profile Button (Image 5) */}
          {settings.showProfileButton && (
            <button
              type="button"
              className={`hz-icon-btn ${showProfileModal ? 'ring-2 ring-amber-400' : ''}`}
              onClick={() => {
                setShowProfileModal(!showProfileModal);
                setShowQrModal(false);
              }}
              title={`Publisher Profile: ${settings.profileAuthor || 'Publisher'}`}
              aria-label="Publisher Profile"
              style={{ color: settings.toolbarButtonColor || settings.toolbarFontColor }}
            >
              👤
            </button>
          )}

          {/* Quick Mobile QR Code Button (Image 2 & 6) */}
          {settings.showQrCode && (
            <button
              type="button"
              className={`hz-icon-btn ${showQrModal ? 'ring-2 ring-amber-400' : ''}`}
              onClick={() => {
                setShowQrModal(!showQrModal);
                setShowProfileModal(false);
              }}
              title="QR Code for Mobile Reading"
              aria-label="QR Code"
              style={{ color: settings.toolbarButtonColor || settings.toolbarFontColor }}
            >
              📱
            </button>
          )}

          {/* One-Tap Mobile Landscape Fullscreen Button */}
          {!isFullscreen && (
            <button
              type="button"
              className="hz-mobile-landscape-btn"
              onClick={toggleFullscreen}
              title="Open in Landscape Full Mode"
              style={{ color: settings.toolbarButtonColor || settings.toolbarFontColor }}
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
              style={{ color: settings.toolbarButtonColor || settings.toolbarFontColor }}
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
            style={{ color: settings.toolbarButtonColor || settings.toolbarFontColor }}
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
            style={{ color: settings.toolbarButtonColor || settings.toolbarFontColor }}
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
              style={{ color: settings.toolbarButtonColor || settings.toolbarFontColor }}
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
            style={{ color: settings.toolbarButtonColor || settings.toolbarFontColor }}
          >
            {offlineSaved ? '✅' : cachingOffline ? '⏳' : '💾'}
          </button>

          {soundConfigEnabled && readingMode === 'flip' && (
            <button
              className="hz-icon-btn"
              onClick={() => setSoundMuted(!soundMuted)}
              title={soundMuted ? 'Turn Sound On' : 'Mute Sound'}
              style={{ color: settings.toolbarButtonColor || settings.toolbarFontColor }}
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
              style={{ color: settings.toolbarButtonColor || settings.toolbarFontColor }}
            >
              📥
            </a>
          )}

          {settings.showThumbnailsButton !== false && (
            <button
              className={`hz-icon-btn ${showThumbs ? 'ring-2 ring-amber-400' : ''}`}
              onClick={() => setShowThumbs(!showThumbs)}
              title="Toggle Page Thumbnails"
              style={{ color: settings.toolbarButtonColor || settings.toolbarFontColor }}
            >
              📑
            </button>
          )}

          <button
            className="hz-icon-btn hz-desktop-only"
            onClick={() => setShowShortcutsModal(true)}
            title="Keyboard Shortcuts & Theme Settings (Shortcut: ?)"
            style={{ color: settings.toolbarButtonColor || settings.toolbarFontColor }}
          >
            ⌨️
          </button>

          {settings.showFullscreenButton !== false && (
            <button
              className="hz-icon-btn"
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
              style={{ color: settings.toolbarButtonColor || settings.toolbarFontColor }}
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
          ref={stageRef}
          className="hz-stage"
          onMouseDown={handleStageMouseDown}
          onDoubleClick={handleStageDoubleClick}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{
            cursor: zoom > 1 ? (isDraggingState ? 'grabbing' : 'grab') : 'default',
            touchAction: zoom > 1 ? 'none' : 'pan-y',
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

          {settings.prevNextShortcut !== false && (
            <>
              <button
                className={`hz-side-arrow left ${current === 0 ? 'disabled' : ''} ${settings.prevNextMobile === false ? 'hz-desktop-only' : ''}`}
                onClick={prev}
                title="Previous Page (←)"
                disabled={current === 0}
                style={{
                  color: settings.prevNextColor,
                  backgroundColor: settings.prevNextBg,
                }}
              >
                ‹
              </button>

              <button
                className={`hz-side-arrow right ${current >= total - 1 ? 'disabled' : ''} ${settings.prevNextMobile === false ? 'hz-desktop-only' : ''}`}
                onClick={next}
                title="Next Page (→)"
                disabled={current >= total - 1}
                style={{
                  color: settings.prevNextColor,
                  backgroundColor: settings.prevNextBg,
                }}
              >
                ›
              </button>
            </>
          )}

          {!ready && (
            <div
              className="hz-loading-pill"
              style={{
                backgroundColor: settings.loadingBgColor || undefined,
                color: settings.loadingFontColor || undefined,
              }}
            >
              {settings.loadingImageUrl && (
                <img
                  src={settings.loadingImageUrl}
                  alt="Loading"
                  style={{
                    maxHeight: `${settings.loadingImageHeight || 44}px`,
                    marginBottom: '6px',
                    objectFit: 'contain',
                  }}
                />
              )}
              {settings.showLoadingAnimation !== false && <div className="hz-spinner" />}
              <span style={{ fontSize: settings.loadingFontSize ? `${settings.loadingFontSize}px` : undefined }}>
                {settings.loadingText || 'Loading publication…'}
              </span>
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
            const pageW = fitWidth > 0 ? (mode === 'landscape' ? fitWidth / 2 : fitWidth) : (bookBounds?.pageWidth || 0);
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
                  width: fitWidth > 0 ? `${fitWidth}px` : undefined,
                  height: fitHeight > 0 ? `${fitHeight}px` : undefined,
                  aspectRatio: fitWidth > 0 ? undefined : (mode === 'landscape' ? `${spreadAspect}` : `${pageAspect}`),
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

                {/* Razor-Sharp Native Image Overlay (Active only when zoomed > 1x; at 1x the Retina-scaled <canvas> renders directly with zero overlay interference) */}
                {ready && zoom > 1 && !isFlipping && (
                  <div
                    className="hz-crisp-page-overlay pointer-events-none absolute z-10 overflow-hidden"
                    style={{
                      left: `${Math.round(
                        mode === 'landscape' && current === 0
                          ? (fitWidth > 0 ? fitWidth / 2 : (bookBounds ? bookBounds.left + bookBounds.pageWidth : 0))
                          : (mode === 'landscape' && fitWidth === 0 && bookBounds ? bookBounds.left : 0)
                      )}px`,
                      top: 0,
                      width: `${Math.round(
                        mode === 'portrait'
                          ? (fitWidth > 0 ? fitWidth : (bookBounds?.pageWidth || 0))
                          : mode === 'landscape' && (current === 0 || (current >= total - 1 && total % 2 === 0))
                          ? (fitWidth > 0 ? fitWidth / 2 : (bookBounds?.pageWidth || 0))
                          : (fitWidth > 0 ? fitWidth : (bookBounds?.width || 0))
                      )}px`,
                      height: `${Math.round(fitHeight > 0 ? fitHeight : (bookBounds?.height || 0))}px`,
                      display: 'flex',
                      opacity: 1,
                    }}
                  >
                    {mode === 'portrait' || current === 0 || (current >= total - 1 && total % 2 === 0) ? (
                      pages[current] ? (
                        <div className="relative h-full w-full">
                          <img
                            src={hdLoadedPages[pages[current].n] || pages[current].image}
                            alt={`Page ${pages[current].n}`}
                            className="h-full w-full object-contain select-none"
                            draggable={false}
                            style={{
                              imageRendering: '-webkit-optimize-contrast',
                            }}
                          />
                          {/* Realistic Magazine Spine Shadow/Crease */}
                          {mode === 'landscape' && current === 0 && (
                            <div
                              className="pointer-events-none absolute inset-y-0 left-0 w-5 z-20"
                              style={{
                                background: 'linear-gradient(to right, rgba(0,0,0,0.24) 0%, rgba(0,0,0,0.08) 35%, rgba(255,255,255,0.14) 60%, rgba(0,0,0,0) 100%)',
                                mixBlendMode: 'multiply',
                              }}
                            />
                          )}
                          {mode === 'landscape' && current >= total - 1 && total % 2 === 0 && (
                            <div
                              className="pointer-events-none absolute inset-y-0 right-0 w-5 z-20"
                              style={{
                                background: 'linear-gradient(to left, rgba(0,0,0,0.24) 0%, rgba(0,0,0,0.08) 35%, rgba(255,255,255,0.14) 60%, rgba(0,0,0,0) 100%)',
                                mixBlendMode: 'multiply',
                              }}
                            />
                          )}
                        </div>
                      ) : null
                    ) : (
                      <>
                        <div className="relative h-full w-1/2 overflow-hidden">
                          {pages[current] && (
                            <img
                              src={hdLoadedPages[pages[current].n] || pages[current].image}
                              alt={`Page ${pages[current].n}`}
                              className="h-full w-full object-contain select-none"
                              draggable={false}
                              style={{
                                imageRendering: '-webkit-optimize-contrast',
                              }}
                            />
                          )}
                        </div>
                        <div className="relative h-full w-1/2 overflow-hidden">
                          {pages[current + 1] && (
                            <img
                              src={hdLoadedPages[pages[current + 1].n] || pages[current + 1].image}
                              alt={`Page ${pages[current + 1].n}`}
                              className="h-full w-full object-contain select-none"
                              draggable={false}
                              style={{
                                imageRendering: '-webkit-optimize-contrast',
                              }}
                            />
                          )}
                        </div>
                        {/* Subtle Center Magazine Spine Crease */}
                        <div
                          className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 w-6 z-20"
                          style={{
                            background: 'linear-gradient(to right, rgba(0,0,0,0.16) 0%, rgba(0,0,0,0.05) 25%, rgba(255,255,255,0.08) 50%, rgba(0,0,0,0.05) 75%, rgba(0,0,0,0.16) 100%)',
                            mixBlendMode: 'multiply',
                          }}
                        />
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

                {/* Watermark Overlay Layer */}
                {settings.watermarkEnabled && settings.watermarkText && (
                  <div
                    className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center overflow-hidden select-none"
                    style={{ opacity: (settings.watermarkOpacity ?? 15) / 100 }}
                  >
                    <div
                      className="whitespace-nowrap font-black tracking-widest text-slate-800 dark:text-white"
                      style={{
                        fontSize: '44px',
                        transform: `rotate(${settings.watermarkAngle ?? -30}deg)`,
                        userSelect: 'none',
                        letterSpacing: '0.25em',
                        textTransform: 'uppercase',
                      }}
                    >
                      {settings.watermarkText}
                    </div>
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
          <div
            className="hz-nav-pill"
            style={{
              background: settings.toolbarColor
                ? (settings.toolbarOpacity !== undefined
                    ? `${settings.toolbarColor}${Math.round(Math.min(1, Math.max(0, settings.toolbarOpacity)) * 255).toString(16).padStart(2, '0')}`
                    : settings.toolbarColor)
                : undefined,
            }}
          >
            <button
              className="hz-pill-btn"
              onClick={prev}
              disabled={current === 0}
              title="Previous Page (←)"
              style={{ color: settings.toolbarButtonColor || settings.toolbarFontColor }}
            >
              ‹
            </button>
            <span
              className="hz-pill-counter"
              style={{ color: settings.pageNumberFontColor || settings.toolbarFontColor }}
            >
              {pageDisplay}
            </span>
            <button
              className="hz-pill-btn"
              onClick={next}
              disabled={current >= total - 1}
              title="Next Page (→)"
              style={{ color: settings.toolbarButtonColor || settings.toolbarFontColor }}
            >
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
                  style={{ color: settings.toolbarButtonColor || settings.toolbarFontColor }}
                >
                  −
                </button>
                <input
                  type="range"
                  className="hz-zoom-slider"
                  min="1"
                  max="3.5"
                  step="0.05"
                  value={zoom}
                  onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
                  title={`Zoom: ${Math.round(zoom * 100)}% (Drag or touch to pan to any corner · High-Res HD activates > 125%)`}
                />
                <button
                  className="hz-pill-btn hz-zoom-btn"
                  onClick={() => handleZoomChange(zoom + 0.25)}
                  disabled={zoom >= 3.5}
                  title="Zoom In (+)"
                  style={{ color: settings.toolbarButtonColor || settings.toolbarFontColor }}
                >
                  +
                </button>
                <button
                  className="hz-pill-btn hz-zoom-label"
                  onClick={() => handleZoomChange(1)}
                  title="Reset zoom to 100% (0)"
                  style={{ color: settings.toolbarButtonColor || settings.toolbarFontColor }}
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
                style={{ color: settings.toolbarButtonColor || settings.toolbarFontColor }}
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

      {/* Author / Publisher Profile Modal (Image 5) */}
      {showProfileModal && (
        <div className="modal" onClick={() => setShowProfileModal(false)}>
          <div
            className="card max-w-md w-full space-y-4 p-6"
            style={{
              background: settings.panelBgColor || undefined,
              color: settings.panelFontColor || undefined,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b pb-3 border-slate-200 dark:border-slate-700">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Author Profile</h3>
              <button className="link" onClick={() => setShowProfileModal(false)}>
                ✕ Close
              </button>
            </div>

            <div className="flex items-center gap-4">
              {settings.profileAvatarUrl ? (
                <img
                  src={settings.profileAvatarUrl}
                  alt={settings.profileAuthor || 'Author'}
                  className="h-16 w-16 rounded-full object-cover border-2 border-amber-400 shadow-md"
                />
              ) : (
                <div className="h-16 w-16 rounded-full bg-amber-400/20 text-amber-500 font-bold flex items-center justify-center text-xl">
                  {settings.profileAuthor ? settings.profileAuthor.charAt(0).toUpperCase() : '👤'}
                </div>
              )}
              <div>
                <h4 className="text-base font-bold text-slate-900 dark:text-white">
                  {settings.profileAuthor || 'Publisher'}
                </h4>
                {settings.companyName && (
                  <p className="text-xs text-amber-500 font-medium">{settings.companyName}</p>
                )}
              </div>
            </div>

            {settings.profileDescription && (
              <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-line bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                {settings.profileDescription}
              </p>
            )}

            <div className="space-y-2 text-xs">
              {settings.profileEmail && (
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-500">Email:</span>
                  <a
                    href={`mailto:${settings.profileEmail}`}
                    className="text-amber-500 hover:underline"
                  >
                    {settings.profileEmail}
                  </a>
                </div>
              )}
              {settings.profileUrl && (
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-500">Website:</span>
                  <a
                    href={settings.profileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-amber-500 hover:underline"
                  >
                    {settings.profileUrl}
                  </a>
                </div>
              )}
              {settings.profilePhone && (
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-500">Phone:</span>
                  <a
                    href={`tel:${settings.profilePhone}`}
                    className="text-amber-500 hover:underline"
                  >
                    {settings.profilePhone}
                  </a>
                </div>
              )}
              {settings.profileAddress && (
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-500">Address:</span>
                  <span className="text-slate-700 dark:text-slate-300">{settings.profileAddress}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* QR Code Quick Modal (Image 2 & 6) */}
      {showQrModal && (
        <div className="modal" onClick={() => setShowQrModal(false)}>
          <div
            className="card max-w-sm w-full space-y-4 p-6 text-center"
            style={{
              background: settings.panelBgColor || undefined,
              color: settings.panelFontColor || undefined,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b pb-3 border-slate-200 dark:border-slate-700">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Scan to Read on Mobile</h3>
              <button className="link" onClick={() => setShowQrModal(false)}>
                ✕ Close
              </button>
            </div>

            <div className="mx-auto flex h-56 w-56 items-center justify-center rounded-2xl bg-white p-3 shadow-inner border border-slate-200">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(computedShareUrl)}`}
                alt="QR Code"
                className="h-full w-full object-contain"
              />
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Point your smartphone camera at this QR code to open the flipbook instantly on your mobile device.
            </p>

            <button
              type="button"
              className="btn btn-outline w-full py-2 text-xs"
              onClick={() => {
                if (navigator.clipboard?.writeText) {
                  navigator.clipboard.writeText(computedShareUrl);
                  setCopiedShareLink(true);
                  setTimeout(() => setCopiedShareLink(false), 2000);
                }
              }}
            >
              {copiedShareLink ? '✓ Copied Link!' : '📋 Copy Mobile Link'}
            </button>
          </div>
        </div>
      )}

      {/* First / Last Page Toast Popup */}
      {pageToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-16 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-amber-400/50 bg-slate-950/95 px-5 py-2.5 text-xs font-semibold text-white shadow-2xl backdrop-blur-md transition-all animate-fade-in"
          style={{
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 15px rgba(245, 197, 66, 0.25)',
          }}
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-400/20 text-amber-400 text-xs">
            📖
          </span>
          <span className="tracking-wide text-amber-200">{pageToast}</span>
          <button
            type="button"
            onClick={() => setPageToast(null)}
            className="ml-1 rounded-full p-0.5 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Close"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
