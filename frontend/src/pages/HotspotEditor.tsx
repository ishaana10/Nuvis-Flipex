import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import type { PageInfo } from '../components/FlipbookViewer';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import {
  Copy,
  Trash2,
  Plus,
  ExternalLink,
  Check,
  Tag,
  Layers,
  Eye,
} from '../components/ui/icons';

export type HotspotType = 'link' | 'video' | 'product' | 'page' | 'image' | 'audio';

export interface HotspotPayload {
  url?: string;
  title?: string;
  price?: string;
  sku?: string;
  description?: string;
  imageUrl?: string;
  ctaText?: string;
  whatsappPhone?: string;
  targetPage?: number;
  subType?: HotspotType;
}

export interface Hotspot {
  id?: number;
  pageNumber: number;
  type: HotspotType;
  x: number;
  y: number;
  w: number;
  h: number;
  payload: HotspotPayload;
}

interface FlipbookDetails {
  id: number;
  title: string;
  slug: string;
  pages: PageInfo[];
}

type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

type InteractionState =
  | {
      mode: 'draw';
      toolType: HotspotType;
      startX: number;
      startY: number;
      curX: number;
      curY: number;
    }
  | {
      mode: 'move';
      hotspotId: number;
      startPointerX: number;
      startPointerY: number;
      origX: number;
      origY: number;
      origW: number;
      origH: number;
    }
  | {
      mode: 'resize';
      hotspotId: number;
      handle: ResizeHandle;
      startPointerX: number;
      startPointerY: number;
      origX: number;
      origY: number;
      origW: number;
      origH: number;
    };

const HOTSPOT_TYPE_META: Record<
  HotspotType,
  { label: string; shortLabel: string; icon: string; badgeColor: string; borderClass: string }
> = {
  link: {
    label: 'Web Link',
    shortLabel: 'Link',
    icon: '🔗',
    badgeColor: 'bg-amber-400 text-slate-950',
    borderClass: 'border-amber-400 bg-amber-400/18',
  },
  product: {
    label: 'Product / Price Tag',
    shortLabel: 'Product',
    icon: '🛍️',
    badgeColor: 'bg-emerald-500 text-white',
    borderClass: 'border-emerald-400 bg-emerald-500/18',
  },
  video: {
    label: 'Video Modal',
    shortLabel: 'Video',
    icon: '🎬',
    badgeColor: 'bg-rose-500 text-white',
    borderClass: 'border-rose-400 bg-rose-500/18',
  },
  page: {
    label: 'Internal Page Jump',
    shortLabel: 'Page Jump',
    icon: '📄',
    badgeColor: 'bg-sky-500 text-white',
    borderClass: 'border-sky-400 bg-sky-500/18',
  },
  image: {
    label: 'Image Lightbox',
    shortLabel: 'Lightbox',
    icon: '🖼️',
    badgeColor: 'bg-purple-500 text-white',
    borderClass: 'border-purple-400 bg-purple-500/18',
  },
  audio: {
    label: 'Audio Clip',
    shortLabel: 'Audio',
    icon: '🔊',
    badgeColor: 'bg-indigo-500 text-white',
    borderClass: 'border-indigo-400 bg-indigo-500/18',
  },
};

function defaultPayloadForType(type: HotspotType): HotspotPayload {
  switch (type) {
    case 'product':
      return {
        title: 'Featured Catalogue Item',
        price: 'FJD $49.00',
        sku: 'SKU-001',
        description: 'Click to view full specifications, pricing, and instant inquiry options.',
        url: 'https://',
        ctaText: 'Buy Now',
        whatsappPhone: '',
      };
    case 'video':
      return {
        title: 'Product Video',
        url: 'https://www.youtube.com/watch?v=',
      };
    case 'page':
      return {
        title: 'Go to Page 2',
        targetPage: 2,
      };
    case 'image':
      return {
        title: 'Zoom High-Res Detail',
        imageUrl: 'https://',
      };
    case 'link':
    default:
      return {
        title: 'Visit Website',
        url: 'https://',
      };
  }
}

export default function HotspotEditor() {
  const { id } = useParams();
  const [details, setDetails] = useState<FlipbookDetails | null>(null);
  const [page, setPage] = useState<number>(1);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [activeDrawTool, setActiveDrawTool] = useState<HotspotType>('link');
  const [clipboardHotspot, setClipboardHotspot] = useState<Hotspot | null>(null);
  const [interaction, setInteraction] = useState<InteractionState | null>(null);
  const [snapGuides, setSnapGuides] = useState<{ x?: number; y?: number }>({});
  const [savingStatus, setSavingStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [onlyWithHotspots, setOnlyWithHotspots] = useState(false);

  const sheetRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const pendingPatchRef = useRef<Hotspot | null>(null);

  useEffect(() => {
    api<FlipbookDetails>(`/flipbooks/${id}`).then((d) => setDetails(d));
    api<Hotspot[]>(`/flipbooks/${id}/hotspots`).then((list) => setHotspots(list));
  }, [id]);

  const currentPage = useMemo(() => details?.pages.find((p) => p.n === page), [details, page]);
  const pageHotspots = useMemo(() => hotspots.filter((h) => h.pageNumber === page), [hotspots, page]);
  const selected = useMemo(
    () => hotspots.find((h) => h.id === selectedId) ?? null,
    [hotspots, selectedId]
  );

  const countsByPage = useMemo(() => {
    const map: Record<number, number> = {};
    for (const h of hotspots) {
      map[h.pageNumber] = (map[h.pageNumber] || 0) + 1;
    }
    return map;
  }, [hotspots]);

  // Flush any pending debounced PATCH to the server immediately
  const flushSave = useCallback(
    async (hotspotToSave?: Hotspot) => {
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      const target = hotspotToSave || pendingPatchRef.current;
      if (!target || !target.id || !id) return;
      pendingPatchRef.current = null;
      setSavingStatus('saving');
      try {
        await api(`/flipbooks/${id}/hotspots/${target.id}`, 'PATCH', target);
        setSavingStatus('saved');
      } catch {
        setSavingStatus('error');
      }
    },
    [id]
  );

  // Schedule a debounced PATCH (350ms) so typing or nudging never floods network requests
  const scheduleSave = useCallback(
    (updated: Hotspot) => {
      pendingPatchRef.current = updated;
      setSavingStatus('saving');
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = window.setTimeout(() => {
        void flushSave(updated);
      }, 350);
    },
    [flushSave]
  );

  const updateHotspotState = useCallback(
    (hid: number, updates: Partial<Hotspot>, immediate = false) => {
      setHotspots((prev) => {
        let nextTarget: Hotspot | null = null;
        const nextList = prev.map((h) => {
          if (h.id !== hid) return h;
          nextTarget = {
            ...h,
            ...updates,
            x: Math.round((updates.x ?? h.x) * 10) / 10,
            y: Math.round((updates.y ?? h.y) * 10) / 10,
            w: Math.round((updates.w ?? h.w) * 10) / 10,
            h: Math.round((updates.h ?? h.h) * 10) / 10,
          };
          return nextTarget;
        });
        if (nextTarget) {
          if (immediate) {
            void flushSave(nextTarget);
          } else {
            scheduleSave(nextTarget);
          }
        }
        return nextList;
      });
    },
    [flushSave, scheduleSave]
  );

  const createHotspot = useCallback(
    async (
      type: HotspotType,
      coords?: { x: number; y: number; w: number; h: number },
      customPayload?: HotspotPayload
    ) => {
      if (!id) return;
      setSavingStatus('saving');
      const offset = (pageHotspots.length % 5) * 3;
      const newHotspot: Hotspot = {
        pageNumber: page,
        type,
        x: coords ? Math.round(coords.x * 10) / 10 : Math.min(70, 20 + offset),
        y: coords ? Math.round(coords.y * 10) / 10 : Math.min(75, 22 + offset),
        w: coords ? Math.round(coords.w * 10) / 10 : type === 'product' ? 28 : 26,
        h: coords ? Math.round(coords.h * 10) / 10 : type === 'product' ? 14 : 10,
        payload: customPayload ? { ...customPayload } : defaultPayloadForType(type),
      };
      try {
        const created = await api<Hotspot>(`/flipbooks/${id}/hotspots`, 'POST', newHotspot);
        setHotspots((prev) => [...prev, created]);
        setSelectedId(created.id ?? null);
        setSavingStatus('saved');
      } catch {
        setSavingStatus('error');
      }
    },
    [id, page, pageHotspots.length]
  );

  const removeHotspot = useCallback(
    async (hid?: number) => {
      if (!hid || !id) return;
      setSavingStatus('saving');
      try {
        await api(`/flipbooks/${id}/hotspots/${hid}`, 'DELETE');
        setHotspots((prev) => prev.filter((h) => h.id !== hid));
        if (selectedId === hid) setSelectedId(null);
        setSavingStatus('saved');
      } catch {
        setSavingStatus('error');
      }
    },
    [id, selectedId]
  );

  const duplicateHotspot = useCallback(
    async (source: Hotspot, targetPageNumber = page) => {
      const samePage = source.pageNumber === targetPageNumber;
      await createHotspot(
        source.type,
        {
          x: samePage ? Math.min(95 - source.w, source.x + 3) : source.x,
          y: samePage ? Math.min(95 - source.h, source.y + 3) : source.y,
          w: source.w,
          h: source.h,
        },
        { ...source.payload }
      );
    },
    [createHotspot, page]
  );

  // Convert client pointer event to percentage coordinates (0..100) relative to the page sheet
  const getSheetCoords = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const el = sheetRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const x = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));
    return { x, y };
  };

  // Pointer Move / Up handlers for direct canvas drawing, dragging, and 8-handle resizing
  useEffect(() => {
    if (!interaction) return;

    const handlePointerMove = (e: PointerEvent) => {
      const pt = getSheetCoords(e.clientX, e.clientY);
      if (!pt) return;

      if (interaction.mode === 'draw') {
        setInteraction((prev) => (prev && prev.mode === 'draw' ? { ...prev, curX: pt.x, curY: pt.y } : prev));
        return;
      }

      const dx = pt.x - interaction.startPointerX;
      const dy = pt.y - interaction.startPointerY;

      if (interaction.mode === 'move') {
        let nx = Math.max(0, Math.min(100 - interaction.origW, interaction.origX + dx));
        let ny = Math.max(0, Math.min(100 - interaction.origH, interaction.origY + dy));

        // Magnetic center & sibling snap guides (within 1.2%)
        const guides: { x?: number; y?: number } = {};
        const centerX = nx + interaction.origW / 2;
        const centerY = ny + interaction.origH / 2;
        if (Math.abs(centerX - 50) < 1.2) {
          nx = 50 - interaction.origW / 2;
          guides.x = 50;
        }
        if (Math.abs(centerY - 50) < 1.2) {
          ny = 50 - interaction.origH / 2;
          guides.y = 50;
        }
        setSnapGuides(guides);

        setHotspots((prev) =>
          prev.map((h) =>
            h.id === interaction.hotspotId
              ? { ...h, x: Math.round(nx * 10) / 10, y: Math.round(ny * 10) / 10 }
              : h
          )
        );
      } else if (interaction.mode === 'resize') {
        let nx = interaction.origX;
        let ny = interaction.origY;
        let nw = interaction.origW;
        let nh = interaction.origH;
        const hdl = interaction.handle;

        if (hdl.includes('e')) {
          nw = Math.max(3, Math.min(100 - nx, interaction.origW + dx));
        }
        if (hdl.includes('s')) {
          nh = Math.max(3, Math.min(100 - ny, interaction.origH + dy));
        }
        if (hdl.includes('w')) {
          const maxDeltaX = interaction.origW - 3;
          const clampedDx = Math.max(-interaction.origX, Math.min(maxDeltaX, dx));
          nx = interaction.origX + clampedDx;
          nw = interaction.origW - clampedDx;
        }
        if (hdl.includes('n')) {
          const maxDeltaY = interaction.origH - 3;
          const clampedDy = Math.max(-interaction.origY, Math.min(maxDeltaY, dy));
          ny = interaction.origY + clampedDy;
          nh = interaction.origH - clampedDy;
        }

        setHotspots((prev) =>
          prev.map((h) =>
            h.id === interaction.hotspotId
              ? {
                  ...h,
                  x: Math.round(nx * 10) / 10,
                  y: Math.round(ny * 10) / 10,
                  w: Math.round(nw * 10) / 10,
                  h: Math.round(nh * 10) / 10,
                }
              : h
          )
        );
      }
    };

    const handlePointerUp = () => {
      setSnapGuides({});
      if (interaction.mode === 'draw') {
        const x = Math.min(interaction.startX, interaction.curX);
        const y = Math.min(interaction.startY, interaction.curY);
        const w = Math.abs(interaction.curX - interaction.startX);
        const h = Math.abs(interaction.curY - interaction.startY);
        setInteraction(null);
        // Only create a drawn hotspot if the user dragged at least 2.5% width/height
        if (w >= 2.5 && h >= 2.0) {
          void createHotspot(interaction.toolType, { x, y, w, h });
        } else {
          setSelectedId(null);
        }
        return;
      }

      const hid = interaction.hotspotId;
      setInteraction(null);
      const latest = hotspots.find((item) => item.id === hid);
      if (latest) {
        void flushSave(latest);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [interaction, hotspots, createHotspot, flushSave]);

  // Keyboard shortcuts: Arrow nudging, Delete, Ctrl+C / Ctrl+V copy-paste across pages
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && selected) {
        e.preventDefault();
        setClipboardHotspot(selected);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v' && clipboardHotspot) {
        e.preventDefault();
        void duplicateHotspot(clipboardHotspot, page);
        return;
      }

      if (!selected || !selected.id) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        void removeHotspot(selected.id);
        return;
      }

      const step = e.shiftKey ? 0.2 : 1.0;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        updateHotspotState(selected.id, { x: Math.max(0, selected.x - step) });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        updateHotspotState(selected.id, { x: Math.min(100 - selected.w, selected.x + step) });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        updateHotspotState(selected.id, { y: Math.max(0, selected.y - step) });
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        updateHotspotState(selected.id, { y: Math.min(100 - selected.h, selected.y + step) });
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selected, clipboardHotspot, page, duplicateHotspot, removeHotspot, updateHotspotState]);

  if (!details) return <p className="center">Loading Hotspot Studio 2.0…</p>;

  const visiblePages = onlyWithHotspots
    ? details.pages.filter((p) => (countsByPage[p.n] || 0) > 0 || p.n === page)
    : details.pages;

  return (
    <div className="editor-wrap flex flex-col min-h-[calc(100vh-24px)]">
      {/* Top Studio Header Bar */}
      <div className="preview-topbar flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/dashboard" className="btn-back">
            ← Flipbooks
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="preview-title font-bold">{details.title}</span>
              <Badge variant="golden">Hotspot Studio 2.0</Badge>
            </div>
            <p className="text-[11px] text-slate-400 m-0">
              Click &amp; drag directly on the page to draw a hotspot · Drag to move · 8-point resize · Ctrl+C / Ctrl+V across pages
            </p>
          </div>
        </div>

        {/* Center Quick Draw Tool Selector */}
        <div className="flex items-center gap-1.5 rounded-xl bg-slate-900/90 border border-slate-800 p-1">
          {(Object.keys(HOTSPOT_TYPE_META) as HotspotType[])
            .filter((t) => t !== 'audio')
            .map((t) => {
              const meta = HOTSPOT_TYPE_META[t];
              const isActive = activeDrawTool === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setActiveDrawTool(t)}
                  title={`Set active draw tool to ${meta.label} (or double-click to drop immediately)`}
                  onDoubleClick={() => void createHotspot(t)}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-amber-400 text-slate-950 shadow-sm'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <span>{meta.icon}</span>
                  <span>{meta.shortLabel}</span>
                </button>
              );
            })}
        </div>

        {/* Right Save Status & Preview CTA */}
        <div className="flex items-center gap-2.5">
          <div className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-900/70 border border-slate-800">
            {savingStatus === 'saving' && <span className="text-amber-400">⏳ Saving changes…</span>}
            {savingStatus === 'saved' && (
              <span className="text-emerald-400 flex items-center gap-1">
                <Check className="h-3.5 w-3.5" /> Auto-saved
              </span>
            )}
            {savingStatus === 'error' && <span className="text-red-400">⚠️ Save error</span>}
            {savingStatus === 'idle' && <span className="text-slate-400">{hotspots.length} total hotspots</span>}
          </div>
          <Link to={`/dashboard/preview/${details.id}`} className="btn-pub-primary">
            <Eye className="h-3.5 w-3.5" />
            <span>Preview Reader</span>
          </Link>
        </div>
      </div>

      {/* Main 3-Column Studio Layout: Left Page Thumbnails | Center Interactive Canvas | Right Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr_340px] gap-4 flex-1 mt-3 items-start">
        {/* 1. LEFT PANEL: Visual Page Thumbnail Strip & Hotspot Badges */}
        <div className="card p-3 flex flex-col max-h-[calc(100vh-120px)] overflow-hidden">
          <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-200 dark:border-slate-800">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-amber-500" />
              Pages ({details.pages.length})
            </span>
            <label className="flex items-center gap-1 text-[11px] text-slate-500 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyWithHotspots}
                onChange={(e) => setOnlyWithHotspots(e.target.checked)}
                className="rounded border-slate-300 text-amber-500"
              />
              <span>Tagged only</span>
            </label>
          </div>

          <div className="overflow-y-auto space-y-2 pr-1 flex-1">
            {visiblePages.map((p) => {
              const count = countsByPage[p.n] || 0;
              const isCurrent = p.n === page;
              return (
                <button
                  key={p.n}
                  type="button"
                  onClick={() => {
                    setPage(p.n);
                    setSelectedId(null);
                  }}
                  className={`w-full flex items-center gap-2.5 rounded-xl p-2 text-left transition-all border ${
                    isCurrent
                      ? 'border-amber-400 bg-amber-50/70 dark:bg-amber-400/10 shadow-sm'
                      : 'border-slate-200/80 dark:border-slate-800 hover:border-amber-400/50 bg-white dark:bg-slate-900/60'
                  }`}
                >
                  <img
                    src={p.thumb || p.image}
                    alt={`Page ${p.n}`}
                    loading="lazy"
                    className="h-14 w-11 rounded border border-slate-200 dark:border-slate-700 object-cover bg-slate-100 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-slate-900 dark:text-white">Page {p.n}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {count > 0 ? (
                        <span className="text-amber-600 dark:text-amber-400 font-semibold">
                          {count} hotspot{count > 1 ? 's' : ''}
                        </span>
                      ) : (
                        'No hotspots'
                      )}
                    </div>
                  </div>
                  {count > 0 && (
                    <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-400 px-1.5 text-[10px] font-extrabold text-slate-950">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. CENTER PANEL: Direct-Manipulation Interactive Page Canvas */}
        <div className="card p-4 flex flex-col items-center justify-center min-h-[calc(100vh-120px)] bg-slate-950/90 border-slate-800 relative overflow-auto">
          {/* Quick Page Bar + Add Button */}
          <div className="w-full flex flex-wrap items-center justify-between gap-2 mb-3 px-2">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => {
                  setPage((p) => Math.max(1, p - 1));
                  setSelectedId(null);
                }}
              >
                ‹ Prev Page
              </Button>
              <span className="text-xs font-bold text-white px-2">
                Page {page} of {details.pages.length}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= details.pages.length}
                onClick={() => {
                  setPage((p) => Math.min(details.pages.length, p + 1));
                  setSelectedId(null);
                }}
              >
                Next Page ›
              </Button>
            </div>

            <div className="flex items-center gap-2">
              {clipboardHotspot && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void duplicateHotspot(clipboardHotspot, page)}
                  title="Paste copied hotspot onto this page (Ctrl+V)"
                >
                  <Copy className="h-3.5 w-3.5 text-amber-400" />
                  Paste &ldquo;{clipboardHotspot.payload.title || clipboardHotspot.type}&rdquo;
                </Button>
              )}
              <Button
                size="sm"
                variant="default"
                onClick={() => void createHotspot(activeDrawTool)}
                title="Drop a new hotspot on the page"
              >
                <Plus className="h-3.5 w-3.5" />
                Add {HOTSPOT_TYPE_META[activeDrawTool].label}
              </Button>
            </div>
          </div>

          {currentPage ? (
            <div
              ref={sheetRef}
              onPointerDown={(e) => {
                // Only start drawing when clicking directly on the page sheet background
                if (e.button !== 0) return;
                const pt = getSheetCoords(e.clientX, e.clientY);
                if (!pt) return;
                setInteraction({
                  mode: 'draw',
                  toolType: activeDrawTool,
                  startX: pt.x,
                  startY: pt.y,
                  curX: pt.x,
                  curY: pt.y,
                });
              }}
              className="canvas-sheet relative select-none cursor-crosshair shadow-2xl rounded-lg overflow-hidden"
              style={{ maxWidth: '760px', width: '100%' }}
            >
              <img
                src={currentPage.image}
                alt={`Page ${page}`}
                draggable={false}
                className="sheet-image w-full h-auto block pointer-events-none select-none"
              />

              {/* Smart Center Alignment Snap Guides */}
              {snapGuides.x !== undefined && (
                <div
                  className="pointer-events-none absolute top-0 bottom-0 w-px bg-amber-400 shadow-[0_0_8px_#f5c542] z-30"
                  style={{ left: `${snapGuides.x}%` }}
                />
              )}
              {snapGuides.y !== undefined && (
                <div
                  className="pointer-events-none absolute left-0 right-0 h-px bg-amber-400 shadow-[0_0_8px_#f5c542] z-30"
                  style={{ top: `${snapGuides.y}%` }}
                />
              )}

              {/* Live Rubber-Band Rectangle While Drawing */}
              {interaction?.mode === 'draw' &&
                Math.abs(interaction.curX - interaction.startX) > 1 && (
                  <div
                    className="pointer-events-none absolute border-2 border-dashed border-amber-400 bg-amber-400/25 rounded-md z-30 flex items-center justify-center"
                    style={{
                      left: `${Math.min(interaction.startX, interaction.curX)}%`,
                      top: `${Math.min(interaction.startY, interaction.curY)}%`,
                      width: `${Math.abs(interaction.curX - interaction.startX)}%`,
                      height: `${Math.abs(interaction.curY - interaction.startY)}%`,
                    }}
                  >
                    <span className="rounded bg-slate-950/90 px-2 py-0.5 text-[10px] font-bold text-amber-400 shadow">
                      + {HOTSPOT_TYPE_META[interaction.toolType].label}
                    </span>
                  </div>
                )}

              {/* Existing Hotspots on Page */}
              {pageHotspots.map((h) => {
                const isSelected = selected?.id === h.id;
                const meta = HOTSPOT_TYPE_META[h.type] || HOTSPOT_TYPE_META.link;

                return (
                  <div
                    key={h.id}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      if (e.button !== 0 || !h.id) return;
                      setSelectedId(h.id);
                      const pt = getSheetCoords(e.clientX, e.clientY);
                      if (!pt) return;
                      setInteraction({
                        mode: 'move',
                        hotspotId: h.id,
                        startPointerX: pt.x,
                        startPointerY: pt.y,
                        origX: h.x,
                        origY: h.y,
                        origW: h.w,
                        origH: h.h,
                      });
                    }}
                    className={`absolute rounded-lg border-2 transition-shadow cursor-move ${meta.borderClass} ${
                      isSelected
                        ? 'ring-2 ring-amber-400 shadow-[0_0_20px_rgba(245,197,66,0.45)] z-20'
                        : 'hover:border-amber-300 z-10'
                    }`}
                    style={{
                      left: `${h.x}%`,
                      top: `${h.y}%`,
                      width: `${h.w}%`,
                      height: `${h.h}%`,
                    }}
                  >
                    {/* Top Label Pill inside Hotspot */}
                    <div className="pointer-events-none flex items-center gap-1 px-1.5 py-0.5 max-w-full overflow-hidden">
                      <span
                        className={`inline-flex items-center justify-center rounded px-1 py-0.2 text-[10px] font-bold shadow-sm ${meta.badgeColor}`}
                      >
                        {meta.icon}
                      </span>
                      <span className="truncate rounded bg-slate-950/85 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow">
                        {h.payload.title || meta.shortLabel}
                        {h.type === 'product' && h.payload.price ? ` · ${h.payload.price}` : ''}
                      </span>
                    </div>

                    {/* 8-Point Resize Handles when Selected */}
                    {isSelected &&
                      h.id &&
                      (['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as ResizeHandle[]).map((hdl) => {
                        const posStyle: React.CSSProperties = {
                          top: hdl.includes('n') ? '-5px' : hdl.includes('s') ? 'calc(100% - 5px)' : 'calc(50% - 5px)',
                          left: hdl.includes('w') ? '-5px' : hdl.includes('e') ? 'calc(100% - 5px)' : 'calc(50% - 5px)',
                          cursor: `${hdl}-resize`,
                        };
                        return (
                          <div
                            key={hdl}
                            style={posStyle}
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              if (!h.id) return;
                              const pt = getSheetCoords(e.clientX, e.clientY);
                              if (!pt) return;
                              setInteraction({
                                mode: 'resize',
                                hotspotId: h.id,
                                handle: hdl,
                                startPointerX: pt.x,
                                startPointerY: pt.y,
                                origX: h.x,
                                origY: h.y,
                                origW: h.w,
                                origH: h.h,
                              });
                            }}
                            className="absolute h-2.5 w-2.5 rounded-full border border-slate-950 bg-amber-400 shadow z-30"
                          />
                        );
                      })}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-slate-400">Page not found</p>
          )}
        </div>

        {/* 3. RIGHT PANEL: Hotspot Inspector & Page Layer List */}
        <div className="card p-4 flex flex-col gap-4 max-h-[calc(100vh-120px)] overflow-y-auto">
          {selected && selected.id ? (
            <div className="space-y-3.5">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-base">{HOTSPOT_TYPE_META[selected.type]?.icon || '🔗'}</span>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white m-0">
                      {HOTSPOT_TYPE_META[selected.type]?.label || 'Hotspot'}
                    </h4>
                    <span className="text-[10px] text-slate-500">
                      ID #{selected.id} · Page {selected.pageNumber}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setClipboardHotspot(selected);
                      void duplicateHotspot(selected, page);
                    }}
                    title="Duplicate hotspot (or Ctrl+C / Ctrl+V)"
                    className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeHotspot(selected.id)}
                    title="Delete hotspot (Delete key)"
                    className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Hotspot Type Switcher */}
              <label className="field">
                <span className="text-xs font-semibold">Hotspot Interaction Type</span>
                <select
                  value={selected.type}
                  onChange={(e) => {
                    const nextType = e.target.value as HotspotType;
                    updateHotspotState(
                      selected.id!,
                      {
                        type: nextType,
                        payload: {
                          ...defaultPayloadForType(nextType),
                          ...selected.payload,
                          subType: nextType,
                        },
                      },
                      true
                    );
                  }}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium"
                >
                  <option value="link">🔗 External / Web Link</option>
                  <option value="product">🛍️ Product / Price Spotlight Tag</option>
                  <option value="video">🎬 Video Lightbox (YouTube / MP4)</option>
                  <option value="page">📄 Internal Page Jump (TOC / Index)</option>
                  <option value="image">🖼️ High-Res Image Lightbox</option>
                </select>
              </label>

              {/* Title / Label */}
              <label className="field">
                <span className="text-xs font-semibold">
                  {selected.type === 'product' ? 'Product Name' : 'Tooltip / Button Label'}
                </span>
                <input
                  type="text"
                  value={selected.payload.title ?? ''}
                  placeholder="e.g. Shop Summer Collection"
                  onChange={(e) =>
                    updateHotspotState(selected.id!, {
                      payload: { ...selected.payload, title: e.target.value },
                    })
                  }
                />
              </label>

              {/* PRODUCT-SPECIFIC FIELDS */}
              {selected.type === 'product' && (
                <div className="space-y-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    <Tag className="h-3.5 w-3.5" />
                    <span>Commerce &amp; Inquiry Spotlight</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="field m-0">
                      <span className="text-[11px]">Price Badge</span>
                      <input
                        type="text"
                        placeholder="FJD $49.00"
                        value={selected.payload.price ?? ''}
                        onChange={(e) =>
                          updateHotspotState(selected.id!, {
                            payload: { ...selected.payload, price: e.target.value },
                          })
                        }
                      />
                    </label>
                    <label className="field m-0">
                      <span className="text-[11px]">SKU / Code</span>
                      <input
                        type="text"
                        placeholder="SKU-104"
                        value={selected.payload.sku ?? ''}
                        onChange={(e) =>
                          updateHotspotState(selected.id!, {
                            payload: { ...selected.payload, sku: e.target.value },
                          })
                        }
                      />
                    </label>
                  </div>
                  <label className="field m-0">
                    <span className="text-[11px]">Product Description / Specs</span>
                    <textarea
                      rows={2}
                      placeholder="Dimensions, stock availability, or promo offer..."
                      value={selected.payload.description ?? ''}
                      onChange={(e) =>
                        updateHotspotState(selected.id!, {
                          payload: { ...selected.payload, description: e.target.value },
                        })
                      }
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 text-xs"
                    />
                  </label>
                  <label className="field m-0">
                    <span className="text-[11px]">Product Photo URL (optional)</span>
                    <input
                      type="url"
                      placeholder="https://example.com/product.jpg"
                      value={selected.payload.imageUrl ?? ''}
                      onChange={(e) =>
                        updateHotspotState(selected.id!, {
                          payload: { ...selected.payload, imageUrl: e.target.value },
                        })
                      }
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="field m-0">
                      <span className="text-[11px]">CTA Button Text</span>
                      <input
                        type="text"
                        placeholder="Buy Now"
                        value={selected.payload.ctaText ?? ''}
                        onChange={(e) =>
                          updateHotspotState(selected.id!, {
                            payload: { ...selected.payload, ctaText: e.target.value },
                          })
                        }
                      />
                    </label>
                    <label className="field m-0">
                      <span className="text-[11px]">WhatsApp Number</span>
                      <input
                        type="text"
                        placeholder="+6799990000"
                        value={selected.payload.whatsappPhone ?? ''}
                        onChange={(e) =>
                          updateHotspotState(selected.id!, {
                            payload: { ...selected.payload, whatsappPhone: e.target.value },
                          })
                        }
                      />
                    </label>
                  </div>
                  <label className="field m-0">
                    <span className="text-[11px]">Checkout / Product Page URL</span>
                    <input
                      type="url"
                      placeholder="https://store.example.com/item"
                      value={selected.payload.url ?? ''}
                      onChange={(e) =>
                        updateHotspotState(selected.id!, {
                          payload: { ...selected.payload, url: e.target.value },
                        })
                      }
                    />
                  </label>
                </div>
              )}

              {/* INTERNAL PAGE JUMP FIELDS */}
              {selected.type === 'page' && (
                <label className="field">
                  <span className="text-xs font-semibold">Target Page Number (1 – {details.pages.length})</span>
                  <select
                    value={selected.payload.targetPage ?? 1}
                    onChange={(e) => {
                      const targetPage = Number(e.target.value);
                      updateHotspotState(selected.id!, {
                        payload: {
                          ...selected.payload,
                          targetPage,
                          title: selected.payload.title || `Jump to Page ${targetPage}`,
                        },
                      });
                    }}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium"
                  >
                    {details.pages.map((p) => (
                      <option key={p.n} value={p.n}>
                        Page {p.n}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {/* IMAGE LIGHTBOX FIELDS */}
              {selected.type === 'image' && (
                <label className="field">
                  <span className="text-xs font-semibold">High-Res Zoom Image URL</span>
                  <input
                    type="url"
                    placeholder="https://example.com/high-res-photo.jpg"
                    value={selected.payload.imageUrl ?? selected.payload.url ?? ''}
                    onChange={(e) =>
                      updateHotspotState(selected.id!, {
                        payload: {
                          ...selected.payload,
                          imageUrl: e.target.value,
                          url: e.target.value,
                        },
                      })
                    }
                  />
                </label>
              )}

              {/* STANDARD LINK OR VIDEO URL */}
              {(selected.type === 'link' || selected.type === 'video') && (
                <label className="field">
                  <span className="text-xs font-semibold flex items-center justify-between">
                    <span>{selected.type === 'video' ? 'YouTube / Vimeo / MP4 URL' : 'Destination URL'}</span>
                    {selected.payload.url && selected.payload.url.startsWith('http') && (
                      <a
                        href={selected.payload.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-amber-500 hover:underline inline-flex items-center gap-0.5"
                      >
                        Test <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    )}
                  </span>
                  <input
                    type="url"
                    value={selected.payload.url ?? ''}
                    placeholder={
                      selected.type === 'video' ? 'https://youtube.com/watch?v=...' : 'https://example.com'
                    }
                    onChange={(e) =>
                      updateHotspotState(selected.id!, {
                        payload: { ...selected.payload, url: e.target.value },
                      })
                    }
                  />
                </label>
              )}

              {/* Precision Geometry Coordinates (%) */}
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                  Geometry (% of Page · Arrow Keys to Nudge)
                </span>
                <div className="coord-grid">
                  <label className="field m-0">
                    <span>Left (X%)</span>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="98"
                      value={selected.x}
                      onChange={(e) => updateHotspotState(selected.id!, { x: Number(e.target.value) })}
                    />
                  </label>
                  <label className="field m-0">
                    <span>Top (Y%)</span>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="98"
                      value={selected.y}
                      onChange={(e) => updateHotspotState(selected.id!, { y: Number(e.target.value) })}
                    />
                  </label>
                  <label className="field m-0">
                    <span>Width (%)</span>
                    <input
                      type="number"
                      step="0.5"
                      min="2"
                      max="100"
                      value={selected.w}
                      onChange={(e) => updateHotspotState(selected.id!, { w: Number(e.target.value) })}
                    />
                  </label>
                  <label className="field m-0">
                    <span>Height (%)</span>
                    <input
                      type="number"
                      step="0.5"
                      min="2"
                      max="100"
                      value={selected.h}
                      onChange={(e) => updateHotspotState(selected.id!, { h: Number(e.target.value) })}
                    />
                  </label>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-800 p-5 text-center">
              <div className="text-2xl mb-1">🎯</div>
              <h4 className="text-xs font-bold text-slate-900 dark:text-white mb-1">
                Draw or Select a Hotspot
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 m-0">
                Click and drag anywhere on the page canvas to draw a new{' '}
                <b>{HOTSPOT_TYPE_META[activeDrawTool].label}</b>, or click an existing hotspot to edit its properties.
              </p>
            </div>
          )}

          {/* Page Hotspot Layer List */}
          <div className="border-t border-slate-200 dark:border-slate-800 pt-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 m-0">
                Page {page} Layers ({pageHotspots.length})
              </h4>
            </div>
            {pageHotspots.length === 0 ? (
              <p className="text-xs text-slate-400 m-0">
                No hotspots on Page {page} yet. Drag on the page canvas to draw one!
              </p>
            ) : (
              <div className="space-y-1.5">
                {pageHotspots.map((h) => {
                  const meta = HOTSPOT_TYPE_META[h.type] || HOTSPOT_TYPE_META.link;
                  const isSel = selected?.id === h.id;
                  return (
                    <div
                      key={h.id}
                      onClick={() => setSelectedId(h.id ?? null)}
                      className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 cursor-pointer transition-all ${
                        isSel
                          ? 'border-amber-400 bg-amber-50/80 dark:bg-amber-400/10'
                          : 'border-slate-200/80 dark:border-slate-800 hover:border-amber-400/50'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm shrink-0">{meta.icon}</span>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {h.payload.title || meta.label}
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">
                            {h.type === 'product'
                              ? `${h.payload.price || 'Price tag'} · ${h.payload.sku || 'Product'}`
                              : h.type === 'page'
                                ? `Jumps to Page ${h.payload.targetPage || 1}`
                                : h.payload.url || h.payload.imageUrl || 'No URL set'}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void removeHotspot(h.id);
                        }}
                        title="Delete hotspot"
                        className="text-slate-400 hover:text-red-500 p-1"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
