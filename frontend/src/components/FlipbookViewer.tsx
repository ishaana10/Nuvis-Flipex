import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { PageFlip } from 'page-flip';
import { playPageFlipSound, unlockAudio } from '../utils/sound';
import { getCanvasDpr, getReaderProfile, pagesToLoad } from './viewer/adaptiveLoading';
import { SliderStage, CardsDeckStage, CoverflowStage } from './viewer/PageEffectStages';
import type { FlipbookSettings } from './CustomizationDialog';
import { api } from '../api/client';

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
  type: 'link' | 'video' | 'product' | 'page' | 'image' | 'audio';
  x: number;
  y: number;
  w: number;
  h: number;
  pageNumber?: number;
  payload: {
    url?: string;
    title?: string;
    price?: string;
    sku?: string;
    description?: string;
    imageUrl?: string;
    ctaText?: string;
    whatsappPhone?: string;
    targetPage?: number;
  };
}

export type ViewerSettings = FlipbookSettings;

export interface PageToastData {
  type: 'first' | 'last' | 'info';
  title: string;
  message: string;
  badge?: string;
  actionLabel?: string;
  onAction?: () => void;
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

// Sleek Monochrome SVG Vector Icons for Viewer Toolbar & Panels (Inheriting toolbar color without OS emoji color artifacts)
const SvgSearch = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);
const SvgList = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" />
  </svg>
);
const SvgBookmark = ({ filled }: { filled?: boolean }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </svg>
);
const SvgShare = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
);
const SvgSaveOffline = ({ saved, caching }: { saved?: boolean; caching?: boolean }) => {
  if (saved) {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6L9 17l-5-5" />
      </svg>
    );
  }
  if (caching) {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
    );
  }
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  );
};
const SvgVolume = ({ muted }: { muted?: boolean }) => {
  if (muted) {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" />
      </svg>
    );
  }
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
};
const SvgDownload = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);
const SvgGrid = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="7" height="7" x="3" y="3" rx="1.5" /><rect width="7" height="7" x="14" y="3" rx="1.5" />
    <rect width="7" height="7" x="14" y="14" rx="1.5" /><rect width="7" height="7" x="3" y="14" rx="1.5" />
  </svg>
);
const SvgKeyboard = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="20" height="16" x="2" y="4" rx="2" />
    <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10" />
  </svg>
);
const SvgFullscreen = ({ isFs }: { isFs?: boolean }) => {
  if (isFs) {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
      </svg>
    );
  }
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
    </svg>
  );
};
const SvgUser = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
  </svg>
);
const SvgQr = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="6" height="6" x="3" y="3" rx="1" /><rect width="6" height="6" x="15" y="3" rx="1" />
    <rect width="6" height="6" x="3" y="15" rx="1" /><path d="M15 15h2v2h-2zM19 19h2v2h-2zM15 19h2v2h-2zM19 15h2v2h-2z" />
  </svg>
);
const SvgClose = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
const SvgGraduation = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
    <path d="M6 12v5c3 3 9 3 12 0v-5" />
  </svg>
);
const SvgNote = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

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
  const normalizedPageEffect = (settings.pageEffect || 'magazine').toLowerCase().replace(/\s+/g, '_');
  const isSliderEffect = normalizedPageEffect === 'slider';
  const isCardsEffect = normalizedPageEffect === 'cards';
  const isCoverflowEffect = normalizedPageEffect === 'coverflow';
  const isCustomStageEffect = isSliderEffect || isCardsEffect || isCoverflowEffect;
  const [soundMuted, setSoundMuted] = useState(false);

  // Drawers & Modals
  const [showThumbs, setShowThumbs] = useState(false);
  const [showToc, setShowToc] = useState(false);
  const [tocFilter, setTocFilter] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [pageToast, setPageToast] = useState<PageToastData | null>(null);

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
  const gotoRef = useRef<(i: number) => void>(() => {});
  const showToast = useCallback(
    (data: PageToastData) => {
      if (settings.firstLastPagePrompt === false) return;
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      setPageToast(data);
      toastTimerRef.current = setTimeout(() => {
        setPageToast(null);
      }, 3800);
    },
    [settings.firstLastPagePrompt]
  );

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
  const [activeProduct, setActiveProduct] = useState<ViewerHotspot | null>(null);
  const [showProductInquiryForm, setShowProductInquiryForm] = useState(false);
  const [productInquiryName, setProductInquiryName] = useState('');
  const [productInquiryEmail, setProductInquiryEmail] = useState('');
  const [productInquiryPhone, setProductInquiryPhone] = useState('');
  const [productInquiryQty, setProductInquiryQty] = useState(1);
  const [productInquiryNotes, setProductInquiryNotes] = useState('');
  const [productInquiryBusy, setProductInquiryBusy] = useState(false);
  const [productInquirySuccess, setProductInquirySuccess] = useState('');
  const [activeLightboxImage, setActiveLightboxImage] = useState<{ url: string; title: string } | null>(null);
  const [scrubPreviewPage, setScrubPreviewPage] = useState<number | null>(null);

  // Phase 4: Educational Features State (Worksheets, Notes, Presentation Mode)
  const [showEduResources, setShowEduResources] = useState(false);
  const [eduResources, setEduResources] = useState<Array<{
    id: number;
    pageNumber: number | null;
    title: string;
    resourceType: string;
    fileUrl: string;
    externalUrl: string;
    description: string;
    downloadCount?: number;
  }>>([]);
  const [showStudyNotes, setShowStudyNotes] = useState(false);
  const [studyNotes, setStudyNotes] = useState<Array<{
    id?: number;
    pageNumber: number;
    studentName: string;
    annotationType: string;
    color: string;
    noteText: string;
    createdAt?: string;
  }>>([]);
  const [newNoteText, setNewNoteText] = useState('');
  const [newNoteColor, setNewNoteColor] = useState('#fef08a');
  const [presentationMode, setPresentationMode] = useState(false);
  const [laserPointer, setLaserPointer] = useState(true);
  const [pointerPos, setPointerPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    if (!presentationMode) return;
    const handleMove = (e: MouseEvent) => {
      setPointerPos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMove);
    return () => window.removeEventListener('mousemove', handleMove);
  }, [presentationMode]);

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/v1/public/${slug}/resources`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.resources && Array.isArray(d.resources)) setEduResources(d.resources);
      })
      .catch(() => {});

    let studentId = '';
    try {
      studentId = localStorage.getItem('flipex_student_id') || '';
      if (!studentId) {
        studentId = 'std_' + Math.random().toString(36).slice(2, 9);
        localStorage.setItem('flipex_student_id', studentId);
      }
    } catch {
      studentId = 'default_student';
    }

    fetch(`/api/v1/public/${slug}/annotations?student=${encodeURIComponent(studentId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.annotations && Array.isArray(d.annotations)) setStudyNotes(d.annotations);
      })
      .catch(() => {});

    // Phase 5: Pacific Advertising Sponsored Spotlight
    fetch('/api/v1/public/ads/serve?placement_type=sidebar_spotlight&limit=1')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.ads && d.ads.length > 0) setSponsorAd(d.ads[0]);
      })
      .catch(() => {});
  }, [slug]);

  const [sponsorAd, setSponsorAd] = useState<{
    id: number;
    campaignName: string;
    advertiserName: string;
    targetUrl: string;
    bannerImageUrl: string;
    headline: string;
  } | null>(null);

  const handleAddStudyNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteText.trim() || !slug) return;
    let studentId = 'default_student';
    try {
      studentId = localStorage.getItem('flipex_student_id') || 'default_student';
    } catch {}
    const pageNumber = current + 1;
    const noteItem = {
      pageNumber,
      studentName: 'Student',
      annotationType: 'note',
      color: newNoteColor,
      noteText: newNoteText.trim(),
      createdAt: new Date().toISOString(),
    };
    setStudyNotes((prev) => [...prev, noteItem]);
    setNewNoteText('');
    try {
      await fetch(`/api/v1/public/${slug}/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageNumber,
          studentName: 'Student',
          studentIdentifier: studentId,
          annotationType: 'note',
          color: newNoteColor,
          noteText: noteItem.noteText,
        }),
      });
    } catch {
      // locally preserved
    }
  };

  const handleDeleteStudyNote = async (noteId?: number, idx?: number) => {
    if (noteId && slug) {
      fetch(`/api/v1/public/${slug}/annotations/${noteId}`, { method: 'DELETE' }).catch(() => {});
    }
    setStudyNotes((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleExportStudyNotes = () => {
    if (studyNotes.length === 0) {
      alert('No study notes recorded yet for this publication.');
      return;
    }
    const lines = studyNotes
      .map(
        (n) =>
          `[Page ${n.pageNumber}] ${n.createdAt ? new Date(n.createdAt).toLocaleString() : ''}\n${n.noteText}\n----------------------------------`
      )
      .join('\n\n');
    const content = `STUDY REVISION NOTES\nPublication: ${title || 'Nuvis Flipex'}\nExported: ${new Date().toLocaleString()}\n==================================\n\n${lines}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u;
    a.download = `Study-Notes-${slug || 'notes'}.txt`;
    a.click();
    URL.revokeObjectURL(u);
  };

  // Zoom & Pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDraggingState, setIsDraggingState] = useState(false);
  const [hdLoadedPages, setHdLoadedPages] = useState<Record<number, string>>({});
  const [bookBounds, setBookBounds] = useState<{ left: number; top: number; width: number; height: number; pageWidth: number } | null>(null);
  const [isFlipping, setIsFlipping] = useState(false);
  const [flippingToCover, setFlippingToCover] = useState(false);
  const flippingToCoverRef = useRef(false);
  const [flippingToBackCover, setFlippingToBackCover] = useState(false);
  const flippingToBackCoverRef = useRef(false);
  const [openingFromCover, setOpeningFromCover] = useState(false);
  const openingFromCoverRef = useRef(false);
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
  const prevLoggedPageRef = useRef<number>(current);

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

  // Send telemetry helper (supports standard fetch + keepalive / sendBeacon for unload flush)
  const sendTelemetry = useCallback(
    (eventType: string, payload: Record<string, any> = {}, useBeacon = false) => {
      if (!enableTelemetry || !slug) return;
      const endpoint = `/api/v1/public/${slug}/telemetry`;
      const bodyStr = JSON.stringify({
        sessionId,
        eventType,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timezoneOffset: new Date().getTimezoneOffset(),
        utmSource: utmParams.utm_source || undefined,
        utmMedium: utmParams.utm_medium || undefined,
        utmCampaign: utmParams.utm_campaign || undefined,
        ...payload,
      });

      if (useBeacon && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        try {
          const blob = new Blob([bodyStr], { type: 'application/json' });
          if (navigator.sendBeacon(endpoint, blob)) return;
        } catch {
          // fallback to fetch keepalive below
        }
      }

      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: bodyStr,
        keepalive: useBeacon,
      }).catch(() => {});
    },
    [enableTelemetry, slug, sessionId, utmParams]
  );

  // Persist last-read page and send accurate dwell-time telemetry on page change
  useEffect(() => {
    try {
      localStorage.setItem(lastPageStorageKey, String(current));
    } catch {
      // ignore
    }

    const now = Date.now();
    const dwelledPage = prevLoggedPageRef.current;
    const dwellMs = now - pageEnterTimestamp.current;
    pageEnterTimestamp.current = now;
    prevLoggedPageRef.current = current;

    if (dwellMs >= 800) {
      sendTelemetry('page_view', {
        pageNumber: dwelledPage + 1,
        durationMs: Math.min(dwellMs, 300000),
      });
    }
  }, [current, lastPageStorageKey, sendTelemetry]);

  // Flush final-page dwell time when the reader hides the tab or closes the browser window
  useEffect(() => {
    if (!enableTelemetry || !slug) return;

    const flushFinalDwell = () => {
      const now = Date.now();
      const dwellMs = now - pageEnterTimestamp.current;
      pageEnterTimestamp.current = now;
      if (dwellMs >= 800) {
        sendTelemetry(
          'page_view',
          {
            pageNumber: currentRef.current + 1,
            durationMs: Math.min(dwellMs, 300000),
          },
          true
        );
      }
    };

    const onVisChange = () => {
      if (document.visibilityState === 'hidden') {
        flushFinalDwell();
      } else {
        pageEnterTimestamp.current = Date.now();
      }
    };

    window.addEventListener('pagehide', flushFinalDwell);
    document.addEventListener('visibilitychange', onVisChange);
    return () => {
      window.removeEventListener('pagehide', flushFinalDwell);
      document.removeEventListener('visibilitychange', onVisChange);
    };
  }, [enableTelemetry, slug, sendTelemetry]);

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

  // Tiered Priority Multi-Resolution Page Preloader (Wave 0 -> Wave 1 -> Wave 2)
  // Ensures the active spread loads at maximum network priority without 14-page bandwidth contention
  useEffect(() => {
    if (!pages.length) return;

    const BLANK_SVG =
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="100%" height="100%" fill="%23ffffff"/></svg>';

    const profile = getReaderProfile();
    const targetWindow = pagesToLoad(current, pages.length, profile);

    const promotePageIndex = (idx: number, priority: 'high' | 'auto') => {
      if (idx < 0 || idx >= pages.length) return;
      const pg = pages[idx];
      if (!pg) return;
      const bestUrl = pg.imageHigh || pg.image;

      if (!preloadedSet.current.has(idx)) {
        preloadedSet.current.add(idx);
        const img = new Image();
        img.decoding = 'async';
        if (priority === 'high') {
          (img as any).fetchPriority = 'high';
        }
        img.onload = () => {
          setHdLoadedPages((prev) => (prev[pg.n] === bestUrl ? prev : { ...prev, [pg.n]: bestUrl }));
        };
        img.src = bestUrl;
      }

      try {
        const pf = flip.current;
        const pageObjs = (pf as any)?.getPageCollection?.()?.getPages?.();
        const pageObj = pageObjs?.[idx];
        if (
          pageObj &&
          pageObj.image &&
          (pageObj.image.src.startsWith('data:image/svg+xml') || !pageObj.image.src.endsWith(bestUrl))
        ) {
          const stdImg = new Image();
          stdImg.decoding = 'async';
          if (priority === 'high') {
            (stdImg as any).fetchPriority = 'high';
          }
          stdImg.onload = () => {
            stdImg.dataset.nvLoaded = '1';
            pageObj.image = stdImg;
            pageObj.isLoad = true;
            setHdLoadedPages((prev) => (prev[pg.n] === bestUrl ? prev : { ...prev, [pg.n]: bestUrl }));
            (pf as any)?.getRender?.()?.update?.();
          };
          stdImg.src = bestUrl;
        }
      } catch {
        // Non-fatal
      }
    };

    // Wave 0 (Immediate): Cover + Active visible spread
    const wave0 = [0, current, current + 1].filter((i) => i >= 0 && i < pages.length);
    wave0.forEach((idx) => promotePageIndex(idx, 'high'));

    // Wave 1 (65ms): Immediate next & previous turn pages
    const wave1Timer = window.setTimeout(() => {
      const wave1 = [current + 2, current + 3, current - 1].filter(
        (i) => i >= 0 && i < pages.length && targetWindow.has(i)
      );
      wave1.forEach((idx) => promotePageIndex(idx, 'auto'));
    }, 65);

    // Wave 2 (200ms): Remaining adaptive lookahead window + distant memory release
    const wave2Timer = window.setTimeout(() => {
      targetWindow.forEach((idx) => promotePageIndex(idx, 'auto'));

      if (pages.length > 24) {
        try {
          const pf = flip.current;
          const pageObjs = (pf as any)?.getPageCollection?.()?.getPages?.();
          if (pageObjs && pageObjs.length) {
            const releaseDistance = profile.ahead + profile.behind + 5;
            for (let i = 1; i < pages.length; i++) {
              if (Math.abs(i - current) > releaseDistance) {
                const distantObj = pageObjs[i];
                if (distantObj?.image && !distantObj.image.src.startsWith('data:image/svg+xml')) {
                  const blankImg = new Image();
                  blankImg.src = BLANK_SVG;
                  distantObj.image = blankImg;
                  preloadedSet.current.delete(i);
                }
              }
            }
          }
        } catch {
          // ignore
        }
      }
    }, 200);

    return () => {
      window.clearTimeout(wave1Timer);
      window.clearTimeout(wave2Timer);
    };
  }, [current, pages]);

  // High-Resolution Spread Loader (loads 180-200 DPI assets for the active spread at 1x Full Mode as well as Zoom)
  useEffect(() => {
    if (!pages.length) return;
    const visibleIndices = [current];
    if (mode === 'landscape' && current > 0 && current + 1 < pages.length) {
      visibleIndices.push(current + 1);
    }
    visibleIndices.forEach((idx) => {
      const pg = pages[idx];
      const hdUrl = pg?.imageHigh || pg?.image;
      if (!pg || !hdUrl || hdLoadedPages[pg.n] === hdUrl) return;
      const img = new Image();
      img.decoding = 'async';
      (img as any).fetchPriority = 'high';
      img.onload = () => {
        setHdLoadedPages((prev) => ({ ...prev, [pg.n]: hdUrl }));
        try {
          const pf = flip.current;
          const pageObjs = (pf as any)?.getPageCollection?.()?.getPages?.();
          const pageObj = pageObjs?.[idx];
          if (pageObj) {
            img.dataset.nvLoaded = '1';
            pageObj.image = img;
            pageObj.isLoad = true;
            (pf as any)?.getRender?.()?.drawFrame?.();
          }
        } catch {
          // ignore
        }
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

  const filteredToc: TocItem[] = tocFilter.trim()
    ? effectiveToc.filter((t) => t.title.toLowerCase().includes(tocFilter.toLowerCase().trim()))
    : effectiveToc;

  // While a page is turning, the canvas already paints the spine *beneath* the moving leaf.
  // The HTML spine overlay sits above the canvas and would show through the curling page
  // (making it look transparent), so hide it for the duration of the flip.
  useEffect(() => {
    const parent = host.current?.querySelector('.stf__parent') as HTMLElement | null;
    const target = parent || host.current;
    if (!target) return;
    target.classList.toggle('is-flipping', isFlipping);
    host.current?.classList.toggle('is-flipping', isFlipping);
  }, [isFlipping, ready]);

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
    const isClosingFront = orientation === 'landscape' && (pageIdx === 0 || flippingToCoverRef.current);
    const pageColl = flip.current ? (flip.current as any).getPageCollection?.() : null;
    const spreads: number[][] = pageColl?.getSpread?.() || [];
    const hasSingleBackCover =
      spreads.length > 0
        ? spreads[spreads.length - 1]?.length === 1
        : totalPages % 2 === 0;

    const isBackSingle =
      orientation === 'landscape' &&
      totalPages > 1 &&
      (pageIdx >= totalPages - 1 || flippingToBackCoverRef.current) &&
      hasSingleBackCover;

    const hasLeftPages = pageIdx > 0 && !isClosingFront;
    const hasRightPages = pageIdx < totalPages - 1 && !isBackSingle;

    let leftEdge = left;
    let rightEdge = left + width;

    if (isClosingFront) {
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

    // Always-Visible 3D Book Rib & Spine Crease (Heyzine Style):
    // Positioned dead center on open spreads, along the left edge on front cover, and along the right edge on back cover!
    if (orientation === 'landscape') {
      if (isClosingFront) {
        spineCrease.style.display = 'block';
        spineCrease.className = 'stf-spine-crease is-cover';
        spineCrease.style.left = `${Math.round(leftEdge)}px`;
        spineCrease.style.top = `${Math.round(top)}px`;
        spineCrease.style.height = `${Math.round(height)}px`;
      } else if (isBackSingle) {
        spineCrease.style.display = 'block';
        spineCrease.className = 'stf-spine-crease is-back-cover';
        spineCrease.style.left = `${Math.round(rightEdge)}px`;
        spineCrease.style.top = `${Math.round(top)}px`;
        spineCrease.style.height = `${Math.round(height)}px`;
      } else {
        const spineCenter = left + pageWidth;
        spineCrease.style.display = 'block';
        spineCrease.className = 'stf-spine-crease';
        spineCrease.style.left = `${Math.round(spineCenter)}px`;
        spineCrease.style.top = `${Math.round(top)}px`;
        spineCrease.style.height = `${Math.round(height)}px`;
      }
    } else {
      spineCrease.style.display = 'block';
      spineCrease.className = 'stf-spine-crease is-cover';
      spineCrease.style.left = `${Math.round(leftEdge)}px`;
      spineCrease.style.top = `${Math.round(top)}px`;
      spineCrease.style.height = `${Math.round(height)}px`;
    }

    if (orientation === 'portrait') {
      leftStack.style.display = 'none';
      if (hasRightPages) {
        const remaining = totalPages - (pageIdx + 1);
        const rightWidth = Math.min(20, Math.max(6, Math.round((remaining / totalPages) * 20)));
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
        const leftWidth = Math.min(20, Math.max(6, Math.round(leftRatio * 20)));
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
        const rightWidth = Math.min(20, Math.max(6, Math.round(rightRatio * 20)));
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
    if (readingMode !== 'flip' || pages.length === 0) return;
    if (isCustomStageEffect) {
      setReady(true);
      isInitializedRef.current = true;
      return;
    }
    if (!host.current) return;

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
      flippingTime: isHardCoverEffect ? 750 : 620,
      useMouseEvents: true,
      showPageCorners: true,
      swipeDistance: 25,
      startPage: startPageIdx,
    });

    const BLANK_PAGE_SVG =
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="100%" height="100%" fill="%23ffffff"/></svg>';

    // Adaptive sliding image window (device memory / network / viewport aware):
    // cover + current spread + a few pages ahead/behind only; everything else is a cheap placeholder
    // that is swapped for the real image on demand (see syncImageWindow on 'flip').
    const readerProfile = getReaderProfile();
    const initialWindow = pagesToLoad(startPageIdx, pages.length, readerProfile);
    const initialUrls = pages.map((p, idx) =>
      initialWindow.has(idx) ? p.image : BLANK_PAGE_SVG
    );

    const syncImageWindow = (centerIdx: number) => {
      const stPages = (pf as any).getPageCollection?.()?.getPages?.() as any[] | undefined;
      if (!stPages) return;
      const wanted = pagesToLoad(centerIdx, pages.length, readerProfile);
      stPages.forEach((sp, idx) => {
        const img: HTMLImageElement | undefined = sp?.image;
        if (!img || !pages[idx]) return;
        if (wanted.has(idx)) {
          const targetSrc = pages[idx].image;
          if (img.dataset.nvLoaded !== '1' && img.dataset.nvLoading !== '1') {
            img.dataset.nvLoading = '1';
            img.onload = () => {
              img.dataset.nvLoaded = '1';
              img.dataset.nvLoading = '';
              sp.isLoad = true;
              try { pf.update(); } catch { /* ignore */ }
            };
            img.src = targetSrc;
          }
        } else if (img.dataset.nvLoaded === '1' && idx !== 0 && Math.abs(idx - centerIdx) > readerProfile.ahead + readerProfile.behind + 4) {
          // Release decoded bitmaps far from the reader on constrained devices / large publications (never release cover).
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
      render?.drawFrame?.();
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

            // 3. Authentic 3D paper curl lighting & specular reflection across fold (FlipHTML5 style)
            if (isFlipping) {
              const dir = this.render.direction;
              const foldGrad =
                dir === 1
                  ? ctx.createLinearGradient(s, 0, 0, 0)
                  : ctx.createLinearGradient(0, 0, s, 0);
              foldGrad.addColorStop(0, 'rgba(0, 0, 0, 0.18)');
              foldGrad.addColorStop(0.10, 'rgba(0, 0, 0, 0.06)');
              foldGrad.addColorStop(0.24, 'rgba(255, 255, 255, 0.28)'); // Specular cylindrical shine
              foldGrad.addColorStop(0.42, 'rgba(255, 255, 255, 0.08)');
              foldGrad.addColorStop(0.80, 'rgba(0, 0, 0, 0.04)');
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

      // 3D Perspective Folding Leaf Helper for realistic Hard Cover opening & closing
      const draw3DFoldingLeaf = (
        targetCtx: CanvasRenderingContext2D,
        img: HTMLImageElement | null,
        spineX: number,
        topY: number,
        pageWidth: number,
        height: number,
        projWidth: number,
        deltaY: number,
        side: 'left' | 'right',
        lighting: number
      ) => {
        if (projWidth <= 0.5) return;

        const xStart = side === 'left' ? spineX - projWidth : spineX;
        const xEnd = side === 'left' ? spineX : spineX + projWidth;
        const numSlices = 20;
        const sliceW = projWidth / numSlices;

        targetCtx.save();
        for (let i = 0; i < numSlices; i++) {
          const x0 = xStart + i * sliceW;
          const x1 = xStart + (i + 1) * sliceW;
          const curW = Math.max(0.5, x1 - x0 + 0.6);

          const uOuter = side === 'left' ? (numSlices - (i + 0.5)) / numSlices : (i + 0.5) / numSlices;
          const curDeltaY = deltaY * uOuter;
          const curTop = topY - curDeltaY;
          const curHeight = height + 2 * curDeltaY;

          // 1. Solid opaque white paper sheet
          targetCtx.fillStyle = '#ffffff';
          targetCtx.fillRect(x0, curTop, curW, curHeight);

          // 2. Texture slice if image available
          if (img && img.naturalWidth > 0) {
            const sx0 = (i / numSlices) * img.naturalWidth;
            const sx1 = ((i + 1) / numSlices) * img.naturalWidth;
            const sW = Math.max(1, sx1 - sx0);
            targetCtx.drawImage(img, sx0, 0, sW, img.naturalHeight, x0, curTop, curW, curHeight);
          }
        }

        // 3. Subtle 3D lighting gradient across the fold
        const grad = targetCtx.createLinearGradient(xStart, topY, xEnd, topY);
        if (side === 'left') {
          grad.addColorStop(0, `rgba(0, 0, 0, ${0.2 * (1 - lighting)})`);
          grad.addColorStop(0.7, 'rgba(0, 0, 0, 0)');
          grad.addColorStop(1, 'rgba(0, 0, 0, 0.08)');
        } else {
          grad.addColorStop(0, 'rgba(0, 0, 0, 0.08)');
          grad.addColorStop(0.3, 'rgba(0, 0, 0, 0)');
          grad.addColorStop(1, `rgba(0, 0, 0, ${0.2 * (1 - lighting)})`);
        }
        targetCtx.fillStyle = grad;
        targetCtx.fillRect(xStart, topY - deltaY, projWidth, height + 2 * deltaY);

        // 4. Subtle outer edge definition stroke
        targetCtx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
        targetCtx.lineWidth = 1;
        targetCtx.beginPath();
        const outerX = side === 'left' ? xStart : xEnd;
        targetCtx.moveTo(outerX, topY - deltaY);
        targetCtx.lineTo(outerX, topY + height + deltaY);
        targetCtx.stroke();

        targetCtx.restore();
      };

      // Patch drawFrame:
      // 1. Remove destructive portrait clip so mobile page flip is 100% visible and never chopped off.
      // 2. Beautiful 3D Perspective fold when closing back to Front Cover or turning to Back Cover (eliminates blank page on left & under-cut curl).
      // 3. Properly handle single-page spreads (Front/Back cover & Portrait mode) where bottomPage === flippingPage.
      render.drawFrame = function () {
        if (!this.ctx) return;
        this.ctx.save();
        this.clear();

        const isActivelyFlipping = this.flippingPage != null;

        // When NOT actively flipping, the book is in static reading state.
        // On front cover (spread 0): leftPage is null, rightPage is Page 0.
        // On normal spreads: leftPage is Page N, rightPage is Page N+1.
        if (!isActivelyFlipping) {
          if (this.orientation !== 'portrait') {
            if (this.leftPage != null) this.leftPage.simpleDraw(0);
          }
          if (this.rightPage != null) this.rightPage.simpleDraw(1);
          this.drawBookShadow();
          this.ctx.restore();
          return;
        }

        const flipCalc = (pf as any).getFlipController?.()?.calc;
        const dir = flipCalc ? flipCalc.getDirection() : this.direction;
        const pageColl = (pf as any).getPageCollection?.();
        const spreads: number[][] = pageColl?.getSpread?.() || [];
        const currentSpread: number = pageColl?.getCurrentSpreadIndex?.() ?? -1;
        const isLandscape = this.orientation !== 'portrait';

        const isClosingToFrontCover =
          isLandscape &&
          dir === 1 && (
            currentSpread === 1 ||
            (this.bottomPage != null && (this.bottomPage as any).__pageIdx === 0) ||
            (this.flippingPage != null && (this.flippingPage as any).__pageIdx === 0)
          );

        const isClosingToBackCover =
          isLandscape &&
          dir === 0 &&
          spreads.length > 1 &&
          spreads[spreads.length - 1]?.length === 1 &&
          ((this.bottomPage != null && (this.bottomPage as any).__pageIdx === pageObjs.length - 1) ||
           (this.flippingPage != null && (this.flippingPage as any).__pageIdx === pageObjs.length - 1) ||
           currentSpread === spreads.length - 2);

        let progress = 0;
        if (typeof (this as any).__nvProgress === 'number') {
          progress = (this as any).__nvProgress;
        } else if (flipCalc?.getFlippingProgress) {
          progress = Math.min(1, Math.max(0, flipCalc.getFlippingProgress() / 100));
        }

        // =========================================================================
        // CASE A: CLOSING TO FRONT COVER (Spread 1 -> Spread 0)
        // Authentic 3D perspective fold: Left page lifts off outer edge, turns over spine,
        // and lands as Front Cover on the right. Zero blank page on the left, zero spine cut-off!
        // =========================================================================
        if (isClosingToFrontCover) {
          const rect = this.getRect();
          const spineX = rect.left + rect.pageWidth;
          const topY = rect.top;
          const pageWidth = rect.pageWidth;
          const height = rect.height;

          // 1. Draw static right page underneath (Page 2, e.g. "FOOD PRODUCTS")
          if (this.rightPage != null) {
            this.rightPage.simpleDraw(1);
          }

          // 2. Clear left half completely (ensure zero paint, zero blank page outline)
          this.ctx.clearRect(rect.left - 20, topY - 20, pageWidth + 20, height + 40);

          // 3. Draw 3D folding leaf based on turn progress
          if (progress < 0.5) {
            const t = progress / 0.5; // 0 -> 1
            const theta = t * (Math.PI / 2);
            const projWidth = Math.max(0, pageWidth * Math.cos(theta));
            const deltaY = height * 0.04 * Math.sin(theta);
            const lighting = Math.cos(theta * 0.7);

            // Phase 1: Inside front cover (page index 1) lifts off left edge toward spine
            const insideImg = pageObjs[1]?.image || null;
            draw3DFoldingLeaf(this.ctx, insideImg, spineX, topY, pageWidth, height, projWidth, deltaY, 'left', lighting);
          } else {
            const t = (progress - 0.5) / 0.5; // 0 -> 1
            const theta = (1 - t) * (Math.PI / 2);
            const projWidth = Math.max(0, pageWidth * Math.cos(theta));
            const deltaY = height * 0.04 * Math.sin(theta);
            const lighting = Math.cos(theta * 0.7);

            // Cast realistic soft drop shadow on the static right page
            if (projWidth < pageWidth - 2) {
              const outerX = spineX + projWidth;
              const shadowDist = Math.min(35, (pageWidth - projWidth) * 0.4);
              const shadowGrad = this.ctx.createLinearGradient(outerX, topY, outerX + shadowDist, topY);
              shadowGrad.addColorStop(0, `rgba(0, 0, 0, ${0.25 * Math.sin(theta)})`);
              shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
              this.ctx.fillStyle = shadowGrad;
              this.ctx.fillRect(outerX, topY, shadowDist, height);
            }

            // Phase 2: Outside front cover (page index 0) swings down from spine onto right page
            const coverImg = pageObjs[0]?.image || null;
            draw3DFoldingLeaf(this.ctx, coverImg, spineX, topY, pageWidth, height, projWidth, deltaY, 'right', lighting);
          }

          // Spine crease shadow
          const spineW = 12;
          const spineGrad = this.ctx.createLinearGradient(spineX - spineW / 2, topY, spineX + spineW / 2, topY);
          spineGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
          spineGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.16)');
          spineGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          this.ctx.fillStyle = spineGrad;
          this.ctx.fillRect(spineX - spineW / 2, topY, spineW, height);

          this.ctx.restore();
          return;
        }

        // =========================================================================
        // CASE B: CLOSING TO BACK COVER (Spread N-2 -> Spread N-1)
        // Authentic 3D perspective fold: Right page lifts off outer edge, turns over spine,
        // and lands as Back Cover on the left. Zero blank page on the right, zero spine cut-off!
        // =========================================================================
        if (isClosingToBackCover) {
          const rect = this.getRect();
          const spineX = rect.left + rect.pageWidth;
          const topY = rect.top;
          const pageWidth = rect.pageWidth;
          const height = rect.height;
          const lastIdx = pageObjs.length - 1;

          // 1. Draw static left page underneath
          if (this.leftPage != null) {
            this.leftPage.simpleDraw(0);
          }

          // 2. Clear right half completely (ensure zero paint, zero blank page outline)
          this.ctx.clearRect(spineX - 1, topY - 20, pageWidth + 25, height + 40);

          // 3. Draw 3D folding back cover leaf based on turn progress
          if (progress < 0.5) {
            const t = progress / 0.5; // 0 -> 1
            const theta = t * (Math.PI / 2);
            const projWidth = Math.max(0, pageWidth * Math.cos(theta));
            const deltaY = height * 0.04 * Math.sin(theta);
            const lighting = Math.cos(theta * 0.7);

            // Phase 1: Inside back cover lifts off right edge toward spine
            const insideImg = pageObjs[lastIdx - 1]?.image || null;
            draw3DFoldingLeaf(this.ctx, insideImg, spineX, topY, pageWidth, height, projWidth, deltaY, 'right', lighting);
          } else {
            const t = (progress - 0.5) / 0.5; // 0 -> 1
            const theta = (1 - t) * (Math.PI / 2);
            const projWidth = Math.max(0, pageWidth * Math.cos(theta));
            const deltaY = height * 0.04 * Math.sin(theta);
            const lighting = Math.cos(theta * 0.7);

            // Cast realistic soft drop shadow on static left page
            if (projWidth < pageWidth - 2) {
              const outerX = spineX - projWidth;
              const shadowDist = Math.min(35, (pageWidth - projWidth) * 0.4);
              const shadowGrad = this.ctx.createLinearGradient(outerX, topY, outerX - shadowDist, topY);
              shadowGrad.addColorStop(0, `rgba(0, 0, 0, ${0.25 * Math.sin(theta)})`);
              shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
              this.ctx.fillStyle = shadowGrad;
              this.ctx.fillRect(outerX - shadowDist, topY, shadowDist, height);
            }

            // Phase 2: Outside back cover swings down from spine onto left page
            const backCoverImg = pageObjs[lastIdx]?.image || null;
            draw3DFoldingLeaf(this.ctx, backCoverImg, spineX, topY, pageWidth, height, projWidth, deltaY, 'left', lighting);
          }

          // Spine crease shadow
          const spineW = 12;
          const spineGrad = this.ctx.createLinearGradient(spineX - spineW / 2, topY, spineX + spineW / 2, topY);
          spineGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
          spineGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.16)');
          spineGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          this.ctx.fillStyle = spineGrad;
          this.ctx.fillRect(spineX - spineW / 2, topY, spineW, height);

          this.ctx.restore();
          return;
        }

        if (this.orientation !== 'portrait') {
          if (this.leftPage != null) {
            this.leftPage.simpleDraw(0);
          }
        }

        if (this.rightPage != null) {
          this.rightPage.simpleDraw(1);
        }

        if (this.bottomPage != null) {
          if (this.bottomPage === this.flippingPage && flipCalc) {
            if (this.orientation === 'landscape') {
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
            (this as any).__nvProgress = eased;
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
              (this as any).__nvProgress = null;
            }
          } else {
            (this as any).__nvProgress = null;
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

      // Enhanced Heyzine-grade 3D Centerfold Spine Crease, Binding Hinge & Specular Roll
      // Always visible on open spreads, first page cover, and back cover
      render.drawBookShadow = function () {
        if (!this.ctx) return;
        const rect = this.getRect();
        const topY = rect.top;
        const height = rect.height;

        if (this.leftPage && this.rightPage) {
          // Open 2-Page Spread: Authentic 3D Centerfold Book Rib with Specular Roll & Deep Concave Seam
          const spineX = rect.left + rect.pageWidth;
          const spineW = Math.max(38, Math.min(65, rect.pageWidth * 0.10));

          this.ctx.save();
          this.ctx.beginPath();
          this.ctx.rect(spineX - spineW, topY, spineW * 2, height);
          this.ctx.clip();

          // 1. Left fold shadow plunging smoothly into the binding seam
          const leftGrad = this.ctx.createLinearGradient(spineX - spineW, 0, spineX, 0);
          leftGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
          leftGrad.addColorStop(0.35, 'rgba(0, 0, 0, 0.04)');
          leftGrad.addColorStop(0.65, 'rgba(0, 0, 0, 0.16)');
          leftGrad.addColorStop(0.85, 'rgba(0, 0, 0, 0.32)');
          leftGrad.addColorStop(1, 'rgba(0, 0, 0, 0.58)');
          this.ctx.fillStyle = leftGrad;
          this.ctx.fillRect(spineX - spineW, topY, spineW, height);

          // 2. Right fold shadow & paper cylinder specular highlight roll
          const rightGrad = this.ctx.createLinearGradient(spineX, 0, spineX + spineW, 0);
          rightGrad.addColorStop(0, 'rgba(0, 0, 0, 0.58)');
          rightGrad.addColorStop(0.04, 'rgba(0, 0, 0, 0.28)');
          rightGrad.addColorStop(0.12, 'rgba(255, 255, 255, 0.40)'); // Specular cylindrical shine
          rightGrad.addColorStop(0.24, 'rgba(255, 255, 255, 0.14)');
          rightGrad.addColorStop(0.38, 'rgba(0, 0, 0, 0.20)');
          rightGrad.addColorStop(0.65, 'rgba(0, 0, 0, 0.08)');
          rightGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          this.ctx.fillStyle = rightGrad;
          this.ctx.fillRect(spineX, topY, spineW, height);

          // 3. Crisp vertical seam groove indentation
          this.ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
          this.ctx.fillRect(spineX - 0.75, topY, 1.5, height);

          this.ctx.restore();
        } else if (this.rightPage && !this.leftPage) {
          // Closed Front Cover: Authentic magazine/book spine rib & binding hinge on the left edge
          const startX = this.orientation === 'portrait' ? rect.left : rect.left + rect.pageWidth;
          const spineW = Math.max(32, Math.min(52, rect.pageWidth * 0.08));

          this.ctx.save();
          this.ctx.beginPath();
          this.ctx.rect(startX, topY, spineW, height);
          this.ctx.clip();

          const grad = this.ctx.createLinearGradient(startX, 0, startX + spineW, 0);
          grad.addColorStop(0, 'rgba(0, 0, 0, 0.48)');
          grad.addColorStop(0.06, 'rgba(0, 0, 0, 0.28)');
          grad.addColorStop(0.14, 'rgba(255, 255, 255, 0.45)'); // Specular binding ridge highlight
          grad.addColorStop(0.25, 'rgba(0, 0, 0, 0.22)');
          grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.08)');
          grad.addColorStop(0.80, 'rgba(0, 0, 0, 0.02)');
          grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          this.ctx.fillStyle = grad;
          this.ctx.fillRect(startX, topY, spineW, height);

          // Outer hinge crease border
          this.ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
          this.ctx.fillRect(startX, topY, 2, height);

          this.ctx.restore();
        } else if (this.leftPage && !this.rightPage) {
          // Closed Back Cover: Authentic magazine/book spine rib & binding hinge on the right edge
          const endX = rect.left + rect.pageWidth;
          const spineW = Math.max(32, Math.min(52, rect.pageWidth * 0.08));
          const startX = endX - spineW;

          this.ctx.save();
          this.ctx.beginPath();
          this.ctx.rect(startX, topY, spineW, height);
          this.ctx.clip();

          const grad = this.ctx.createLinearGradient(startX, 0, endX, 0);
          grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
          grad.addColorStop(0.20, 'rgba(0, 0, 0, 0.02)');
          grad.addColorStop(0.45, 'rgba(0, 0, 0, 0.08)');
          grad.addColorStop(0.75, 'rgba(0, 0, 0, 0.22)');
          grad.addColorStop(0.86, 'rgba(255, 255, 255, 0.45)');
          grad.addColorStop(0.94, 'rgba(0, 0, 0, 0.28)');
          grad.addColorStop(1, 'rgba(0, 0, 0, 0.48)');
          this.ctx.fillStyle = grad;
          this.ctx.fillRect(startX, topY, spineW, height);

          // Outer hinge crease border
          this.ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
          this.ctx.fillRect(endX - 2, topY, 2, height);

          this.ctx.restore();
        }
      };
    }

    // Patch FlipController for silky smooth FlipHTML5-style physics:
    // 1. Natural arched 3D cone curl trajectory (lifts corner over spine rather than flat diagonal line)
    // 2. Responsive 480-680ms animation duration so page flips are fluid, snappy and visible
    // 3. Patches FlipCalculation to prevent premature snap and preserve continuous cursor tracking
    const flipController = (pf as any).getFlipController?.();
    if (flipController) {
      flipController.getAnimationDuration = function (size: number) {
        const defaultTime = this.app?.getSettings()?.flippingTime || 620;
        const calculated = (size / 1000) * defaultTime;
        return Math.max(480, Math.min(defaultTime, calculated));
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
          setIsFlipping(true);
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
        const spreadIdx = (pf as any).getPageCollection?.()?.getCurrentSpreadIndex?.();
        const flipCalc = (pf as any).getFlipController?.()?.calc;
        const dir = flipCalc ? flipCalc.getDirection() : (pf as any).getRender?.()?.getDirection?.();
        if (spreadIdx === 1 && dir === 1) {
          setFlippingToCover(true);
          flippingToCoverRef.current = true;
          updateBookPageStacks(0, pages.length, pf.getOrientation());
        } else if (spreadIdx === 0 && dir === 0) {
          setOpeningFromCover(true);
          openingFromCoverRef.current = true;
        }
        flippingTimer.current = setTimeout(() => {
          setIsFlipping(false);
        }, 1400);
      } else if (st === 'read') {
        if (flippingTimer.current) clearTimeout(flippingTimer.current);
        setIsFlipping(false);
        const actualSpread = (pf as any).getPageCollection?.()?.getCurrentSpreadIndex?.();
        if (actualSpread !== 0) {
          setFlippingToCover(false);
          flippingToCoverRef.current = false;
        }
      }
    });

    pf.on('flip', (e) => {
      const pageIdx = e.data as number;
      const isActualPageChange = pageIdx !== currentRef.current;
      const isUserAction = userTriggeredFlipRef.current;
      userTriggeredFlipRef.current = false;

      setFlippingToCover(false);
      flippingToCoverRef.current = false;
      setFlippingToBackCover(false);
      flippingToBackCoverRef.current = false;
      setOpeningFromCover(false);
      openingFromCoverRef.current = false;

      setCurrent(pageIdx);
      setResumedBanner(null);
      (pf as any).__nvSyncImageWindow?.(pageIdx);

      // Play sound strictly when flipping the page (never on initial load, resize, thumbnails, search, or zoom)
      if (isUserAction && isActualPageChange && isSoundActiveRef.current && isInitializedRef.current) {
        playPageFlipSound();
      }

      // Prompt message when arriving at last page or first page
      if (isInitializedRef.current && isActualPageChange) {
        const o = pf.getOrientation();
        const isEnd = pageIdx >= pages.length - 1 || (o === 'landscape' && pageIdx + 2 >= pages.length);
        if (isEnd) {
          showToast({
            type: 'last',
            badge: 'Final Page',
            title: 'End of Publication',
            message: "You have reached the last page of this flipbook.",
            actionLabel: 'Read from start ↺',
            onAction: () => gotoRef.current(0),
          });
        } else if (pageIdx === 0) {
          showToast({
            type: 'first',
            badge: 'First Page',
            title: 'Front Cover',
            message: 'You are viewing the beginning of this publication.',
          });
        }
      }

      setPan({ x: 0, y: 0 });
      if (flippingTimer.current) clearTimeout(flippingTimer.current);
      flippingTimer.current = setTimeout(() => {
        setIsFlipping(false);
      }, 70);
      updateBookPageStacks(pageIdx, pages.length, pf.getOrientation());
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
      if (target === 0) {
        setFlippingToCover(true);
        flippingToCoverRef.current = true;
        setOpeningFromCover(false);
        openingFromCoverRef.current = false;
        if (host.current && flip.current) {
          updateBookPageStacks(0, pages.length, flip.current.getOrientation());
        }
      } else {
        setFlippingToCover(false);
        flippingToCoverRef.current = false;
      }
      setCurrent(target);
      setResumedBanner(null);
      const isEnd =
        target >= pages.length - 1 ||
        (mode === 'landscape' && readingMode === 'flip' && target + 2 >= pages.length);
      if (isEnd && isInitializedRef.current) {
        showToast({
          type: 'last',
          badge: 'Final Page',
          title: 'End of Publication',
          message: "You have reached the last page of this flipbook.",
          actionLabel: 'Read from start ↺',
          onAction: () => gotoRef.current(0),
        });
      } else if (target === 0 && isInitializedRef.current) {
        showToast({
          type: 'first',
          badge: 'First Page',
          title: 'Front Cover',
          message: 'You are viewing the beginning of this publication.',
        });
      }
      if (readingMode === 'flip' && flip.current) {
        try {
          setIsFlipping(true);
          flip.current.flip(target);
        } catch {
          setIsFlipping(false);
        }
      } else if (readingMode === 'scroll' || readingMode === 'reader') {
        const el = document.getElementById(`flipex-scroll-page-${target + 1}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    },
    [pages.length, readingMode, mode, showToast, updateBookPageStacks]
  );
  gotoRef.current = goto;

  const next = useCallback(() => {
    unlockAudio();
    const isAtEnd =
      current >= pages.length - 1 ||
      (readingMode === 'flip' && mode === 'landscape' && current + 2 >= pages.length);
    if (isAtEnd) {
      showToast({
        type: 'last',
        badge: 'Last Page',
        title: 'Publication Complete',
        message: 'This is the final page. Click below to start over from the beginning.',
        actionLabel: 'Read from start ↺',
        onAction: () => goto(0),
      });
      return;
    }
    if (current === 0) {
      setOpeningFromCover(true);
      openingFromCoverRef.current = true;
    }
    const pageColl = flip.current ? (flip.current as any).getPageCollection?.() : null;
    const spreads: number[][] = pageColl?.getSpread?.() || [];
    const hasSingleBackCover =
      spreads.length > 0
        ? spreads[spreads.length - 1]?.length === 1
        : pages.length % 2 === 0;

    if (pages.length > 1 && current >= pages.length - 3 && hasSingleBackCover) {
      setFlippingToBackCover(true);
      flippingToBackCoverRef.current = true;
    }
    if (readingMode === 'flip' && flip.current) {
      userTriggeredFlipRef.current = true;
      setIsFlipping(true);
      flip.current.flipNext();
    } else {
      goto(current + 1);
    }
  }, [readingMode, mode, goto, current, pages.length, showToast]);

  const prev = useCallback(() => {
    unlockAudio();
    if (current === 0) {
      showToast({
        type: 'first',
        badge: 'First Page',
        title: 'Front Cover Reached',
        message: 'You are already at the beginning of this publication.',
      });
      return;
    }
    if (current <= 2) {
      setFlippingToCover(true);
      flippingToCoverRef.current = true;
      if (host.current && flip.current) {
        updateBookPageStacks(0, pages.length, flip.current.getOrientation());
      }
    }
    if (readingMode === 'flip' && flip.current) {
      userTriggeredFlipRef.current = true;
      setIsFlipping(true);
      flip.current.flipPrev();
    } else {
      goto(current - 1);
    }
  }, [readingMode, goto, current, pages.length, showToast, updateBookPageStacks]);

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
      } else if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        setPresentationMode((pm) => !pm);
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        setLaserPointer((lp) => !lp);
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
    const pNum = pageNum || h.pageNumber || current + 1;
    if (h.type === 'video' && h.payload.url) {
      sendTelemetry('video_play', { pageNumber: pNum, targetUrl: h.payload.url });
      setActiveVideo({ url: h.payload.url, title: h.payload.title || 'Video' });
    } else if (h.type === 'product') {
      sendTelemetry('product_click', {
        pageNumber: pNum,
        targetUrl: h.payload.url || h.payload.title || 'product',
        meta: { title: h.payload.title, price: h.payload.price, sku: h.payload.sku },
      });
      setActiveProduct({ ...h, pageNumber: pNum });
    } else if (h.type === 'page' && h.payload.targetPage) {
      const targetIdx = Math.max(0, Math.min(pages.length - 1, Number(h.payload.targetPage) - 1));
      sendTelemetry('link_click', { pageNumber: pNum, targetUrl: `page:${targetIdx + 1}` });
      goto(targetIdx);
    } else if (h.type === 'image' && (h.payload.imageUrl || h.payload.url)) {
      const imgUrl = (h.payload.imageUrl || h.payload.url)!;
      sendTelemetry('link_click', { pageNumber: pNum, targetUrl: imgUrl });
      setActiveLightboxImage({ url: imgUrl, title: h.payload.title || 'Image Preview' });
    } else if (h.payload.url) {
      sendTelemetry('link_click', { pageNumber: pNum, targetUrl: h.payload.url });
      window.open(h.payload.url, '_blank', 'noopener,noreferrer');
    }
  };

  const getHotspotIcon = (type: ViewerHotspot['type']) => {
    switch (type) {
      case 'video':
        return '▶';
      case 'product':
        return '🛍️';
      case 'page':
        return '↪';
      case 'image':
        return '🖼️';
      default:
        return '🔗';
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
  const rightPageNum = readingMode === 'flip' && mode === 'landscape' && current > 0 && current + 1 < total ? current + 2 : null;
  const isLandscapeSpread = readingMode === 'flip' && mode === 'landscape';
  const activeHotspots = [
    ...(hotspots[leftPageNum] || []).map((h) => ({
      ...h,
      pageNumber: leftPageNum,
      __side: !isLandscapeSpread
        ? ('single' as const)
        : current === 0
          ? ('right' as const)
          : ('left' as const),
    })),
    ...(rightPageNum
      ? (hotspots[rightPageNum] || []).map((h) => ({
          ...h,
          pageNumber: rightPageNum,
          __side: 'right' as const,
        }))
      : []),
  ];

  const isCurrentBookmarked = bookmarks.includes(current + 1);
  const baseShareUrl = slug ? `${window.location.origin}/v/${slug}` : window.location.href.split('?')[0];
  const computedShareUrl = shareSpecificPage ? `${baseShareUrl}?page=${current + 1}` : baseShareUrl;

  return (
    <div
      className={`heyzine-viewer effect-${settings.pageEffect || 'magazine'} ${isFullscreen ? 'is-fullscreen' : ''}`}
      dir={settings.rightToLeft ? 'rtl' : 'ltr'}
      style={{
        background: settings.backgroundImage ? settings.backgroundImage : (settings.backgroundGradient || activeBg),
        backgroundSize:
          settings.backgroundImage?.includes('1.5px') ? '18px 18px' : 'cover',
        backgroundPosition: 'center center',
        ['--spread-aspect' as any]: `${spreadAspect}`,
        ['--hz-accent' as any]: settings.brandAccentColor || settings.toolbarButtonColor || '#f59e0b',
        ['--hz-drawer-bg' as any]: settings.drawerBgColor || settings.panelBgColor || 'rgba(13, 17, 23, 0.95)',
        ['--hz-drawer-header-bg' as any]: settings.drawerHeaderBgColor || 'rgba(22, 27, 34, 0.95)',
        ['--hz-drawer-text' as any]: settings.drawerTextColor || settings.panelFontColor || '#f1f5f9',
        ['--hz-drawer-active-bg' as any]: settings.drawerActiveColor || settings.brandAccentColor || '#f59e0b',
        ['--hz-drawer-active-text' as any]: settings.drawerActiveTextColor || '#0f172a',
        ['--hz-header-bg' as any]: settings.headerBgColor || settings.toolbarColor || 'rgba(15, 23, 42, 0.75)',
        ['--hz-header-text' as any]: settings.headerTextColor || settings.toolbarButtonColor || '#ffffff',
        ['--hz-nav-pill-bg' as any]: settings.navPillBgColor || settings.toolbarColor || 'rgba(17, 24, 39, 0.88)',
        ['--hz-nav-pill-text' as any]: settings.navPillTextColor || settings.toolbarButtonColor || '#ffffff',
        ['--hz-hotspot-color' as any]: settings.hotspotHighlightColor || settings.brandAccentColor || '#f59e0b',
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
          color: settings.toolbarFontColor,
        }}
      >
        <div
          className="hz-title-wrap"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            background: settings.toolbarColor
              ? (settings.toolbarOpacity !== undefined
                  ? `${settings.toolbarColor}${Math.round(Math.min(1, Math.max(0, settings.toolbarOpacity)) * 255).toString(16).padStart(2, '0')}`
                  : settings.toolbarColor)
              : undefined,
          }}
        >
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
          {/* Author / Publisher Profile Button */}
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
              <SvgUser />
            </button>
          )}

          {/* Quick Mobile QR Code Button */}
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
              <SvgQr />
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
              <span style={{ fontSize: '12px' }}>🔄</span> Landscape Full
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
              <SvgSearch />
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
            <SvgList />
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
            <SvgBookmark filled={isCurrentBookmarked} />
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
              <SvgShare />
            </button>
          )}

          {/* Phase 4: Classroom Lesson Resources & Attached Worksheets */}
          <button
            type="button"
            className={`hz-icon-btn ${showEduResources ? 'ring-2 ring-amber-400' : ''}`}
            onClick={() => {
              setShowEduResources(!showEduResources);
              setShowStudyNotes(false);
              setShowToc(false);
              setShowBookmarks(false);
              setShowSearch(false);
            }}
            title={
              eduResources.length > 0
                ? `Lesson Resources & Worksheets (${eduResources.length} available)`
                : 'Lesson Resources & Worksheets'
            }
            aria-label="Classroom Resources"
            style={{ color: settings.toolbarButtonColor || settings.toolbarFontColor }}
          >
            <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
              <span style={{ fontSize: '13px' }}>📎</span>
              {eduResources.length > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: '-6px',
                    right: '-8px',
                    background: '#f59e0b',
                    color: '#0f172a',
                    borderRadius: '10px',
                    fontSize: '9px',
                    fontWeight: 'bold',
                    padding: '0 4px',
                    lineHeight: '14px',
                  }}
                >
                  {eduResources.length}
                </span>
              )}
            </span>
          </button>

          {/* Phase 4: Student Study Notes & Page Highlighting */}
          <button
            type="button"
            className={`hz-icon-btn ${showStudyNotes ? 'ring-2 ring-amber-400' : ''}`}
            onClick={() => {
              setShowStudyNotes(!showStudyNotes);
              setShowEduResources(false);
              setShowToc(false);
              setShowBookmarks(false);
              setShowSearch(false);
            }}
            title={`Student Study Notes for Page ${current + 1}`}
            aria-label="Student Notes"
            style={{ color: settings.toolbarButtonColor || settings.toolbarFontColor }}
          >
            <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
              <span style={{ fontSize: '13px' }}>📌</span>
              {studyNotes.filter((n) => n.pageNumber === current + 1).length > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: '-6px',
                    right: '-8px',
                    background: '#10b981',
                    color: '#fff',
                    borderRadius: '10px',
                    fontSize: '9px',
                    fontWeight: 'bold',
                    padding: '0 4px',
                    lineHeight: '14px',
                  }}
                >
                  {studyNotes.filter((n) => n.pageNumber === current + 1).length}
                </span>
              )}
            </span>
          </button>

          {/* Phase 4: Classroom Whiteboard & Laser Pointer Presentation Mode */}
          <button
            type="button"
            className={`hz-icon-btn hz-desktop-only ${presentationMode ? 'ring-2 ring-amber-400' : ''}`}
            onClick={() => {
              setPresentationMode(!presentationMode);
              if (!presentationMode && !isFullscreen) {
                toggleFullscreen();
              }
            }}
            title="Classroom Presentation Mode (Shortcut: P · Laser Pointer: L)"
            aria-label="Classroom Presentation Mode"
            style={{ color: settings.toolbarButtonColor || settings.toolbarFontColor }}
          >
            <span style={{ fontSize: '13px' }}>📽️</span>
          </button>

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
            <SvgSaveOffline saved={offlineSaved} caching={cachingOffline} />
          </button>

          {soundConfigEnabled && readingMode === 'flip' && (
            <button
              className="hz-icon-btn"
              onClick={() => setSoundMuted(!soundMuted)}
              title={soundMuted ? 'Turn Sound On' : 'Mute Sound'}
              style={{ color: settings.toolbarButtonColor || settings.toolbarFontColor }}
            >
              <SvgVolume muted={soundMuted} />
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
              <SvgDownload />
            </a>
          )}

          {settings.showThumbnailsButton !== false && (
            <button
              className={`hz-icon-btn ${showThumbs ? 'ring-2 ring-amber-400' : ''}`}
              onClick={() => setShowThumbs(!showThumbs)}
              title="Toggle Page Thumbnails"
              style={{ color: settings.toolbarButtonColor || settings.toolbarFontColor }}
            >
              <SvgGrid />
            </button>
          )}

          <button
            className="hz-icon-btn hz-desktop-only"
            onClick={() => setShowShortcutsModal(true)}
            title="Keyboard Shortcuts & Theme Settings (Shortcut: ?)"
            style={{ color: settings.toolbarButtonColor || settings.toolbarFontColor }}
          >
            <SvgKeyboard />
          </button>

          {settings.showFullscreenButton !== false && (
            <button
              className="hz-icon-btn"
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
              style={{ color: settings.toolbarButtonColor || settings.toolbarFontColor }}
            >
              <SvgFullscreen isFs={isFullscreen} />
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
        <aside
          className="hz-nav-panel fixed top-16 right-4 z-40 flex max-h-[75vh] w-84 flex-col overflow-hidden rounded-2xl border border-white/15 bg-slate-950/95 text-white shadow-2xl backdrop-blur-2xl"
          role="dialog"
          aria-label="Search Inside Publication"
        >
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 bg-slate-900/60">
            <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-400">
              <SvgSearch /> Search Inside Publication
            </span>
            <button
              onClick={() => setShowSearch(false)}
              className="flex items-center justify-center h-7 w-7 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <SvgClose />
            </button>
          </div>
          <div className="p-3 border-b border-white/10 bg-slate-900/30">
            <input
              type="search"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search keywords, topics, names…"
              className="w-full rounded-xl border border-white/20 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-400 outline-none focus:border-amber-400"
            />
          </div>
          <div className="hz-custom-scroll flex-1 overflow-y-auto divide-y divide-white/10 p-2">
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
                    <span className="text-[10px] bg-amber-400/20 px-2 py-0.5 rounded-full text-amber-300">Jump →</span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-300 line-clamp-3">{res.snippet}</p>
                </button>
              ))
            )}
          </div>
        </aside>
      )}

      {/* Slide-Out Modern Table of Contents, Bookmarks, Resources & Study Notes Panel */}
      {(showToc || showBookmarks || showEduResources || showStudyNotes) && (
        <aside
          className="hz-side-drawer"
          role="navigation"
          aria-label="Table of Contents, Bookmarks, Resources and Notes"
        >
          {/* Header with Modern Segmented Pill Tabs */}
          <div className="hz-drawer-header">
            <div className="hz-drawer-tabs">
              <button
                type="button"
                onClick={() => { setShowToc(true); setShowBookmarks(false); setShowEduResources(false); setShowStudyNotes(false); }}
                className={`hz-drawer-tab ${showToc ? 'active' : ''}`}
                title="Table of Contents"
              >
                <SvgList />
                <span>Contents</span>
                <span className="hz-drawer-tab-badge">
                  ({effectiveToc.length})
                </span>
              </button>
              <button
                type="button"
                onClick={() => { setShowBookmarks(true); setShowToc(false); setShowEduResources(false); setShowStudyNotes(false); }}
                className={`hz-drawer-tab ${showBookmarks ? 'active' : ''}`}
                title="Saved Bookmarks"
              >
                <SvgBookmark filled={bookmarks.length > 0} />
                <span>Bookmarks</span>
                <span className="hz-drawer-tab-badge">
                  ({bookmarks.length})
                </span>
              </button>
              {(eduResources.length > 0 || showEduResources) && (
                <button
                  type="button"
                  onClick={() => { setShowEduResources(true); setShowToc(false); setShowBookmarks(false); setShowStudyNotes(false); }}
                  className={`hz-drawer-tab ${showEduResources ? 'active' : ''}`}
                  title="Lesson Worksheets & Syllabus"
                >
                  <SvgGraduation />
                  <span>Resources</span>
                  <span className="hz-drawer-tab-badge">
                    ({eduResources.length})
                  </span>
                </button>
              )}
              {(studyNotes.length > 0 || showStudyNotes) && (
                <button
                  type="button"
                  onClick={() => { setShowStudyNotes(true); setShowToc(false); setShowBookmarks(false); setShowEduResources(false); }}
                  className={`hz-drawer-tab ${showStudyNotes ? 'active' : ''}`}
                  title="Student Revision Notes"
                >
                  <SvgNote />
                  <span>Notes</span>
                  <span className="hz-drawer-tab-badge">
                    ({studyNotes.length})
                  </span>
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => { setShowToc(false); setShowBookmarks(false); setShowEduResources(false); setShowStudyNotes(false); }}
              className="hz-drawer-close"
              title="Close panel (Esc)"
              aria-label="Close"
            >
              <SvgClose />
            </button>
          </div>

          {/* Quick Filter Search for TOC */}
          {showToc && (
            <div className="hz-drawer-filter-bar">
              <span className="hz-filter-icon">
                <SvgSearch />
              </span>
              <input
                type="text"
                value={tocFilter}
                onChange={(e) => setTocFilter(e.target.value)}
                placeholder="Filter table of contents…"
              />
              {tocFilter && (
                <button
                  type="button"
                  onClick={() => setTocFilter('')}
                  className="hz-filter-clear"
                  title="Clear filter"
                >
                  <SvgClose />
                </button>
              )}
            </div>
          )}

          {/* Body Content */}
          <div className="hz-custom-scroll hz-drawer-list">
            {showToc ? (
              filteredToc.length === 0 ? (
                <div style={{ padding: '28px 16px', textAlign: 'center', fontSize: '12px', color: '#64748b' }}>
                  No sections match “{tocFilter}”
                </div>
              ) : (
                filteredToc.map((item, idx) => {
                  const isActive = current + 1 === item.page;
                  return (
                    <button
                      key={`${item.page}-${idx}`}
                      type="button"
                      onClick={() => {
                        goto(item.page - 1);
                        setShowToc(false);
                      }}
                      className={`hz-toc-item ${isActive ? 'hz-toc-active' : ''}`}
                      title={`${item.title} (Page ${item.page})`}
                    >
                      <span className="hz-toc-title">{item.title}</span>
                      <span className="hz-toc-badge">
                        p. {item.page}
                      </span>
                    </button>
                  );
                })
              )
            ) : showBookmarks ? (
              bookmarks.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '36px 16px', textAlign: 'center' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', marginBottom: '10px' }}>
                    <SvgBookmark />
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0', marginBottom: '4px' }}>No bookmarks yet</div>
                  <div style={{ fontSize: '11px', color: '#64748b', maxWidth: '220px', lineHeight: 1.4 }}>
                    Click the bookmark icon in the top toolbar or press <kbd style={{ padding: '1px 5px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', fontSize: '10px' }}>B</kbd> to save any page.
                  </div>
                </div>
              ) : (
                bookmarks.map((bmPage) => (
                  <div key={bmPage} className="hz-bookmark-item">
                    <button
                      type="button"
                      onClick={() => {
                        goto(bmPage - 1);
                        setShowBookmarks(false);
                      }}
                      className="hz-bookmark-jump"
                    >
                      <span style={{ color: '#f59e0b' }}>
                        <SvgBookmark filled />
                      </span>
                      <span>Page {bmPage}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleBookmark(bmPage)}
                      className="hz-bookmark-del"
                      title="Remove bookmark"
                    >
                      Remove
                    </button>
                  </div>
                ))
              )
            ) : showEduResources ? (
              eduResources.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '36px 16px', textAlign: 'center' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', marginBottom: '10px' }}>
                    <SvgGraduation />
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0', marginBottom: '4px' }}>No Lesson Resources Attached</div>
                  <div style={{ fontSize: '11px', color: '#64748b', maxWidth: '240px', lineHeight: 1.4 }}>
                    Worksheets, past exam papers, and syllabus attachments published by your teachers will appear here.
                  </div>
                </div>
              ) : (
                <div className="space-y-2 p-2">
                  {eduResources.map((res) => (
                    <div
                      key={res.id}
                      className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-3 transition-colors hover:border-amber-400/50"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                              {res.resourceType.replace('_', ' ')}
                            </span>
                            {res.pageNumber && (
                              <button
                                type="button"
                                onClick={() => {
                                  goto(res.pageNumber! - 1);
                                  setShowEduResources(false);
                                }}
                                className="text-[10px] font-semibold text-sky-400 hover:underline"
                              >
                                Page {res.pageNumber} ↗
                              </button>
                            )}
                          </div>
                          <h4 className="mt-1 text-xs font-semibold text-slate-100">{res.title}</h4>
                          {res.description && (
                            <p className="mt-0.5 text-[11px] text-slate-400 line-clamp-2">{res.description}</p>
                          )}
                        </div>
                        <a
                          href={res.fileUrl || res.externalUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 rounded-lg bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-300 transition-colors hover:bg-amber-500/25"
                        >
                          Open ↗
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : showStudyNotes ? (
              <div className="flex flex-col h-full">
                {/* Note creation form */}
                <form onSubmit={handleAddStudyNote} className="border-b border-slate-800 p-3 bg-slate-950/40">
                  <div className="flex items-center justify-between mb-1.5 text-[11px]">
                    <span className="font-semibold text-amber-400">Page {current + 1} Note</span>
                    <div className="flex items-center gap-1">
                      {['#fef08a', '#bbf7d0', '#fbcfe8', '#bae6fd', '#fed7aa'].map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setNewNoteColor(c)}
                          className={`w-3.5 h-3.5 rounded-full border transition-transform ${newNoteColor === c ? 'scale-125 border-white ring-1 ring-white/40' : 'border-transparent opacity-70'}`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>
                  <textarea
                    rows={2}
                    value={newNoteText}
                    onChange={(e) => setNewNoteText(e.target.value)}
                    placeholder="Add student study note or revision takeaway..."
                    className="w-full rounded-lg border border-slate-700 bg-slate-900/90 p-2 text-xs text-slate-100 placeholder-slate-500 focus:border-amber-400 focus:outline-none"
                  />
                  <div className="mt-1.5 flex justify-end">
                    <button
                      type="submit"
                      disabled={!newNoteText.trim()}
                      className="rounded-lg bg-amber-500 px-3 py-1 text-xs font-semibold text-slate-950 disabled:opacity-40 transition-colors hover:bg-amber-400"
                    >
                      Save Note
                    </button>
                  </div>
                </form>

                {/* Notes List */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {studyNotes.length === 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '28px 16px', textAlign: 'center' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', marginBottom: '8px' }}>
                        <SvgNote />
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0', marginBottom: '4px' }}>No Study Notes Yet</div>
                      <div style={{ fontSize: '11px', color: '#64748b', maxWidth: '220px', lineHeight: 1.4 }}>
                        Annotate key terms, formulas, and homework questions above for quick exam revision.
                      </div>
                    </div>
                  ) : (
                    studyNotes.map((note, idx) => (
                      <div
                        key={note.id || idx}
                        className="rounded-xl border border-slate-800 bg-slate-900/80 p-2.5 relative group"
                        style={{ borderLeftWidth: '4px', borderLeftColor: note.color || '#fef08a' }}
                      >
                        <div className="flex items-center justify-between text-[11px] mb-1">
                          <button
                            type="button"
                            onClick={() => {
                              goto(note.pageNumber - 1);
                              setShowStudyNotes(false);
                            }}
                            className="font-bold text-amber-300 hover:underline"
                          >
                            Page {note.pageNumber} ↗
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteStudyNote(note.id, idx)}
                            className="text-[10px] text-slate-500 hover:text-red-400 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                        <p className="text-xs text-slate-200 whitespace-pre-wrap">{note.noteText}</p>
                      </div>
                    ))
                  )}
                </div>

                {/* Export button */}
                {studyNotes.length > 0 && (
                  <div className="p-2 border-t border-slate-800 bg-slate-950/60">
                    <button
                      type="button"
                      onClick={handleExportStudyNotes}
                      className="w-full py-1.5 rounded-lg border border-slate-700 bg-slate-900 text-xs font-semibold text-slate-200 hover:bg-slate-800 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <SvgDownload />
                      Export Notes (.txt)
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* Footer Info & Pacific Directory Link */}
          <div className="hz-drawer-footer" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {showToc && (
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                <span>{filteredToc.length} of {effectiveToc.length} sections</span>
                <span>Click row to jump →</span>
              </div>
            )}
            <a
              href="/explore"
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'center',
                fontSize: '11px',
                fontWeight: 600,
                color: '#f59e0b',
                paddingTop: '6px',
                borderTop: '1px solid rgba(255,255,255,0.08)',
                textDecoration: 'none',
              }}
            >
              🌴 Browse Pacific Directory (/explore) →
            </a>
          </div>

          {/* Sponsored Ad Spotlight (if active) */}
          {sponsorAd && (
            <div style={{ padding: '8px 12px', borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.35)' }}>
              <a
                href={sponsorAd.targetUrl}
                target="_blank"
                rel="noreferrer"
                onClick={() => {
                  fetch(`/api/v1/public/ads/${sponsorAd.id}/track`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ event_type: 'click' }),
                  }).catch(() => {});
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none', color: 'inherit' }}
              >
                <img
                  src={sponsorAd.bannerImageUrl}
                  alt={sponsorAd.headline}
                  style={{ width: '38px', height: '38px', borderRadius: '6px', objectFit: 'cover', flexShrink: 0 }}
                />
                <div style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                  <div style={{ fontSize: '9px', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase' }}>
                    Sponsored
                  </div>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {sponsorAd.headline || sponsorAd.campaignName}
                  </div>
                  <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                    {sponsorAd.advertiserName}
                  </div>
                </div>
              </a>
            </div>
          )}
        </aside>
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

          {settings.prevNextShortcut !== false && (() => {
            const isAtEnd =
              current >= total - 1 ||
              (readingMode === 'flip' && mode === 'landscape' && current + 2 >= total);
            return (
              <>
                <button
                  type="button"
                  className={`hz-side-arrow left ${current === 0 ? 'disabled' : ''} ${settings.prevNextMobile === false ? 'hz-desktop-only' : ''}`}
                  onClick={prev}
                  title={current === 0 ? 'First Page Reached' : 'Previous Page (←)'}
                  style={{
                    color: settings.prevNextColor,
                    backgroundColor: settings.prevNextBg,
                  }}
                >
                  ‹
                </button>

                <button
                  type="button"
                  className={`hz-side-arrow right ${isAtEnd ? 'disabled' : ''} ${settings.prevNextMobile === false ? 'hz-desktop-only' : ''}`}
                  onClick={next}
                  title={isAtEnd ? 'Last Page Reached' : 'Next Page (→)'}
                  style={{
                    color: settings.prevNextColor,
                    backgroundColor: settings.prevNextBg,
                  }}
                >
                  ›
                </button>
              </>
            );
          })()}

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
            const spreads: number[][] = (flip.current as any)?.getPageCollection?.()?.getSpread?.() || [];
            const hasSingleBackCover =
              spreads.length > 0
                ? spreads[spreads.length - 1]?.length === 1
                : total % 2 === 0;
            const isSingleBackCoverActive =
              mode === 'landscape' && total > 1 && current >= total - 1 && hasSingleBackCover;

            let coverCenterOffsetX = 0;
            if (mode === 'landscape' && pageW > 0) {
              if ((current === 0 && !openingFromCover) || flippingToCover) {
                coverCenterOffsetX = -Math.round(pageW / 2);
              } else if (total > 1 && (current >= total - 1 || flippingToBackCover) && hasSingleBackCover) {
                coverCenterOffsetX = Math.round(pageW / 2);
              }
            }

            const crispImgStyle: React.CSSProperties = {
              imageRendering: zoom > 1.35 ? '-webkit-optimize-contrast' : 'auto',
              filter: settings.sharpenPages !== false ? 'contrast(1.045)' : undefined,
            };

            if (isSliderEffect) {
              return (
                <SliderStage
                  pages={pages}
                  current={current}
                  total={total}
                  next={next}
                  prev={prev}
                  goto={goto}
                  fitWidth={fitWidth}
                  fitHeight={fitHeight}
                  zoom={zoom}
                  crispImgStyle={crispImgStyle}
                  hdLoadedPages={hdLoadedPages}
                  mode={mode}
                  rightToLeft={settings.rightToLeft}
                />
              );
            }

            if (isCardsEffect) {
              return (
                <CardsDeckStage
                  pages={pages}
                  current={current}
                  total={total}
                  next={next}
                  prev={prev}
                  goto={goto}
                  fitWidth={fitWidth}
                  fitHeight={fitHeight}
                  zoom={zoom}
                  crispImgStyle={crispImgStyle}
                  hdLoadedPages={hdLoadedPages}
                  mode={mode}
                  rightToLeft={settings.rightToLeft}
                />
              );
            }

            if (isCoverflowEffect) {
              return (
                <CoverflowStage
                  pages={pages}
                  current={current}
                  total={total}
                  next={next}
                  prev={prev}
                  goto={goto}
                  fitWidth={fitWidth}
                  fitHeight={fitHeight}
                  zoom={zoom}
                  crispImgStyle={crispImgStyle}
                  hdLoadedPages={hdLoadedPages}
                  mode={mode}
                  rightToLeft={settings.rightToLeft}
                />
              );
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

                {/* Razor-Sharp Native Image Overlay (Active in static reading state at 1x Full Mode and when zoomed in; yields to 3D curling canvas during page flips) */}
                {ready && !isFlipping && (
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
                          : mode === 'landscape' && (current === 0 || isSingleBackCoverActive)
                          ? (fitWidth > 0 ? fitWidth / 2 : (bookBounds?.pageWidth || 0))
                          : (fitWidth > 0 ? fitWidth : (bookBounds?.width || 0))
                      )}px`,
                      height: `${Math.round(fitHeight > 0 ? fitHeight : (bookBounds?.height || 0))}px`,
                      display: 'flex',
                      opacity: 1,
                    }}
                  >
                    {mode === 'portrait' || current === 0 || isSingleBackCoverActive ? (
                      pages[current] ? (
                        <div className="relative h-full w-full bg-white">
                          <img
                            src={hdLoadedPages[pages[current].n] || pages[current].imageHigh || pages[current].image}
                            alt={`Page ${pages[current].n}`}
                            className="h-full w-full object-fill select-none"
                            draggable={false}
                            style={crispImgStyle}
                          />
                          {/* Authentic Heyzine-grade Book Rib / Binding Hinge on Front Cover */}
                          {mode === 'landscape' && current === 0 && (
                            <div
                              className="pointer-events-none"
                              style={{
                                position: 'absolute', top: 0, bottom: 0, left: 0, width: 36, zIndex: 20, mixBlendMode: 'multiply',
                                background:
                                  'linear-gradient(to right, rgba(0,0,0,0.48) 0%, rgba(0,0,0,0.28) 8%, rgba(255,255,255,0.45) 15%, rgba(0,0,0,0.22) 28%, rgba(0,0,0,0.08) 60%, rgba(0,0,0,0) 100%)',
                                boxShadow: 'inset -4px 0 8px 0 rgba(0,0,0,0.24)',
                              }}
                            />
                          )}
                          {isSingleBackCoverActive && (
                            <div
                              className="pointer-events-none"
                              style={{
                                position: 'absolute', top: 0, bottom: 0, right: 0, width: 36, zIndex: 20, mixBlendMode: 'multiply',
                                background:
                                  'linear-gradient(to left, rgba(0,0,0,0.48) 0%, rgba(0,0,0,0.28) 8%, rgba(255,255,255,0.45) 15%, rgba(0,0,0,0.22) 28%, rgba(0,0,0,0.08) 60%, rgba(0,0,0,0) 100%)',
                                boxShadow: 'inset 4px 0 8px 0 rgba(0,0,0,0.24)',
                              }}
                            />
                          )}
                        </div>
                      ) : null
                    ) : (
                      <>
                        <div className="relative h-full w-1/2 overflow-hidden bg-white">
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
                        <div className="relative h-full w-1/2 overflow-hidden bg-white">
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
                        {/* Authentic 3D Center Book Rib / Spine Crease (Always Visible when Open) */}
                        <div
                          className="pointer-events-none"
                          style={{
                            position: 'absolute', top: 0, bottom: 0, left: '50%', width: 84, transform: 'translateX(-50%)', zIndex: 20,
                            mixBlendMode: 'multiply',
                            background:
                              'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.04) 12%, rgba(0,0,0,0.16) 33%, rgba(0,0,0,0.40) 46%, rgba(0,0,0,0.62) 50%, rgba(0,0,0,0.30) 54%, rgba(0,0,0,0.14) 66%, rgba(0,0,0,0.04) 84%, transparent 100%)',
                          }}
                        >
                          <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 2, transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.55)', boxShadow: '0 0 6px 1px rgba(0,0,0,0.35)' }} />
                        </div>
                        {/* Spiral Coil Binding Rings Overlay when in Spiral Notebook Mode */}
                        {normalizedPageEffect === 'notebook' && (
                          <div
                            className="pointer-events-none"
                            style={{
                              position: 'absolute', top: 0, bottom: 0, left: '50%', width: 36, transform: 'translateX(-50%)', zIndex: 30,
                              backgroundImage:
                                'radial-gradient(circle 3px at 6px 12px, #0f172a 90%, transparent 100%), radial-gradient(circle 3px at 28px 12px, #0f172a 90%, transparent 100%), linear-gradient(90deg, transparent 4px, #cbd5e1 6px, #94a3b8 10px, #475569 18px, #cbd5e1 24px, #94a3b8 28px, transparent 30%)',
                              backgroundSize: '34px 24px',
                              filter: 'drop-shadow(0 2px 3px rgba(0, 0, 0, 0.45))',
                            }}
                          />
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Interactive Hotspots Layer (Spread-Aware Coordinate Mapping) */}
                {ready && activeHotspots.length > 0 && (
                  <div className="hz-hotspots-layer">
                    {activeHotspots.map((h) => {
                      const effLeft =
                        h.__side === 'left'
                          ? h.x / 2
                          : h.__side === 'right'
                            ? 50 + h.x / 2
                            : h.x;
                      const effWidth = h.__side === 'single' ? h.w : h.w / 2;
                      return (
                        <div
                          key={h.id}
                          className={`reader-hotspot ${h.type}`}
                          style={{
                            left: `${effLeft}%`,
                            top: `${h.y}%`,
                            width: `${effWidth}%`,
                            height: `${h.h}%`,
                          }}
                          onClick={() => handleHotspotClick(h, h.pageNumber || current + 1)}
                          title={
                            h.payload.title ||
                            (h.type === 'video'
                              ? 'Watch Video'
                              : h.type === 'product'
                                ? 'View Product Details'
                                : h.type === 'page'
                                  ? `Jump to Page ${h.payload.targetPage || 1}`
                                  : 'Open Link')
                          }
                        >
                          <span className="hotspot-icon">{getHotspotIcon(h.type)}</span>
                          {h.payload.title && <span className="hotspot-text">{h.payload.title}</span>}
                          {h.type === 'product' && h.payload.price && (
                            <span className="ml-1 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-extrabold text-slate-950 shadow">
                              {h.payload.price}
                            </span>
                          )}
                        </div>
                      );
                    })}
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
                    src={isVisibleOrNear && p.imageHigh ? p.imageHigh : p.image}
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
                      <span className="hotspot-icon">{getHotspotIcon(h.type)}</span>
                      {h.payload.title && <span className="hotspot-text">{h.payload.title}</span>}
                      {h.type === 'product' && h.payload.price && (
                        <span className="ml-1 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-extrabold text-slate-950 shadow">
                          {h.payload.price}
                        </span>
                      )}
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
              type="button"
              className={`hz-pill-btn ${current === 0 ? 'opacity-40' : ''}`}
              onClick={prev}
              title={current === 0 ? 'First Page Reached' : 'Previous Page (←)'}
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
              type="button"
              className={`hz-pill-btn ${current >= total - 1 || (readingMode === 'flip' && mode === 'landscape' && current + 2 >= total) ? 'opacity-40' : ''}`}
              onClick={next}
              title={current >= total - 1 || (readingMode === 'flip' && mode === 'landscape' && current + 2 >= total) ? 'Last Page Reached' : 'Next Page (→)'}
              style={{ color: settings.toolbarButtonColor || settings.toolbarFontColor }}
            >
              ›
            </button>

            {/* Interactive Timeline Scrubber with Floating Thumbnail & Chapter Preview Bubble */}
            {total > 1 && (
              <div className="relative flex items-center px-2 hz-desktop-only">
                {scrubPreviewPage !== null && pages[scrubPreviewPage] && (
                  <div
                    className="pointer-events-none absolute bottom-12 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center rounded-xl border border-amber-400/50 bg-slate-950/95 p-2 text-white shadow-2xl backdrop-blur-md"
                    style={{ width: '132px' }}
                  >
                    <img
                      src={pages[scrubPreviewPage].thumb}
                      alt={`Page ${scrubPreviewPage + 1}`}
                      className="h-28 w-20 rounded border border-white/15 object-cover bg-white"
                    />
                    <span className="mt-1.5 text-[11px] font-extrabold text-amber-400">
                      Page {scrubPreviewPage + 1} of {total}
                    </span>
                    {(() => {
                      const chap = [...effectiveToc]
                        .reverse()
                        .find((t) => t.page <= scrubPreviewPage + 1);
                      return chap ? (
                        <span className="mt-0.5 max-w-full truncate text-[10px] text-slate-300">
                          {chap.title.replace(/^Page \d+:\s*/i, '')}
                        </span>
                      ) : null;
                    })()}
                  </div>
                )}
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, total - 1)}
                  step={1}
                  value={scrubPreviewPage !== null ? scrubPreviewPage : current}
                  onMouseMove={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
                    setScrubPreviewPage(Math.round(ratio * (total - 1)));
                  }}
                  onMouseLeave={() => setScrubPreviewPage(null)}
                  onChange={(e) => {
                    const idx = Number(e.target.value);
                    setScrubPreviewPage(idx);
                    goto(idx);
                  }}
                  onMouseUp={() => setScrubPreviewPage(null)}
                  aria-label="Scrub pages"
                  title="Drag or hover to preview and jump to any page"
                  className="h-1.5 w-24 cursor-pointer accent-amber-400"
                />
              </div>
            )}

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
                  type="button"
                  className="hz-pill-btn hz-zoom-label"
                  onClick={() => handleZoomChange(1)}
                  title="Reset zoom to 100% (Press 0)"
                  aria-label="Reset zoom to 100%"
                >
                  {zoom > 1 ? `↺ ${Math.round(zoom * 100)}%` : '100%'}
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

      {/* Commercial Product / Price Spotlight Modal (BoardUI Standard) */}
      {activeProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
          onClick={() => setActiveProduct(null)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl border border-amber-400/40 bg-slate-900 text-slate-100 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {activeProduct.payload.imageUrl && (
              <div className="relative h-56 w-full bg-slate-950">
                <img
                  src={activeProduct.payload.imageUrl}
                  alt={activeProduct.payload.title || 'Product'}
                  className="h-full w-full object-contain p-3"
                />
                {activeProduct.payload.price && (
                  <span className="absolute top-3 right-3 rounded-full bg-amber-400 px-3 py-1 text-sm font-extrabold text-slate-950 shadow-lg">
                    {activeProduct.payload.price}
                  </span>
                )}
              </div>
            )}
            <div className="p-6 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="inline-block rounded-full bg-amber-400/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400">
                    🛍️ Featured Item {activeProduct.payload.sku ? `· SKU: ${activeProduct.payload.sku}` : ''}
                  </span>
                  <h3 className="mt-1 text-lg font-bold text-white">
                    {activeProduct.payload.title || 'Featured Catalogue Product'}
                  </h3>
                </div>
                {!activeProduct.payload.imageUrl && activeProduct.payload.price && (
                  <span className="shrink-0 rounded-full bg-amber-400 px-3 py-1 text-sm font-extrabold text-slate-950 shadow">
                    {activeProduct.payload.price}
                  </span>
                )}
              </div>

              {activeProduct.payload.description && (
                <p className="text-xs leading-relaxed text-slate-300 whitespace-pre-line">
                  {activeProduct.payload.description}
                </p>
              )}

              {/* Direct Inquiry Form Toggle / Expansion */}
              {showProductInquiryForm ? (
                <div className="mt-3 p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-amber-400">Send Direct Sales Inquiry</span>
                    <button
                      type="button"
                      onClick={() => setShowProductInquiryForm(false)}
                      className="text-[11px] text-slate-400 hover:text-white"
                    >
                      ✕ Cancel
                    </button>
                  </div>

                  {productInquirySuccess ? (
                    <div className="text-center py-2 text-xs text-emerald-400 font-semibold">
                      ✓ {productInquirySuccess}
                    </div>
                  ) : (
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (!slug || !activeProduct || !productInquiryName.trim() || !productInquiryEmail.trim()) return;
                        setProductInquiryBusy(true);
                        try {
                          await api(`/public/${slug}/inquire`, 'POST', {
                            name: productInquiryName.trim(),
                            email: productInquiryEmail.trim(),
                            phone: productInquiryPhone.trim(),
                            quantity: productInquiryQty,
                            notes: productInquiryNotes.trim(),
                            productTitle: activeProduct.payload.title || 'Product',
                            sku: activeProduct.payload.sku,
                            price: activeProduct.payload.price,
                            pageNumber: activeProduct.pageNumber || current + 1,
                          });
                          setProductInquirySuccess('Inquiry received! Our sales representative will be in touch.');
                          setProductInquiryName('');
                          setProductInquiryEmail('');
                          setProductInquiryPhone('');
                          setProductInquiryNotes('');
                          setTimeout(() => {
                            setProductInquirySuccess('');
                            setShowProductInquiryForm(false);
                          }, 3500);
                        } catch {
                          alert('Unable to submit inquiry at this moment.');
                        } finally {
                          setProductInquiryBusy(false);
                        }
                      }}
                      className="space-y-2 text-left"
                    >
                      <input
                        type="text"
                        required
                        placeholder="Your Full Name *"
                        value={productInquiryName}
                        onChange={(e) => setProductInquiryName(e.target.value)}
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-amber-400"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="email"
                          required
                          placeholder="Email Address *"
                          value={productInquiryEmail}
                          onChange={(e) => setProductInquiryEmail(e.target.value)}
                          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-amber-400"
                        />
                        <input
                          type="tel"
                          placeholder="Phone / WhatsApp"
                          value={productInquiryPhone}
                          onChange={(e) => setProductInquiryPhone(e.target.value)}
                          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-amber-400"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-400">Qty:</span>
                        <input
                          type="number"
                          min="1"
                          value={productInquiryQty}
                          onChange={(e) => setProductInquiryQty(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-16 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-white outline-none focus:border-amber-400 text-center"
                        />
                        <input
                          type="text"
                          placeholder="Delivery town / notes (optional)"
                          value={productInquiryNotes}
                          onChange={(e) => setProductInquiryNotes(e.target.value)}
                          className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-amber-400"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={productInquiryBusy}
                        className="w-full py-1.5 rounded-lg bg-amber-400 text-slate-950 text-xs font-bold hover:bg-amber-300 disabled:opacity-50 shadow"
                      >
                        {productInquiryBusy ? 'Sending…' : 'Submit Product Inquiry'}
                      </button>
                    </form>
                  )}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2.5 pt-2">
                {activeProduct.payload.url && (
                  <a
                    href={activeProduct.payload.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() =>
                      sendTelemetry('link_click', {
                        pageNumber: activeProduct.pageNumber || current + 1,
                        targetUrl: activeProduct.payload.url,
                      })
                    }
                    className="flex-1 rounded-xl bg-amber-400 px-4 py-2.5 text-center text-xs font-extrabold text-slate-950 shadow hover:bg-amber-300 transition"
                  >
                    {activeProduct.payload.ctaText || 'Buy / View Online →'}
                  </a>
                )}
                {(activeProduct.payload.whatsappPhone || settings.profilePhone) && (
                  <a
                    href={`https://wa.me/${(activeProduct.payload.whatsappPhone || settings.profilePhone || '').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                      `Hi! I'm interested in "${activeProduct.payload.title || 'Product'}"${
                        activeProduct.payload.price ? ` (${activeProduct.payload.price})` : ''
                      }${activeProduct.payload.sku ? ` [SKU: ${activeProduct.payload.sku}]` : ''} on Page ${
                        activeProduct.pageNumber || current + 1
                      } of ${title || 'your catalogue'} (${baseShareUrl}?page=${
                        activeProduct.pageNumber || current + 1
                      }).`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() =>
                      sendTelemetry('link_click', {
                        pageNumber: activeProduct.pageNumber || current + 1,
                        targetUrl: 'whatsapp_order',
                      })
                    }
                    className="flex-1 rounded-xl border border-emerald-500/50 bg-emerald-500/20 px-4 py-2.5 text-center text-xs font-bold text-emerald-300 hover:bg-emerald-500/30 transition"
                  >
                    💬 Inquire on WhatsApp
                  </a>
                )}
                {!showProductInquiryForm && (
                  <button
                    type="button"
                    onClick={() => setShowProductInquiryForm(true)}
                    className="rounded-xl border border-amber-400/50 bg-amber-400/10 px-3.5 py-2.5 text-xs font-bold text-amber-300 hover:bg-amber-400/20"
                    title="Send inquiry without WhatsApp"
                  >
                    📋 Email Inquiry
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setActiveProduct(null);
                    setShowProductInquiryForm(false);
                  }}
                  className="rounded-xl border border-slate-700 px-3.5 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* High-Res Image Lightbox Modal */}
      {activeLightboxImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-md"
          onClick={() => setActiveLightboxImage(null)}
        >
          <div
            className="max-h-[90vh] max-w-4xl overflow-hidden rounded-2xl border border-white/15 bg-slate-900 p-4 text-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-amber-400">{activeLightboxImage.title}</h3>
              <button
                type="button"
                onClick={() => setActiveLightboxImage(null)}
                className="rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-white/10 hover:text-white"
              >
                ✕ Close
              </button>
            </div>
            <img
              src={activeLightboxImage.url}
              alt={activeLightboxImage.title}
              className="max-h-[78vh] w-auto mx-auto rounded-lg object-contain"
            />
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

      {/* First / Last Page Professional Notification Card */}
      {pageToast && (
        <div
          role="status"
          aria-live="polite"
          className="hz-page-toast-wrapper"
        >
          <div className={`hz-page-toast-card hz-toast-${pageToast.type}`}>
            <div className="hz-toast-icon-wrap">
              {pageToast.type === 'first' ? (
                <svg className="hz-toast-icon text-sky-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
              ) : (
                <svg className="hz-toast-icon text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                  <line x1="4" y1="22" x2="4" y2="15" />
                </svg>
              )}
            </div>

            <div className="hz-toast-body">
              <div className="hz-toast-header">
                {pageToast.badge && (
                  <span className={`hz-toast-badge hz-badge-${pageToast.type}`}>{pageToast.badge}</span>
                )}
                <span className="hz-toast-title">{pageToast.title}</span>
              </div>
              <p className="hz-toast-msg">{pageToast.message}</p>
            </div>

            {pageToast.actionLabel && pageToast.onAction && (
              <button
                type="button"
                className="hz-toast-action-btn"
                onClick={() => {
                  pageToast.onAction?.();
                  setPageToast(null);
                }}
              >
                {pageToast.actionLabel}
              </button>
            )}

            <button
              type="button"
              onClick={() => setPageToast(null)}
              className="hz-toast-close-btn"
              title="Close"
              aria-label="Close notification"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Phase 4: Classroom Whiteboard / Presentation Mode Overlay & Laser Pointer */}
      {presentationMode && typeof document !== 'undefined' && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            width: '100vw',
            height: '100vh',
            pointerEvents: 'none',
            zIndex: 2147483647,
            overflow: 'visible',
          }}
        >
          {laserPointer && (
            <div
              style={{
                position: 'fixed',
                left: `${pointerPos.x}px`,
                top: `${pointerPos.y}px`,
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                backgroundColor: '#ff2222',
                boxShadow: '0 0 0 2.5px rgba(255, 255, 255, 0.95), 0 0 16px 6px #ff0000, 0 0 32px 10px rgba(255, 0, 0, 0.65)',
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
                zIndex: 2147483647,
              }}
            >
              <div
                style={{
                  width: '6px',
                  height: '6px',
                  margin: '6px auto',
                  borderRadius: '50%',
                  backgroundColor: '#ffffff',
                }}
              />
            </div>
          )}
          <div
            style={{
              position: 'fixed',
              top: '16px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 2147483647,
              pointerEvents: 'auto',
            }}
            className="bg-slate-900/90 text-white backdrop-blur-md px-4 py-2 rounded-full border border-slate-700/80 shadow-2xl flex items-center gap-3 text-xs sm:text-sm font-medium"
          >
            <span className="flex items-center gap-1.5 text-amber-400 font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Classroom Presentation Mode
            </span>
            <button
              type="button"
              onClick={() => setLaserPointer(!laserPointer)}
              className={`px-2.5 py-1 rounded-full text-xs transition-colors font-medium ${
                laserPointer
                  ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                  : 'bg-slate-800 text-slate-300'
              }`}
            >
              {laserPointer ? '🔴 Laser ON (L)' : '⚪ Laser OFF (L)'}
            </button>
            <button
              type="button"
              onClick={() => setPresentationMode(false)}
              className="px-2.5 py-1 rounded-full text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
            >
              Exit (P / Esc)
            </button>
          </div>
        </div>,
        (document.fullscreenElement as HTMLElement) || document.body
      )}
    </div>
  );
}
