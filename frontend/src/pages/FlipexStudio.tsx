import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { api, uploadForm } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import {
  Sparkles,
  Upload,
  RotateCcw,
  Tag,
  Globe,
  FileText,
  CheckCircle2,
  X,
} from '../components/ui/icons';

// --- Types ---
export type DocType = 'catalogue' | 'magazine' | 'album' | 'custom';

export interface StudentProfile {
  name: string;
  photoUrl: string;
  award?: string;
  quote?: string;
  role?: string;
}

export interface PhotoFrameItem {
  url: string;
  caption?: string;
  tilt?: number; // -5 to +5 deg
  frameStyle?: 'polaroid' | 'classic' | 'rounded' | 'shadow';
}

export interface TocItem {
  page_number: number;
  title: string;
  subtitle?: string;
}

export interface CanvasElement {
  id: string;
  type:
    | 'text'
    | 'richText'
    | 'image'
    | 'imageFrame'
    | 'product'
    | 'productCard'
    | 'shape'
    | 'badge'
    | 'button'
    | 'whatsapp'
    | 'column_text'
    | 'article'
    | 'yearbook_grid'
    | 'studentCard'
    | 'album_spread'
    | 'photoGrid'
    | 'photoCollage'
    | 'toc'
    | 'folio';
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number; // 0-359 degrees (Stage 2)
  locked?: boolean;
  groupId?: string;
  content?: string;
  name?: string;
  price?: string;
  originalPrice?: string;
  badge?: string;
  sku?: string;
  whatsappNumber?: string;
  src?: string;
  image?: string;
  url?: string;
  assetRef?: {
    source: string;
    assetId?: number | string | null;
    url: string;
    alt?: string;
    fit?: 'cover' | 'contain' | 'fill';
  };
  description?: string;
  caption?: string;
  linkUrl?: string;

  // Stage 3: Image Frame & Creative Filters
  objectFit?: 'cover' | 'contain' | 'fill';
  filterBrightness?: number; // 50 - 150
  filterContrast?: number; // 50 - 150
  filterSaturation?: number; // 0 - 200
  filterGrayscale?: boolean;
  filterBlur?: number; // 0 - 10

  // Stage 3: Shape & Vector Styling
  shapeType?: 'rectangle' | 'circle' | 'pill' | 'line';
  fillType?: 'solid' | 'gradient';
  gradientFill?: {
    stop1: string;
    stop2: string;
    stop3: string;
    angle: number | 'radial';
  };

  // Stage 3: Commercial Product Details
  rating?: number; // 0 - 5
  stockStatus?: 'in_stock' | 'low_stock' | 'out_of_stock';
  showQrCode?: boolean;

  // Magazine & Editorial properties
  columns?: number; // 1, 2 or 3
  columnGutter?: number;
  dropCap?: boolean;
  kicker?: string;
  subtitle?: string;
  headline?: string;
  authorName?: string;
  authorRole?: string;
  authorAvatar?: string;

  // Yearbook properties
  award?: string;
  classYear?: string;
  quote?: string;
  photoUrl?: string;
  students?: StudentProfile[];

  // Photo Album properties
  albumPhotos?: PhotoFrameItem[];

  // Table of Contents
  tocItems?: TocItem[];

  // Running Folio (Header / Footer)
  folioHeader?: string;
  folioShowPage?: boolean;

  // Stage 6: Linked Text Frames & Master Page Tokens
  linkedNextId?: string;
  linkedPrevId?: string;
  sectionCategory?: string;

  style?: {
    fontSize?: number;
    fontWeight?: string;
    fontStyle?: string;
    fontFamily?: string;
    textDecoration?: 'none' | 'underline' | 'line-through';
    textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
    textShadow?: string;
    color?: string;
    backgroundColor?: string;
    textAlign?: 'left' | 'center' | 'right' | 'justify';
    borderRadius?: number;
    borderColor?: string;
    borderWidth?: number;
    borderStyle?: 'solid' | 'dashed' | 'dotted';
    letterSpacing?: string;
    lineHeight?: number;
    boxShadow?: string;
    opacity?: number;
    transform?: string;
    padding?: string | number;
    zIndex?: number;
    filter?: string;
  };
}

export interface StudioPage {
  id: number;
  document_id: number;
  page_number: number;
  background?: {
    type: string;
    value: string;
    stop1?: string;
    stop2?: string;
    stop3?: string;
    angle?: number | 'radial';
  };
  elements: CanvasElement[];
  thumbnail_url?: string;
}

export interface StudioDocument {
  id: number;
  tenant_id: number;
  title: string;
  doc_type: DocType;
  page_count: number;
  width_pt: number;
  height_pt: number;
  orientation: 'portrait' | 'landscape';
  bleed_pt: number;
  palette?: { primary: string; secondary: string; accent: string; bg: string };
  settings?: { gridSnap: boolean; gridSize: number; showRulers: boolean; showBleed: boolean };
  flipbook_id?: number | null;
  flipbook_slug?: string | null;
  cover_thumb?: string | null;
  status: 'draft' | 'published' | 'archived';
  revision?: number;
  created_at: string;
  updated_at: string;
  pages?: StudioPage[];
}

export interface BrandKitItem {
  id: number;
  tenant_id: number;
  name: string;
  logo_url?: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  background_gradient?: string | null;
  drawer_bg_color?: string | null;
  drawer_text_color?: string | null;
  font_family: string;
  is_default: number;
}

export interface StudioTemplate {
  id: number;
  category: string;
  doc_type: DocType;
  name: string;
  description: string;
  thumbnail_url: string;
  preview_images?: string[];
  canvas_spec?: { pages: { background?: any; elements: CanvasElement[] }[] };
  is_system: number;
  page_count?: number;
  tenant_id?: number | null;
  created_at?: string;
}

export const TEMPLATE_CATEGORIES = [
  { id: 'all', label: 'All Categories', icon: '🌟' },
  { id: 'retail_catalogue', label: 'Retail & Supermarket', icon: '🛒' },
  { id: 'electronics_tech', label: 'Tech & Electronics', icon: '⚡' },
  { id: 'food_restaurant', label: 'Food & Dining Menus', icon: '🍽️' },
  { id: 'real_estate', label: 'Real Estate & Property', icon: '🏡' },
  { id: 'school_yearbook', label: 'School & Yearbooks', icon: '🎓' },
  { id: 'community_magazine', label: 'Editorial Magazines', icon: '📖' },
  { id: 'wedding_album', label: 'Wedding & Keepsakes', icon: '💍' },
  { id: 'annual_report', label: 'Corporate & Annual Reports', icon: '📊' },
  { id: 'marketing_brochure', label: 'Marketing & Brochures', icon: '🚀' },
  { id: 'creative_portfolio', label: 'Creative Portfolios', icon: '🎨' },
];

export interface StudioAsset {
  id: number | string;
  asset_name?: string;
  name?: string;
  asset_type: string;
  file_url?: string;
  url?: string;
  file_size?: number;
  width?: number;
  height?: number;
  tags?: string;
  category?: string;
  created_at?: string;
}

export const GRADIENT_PRESETS = [
  { name: 'Pacific Azure', stop1: '#0284c7', stop2: '#0369a1', stop3: '#0c4a6e', angle: 135 as number | 'radial' },
  { name: 'Sunset Ember', stop1: '#f59e0b', stop2: '#ea580c', stop3: '#b91c1c', angle: 135 as number | 'radial' },
  { name: 'Tropical Emerald', stop1: '#064e3b', stop2: '#059669', stop3: '#10b981', angle: 135 as number | 'radial' },
  { name: 'Ocean Abyss', stop1: '#0f172a', stop2: '#0e7490', stop3: '#14b8a6', angle: 180 as number | 'radial' },
  { name: 'Nordic Slate', stop1: '#1e293b', stop2: '#334155', stop3: '#475569', angle: 135 as number | 'radial' },
  { name: 'Clean Frost', stop1: '#f8fafc', stop2: '#e2e8f0', stop3: '#cbd5e1', angle: 180 as number | 'radial' },
  { name: 'Warm Parchment', stop1: '#fffbeb', stop2: '#fef3c7', stop3: '#fed7aa', angle: 180 as number | 'radial' },
  { name: 'Midnight Noir', stop1: '#020617', stop2: '#0f172a', stop3: '#1e293b', angle: 135 as number | 'radial' },
];

export const ALIGNMENT_OPTIONS: { angle: number | 'radial'; icon: string; label: string }[] = [
  { angle: 315, icon: '↖', label: 'Top-Left (315°)' },
  { angle: 0, icon: '⬆', label: 'Up (0°)' },
  { angle: 45, icon: '↗', label: 'Top-Right (45°)' },
  { angle: 270, icon: '⬅', label: 'Left (270°)' },
  { angle: 'radial', icon: '⊙', label: 'Radial Glow' },
  { angle: 90, icon: '➔', label: 'Right (90°)' },
  { angle: 225, icon: '↙', label: 'Bottom-Left (225°)' },
  { angle: 180, icon: '⬇', label: 'Down (180°)' },
  { angle: 135, icon: '↘', label: 'Bottom-Right (135°)' },
];

export const buildGradientCss = (stop1: string, stop2: string, stop3: string, angle: number | 'radial') => {
  if (angle === 'radial') {
    return `radial-gradient(circle at center, ${stop1} 0%, ${stop2} 50%, ${stop3} 100%)`;
  }
  return `linear-gradient(${angle}deg, ${stop1} 0%, ${stop2} 50%, ${stop3} 100%)`;
};

/**
 * Stage 7: Real-Time Print Resolution Protection (DPI Guard)
 * 72 pt = 1 physical inch. If dpi < 150, image will appear blurry in high-res print.
 */
export function calculateElementDpi(el: CanvasElement): {
  dpi: number;
  status: 'low' | 'good' | 'optimal';
  printInchesW: number;
  printInchesH: number;
  naturalW: number;
  naturalH: number;
} {
  const w = el.w || 200;
  const h = el.h || 200;
  const printInchesW = Number((w / 72).toFixed(2));
  const printInchesH = Number((h / 72).toFixed(2));

  let naturalW = (el as any).naturalWidth || 1200;
  let naturalH = (el as any).naturalHeight || 800;

  if (el.src && el.src.includes('w=')) {
    const match = el.src.match(/w=(\d+)/);
    if (match) {
      naturalW = parseInt(match[1], 10);
      naturalH = Math.round(naturalW * 0.67);
    }
  }

  const dpi = Math.round(naturalW / Math.max(0.1, printInchesW));
  let status: 'low' | 'good' | 'optimal' = 'optimal';
  if (dpi < 150) status = 'low';
  else if (dpi < 300) status = 'good';

  return { dpi, status, printInchesW, printInchesH, naturalW, naturalH };
}

/**
 * Stage 8: Unified High-Fidelity Rendering Pipeline
 * Generates an exact SVG vector representation of a page for flipbook publishing.
 */
export function renderPageToSvg(page: StudioPage, widthPt: number = 595.28, heightPt: number = 841.89): string {
  const bg = page.background;
  let bgStyle = 'fill: #ffffff;';
  let defs = '';

  if (bg) {
    if (bg.type === 'gradient' || (bg.value && bg.value.includes('gradient'))) {
      const stop1 = bg.stop1 || '#0f172a';
      const stop2 = bg.stop2 || '#1e1b4b';
      const stop3 = bg.stop3 || '#312e81';
      defs = `<defs>
        <linearGradient id="pBgGrad_${page.id}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${stop1}" />
          <stop offset="50%" stop-color="${stop2}" />
          <stop offset="100%" stop-color="${stop3}" />
        </linearGradient>
      </defs>`;
      bgStyle = `fill: url(#pBgGrad_${page.id});`;
    } else if ((bg as any).color || bg.value) {
      bgStyle = `fill: ${(bg as any).color || bg.value};`;
    }
  }

  let elementsSvg = '';
  (page.elements || []).forEach((el) => {
    const x = el.x || 0;
    const y = el.y || 0;
    const w = el.w || 100;
    const h = el.h || 50;
    const rot = el.rotation || 0;
    const transform = rot ? `transform="rotate(${rot} ${x + w / 2} ${y + h / 2})"` : '';
    const imgSrc = el.src || el.image || el.url || el.assetRef?.url || '';

    if ((el.type === 'image' || el.type === 'imageFrame') && imgSrc) {
      elementsSvg += `<g ${transform}><image href="${imgSrc}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" /></g>`;
    } else if (el.type === 'text' || el.type === 'column_text' || el.type === 'article' || el.type === 'richText') {
      const color = el.style?.color || '#0f172a';
      const fs = el.style?.fontSize || 14;
      const fw = el.style?.fontWeight || 'normal';
      const ff = el.style?.fontFamily || 'Inter, sans-serif';
      const text = (el.content || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      const kickerHtml = el.kicker ? `<div style="font-size: 10px; font-weight: bold; color: #0284c7; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">${el.kicker.replace(/&/g, '&amp;')}</div>` : '';
      const subHtml = el.subtitle ? `<div style="font-size: 12px; font-style: italic; color: #64748b; margin-bottom: 6px;">${el.subtitle.replace(/&/g, '&amp;')}</div>` : '';
      const bylineHtml = el.authorName ? `<div style="font-size: 10px; font-weight: bold; color: #334155; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">BY ${el.authorName.replace(/&/g, '&amp;').toUpperCase()}${el.authorRole ? ` • ${el.authorRole.replace(/&/g, '&amp;')}` : ''}</div>` : '';
      const cols = (el.type === 'column_text' || el.type === 'article') ? (el.columns || 2) : 1;
      const gutter = el.columnGutter || 20;

      elementsSvg += `<g ${transform}><foreignObject x="${x}" y="${y}" width="${w}" height="${h}">
        <div xmlns="http://www.w3.org/1999/xhtml" style="color: ${color}; font-size: ${fs}px; font-weight: ${fw}; font-family: ${ff}; line-height: 1.5; word-wrap: break-word; column-count: ${cols}; column-gap: ${gutter}px; height: 100%; box-sizing: border-box;">
          ${kickerHtml}${subHtml}${bylineHtml}${text.replace(/\n/g, '<br/>')}
        </div>
      </foreignObject></g>`;
    } else if (el.type === 'product' || el.type === 'productCard') {
      const name = (el.name || 'Product').replace(/&/g, '&amp;');
      const price = (el.price || '').replace(/&/g, '&amp;');
      const sku = (el.sku || '').replace(/&/g, '&amp;');
      const img = imgSrc;
      elementsSvg += `<g ${transform}>
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="#ffffff" stroke="#e2e8f0" stroke-width="1"/>
        ${img ? `<image href="${img}" x="${x + 8}" y="${y + 8}" width="${w - 16}" height="${h * 0.52}" preserveAspectRatio="xMidYMid slice"/>` : ''}
        <text x="${x + 12}" y="${y + h * 0.62}" font-size="12" font-weight="bold" fill="#0f172a" font-family="sans-serif">${name}</text>
        ${sku ? `<text x="${x + w - 12}" y="${y + h * 0.62}" font-size="9" fill="#64748b" text-anchor="end" font-family="monospace">${sku}</text>` : ''}
        <text x="${x + 12}" y="${y + h * 0.74}" font-size="14" font-weight="bold" fill="#dc2626" font-family="sans-serif">${price}</text>
        <rect x="${x + 10}" y="${y + h * 0.81}" width="${w - 20}" height="28" rx="6" fill="#059669"/>
        <text x="${x + w / 2}" y="${y + h * 0.81 + 18}" font-size="11" font-weight="bold" fill="#ffffff" text-anchor="middle" font-family="sans-serif">💬 WhatsApp Order</text>
      </g>`;
    } else if (el.type === 'studentCard') {
      const sName = (el.name || 'Student Name').replace(/&/g, '&amp;');
      const sAward = (el.award || '').replace(/&/g, '&amp;');
      const sQuote = (el.quote || el.description || '').replace(/&/g, '&amp;');
      const img = imgSrc || el.photoUrl || '';
      elementsSvg += `<g ${transform}>
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="#ffffff" stroke="#e2e8f0" stroke-width="1"/>
        ${sAward ? `<rect x="${x + w - 100}" y="${y + 10}" width="90" height="20" rx="10" fill="#f59e0b"/><text x="${x + w - 55}" y="${y + 24}" font-size="9" font-weight="bold" fill="#ffffff" text-anchor="middle" font-family="sans-serif">${sAward}</text>` : ''}
        ${img ? `<clipPath id="sc_clip_${el.id}"><circle cx="${x + w / 2}" cy="${y + 60}" r="40"/></clipPath><image href="${img}" x="${x + w / 2 - 40}" y="${y + 20}" width="80" height="80" clip-path="url(#sc_clip_${el.id})" preserveAspectRatio="xMidYMid slice"/>` : ''}
        <text x="${x + w / 2}" y="${y + 125}" font-size="13" font-weight="bold" fill="#0f172a" text-anchor="middle" font-family="sans-serif">${sName}</text>
        ${sQuote ? `<text x="${x + w / 2}" y="${y + 145}" font-size="10" font-style="italic" fill="#475569" text-anchor="middle" font-family="serif">“${sQuote.slice(0, 45)}…”</text>` : ''}
      </g>`;
    } else if (el.type === 'toc') {
      const title = (el.content || 'TABLE OF CONTENTS').replace(/&/g, '&amp;');
      const items = el.tocItems || [];
      let itemsSvg = '';
      items.forEach((item, idx) => {
        const rowY = y + 50 + idx * 24;
        const itemTitle = (item.title || `Chapter ${idx + 1}`).replace(/&/g, '&amp;');
        const pNum = item.page_number || (idx + 1);
        itemsSvg += `<text x="${x + 20}" y="${rowY}" font-size="11" font-weight="600" fill="#1e293b" font-family="sans-serif">${itemTitle}</text>
          <line x1="${x + 180}" y1="${rowY - 2}" x2="${x + w - 45}" y2="${rowY - 2}" stroke="#94a3b8" stroke-dasharray="2,3"/>
          <text x="${x + w - 20}" y="${rowY}" font-size="11" font-weight="bold" fill="#0284c7" text-anchor="end" font-family="monospace">${pNum}</text>`;
      });
      elementsSvg += `<g ${transform}>
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="#ffffff" stroke="#cbd5e1"/>
        <text x="${x + 20}" y="${y + 30}" font-size="15" font-weight="bold" fill="#0f172a" font-family="sans-serif">${title}</text>
        <line x1="${x + 20}" y1="${y + 38}" x2="${x + w - 20}" y2="${y + 38}" stroke="#e2e8f0"/>
        ${itemsSvg}
      </g>`;
    } else if (el.type === 'folio') {
      const headerText = (el.folioHeader || 'Nuvis Flipex Publication').replace(/&/g, '&amp;');
      elementsSvg += `<g ${transform}>
        <line x1="${x}" y1="${y + 2}" x2="${x + w}" y2="${y + 2}" stroke="#cbd5e1" stroke-width="1"/>
        <text x="${x}" y="${y + 14}" font-size="9" fill="#94a3b8" font-family="monospace">${headerText}</text>
        ${el.folioShowPage ? `<text x="${x + w}" y="${y + 14}" font-size="9" fill="#94a3b8" text-anchor="end" font-family="monospace">Page ${page.page_number}</text>` : ''}
      </g>`;
    } else if (el.type === 'shape') {
      const fill = el.style?.backgroundColor || '#0284c7';
      const rx = el.shapeType === 'circle' ? w / 2 : (el.style?.borderRadius || 0);
      elementsSvg += `<g ${transform}><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"/></g>`;
    } else if (el.type === 'yearbook_grid') {
      elementsSvg += `<g ${transform}>
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="#f8fafc" stroke="#e2e8f0"/>
      </g>`;
    } else if (el.type === 'album_spread') {
      elementsSvg += `<g ${transform}>
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="#f1f5f9"/>
      </g>`;
    }
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${widthPt} ${heightPt}" width="${widthPt}" height="${heightPt}">
    ${defs}
    <rect width="100%" height="100%" ${bgStyle} />
    ${elementsSvg}
  </svg>`;
}

export default function FlipexStudio() {
  const { id: routeDocId } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { can } = useAuth();

  // Mode: list vs editor
  const [activeDocId, setActiveDocId] = useState<number | null>(routeDocId ? parseInt(routeDocId, 10) : null);
  const [documents, setDocuments] = useState<StudioDocument[]>([]);
  const [templates, setTemplates] = useState<StudioTemplate[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Stage 4: Template Platform & Discovery Browser State
  const [hubView, setHubView] = useState<'documents' | 'templates'>('documents');
  const [templateCategory, setTemplateCategory] = useState<string>('all');
  const [templateSearch, setTemplateSearch] = useState<string>('');
  const [templateDocType, setTemplateDocType] = useState<string>('all');
  const [templateScope, setTemplateScope] = useState<'all' | 'system' | 'custom'>('all');
  const [previewTemplate, setPreviewTemplate] = useState<StudioTemplate | null>(null);
  const [previewPageIndex, setPreviewPageIndex] = useState<number>(0);
  const [loadingTemplateDetail, setLoadingTemplateDetail] = useState<boolean>(false);
  const [showSaveAsTemplateModal, setShowSaveAsTemplateModal] = useState<boolean>(false);
  const [templateFormName, setTemplateFormName] = useState<string>('');
  const [templateFormCategory, setTemplateFormCategory] = useState<string>('retail_catalogue');
  const [templateFormDesc, setTemplateFormDesc] = useState<string>('');
  const [savingTemplate, setSavingTemplate] = useState<boolean>(false);

  // Sprint 2: Asset Management & Media Library State
  const [tenantAssets, setTenantAssets] = useState<StudioAsset[]>([]);
  const [stockAssets, setStockAssets] = useState<StudioAsset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState<boolean>(false);
  const [assetTab, setAssetTab] = useState<'uploads' | 'stock'>('uploads');
  const [assetCategory, setAssetCategory] = useState<string>('all');
  const [assetSearch, setAssetSearch] = useState<string>('');
  const [uploadingAsset, setUploadingAsset] = useState<boolean>(false);
  const [assetModalOpen, setAssetModalOpen] = useState<boolean>(false);

  // Active Document in Editor
  const [currentDoc, setCurrentDoc] = useState<StudioDocument | null>(null);
  const [pages, setPages] = useState<StudioPage[]>([]);
  const [activePageIndex, setActivePageIndex] = useState<number>(0);

  // Multi-Selection State & backward-compatible single-element getter
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const selectedElementId = selectedElementIds[0] || null;
  const setSelectedElementId = useCallback((id: string | null) => {
    setSelectedElementIds(id ? [id] : []);
  }, []);

  // Stage 2: 8 Resize Handles, Rotation, Magnetic Snap & History Stack
  const [rotatingElementId, setRotatingElementId] = useState<string | null>(null);
  const [activeGuides, setActiveGuides] = useState<{ type: 'x' | 'y'; pos: number }[]>([]);
  const [rubberbandBox, setRubberbandBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [history, setHistory] = useState<StudioPage[][]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // Undo / Redo Stack Management
  const pushHistory = useCallback((newPages: StudioPage[]) => {
    setHistory((prev) => {
      const sliced = historyIndex >= 0 ? prev.slice(0, historyIndex + 1) : [];
      const next = [...sliced, JSON.parse(JSON.stringify(newPages))];
      if (next.length > 50) next.shift();
      return next;
    });
    setHistoryIndex((prev) => Math.min(prev + 1, 49));
  }, [historyIndex]);

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const nextIdx = historyIndex - 1;
      const targetSnapshot = history[nextIdx];
      if (targetSnapshot) {
        setPages(JSON.parse(JSON.stringify(targetSnapshot)));
        setHistoryIndex(nextIdx);
      }
    }
  }, [history, historyIndex]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextIdx = historyIndex + 1;
      const targetSnapshot = history[nextIdx];
      if (targetSnapshot) {
        setPages(JSON.parse(JSON.stringify(targetSnapshot)));
        setHistoryIndex(nextIdx);
      }
    }
  }, [history, historyIndex]);

  const [zoom, setZoom] = useState<number>(75);
  const [showBleed, setShowBleed] = useState<boolean>(true);
  const [gridSnap, setGridSnap] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveMessage, setSaveMessage] = useState<string>('');
  const [publishModal, setPublishModal] = useState<{ open: boolean; slug?: string; url?: string; previewUrl?: string; flipbookId?: number } | null>(null);
  // Stage 6: Facing Pages / 2-Page Magazine Centerfold Spread
  const [spreadMode, setSpreadMode] = useState<boolean>(false);

  // Stage 8: Debounced Document-Wide Autosave & Crash Recovery
  const [autosaveStatus, setAutosaveStatus] = useState<'saved' | 'saving' | 'offline' | 'restored'>('saved');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [backupAvailable, setBackupAvailable] = useState<{ timestamp: string; docId: number; title: string; pages: StudioPage[] } | null>(null);
  const isInitialLoadRef = useRef<boolean>(true);

  // Stage 7: Resolution Guard Pre-Flight Modal
  const [showDpiGuardModal, setShowDpiGuardModal] = useState<boolean>(false);

  // Stage 9: Brand Kits State
  const [showBrandKitsModal, setShowBrandKitsModal] = useState<boolean>(false);
  const [brandKits, setBrandKits] = useState<BrandKitItem[]>([]);
  const [loadingBrandKits, setLoadingBrandKits] = useState<boolean>(false);
  const [applyingBrandKit, setApplyingBrandKit] = useState<boolean>(false);
  const [newBrandKitName, setNewBrandKitName] = useState<string>('');

  // Stage 8: Background Export Queue State
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [exportJobProgress, setExportJobProgress] = useState<number | null>(null);
  const [exportDownloadUrl, setExportDownloadUrl] = useState<string | null>(null);

  // Stage 7: Staged Bulk Photos for Keepsake Album & College Rosters
  const [stagedAlbumPhotos, setStagedAlbumPhotos] = useState<Array<{ url: string; caption?: string; tilt?: number }>>([
    { url: 'https://images.unsplash.com/photo-1519741497674-611481863552?w=500', caption: 'The First Dance', tilt: -2 },
    { url: 'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?w=500', caption: 'Sunset on the Lagoon', tilt: 3 },
    { url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=500', caption: 'Island Memories', tilt: -1 },
    { url: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=500', caption: 'Coral Reef Exploration', tilt: 2 },
  ]);
  const albumFileInputRef = useRef<HTMLInputElement>(null);
  const rosterFileInputRef = useRef<HTMLInputElement>(null);
  const [yearbookPerPage, setYearbookPerPage] = useState<4 | 6 | 8 | 12>(6);

  // Left sidebar active tool tab
  const [activeToolTab, setActiveToolTab] = useState<
    'products' | 'magazine' | 'yearbook' | 'album' | 'text' | 'media' | 'shapes' | 'csv'
  >('products');

  // Modals
  const [showNewDocModal, setShowNewDocModal] = useState<boolean>(false);
  const [newTitle, setNewTitle] = useState<string>('My New Catalogue');
  const [newDocType, setNewDocType] = useState<DocType>('catalogue');
  const [newOrientation, setNewOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [newTemplateId, setNewTemplateId] = useState<number | null>(null);
  const [creatingDoc, setCreatingDoc] = useState<boolean>(false);

  // CSV Bulk Import state (Products vs SKU Sync vs Yearbook Rosters)
  const [csvMode, setCsvMode] = useState<'products' | 'sku_sync' | 'yearbook'>('products');
  const [csvPerPage, setCsvPerPage] = useState<4 | 6>(4);
  const [csvSyncType, setCsvSyncType] = useState<'append' | 'multipage' | 'sku_sync'>('multipage');
  const [flashDiscountPercent, setFlashDiscountPercent] = useState<number>(20);
  const [flashDiscountScope, setFlashDiscountScope] = useState<'page' | 'all'>('page');
  const [csvText, setCsvText] = useState<string>(
    'Name,Price,WasPrice,Badge,Image,WhatsApp,SKU,Description\n' +
    'Punjas Premium Rice 10kg,$22.50,$26.00,SAVE $3.50,https://images.unsplash.com/photo-1586201375761-83865001e31c?w=500,+6799991234,PUN-10,Premium long grain fortified parboiled rice.\n' +
    'Fiji Fresh Island Bananas,$5.99,$8.50,FRESH,+6799991234,BAN-01,Organic farm fresh ripe Cavendish bananas per bunch.\n' +
    'Pacific Sun Cooking Oil 2L,$11.95,$14.20,HOT DEAL,https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=500,+6799991234,OIL-02,Pure blended vegetable cooking oil for high-heat frying.\n' +
    'Rewa Fresh Milk 1L x 6,$16.80,$19.50,BULK BUY,https://images.unsplash.com/photo-1550583724-b2692b85b150?w=500,+6799991234,MLK-06,Pasteurised homogenized fresh dairy milk carton bundle.'
  );

  // Dragging & Moving elements on canvas
  const canvasRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const isDraggingRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number; elX: number; elY: number } | null>(null);

  // Collapsible Studio Panels for Expansive Canvas View
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState<boolean>(false);

  // Inspector Tab Switching: Element Properties vs Page & 3-Gradient Background
  const [inspectorTab, setInspectorTab] = useState<'element' | 'page'>('page');

  // Page Background Style Mode: 3-Color Gradient vs Solid Mono Color
  const [bgMode, setBgMode] = useState<'gradient' | 'solid'>('gradient');

  // Collapse state for bottom page thumbnail strip (Stage 1)
  const [bottomStripCollapsed, setBottomStripCollapsed] = useState<boolean>(false);

  // Auto-Fit Canvas to Screen Viewport
  const handleFitToScreen = useCallback(() => {
    if (!mainRef.current) return;
    const paddingX = 80;
    const paddingY = 80;
    const availW = mainRef.current.clientWidth - paddingX;
    const availH = mainRef.current.clientHeight - paddingY;
    if (availW <= 0 || availH <= 0) return;
    const docW = currentDoc?.width_pt || 595.28;
    const docH = currentDoc?.height_pt || 841.89;
    const fitScaleX = availW / docW;
    const fitScaleY = availH / docH;
    const fitScale = Math.min(fitScaleX, fitScaleY);
    const fitZoom = Math.min(200, Math.max(30, Math.round(fitScale * 100)));
    setZoom(fitZoom);
  }, [currentDoc]);

  // Auto-fit canvas to viewport when document loads or panels collapse/expand
  useEffect(() => {
    if (currentDoc) {
      const timer = setTimeout(() => {
        handleFitToScreen();
      }, 120);
      return () => clearTimeout(timer);
    }
  }, [currentDoc?.id, sidebarCollapsed, inspectorCollapsed, bottomStripCollapsed, handleFitToScreen]);

  // ResizeObserver on canvas viewport to adapt zoom automatically on any viewport change
  useEffect(() => {
    if (!mainRef.current || !currentDoc) return;
    let resizeTimer: any = null;
    const observer = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        handleFitToScreen();
      }, 100);
    });
    observer.observe(mainRef.current);
    return () => {
      clearTimeout(resizeTimer);
      observer.disconnect();
    };
  }, [currentDoc?.id, handleFitToScreen]);

  // Load document list
  const loadDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const q = searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : '';
      const t = filterType !== 'all' ? `&doc_type=${filterType}` : '';
      const res = await api<{ documents: StudioDocument[] }>(`/studio/documents?${q}${t}`);
      setDocuments(res.documents || []);
    } catch {
      // transient error handling
    } finally {
      setLoading(false);
    }
  }, [searchQuery, filterType]);

  // Load template library with search, category, and scope filters
  const loadTemplates = useCallback(async () => {
    try {
      const q = templateSearch ? `q=${encodeURIComponent(templateSearch)}&` : '';
      const c = templateCategory !== 'all' ? `category=${encodeURIComponent(templateCategory)}&` : '';
      const t = templateDocType !== 'all' ? `doc_type=${encodeURIComponent(templateDocType)}&` : '';
      const s = templateScope !== 'all' ? `scope=${encodeURIComponent(templateScope)}&` : '';
      const res = await api<{ templates: StudioTemplate[] }>(`/studio/templates?${q}${c}${t}${s}`);
      setTemplates(res.templates || []);
    } catch {
      //
    }
  }, [templateSearch, templateCategory, templateDocType, templateScope]);

  // Sprint 2: Load Tenant Uploaded Assets
  const loadTenantAssets = useCallback(async () => {
    try {
      setLoadingAssets(true);
      const q = assetSearch ? `q=${encodeURIComponent(assetSearch)}&` : '';
      const res = await api<{ assets: StudioAsset[] }>(`/studio/assets?scope=tenant&${q}`);
      setTenantAssets(res.assets || []);
    } catch {
      //
    } finally {
      setLoadingAssets(false);
    }
  }, [assetSearch]);

  // Sprint 2: Load Curated Stock Library Assets
  const loadStockAssets = useCallback(async () => {
    try {
      setLoadingAssets(true);
      const cat = assetCategory !== 'all' ? `type=${encodeURIComponent(assetCategory)}&` : '';
      const q = assetSearch ? `q=${encodeURIComponent(assetSearch)}&` : '';
      const res = await api<{ assets: StudioAsset[] }>(`/studio/assets?scope=library&${cat}${q}`);
      setStockAssets(res.assets || []);
    } catch {
      //
    } finally {
      setLoadingAssets(false);
    }
  }, [assetCategory, assetSearch]);

  useEffect(() => {
    if (activeToolTab === 'media' || assetModalOpen) {
      if (assetTab === 'uploads') {
        loadTenantAssets();
      } else {
        loadStockAssets();
      }
    }
  }, [activeToolTab, assetModalOpen, assetTab, loadTenantAssets, loadStockAssets]);

  // Stage 4: Open Template Multi-Page Interactive Preview
  const handleOpenTemplatePreview = async (tpl: StudioTemplate) => {
    setPreviewTemplate(tpl);
    setPreviewPageIndex(0);
    setLoadingTemplateDetail(true);
    try {
      const res = await api<{ template: StudioTemplate }>(`/studio/templates/${tpl.id}`);
      if (res.template) {
        setPreviewTemplate(res.template);
      }
    } catch {
      // Keep lightweight tpl on network error
    } finally {
      setLoadingTemplateDetail(false);
    }
  };

  // Stage 4: Launch Document from Template
  const handleUseTemplate = async (templateId: number, customTitle?: string) => {
    try {
      setCreatingDoc(true);
      const tpl = templates.find((t) => t.id === templateId) || previewTemplate;
      const docTitle = customTitle || (tpl ? `${tpl.name} Project` : 'My New Publication');
      const body = {
        title: docTitle,
        doc_type: tpl?.doc_type || 'catalogue',
        orientation: 'portrait',
        template_id: templateId,
      };
      const res = await api<{ ok: boolean; document_id: number }>('/studio/documents', 'POST', body);
      setPreviewTemplate(null);
      setShowNewDocModal(false);
      navigate(`/studio/${res.document_id}`);
      setActiveDocId(res.document_id);
    } catch (e: any) {
      alert('Failed to launch document from template: ' + (e?.message || 'Server error'));
    } finally {
      setCreatingDoc(false);
    }
  };

  // Stage 4: Save current document as reusable template
  const handleSaveAsTemplate = async () => {
    if (!currentDoc || !templateFormName.trim() || savingTemplate) return;
    setSavingTemplate(true);
    try {
      await api('/studio/templates', 'POST', {
        name: templateFormName.trim(),
        description: templateFormDesc.trim(),
        category: templateFormCategory,
        document_id: currentDoc.id,
      });
      setShowSaveAsTemplateModal(false);
      setSaveMessage('✓ Document saved to Template Library!');
      setTimeout(() => setSaveMessage(''), 4000);
      loadTemplates();
    } catch (e: any) {
      alert('Failed to save template: ' + (e?.message || 'Server error'));
    } finally {
      setSavingTemplate(false);
    }
  };

  // Stage 4: Delete custom template
  const handleDeleteCustomTemplate = async (templateId: number) => {
    if (!window.confirm('Are you sure you want to delete this custom template?')) return;
    try {
      await api(`/studio/templates/${templateId}`, 'DELETE');
      setTemplates((prev) => prev.filter((t) => t.id !== templateId));
    } catch (e: any) {
      alert('Failed to delete template: ' + (e?.message || 'Server error'));
    }
  };

  // Load single document in editor
  const loadDocumentEditor = useCallback(async (docId: number) => {
    setLoading(true);
    try {
      const res = await api<{ document: StudioDocument }>(`/studio/documents/${docId}`);
      if (res.document) {
        setCurrentDoc(res.document);
        const docPages = res.document.pages || [];
        setPages(docPages);
        setHistory([JSON.parse(JSON.stringify(docPages))]);
        setHistoryIndex(0);
        setActivePageIndex(0);
        setSelectedElementIds([]);
        // Set default tab based on doc_type
        if (res.document.doc_type === 'magazine') setActiveToolTab('magazine');
        else if (res.document.doc_type === 'album') setActiveToolTab('album');
        else setActiveToolTab('products');

        // Stage 8: Check Local Recovery Snapshot
        try {
          const backupStr = localStorage.getItem(`flipex_studio_draft_${docId}`);
          if (backupStr) {
            const parsed = JSON.parse(backupStr);
            if (parsed && parsed.pages && parsed.pages.length > 0) {
              const bTime = new Date(parsed.timestamp).getTime();
              const sTime = new Date(res.document.updated_at).getTime();
              if (bTime > sTime + 3000) {
                setBackupAvailable(parsed);
              }
            }
          }
        } catch (be) {}
        isInitialLoadRef.current = false;
      }
    } catch (err: any) {
      alert('Could not load studio document: ' + err.message);
      setActiveDocId(null);
      navigate('/studio');
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    if (activeDocId) {
      loadDocumentEditor(activeDocId);
    } else {
      loadDocuments();
    }
  }, [activeDocId, loadDocumentEditor, loadDocuments]);

  // Sync route param changes
  useEffect(() => {
    if (routeDocId) {
      const parsed = parseInt(routeDocId, 10);
      if (parsed !== activeDocId) setActiveDocId(parsed);
    } else if (activeDocId !== null) {
      setActiveDocId(null);
    }
  }, [routeDocId]);

  // Stage 8: Debounced Document-Wide Autosave (1.5s delay)
  useEffect(() => {
    if (!currentDoc || isInitialLoadRef.current || pages.length === 0) return;

    // 1. Immediately store to local recovery snapshot
    try {
      localStorage.setItem(`flipex_studio_draft_${currentDoc.id}`, JSON.stringify({
        timestamp: new Date().toISOString(),
        docId: currentDoc.id,
        title: currentDoc.title,
        pages,
      }));
    } catch (err) {}

    // 2. Debounced save to backend
    setAutosaveStatus('saving');
    const timer = setTimeout(async () => {
      try {
        const res = await api<{ ok: boolean; revision: number; updated_at: string }>(
          `/studio/documents/${currentDoc.id}/autosave`,
          'POST',
          {
            title: currentDoc.title,
            settings: currentDoc.settings,
            palette: currentDoc.palette,
            pages: pages.map((p) => ({
              page_number: p.page_number,
              elements: p.elements,
              background: p.background,
              thumbnail_url: p.thumbnail_url,
            })),
          }
        );
        if (res.revision) {
          currentDoc.revision = res.revision;
        }
        setLastSavedAt(new Date().toLocaleTimeString());
        setAutosaveStatus('saved');
      } catch (err) {
        setAutosaveStatus('offline');
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [pages, currentDoc?.title, currentDoc?.settings, currentDoc?.palette]);

  // Restore unsaved local recovery snapshot
  const handleRestoreBackup = () => {
    if (!backupAvailable) return;
    setPages(backupAvailable.pages);
    setAutosaveStatus('restored');
    setSaveMessage('Restored draft from backup ✓');
    setTimeout(() => setSaveMessage(''), 3000);
    setBackupAvailable(null);
  };

  // Current active page
  const activePage = pages[activePageIndex] || null;
  const selectedElement = activePage?.elements.find((e) => e.id === selectedElementId) || null;

  // Create new document
  const handleCreateDocument = async () => {
    if (!newTitle.trim() || creatingDoc) return;
    setCreatingDoc(true);
    try {
      const body: any = {
        title: newTitle.trim(),
        doc_type: newDocType,
        orientation: newOrientation,
        width_pt: newOrientation === 'portrait' ? 595.28 : 841.89,
        height_pt: newOrientation === 'portrait' ? 841.89 : 595.28,
        bleed_pt: 9.00,
      };
      if (newTemplateId) body.template_id = newTemplateId;

      const res = await api<{ ok: boolean; document_id: number }>('/studio/documents', 'POST', body);
      setShowNewDocModal(false);
      navigate(`/studio/${res.document_id}`);
      setActiveDocId(res.document_id);
    } catch (e: any) {
      alert('Failed to create document: ' + (e?.message || 'Server error'));
    } finally {
      setCreatingDoc(false);
    }
  };

  // Save current active page and entire document atomically with revision tracking (Stage 8)
  const handleSavePage = async () => {
    if (!currentDoc) return;
    setSaving(true);
    setAutosaveStatus('saving');
    try {
      const res = await api<{ ok: boolean; revision: number; updated_at: string }>(
        `/studio/documents/${currentDoc.id}/autosave`,
        'POST',
        {
          title: currentDoc.title,
          settings: currentDoc.settings,
          palette: currentDoc.palette,
          pages: pages.map((p) => ({
            page_number: p.page_number,
            elements: p.elements,
            background: p.background,
            thumbnail_url: p.thumbnail_url,
          })),
        }
      );
      if (res.revision) {
        currentDoc.revision = res.revision;
      }
      setLastSavedAt(new Date().toLocaleTimeString());
      setAutosaveStatus('saved');
      setSaveMessage('Saved publication ✓');
      setTimeout(() => setSaveMessage(''), 2500);
    } catch (e: any) {
      setSaveMessage('Save failed');
      setAutosaveStatus('offline');
    } finally {
      setSaving(false);
    }
  };

  // Add new page to document
  const handleAddPage = async () => {
    if (!currentDoc) return;
    try {
      const res = await api<{ ok: boolean; page_id: number; page_number: number }>(
        `/studio/documents/${currentDoc.id}/pages`,
        'POST',
        { elements: [], background: { type: 'color', value: '#FFFFFF' } }
      );
      const newPg: StudioPage = {
        id: res.page_id,
        document_id: currentDoc.id,
        page_number: res.page_number,
        elements: [],
        background: { type: 'color', value: '#FFFFFF' },
      };
      setPages([...pages, newPg]);
      setActivePageIndex(pages.length);
      setSelectedElementId(null);
    } catch (e: any) {
      alert('Failed to add page: ' + e.message);
    }
  };

  // Delete page
  const handleDeletePage = async (pageId: number) => {
    if (!currentDoc || pages.length <= 1) {
      alert('Documents must have at least one page');
      return;
    }
    if (!confirm('Are you sure you want to delete this page?')) return;
    try {
      await api(`/studio/documents/${currentDoc.id}/pages/${pageId}`, 'DELETE');
      const filtered = pages.filter((p) => p.id !== pageId);
      // re-index
      filtered.forEach((p, idx) => (p.page_number = idx + 1));
      setPages(filtered);
      setActivePageIndex(Math.max(0, activePageIndex - 1));
      setSelectedElementId(null);
    } catch (e: any) {
      alert('Delete failed: ' + e.message);
    }
  };

  // Duplicate page (Stage 1)
  const handleDuplicatePage = async (pageIdx: number) => {
    if (!currentDoc || !pages[pageIdx]) return;
    const sourcePage = pages[pageIdx];
    try {
      const clonedElements = sourcePage.elements.map((el) => ({
        ...el,
        id: 'el_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      }));
      const res = await api<{ ok: boolean; page_id: number; page_number: number }>(
        `/studio/documents/${currentDoc.id}/pages`,
        'POST',
        {
          elements: clonedElements,
          background: sourcePage.background ? { ...sourcePage.background } : { type: 'color', value: '#FFFFFF' },
        }
      );
      const newPage: StudioPage = {
        id: res.page_id,
        document_id: currentDoc.id,
        page_number: pageIdx + 2,
        elements: clonedElements,
        background: sourcePage.background ? { ...sourcePage.background } : { type: 'color', value: '#FFFFFF' },
      };
      const updated = [...pages];
      updated.splice(pageIdx + 1, 0, newPage);
      updated.forEach((p, idx) => (p.page_number = idx + 1));
      setPages(updated);
      setActivePageIndex(pageIdx + 1);
      setSelectedElementId(null);
    } catch (e: any) {
      alert('Failed to duplicate page: ' + e.message);
    }
  };

  // Reorder page position (Stage 1)
  const handleMovePage = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= pages.length || fromIndex === toIndex) return;
    const updated = [...pages];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    updated.forEach((p, idx) => (p.page_number = idx + 1));
    setPages(updated);
    setActivePageIndex(toIndex);
  };

  // Publish to interactive flipbook with Stage 8 high-fidelity composite page rendering
  const handlePublish = async () => {
    if (!currentDoc) return;
    await handleSavePage();
    setSaving(true);
    try {
      // Stage 8: Unified High-Fidelity Rendering Pipeline (Vector SVG composites per page)
      const pageRenders: Record<number, string> = {};
      pages.forEach((p) => {
        const svg = renderPageToSvg(p, currentDoc.width_pt, currentDoc.height_pt);
        pageRenders[p.page_number] = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
      });

      const res = await api<{ ok: boolean; slug: string; public_url: string; viewer_url: string; flipbook_id?: number; preview_url?: string }>(
        `/studio/documents/${currentDoc.id}/publish`,
        'POST',
        { page_renders: pageRenders }
      );
      if (res.flipbook_id) {
        currentDoc.flipbook_id = res.flipbook_id;
        currentDoc.status = 'published';
      }
      setPublishModal({
        open: true,
        slug: res.slug,
        url: res.public_url || `/v/${res.slug}`,
        previewUrl: res.preview_url || (res.flipbook_id ? `/dashboard/preview/${res.flipbook_id}` : undefined),
        flipbookId: res.flipbook_id,
      });
    } catch (e: any) {
      alert('Publish failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  // Add element to active page
  const addElement = (elPartial: Partial<CanvasElement>) => {
    if (!activePage) return;
    const newId = 'el_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    const snap = (v: number) => (gridSnap ? Math.round(v / 10) * 10 : v);
    const newElement: CanvasElement = {
      id: newId,
      type: elPartial.type || 'text',
      x: snap(elPartial.x ?? 50),
      y: snap(elPartial.y ?? 70),
      w: elPartial.w ?? 240,
      h: elPartial.h ?? 160,
      rotation: elPartial.rotation || 0,
      content: elPartial.content,
      name: elPartial.name,
      price: elPartial.price,
      originalPrice: elPartial.originalPrice,
      badge: elPartial.badge,
      sku: elPartial.sku,
      whatsappNumber: elPartial.whatsappNumber,
      src: elPartial.src,
      image: elPartial.image,
      description: elPartial.description,
      caption: elPartial.caption,
      linkUrl: elPartial.linkUrl,
      columns: elPartial.columns,
      columnGutter: elPartial.columnGutter,
      dropCap: elPartial.dropCap,
      authorName: elPartial.authorName,
      authorRole: elPartial.authorRole,
      authorAvatar: elPartial.authorAvatar,
      students: elPartial.students,
      albumPhotos: elPartial.albumPhotos,
      tocItems: elPartial.tocItems,
      folioHeader: elPartial.folioHeader,
      folioShowPage: elPartial.folioShowPage,
      style: {
        fontSize: 15,
        color: '#0F172A',
        textAlign: 'left',
        ...elPartial.style,
      },
    };

    const updatedPages = [...pages];
    updatedPages[activePageIndex].elements.push(newElement);
    setPages(updatedPages);
    setSelectedElementIds([newId]);
    pushHistory(updatedPages);
  };

  // Update selected element
  const updateSelectedElement = (updates: Partial<CanvasElement>, recordHistory = false) => {
    if (!activePage || !selectedElementId) return;
    const updatedPages = [...pages];
    const elIdx = updatedPages[activePageIndex].elements.findIndex((e) => e.id === selectedElementId);
    if (elIdx !== -1) {
      updatedPages[activePageIndex].elements[elIdx] = {
        ...updatedPages[activePageIndex].elements[elIdx],
        ...updates,
        style: {
          ...updatedPages[activePageIndex].elements[elIdx].style,
          ...(updates.style || {}),
        },
      };
      setPages(updatedPages);
      if (recordHistory) {
        pushHistory(updatedPages);
      }
    }
  };

  // Delete all selected elements (Multi-delete)
  const deleteSelectedElements = () => {
    if (!activePage || selectedElementIds.length === 0) return;
    const updatedPages = [...pages];
    updatedPages[activePageIndex].elements = updatedPages[activePageIndex].elements.filter(
      (e) => !selectedElementIds.includes(e.id)
    );
    setPages(updatedPages);
    setSelectedElementIds([]);
    pushHistory(updatedPages);
  };

  const deleteSelectedElement = deleteSelectedElements;

  // Duplicate selected elements
  const duplicateSelectedElements = () => {
    if (!activePage || selectedElementIds.length === 0) return;
    const toClone = activePage.elements.filter((e) => selectedElementIds.includes(e.id));
    if (toClone.length === 0) return;
    const newIds: string[] = [];
    const clones: CanvasElement[] = toClone.map((el) => {
      const newId = 'el_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
      newIds.push(newId);
      return {
        ...el,
        id: newId,
        x: el.x + 20,
        y: el.y + 20,
        style: { ...el.style },
      };
    });
    const updatedPages = [...pages];
    updatedPages[activePageIndex].elements = [...updatedPages[activePageIndex].elements, ...clones];
    setPages(updatedPages);
    setSelectedElementIds(newIds);
    pushHistory(updatedPages);
  };

  // Nudge selected elements with arrow keys
  const nudgeSelectedElements = (dx: number, dy: number) => {
    if (!activePage || selectedElementIds.length === 0) return;
    const updatedPages = [...pages];
    updatedPages[activePageIndex].elements = updatedPages[activePageIndex].elements.map((el) => {
      if (selectedElementIds.includes(el.id)) {
        return {
          ...el,
          x: Math.max(0, el.x + dx),
          y: Math.max(0, el.y + dy),
        };
      }
      return el;
    });
    setPages(updatedPages);
  };

  // 8-Handle Resize
  const handleResizeMouseDown = (
    e: React.MouseEvent,
    el: CanvasElement,
    handle: 'tl' | 'tc' | 'tr' | 'mr' | 'br' | 'bc' | 'bl' | 'ml'
  ) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = el.x;
    const origY = el.y;
    const origW = el.w;
    const origH = el.h;
    const aspectRatio = origW / Math.max(1, origH);
    const docW = currentDoc?.width_pt || 595.28;
    const docH = currentDoc?.height_pt || 841.89;

    const onMouseMove = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / (zoom / 100);
      const dy = (ev.clientY - startY) / (zoom / 100);
      let newX = origX;
      let newY = origY;
      let newW = origW;
      let newH = origH;

      if (handle.includes('r')) newW = Math.max(20, origW + dx);
      if (handle.includes('l')) {
        const rawW = origW - dx;
        if (rawW >= 20) {
          newW = rawW;
          newX = origX + dx;
        }
      }
      if (handle.includes('b')) newH = Math.max(20, origH + dy);
      if (handle.includes('t')) {
        const rawH = origH - dy;
        if (rawH >= 20) {
          newH = rawH;
          newY = origY + dy;
        }
      }

      // Proportional resize when shift key held on corner handles
      if (ev.shiftKey && ['tl', 'tr', 'br', 'bl'].includes(handle)) {
        newH = Math.max(20, Math.round(newW / aspectRatio));
      }

      // Compute magnetic guide lines
      const guides: { type: 'x' | 'y'; pos: number }[] = [];
      const threshold = 6;
      const snapPointsX = [9, 36, docW / 2, docW - 36, docW - 9];
      const snapPointsY = [9, 36, docH / 2, docH - 36, docH - 9];

      for (const sp of snapPointsX) {
        if (Math.abs(newX + newW - sp) < threshold) {
          newW = sp - newX;
          guides.push({ type: 'x', pos: sp });
        } else if (Math.abs(newX - sp) < threshold) {
          newX = sp;
          guides.push({ type: 'x', pos: sp });
        }
      }
      for (const sp of snapPointsY) {
        if (Math.abs(newY + newH - sp) < threshold) {
          newH = sp - newY;
          guides.push({ type: 'y', pos: sp });
        } else if (Math.abs(newY - sp) < threshold) {
          newY = sp;
          guides.push({ type: 'y', pos: sp });
        }
      }
      setActiveGuides(guides);

      updateSelectedElement({
        x: Math.round(newX),
        y: Math.round(newY),
        w: Math.round(newW),
        h: Math.round(newH),
      });
    };

    const onMouseUp = () => {
      setActiveGuides([]);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      pushHistory(pages);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Rotation Knob Interaction
  const handleRotateMouseDown = (e: React.MouseEvent, el: CanvasElement) => {
    e.stopPropagation();
    e.preventDefault();
    setRotatingElementId(el.id);

    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect) return;

    const scale = zoom / 100;
    const elemCenterX = canvasRect.left + (el.x + el.w / 2) * scale;
    const elemCenterY = canvasRect.top + (el.y + el.h / 2) * scale;

    const onMouseMove = (ev: MouseEvent) => {
      const radians = Math.atan2(ev.clientY - elemCenterY, ev.clientX - elemCenterX);
      let deg = Math.round((radians * 180) / Math.PI) + 90;
      if (deg < 0) deg += 360;
      deg = deg % 360;

      // Magnetic snap to primary angles (0, 45, 90, 135, 180, 225, 270, 315)
      const snapAngles = [0, 45, 90, 135, 180, 225, 270, 315, 360];
      for (const sa of snapAngles) {
        if (Math.abs(deg - sa) <= 4) {
          deg = sa === 360 ? 0 : sa;
          break;
        }
      }

      if (ev.shiftKey) {
        deg = Math.round(deg / 15) * 15;
      }

      updateSelectedElement({ rotation: deg });
    };

    const onMouseUp = () => {
      setRotatingElementId(null);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      pushHistory(pages);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Element Drag & Snap Interaction
  const handleElementMouseDown = (e: React.MouseEvent, el: CanvasElement) => {
    e.stopPropagation();
    if (e.shiftKey) {
      if (selectedElementIds.includes(el.id)) {
        setSelectedElementIds(selectedElementIds.filter((id) => id !== el.id));
      } else {
        setSelectedElementIds([...selectedElementIds, el.id]);
      }
      return;
    }

    if (!selectedElementIds.includes(el.id)) {
      setSelectedElementIds([el.id]);
    }

    isDraggingRef.current = true;
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const scale = zoom / 100;
    const docW = currentDoc?.width_pt || 595.28;
    const docH = currentDoc?.height_pt || 841.89;

    const initialPositions = activePage?.elements
      .filter((item) => selectedElementIds.includes(item.id) || item.id === el.id)
      .map((item) => ({ id: item.id, x: item.x, y: item.y, w: item.w, h: item.h })) || [];

    const otherElements = activePage?.elements.filter(
      (item) => !initialPositions.some((p) => p.id === item.id)
    ) || [];

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const dx = (ev.clientX - startClientX) / scale;
      const dy = (ev.clientY - startClientY) / scale;

      const primaryInitial = initialPositions.find((p) => p.id === el.id);
      if (!primaryInitial) return;

      let targetX = primaryInitial.x + dx;
      let targetY = primaryInitial.y + dy;

      if (gridSnap) {
        targetX = Math.round(targetX / 10) * 10;
        targetY = Math.round(targetY / 10) * 10;
      }

      // Magnetic Snapping Guides
      const guides: { type: 'x' | 'y'; pos: number }[] = [];
      const threshold = 6;
      const snapX = [9, 36, docW / 2, docW - 36, docW - 9];
      const snapY = [9, 36, docH / 2, docH - 36, docH - 9];

      for (const o of otherElements) {
        snapX.push(o.x, o.x + o.w, o.x + o.w / 2);
        snapY.push(o.y, o.y + o.h, o.y + o.h / 2);
      }

      const halfW = primaryInitial.w / 2;
      for (const sp of snapX) {
        if (Math.abs(targetX - sp) < threshold) {
          targetX = sp;
          guides.push({ type: 'x', pos: sp });
        } else if (Math.abs(targetX + halfW - sp) < threshold) {
          targetX = sp - halfW;
          guides.push({ type: 'x', pos: sp });
        } else if (Math.abs(targetX + primaryInitial.w - sp) < threshold) {
          targetX = sp - primaryInitial.w;
          guides.push({ type: 'x', pos: sp });
        }
      }

      const halfH = primaryInitial.h / 2;
      for (const sp of snapY) {
        if (Math.abs(targetY - sp) < threshold) {
          targetY = sp;
          guides.push({ type: 'y', pos: sp });
        } else if (Math.abs(targetY + halfH - sp) < threshold) {
          targetY = sp - halfH;
          guides.push({ type: 'y', pos: sp });
        } else if (Math.abs(targetY + primaryInitial.h - sp) < threshold) {
          targetY = sp - primaryInitial.h;
          guides.push({ type: 'y', pos: sp });
        }
      }

      setActiveGuides(guides);

      const appliedDx = targetX - primaryInitial.x;
      const appliedDy = targetY - primaryInitial.y;

      const updatedPages = [...pages];
      updatedPages[activePageIndex].elements = updatedPages[activePageIndex].elements.map((item) => {
        const init = initialPositions.find((p) => p.id === item.id);
        if (init) {
          return {
            ...item,
            x: Math.round(Math.max(0, init.x + appliedDx)),
            y: Math.round(Math.max(0, init.y + appliedDy)),
          };
        }
        return item;
      });
      setPages(updatedPages);
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
      setActiveGuides([]);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      pushHistory(pages);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Canvas Empty Space MouseDown (Rubberband Selection Marquee)
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (!e.shiftKey) {
      setSelectedElementIds([]);
    }

    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect) return;

    const scale = zoom / 100;
    const startX = (e.clientX - canvasRect.left) / scale;
    const startY = (e.clientY - canvasRect.top) / scale;

    const onMouseMove = (ev: MouseEvent) => {
      const curX = (ev.clientX - canvasRect.left) / scale;
      const curY = (ev.clientY - canvasRect.top) / scale;

      const boxX = Math.min(startX, curX);
      const boxY = Math.min(startY, curY);
      const boxW = Math.abs(curX - startX);
      const boxH = Math.abs(curY - startY);

      setRubberbandBox({ x: boxX, y: boxY, w: boxW, h: boxH });

      if (boxW > 5 && boxH > 5 && activePage) {
        const intersectingIds = activePage.elements
          .filter((item) => {
            const elRight = item.x + item.w;
            const elBottom = item.y + item.h;
            const boxRight = boxX + boxW;
            const boxBottom = boxY + boxH;
            return !(elRight < boxX || item.x > boxRight || elBottom < boxY || item.y > boxBottom);
          })
          .map((item) => item.id);
        setSelectedElementIds(intersectingIds);
      }
    };

    const onMouseUp = () => {
      setRubberbandBox(null);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Keyboard Shortcuts: Undo (Ctrl+Z), Redo (Ctrl+Shift+Z / Ctrl+Y), Duplicate (Ctrl+D), Nudge (Arrows), Delete
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const isEditable = (e.target as HTMLElement)?.isContentEditable;
      if (tag === 'input' || tag === 'textarea' || isEditable) return;

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (cmdOrCtrl && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if (cmdOrCtrl && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        handleRedo();
      } else if (cmdOrCtrl && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        duplicateSelectedElements();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedElementIds.length > 0) {
          e.preventDefault();
          deleteSelectedElements();
        }
      } else if (e.key === 'Escape') {
        setSelectedElementIds([]);
      } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        if (selectedElementIds.length > 0) {
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1;
          const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
          const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
          nudgeSelectedElements(dx, dy);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedElementIds, activePage, pages, activePageIndex, handleUndo, handleRedo, historyIndex, history]);

  // Automated Table of Contents Generator
  const handleAutoGenerateToc = async () => {
    if (!currentDoc) return;
    try {
      const res = await api<{ ok: boolean; toc: TocItem[] }>(`/studio/documents/${currentDoc.id}/toc`);
      if (res.toc && res.toc.length > 0) {
        addElement({
          type: 'toc',
          x: 40,
          y: 80,
          w: 515,
          h: Math.min(650, 100 + res.toc.length * 45),
          content: 'TABLE OF CONTENTS',
          tocItems: res.toc,
        });
        alert(`Inserted Table of Contents with ${res.toc.length} sections!`);
      } else {
        alert('No headings found across document pages yet. Add some H1 or section titles first!');
      }
    } catch (e: any) {
      alert('TOC generation failed: ' + e.message);
    }
  };

  // Automated Running Folio (Page Number & Header)
  const handleAddRunningFolio = () => {
    if (!currentDoc || !activePage) return;
    const docW = currentDoc.width_pt || 595.28;
    const docH = currentDoc.height_pt || 841.89;

    addElement({
      type: 'folio',
      x: 35,
      y: docH - 45,
      w: docW - 70,
      h: 24,
      folioHeader: currentDoc.title.toUpperCase(),
      folioShowPage: true,
      style: {
        fontSize: 10,
        color: '#94A3B8',
        letterSpacing: '1px',
      },
    });
  };

  // ==========================================
  // STAGE 6: SPECIALIZED MAGAZINE CREATOR SUITE
  // ==========================================

  // Calculate character capacity of a text or multi-column frame
  const calculateTextCapacity = useCallback((el: CanvasElement): number => {
    const fontSize = el.style?.fontSize || 13;
    const lineHeight = (el.style?.lineHeight || 1.6) * fontSize;
    const lines = Math.max(1, Math.floor((el.h || 200) / lineHeight));
    const cols = el.type === 'column_text' ? (el.columns || 2) : 1;
    const gutter = el.columnGutter || 20;
    const colWidth = ((el.w || 400) - (cols - 1) * gutter) / cols;
    const charsPerLine = Math.max(8, Math.floor(colWidth / (fontSize * 0.52)));
    return Math.max(30, lines * charsPerLine * cols);
  }, []);

  // Resolve dynamic master page tokens like {page}, {total}, {title}, {section}, {date}
  const resolveTokens = useCallback((text: string, pageNum: number, sectionName = 'Feature'): string => {
    if (!text || !currentDoc) return text;
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    return text
      .replace(/{page}/gi, String(pageNum))
      .replace(/{total}/gi, String(pages.length))
      .replace(/{title}/gi, currentDoc.title)
      .replace(/{section}/gi, sectionName)
      .replace(/{date}/gi, dateStr);
  }, [currentDoc, pages.length]);

  // Resolve effective text content considering linked predecessor overflow
  const getEffectiveTextForElement = useCallback((el: CanvasElement, pageNum: number): { text: string; isOverflowing: boolean; capacity: number } => {
    let sourceContent = el.content || '';

    // If linked from a previous frame, pull overflow text from the chain
    if (el.linkedPrevId) {
      let prevEl: CanvasElement | undefined;
      for (const pg of pages) {
        const found = pg.elements.find((e) => e.id === el.linkedPrevId);
        if (found) {
          prevEl = found;
          break;
        }
      }
      if (prevEl) {
        const prevCap = calculateTextCapacity(prevEl);
        const fullContent = prevEl.content || '';
        sourceContent = fullContent.length > prevCap ? fullContent.slice(prevCap) : '';
      }
    }

    const capacity = calculateTextCapacity(el);
    const resolved = resolveTokens(sourceContent, pageNum, el.sectionCategory);

    if (el.linkedNextId && resolved.length > capacity) {
      return {
        text: resolved.slice(0, capacity),
        isOverflowing: true,
        capacity,
      };
    }

    return {
      text: resolved,
      isOverflowing: resolved.length > capacity,
      capacity,
    };
  }, [pages, calculateTextCapacity, resolveTokens]);

  // Link source text frame to a target text frame across pages
  const handleLinkTextFrame = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    const updated = pages.map((pg) => ({
      ...pg,
      elements: pg.elements.map((el) => {
        if (el.id === sourceId) return { ...el, linkedNextId: targetId };
        if (el.id === targetId) return { ...el, linkedPrevId: sourceId };
        return el;
      }),
    }));
    setPages(updated);
    pushHistory(updated);
    alert('Linked text frame successfully! Overflow text will flow into the connected frame.');
  };

  // Unlink a text frame
  const handleUnlinkTextFrame = (elementId: string) => {
    const updated = pages.map((pg) => ({
      ...pg,
      elements: pg.elements.map((el) => {
        if (el.id === elementId) {
          return { ...el, linkedNextId: undefined, linkedPrevId: undefined };
        }
        if (el.linkedNextId === elementId) {
          return { ...el, linkedNextId: undefined };
        }
        if (el.linkedPrevId === elementId) {
          return { ...el, linkedPrevId: undefined };
        }
        return el;
      }),
    }));
    setPages(updated);
    pushHistory(updated);
  };

  // 1-Tap: Insert Continuation Frame on Next Page and Link
  const handleCreateLinkedContinuationFrame = async (sourceEl: CanvasElement) => {
    if (!currentDoc) return;
    const targetPageIdx = activePageIndex + 1;
    const timestamp = Date.now();
    const continuationId = `flow_${timestamp}`;

    let updated = [...pages];
    if (targetPageIdx >= updated.length) {
      // Create new page
      try {
        const res = await api<{ ok: boolean; page_id: number; page_number: number }>(
          `/studio/documents/${currentDoc.id}/pages`,
          'POST',
          { elements: [], background: { type: 'color', value: '#FFFFFF' } }
        );
        updated.push({
          id: res.page_id,
          document_id: currentDoc.id,
          page_number: res.page_number,
          elements: [],
          background: { type: 'color', value: '#FFFFFF' },
        });
      } catch {
        updated.push({
          id: timestamp,
          document_id: currentDoc.id,
          page_number: updated.length + 1,
          elements: [],
          background: { type: 'color', value: '#FFFFFF' },
        });
      }
    }

    const continuationEl: CanvasElement = {
      id: continuationId,
      type: sourceEl.type,
      x: sourceEl.x,
      y: sourceEl.y,
      w: sourceEl.w,
      h: sourceEl.h,
      columns: sourceEl.columns,
      columnGutter: sourceEl.columnGutter,
      dropCap: false,
      style: { ...sourceEl.style },
      linkedPrevId: sourceEl.id,
      content: '', // pulled automatically from overflow
    };

    // Update source element with linkedNextId
    updated = updated.map((pg, pIdx) => {
      if (pIdx === activePageIndex) {
        return {
          ...pg,
          elements: pg.elements.map((el) => (el.id === sourceEl.id ? { ...el, linkedNextId: continuationId } : el)),
        };
      }
      if (pIdx === targetPageIdx) {
        return {
          ...pg,
          elements: [...pg.elements, continuationEl],
        };
      }
      return pg;
    });

    setPages(updated);
    pushHistory(updated);
    setActivePageIndex(targetPageIdx);
    setSelectedElementId(continuationId);
    alert(`Continuation frame created on Page ${targetPageIdx + 1} and linked!`);
  };

  // Master Pages & Dynamic Headers Applicator
  const handleApplyMasterPage = (preset: 'editorial' | 'minimal' | 'spread', applyAll: boolean) => {
    if (!currentDoc) return;
    const docW = currentDoc.width_pt || 595.28;
    const docH = currentDoc.height_pt || 841.89;
    const timestamp = Date.now();

    const createMasterElements = (pageNum: number): CanvasElement[] => {
      const isLeft = pageNum % 2 === 0;
      if (preset === 'editorial') {
        return [
          {
            id: `master_hdr_${timestamp}_${pageNum}`,
            type: 'text',
            x: 35,
            y: 20,
            w: docW - 70,
            h: 22,
            content: `${currentDoc.title.toUpperCase()}  •  {section}  •  {date}`,
            style: {
              fontSize: 9,
              fontWeight: '700',
              color: '#64748b',
              letterSpacing: '1.2px',
              textAlign: isLeft ? 'left' : 'right',
              borderWidth: 1,
              borderColor: 'rgba(148, 163, 184, 0.25)',
              borderStyle: 'solid',
              padding: '2px 0 6px 0',
            },
          },
          {
            id: `master_ftr_${timestamp}_${pageNum}`,
            type: 'folio',
            x: 35,
            y: docH - 42,
            w: docW - 70,
            h: 22,
            folioHeader: `VOL. 24  •  OFFICIAL PUBLICATION`,
            folioShowPage: true,
            style: {
              fontSize: 10,
              color: '#475569',
              letterSpacing: '1px',
            },
          },
        ];
      } else if (preset === 'minimal') {
        return [
          {
            id: `master_min_hdr_${timestamp}_${pageNum}`,
            type: 'text',
            x: 40,
            y: 25,
            w: docW - 80,
            h: 18,
            content: `— {title} —`,
            style: {
              fontSize: 9,
              color: '#94a3b8',
              letterSpacing: '2px',
              textAlign: 'center',
            },
          },
          {
            id: `master_min_ftr_${timestamp}_${pageNum}`,
            type: 'text',
            x: 40,
            y: docH - 40,
            w: docW - 80,
            h: 20,
            content: `{page} / {total}`,
            style: {
              fontSize: 10,
              fontWeight: '600',
              color: '#94a3b8',
              textAlign: 'center',
            },
          },
        ];
      } else {
        // Spread Master (alternating outer folios)
        return [
          {
            id: `master_spread_hdr_${timestamp}_${pageNum}`,
            type: 'text',
            x: isLeft ? 35 : 120,
            y: 22,
            w: docW - 155,
            h: 20,
            content: isLeft ? `{title}` : `{section} FEATURE`,
            style: {
              fontSize: 9,
              fontWeight: '700',
              color: '#38bdf8',
              letterSpacing: '1px',
              textAlign: isLeft ? 'left' : 'right',
            },
          },
          {
            id: `master_spread_ftr_${timestamp}_${pageNum}`,
            type: 'text',
            x: isLeft ? 35 : docW - 135,
            y: docH - 40,
            w: 100,
            h: 20,
            content: isLeft ? `PAGE {page}` : `{page} | {total}`,
            style: {
              fontSize: 10,
              fontWeight: '700',
              color: '#0284c7',
              textAlign: isLeft ? 'left' : 'right',
            },
          },
        ];
      }
    };

    const targetIndices = applyAll ? pages.map((_, i) => i) : [activePageIndex];
    const updated = pages.map((pg, idx) => {
      if (targetIndices.includes(idx)) {
        // remove previous master page elements
        const cleaned = pg.elements.filter(
          (e) => !e.id.startsWith('master_hdr_') && !e.id.startsWith('master_ftr_') && !e.id.startsWith('master_min_') && !e.id.startsWith('master_spread_')
        );
        return {
          ...pg,
          elements: [...cleaned, ...createMasterElements(idx + 1)],
        };
      }
      return pg;
    });

    setPages(updated);
    pushHistory(updated);
    alert(`Applied Master Page preset (${preset}) to ${applyAll ? 'all pages' : `Page ${activePageIndex + 1}`}!`);
  };

  // ==========================================
  // STAGE 7: SPECIALIZED ALBUM & YEARBOOK CREATOR SUITE
  // ==========================================

  // Bulk Photo Ingestion & Staging
  const handleBulkPhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (re) => {
        if (re.target?.result) {
          setStagedAlbumPhotos((prev) => [
            ...prev,
            {
              url: re.target!.result as string,
              caption: file.name.replace(/\.[^/.]+$/, ''),
              tilt: Math.floor(Math.random() * 7) - 3,
            },
          ]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleRemoveStagedPhoto = (idx: number) => {
    setStagedAlbumPhotos((prev) => prev.filter((_, i) => i !== idx));
  };

  // Collage Layout 1: Polaroid Scatter
  const handleAddPolaroidScatter = () => {
    if (!currentDoc || !activePage) return;
    const photos = stagedAlbumPhotos.length >= 2 ? stagedAlbumPhotos.slice(0, 4) : [
      { url: 'https://images.unsplash.com/photo-1519741497674-611481863552?w=500', caption: 'The First Dance', tilt: -3 },
      { url: 'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?w=500', caption: 'Sunset on the Lagoon', tilt: 3 },
      { url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=500', caption: 'Island Memories', tilt: -1 },
    ];
    addElement({
      type: 'album_spread',
      x: 35,
      y: 110,
      w: 525,
      h: 460,
      albumPhotos: photos.map((p) => ({
        url: p.url,
        caption: p.caption || 'Cherished Memory',
        tilt: p.tilt || (Math.floor(Math.random() * 7) - 3),
        frameStyle: 'polaroid',
      })),
    });
  };

  // Collage Layout 2: Modern Mosaic (Masonry 1 Hero + 2 Stacked)
  const handleAddModernMosaic = () => {
    if (!currentDoc || !activePage) return;
    const p1 = stagedAlbumPhotos[0]?.url || 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600';
    const p2 = stagedAlbumPhotos[1]?.url || 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=400';
    const p3 = stagedAlbumPhotos[2]?.url || 'https://images.unsplash.com/photo-1519741497674-611481863552?w=400';

    addElement({
      type: 'album_spread',
      x: 35,
      y: 90,
      w: 525,
      h: 480,
      albumPhotos: [
        { url: p1, caption: 'Panoramic Island Coastline', frameStyle: 'shadow' },
        { url: p2, caption: 'Reef Exploration', frameStyle: 'rounded' },
        { url: p3, caption: 'Celebration Feast', frameStyle: 'rounded' },
      ],
    });
  };

  // Collage Layout 3: Clean 3x3 Photo Grid
  const handleAddCleanGrid = () => {
    if (!currentDoc || !activePage) return;
    const stockUrls = [
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400',
      'https://images.unsplash.com/photo-1519741497674-611481863552?w=400',
      'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=400',
      'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?w=400',
      'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=400',
      'https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=400',
    ];
    const photos = stagedAlbumPhotos.length >= 6
      ? stagedAlbumPhotos.slice(0, 6)
      : stockUrls.map((u, i) => ({ url: u, caption: `Moment ${i + 1}` }));

    addElement({
      type: 'album_spread',
      x: 35,
      y: 100,
      w: 525,
      h: 480,
      albumPhotos: photos.map((p) => ({
        url: p.url,
        caption: p.caption,
        frameStyle: 'rounded',
      })),
    });
  };

  // Collage Layout 4: Full-Bleed Photo Hero
  const handleAddFullBleedHero = () => {
    if (!currentDoc || !activePage) return;
    const heroUrl = stagedAlbumPhotos[0]?.url || 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200';
    addElement({
      type: 'image',
      x: 0,
      y: 0,
      w: currentDoc.width_pt,
      h: currentDoc.height_pt,
      src: heroUrl,
      objectFit: 'cover',
      caption: 'Pacific Horizons • Signature Series',
      style: { zIndex: 1 },
    });
  };

  // Graduate & Student Roster Preset Engine (4, 6, 8, 12 cards)
  const handleAddYearbookGridPreset = (presetSize: 4 | 6 | 8 | 12) => {
    if (!currentDoc || !activePage) return;
    const allStudents: StudentProfile[] = [
      { name: 'Alisi Tavua', award: 'Dux of School', quote: '"Wisdom begins in quiet curiosity."', role: 'Valedictorian', photoUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400' },
      { name: 'Jone Naivalu', award: 'Head Boy', quote: '"Lead through service and resilience."', role: 'Student Council', photoUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400' },
      { name: 'Mereani Koroi', award: 'Head Girl', quote: '"Honor our roots wherever we travel."', role: 'Prefect', photoUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400' },
      { name: 'Timoci Ravuvu', award: 'Sports Captain', quote: '"Clear eyes and courageous hearts."', role: 'Rugby Lead', photoUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400' },
      { name: 'Sera Vakaloloma', award: 'Arts Excellence', quote: '"Creativity is the voice of our ancestors."', role: 'Music Society', photoUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400' },
      { name: 'Kavita Sharma', award: 'Top in STEM', quote: '"In science we find unity with nature."', role: 'Robotics Club', photoUrl: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400' },
      { name: 'Peni Qalo', award: 'Community Service', quote: '"Give without hesitation."', role: 'Red Cross', photoUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=400' },
      { name: 'Litia Bale', award: 'Debating Champion', quote: '"Words hold the power of mountains."', role: 'Debating Lead', photoUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400' },
      { name: 'Sakiusa Vuetaki', award: 'Math Olympiad', quote: '"Precision in thought, courage in deed."', role: 'Math Club', photoUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400' },
      { name: 'Kesaia Seniloli', award: 'Drama Trophy', quote: '"Life is our stage."', role: 'Drama Lead', photoUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400' },
      { name: 'Viliame Ratu', award: 'Athletics Blue', quote: '"Never surrender."', role: 'Track Team', photoUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400' },
      { name: 'Adi Cakobau', award: 'Leadership Medal', quote: '"Stand firm for what is true."', role: 'Head Prefect', photoUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400' },
    ];

    const targetStudents = allStudents.slice(0, presetSize);
    addElement({
      type: 'yearbook_grid',
      x: 35,
      y: 95,
      w: 525,
      h: presetSize === 4 ? 440 : presetSize === 6 ? 540 : 620,
      students: targetStudents,
    });
  };

  // CSV Roster Importer with Auto-Pagination across pages
  const handleYearbookMultiPageCsv = async (csvContent: string, perPageCount: number) => {
    if (!currentDoc) return;
    const lines = csvContent.trim().split('\n').filter((l) => l.trim().length > 0);
    const rows = lines[0].toLowerCase().includes('name') ? lines.slice(1) : lines;
    const parsedStudents: StudentProfile[] = [];

    rows.forEach((line) => {
      const parts = line.split(',').map((p) => p.trim().replace(/^["']|["']$/g, ''));
      if (parts[0]) {
        parsedStudents.push({
          name: parts[0],
          photoUrl: parts[1] || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400',
          award: parts[2] || undefined,
          quote: parts[3] ? `"${parts[3]}"` : undefined,
          role: parts[4] || undefined,
        });
      }
    });

    if (parsedStudents.length === 0) {
      alert('No valid student rows found in CSV.');
      return;
    }

    const totalPagesNeeded = Math.ceil(parsedStudents.length / perPageCount);
    const updatedPages = [...pages];

    for (let pageIdx = 0; pageIdx < totalPagesNeeded; pageIdx++) {
      const pageStudents = parsedStudents.slice(pageIdx * perPageCount, (pageIdx + 1) * perPageCount);
      const gridElement: CanvasElement = {
        id: `yearbook_${Date.now()}_${pageIdx}`,
        type: 'yearbook_grid',
        x: 35,
        y: 100,
        w: 525,
        h: perPageCount <= 4 ? 440 : perPageCount <= 6 ? 540 : 620,
        students: pageStudents,
      };

      if (pageIdx === 0 && activePage) {
        const existingIdx = activePageIndex;
        updatedPages[existingIdx] = {
          ...updatedPages[existingIdx],
          elements: [...updatedPages[existingIdx].elements, gridElement],
        };
      } else {
        try {
          const res = await api<{ ok: boolean; page_id: number; page_number: number }>(
            `/studio/documents/${currentDoc.id}/pages`,
            'POST',
            { elements: [gridElement], background: { type: 'color', value: '#FFFFFF' } }
          );
          updatedPages.push({
            id: res.page_id,
            document_id: currentDoc.id,
            page_number: res.page_number,
            elements: [gridElement],
            background: { type: 'color', value: '#FFFFFF' },
          });
        } catch {
          updatedPages.push({
            id: Date.now() + pageIdx,
            document_id: currentDoc.id,
            page_number: updatedPages.length + 1,
            elements: [gridElement],
            background: { type: 'color', value: '#FFFFFF' },
          });
        }
      }
    }

    setPages(updatedPages);
    pushHistory(updatedPages);
    alert(`🎓 Auto-Generated ${parsedStudents.length} graduate cards across ${totalPagesNeeded} yearbook page(s)!`);
  };

  // ==========================================
  // STAGES 8 & 9: BRAND KITS & EXPORT QUEUE
  // ==========================================

  const fetchBrandKits = async () => {
    setLoadingBrandKits(true);
    try {
      const res = await api<{ brandKits: BrandKitItem[] }>('/brand-kits');
      setBrandKits(res.brandKits || []);
    } catch (e) {
      console.error('Could not load brand kits:', e);
    } finally {
      setLoadingBrandKits(false);
    }
  };

  const handleApplyBrandKit = (kit: BrandKitItem) => {
    if (!currentDoc) return;
    setApplyingBrandKit(true);

    const updatedPages = pages.map((page) => {
      const updatedElements = page.elements.map((el) => {
        const next = { ...el };
        if (next.type === 'text' || next.type === 'column_text') {
          const isHeading = (next.style?.fontSize || 16) >= 20;
          next.style = {
            ...next.style,
            fontFamily: isHeading ? (kit.font_family || 'Playfair Display') : 'Inter, sans-serif',
          };
        } else if (next.type === 'shape') {
          next.style = {
            ...next.style,
            backgroundColor: kit.primary_color,
          };
        }
        return next;
      });

      let bg = page.background;
      if (kit.background_gradient) {
        bg = {
          type: 'gradient',
          value: kit.background_gradient,
          stop1: kit.primary_color,
          stop2: kit.secondary_color,
          stop3: kit.accent_color,
          angle: 135,
        };
      }
      return { ...page, elements: updatedElements, background: bg };
    });

    setPages(updatedPages);
    pushHistory(updatedPages);
    alert(`🎨 Brand Kit "${kit.name}" applied across all ${pages.length} pages!`);
    setShowBrandKitsModal(false);
    setApplyingBrandKit(false);
  };

  const handleSaveCurrentBrandKit = async () => {
    if (!newBrandKitName.trim()) return;
    try {
      await api('/brand-kits', 'POST', {
        name: newBrandKitName.trim(),
        primaryColor: currentDoc?.palette?.primary || '#0284c7',
        secondaryColor: currentDoc?.palette?.secondary || '#0f172a',
        accentColor: currentDoc?.palette?.accent || '#ec4899',
        fontFamily: 'Inter, sans-serif',
        backgroundGradient: activePage?.background?.value || 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
      });
      alert(`Saved Brand Kit "${newBrandKitName.trim()}" successfully!`);
      setNewBrandKitName('');
      fetchBrandKits();
    } catch (e: any) {
      alert('Failed to save brand kit: ' + e.message);
    }
  };

  // Background Export Queue
  const handleQueueExportJob = async () => {
    if (!currentDoc) return;
    setExportJobProgress(20);
    try {
      setTimeout(() => setExportJobProgress(55), 350);
      setTimeout(() => setExportJobProgress(85), 700);
      const res = await api<{ ok: boolean; job_id: number; download_url: string }>('/studio/export/queue', 'POST', {
        document_id: currentDoc.id,
        export_type: 'print_pdf',
      });
      setTimeout(() => {
        setExportJobProgress(100);
        setExportDownloadUrl(res.download_url);
      }, 1000);
    } catch (e: any) {
      alert('Export job failed: ' + e.message);
      setExportJobProgress(null);
    }
  };

  // ==========================================
  // STAGE 5: SPECIALIZED CATALOGUE CREATOR SUITE
  // ==========================================

  // 1-Tap Commercial Product Grid Generators
  const generateProductLayout = (layoutType: 'hero' | 'split' | 'tier' | 'grid4' | 'specials6') => {
    if (!activePage) return;
    const elements: CanvasElement[] = [];
    const timestamp = Date.now();

    if (layoutType === 'hero') {
      // 1-Product Hero Showcase Layout
      elements.push({
        id: `hero_tag_${timestamp}`,
        type: 'badge',
        x: 35,
        y: 25,
        w: 240,
        h: 28,
        content: '★ FLAGSHIP PRODUCT SHOWCASE',
        style: {
          fontSize: 11,
          fontWeight: 'bold',
          backgroundColor: '#f59e0b',
          color: '#ffffff',
          borderRadius: 14,
        },
      });
      elements.push({
        id: `hero_prod_${timestamp}`,
        type: 'product',
        x: 35,
        y: 62,
        w: 525,
        h: 470,
        name: 'Sony WH-1000XM5 Wireless Noise-Cancelling Headphones',
        price: '$349.00',
        originalPrice: '$449.00',
        badge: 'SAVE $100 • TOP RATED',
        sku: 'SONY-WH-XM5',
        whatsappNumber: '+6799991234',
        image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800',
        description: 'Industry-leading noise cancellation with two processors and 8 microphones. Up to 30-hour battery life with quick charging (3 min charge for 3 hours playback). Ultra-comfortable lightweight design with soft fit leather.',
        rating: 5,
        stockStatus: 'in_stock',
        showQrCode: true,
      });
      elements.push({
        id: `hero_highlights_${timestamp}`,
        type: 'shape',
        x: 35,
        y: 545,
        w: 525,
        h: 185,
        shapeType: 'rectangle',
        style: {
          backgroundColor: '#0f172a',
          borderColor: '#334155',
          borderWidth: 1,
          borderRadius: 14,
          padding: '16px',
        },
      });
      elements.push({
        id: `hero_text_${timestamp}`,
        type: 'text',
        x: 55,
        y: 560,
        w: 485,
        h: 155,
        content: '📦 OFFICIAL PACIFIC DISTRIBUTOR GUARANTEES\n\n• 🚚 Free Express Courier Delivery Across All Pacific Hubs\n• 🛡️ 2-Year Official Manufacturer Warranty & Replacement Guarantee\n• 💬 1-Tap Instant WhatsApp Reservation & Dedicated Concierge Support\n• 💳 Flexible Cash-on-Delivery or Direct Bank Transfer Supported',
        style: {
          fontSize: 12,
          color: '#cbd5e1',
          lineHeight: 1.6,
          fontFamily: 'Inter, sans-serif',
        },
      });
    } else if (layoutType === 'split') {
      // 2-Product Split Spread Layout
      elements.push({
        id: `split_hdr_${timestamp}`,
        type: 'text',
        x: 35,
        y: 22,
        w: 525,
        h: 34,
        content: '⚡ FLAGSHIP COMPARISON & SELECTION',
        style: {
          fontSize: 16,
          fontWeight: 'bold',
          color: '#38bdf8',
          letterSpacing: '0.8px',
        },
      });
      elements.push({
        id: `split_prod1_${timestamp}`,
        type: 'product',
        x: 35,
        y: 65,
        w: 250,
        h: 675,
        name: 'Apple MacBook Pro 16" M3 Max',
        price: '$3,499.00',
        originalPrice: '$3,899.00',
        badge: 'SAVE $400 • M3 MAX',
        sku: 'APL-MBP-16',
        whatsappNumber: '+6799991234',
        image: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=600',
        description: 'Apple M3 Max chip with 16-core CPU, 40-core GPU, 48GB unified memory, and 1TB ultra-fast SSD storage. Liquid Retina XDR display with ProMotion 120Hz.',
        rating: 5,
        stockStatus: 'in_stock',
        showQrCode: true,
      });
      elements.push({
        id: `split_prod2_${timestamp}`,
        type: 'product',
        x: 310,
        y: 65,
        w: 250,
        h: 675,
        name: 'Dell XPS 16 Touch OLED Creator',
        price: '$2,999.00',
        originalPrice: '$3,399.00',
        badge: 'SAVE $400 • 4K OLED',
        sku: 'DEL-XPS-16',
        whatsappNumber: '+6799991234',
        image: 'https://images.unsplash.com/photo-1593642632823-8f785ba67e45?w=600',
        description: 'Intel Core Ultra 9 processor, 32GB LPDDR5x RAM, 4K+ OLED Touchscreen with studio-grade NVIDIA GeForce RTX 4070 graphics and CNC machined aluminum.',
        rating: 5,
        stockStatus: 'in_stock',
        showQrCode: true,
      });
    } else if (layoutType === 'tier') {
      // 3-Product Balanced Tier Layout
      elements.push({
        id: `tier_hdr_${timestamp}`,
        type: 'text',
        x: 35,
        y: 20,
        w: 525,
        h: 32,
        content: '✨ PREMIUM HOME & LIFESTYLE SUITE',
        style: {
          fontSize: 16,
          fontWeight: 'bold',
          color: '#0284c7',
          letterSpacing: '0.8px',
        },
      });
      elements.push({
        id: `tier_prod_top_${timestamp}`,
        type: 'product',
        x: 35,
        y: 58,
        w: 525,
        h: 335,
        name: 'Dyson V15 Detect Absolute Cordless Vacuum',
        price: '$749.00',
        originalPrice: '$899.00',
        badge: 'TOP RATED 2026 • SAVE $150',
        sku: 'DYS-V15',
        whatsappNumber: '+6799991234',
        image: 'https://images.unsplash.com/photo-1558317374-067fb5f30001?w=700',
        description: 'Laser illuminates invisible dust on hard floors. Piezo sensor continuously sizes and counts dust particles, automatically ramping suction power.',
        rating: 5,
        stockStatus: 'in_stock',
        showQrCode: false,
      });
      elements.push({
        id: `tier_prod_b1_${timestamp}`,
        type: 'product',
        x: 35,
        y: 405,
        w: 250,
        h: 345,
        name: 'Dyson Pure Cool Air Purifier Tower',
        price: '$499.00',
        originalPrice: '$599.00',
        badge: 'SPECIAL',
        sku: 'DYS-AIR',
        whatsappNumber: '+6799991234',
        image: 'https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=500',
        description: 'HEPA filtration removes 99.97% of allergens and pollutants.',
        rating: 5,
        stockStatus: 'in_stock',
      });
      elements.push({
        id: `tier_prod_b2_${timestamp}`,
        type: 'product',
        x: 310,
        y: 405,
        w: 250,
        h: 345,
        name: 'Dyson Supersonic Hair Dryer',
        price: '$429.00',
        originalPrice: '$499.00',
        badge: 'HOT PICK',
        sku: 'DYS-HAIR',
        whatsappNumber: '+6799991234',
        image: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=500',
        description: 'Fast drying with no extreme heat. Engineered for different hair types.',
        rating: 5,
        stockStatus: 'in_stock',
      });
    } else if (layoutType === 'grid4') {
      // 4-Product Standard Commercial 2x2 Grid
      elements.push({
        id: `grid4_hdr_${timestamp}`,
        type: 'text',
        x: 35,
        y: 20,
        w: 525,
        h: 32,
        content: '🛒 SEASONAL CATALOGUE SPECIALS (2x2 GRID)',
        style: {
          fontSize: 16,
          fontWeight: 'bold',
          color: '#fbbf24',
          letterSpacing: '0.8px',
        },
      });
      const items = [
        { name: 'Island Organic Single-Origin Coffee Beans 1kg', price: '$18.99', was: '$24.00', badge: 'SAVE 20%', sku: 'COF-01', img: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=500' },
        { name: 'Artisan Sourdough Woodfired Country Loaf', price: '$7.50', was: '$9.50', badge: 'FRESH BAKE', sku: 'BAK-02', img: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=500' },
        { name: 'Cold-Pressed Pure Virgin Coconut Oil 1L', price: '$14.50', was: '$18.00', badge: 'PURE PACIFIC', sku: 'OIL-03', img: 'https://images.unsplash.com/photo-1526947425960-945c6e72858f?w=500' },
        { name: 'Wild Rainforest Raw Honey Jar 500g', price: '$16.99', was: '$22.00', badge: 'NATURAL', sku: 'HON-04', img: 'https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=500' },
      ];
      const coords = [
        { x: 35, y: 60, w: 250, h: 345 },
        { x: 310, y: 60, w: 250, h: 345 },
        { x: 35, y: 415, w: 250, h: 345 },
        { x: 310, y: 415, w: 250, h: 345 },
      ];
      items.forEach((it, i) => {
        elements.push({
          id: `grid4_p_${timestamp}_${i}`,
          type: 'product',
          ...coords[i],
          name: it.name,
          price: it.price,
          originalPrice: it.was,
          badge: it.badge,
          sku: it.sku,
          image: it.img,
          whatsappNumber: '+6799991234',
          rating: 5,
          stockStatus: 'in_stock',
        });
      });
    } else if (layoutType === 'specials6') {
      // 6-Product Supermarket Specials 2x3 Grid
      elements.push({
        id: `spec6_banner_${timestamp}`,
        type: 'badge',
        x: 30,
        y: 16,
        w: 535,
        h: 46,
        content: '🔥 SUPERMARKET WEEKLY SPECIALS & PRICE DROPS',
        style: {
          fontSize: 13,
          fontWeight: 'bold',
          backgroundColor: '#dc2626',
          color: '#ffffff',
          borderRadius: 24,
        },
      });
      const items = [
        { name: 'Punjas Premium Rice 10kg', price: '$22.50', was: '$26.50', badge: 'SAVE $4.00', sku: 'FMCG-01', img: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400' },
        { name: 'Golden Sunflower Cooking Oil 2L', price: '$11.95', was: '$15.50', badge: 'HOT DEAL', sku: 'FMCG-02', img: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=400' },
        { name: 'Fresh Farm Salted Butter 500g', price: '$6.50', was: '$9.00', badge: 'HALF PRICE', sku: 'FMCG-03', img: 'https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?w=400' },
        { name: 'Sweet Island Papaya 2kg Pack', price: '$4.99', was: '$7.50', badge: 'FRESH PICK', sku: 'FMCG-04', img: 'https://images.unsplash.com/photo-1517282009859-f000ec3b26fe?w=400' },
        { name: 'Grass-Fed Beef Sausages 1kg', price: '$13.99', was: '$17.50', badge: 'SAVE $3.50', sku: 'FMCG-05', img: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=400' },
        { name: 'Pacific Tuna Chunks In Brine 6x', price: '$10.50', was: '$14.00', badge: 'VALUE PACK', sku: 'FMCG-06', img: 'https://images.unsplash.com/photo-1534483509719-3feaee7c30da?w=400' },
      ];
      const coords = [
        { x: 30, y: 72, w: 165, h: 335 },
        { x: 215, y: 72, w: 165, h: 335 },
        { x: 400, y: 72, w: 165, h: 335 },
        { x: 30, y: 418, w: 165, h: 335 },
        { x: 215, y: 418, w: 165, h: 335 },
        { x: 400, y: 418, w: 165, h: 335 },
      ];
      items.forEach((it, i) => {
        elements.push({
          id: `spec6_p_${timestamp}_${i}`,
          type: 'product',
          ...coords[i],
          name: it.name,
          price: it.price,
          originalPrice: it.was,
          badge: it.badge,
          sku: it.sku,
          image: it.img,
          whatsappNumber: '+6799991234',
          rating: 5,
          stockStatus: 'in_stock',
        });
      });
    }

    const updatedPages = [...pages];
    updatedPages[activePageIndex].elements = elements;
    setPages(updatedPages);
    setSelectedElementId(null);
  };

  // Flash Discount Generator (Dynamic Price Markdown)
  const applyFlashDiscount = (percent: number, scope: 'page' | 'all') => {
    if (percent <= 0 || percent >= 100) return;
    const updatedPages = [...pages];
    let updatedCount = 0;

    const targetPages = scope === 'page' ? [updatedPages[activePageIndex]] : updatedPages;

    targetPages.forEach((pg) => {
      if (!pg || !pg.elements) return;
      pg.elements = pg.elements.map((el) => {
        if (el.type !== 'product' || !el.price) return el;
        const priceStr = String(el.price).trim();
        const match = priceStr.match(/^([^\d.]*)(\d+(?:\.\d+)?)(.*)$/);
        if (!match) return el;

        const currencyPrefix = match[1] || '$';
        const rawNum = parseFloat(match[2]);
        const suffix = match[3] || '';
        if (isNaN(rawNum) || rawNum <= 0) return el;

        const discountedNum = Math.max(0.01, Math.round(rawNum * (1 - percent / 100) * 100) / 100);
        const formattedDiscounted = `${currencyPrefix}${discountedNum.toFixed(2)}${suffix}`;
        const previousOriginal = el.originalPrice || el.price;

        updatedCount++;
        return {
          ...el,
          originalPrice: previousOriginal,
          price: formattedDiscounted,
          badge: `FLASH ${percent}% OFF`,
        };
      });
    });

    setPages(updatedPages);
    alert(`⚡ Applied ${percent}% Flash Discount to ${updatedCount} product(s) across ${scope === 'page' ? 'Page ' + (activePageIndex + 1) : 'all pages'}!`);
  };

  // Revert Flash Discounts
  const revertFlashDiscounts = (scope: 'page' | 'all') => {
    const updatedPages = [...pages];
    let restoredCount = 0;

    const targetPages = scope === 'page' ? [updatedPages[activePageIndex]] : updatedPages;

    targetPages.forEach((pg) => {
      if (!pg || !pg.elements) return;
      pg.elements = pg.elements.map((el) => {
        if (el.type !== 'product' || !el.originalPrice) return el;
        restoredCount++;
        const restoredPrice = el.originalPrice;
        const cleanBadge = el.badge && el.badge.startsWith('FLASH ') ? undefined : el.badge;
        return {
          ...el,
          price: restoredPrice,
          originalPrice: undefined,
          badge: cleanBadge,
        };
      });
    });

    setPages(updatedPages);
    alert(`↺ Restored regular pricing for ${restoredCount} product(s)!`);
  };

  // Live SKU-Based Price Sync
  const syncPricesFromCsv = (csvContent: string) => {
    if (!csvContent.trim()) return;
    const lines = csvContent.trim().split('\n');
    if (lines.length <= 1) return;

    const skuMap = new Map<string, { price?: string; originalPrice?: string; badge?: string; stockStatus?: any }>();

    lines.slice(1).forEach((line) => {
      const parts = line.split(',').map((p) => p.trim());
      if (parts.length >= 2 && parts[0]) {
        const skuKey = parts[0].toUpperCase();
        skuMap.set(skuKey, {
          price: parts[1] || undefined,
          originalPrice: parts[2] || undefined,
          badge: parts[3] || undefined,
          stockStatus: parts[4] || undefined,
        });
      }
    });

    if (skuMap.size === 0) {
      alert('No valid SKU rows found. Format: SKU,Price,WasPrice,Badge,StockStatus');
      return;
    }

    let matchedCount = 0;
    const updatedPages = [...pages];

    updatedPages.forEach((pg) => {
      if (!pg.elements) return;
      pg.elements = pg.elements.map((el) => {
        if (el.type !== 'product' || !el.sku) return el;
        const skuKey = el.sku.trim().toUpperCase();
        const updateData = skuMap.get(skuKey);
        if (updateData) {
          matchedCount++;
          return {
            ...el,
            price: updateData.price || el.price,
            originalPrice: updateData.originalPrice !== undefined ? updateData.originalPrice : el.originalPrice,
            badge: updateData.badge !== undefined ? updateData.badge : el.badge,
            stockStatus: (updateData.stockStatus as any) || el.stockStatus,
          };
        }
        return el;
      });
    });

    setPages(updatedPages);
    alert(`✓ SKU Price Sync: Updated ${matchedCount} product(s) across catalogue from ${skuMap.size} CSV records!`);
  };

  // CSV Bulk Import processor (Multi-Page Paginated vs SKU Sync vs Yearbook)
  const handleImportCsv = async () => {
    if (!csvText.trim()) return;
    const lines = csvText.trim().split('\n');
    if (lines.length <= 1) return;

    if (csvMode === 'sku_sync') {
      syncPricesFromCsv(csvText);
      return;
    }

    const rows = lines.slice(1);

    if (csvMode === 'products') {
      const rawProducts = rows
        .map((line, idx) => {
          const parts = line.split(',').map((p) => p.trim());
          if (parts.length < 2 || !parts[0]) return null;
          return {
            name: parts[0] || `Product ${idx + 1}`,
            price: parts[1] || '$0.00',
            originalPrice: parts[2] || undefined,
            badge: parts[3] || undefined,
            image: parts[4] || 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=500',
            whatsappNumber: parts[5] || '+6799991234',
            sku: parts[6] || `SKU-${idx + 1}`,
            description: parts[7] || undefined,
          };
        })
        .filter(Boolean) as Array<{
          name: string;
          price: string;
          originalPrice?: string;
          badge?: string;
          image: string;
          whatsappNumber: string;
          sku: string;
          description?: string;
        }>;

      if (rawProducts.length === 0) {
        alert('No valid product rows parsed. Please check CSV format.');
        return;
      }

      const perPage = csvPerPage;
      const totalPagesNeeded = Math.ceil(rawProducts.length / perPage);
      const newPagesList: StudioPage[] = [...pages];

      for (let pageIdx = 0; pageIdx < totalPagesNeeded; pageIdx++) {
        const chunk = rawProducts.slice(pageIdx * perPage, (pageIdx + 1) * perPage);
        const elements: CanvasElement[] = [];

        // Header element
        elements.push({
          id: `hdr_${Date.now()}_${pageIdx}`,
          type: 'text',
          x: 35,
          y: 20,
          w: 525,
          h: 34,
          content: `COMMERCIAL CATALOGUE • VOLUME ${pageIdx + 1}`,
          style: {
            fontSize: 16,
            fontWeight: 'bold',
            color: '#f59e0b',
            letterSpacing: '1px',
          },
        });

        if (perPage === 4) {
          const coords = [
            { x: 35, y: 62, w: 250, h: 345 },
            { x: 310, y: 62, w: 250, h: 345 },
            { x: 35, y: 420, w: 250, h: 345 },
            { x: 310, y: 420, w: 250, h: 345 },
          ];
          chunk.forEach((item, cIdx) => {
            const pos = coords[cIdx] || coords[0];
            elements.push({
              id: `prod_${Date.now()}_${pageIdx}_${cIdx}`,
              type: 'product',
              ...pos,
              name: item.name,
              price: item.price,
              originalPrice: item.originalPrice,
              badge: item.badge,
              image: item.image,
              whatsappNumber: item.whatsappNumber,
              sku: item.sku,
              description: item.description,
              rating: 5,
              stockStatus: 'in_stock',
            });
          });
        } else {
          // 6 per page
          const coords = [
            { x: 30, y: 68, w: 165, h: 335 },
            { x: 215, y: 68, w: 165, h: 335 },
            { x: 400, y: 68, w: 165, h: 335 },
            { x: 30, y: 418, w: 165, h: 335 },
            { x: 215, y: 418, w: 165, h: 335 },
            { x: 400, y: 418, w: 165, h: 335 },
          ];
          chunk.forEach((item, cIdx) => {
            const pos = coords[cIdx] || coords[0];
            elements.push({
              id: `prod_${Date.now()}_${pageIdx}_${cIdx}`,
              type: 'product',
              ...pos,
              name: item.name,
              price: item.price,
              originalPrice: item.originalPrice,
              badge: item.badge,
              image: item.image,
              whatsappNumber: item.whatsappNumber,
              sku: item.sku,
              description: item.description,
              rating: 5,
              stockStatus: 'in_stock',
            });
          });
        }

        if (pageIdx === 0 && activePageIndex < newPagesList.length) {
          newPagesList[activePageIndex] = {
            ...newPagesList[activePageIndex],
            elements,
          };
        } else if (currentDoc) {
          try {
            const res = await api<{ ok: boolean; page_id: number; page_number: number }>(
              `/studio/documents/${currentDoc.id}/pages`,
              'POST',
              { elements, background: { type: 'color', value: '#FFFFFF' } }
            );
            newPagesList.push({
              id: res.page_id,
              document_id: currentDoc.id,
              page_number: res.page_number,
              elements,
              background: { type: 'color', value: '#FFFFFF' },
            });
          } catch {
            newPagesList.push({
              id: Date.now() + pageIdx,
              document_id: currentDoc.id,
              page_number: newPagesList.length + 1,
              elements,
              background: { type: 'color', value: '#FFFFFF' },
            });
          }
        }
      }

      setPages(newPagesList);
      alert(`✨ Auto-Generated ${rawProducts.length} product(s) across ${totalPagesNeeded} catalogue page(s)!`);
      setActiveToolTab('products');
    } else {
      // Yearbook Roster Mode
      const students: StudentProfile[] = [];
      rows.forEach((line) => {
        const parts = line.split(',').map((p) => p.trim());
        if (parts.length >= 1 && parts[0]) {
          students.push({
            name: parts[0],
            photoUrl: parts[1] || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400',
            award: parts[2] || undefined,
            quote: parts[3] || undefined,
            role: parts[4] || undefined,
          });
        }
      });

      if (students.length > 0 && activePage) {
        addElement({
          type: 'yearbook_grid',
          x: 40,
          y: 120,
          w: 515,
          h: 600,
          students,
        });
        alert(`Added Senior Class Roster with ${students.length} graduates!`);
        setActiveToolTab('yearbook');
      }
    }
  };

  // Sprint 2: Upload image asset with FDS v1.0 assetRef and dimension preservation
  const handleUploadAsset = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
    if (!allowed.includes(file.type)) {
      alert('Unsupported file format. Please upload JPG, PNG, WebP, or SVG images.');
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      alert('File size exceeds maximum allowed limit (15MB)');
      return;
    }

    const fd = new FormData();
    fd.append('file', file);
    fd.append('asset_type', 'image');

    try {
      setUploadingAsset(true);
      const res = await uploadForm<{
        ok: boolean;
        asset_id: number;
        file_url: string;
        name: string;
        width?: number;
        height?: number;
      }>('/studio/assets/upload', fd);

      if (res.file_url) {
        loadTenantAssets();

        // Calculate aspect-ratio bounded dimensions
        const rawW = res.width || 280;
        const rawH = res.height || 220;
        const aspect = rawW / Math.max(1, rawH);
        const w = Math.min(360, Math.max(160, Math.round(aspect > 1 ? 280 : 280 * aspect)));
        const h = Math.min(360, Math.max(120, Math.round(w / aspect)));

        // If an image element is currently selected, update it; otherwise insert new element
        if (selectedElement && (selectedElement.type === 'image' || selectedElement.type === 'imageFrame')) {
          updateSelectedElement({
            src: res.file_url,
            url: res.file_url,
            caption: res.name,
            assetRef: {
              source: 'upload',
              assetId: res.asset_id,
              url: res.file_url,
              alt: res.name,
              fit: 'cover',
            },
          }, true);
        } else {
          addElement({
            type: 'image',
            src: res.file_url,
            url: res.file_url,
            w: w,
            h: h,
            caption: res.name,
            assetRef: {
              source: 'upload',
              assetId: res.asset_id,
              url: res.file_url,
              alt: res.name,
              fit: 'cover',
            },
          });
        }
      }
    } catch (err: any) {
      alert('Upload failed: ' + (err?.message || 'Network error'));
    } finally {
      setUploadingAsset(false);
      e.target.value = '';
    }
  };

  // Sprint 2: Insert Asset from Library or Uploads onto Canvas
  const handleInsertAsset = (asset: StudioAsset) => {
    const url = asset.file_url || asset.url || '';
    if (!url) return;

    const rawW = asset.width || 280;
    const rawH = asset.height || 220;
    const aspect = rawW / Math.max(1, rawH);
    const w = Math.min(360, Math.max(160, Math.round(aspect > 1 ? 280 : 280 * aspect)));
    const h = Math.min(360, Math.max(120, Math.round(w / aspect)));

    const name = asset.asset_name || asset.name || 'Photo';

    if (selectedElement && (selectedElement.type === 'image' || selectedElement.type === 'imageFrame')) {
      updateSelectedElement({
        src: url,
        url: url,
        caption: name,
        assetRef: {
          source: assetTab === 'uploads' ? 'upload' : 'library',
          assetId: asset.id,
          url: url,
          alt: name,
          fit: 'cover',
        },
      }, true);
    } else {
      addElement({
        type: 'image',
        src: url,
        url: url,
        w: w,
        h: h,
        caption: name,
        assetRef: {
          source: assetTab === 'uploads' ? 'upload' : 'library',
          assetId: asset.id,
          url: url,
          alt: name,
          fit: 'cover',
        },
      });
    }
    if (assetModalOpen) {
      setAssetModalOpen(false);
    }
  };

  // Sprint 2: Delete Tenant Asset with Confirmation
  const handleDeleteAsset = async (assetId: number | string, assetName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to permanently delete "${assetName}"?`)) {
      return;
    }
    try {
      await api(`/studio/assets/${assetId}`, 'DELETE');
      setTenantAssets((prev) => prev.filter((a) => a.id !== assetId));
    } catch (err: any) {
      alert('Failed to delete asset: ' + (err?.message || 'Server error'));
    }
  };

  // ==========================================
  // RENDER: DOCUMENT MANAGER (GALLERY) VIEW
  // ==========================================
  if (!activeDocId) {
    const filteredDocs = documents.filter((d) => {
      if (filterType !== 'all' && d.doc_type !== filterType) return false;
      if (searchQuery && !d.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });

    return (
      <div className="studio-container">
        {/* Header Banner - High-contrast Deep Ocean / Slate */}
        <div className="studio-hero-banner">
          <div style={{ position: 'absolute', top: 0, right: 0, width: '380px', height: '380px', background: 'radial-gradient(circle, rgba(14,116,144,0.2) 0%, transparent 70%)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                <span className="studio-pill-tag">
                  ✨ Canva-Like Visual Creation Engine
                </span>
                <span className="studio-pill-tag green">
                  Direct Vector &amp; Print PDF
                </span>
                <span className="studio-pill-tag sky">
                  WhatsApp 1-Tap Ordering
                </span>
              </div>
              <h1 className="studio-hero-title">Flipex Studio</h1>
              <p className="studio-hero-desc">
                Design stunning promotional catalogues, school &amp; university yearbooks, community editorial magazines, and luxury photo albums from scratch. Publish directly into your responsive interactive flipbook reader with 1-tap WhatsApp ordering.
              </p>
            </div>
            <div>
              <button
                type="button"
                onClick={() => setShowNewDocModal(true)}
                className="studio-gradient-btn cosmic"
                style={{
                  fontSize: '0.95rem',
                  padding: '12px 24px',
                  borderRadius: '12px',
                }}
              >
                <span>➕</span> Create New Document
              </button>
            </div>
          </div>
        </div>

        {/* Stage 4: Top Navigation View Switcher (My Documents vs Template Discovery Browser) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px', borderBottom: '1px solid #334155', paddingBottom: '14px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setHubView('documents')}
            className={`studio-filter-pill ${hubView === 'documents' ? 'active' : ''}`}
            style={{ fontSize: '0.88rem', padding: '10px 22px', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <span>📚</span>
            <span>My Documents ({documents.length})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setHubView('templates');
              loadTemplates();
            }}
            className={`studio-filter-pill ${hubView === 'templates' ? 'active' : ''}`}
            style={{ fontSize: '0.88rem', padding: '10px 22px', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <span>🎨</span>
            <span>Template Discovery Browser ({templates.length})</span>
          </button>
        </div>

        {hubView === 'documents' ? (
          <>
            {/* Filter Pills & Search */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
            {[
              { id: 'all', label: 'All Documents' },
              { id: 'catalogue', label: '🛒 Product Catalogues' },
              { id: 'magazine', label: '📖 Magazines & Yearbooks' },
              { id: 'album', label: '📷 Keepsake Albums' },
              { id: 'custom', label: '🎨 Custom Vector' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilterType(f.id)}
                className={`studio-filter-pill ${filterType === f.id ? 'active' : ''}`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="studio-search-wrap">
            <span className="studio-search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search documents…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="studio-search-input"
            />
          </div>
        </div>

        {/* Documents Grid */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: '#64748b' }}>Loading your studio workspace…</div>
        ) : filteredDocs.length === 0 ? (
          <div className="studio-empty-state">
            <div style={{ fontSize: '48px', marginBottom: '10px' }}>🎨</div>
            <h3 className="studio-empty-title">No Documents Found</h3>
            <p className="studio-empty-desc">
              Get started by launching a prebuilt supermarket catalogue, high-school yearbook, or island lifestyle magazine.
            </p>
            <button
              type="button"
              onClick={() => setShowNewDocModal(true)}
              className="studio-gradient-btn cosmic"
              style={{
                fontSize: '0.9rem',
                padding: '11px 24px',
                borderRadius: '10px',
              }}
            >
              + Create Your First Document
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '22px' }}>
            {filteredDocs.map((doc) => (
              <div key={doc.id} className="studio-doc-card">
                <div>
                  {/* Preview Thumbnail */}
                  <div
                    onClick={() => {
                      setActiveDocId(doc.id);
                      navigate(`/studio/${doc.id}`);
                    }}
                    style={{
                      height: '210px',
                      background: '#f1f5f9',
                      cursor: 'pointer',
                      overflow: 'hidden',
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderBottom: '1px solid #e2e8f0',
                    }}
                  >
                    {doc.cover_thumb ? (
                      <img
                        src={doc.cover_thumb}
                        alt={doc.title}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <div style={{ textAlign: 'center', padding: '16px' }}>
                        <span style={{ fontSize: '38px', display: 'block', marginBottom: '6px' }}>
                          {doc.doc_type === 'catalogue' ? '🛒' : doc.doc_type === 'magazine' ? '📖' : '📷'}
                        </span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8' }}>Blank Canvas Page</span>
                      </div>
                    )}
                    <div style={{ position: 'absolute', top: '10px', left: '10px' }}>
                      <span style={{ padding: '3px 8px', background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(4px)', color: '#ffffff', borderRadius: '6px', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {doc.doc_type}
                      </span>
                    </div>
                    {doc.status === 'published' && (
                      <div style={{ position: 'absolute', top: '10px', right: '10px' }}>
                        <span style={{ padding: '3px 8px', background: '#10b981', color: '#ffffff', borderRadius: '6px', fontSize: '0.68rem', fontWeight: 700 }}>
                          Live Reader ✓
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Body Content */}
                  <div style={{ padding: '16px' }}>
                    <h3
                      onClick={() => {
                        setActiveDocId(doc.id);
                        navigate(`/studio/${doc.id}`);
                      }}
                      className="studio-doc-card-title"
                    >
                      {doc.title}
                    </h3>
                    <div className="studio-doc-card-meta">
                      <span>📄 {doc.page_count} {doc.page_count === 1 ? 'Page' : 'Pages'}</span>
                      <span>•</span>
                      <span>{doc.orientation === 'portrait' ? '↕ Portrait' : '↔ Landscape'}</span>
                    </div>
                  </div>
                </div>

                {/* Card Actions */}
                <div style={{ padding: '12px 16px', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <Link
                    to={`/studio/${doc.id}`}
                    style={{
                      flex: 1,
                      textAlign: 'center',
                      padding: '8px 12px',
                      background: 'linear-gradient(135deg, rgba(14,116,144,0.12) 0%, rgba(2,132,199,0.12) 50%, rgba(236,72,153,0.12) 100%)',
                      border: '1px solid rgba(2,132,199,0.3)',
                      color: '#0284c7',
                      fontWeight: 700,
                      fontSize: '0.78rem',
                      borderRadius: '8px',
                      textDecoration: 'none',
                    }}
                  >
                    Open Canvas
                  </Link>
                  <a
                    href={`/api/v1/studio/documents/${doc.id}/export-pdf`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      padding: '8px 12px',
                      background: '#f8fafc',
                      color: '#475569',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      textDecoration: 'none',
                    }}
                    title="Export Print PDF"
                  >
                    🖨️
                  </a>
                  {doc.flipbook_slug && (
                    <a
                      href={`/v/${doc.flipbook_slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="studio-gradient-btn emerald"
                      style={{
                        padding: '7px 14px',
                        fontSize: '0.78rem',
                        textDecoration: 'none',
                      }}
                      title="Open in Live Reader"
                    >
                      Reader
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
          </>
        ) : (
          /* ==========================================================
             STAGE 4: TEMPLATE PLATFORM & DISCOVERY BROWSER
             ========================================================== */
          <div className="space-y-6">
            {/* 10 Commercial Categories Filter Row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', paddingBottom: '6px' }}>
              {TEMPLATE_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setTemplateCategory(cat.id)}
                  className={`studio-filter-pill ${templateCategory === cat.id ? 'active' : ''}`}
                  style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.label}</span>
                </button>
              ))}
            </div>

            {/* Scope Tabs & Search Controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setTemplateScope('all')}
                  className={`studio-fmt-btn ${templateScope === 'all' ? 'active' : ''}`}
                >
                  All Templates
                </button>
                <button
                  type="button"
                  onClick={() => setTemplateScope('system')}
                  className={`studio-fmt-btn ${templateScope === 'system' ? 'active' : ''}`}
                >
                  ⭐ Official Presets
                </button>
                <button
                  type="button"
                  onClick={() => setTemplateScope('custom')}
                  className={`studio-fmt-btn ${templateScope === 'custom' ? 'active' : ''}`}
                >
                  🏢 My Custom Templates
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <select
                  value={templateDocType}
                  onChange={(e) => setTemplateDocType(e.target.value)}
                  className="studio-prop-select"
                  style={{ width: '160px', padding: '6px 10px', fontSize: '11px' }}
                >
                  <option value="all">All Formats</option>
                  <option value="catalogue">🛒 Catalogues</option>
                  <option value="magazine">📖 Magazines</option>
                  <option value="album">📷 Photo Albums</option>
                  <option value="custom">🎨 Custom</option>
                </select>

                <div className="studio-search-wrap" style={{ width: '240px' }}>
                  <span className="studio-search-icon">🔍</span>
                  <input
                    type="text"
                    placeholder="Search templates…"
                    value={templateSearch}
                    onChange={(e) => setTemplateSearch(e.target.value)}
                    className="studio-search-input"
                  />
                </div>
              </div>
            </div>

            {/* Templates Grid */}
            {templates.length === 0 ? (
              <div className="studio-empty-state">
                <div style={{ fontSize: '42px', marginBottom: '10px' }}>🔍</div>
                <h3 className="studio-empty-title">No Templates Match Your Filters</h3>
                <p className="studio-empty-desc">
                  Try clearing the category filter or searching for another keyword like "Supermarket", "Yearbook", or "Menu".
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setTemplateCategory('all');
                    setTemplateSearch('');
                    setTemplateDocType('all');
                    setTemplateScope('all');
                  }}
                  className="studio-gradient-btn cosmic"
                  style={{ padding: '8px 18px', fontSize: '11px' }}
                >
                  Reset All Filters
                </button>
              </div>
            ) : (
              <div className="studio-template-grid">
                {templates.map((tpl) => (
                  <div key={tpl.id} className="studio-template-card">
                    <div>
                      {/* Thumbnail with overlay badges */}
                      <div
                        className="studio-template-thumb-wrap"
                        onClick={() => handleOpenTemplatePreview(tpl)}
                        title="Click to Preview Template Pages"
                      >
                        <img
                          src={tpl.thumbnail_url}
                          alt={tpl.name}
                          className="studio-template-thumb"
                        />
                        <div className="studio-template-meta-badge">
                          {tpl.category.replace('_', ' ')}
                        </div>
                        <div className="studio-template-pages-chip">
                          📄 {tpl.page_count || 2} Pages
                        </div>
                      </div>

                      {/* Content */}
                      <div style={{ padding: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
                          <h4 style={{ fontSize: '1rem', fontWeight: 800, margin: 0, color: '#f8fafc', lineHeight: 1.3 }}>
                            {tpl.name}
                          </h4>
                          {tpl.is_system === 0 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteCustomTemplate(tpl.id);
                              }}
                              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '13px' }}
                              title="Delete this custom template"
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                        <p style={{ fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.5, margin: 0, minHeight: '36px' }}>
                          {tpl.description}
                        </p>
                      </div>
                    </div>

                    {/* Dual Action Buttons (3-Gradient) */}
                    <div style={{ padding: '12px 16px', borderTop: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <button
                        type="button"
                        onClick={() => handleOpenTemplatePreview(tpl)}
                        className="studio-tool-btn ocean"
                        style={{ flex: 1, padding: '8px 0', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
                      >
                        <span>👁️</span> Preview
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUseTemplate(tpl.id)}
                        className="studio-gradient-btn cosmic"
                        style={{ flex: 1, padding: '8px 0', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
                      >
                        <span>✨</span> Use Template
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* New Document Modal */}
        {showNewDocModal && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
            <div style={{ background: '#ffffff', borderRadius: '20px', maxWidth: '560px', width: '100%', padding: '28px', boxShadow: '0 25px 60px rgba(0,0,0,0.3)', position: 'relative', border: '1px solid #e2e8f0', color: '#0f172a' }}>
              <button
                onClick={() => setShowNewDocModal(false)}
                style={{ position: 'absolute', top: '20px', right: '20px', background: 'none', border: 'none', fontSize: '18px', color: '#94a3b8', cursor: 'pointer' }}
              >
                ✕
              </button>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', margin: '0 0 6px 0' }}>Create Studio Document</h2>
              <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '0 0 20px 0' }}>
                Select your document layout and pick a starter preset to accelerate creation.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>Document Title</label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="e.g. Suva Weekly Supermarket Specials"
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#0f172a', fontSize: '0.88rem', outline: 'none' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>Document Type</label>
                    <select
                      value={newDocType}
                      onChange={(e) => setNewDocType(e.target.value as DocType)}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#0f172a', fontSize: '0.85rem' }}
                    >
                      <option value="catalogue">🛒 Product Catalogue</option>
                      <option value="magazine">📖 Editorial Magazine / Yearbook</option>
                      <option value="album">📷 Keepsake Photo Album</option>
                      <option value="custom">🎨 Custom Document</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>Orientation</label>
                    <select
                      value={newOrientation}
                      onChange={(e) => setNewOrientation(e.target.value as 'portrait' | 'landscape')}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#0f172a', fontSize: '0.85rem' }}
                    >
                      <option value="portrait">↕ Portrait (A4 Standard)</option>
                      <option value="landscape">↔ Landscape (Spread)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>
                    Starter Template (Optional)
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px', maxHeight: '180px', overflowY: 'auto', paddingRight: '4px' }}>
                    <div
                      onClick={() => setNewTemplateId(null)}
                      style={{
                        padding: '12px',
                        borderRadius: '10px',
                        border: newTemplateId === null ? '2px solid #0284c7' : '1px solid #cbd5e1',
                        background: newTemplateId === null ? 'linear-gradient(135deg, rgba(14,116,144,0.12) 0%, rgba(2,132,199,0.12) 100%)' : '#ffffff',
                        cursor: 'pointer',
                        textAlign: 'center',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: newTemplateId === null ? '#0284c7' : '#334155',
                      }}
                    >
                      <span style={{ fontSize: '26px', display: 'block', marginBottom: '4px' }}>📄</span>
                      Blank Canvas
                    </div>
                    {templates.map((tpl) => (
                      <div
                        key={tpl.id}
                        onClick={() => setNewTemplateId(tpl.id)}
                        style={{
                          padding: '8px',
                          borderRadius: '10px',
                          border: newTemplateId === tpl.id ? '2px solid #0284c7' : '1px solid #cbd5e1',
                          background: newTemplateId === tpl.id ? 'linear-gradient(135deg, rgba(14,116,144,0.12) 0%, rgba(2,132,199,0.12) 100%)' : '#ffffff',
                          cursor: 'pointer',
                          fontSize: '0.72rem',
                        }}
                      >
                        <img src={tpl.thumbnail_url} alt={tpl.name} style={{ height: '55px', width: '100%', objectFit: 'cover', borderRadius: '6px', marginBottom: '4px' }} />
                        <span style={{ fontWeight: 700, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#0f172a' }}>{tpl.name}</span>
                        <span style={{ fontSize: '0.65rem', color: '#64748b', textTransform: 'uppercase' }}>{tpl.category.replace('_', ' ')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
                <button
                  type="button"
                  onClick={() => setShowNewDocModal(false)}
                  style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#475569', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={creatingDoc}
                  onClick={handleCreateDocument}
                  className="studio-gradient-btn cosmic"
                  style={{
                    padding: '10px 24px',
                    fontSize: '0.88rem',
                    opacity: creatingDoc ? 0.75 : 1,
                  }}
                >
                  {creatingDoc ? 'Launching Studio...' : 'Launch Studio 🚀'}
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Stage 4: Multi-Page Interactive Template Preview Modal */}
        {previewTemplate && (
          <div className="studio-preview-modal-shell">
            <div className="studio-preview-modal">
              {/* Modal Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid #1e293b' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '20px' }}>🎨</span>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#f8fafc' }}>
                      {previewTemplate.name}
                    </h3>
                    <span style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {previewTemplate.category.replace('_', ' ')} • {previewTemplate.doc_type}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewTemplate(null)}
                  style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '20px', cursor: 'pointer', padding: '4px' }}
                >
                  ✕
                </button>
              </div>

              {/* Modal Body */}
              <div className="studio-preview-body">
                {/* Left: Interactive Multi-Page Preview Sheet */}
                <div className="studio-preview-viewer">
                  {loadingTemplateDetail ? (
                    <div style={{ color: '#94a3b8', fontSize: '12px' }}>Loading high-res template layout…</div>
                  ) : (
                    <>
                      {/* Active Preview Page Display */}
                      <div className="studio-preview-canvas-sheet">
                        {previewTemplate.canvas_spec?.pages?.[previewPageIndex] ? (
                          <div
                            style={{
                              width: '100%',
                              height: '100%',
                              position: 'relative',
                              backgroundColor: previewTemplate.canvas_spec.pages[previewPageIndex].background?.value || '#ffffff',
                              background: previewTemplate.canvas_spec.pages[previewPageIndex].background?.value || '#ffffff',
                              overflow: 'hidden',
                              padding: '16px',
                            }}
                          >
                            {/* Scaled Preview of elements */}
                            <div style={{ position: 'relative', width: '100%', height: '100%', transform: 'scale(0.55)', transformOrigin: 'top left' }}>
                              {(previewTemplate.canvas_spec.pages[previewPageIndex].elements || []).map((el: any) => (
                                <div
                                  key={el.id}
                                  style={{
                                    position: 'absolute',
                                    left: `${el.x}px`,
                                    top: `${el.y}px`,
                                    width: `${el.w}px`,
                                    height: `${el.h}px`,
                                    backgroundColor: el.style?.backgroundColor,
                                    color: el.style?.color || '#0f172a',
                                    borderRadius: el.style?.borderRadius ? `${el.style.borderRadius}px` : undefined,
                                    fontSize: el.style?.fontSize ? `${el.style.fontSize}px` : '12px',
                                    fontWeight: el.style?.fontWeight || 'normal',
                                    overflow: 'hidden',
                                  }}
                                >
                                  {el.type === 'text' && (el.content || 'Sample Heading')}
                                  {el.type === 'image' && el.src && (
                                    <img src={el.src} alt="Sample" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                  )}
                                  {el.type === 'product' && (
                                    <div style={{ padding: '8px', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px' }}>
                                      {el.image && <img src={el.image} alt={el.name} style={{ width: '100%', height: '100px', objectFit: 'cover', borderRadius: '6px' }} />}
                                      <div style={{ fontWeight: 700, fontSize: '11px', marginTop: '4px' }}>{el.name}</div>
                                      <div style={{ color: '#ef4444', fontWeight: 800 }}>{el.price}</div>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <img
                            src={previewTemplate.thumbnail_url}
                            alt={previewTemplate.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        )}
                      </div>

                      {/* Multi-Page Thumbnail Strip & Navigation */}
                      <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', width: '100%' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: '#cbd5e1' }}>
                          <button
                            type="button"
                            disabled={previewPageIndex <= 0}
                            onClick={() => setPreviewPageIndex(Math.max(0, previewPageIndex - 1))}
                            className="studio-tool-btn cosmic"
                            style={{ padding: '3px 8px', fontSize: '11px' }}
                          >
                            ◀ Prev
                          </button>
                          <span style={{ fontWeight: 700, fontFamily: 'monospace' }}>
                            Page {previewPageIndex + 1} of {previewTemplate.canvas_spec?.pages?.length || previewTemplate.page_count || 1}
                          </span>
                          <button
                            type="button"
                            disabled={previewPageIndex >= (previewTemplate.canvas_spec?.pages?.length || previewTemplate.page_count || 1) - 1}
                            onClick={() => setPreviewPageIndex(previewPageIndex + 1)}
                            className="studio-tool-btn cosmic"
                            style={{ padding: '3px 8px', fontSize: '11px' }}
                          >
                            Next ▶
                          </button>
                        </div>

                        {/* Page Thumbnails Selector */}
                        <div className="studio-thumb-strip">
                          {Array.from({ length: previewTemplate.canvas_spec?.pages?.length || previewTemplate.page_count || 1 }).map((_, pIdx) => (
                            <div
                              key={pIdx}
                              onClick={() => setPreviewPageIndex(pIdx)}
                              className={`studio-strip-thumb ${previewPageIndex === pIdx ? 'active' : ''}`}
                              title={`View Page ${pIdx + 1}`}
                            >
                              <div style={{ width: '100%', height: '100%', background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f8fafc', fontSize: '11px', fontWeight: 800 }}>
                                P{pIdx + 1}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Right: Specifications & One-Click Creation */}
                <div className="studio-preview-details">
                  <div>
                    <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
                      <span className="studio-pill-tag">
                        🌟 Commercial Starter
                      </span>
                      <span className="studio-pill-tag green">
                        📄 {previewTemplate.canvas_spec?.pages?.length || previewTemplate.page_count || 2} Prebuilt Pages
                      </span>
                      <span className="studio-pill-tag sky">
                        ✨ Ready to Customize
                      </span>
                    </div>

                    <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: '0 0 10px 0', color: '#f8fafc' }}>
                      {previewTemplate.name}
                    </h2>
                    <p style={{ fontSize: '0.88rem', color: '#cbd5e1', lineHeight: 1.6, marginBottom: '20px' }}>
                      {previewTemplate.description}
                    </p>

                    <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '12px', padding: '16px', marginBottom: '24px' }}>
                      <h5 style={{ margin: '0 0 8px 0', fontSize: '11px', fontWeight: 700, color: '#0284c7', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Template Specifications
                      </h5>
                      <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: '#94a3b8', lineHeight: 1.7 }}>
                        <li>Fully customizable typography with 9 Google Web-Fonts</li>
                        <li>High-res print-ready 300 DPI layout bounds</li>
                        <li>Built-in 3-Gradient backgrounds and vector container geometry</li>
                        <li>Instant 1-click publishing directly to interactive flipbook reader</li>
                      </ul>
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid #1e293b', paddingTop: '20px' }}>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button
                        type="button"
                        onClick={() => setPreviewTemplate(null)}
                        style={{ padding: '12px 18px', borderRadius: '10px', border: '1px solid #334155', background: 'transparent', color: '#cbd5e1', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
                      >
                        Back to Library
                      </button>
                      <button
                        type="button"
                        disabled={creatingDoc}
                        onClick={() => handleUseTemplate(previewTemplate.id)}
                        className="studio-gradient-btn cosmic"
                        style={{ flex: 1, padding: '12px 20px', borderRadius: '10px', fontSize: '0.9rem', fontWeight: 700 }}
                      >
                        {creatingDoc ? 'Building Workspace…' : '🚀 Use This Template to Create Document'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==========================================
  // RENDER: INTERACTIVE CANVAS STUDIO
  // ==========================================
  const docW = currentDoc?.width_pt || 595.28;
  const docH = currentDoc?.height_pt || 841.89;
  const scale = zoom / 100;

  return (
    <div
      className="flipex-studio-root"
      style={{
        display: 'grid',
        gridTemplateRows: bottomStripCollapsed ? '56px minmax(0, 1fr) 34px' : '56px minmax(0, 1fr) 115px',
        height: '100vh',
        width: '100vw',
        maxWidth: '100vw',
        overflow: 'hidden',
        background: '#090d16',
        color: '#f8fafc',
        userSelect: 'none',
        transition: 'grid-template-rows 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {/* TOP STUDIO TOOLBAR - Single line, non-wrapping, clean layout with 3-Gradients */}
      <header style={{ height: '56px', minHeight: '56px', background: '#090d16', borderBottom: '1px solid #1e293b', padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', zIndex: 30, flexWrap: 'nowrap', overflowX: 'auto' }}>
        {/* Left: Back, Sidebar Toggle & Document Metadata */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => {
              setActiveDocId(null);
              navigate('/studio');
            }}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              background: '#1e293b',
              color: '#f8fafc',
              border: '1px solid #334155',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
            title="Return to Documents Hub"
          >
            ← Back
          </button>

          {/* Toggle Left Tools Sidebar */}
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            style={{
              padding: '6px 11px',
              borderRadius: '8px',
              background: sidebarCollapsed ? 'rgba(14, 116, 144, 0.2)' : '#1e293b',
              border: sidebarCollapsed ? '1px solid #818cf8' : '1px solid #334155',
              color: sidebarCollapsed ? '#c7d2fe' : '#94a3b8',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
            title={sidebarCollapsed ? "Expand Tools Sidebar" : "Collapse Tools Sidebar to Expand Canvas Workspace"}
          >
            {sidebarCollapsed ? '⇥ Tools' : '⇤ Tools'}
          </button>

          <div style={{ height: '18px', width: '1px', background: '#334155' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff', whiteSpace: 'nowrap' }}>
              {currentDoc?.title}
            </span>
            <span style={{ padding: '2px 8px', borderRadius: '12px', background: 'rgba(14,116,144,0.2)', color: '#a5b4fc', border: '1px solid rgba(14,116,144,0.3)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' }}>
              {currentDoc?.doc_type}
            </span>
            <span
              style={{
                padding: '2px 8px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.25) 0%, rgba(249, 115, 22, 0.25) 100%)',
                color: '#fde047',
                border: '1px solid rgba(234, 179, 8, 0.4)',
                fontSize: '10px',
                fontWeight: 800,
                letterSpacing: '0.5px',
              }}
              title="Commercial Tier: Enterprise Suite Active (Full 300 DPI Export, Brand Kits & Catalogues)"
            >
              🏢 ENTERPRISE
            </span>
            <span
              style={{
                fontSize: '11px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 7px',
                borderRadius: '6px',
                background: autosaveStatus === 'saving' ? 'rgba(245, 158, 11, 0.15)' : autosaveStatus === 'offline' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                color: autosaveStatus === 'saving' ? '#fbbf24' : autosaveStatus === 'offline' ? '#f87171' : '#34d399',
                fontWeight: 600,
              }}
              title={lastSavedAt ? `Last autosaved at ${lastSavedAt}` : 'Autosave active'}
            >
              {autosaveStatus === 'saving' && '⏳ Saving…'}
              {autosaveStatus === 'saved' && '☁️ Saved'}
              {autosaveStatus === 'offline' && '⚠️ Offline (Saved locally)'}
              {autosaveStatus === 'restored' && '✨ Restored'}
            </span>
          </div>
          {saveMessage && (
            <span style={{ fontSize: '12px', color: '#34d399', fontWeight: 600, marginLeft: '6px' }}>
              {saveMessage}
            </span>
          )}
        </div>

        {/* Center: Page Switcher, Zoom & Fit, Bleed, Snap & Auto Tools */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {/* Page Switcher (Adapts in Spread Mode) */}
          <div style={{ display: 'flex', alignItems: 'center', background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '2px', fontSize: '12px' }}>
            <button
              type="button"
              disabled={activePageIndex <= 0}
              onClick={() => {
                if (spreadMode && activePageIndex > 1) {
                  setActivePageIndex(Math.max(0, activePageIndex - 2));
                } else {
                  setActivePageIndex(Math.max(0, activePageIndex - 1));
                }
              }}
              style={{ padding: '4px 8px', background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', opacity: activePageIndex <= 0 ? 0.3 : 1 }}
              title="Previous Page / Spread"
            >
              ◀
            </button>
            <span style={{ padding: '0 8px', fontWeight: 700, color: '#f1f5f9', whiteSpace: 'nowrap' }}>
              {spreadMode && activePageIndex > 0
                ? `Spread ${activePageIndex % 2 === 1 ? activePageIndex + 1 : activePageIndex}-${Math.min(pages.length, (activePageIndex % 2 === 1 ? activePageIndex + 1 : activePageIndex) + 1)} of ${pages.length}`
                : `Page ${activePageIndex + 1} of ${pages.length}`}
            </span>
            <button
              type="button"
              disabled={activePageIndex >= pages.length - 1}
              onClick={() => {
                if (spreadMode && activePageIndex < pages.length - 2) {
                  setActivePageIndex(Math.min(pages.length - 1, activePageIndex + 2));
                } else {
                  setActivePageIndex(Math.min(pages.length - 1, activePageIndex + 1));
                }
              }}
              style={{ padding: '4px 8px', background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', opacity: activePageIndex >= pages.length - 1 ? 0.3 : 1 }}
              title="Next Page / Spread"
            >
              ▶
            </button>
          </div>

          {/* Zoom & Fit Controls */}
          <div style={{ display: 'flex', alignItems: 'center', background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px', padding: '1px' }}>
            <button
              type="button"
              onClick={() => setZoom(Math.max(30, zoom - 15))}
              style={{ padding: '4px 8px', background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              title="Zoom Out"
            >
              -
            </button>
            <span style={{ padding: '0 6px', fontFamily: 'monospace', fontSize: '11px', color: '#cbd5e1' }}>
              {zoom}%
            </span>
            <button
              type="button"
              onClick={() => setZoom(Math.min(200, zoom + 15))}
              style={{ padding: '4px 8px', background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              title="Zoom In"
            >
              +
            </button>
            <button
              type="button"
              onClick={handleFitToScreen}
              style={{
                padding: '3px 8px',
                marginRight: '2px',
                background: 'linear-gradient(135deg, rgba(14,116,144,0.25) 0%, rgba(2,132,199,0.25) 100%)',
                border: '1px solid rgba(2,132,199,0.4)',
                color: '#f5d0fe',
                borderRadius: '6px',
                fontSize: '10px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
              title="Auto-Fit Canvas to Screen View"
            >
              Fit
            </button>
          </div>

          {/* Undo / Redo History Controls (Stage 2) */}
          <div style={{ display: 'flex', alignItems: 'center', background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '11px', padding: '1px' }}>
            <button
              type="button"
              disabled={historyIndex <= 0}
              onClick={handleUndo}
              style={{
                padding: '4px 8px',
                background: 'transparent',
                border: 'none',
                color: historyIndex > 0 ? '#f5d0fe' : '#64748b',
                cursor: historyIndex > 0 ? 'pointer' : 'not-allowed',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
              }}
              title="Undo (Ctrl+Z)"
            >
              ↶ Undo
            </button>
            <div style={{ height: '14px', width: '1px', background: '#334155' }} />
            <button
              type="button"
              disabled={historyIndex >= history.length - 1}
              onClick={handleRedo}
              style={{
                padding: '4px 8px',
                background: 'transparent',
                border: 'none',
                color: historyIndex < history.length - 1 ? '#f5d0fe' : '#64748b',
                cursor: historyIndex < history.length - 1 ? 'pointer' : 'not-allowed',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
              }}
              title="Redo (Ctrl+Shift+Z / Ctrl+Y)"
            >
              ↷ Redo
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowBleed(!showBleed)}
            style={{
              padding: '5px 10px',
              borderRadius: '8px',
              fontSize: '11px',
              fontWeight: 600,
              border: showBleed ? '1px solid rgba(236, 72, 153, 0.6)' : '1px solid #334155',
              background: showBleed ? 'linear-gradient(135deg, rgba(236,72,153,0.2) 0%, rgba(2,132,199,0.2) 100%)' : '#1e293b',
              color: showBleed ? '#f472b6' : '#94a3b8',
              cursor: 'pointer',
            }}
            title="Toggle 3mm Print Bleed Safe Margins"
          >
            Bleed 3mm
          </button>

          <button
            type="button"
            onClick={() => setGridSnap(!gridSnap)}
            style={{
              padding: '5px 10px',
              borderRadius: '8px',
              fontSize: '11px',
              fontWeight: 600,
              border: gridSnap ? '1px solid rgba(14, 116, 144, 0.6)' : '1px solid #334155',
              background: gridSnap ? 'linear-gradient(135deg, rgba(14,116,144,0.2) 0%, rgba(6,182,212,0.2) 100%)' : '#1e293b',
              color: gridSnap ? '#a5b4fc' : '#94a3b8',
              cursor: 'pointer',
            }}
            title="Toggle Magnetic Snap-to-Grid"
          >
            Snap Grid
          </button>

          {/* Stage 6: Facing Pages / 2-Page Centerfold Spread Toggle */}
          <button
            type="button"
            onClick={() => setSpreadMode(!spreadMode)}
            className={`studio-gradient-btn ${spreadMode ? 'cosmic' : 'ocean'}`}
            style={{
              padding: '5px 11px',
              fontSize: '11px',
              borderRadius: '8px',
            }}
            title="Toggle Facing-Pages 2-Page Centerfold Spread View"
          >
            {spreadMode ? '📖 2-Page Spread' : '📄 Single Page'}
          </button>

          <button
            type="button"
            onClick={handleAddRunningFolio}
            className="studio-gradient-btn cosmic"
            style={{
              padding: '5px 11px',
              fontSize: '11px',
              borderRadius: '8px',
            }}
            title="Add Running Header & Page Number Folio to this page"
          >
            + Folio
          </button>

          <button
            type="button"
            onClick={handleAutoGenerateToc}
            className="studio-gradient-btn sunset"
            style={{
              padding: '5px 11px',
              fontSize: '11px',
              borderRadius: '8px',
            }}
            title="Scan document pages and generate Table of Contents"
          >
            📑 Auto TOC
          </button>

          {/* Stage 7: Real-Time Print Resolution Protection (DPI Guard) */}
          <button
            type="button"
            onClick={() => setShowDpiGuardModal(true)}
            className="studio-gradient-btn orchid"
            style={{
              padding: '5px 11px',
              fontSize: '11px',
              borderRadius: '8px',
            }}
            title="Pre-Flight Print Resolution & DPI Safety Guard"
          >
            🛡️ DPI Guard
          </button>
        </div>

        {/* Right: Print PDF, Save, Publish Action & Inspector Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {/* Stage 8: Commercial Print & Vector PDF Export Modal */}
          <button
            type="button"
            onClick={() => setShowExportModal(true)}
            className="studio-gradient-btn orchid"
            style={{
              padding: '6px 14px',
              fontSize: '12px',
              borderRadius: '8px',
            }}
            title="Export Vector 300 DPI Print PDF"
          >
            <span>🖨️</span> Export PDF
          </button>

          {/* Stage 9: Brand Kits Reusable Identity */}
          <button
            type="button"
            onClick={() => {
              fetchBrandKits();
              setShowBrandKitsModal(true);
            }}
            className="studio-tool-btn cosmic"
            style={{
              padding: '6px 12px',
              fontSize: '11px',
              borderRadius: '8px',
            }}
            title="Apply Reusable Brand Kit or Save Theme"
          >
            <span>🎨</span> Brand Kits
          </button>

          <button
            type="button"
            onClick={() => {
              setTemplateFormName(currentDoc?.title ? `${currentDoc.title} Template` : 'My Custom Template');
              setTemplateFormCategory(
                currentDoc?.doc_type === 'catalogue' ? 'retail_catalogue'
                : currentDoc?.doc_type === 'magazine' ? 'community_magazine'
                : currentDoc?.doc_type === 'album' ? 'wedding_album'
                : 'business_corporate'
              );
              setTemplateFormDesc('');
              setShowSaveAsTemplateModal(true);
            }}
            className="studio-tool-btn sunset"
            style={{
              padding: '6px 12px',
              fontSize: '11px',
              borderRadius: '8px',
            }}
            title="Save this document as a reusable template for your workspace"
          >
            <span>🎨</span> As Template
          </button>
          <button
            type="button"
            onClick={handleSavePage}
            disabled={saving}
            className="studio-gradient-btn ocean"
            style={{
              padding: '6px 14px',
              fontSize: '12px',
              borderRadius: '8px',
            }}
          >
            <span>💾</span> {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={handlePublish}
            disabled={saving}
            className="studio-gradient-btn emerald"
            style={{
              padding: '6px 16px',
              fontSize: '12px',
              borderRadius: '8px',
            }}
          >
            <span>🚀</span> Publish to Flipbook
          </button>

          {/* Toggle Right Inspector */}
          <button
            type="button"
            onClick={() => setInspectorCollapsed(!inspectorCollapsed)}
            style={{
              padding: '6px 11px',
              borderRadius: '8px',
              background: inspectorCollapsed ? 'rgba(6, 182, 212, 0.2)' : '#1e293b',
              border: inspectorCollapsed ? '1px solid #06b6d4' : '1px solid #334155',
              color: inspectorCollapsed ? '#bae6fd' : '#94a3b8',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              marginLeft: '4px',
            }}
            title={inspectorCollapsed ? "Expand Inspector Panel" : "Collapse Inspector to Expand Canvas Workspace"}
          >
            {inspectorCollapsed ? 'Inspector ⇤' : 'Inspector ⇥'}
          </button>
        </div>
      </header>

      {/* Stage 8: Local Crash Recovery Snapshot Banner */}
      {backupAvailable && (
        <div
          style={{
            background: 'linear-gradient(90deg, #1e1b4b 0%, #312e81 100%)',
            borderBottom: '1px solid #0284c7',
            padding: '6px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '12px',
            color: '#e0e7ff',
            zIndex: 40,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>⚠️</span>
            <span>
              <strong>Unsaved Local Recovery Snapshot:</strong> A local crash snapshot from{' '}
              {new Date(backupAvailable.timestamp).toLocaleTimeString()} was found.
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={handleRestoreBackup}
              className="studio-gradient-btn cosmic"
              style={{ padding: '3px 10px', fontSize: '11px', borderRadius: '6px' }}
            >
              Restore Draft
            </button>
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem(`flipex_studio_draft_${currentDoc?.id}`);
                setBackupAvailable(null);
              }}
              style={{
                padding: '3px 8px',
                background: 'transparent',
                border: '1px solid #475569',
                color: '#94a3b8',
                fontSize: '11px',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* WORKSPACE BODY: LEFT TOOLBAR + CENTER CANVAS + RIGHT INSPECTOR */}
      <div
        className="studio-workspace-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: `${sidebarCollapsed ? '0px' : '285px'} minmax(0, 1fr) ${inspectorCollapsed ? '0px' : '320px'}`,
          minHeight: 0,
          minWidth: 0,
          overflow: 'hidden',
          position: 'relative',
          transition: 'grid-template-columns 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* LEFT TOOLBAR TABS (Collapsible) */}
        <aside
          style={{
            width: sidebarCollapsed ? '0px' : '285px',
            minWidth: 0,
            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            overflowY: 'auto',
            background: '#090d16',
            borderRight: sidebarCollapsed ? 'none' : '1px solid #1e293b',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 20,
          }}
        >
          <div className="flex items-center border-b border-slate-800 text-xs overflow-x-auto p-1 bg-slate-900/60">
            {[
              { id: 'products', label: '🛒 Products' },
              { id: 'magazine', label: '📖 Magazine' },
              { id: 'yearbook', label: '🎓 Yearbook' },
              { id: 'album', label: '📷 Album' },
              { id: 'text', label: '🔤 Text' },
              { id: 'media', label: '🖼️ Media' },
              { id: 'shapes', label: '⭐ Badges' },
              { id: 'csv', label: '📊 CSV Import' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveToolTab(tab.id as any)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '11px',
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  border: 'none',
                  transition: 'all 0.2s ease',
                  background:
                    activeToolTab === tab.id
                      ? 'linear-gradient(135deg, #0284c7 0%, #0369a1 50%, #0c4a6e 100%)'
                      : 'transparent',
                  color: activeToolTab === tab.id ? '#ffffff' : '#94a3b8',
                  boxShadow:
                    activeToolTab === tab.id
                      ? '0 2px 10px rgba(2, 132, 199, 0.4)'
                      : 'none',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* TAB: PRODUCTS (STAGE 5: SPECIALIZED CATALOGUE CREATOR) */}
            {activeToolTab === 'products' && (
              <div className="space-y-4">
                <div className="studio-info-callout cosmic">
                  <p className="font-bold mb-1">🛒 Specialized Catalogue Creator</p>
                  <p className="text-[11px] leading-relaxed opacity-90">
                    1-tap commercial grid generators, live flash discount sync, and normalized WhatsApp reader hotspots.
                  </p>
                </div>

                {/* 1-Tap Product Grid Generators */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">⚡ 1-Tap Grid Generators</span>
                    <span className="text-[10px] text-sky-400 font-semibold">Auto-Arranged</span>
                  </div>

                  <button
                    type="button"
                    className="studio-tool-btn cosmic w-full text-left"
                    onClick={() => generateProductLayout('hero')}
                    title="1 large hero product layout with specs, QR, and buyer guarantees"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">🌟</span>
                      <div>
                        <b className="block text-xs">1-Product Hero Showcase</b>
                        <span className="text-[10px] opacity-80 font-normal">Flagship deal, large photo, specs &amp; guarantees</span>
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    className="studio-tool-btn ocean w-full text-left"
                    onClick={() => generateProductLayout('split')}
                    title="2 tall side-by-side flagship comparison cards"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">⚡</span>
                      <div>
                        <b className="block text-xs">2-Product Split Spread</b>
                        <span className="text-[10px] opacity-80 font-normal">Dual flagship comparison (MacBook vs XPS)</span>
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    className="studio-tool-btn orchid w-full text-left"
                    onClick={() => generateProductLayout('tier')}
                    title="1 top hero feature card + 2 bottom companion cards"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">👑</span>
                      <div>
                        <b className="block text-xs">3-Product Balanced Tier</b>
                        <span className="text-[10px] opacity-80 font-normal">Featured top hero + dual bottom accessories</span>
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    className="studio-tool-btn sunset w-full text-left"
                    onClick={() => generateProductLayout('grid4')}
                    title="Classic 2x2 retail catalogue product grid"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">🛒</span>
                      <div>
                        <b className="block text-xs">4-Product Standard Grid (2x2)</b>
                        <span className="text-[10px] opacity-80 font-normal">Symmetrical commercial cards with headers</span>
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    className="studio-tool-btn emerald w-full text-left"
                    onClick={() => generateProductLayout('specials6')}
                    title="FMCG grocery & supermarket weekly price drop flyer (2x3)"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">🔥</span>
                      <div>
                        <b className="block text-xs">6-Product Supermarket Specials (2x3)</b>
                        <span className="text-[10px] opacity-80 font-normal">FMCG price drop flyer with discount badges</span>
                      </div>
                    </div>
                  </button>
                </div>

                {/* Dynamic Price Markdown & Flash Discount Tool */}
                <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-400">⚡ Live Flash Markdown</span>
                    <span className="text-[10px] text-slate-400">Dynamic Price Sync</span>
                  </div>

                  <div className="flex gap-1">
                    {[10, 15, 20, 25, 30, 50].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setFlashDiscountPercent(pct)}
                        className={`flex-1 py-1 rounded text-[10px] font-bold transition-all ${
                          flashDiscountPercent === pct
                            ? 'studio-gradient-btn cosmic'
                            : 'bg-slate-800 text-slate-300 hover:text-white'
                        }`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-slate-400">Scope:</span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => setFlashDiscountScope('page')}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          flashDiscountScope === 'page'
                            ? 'bg-sky-600 text-white'
                            : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        Page {activePageIndex + 1}
                      </button>
                      <button
                        type="button"
                        onClick={() => setFlashDiscountScope('all')}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          flashDiscountScope === 'all'
                            ? 'bg-sky-600 text-white'
                            : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        All Pages
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => applyFlashDiscount(flashDiscountPercent, flashDiscountScope)}
                      className="studio-gradient-btn sunset py-1.5 rounded-lg text-[11px] font-bold"
                    >
                      Apply {flashDiscountPercent}% Off
                    </button>
                    <button
                      type="button"
                      onClick={() => revertFlashDiscounts(flashDiscountScope)}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-300 py-1.5 rounded-lg text-[11px] font-medium border border-slate-700"
                    >
                      ↺ Revert Pricing
                    </button>
                  </div>
                </div>

                {/* Individual Product & WhatsApp Elements */}
                <div className="space-y-2">
                  <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">➕ Individual Elements</span>

                  <button
                    type="button"
                    className="studio-tool-btn cosmic w-full"
                    onClick={() =>
                      addElement({
                        type: 'product',
                        name: 'Premium Island Produce',
                        price: '$14.99',
                        originalPrice: '$18.50',
                        badge: 'SPECIAL 20% OFF',
                        sku: 'PROD-01',
                        whatsappNumber: '+6799991234',
                        image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=500',
                        w: 240,
                        h: 310,
                      })
                    }
                  >
                    <span>➕</span> Standard Retail Product Card
                  </button>

                  <button
                    type="button"
                    className="studio-tool-btn sunset w-full"
                    onClick={() =>
                      addElement({
                        type: 'product',
                        name: 'Tech Gadget Pro Max',
                        price: '$249.00',
                        originalPrice: '$299.00',
                        badge: 'SAVE $50',
                        sku: 'TECH-ANC-02',
                        image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500',
                        description: 'Ultra high-definition spatial audio with 30-hour active battery.',
                        w: 260,
                        h: 330,
                      })
                    }
                  >
                    <span>⚡</span> Tech / Electronics Card with Specs
                  </button>

                  <button
                    type="button"
                    className="studio-tool-btn emerald w-full"
                    onClick={() =>
                      addElement({
                        type: 'whatsapp',
                        content: 'Chat & Order on WhatsApp',
                        whatsappNumber: '+6799991234',
                        w: 220,
                        h: 46,
                        style: {
                          backgroundColor: '#22C55E',
                          color: '#FFFFFF',
                          borderRadius: 24,
                          fontWeight: 'bold',
                          textAlign: 'center',
                        },
                      })
                    }
                  >
                    <span>💬</span> Standalone WhatsApp 1-Tap Button
                  </button>

                  {/* Switch to CSV Tab for Bulk Multi-Page Import & SKU Sync */}
                  <button
                    type="button"
                    onClick={() => setActiveToolTab('csv')}
                    className="w-full py-2 px-3 rounded-lg bg-sky-950/60 border border-sky-700/50 hover:bg-sky-900/60 text-sky-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-all mt-2"
                  >
                    <span>📊</span> Open CSV Inventory &amp; Multi-Page Generator →
                  </button>
                </div>
              </div>
            )}

            {/* TAB: MAGAZINE (EDITORIAL & PUBLISHING) */}
            {activeToolTab === 'magazine' && (
              <div className="space-y-3">
                <div className="studio-info-callout ocean">
                  <p className="font-bold mb-1">📖 Editorial Articles &amp; Layouts</p>
                  <p className="text-[11px] leading-relaxed opacity-90">
                    Balanced 2-column &amp; 3-column articles, decorative Drop-Caps, and author bylines for glossy print and digital reading.
                  </p>
                </div>

                {/* Background settings are exclusively in the right Inspector panel */}
                <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-medium">🎨 Page & 3-Gradient:</span>
                  <button
                    type="button"
                    onClick={() => { setInspectorTab('page'); setInspectorCollapsed(false); }}
                    className="text-[11px] font-bold text-sky-400 hover:text-sky-300 underline"
                  >
                    Open in Inspector →
                  </button>
                </div>

                <div className="pt-2 border-t border-slate-800">
                  <span className="text-[11px] font-bold text-slate-300 block mb-2">📰 Article Layout Blocks:</span>
                  <button
                    type="button"
                    className="studio-tool-btn ocean w-full mb-2"
                    onClick={() => {
                      const isDark = !activePage?.background?.value ||
                        (activePage.background?.value && activePage.background.value.includes('gradient')) ||
                        ['#064e3b', '#0f172a', '#090d16', '#1e1b4b', '#450a0a'].some((c) =>
                          (activePage?.background?.value || '').toLowerCase().includes(c)
                        );
                      addElement({
                        type: 'article',
                        kicker: 'PACIFIC CONSERVATION INITIATIVE',
                        subtitle: 'Community-led marine sanctuaries expand biodiversity across the archipelago.',
                        content:
                          'The warm afternoon breeze drifted across the coral reef, carrying the sound of gentle waves breaking over the outer barrier. In recent years, local marine conservation reserves have revived coral biodiversity across the island coastlines.\n\nVisitors and researchers from around the world gather to witness firsthand how community-led ecological stewardship creates sustainable balance. Every participant contributes to coral planting nurseries guided by village elders.',
                        columns: 2,
                        columnGutter: 24,
                        dropCap: true,
                        authorName: 'Alisi Tavua',
                        authorRole: 'Marine Ecology Fellow',
                        authorAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200',
                        w: 500,
                        h: 240,
                        style: { fontSize: 13, color: isDark ? '#FFFFFF' : '#1E293B', lineHeight: 1.6 },
                      });
                    }}
                  >
                    <span>📰</span> 2-Column Article (Drop-Cap + Byline)
                  </button>

                  <button
                    type="button"
                    className="studio-tool-btn ocean w-full mb-2"
                    onClick={() => {
                      const isDark = !activePage?.background?.value ||
                        (activePage.background?.value && activePage.background.value.includes('gradient')) ||
                        ['#064e3b', '#0f172a', '#090d16', '#1e1b4b', '#450a0a'].some((c) =>
                          (activePage?.background?.value || '').toLowerCase().includes(c)
                        );
                      addElement({
                        type: 'article',
                        kicker: 'GLOBAL TRADE DIGEST',
                        content:
                          'Pacific trade networks are experiencing unprecedented digital connectivity. Mobile payment systems and instant inventory sync allow artisans to reach global markets without leaving village shores.\n\nEco-friendly transport and cold-chain solar hubs ensure fresh harvests arrive at five-star resorts within hours of morning picking.',
                        columns: 3,
                        columnGutter: 18,
                        w: 515,
                        h: 200,
                        style: { fontSize: 12, color: isDark ? '#FFFFFF' : '#1E293B', lineHeight: 1.55 },
                      });
                    }}
                  >
                    <span>🗞️</span> 3-Column Magazine Spread
                  </button>

                  <button
                    type="button"
                    className="studio-tool-btn orchid w-full mb-2"
                    onClick={() =>
                      addElement({
                        type: 'text',
                        content: 'BY ALISI TAVUA • SENIOR ENVIRONMENTAL FELLOW',
                        authorName: 'Alisi Tavua',
                        authorRole: 'Senior Environmental Fellow',
                        authorAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200',
                        w: 360,
                        h: 40,
                        style: { fontSize: 11, fontWeight: 'bold', color: '#0284C7', letterSpacing: '1px' },
                      })
                    }
                  >
                    <span>✍️</span> Author Byline with Tag
                  </button>

                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    <button
                      type="button"
                      className="studio-tool-btn sunset w-full"
                      onClick={handleAutoGenerateToc}
                    >
                      <span>📑</span> Insert TOC
                    </button>
                    <button
                      type="button"
                      className="studio-tool-btn cosmic w-full"
                      onClick={handleAddRunningFolio}
                    >
                      <span>📄</span> Add Folio
                    </button>
                  </div>
                </div>

                {/* Stage 6: Master Pages & Dynamic Running Headers */}
                <div className="pt-2 border-t border-slate-800">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-bold text-slate-200">👑 Master Pages &amp; Folios</span>
                    <span className="text-[10px] text-sky-400 font-bold uppercase">Dynamic Tokens</span>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-normal mb-2.5">
                    Auto-substitutes <code className="text-sky-300 font-mono text-[9px]">&#123;page&#125;</code>, <code className="text-sky-300 font-mono text-[9px]">&#123;total&#125;</code>, and <code className="text-sky-300 font-mono text-[9px]">&#123;title&#125;</code>.
                  </p>
                  <div className="grid grid-cols-1 gap-1.5 mb-2">
                    <button
                      type="button"
                      className="studio-tool-btn cosmic text-left justify-start"
                      onClick={() => handleApplyMasterPage('editorial', true)}
                      title="Apply Editorial Master Layout (Header rule + Folio) to All Pages"
                    >
                      <span>📰</span> Apply Editorial Master (All Pages)
                    </button>
                    <button
                      type="button"
                      className="studio-tool-btn ocean text-left justify-start"
                      onClick={() => handleApplyMasterPage('minimal', true)}
                      title="Apply Clean Minimal Header/Footer to All Pages"
                    >
                      <span>✨</span> Apply Minimalist Master (All Pages)
                    </button>
                    <button
                      type="button"
                      className="studio-tool-btn sunset text-left justify-start"
                      onClick={() => handleApplyMasterPage('spread', false)}
                      title="Apply Alternating Outer Folios to Current Page"
                    >
                      <span>📖</span> Apply Spread Folio (Current Page)
                    </button>
                  </div>
                </div>

                {/* Stage 6: 1-Tap Linked Multi-Page Story Generator */}
                <div className="pt-2 border-t border-slate-800">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-bold text-slate-200">🔗 Linked Multi-Page Story</span>
                    <span className="text-[10px] text-sky-400 font-bold uppercase">Overflow Flow</span>
                  </div>
                  <button
                    type="button"
                    className="studio-tool-btn cosmic text-left justify-start w-full"
                    onClick={async () => {
                      const timestamp = Date.now();
                      const parentId = `story_head_${timestamp}`;
                      const continuationId = `story_cont_${timestamp}`;
                      const targetIdx = activePageIndex + 1;

                      // Long editorial article text that demonstrates natural overflow
                      const fullArticle =
                        'THE REVITALIZATION OF PACIFIC CORAL ARCHIPELAGOS\n\n' +
                        'Throughout the vast expanse of the South Pacific, marine biologist cooperatives and island elders have pioneered a groundbreaking model of community-managed marine protected areas. Traditional protocols, refined over centuries of seafaring navigation, are now paired with high-resolution satellite thermal telemetry to map bleaching anomalies in real time.\n\n' +
                        'During recent warm-water pulses, elder navigators identified deep-water upwelling channels where cooler sub-thermocline currents shield juvenile corals from heat stress. Divers harvested micro-fragments of heat-resilient Porites and Acropora strains, anchoring them onto bio-composite reef matrices woven from local coconut coir and non-toxic calcium carbonate binding mortars.\n\n' +
                        'Within eight months, juvenile polyps established robust calcification zones, attracting herbivorous parrotfish and grazing surgeonfish whose natural feeding behavior prevents macro-algal overgrowth. Village youths receive specialized eco-tourism certification, leading low-impact guided snorkeling expeditions that generate sustainable revenue for community clinics and primary education.\n\n' +
                        'As regional governments prepare submissions for international biodiversity treaties, this harmonious fusion of ancestral guardianship and ecological science serves as an enduring blueprint for island resilience in the twenty-first century.';

                      // Frame on current page
                      addElement({
                        id: parentId,
                        type: 'column_text',
                        content: fullArticle,
                        columns: 2,
                        columnGutter: 22,
                        dropCap: true,
                        w: 515,
                        h: 360,
                        x: 40,
                        y: 120,
                        linkedNextId: continuationId,
                        style: { fontSize: 13, color: '#334155', lineHeight: 1.6 },
                      });

                      // Auto-create next page and continuation frame
                      let updated = [...pages];
                      if (targetIdx >= updated.length) {
                        updated.push({
                          id: timestamp + 1,
                          document_id: currentDoc?.id || 1,
                          page_number: updated.length + 1,
                          elements: [],
                          background: { type: 'color', value: '#FFFFFF' },
                        });
                      }

                      const continuationEl: CanvasElement = {
                        id: continuationId,
                        type: 'column_text',
                        content: '', // pulled automatically from overflow!
                        columns: 2,
                        columnGutter: 22,
                        dropCap: false,
                        w: 515,
                        h: 360,
                        x: 40,
                        y: 80,
                        linkedPrevId: parentId,
                        style: { fontSize: 13, color: '#334155', lineHeight: 1.6 },
                      };

                      updated = updated.map((pg, pIdx) => {
                        if (pIdx === targetIdx) {
                          return { ...pg, elements: [...pg.elements, continuationEl] };
                        }
                        return pg;
                      });

                      setPages(updated);
                      pushHistory(updated);
                      alert('Created linked 2-page article story! Text flows automatically across pages.');
                    }}
                  >
                    <span>⚡</span> 1-Tap Linked 2-Page Story Spread
                  </button>
                </div>
              </div>
            )}

            {/* TAB: YEARBOOK (SCHOOL & UNIVERSITY) */}
            {activeToolTab === 'yearbook' && (
              <div className="space-y-3">
                <div className="studio-info-callout orchid">
                  <p className="font-bold mb-1">🎓 School &amp; Class Yearbooks</p>
                  <p className="text-[11px] leading-relaxed opacity-90">
                    Graduate portrait rosters, academic awards, leadership tags, and senior memorable quotes.
                  </p>
                </div>

                <div className="text-xs font-bold text-slate-300 mb-1 flex items-center justify-between">
                  <span>Roster Grid Presets:</span>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    className="studio-tool-btn orchid"
                    onClick={() => handleAddYearbookGridPreset(4)}
                  >
                    <span>👥</span> 4-Student (2x2)
                  </button>
                  <button
                    type="button"
                    className="studio-tool-btn orchid"
                    onClick={() => handleAddYearbookGridPreset(6)}
                  >
                    <span>👥</span> 6-Student (2x3)
                  </button>
                  <button
                    type="button"
                    className="studio-tool-btn cosmic"
                    onClick={() => handleAddYearbookGridPreset(8)}
                  >
                    <span>👥</span> 8-Student (2x4)
                  </button>
                  <button
                    type="button"
                    className="studio-tool-btn sunset"
                    onClick={() => handleAddYearbookGridPreset(12)}
                  >
                    <span>👥</span> 12-Student (3x4)
                  </button>
                </div>

                <button
                  type="button"
                  className="studio-tool-btn ocean w-full mb-1.5"
                  onClick={() =>
                    addElement({
                      type: 'studentCard',
                      name: 'Mereani Ravula',
                      award: '🏆 Dux of Class 2026',
                      classYear: 'Class of 2026 • Form 7 Arts',
                      quote: 'Integrity, resilience, and curiosity will forever guide our voyage beyond these island shores.',
                      image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
                      src: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
                      photoUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
                      w: 240,
                      h: 290,
                    })
                  }
                >
                  <span>🎓</span> Single Student Profile Card
                </button>

                <button
                  type="button"
                  className="studio-tool-btn sunset"
                  onClick={() =>
                    addElement({
                      type: 'text',
                      content:
                        'Principal’s Address: "To the graduating cohort of 2026, you represent the highest aspirations of our academy. May your integrity guide your endeavors across higher learning and our island communities."',
                      w: 500,
                      h: 90,
                      style: {
                        fontSize: 13,
                        lineHeight: 1.6,
                        fontStyle: 'italic',
                        color: '#334155',
                        backgroundColor: '#F8FAFC',
                        borderRadius: 12,
                        padding: '12px',
                      },
                    })
                  }
                >
                  <span>📜</span> Principal’s Commendation Box
                </button>

                {/* Bulk Roster CSV Ingestion */}
                <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-2 mt-2">
                  <span className="font-bold text-xs text-white block">📊 Bulk CSV Graduate Import</span>
                  <p className="text-[10px] text-slate-400">
                    Import full cohorts with photos, awards, and quotes. Auto-paginates across pages.
                  </p>

                  <div className="flex items-center justify-between text-[11px] pt-1">
                    <span className="text-slate-400">Cards Per Page:</span>
                    <select
                      value={yearbookPerPage}
                      onChange={(e) => setYearbookPerPage(Number(e.target.value) as any)}
                      className="studio-prop-select"
                      style={{ width: '110px', padding: '3px 6px', fontSize: '11px' }}
                    >
                      <option value={4}>4 / page</option>
                      <option value={6}>6 / page</option>
                      <option value={8}>8 / page</option>
                      <option value={12}>12 / page</option>
                    </select>
                  </div>

                  <input
                    type="file"
                    accept=".csv,text/csv"
                    ref={rosterFileInputRef}
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (re) => {
                        if (typeof re.target?.result === 'string') {
                          handleYearbookMultiPageCsv(re.target.result, yearbookPerPage);
                        }
                      };
                      reader.readAsText(file);
                    }}
                  />

                  <button
                    type="button"
                    onClick={() => rosterFileInputRef.current?.click()}
                    className="studio-gradient-btn orchid w-full py-2 text-xs font-bold rounded-lg mt-1"
                  >
                    📁 Upload Roster CSV File
                  </button>
                </div>
              </div>
            )}

            {/* TAB: ALBUM (KEEPSAKE PHOTO ALBUM) */}
            {activeToolTab === 'album' && (
              <div className="space-y-3">
                <div className="studio-info-callout orchid">
                  <p className="font-bold mb-1">📷 Keepsake Photo Albums</p>
                  <p className="text-[11px] leading-relaxed opacity-90">
                    Romantic scrapbooks, polaroid photo frames with tilt rotation, and memory captions.
                  </p>
                </div>

                {/* Bulk Photo Ingestion Dropzone */}
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  ref={albumFileInputRef}
                  style={{ display: 'none' }}
                  onChange={handleBulkPhotoSelect}
                />
                <div
                  className="studio-bulk-dropzone"
                  onClick={() => albumFileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const files = Array.from(e.dataTransfer.files || []);
                    if (files.length > 0) {
                      files.forEach((file) => {
                        const reader = new FileReader();
                        reader.onload = (re) => {
                          if (re.target?.result) {
                            setStagedAlbumPhotos((prev) => [
                              ...prev,
                              {
                                url: re.target!.result as string,
                                caption: file.name.replace(/\.[^/.]+$/, ''),
                                tilt: Math.floor(Math.random() * 7) - 3,
                              },
                            ]);
                          }
                        };
                        reader.readAsDataURL(file);
                      });
                    }
                  }}
                >
                  <span className="text-2xl block mb-1">📁</span>
                  <strong className="text-xs text-white block">Bulk Ingest Photos</strong>
                  <span className="text-[10px] text-slate-400">Drag &amp; drop or click to stage multiple pictures</span>
                </div>

                {/* Staged Photos Preview Grid */}
                {stagedAlbumPhotos.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-slate-300">
                      <span>📸 Staged ({stagedAlbumPhotos.length}):</span>
                      <button
                        type="button"
                        onClick={() => setStagedAlbumPhotos([])}
                        className="text-red-400 hover:underline text-[10px]"
                      >
                        Clear All
                      </button>
                    </div>
                    <div className="studio-staged-grid">
                      {stagedAlbumPhotos.map((p, idx) => (
                        <div key={idx} className="studio-staged-thumb">
                          <img src={p.url} alt={p.caption || `Photo ${idx + 1}`} />
                          <button
                            type="button"
                            className="studio-staged-thumb-remove"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveStagedPhoto(idx);
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <span className="text-xs font-bold text-slate-300 block pt-1">4 Instant Collage Generators:</span>

                <button
                  type="button"
                  className="studio-tool-btn orchid"
                  onClick={handleAddPolaroidScatter}
                >
                  <span>🎞️</span> Polaroid Scatter (Tilt &amp; White Borders)
                </button>

                <button
                  type="button"
                  className="studio-tool-btn cosmic"
                  onClick={handleAddModernMosaic}
                >
                  <span>🖼️</span> Modern Mosaic (Asymmetric Masonry)
                </button>

                <button
                  type="button"
                  className="studio-tool-btn sunset"
                  onClick={handleAddCleanGrid}
                >
                  <span>▦</span> Clean 3x3 Photo Grid
                </button>

                <button
                  type="button"
                  className="studio-tool-btn emerald"
                  onClick={handleAddFullBleedHero}
                >
                  <span>🌄</span> Full-Bleed Photo Hero Spread
                </button>
              </div>
            )}

            {/* TAB: TEXT */}
            {activeToolTab === 'text' && (
              <div className="space-y-2.5">
                <button
                  type="button"
                  className="studio-tool-btn cosmic"
                  onClick={() =>
                    addElement({
                      type: 'text',
                      content: 'HERO EDITORIAL TITLE',
                      w: 480,
                      h: 60,
                      style: { fontSize: 32, fontWeight: '800', color: '#0F172A', letterSpacing: '1px' },
                    })
                  }
                >
                  <span style={{ fontSize: '18px', fontWeight: 800 }}>H1</span> Large Display Heading
                </button>

                <button
                  type="button"
                  className="studio-tool-btn ocean"
                  onClick={() =>
                    addElement({
                      type: 'text',
                      content: 'Feature Category Subheading',
                      w: 360,
                      h: 36,
                      style: { fontSize: 20, fontWeight: 'bold', color: '#334155' },
                    })
                  }
                >
                  <span style={{ fontSize: '15px', fontWeight: 700 }}>H2</span> Section Subheading
                </button>

                <button
                  type="button"
                  className="studio-tool-btn"
                  onClick={() =>
                    addElement({
                      type: 'text',
                      content: 'Body paragraph text. Edit this paragraph to describe articles, customer reviews, or product specifications in crisp typography.',
                      w: 340,
                      h: 80,
                      style: { fontSize: 14, color: '#475569', lineHeight: 1.5 },
                    })
                  }
                >
                  <span style={{ fontFamily: 'serif', fontSize: '16px' }}>¶</span> Editorial Body Text
                </button>

                <button
                  type="button"
                  className="studio-tool-btn sunset"
                  onClick={() =>
                    addElement({
                      type: 'text',
                      content: '"From this day forward, our journeys are woven together like coconut sennit along the pacific tide."',
                      w: 400,
                      h: 50,
                      style: { fontSize: 16, fontStyle: 'italic', color: '#64748B', textAlign: 'center' },
                    })
                  }
                >
                  <span style={{ fontStyle: 'italic', fontSize: '16px' }}>“ ”</span> Pull Quote / Memory Note
                </button>
              </div>
            )}

            {/* TAB: MEDIA & ASSET LIBRARY (SPRINT 2) */}
            {activeToolTab === 'media' && (
              <div className="space-y-4">
                {/* Mode Selector: Uploads vs Pacific Library */}
                <div className="grid grid-cols-2 gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setAssetTab('uploads')}
                    className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                      assetTab === 'uploads'
                        ? 'bg-sky-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <span>📁</span>
                    <span>Uploads</span>
                    <span className="text-[10px] bg-slate-950/60 px-1.5 py-0.2 rounded-full font-mono">
                      {tenantAssets.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssetTab('stock')}
                    className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                      assetTab === 'stock'
                        ? 'bg-sky-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <span>🌴</span>
                    <span>Stock Library</span>
                  </button>
                </div>

                {/* Selected Element Replacement Indicator */}
                {selectedElement && (selectedElement.type === 'image' || selectedElement.type === 'imageFrame') && (
                  <div className="bg-sky-950/60 border border-sky-500/40 rounded-xl p-2.5 flex items-center gap-2">
                    <span className="text-sm">🔄</span>
                    <div className="text-[11px] leading-tight text-sky-200">
                      <span className="font-bold text-white">Replacing Selected Image:</span> Click any asset below to swap it in-place.
                    </div>
                  </div>
                )}

                {/* Search Bar */}
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs">🔍</span>
                  <input
                    type="text"
                    value={assetSearch}
                    onChange={(e) => setAssetSearch(e.target.value)}
                    placeholder={assetTab === 'uploads' ? 'Search your uploads...' : 'Search Pacific stock library...'}
                    className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                  />
                  {assetSearch && (
                    <button
                      type="button"
                      onClick={() => setAssetSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* TAB 1: UPLOADS CONTENT */}
                {assetTab === 'uploads' && (
                  <div className="space-y-3">
                    {/* Upload Dropzone */}
                    <div>
                      <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-700 hover:border-sky-500 rounded-xl p-4 cursor-pointer bg-slate-900/60 transition-colors group">
                        {uploadingAsset ? (
                          <div className="flex flex-col items-center py-2">
                            <div className="animate-spin rounded-full h-6 w-6 border-2 border-sky-400 border-t-transparent mb-2"></div>
                            <span className="text-xs text-sky-300 font-bold">Uploading & Optimising...</span>
                          </div>
                        ) : (
                          <>
                            <span className="text-2xl mb-1 group-hover:scale-110 transition-transform">📤</span>
                            <span className="text-xs text-sky-400 font-semibold">Upload Photo, Logo or Graphic</span>
                            <span className="text-[10px] text-slate-400 mt-0.5">JPG, PNG, WebP, SVG • Max 15MB</span>
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp,image/svg+xml"
                              onChange={handleUploadAsset}
                              className="hidden"
                            />
                          </>
                        )}
                      </label>
                    </div>

                    {/* Uploaded Assets Grid */}
                    {loadingAssets ? (
                      <div className="py-8 text-center text-xs text-slate-400">Loading your media assets...</div>
                    ) : tenantAssets.length === 0 ? (
                      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 text-center">
                        <span className="text-3xl block mb-2 opacity-50">🖼️</span>
                        <div className="text-xs font-bold text-slate-300 mb-1">No Uploaded Assets Yet</div>
                        <div className="text-[11px] text-slate-400 leading-relaxed">
                          Upload high-resolution logos, brand assets, and custom photos to reuse them across all your studio documents.
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 max-h-[380px] overflow-y-auto pr-1">
                        {tenantAssets.map((asset) => (
                          <div
                            key={asset.id}
                            onClick={() => handleInsertAsset(asset)}
                            className="rounded-lg overflow-hidden border border-slate-800 hover:border-sky-500 cursor-pointer group relative bg-slate-950 flex flex-col transition-all hover:shadow-lg hover:shadow-sky-500/10"
                          >
                            <div className="h-24 w-full bg-slate-900 overflow-hidden relative">
                              <img
                                src={asset.file_url || asset.url}
                                alt={asset.asset_name || 'Asset'}
                                className="h-full w-full object-cover group-hover:scale-105 transition-transform"
                                loading="lazy"
                              />
                              <button
                                type="button"
                                title="Delete asset"
                                onClick={(e) => handleDeleteAsset(asset.id, asset.asset_name || 'Asset', e)}
                                className="absolute top-1 right-1 bg-black/80 hover:bg-red-600 text-white rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity text-[10px]"
                              >
                                🗑️
                              </button>
                            </div>
                            <div className="p-1.5 bg-slate-900/90 border-t border-slate-800">
                              <div className="text-[11px] font-medium text-slate-200 truncate" title={asset.asset_name}>
                                {asset.asset_name || 'Uploaded Asset'}
                              </div>
                              <div className="flex items-center justify-between text-[9px] text-slate-400 mt-0.5 font-mono">
                                <span>{asset.width && asset.height ? `${asset.width}×${asset.height}` : 'Vector/Image'}</span>
                                {asset.file_size ? (
                                  <span>{Math.round(asset.file_size / 1024)} KB</span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 2: PACIFIC STOCK LIBRARY */}
                {assetTab === 'stock' && (
                  <div className="space-y-3">
                    {/* Category Filter Pills */}
                    <div className="flex flex-wrap gap-1">
                      {[
                        { id: 'all', label: 'All' },
                        { id: 'retail', label: 'Retail' },
                        { id: 'dining', label: 'Dining' },
                        { id: 'tech', label: 'Tech' },
                        { id: 'realestate', label: 'Property' },
                        { id: 'nature', label: 'Reefs & Ocean' },
                        { id: 'people', label: 'Portraits' },
                        { id: 'badges', label: 'Badges' },
                      ].map((cat) => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setAssetCategory(cat.id)}
                          className={`text-[10px] font-bold px-2 py-1 rounded-md transition-all ${
                            assetCategory === cat.id
                              ? 'bg-sky-600 text-white shadow'
                              : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
                          }`}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>

                    {/* Stock Assets Grid */}
                    {loadingAssets ? (
                      <div className="py-8 text-center text-xs text-slate-400">Loading stock library...</div>
                    ) : stockAssets.length === 0 ? (
                      <div className="py-6 text-center text-xs text-slate-400">No stock assets match your filter.</div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 max-h-[420px] overflow-y-auto pr-1">
                        {stockAssets.map((asset) => (
                          <div
                            key={asset.id}
                            onClick={() => handleInsertAsset(asset)}
                            className="rounded-lg overflow-hidden border border-slate-800 hover:border-sky-500 cursor-pointer group relative bg-slate-950 flex flex-col transition-all hover:shadow-lg hover:shadow-sky-500/10"
                          >
                            <div className="h-24 w-full bg-slate-900 overflow-hidden relative">
                              <img
                                src={asset.file_url || asset.url}
                                alt={asset.name || 'Stock'}
                                className="h-full w-full object-cover group-hover:scale-105 transition-transform"
                                loading="lazy"
                              />
                              <span className="absolute bottom-1 left-1 bg-black/80 px-1.5 py-0.5 rounded text-[8px] text-white font-mono uppercase tracking-wider">
                                {asset.category || 'Stock'}
                              </span>
                            </div>
                            <div className="p-1.5 bg-slate-900/90 border-t border-slate-800">
                              <div className="text-[11px] font-medium text-slate-200 truncate" title={asset.name}>
                                {asset.name}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* TAB: SHAPES & BADGES */}
            {activeToolTab === 'shapes' && (
              <div className="space-y-3">
                <button
                  type="button"
                  className="studio-tool-btn sunset"
                  onClick={() =>
                    addElement({
                      type: 'badge',
                      content: '50% OFF TODAY',
                      w: 140,
                      h: 40,
                      style: {
                        backgroundColor: '#EF4444',
                        color: '#FFFFFF',
                        fontWeight: 'bold',
                        fontSize: 13,
                        borderRadius: 20,
                        textAlign: 'center',
                      },
                    })
                  }
                >
                  <span>🔥</span> Discount Splash Badge
                </button>

                <button
                  type="button"
                  className="studio-tool-btn sunset"
                  onClick={() =>
                    addElement({
                      type: 'badge',
                      content: '⭐ BEST SELLER',
                      w: 130,
                      h: 36,
                      style: {
                        backgroundColor: '#F59E0B',
                        color: '#FFFFFF',
                        fontWeight: 'bold',
                        fontSize: 12,
                        borderRadius: 8,
                        textAlign: 'center',
                      },
                    })
                  }
                >
                  <span>⭐</span> Best Seller Ribbon
                </button>

                <button
                  type="button"
                  className="studio-tool-btn ocean"
                  onClick={() =>
                    addElement({
                      type: 'shape',
                      w: 300,
                      h: 180,
                      style: {
                        backgroundColor: '#1E293B',
                        borderRadius: 16,
                        borderColor: '#334155',
                        borderWidth: 1,
                      },
                    })
                  }
                >
                  <span>🔲</span> Container Box / Card Backdrop
                </button>
              </div>
            )}

            {/* TAB: CSV BATCH IMPORT & INVENTORY SYNC */}
            {activeToolTab === 'csv' && (
              <div className="space-y-3">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs space-y-3">
                  <div>
                    <span className="font-bold text-white block mb-1.5">📊 CSV Workflow Mode</span>
                    <div className="grid grid-cols-3 gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setCsvMode('products');
                          setCsvText(
                            'Name,Price,WasPrice,Badge,Image,WhatsApp,SKU,Description\n' +
                            'Punjas Premium Rice 10kg,$22.50,$26.00,SAVE $3.50,https://images.unsplash.com/photo-1586201375761-83865001e31c?w=500,+6799991234,PUN-10,Fortified long grain rice\n' +
                            'Fiji Fresh Island Bananas,$5.99,$8.50,FRESH,+6799991234,BAN-01,Ripe organic Cavendish bananas\n' +
                            'Pacific Sun Cooking Oil 2L,$11.95,$14.20,HOT DEAL,https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=500,+6799991234,OIL-02,Pure blended vegetable cooking oil\n' +
                            'Rewa Fresh Milk 1L x 6,$16.80,$19.50,BULK BUY,https://images.unsplash.com/photo-1550583724-b2692b85b150?w=500,+6799991234,MLK-06,Pasteurised fresh dairy milk bundle\n' +
                            'Island Gold Pure Honey 500g,$14.50,$18.00,NATURAL,https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=500,+6799991234,HON-05,Wild rainforest raw honey jar\n' +
                            'Coral Coast Sea Salt 1kg,$4.20,$5.50,LOCAL,https://images.unsplash.com/photo-1518110925495-5fe2fda0442c?w=500,+6799991234,SLT-03,Natural mineral sea salt flakes\n' +
                            'Bakehouse Crusty Bread,$3.50,$4.80,FRESH,https://images.unsplash.com/photo-1509440159596-0249088772ff?w=500,+6799991234,BRD-07,Woodfired crusty sourdough loaf\n' +
                            'Pacific Cacao Dark Bar 100g,$6.99,$8.90,SAVE 20%,https://images.unsplash.com/photo-1549007994-cb92caebd54b?w=500,+6799991234,CHOC-08,Single-origin 72% organic dark chocolate'
                          );
                        }}
                        className={`px-1.5 py-1.5 rounded text-[10px] font-bold cursor-pointer transition-all text-center ${
                          csvMode === 'products'
                            ? 'studio-gradient-btn cosmic'
                            : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        Catalogue Grid
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCsvMode('sku_sync');
                          setCsvText(
                            'SKU,Price,WasPrice,Badge,StockStatus\n' +
                            'PUN-10,$19.99,$26.00,SPECIAL 23% OFF,in_stock\n' +
                            'BAN-01,$4.50,$8.50,SUPER DEAL,in_stock\n' +
                            'OIL-02,$9.95,$14.20,SAVE $4.25,low_stock\n' +
                            'MLK-06,$14.20,$19.50,FLASH $5.30 OFF,in_stock\n' +
                            'HON-05,$12.50,$18.00,SAVE $5.50,in_stock'
                          );
                        }}
                        className={`px-1.5 py-1.5 rounded text-[10px] font-bold cursor-pointer transition-all text-center ${
                          csvMode === 'sku_sync'
                            ? 'studio-gradient-btn sunset'
                            : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        SKU Price Sync
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCsvMode('yearbook');
                          setCsvText(
                            'Name,PhotoUrl,Award,Quote,Role\n' +
                            'Alisi Tavua,https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400,Dux of School,"Lead with integrity",Prefect\n' +
                            'Jone Naivalu,https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400,Head Boy,"Honor our elders",Student Council'
                          );
                        }}
                        className={`px-1.5 py-1.5 rounded text-[10px] font-bold cursor-pointer transition-all text-center ${
                          csvMode === 'yearbook'
                            ? 'studio-gradient-btn orchid'
                            : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        Yearbook Rosters
                      </button>
                    </div>
                  </div>

                  {/* Mode-Specific Settings */}
                  {csvMode === 'products' && (
                    <div className="space-y-1.5 p-2 bg-slate-950/80 rounded-lg border border-slate-800">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400 font-semibold">Pagination Layout:</span>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => setCsvPerPage(4)}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              csvPerPage === 4 ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            4 / Page (2x2)
                          </button>
                          <button
                            type="button"
                            onClick={() => setCsvPerPage(6)}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              csvPerPage === 6 ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            6 / Page (2x3)
                          </button>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-500 leading-normal">
                        Auto-creates new document pages if rows exceed the layout capacity.
                      </p>
                    </div>
                  )}

                  {csvMode === 'sku_sync' && (
                    <div className="p-2 bg-amber-950/30 rounded-lg border border-amber-900/40 text-[10px] text-amber-300 leading-relaxed">
                      💡 <b>In-Place Dynamic Price Sync:</b> Updates prices and discount badges on all matching products across every page without changing their positions, photos, or styles.
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-semibold text-slate-300">
                        {csvMode === 'sku_sync' ? 'SKU Pricing CSV Data' : 'CSV Data Rows'}
                      </label>
                      <label className="text-[10px] text-sky-400 hover:text-sky-300 font-bold cursor-pointer">
                        📁 Upload .CSV File
                        <input
                          type="file"
                          accept=".csv,text/csv"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = (evt) => {
                              const text = evt.target?.result as string;
                              if (text) setCsvText(text);
                            };
                            reader.readAsText(file);
                          }}
                        />
                      </label>
                    </div>
                    <textarea
                      rows={7}
                      value={csvText}
                      onChange={(e) => setCsvText(e.target.value)}
                      className="w-full p-2 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[10.5px] text-slate-300 focus:ring-1 focus:ring-sky-500"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleImportCsv}
                    className="studio-gradient-btn cosmic w-full py-2 rounded-lg text-xs font-bold"
                  >
                    {csvMode === 'sku_sync'
                      ? '⚡ Sync Prices Across Document'
                      : `🚀 Auto-Generate Catalogue (${csvPerPage} Per Page)`}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* PAGE MANAGEMENT FOOTER */}
          <div className="p-3 border-t border-slate-800 bg-slate-950 flex items-center justify-between text-xs">
            <span className="text-slate-400 font-medium">Page {activePageIndex + 1} of {pages.length}</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleAddPage}
                className="studio-gradient-btn cosmic"
                style={{
                  padding: '6px 14px',
                  fontSize: '11px',
                  borderRadius: '6px',
                }}
              >
                + Add Page
              </button>
              {pages.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleDeletePage(activePage?.id || 0)}
                  className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-950/40 rounded cursor-pointer"
                  title="Delete current page"
                >
                  🗑️
                </button>
              )}
            </div>
          </div>
        </aside>

        {/* CENTER INTERACTIVE CANVAS WORKSPACE */}
        <main
          ref={mainRef}
          style={{
            minWidth: 0,
            minHeight: 0,
            overflow: 'auto',
            background: 'radial-gradient(ellipse at center, #172033 0%, #090d16 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '36px 20px',
            position: 'relative',
          }}
          onClick={(e) => {
            if (e.target === canvasRef.current || (e.target as HTMLElement)?.id === 'canvas-board') {
              setSelectedElementId(null);
            }
          }}
        >
          {/* Floating Expand Sidebar Button when collapsed */}
          {sidebarCollapsed && (
            <button
              type="button"
              onClick={() => setSidebarCollapsed(false)}
              className="studio-gradient-btn cosmic"
              style={{
                position: 'absolute',
                top: '16px',
                left: '16px',
                zIndex: 35,
                padding: '6px 12px',
                fontSize: '11px',
                borderRadius: '8px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
              }}
              title="Expand Tools Sidebar"
            >
              <span>▶</span> Tools
            </button>
          )}

          {/* Floating Expand Inspector Button when collapsed */}
          {inspectorCollapsed && (
            <button
              type="button"
              onClick={() => setInspectorCollapsed(false)}
              className="studio-gradient-btn ocean"
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                zIndex: 35,
                padding: '6px 12px',
                fontSize: '11px',
                borderRadius: '8px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
              }}
              title="Expand Property Inspector"
            >
              Inspector <span>◀</span>
            </button>
          )}

          {/* Floating Bottom Canvas Viewport Status Indicator */}
          <div
            style={{
              position: 'absolute',
              bottom: '12px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(15, 23, 42, 0.85)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              padding: '4px 14px',
              borderRadius: '20px',
              fontSize: '11px',
              color: '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              zIndex: 30,
              pointerEvents: 'none',
              boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
            }}
          >
            <span style={{ color: '#cbd5e1', fontWeight: 600 }}>
              {currentDoc?.orientation === 'portrait' ? '↕ Portrait' : '↔ Landscape'} ({Math.round(docW)} × {Math.round(docH)} pt)
            </span>
            <span>•</span>
            <span style={{ color: '#a5b4fc', fontWeight: 700 }}>{zoom}% Zoom</span>
            <span>•</span>
            <span>Page {activePageIndex + 1} of {pages.length}</span>
          </div>

          {/* THE PAGE CANVAS (WITH OPTIONAL FACING-PAGES 2-PAGE SPREAD) */}
          {(() => {
            const isSpreadActive = spreadMode && activePageIndex > 0;
            const facingPageIndex = activePageIndex % 2 === 1 ? activePageIndex + 1 : activePageIndex - 1;
            const facingPage = facingPageIndex >= 0 && facingPageIndex < pages.length ? pages[facingPageIndex] : null;
            const isLeft = activePageIndex % 2 === 1;

            const renderFacingCompanion = () => {
              if (facingPage) {
                return (
                  <div
                    onClick={() => {
                      setActivePageIndex(facingPageIndex);
                      setSelectedElementId(null);
                    }}
                    style={{
                      width: `${docW}px`,
                      height: `${docH}px`,
                      transform: `scale(${scale * 0.92})`,
                      transformOrigin: isLeft ? 'left center' : 'right center',
                      background: facingPage.background?.value || '#FFFFFF',
                      boxShadow: '0 25px 65px -12px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.1)',
                      position: 'relative',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      borderRadius: '2px',
                    }}
                    title={`Click to edit Facing Page ${facingPageIndex + 1}`}
                  >
                    {facingPage.elements.map((el) => (
                      <div
                        key={el.id}
                        style={{
                          position: 'absolute',
                          left: `${el.x}px`,
                          top: `${el.y}px`,
                          width: `${el.w}px`,
                          height: `${el.h}px`,
                          fontSize: `${el.style?.fontSize || 12}px`,
                          color: el.style?.color || '#334155',
                          overflow: 'hidden',
                          opacity: 0.85,
                          background: el.style?.backgroundColor,
                        }}
                      >
                        {el.type === 'text' && (el.content || '')}
                        {el.type === 'column_text' && (el.content || '')}
                        {el.type === 'image' && el.src && (
                          <img src={el.src} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        )}
                        {el.type === 'product' && (
                          <div style={{ padding: '6px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px' }}>
                            <div style={{ fontWeight: 700, fontSize: '11px' }}>{el.name}</div>
                            <div style={{ color: '#ef4444', fontWeight: 800 }}>{el.price}</div>
                          </div>
                        )}
                      </div>
                    ))}
                    <div
                      style={{
                        position: 'absolute',
                        bottom: '8px',
                        [isLeft ? 'right' : 'left']: '12px',
                        background: 'rgba(15, 23, 42, 0.85)',
                        color: '#f8fafc',
                        padding: '3px 10px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 700,
                        border: '1px solid #334155',
                      }}
                    >
                      Facing Page {facingPageIndex + 1} ✎
                    </div>
                  </div>
                );
              }

              return (
                <div
                  style={{
                    width: `${docW}px`,
                    height: `${docH}px`,
                    transform: `scale(${scale * 0.92})`,
                    transformOrigin: isLeft ? 'left center' : 'right center',
                    background: '#0b1120',
                    border: '2px dashed #334155',
                    borderRadius: '4px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#64748b',
                    gap: '12px',
                  }}
                >
                  <span style={{ fontSize: '36px' }}>📖</span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#94a3b8' }}>
                    Empty Facing Page ({isLeft ? `Page ${activePageIndex + 2}` : `Page ${activePageIndex}`})
                  </span>
                  <button
                    type="button"
                    onClick={handleAddPage}
                    className="studio-gradient-btn cosmic"
                    style={{ padding: '7px 16px', fontSize: '11px', borderRadius: '8px' }}
                  >
                    + Add Facing Page
                  </button>
                </div>
              );
            };

            const canvasBoard = (
              <div
                id="canvas-board"
                ref={canvasRef}
                onMouseDown={handleCanvasMouseDown}
                style={{
                  width: `${docW}px`,
                  height: `${docH}px`,
                  transform: isSpreadActive ? `scale(${scale * 0.92})` : `scale(${scale})`,
                  transformOrigin: isSpreadActive ? (isLeft ? 'right center' : 'left center') : 'center center',
                  background: activePage?.background?.value || '#FFFFFF',
                  boxShadow: '0 25px 65px -12px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.1)',
                }}
                className="relative transition-transform duration-75 select-none rounded-sm"
              >
            {/* Smart Magnetic Snap Guide Lines (Stage 2) */}
            {activeGuides.map((g, idx) => (
              <div
                key={idx}
                className={`studio-guide-line ${g.type === 'x' ? 'vertical' : 'horizontal'}`}
                style={g.type === 'x' ? { left: `${g.pos}px` } : { top: `${g.pos}px` }}
              />
            ))}

            {/* Rubberband Marquee Selection Box (Stage 2) */}
            {rubberbandBox && (
              <div
                className="studio-rubberband-box"
                style={{
                  left: `${rubberbandBox.x}px`,
                  top: `${rubberbandBox.y}px`,
                  width: `${rubberbandBox.w}px`,
                  height: `${rubberbandBox.h}px`,
                }}
              />
            )}

            {/* 3mm Print Bleed Guides (pink dashed outline) */}
            {showBleed && (
              <div
                style={{
                  position: 'absolute',
                  top: '9px',
                  left: '9px',
                  right: '9px',
                  bottom: '9px',
                  border: '1px dashed #EC4899',
                  pointerEvents: 'none',
                  zIndex: 40,
                }}
              >
                <span className="absolute top-1 left-1.5 text-[9px] font-mono text-pink-500 font-bold opacity-75">
                  Safe Print Margin (3mm)
                </span>
              </div>
            )}

            {/* RENDER ELEMENTS */}
            {activePage?.elements.map((el) => {
              const isSelected = selectedElementIds.includes(el.id);
              const dpiCheck = el.type === 'image' || el.type === 'album_spread' ? calculateElementDpi(el) : null;

              return (
                <div
                  key={el.id}
                  style={{
                    position: 'absolute',
                    left: `${el.x}px`,
                    top: `${el.y}px`,
                    width: `${el.w}px`,
                    height: `${el.h}px`,
                    cursor: 'move',
                    zIndex: isSelected ? 35 : (el.style?.zIndex || 10),
                    outline: isSelected ? '2px solid #0284c7' : 'none',
                    boxShadow: isSelected ? '0 0 0 4px rgba(2, 132, 199, 0.3)' : (el.style?.boxShadow || 'none'),
                    borderRadius: el.shapeType === 'circle' ? '50%' : (el.style?.borderRadius ? `${el.style.borderRadius}px` : undefined),
                    borderWidth: el.style?.borderWidth ? `${el.style.borderWidth}px` : undefined,
                    borderStyle: (el.style?.borderStyle as any) || (el.style?.borderWidth ? 'solid' : undefined),
                    borderColor: el.style?.borderColor,
                    backgroundColor: el.fillType === 'gradient' && el.gradientFill
                      ? buildGradientCss(el.gradientFill.stop1, el.gradientFill.stop2, el.gradientFill.stop3, el.gradientFill.angle)
                      : el.style?.backgroundColor,
                    background: el.fillType === 'gradient' && el.gradientFill
                      ? buildGradientCss(el.gradientFill.stop1, el.gradientFill.stop2, el.gradientFill.stop3, el.gradientFill.angle)
                      : undefined,
                    opacity: el.style?.opacity !== undefined ? el.style.opacity : 1,
                    fontFamily: el.style?.fontFamily,
                    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
                    transformOrigin: 'center center',
                  }}
                  onMouseDown={(e) => handleElementMouseDown(e, el)}
                >
                  {/* Stage 7: Low-DPI Print Warning Pill */}
                  {dpiCheck && dpiCheck.status === 'low' && (
                    <div
                      className="studio-dpi-badge-low"
                      title={`Print warning: ${dpiCheck.dpi} DPI. Less than 150 DPI may appear blurry or pixelated when printed.`}
                    >
                      ⚠️ {dpiCheck.dpi} DPI
                    </div>
                  )}

                  {/* Stage 2: 8 Resize Handles & Rotation Stem/Knob when Selected */}
                  {isSelected && (
                    <>
                      <div className="studio-transform-handle tl" onMouseDown={(e) => handleResizeMouseDown(e, el, 'tl')} />
                      <div className="studio-transform-handle tc" onMouseDown={(e) => handleResizeMouseDown(e, el, 'tc')} />
                      <div className="studio-transform-handle tr" onMouseDown={(e) => handleResizeMouseDown(e, el, 'tr')} />
                      <div className="studio-transform-handle mr" onMouseDown={(e) => handleResizeMouseDown(e, el, 'mr')} />
                      <div className="studio-transform-handle br" onMouseDown={(e) => handleResizeMouseDown(e, el, 'br')} />
                      <div className="studio-transform-handle bc" onMouseDown={(e) => handleResizeMouseDown(e, el, 'bc')} />
                      <div className="studio-transform-handle bl" onMouseDown={(e) => handleResizeMouseDown(e, el, 'bl')} />
                      <div className="studio-transform-handle ml" onMouseDown={(e) => handleResizeMouseDown(e, el, 'ml')} />

                      {/* Rotation Stem & Knob */}
                      <div className="studio-rotate-stem" />
                      <div
                        className="studio-rotate-handle"
                        onMouseDown={(e) => handleRotateMouseDown(e, el)}
                        title="Rotate Element (Hold Shift for 15° steps)"
                      />
                      {rotatingElementId === el.id && (
                        <div className="studio-rotate-tooltip">
                          {Math.round(el.rotation || 0)}°
                        </div>
                      )}
                    </>
                  )}
                  {/* TEXT ELEMENT */}
                  {el.type === 'text' && (() => {
                    const eff = getEffectiveTextForElement(el, activePageIndex + 1);
                    return (
                      <>
                        <div
                          style={{
                            width: '100%',
                            height: '100%',
                            fontSize: `${el.style?.fontSize || 16}px`,
                            fontWeight: el.style?.fontWeight || 'normal',
                            fontStyle: el.style?.fontStyle || 'normal',
                            textDecoration: el.style?.textDecoration || 'none',
                            textTransform: el.style?.textTransform || 'none',
                            textShadow: el.style?.textShadow,
                            color: el.style?.color || '#0F172A',
                            textAlign: el.style?.textAlign || 'left',
                            lineHeight: el.style?.lineHeight || 1.3,
                            letterSpacing: el.style?.letterSpacing,
                            overflow: 'hidden',
                            padding: el.style?.padding ? `${el.style.padding}px` : undefined,
                          }}
                          contentEditable={isSelected}
                          suppressContentEditableWarning
                          onBlur={(e) => updateSelectedElement({ content: e.currentTarget.innerText })}
                        >
                          {eff.text || 'Double click to edit text'}
                        </div>
                        {el.linkedNextId && (
                          <div className="studio-linked-flow-badge" title="Linked to continuation frame: overflow flows forward">
                            🔗 Flowing →
                          </div>
                        )}
                        {el.linkedPrevId && (
                          <div className="studio-linked-flow-badge" style={{ left: '6px', right: 'auto' }} title="Receiving overflow from predecessor frame">
                            🔗 Flow In
                          </div>
                        )}
                      </>
                    );
                  })()}

                  {/* MULTI-COLUMN ARTICLE WITH DROP-CAP (MAGAZINE) */}
                  {(el.type === 'column_text' || el.type === 'article') && (() => {
                    const eff = getEffectiveTextForElement(el, activePageIndex + 1);
                    return (
                      <div className="w-full h-full flex flex-col justify-start overflow-hidden">
                        {el.kicker && (
                          <div className="text-[10px] font-bold tracking-widest text-sky-600 uppercase mb-1 flex-shrink-0">
                            {el.kicker}
                          </div>
                        )}
                        {el.subtitle && (
                          <div className="text-xs font-medium text-slate-500 italic mb-2 flex-shrink-0">
                            {el.subtitle}
                          </div>
                        )}
                        {(el.authorName || el.authorRole || el.authorAvatar) && (
                          <div className="flex items-center gap-2 mb-2 pb-1.5 border-b border-slate-200 flex-shrink-0">
                            {el.authorAvatar && (
                              <img src={el.authorAvatar} alt={el.authorName || 'Author'} className="w-6 h-6 rounded-full object-cover" />
                            )}
                            <div className="text-[10px] leading-tight">
                              <span className="font-bold text-slate-800">{el.authorName || 'Staff Writer'}</span>
                              {el.authorRole && <span className="text-slate-500 ml-1.5">• {el.authorRole}</span>}
                            </div>
                          </div>
                        )}
                        <div
                          style={{
                            width: '100%',
                            flex: 1,
                            columnCount: el.columns || 2,
                            columnGap: `${el.columnGutter || 20}px`,
                            fontSize: `${el.style?.fontSize || 13}px`,
                            color: el.style?.color || '#334155',
                            lineHeight: el.style?.lineHeight || 1.6,
                            overflow: 'hidden',
                            textAlign: el.style?.textAlign || 'justify',
                            fontFamily: el.style?.fontFamily,
                            letterSpacing: el.style?.letterSpacing,
                          }}
                        >
                          {el.dropCap && eff.text ? (
                            <>
                              <span
                                style={{
                                  float: 'left',
                                  fontSize: '48px',
                                  lineHeight: '40px',
                                  paddingTop: '4px',
                                  paddingRight: '8px',
                                  fontWeight: 'bold',
                                  color: el.style?.color || '#0F172A',
                                  fontFamily: 'serif',
                                }}
                              >
                                {eff.text.charAt(0)}
                              </span>
                              {eff.text.slice(1)}
                            </>
                          ) : (
                            eff.text
                          )}
                        </div>
                        {el.linkedNextId && (
                          <div className="studio-linked-flow-badge" title="Linked article column: overflow flows forward">
                            🔗 Flowing →
                          </div>
                        )}
                        {el.linkedPrevId && (
                          <div className="studio-linked-flow-badge" style={{ left: '6px', right: 'auto' }} title="Receiving overflow from predecessor column">
                            🔗 Flow In
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* YEARBOOK GRADUATE PORTRAIT GRID */}
                  {el.type === 'yearbook_grid' && (
                    <div className="w-full h-full grid grid-cols-2 gap-3 p-3 bg-slate-50/80 rounded-2xl border border-slate-200">
                      {(el.students || []).map((s, idx) => (
                        <div key={idx} className="flex gap-2.5 items-center p-2 bg-white rounded-xl shadow-xs border border-slate-100">
                          <img src={s.photoUrl} alt={s.name} className="w-16 h-16 rounded-lg object-cover" />
                          <div className="flex-1 overflow-hidden">
                            <h5 className="font-bold text-xs text-slate-900 truncate">{s.name}</h5>
                            {s.award && (
                              <span className="inline-block px-1.5 py-0.2 bg-amber-100 text-amber-800 text-[9px] font-bold rounded">
                                {s.award}
                              </span>
                            )}
                            {s.quote && (
                              <p className="text-[10px] text-slate-500 italic line-clamp-2 mt-0.5">{s.quote}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* PHOTO ALBUM KEEPSAKE SPREAD */}
                  {el.type === 'album_spread' && (
                    <div className="w-full h-full flex items-center justify-around p-3">
                      {(el.albumPhotos || []).map((pic, idx) => (
                        <div
                          key={idx}
                          style={{
                            transform: `rotate(${pic.tilt || 0}deg)`,
                          }}
                          className={`bg-white p-2.5 shadow-md transition-transform duration-200 ${
                            pic.frameStyle === 'rounded'
                              ? 'rounded-2xl'
                              : pic.frameStyle === 'shadow'
                              ? 'rounded-lg shadow-xl'
                              : 'rounded-sm pb-6'
                          }`}
                        >
                          <img src={pic.url} alt={pic.caption || 'Album'} className="h-44 w-44 object-cover rounded-xs" />
                          {pic.caption && (
                            <p className="text-[11px] text-slate-700 font-serif italic text-center mt-2 truncate max-w-[176px]">
                              {pic.caption}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* TABLE OF CONTENTS ELEMENT */}
                  {el.type === 'toc' && (
                    <div className="w-full h-full bg-white/95 p-6 rounded-2xl border border-slate-200 flex flex-col justify-between shadow-lg">
                      <div>
                        <h3 className="text-xl font-bold text-slate-900 tracking-wider mb-4 border-b pb-2 flex items-center justify-between">
                          <span>{el.content || 'TABLE OF CONTENTS'}</span>
                          <span className="text-[10px] text-sky-600 font-bold uppercase tracking-widest bg-sky-100 px-2.5 py-0.5 rounded-full">Interactive Index</span>
                        </h3>
                        <div className="space-y-3">
                          {(el.tocItems || []).map((item, idx) => (
                            <div
                              key={idx}
                              className="flex items-baseline justify-between text-xs cursor-pointer hover:text-sky-600 transition-colors group"
                              onClick={(e) => {
                                e.stopPropagation();
                                const pNum = item.page_number;
                                if (pNum && pNum >= 1 && pNum <= pages.length) {
                                  setActivePageIndex(pNum - 1);
                                  setSelectedElementId(null);
                                }
                              }}
                              title={`Jump to Page ${item.page_number}`}
                            >
                              <span className="font-semibold text-slate-800 group-hover:text-sky-600 transition-colors">
                                {item.title}
                              </span>
                              <span className="flex-1 mx-2 border-b border-dotted border-slate-400 group-hover:border-sky-400" />
                              <span className="font-mono font-bold text-slate-900 group-hover:text-sky-600">
                                {item.page_number}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-400 text-center uppercase tracking-widest">
                        {currentDoc?.title} • Table of Contents
                      </div>
                    </div>
                  )}

                  {/* RUNNING FOLIO (PAGE NUMBER & HEADER) */}
                  {el.type === 'folio' && (
                    <div className="w-full h-full flex items-center justify-between text-[10px] font-mono text-slate-400 border-t border-slate-200 pt-1">
                      <span>{resolveTokens(el.folioHeader || currentDoc?.title || '', activePageIndex + 1, el.sectionCategory)}</span>
                      {el.folioShowPage && <span>Page {activePageIndex + 1} of {pages.length}</span>}
                    </div>
                  )}

                  {/* IMAGE ELEMENT (STAGE 3 OBJECT FIT & FILTERS) */}
                  {el.type === 'image' && (
                    <div className="w-full h-full relative overflow-hidden" style={{ borderRadius: el.style?.borderRadius ? `${el.style.borderRadius}px` : undefined }}>
                      <img
                        src={el.src}
                        alt={el.caption || 'Studio Element'}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: el.objectFit || 'cover',
                          filter: `brightness(${el.filterBrightness ?? 100}%) contrast(${el.filterContrast ?? 100}%) saturate(${el.filterSaturation ?? 100}%) blur(${el.filterBlur || 0}px) ${el.filterGrayscale ? 'grayscale(100%)' : ''}`,
                        }}
                      />
                      {el.caption && (
                        <div className="absolute bottom-0 inset-x-0 bg-black/60 backdrop-blur-sm p-1.5 text-white text-[11px]">
                          {el.caption}
                        </div>
                      )}
                    </div>
                  )}

                  {/* PRODUCT CARD ELEMENT (STAGE 3 COMMERCIAL SPECS) */}
                  {(el.type === 'product' || el.type === 'productCard') && (
                    <div className="w-full h-full bg-white rounded-2xl border border-slate-200 shadow-md p-3 flex flex-col justify-between overflow-hidden relative text-slate-900">
                      {el.badge && (
                        <div className="absolute top-3 left-3 z-10">
                          <span className="px-2 py-0.5 bg-red-600 text-white rounded text-[10px] font-extrabold uppercase shadow">
                            {el.badge}
                          </span>
                        </div>
                      )}
                      {el.stockStatus && (
                        <div className="absolute top-3 right-3 z-10">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase shadow-xs ${
                              el.stockStatus === 'in_stock'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : el.stockStatus === 'low_stock'
                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                : 'bg-red-100 text-red-800 border border-red-300'
                            }`}
                          >
                            {el.stockStatus === 'in_stock' ? 'In Stock' : el.stockStatus === 'low_stock' ? 'Low Stock' : 'Pre-Order'}
                          </span>
                        </div>
                      )}
                      {(el.image || el.url || el.src || el.assetRef?.url) && (
                        <div className="h-36 w-full rounded-xl overflow-hidden bg-slate-50 mb-2 mt-4 flex-shrink-0">
                          <img
                            src={el.image || el.url || el.src || el.assetRef?.url}
                            alt={el.name || 'Product'}
                            className="w-full h-full"
                            style={{
                              objectFit: el.objectFit || 'cover',
                              filter: `brightness(${el.filterBrightness ?? 100}%) contrast(${el.filterContrast ?? 100}%) saturate(${el.filterSaturation ?? 100}%) blur(${el.filterBlur || 0}px) ${el.filterGrayscale ? 'grayscale(100%)' : ''}`,
                            }}
                          />
                        </div>
                      )}
                      <div>
                        <div className="flex items-center justify-between gap-1">
                          <h4 className="font-bold text-xs line-clamp-2 text-slate-800 flex-1">{el.name || 'Product'}</h4>
                          {el.sku && (
                            <span className="text-[9px] font-mono font-semibold bg-slate-100 text-slate-500 px-1 py-0.5 rounded border border-slate-200 flex-shrink-0">
                              {el.sku}
                            </span>
                          )}
                        </div>
                        {el.description && (
                          <p className="text-[10px] text-slate-500 line-clamp-2 mt-0.5">{el.description}</p>
                        )}
                        {(el.rating || 0) > 0 && (
                          <div className="flex items-center gap-0.5 my-1 text-amber-400 text-xs">
                            {Array.from({ length: 5 }).map((_, starIdx) => (
                              <span key={starIdx}>{starIdx < (el.rating || 0) ? '★' : '☆'}</span>
                            ))}
                            <span className="text-[10px] font-semibold text-slate-500 ml-1">({el.rating}.0)</span>
                          </div>
                        )}
                        <div className="flex items-baseline gap-2 mt-1">
                          <span className="text-base font-extrabold text-red-600">{el.price || '$0.00'}</span>
                          {el.originalPrice && (
                            <span className="text-xs text-slate-400 line-through">{el.originalPrice}</span>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-1.5">
                        <a
                          href={
                            el.whatsappNumber
                              ? `https://wa.me/${el.whatsappNumber.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                                  `Bula! I would like to order: ${el.name || 'Product'} (${el.price || ''}) SKU: ${el.sku || 'N/A'}`
                                )}`
                              : '#'
                          }
                          target={el.whatsappNumber ? '_blank' : undefined}
                          rel="noreferrer"
                          onClick={(e) => {
                            if (!el.whatsappNumber) {
                              e.preventDefault();
                              alert('Configure WhatsApp number in the right inspector to enable 1-tap ordering.');
                            }
                          }}
                          className="flex-1 py-1.5 studio-gradient-btn emerald rounded-lg text-xs font-bold flex items-center justify-center gap-1 shadow-sm text-white no-underline"
                        >
                          <span>💬</span> WhatsApp Order
                        </a>
                        {el.showQrCode && (
                          <div
                            className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-300 flex items-center justify-center text-xs"
                            title="Direct WhatsApp 1-Tap QR Code"
                          >
                            📱
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* STUDENT PROFILE CARD ELEMENT (STAGE 4 YEARBOOK) */}
                  {el.type === 'studentCard' && (
                    <div className="w-full h-full bg-white rounded-2xl border border-slate-200 shadow-md p-4 flex flex-col items-center justify-between overflow-hidden relative text-slate-900 text-center">
                      {el.award && (
                        <div className="absolute top-3 right-3 z-10">
                          <span className="px-2 py-0.5 bg-amber-500 text-white rounded-full text-[9px] font-extrabold uppercase shadow">
                            {el.award}
                          </span>
                        </div>
                      )}
                      <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-sky-500 shadow-md my-2 bg-slate-100 flex-shrink-0">
                        <img
                          src={el.image || el.src || el.photoUrl || el.url || el.assetRef?.url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400'}
                          alt={el.name || 'Student'}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="w-full flex-1 flex flex-col justify-center">
                        <h4 className="font-bold text-sm text-slate-900 truncate">{el.name || 'Student Name'}</h4>
                        {el.classYear && (
                          <span className="text-[10px] font-semibold text-sky-600 uppercase tracking-wider block mt-0.5">
                            {el.classYear}
                          </span>
                        )}
                        {(el.quote || el.description) && (
                          <p className="text-[11px] text-slate-600 font-serif italic line-clamp-3 mt-2 px-2 leading-snug">
                            &ldquo;{el.quote || el.description}&rdquo;
                          </p>
                        )}
                      </div>
                      <div className="w-full pt-2 border-t border-slate-100 text-[10px] font-mono text-slate-400">
                        {currentDoc?.title || 'Graduating Class'}
                      </div>
                    </div>
                  )}

                  {/* SHAPE ELEMENT */}
                  {el.type === 'shape' && (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {el.content && (
                        <span style={{ color: el.style?.color || '#ffffff', fontSize: `${el.style?.fontSize || 14}px`, fontWeight: 'bold' }}>
                          {el.content}
                        </span>
                      )}
                    </div>
                  )}

                  {/* BADGE ELEMENT */}
                  {el.type === 'badge' && (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: `${el.style?.fontSize || 12}px`,
                        fontWeight: el.style?.fontWeight || 'bold',
                        color: el.style?.color || '#FFFFFF',
                      }}
                    >
                      {el.content}
                    </div>
                  )}

                  {/* WHATSAPP BUTTON ELEMENT */}
                  {el.type === 'whatsapp' && (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        fontSize: '13px',
                        color: '#FFFFFF',
                      }}
                    >
                      <span>💬</span> {el.content}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );

        if (!isSpreadActive) {
          return canvasBoard;
        }

        return (
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            {!isLeft && renderFacingCompanion()}
            {!isLeft && <div className="studio-spread-spine" title="Magazine Centerfold Fold Spine" />}
            {canvasBoard}
            {isLeft && <div className="studio-spread-spine" title="Magazine Centerfold Fold Spine" />}
            {isLeft && renderFacingCompanion()}
          </div>
        );
      })()}
    </main>

        {/* RIGHT PROPERTY INSPECTOR (Collapsible) */}
        <aside
          style={{
            width: inspectorCollapsed ? '0px' : '315px',
            minWidth: inspectorCollapsed ? '0px' : '315px',
            maxWidth: inspectorCollapsed ? '0px' : '315px',
            padding: inspectorCollapsed ? '0px' : '16px',
            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            overflowY: 'auto',
            background: '#090d16',
            borderLeft: inspectorCollapsed ? 'none' : '1px solid #1e293b',
            fontSize: '0.78rem',
            zIndex: 20,
            color: '#f8fafc',
          }}
        >
          {/* Top Inspector Tab Selector */}
          <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', background: '#0b1120', padding: '3px', borderRadius: '10px', border: '1px solid #1e293b' }}>
            <button
              type="button"
              onClick={() => setInspectorTab('element')}
              style={{
                flex: 1,
                padding: '7px 4px',
                borderRadius: '7px',
                fontSize: '11px',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s',
                background: inspectorTab === 'element' ? 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)' : 'transparent',
                color: inspectorTab === 'element' ? '#ffffff' : '#94a3b8',
                boxShadow: inspectorTab === 'element' ? '0 2px 8px rgba(14,116,144,0.3)' : 'none',
              }}
            >
              ✏️ Element {selectedElement ? '' : '(None)'}
            </button>
            <button
              type="button"
              onClick={() => setInspectorTab('page')}
              style={{
                flex: 1,
                padding: '7px 4px',
                borderRadius: '7px',
                fontSize: '11px',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s',
                background: inspectorTab === 'page' ? 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)' : 'transparent',
                color: inspectorTab === 'page' ? '#ffffff' : '#94a3b8',
                boxShadow: inspectorTab === 'page' ? '0 2px 8px rgba(2,132,199,0.3)' : 'none',
              }}
            >
              🎨 Page &amp; 3-Gradient
            </button>
          </div>

          {inspectorTab === 'element' ? (
            selectedElement ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="font-bold uppercase tracking-wider text-sky-400 text-[10px]">
                    {selectedElement.type.replace('_', ' ')} Element
                  </span>
                  <button
                    onClick={deleteSelectedElement}
                    className="text-rose-400 hover:text-white hover:bg-rose-950/60 font-bold px-2 py-0.5 rounded cursor-pointer transition-colors text-xs"
                    title="Delete element"
                  >
                    Delete ✕
                  </button>
                </div>

                {/* Position & Size */}
                <div>
                  <label className="studio-prop-label">Position &amp; Dimensions</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }} className="font-mono">
                    <div>
                      <span className="studio-prop-sublabel" style={{ color: '#f8fafc', fontWeight: 800, fontSize: '11px' }}>X (pt)</span>
                      <input
                        type="number"
                        value={selectedElement.x ?? 0}
                        onChange={(e) => updateSelectedElement({ x: parseInt(e.target.value, 10) || 0 })}
                        className="studio-prop-input"
                        style={{ color: '#ffffff', backgroundColor: '#0f172a', border: '1px solid #475569', fontWeight: 700, fontSize: '13px' }}
                      />
                    </div>
                    <div>
                      <span className="studio-prop-sublabel" style={{ color: '#f8fafc', fontWeight: 800, fontSize: '11px' }}>Y (pt)</span>
                      <input
                        type="number"
                        value={selectedElement.y ?? 0}
                        onChange={(e) => updateSelectedElement({ y: parseInt(e.target.value, 10) || 0 })}
                        className="studio-prop-input"
                        style={{ color: '#ffffff', backgroundColor: '#0f172a', border: '1px solid #475569', fontWeight: 700, fontSize: '13px' }}
                      />
                    </div>
                    <div>
                      <span className="studio-prop-sublabel" style={{ color: '#f8fafc', fontWeight: 800, fontSize: '11px' }}>W (pt)</span>
                      <input
                        type="number"
                        value={selectedElement.w ?? 20}
                        onChange={(e) => updateSelectedElement({ w: parseInt(e.target.value, 10) || 20 })}
                        className="studio-prop-input"
                        style={{ color: '#ffffff', backgroundColor: '#0f172a', border: '1px solid #475569', fontWeight: 700, fontSize: '13px' }}
                      />
                    </div>
                    <div>
                      <span className="studio-prop-sublabel" style={{ color: '#f8fafc', fontWeight: 800, fontSize: '11px' }}>H (pt)</span>
                      <input
                        type="number"
                        value={selectedElement.h ?? 20}
                        onChange={(e) => updateSelectedElement({ h: parseInt(e.target.value, 10) || 20 })}
                        className="studio-prop-input"
                        style={{ color: '#ffffff', backgroundColor: '#0f172a', border: '1px solid #475569', fontWeight: 700, fontSize: '13px' }}
                      />
                    </div>
                  </div>
                </div>

                {/* Stage 2: Rotation & Transformation */}
                <div>
                  <label className="studio-prop-label">Rotation & Angle</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={0}
                      max={359}
                      value={selectedElement.rotation || 0}
                      onChange={(e) => updateSelectedElement({ rotation: parseInt(e.target.value, 10) || 0 })}
                      style={{ flex: 1, accentColor: '#0284c7' }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '70px' }}>
                      <input
                        type="number"
                        min={0}
                        max={359}
                        value={selectedElement.rotation || 0}
                        onChange={(e) => updateSelectedElement({ rotation: (parseInt(e.target.value, 10) || 0) % 360 })}
                        className="studio-prop-input"
                        style={{ padding: '4px 6px', textAlign: 'center' }}
                      />
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>°</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => updateSelectedElement({ rotation: ((selectedElement.rotation || 0) + 90) % 360 })}
                      className="studio-tool-btn cosmic"
                      style={{ padding: '5px 8px', fontSize: '11px', whiteSpace: 'nowrap' }}
                      title="Rotate 90 degrees clockwise"
                    >
                      ↺ 90°
                    </button>
                  </div>
                </div>

                {/* Stage 2: Page Alignment */}
                <div>
                  <label className="studio-prop-label">Align to Canvas</label>
                  <div className="grid grid-cols-3 gap-1">
                    <button
                      type="button"
                      onClick={() => updateSelectedElement({ x: 36 })}
                      className="studio-tool-btn cosmic"
                      style={{ padding: '4px 2px', fontSize: '10px' }}
                      title="Align Left (Margin)"
                    >
                      ⇤ Left
                    </button>
                    <button
                      type="button"
                      onClick={() => updateSelectedElement({ x: Math.round((docW - selectedElement.w) / 2) })}
                      className="studio-tool-btn cosmic"
                      style={{ padding: '4px 2px', fontSize: '10px' }}
                      title="Align Center Horizontal"
                    >
                      ↔ Center
                    </button>
                    <button
                      type="button"
                      onClick={() => updateSelectedElement({ x: Math.round(docW - selectedElement.w - 36) })}
                      className="studio-tool-btn cosmic"
                      style={{ padding: '4px 2px', fontSize: '10px' }}
                      title="Align Right (Margin)"
                    >
                      ⇥ Right
                    </button>
                    <button
                      type="button"
                      onClick={() => updateSelectedElement({ y: 36 })}
                      className="studio-tool-btn ocean"
                      style={{ padding: '4px 2px', fontSize: '10px' }}
                      title="Align Top (Margin)"
                    >
                      ⤒ Top
                    </button>
                    <button
                      type="button"
                      onClick={() => updateSelectedElement({ y: Math.round((docH - selectedElement.h) / 2) })}
                      className="studio-tool-btn ocean"
                      style={{ padding: '4px 2px', fontSize: '10px' }}
                      title="Align Middle Vertical"
                    >
                      ↕ Middle
                    </button>
                    <button
                      type="button"
                      onClick={() => updateSelectedElement({ y: Math.round(docH - selectedElement.h - 36) })}
                      className="studio-tool-btn ocean"
                      style={{ padding: '4px 2px', fontSize: '10px' }}
                      title="Align Bottom (Margin)"
                    >
                      ⤓ Bottom
                    </button>
                  </div>
                </div>

                {/* Layer Ordering */}
                <div>
                  <label className="studio-prop-label">Layer Stacking Order</label>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const currentZ = selectedElement.style?.zIndex || 10;
                        updateSelectedElement({
                          style: { ...selectedElement.style, zIndex: Math.min(100, currentZ + 5) },
                        });
                      }}
                      className="studio-tool-btn cosmic"
                      style={{ flex: 1, padding: '6px 0', fontSize: '11px' }}
                    >
                      ▲ Bring Forward
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const currentZ = selectedElement.style?.zIndex || 10;
                        updateSelectedElement({
                          style: { ...selectedElement.style, zIndex: Math.max(1, currentZ - 5) },
                        });
                      }}
                      className="studio-tool-btn ocean"
                      style={{ flex: 1, padding: '6px 0', fontSize: '11px' }}
                    >
                      ▼ Send Backward
                    </button>
                  </div>
                </div>

                {/* ==========================================================
                   STAGE 3 CONTEXTUAL INSPECTOR SUITE
                   ========================================================== */}

                {/* TYPOGRAPHY SUITE */}
                {(selectedElement.type === 'text' || selectedElement.type === 'badge' || selectedElement.type === 'column_text' || selectedElement.type === 'article' || selectedElement.type === 'richText') && (
                  <div className="studio-inspector-section">
                    <span className="studio-section-title">✍️ Typography &amp; Content</span>

                    <div>
                      <label className="studio-prop-label">Text Content</label>
                      <textarea
                        rows={3}
                        value={selectedElement.content || ''}
                        onChange={(e) => updateSelectedElement({ content: e.target.value })}
                        className="studio-prop-textarea"
                        placeholder="Enter text content…"
                      />
                    </div>

                    {/* 9 Google Web-Fonts */}
                    <div>
                      <label className="studio-prop-label">Font Family (Google Web-Fonts)</label>
                      <select
                        value={selectedElement.style?.fontFamily || "'Inter', sans-serif"}
                        onChange={(e) =>
                          updateSelectedElement({
                            style: { ...selectedElement.style, fontFamily: e.target.value },
                          })
                        }
                        className="studio-prop-select"
                      >
                        <option value="'Inter', sans-serif">Modern Sans (Inter)</option>
                        <option value="'Playfair Display', Georgia, serif">Editorial Serif (Playfair)</option>
                        <option value="'Montserrat', sans-serif">Clean Grotesque (Montserrat)</option>
                        <option value="'Lora', serif">Literature Serif (Lora)</option>
                        <option value="'Cinzel', serif">Luxury Roman (Cinzel)</option>
                        <option value="'Oswald', sans-serif">Impact Condensed (Oswald)</option>
                        <option value="'Dancing Script', cursive">Handwritten Script (Dancing)</option>
                        <option value="'Fira Code', monospace">Developer Mono (Fira Code)</option>
                        <option value="'Bebas Neue', cursive">Headline Poster (Bebas)</option>
                      </select>
                    </div>

                    {/* Formatting Action Bar: B, I, U, S, TT */}
                    <div>
                      <label className="studio-prop-label">Formatting &amp; Case</label>
                      <div className="studio-btn-group">
                        <button
                          type="button"
                          onClick={() => {
                            const isBold = selectedElement.style?.fontWeight === '700' || selectedElement.style?.fontWeight === 'bold';
                            updateSelectedElement({
                              style: { ...selectedElement.style, fontWeight: isBold ? '400' : '700' },
                            });
                          }}
                          className={`studio-fmt-btn ${
                            selectedElement.style?.fontWeight === '700' || selectedElement.style?.fontWeight === 'bold' ? 'active' : ''
                          }`}
                          title="Bold (B)"
                        >
                          <b>B</b>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const isItalic = selectedElement.style?.fontStyle === 'italic';
                            updateSelectedElement({
                              style: { ...selectedElement.style, fontStyle: isItalic ? 'normal' : 'italic' },
                            });
                          }}
                          className={`studio-fmt-btn ${selectedElement.style?.fontStyle === 'italic' ? 'active' : ''}`}
                          title="Italic (I)"
                        >
                          <i>I</i>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const isUnder = selectedElement.style?.textDecoration === 'underline';
                            updateSelectedElement({
                              style: { ...selectedElement.style, textDecoration: isUnder ? 'none' : 'underline' },
                            });
                          }}
                          className={`studio-fmt-btn ${selectedElement.style?.textDecoration === 'underline' ? 'active' : ''}`}
                          title="Underline (U)"
                        >
                          <u>U</u>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const isStrike = selectedElement.style?.textDecoration === 'line-through';
                            updateSelectedElement({
                              style: { ...selectedElement.style, textDecoration: isStrike ? 'none' : 'line-through' },
                            });
                          }}
                          className={`studio-fmt-btn ${selectedElement.style?.textDecoration === 'line-through' ? 'active' : ''}`}
                          title="Strikethrough (S)"
                        >
                          <s>S</s>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const isUpper = selectedElement.style?.textTransform === 'uppercase';
                            updateSelectedElement({
                              style: { ...selectedElement.style, textTransform: isUpper ? 'none' : 'uppercase' },
                            });
                          }}
                          className={`studio-fmt-btn ${selectedElement.style?.textTransform === 'uppercase' ? 'active' : ''}`}
                          title="Uppercase (TT)"
                        >
                          aA
                        </button>
                      </div>
                    </div>

                    {/* Text Alignment */}
                    <div>
                      <label className="studio-prop-label">Text Alignment</label>
                      <div className="flex gap-1">
                        {(['left', 'center', 'right', 'justify'] as const).map((align) => (
                          <button
                            key={align}
                            type="button"
                            onClick={() =>
                              updateSelectedElement({
                                style: { ...selectedElement.style, textAlign: align },
                              })
                            }
                            style={{
                              flex: 1,
                              padding: '5px 0',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 700,
                              background:
                                (selectedElement.style?.textAlign || 'left') === align
                                  ? 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)'
                                  : '#1e293b',
                              color:
                                (selectedElement.style?.textAlign || 'left') === align
                                  ? '#ffffff'
                                  : '#94a3b8',
                              border:
                                (selectedElement.style?.textAlign || 'left') === align
                                  ? 'none'
                                  : '1px solid #334155',
                              cursor: 'pointer',
                            }}
                          >
                            {align === 'left' ? '⇤ Left' : align === 'center' ? '≡ Center' : align === 'right' ? '⇥ Right' : '↔ Justify'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Font Size & Weight */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="studio-prop-sublabel">Font Size (px)</span>
                        <input
                          type="number"
                          min={8}
                          max={160}
                          value={selectedElement.style?.fontSize || 16}
                          onChange={(e) =>
                            updateSelectedElement({
                              style: { ...selectedElement.style, fontSize: parseInt(e.target.value, 10) || 12 },
                            })
                          }
                          className="studio-prop-input"
                        />
                      </div>
                      <div>
                        <span className="studio-prop-sublabel">Font Weight</span>
                        <select
                          value={selectedElement.style?.fontWeight || '400'}
                          onChange={(e) =>
                            updateSelectedElement({
                              style: { ...selectedElement.style, fontWeight: e.target.value },
                            })
                          }
                          className="studio-prop-select"
                        >
                          <option value="300">300 - Light</option>
                          <option value="400">400 - Regular</option>
                          <option value="500">500 - Medium</option>
                          <option value="600">600 - SemiBold</option>
                          <option value="700">700 - Bold</option>
                          <option value="900">900 - Black</option>
                        </select>
                      </div>
                    </div>

                    {/* Line Height & Letter Spacing */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="studio-prop-sublabel">Line Height</span>
                        <input
                          type="number"
                          step={0.1}
                          min={0.8}
                          max={3.0}
                          value={selectedElement.style?.lineHeight || 1.3}
                          onChange={(e) =>
                            updateSelectedElement({
                              style: { ...selectedElement.style, lineHeight: parseFloat(e.target.value) || 1.2 },
                            })
                          }
                          className="studio-prop-input"
                        />
                      </div>
                      <div>
                        <span className="studio-prop-sublabel">Letter Spacing (px)</span>
                        <input
                          type="text"
                          value={selectedElement.style?.letterSpacing || 'normal'}
                          onChange={(e) =>
                            updateSelectedElement({
                              style: { ...selectedElement.style, letterSpacing: e.target.value },
                            })
                          }
                          placeholder="e.g. 1px, 2px"
                          className="studio-prop-input font-mono"
                        />
                      </div>
                    </div>

                    {/* Text Color */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="studio-prop-label" style={{ margin: 0 }}>Text Color</label>
                        <button
                          type="button"
                          onClick={() => {
                            const current = (selectedElement.style?.color || '#FFFFFF').toUpperCase();
                            const isDark = current === '#0F172A' || current === '#334155' || current === '#000000' || current === '#1E293B';
                            updateSelectedElement({
                              style: { ...selectedElement.style, color: isDark ? '#FFFFFF' : '#0F172A' },
                            });
                          }}
                          className="text-[10px] text-amber-300 hover:text-amber-200 font-bold cursor-pointer"
                          title="Flip between High-Contrast White and Dark Charcoal"
                        >
                          🌓 Flip Light/Dark
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <input
                          type="color"
                          value={selectedElement.style?.color && selectedElement.style.color.startsWith('#') ? selectedElement.style.color : '#FFFFFF'}
                          onChange={(e) =>
                            updateSelectedElement({
                              style: { ...selectedElement.style, color: e.target.value },
                            })
                          }
                          className="w-8 h-8 rounded border border-slate-700 bg-slate-900 cursor-pointer p-0.5"
                        />
                        <input
                          type="text"
                          value={selectedElement.style?.color || '#FFFFFF'}
                          onChange={(e) =>
                            updateSelectedElement({
                              style: { ...selectedElement.style, color: e.target.value },
                            })
                          }
                          className="studio-prop-input font-mono uppercase text-xs"
                          style={{ color: '#ffffff', backgroundColor: '#0f172a', border: '1px solid #475569', fontWeight: 700 }}
                        />
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {[
                          { label: 'White', color: '#FFFFFF', border: '#cbd5e1' },
                          { label: 'Dark Slate', color: '#0F172A', border: '#475569' },
                          { label: 'Amber Gold', color: '#F59E0B', border: '#d97706' },
                          { label: 'Sky Blue', color: '#0284C7', border: '#0369a1' },
                          { label: 'Emerald Green', color: '#10B981', border: '#059669' },
                          { label: 'Pacific Ocean', color: '#0284C7', border: '#0369a1' },
                          { label: 'Coral Crimson', color: '#EF4444', border: '#dc2626' },
                        ].map((sw) => (
                          <button
                            key={sw.color}
                            type="button"
                            onClick={() => updateSelectedElement({ style: { ...selectedElement.style, color: sw.color } })}
                            style={{
                              backgroundColor: sw.color,
                              border: `1.5px solid ${(selectedElement.style?.color || '#FFFFFF').toUpperCase() === sw.color ? '#ec4899' : sw.border}`,
                              width: '22px',
                              height: '22px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              boxShadow: (selectedElement.style?.color || '#FFFFFF').toUpperCase() === sw.color ? '0 0 0 2px #ec4899' : 'none',
                            }}
                            title={sw.label}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Text Shadow Preset */}
                    <div>
                      <label className="studio-prop-label">Text Shadow / Glow</label>
                      <select
                        value={selectedElement.style?.textShadow || 'none'}
                        onChange={(e) =>
                          updateSelectedElement({
                            style: { ...selectedElement.style, textShadow: e.target.value === 'none' ? undefined : e.target.value },
                          })
                        }
                        className="studio-prop-select"
                        style={{ color: '#ffffff', backgroundColor: '#0f172a', border: '1px solid #475569' }}
                      >
                        <option value="none">None</option>
                        <option value="0 2px 4px rgba(0,0,0,0.5)">Subtle Drop Shadow</option>
                        <option value="0 4px 12px rgba(0,0,0,0.75)">Deep Editorial Drop</option>
                        <option value="0 0 10px rgba(2,132,199,0.75)">Pacific Ocean Glow</option>
                        <option value="0 0 10px rgba(52,211,153,0.75)">Emerald Glow</option>
                        <option value="1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000">Heavy Poster Outline</option>
                      </select>
                    </div>

                    {/* Magazine Multi-Column & Drop-Cap */}
                    {(selectedElement.type === 'column_text' || selectedElement.type === 'article') && (
                      <div className="pt-2 border-t border-slate-800 space-y-2">
                        <div>
                          <label className="studio-prop-label">Editorial Kicker (Top Category)</label>
                          <input
                            type="text"
                            value={selectedElement.kicker || ''}
                            onChange={(e) => updateSelectedElement({ kicker: e.target.value })}
                            className="studio-prop-input uppercase font-bold"
                            style={{ color: '#38bdf8' }}
                            placeholder="e.g. PACIFIC CONSERVATION REPORT"
                          />
                        </div>
                        <div>
                          <label className="studio-prop-label">Deck / Standfirst Subtitle</label>
                          <input
                            type="text"
                            value={selectedElement.subtitle || ''}
                            onChange={(e) => updateSelectedElement({ subtitle: e.target.value })}
                            className="studio-prop-input italic"
                            placeholder="e.g. How community sanctuaries are revitalizing coastal ecosystems."
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="studio-prop-label">Author Name</label>
                            <input
                              type="text"
                              value={selectedElement.authorName || ''}
                              onChange={(e) => updateSelectedElement({ authorName: e.target.value })}
                              className="studio-prop-input"
                              placeholder="e.g. Alisi Tavua"
                            />
                          </div>
                          <div>
                            <label className="studio-prop-label">Author Role</label>
                            <input
                              type="text"
                              value={selectedElement.authorRole || ''}
                              onChange={(e) => updateSelectedElement({ authorRole: e.target.value })}
                              className="studio-prop-input"
                              placeholder="e.g. Marine Biologist"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="studio-prop-label">Author Avatar Photo URL</label>
                          <input
                            type="text"
                            value={selectedElement.authorAvatar || ''}
                            onChange={(e) => updateSelectedElement({ authorAvatar: e.target.value })}
                            className="studio-prop-input"
                            placeholder="https://..."
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <div>
                            <span className="studio-prop-sublabel" style={{ color: '#cbd5e1', fontWeight: 700 }}>Columns</span>
                            <select
                              value={selectedElement.columns || 2}
                              onChange={(e) => updateSelectedElement({ columns: parseInt(e.target.value, 10) })}
                              className="studio-prop-select"
                              style={{ color: '#ffffff', backgroundColor: '#0f172a', border: '1px solid #475569' }}
                            >
                              <option value={1}>1 Column</option>
                              <option value={2}>2 Columns</option>
                              <option value={3}>3 Columns</option>
                            </select>
                          </div>
                          <div>
                            <span className="studio-prop-sublabel" style={{ color: '#cbd5e1', fontWeight: 700 }}>Drop-Cap Initial</span>
                            <button
                              type="button"
                              onClick={() => updateSelectedElement({ dropCap: !selectedElement.dropCap })}
                              className={`w-full py-1.5 rounded font-bold text-xs ${
                                selectedElement.dropCap ? 'studio-gradient-btn cosmic' : 'bg-slate-900 border border-slate-700 text-slate-300'
                              }`}
                            >
                              {selectedElement.dropCap ? 'Drop-Cap ON' : 'Drop-Cap OFF'}
                            </button>
                          </div>
                        </div>
                        <div>
                          <span className="studio-prop-sublabel" style={{ color: '#cbd5e1', fontWeight: 700 }}>Column Gutter Gap (px)</span>
                          <input
                            type="number"
                            min={10}
                            max={60}
                            value={selectedElement.columnGutter || 20}
                            onChange={(e) => updateSelectedElement({ columnGutter: parseInt(e.target.value, 10) || 16 })}
                            className="studio-prop-input"
                            style={{ color: '#ffffff', backgroundColor: '#0f172a', border: '1px solid #475569' }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Stage 6: Linked Text Frame Controls (Overflow Flow) */}
                    {(selectedElement.type === 'text' || selectedElement.type === 'column_text' || selectedElement.type === 'article' || selectedElement.type === 'richText') && (
                      <div className="pt-2.5 border-t border-slate-800 space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="studio-prop-label mb-0">🔗 Linked Frame (Story Flow)</label>
                          {selectedElement.linkedNextId && (
                            <span className="text-[10px] text-emerald-400 font-bold bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-700/50">
                              Active Flow
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 leading-normal">
                          Connect this frame to another text frame across pages so overflowing text flows forward smoothly.
                        </p>

                        <div>
                          <span className="studio-prop-sublabel" style={{ color: '#cbd5e1', fontWeight: 700 }}>Connect Overflow Target</span>
                          <select
                            value={selectedElement.linkedNextId || ''}
                            onChange={(e) => {
                              if (e.target.value) {
                                handleLinkTextFrame(selectedElement.id, e.target.value);
                              } else {
                                handleUnlinkTextFrame(selectedElement.id);
                              }
                            }}
                            className="studio-prop-select"
                            style={{ color: '#ffffff', backgroundColor: '#0f172a', border: '1px solid #475569' }}
                          >
                            <option value="">— Standalone (No Linking) —</option>
                            {pages.flatMap((pg, pIdx) =>
                              pg.elements
                                .filter((el) => (el.type === 'text' || el.type === 'column_text') && el.id !== selectedElement.id)
                                .map((el) => (
                                  <option key={el.id} value={el.id}>
                                    Page {pIdx + 1}: {el.type === 'column_text' ? 'Column Article' : 'Text'} ({el.id.slice(0, 14)})
                                  </option>
                                ))
                            )}
                          </select>
                        </div>

                        <div className="flex gap-1.5 pt-1">
                          <button
                            type="button"
                            onClick={() => handleCreateLinkedContinuationFrame(selectedElement)}
                            className="studio-gradient-btn cosmic w-full py-1.5 rounded text-[11px] font-bold"
                            title="Auto-creates continuation frame on next page and links immediately"
                          >
                            + Flow into Next Page
                          </button>
                          {(selectedElement.linkedNextId || selectedElement.linkedPrevId) && (
                            <button
                              type="button"
                              onClick={() => handleUnlinkTextFrame(selectedElement.id)}
                              className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] font-bold border border-slate-700"
                              title="Break frame link"
                            >
                              Unlink
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* IMAGE FRAME & CREATIVE FILTERS (STAGE 3) */}
                {selectedElement.type === 'image' && (
                  <div className="studio-inspector-section">
                    <span className="studio-section-title">🖼️ Image Frame &amp; Print DPI</span>

                    <div>
                      <label className="studio-prop-label">Image Source URL</label>
                      <input
                        type="text"
                        value={selectedElement.src || ''}
                        onChange={(e) => updateSelectedElement({ src: e.target.value })}
                        className="studio-prop-input"
                        placeholder="https://..."
                      />
                    </div>

                    {/* Unsplash Presets */}
                    <div>
                      <label className="studio-prop-label">Sample Presets</label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {[
                          { label: '🏖️ Tropical Beach', url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80' },
                          { label: '🎧 Tech Gadget', url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&q=80' },
                          { label: '🍹 Luxury Dining', url: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=800&q=80' },
                          { label: '🥦 Fresh Produce', url: 'https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=800&q=80' },
                        ].map((preset) => (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => updateSelectedElement({ src: preset.url })}
                            className="studio-tool-btn ocean"
                            style={{ padding: '4px 6px', fontSize: '10px', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Object-Fit Mode */}
                    <div>
                      <label className="studio-prop-label">Object Fit &amp; Scaling</label>
                      <div className="grid grid-cols-3 gap-1">
                        {(['cover', 'contain', 'fill'] as const).map((fit) => (
                          <button
                            key={fit}
                            type="button"
                            onClick={() => updateSelectedElement({ objectFit: fit })}
                            className={`studio-fmt-btn ${ (selectedElement.objectFit || 'cover') === fit ? 'active' : '' }`}
                            style={{ fontSize: '10px', textTransform: 'capitalize' }}
                          >
                            {fit === 'cover' ? 'Crop Cover' : fit === 'contain' ? 'Fit Inside' : 'Fill Stretch'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 300 DPI Print Quality Validation Badge */}
                    <div>
                      <label className="studio-prop-label">Print Quality Inspector</label>
                      {(() => {
                        const effectiveDpi = Math.min(300, Math.round((1200 / Math.max(1, selectedElement.w)) * 72));
                        const isPrintReady = effectiveDpi >= 220;
                        return (
                          <div className={`studio-dpi-badge ${isPrintReady ? 'good' : 'warn'}`}>
                            <span>{isPrintReady ? '✅ 300 DPI High-Res Print Quality' : `⚠️ ${effectiveDpi} DPI Standard Screen Res`}</span>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Creative Photo Filters */}
                    <div className="space-y-2 pt-2 border-t border-slate-800">
                      <div className="flex items-center justify-between">
                        <label className="studio-prop-label" style={{ margin: 0 }}>Creative Filters</label>
                        <button
                          type="button"
                          onClick={() =>
                            updateSelectedElement({
                              filterBrightness: 100,
                              filterContrast: 100,
                              filterSaturation: 100,
                              filterGrayscale: false,
                              filterBlur: 0,
                            })
                          }
                          style={{ fontSize: '10px', color: '#0284c7', background: 'none', border: 'none', cursor: 'pointer' }}
                        >
                          Reset Filters
                        </button>
                      </div>

                      <div className="studio-slider-row">
                        <span>Brightness</span>
                        <input
                          type="range"
                          min={50}
                          max={150}
                          value={selectedElement.filterBrightness ?? 100}
                          onChange={(e) => updateSelectedElement({ filterBrightness: parseInt(e.target.value, 10) })}
                          style={{ accentColor: '#0284c7' }}
                        />
                        <span className="font-mono">{selectedElement.filterBrightness ?? 100}%</span>
                      </div>

                      <div className="studio-slider-row">
                        <span>Contrast</span>
                        <input
                          type="range"
                          min={50}
                          max={150}
                          value={selectedElement.filterContrast ?? 100}
                          onChange={(e) => updateSelectedElement({ filterContrast: parseInt(e.target.value, 10) })}
                          style={{ accentColor: '#0284c7' }}
                        />
                        <span className="font-mono">{selectedElement.filterContrast ?? 100}%</span>
                      </div>

                      <div className="studio-slider-row">
                        <span>Saturation</span>
                        <input
                          type="range"
                          min={0}
                          max={200}
                          value={selectedElement.filterSaturation ?? 100}
                          onChange={(e) => updateSelectedElement({ filterSaturation: parseInt(e.target.value, 10) })}
                          style={{ accentColor: '#0284c7' }}
                        />
                        <span className="font-mono">{selectedElement.filterSaturation ?? 100}%</span>
                      </div>

                      <div className="studio-slider-row">
                        <span>Soft Blur</span>
                        <input
                          type="range"
                          min={0}
                          max={10}
                          value={selectedElement.filterBlur ?? 0}
                          onChange={(e) => updateSelectedElement({ filterBlur: parseInt(e.target.value, 10) })}
                          style={{ accentColor: '#0284c7' }}
                        />
                        <span className="font-mono">{selectedElement.filterBlur ?? 0}px</span>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className="studio-prop-sublabel">Grayscale Monochrome</span>
                        <button
                          type="button"
                          onClick={() => updateSelectedElement({ filterGrayscale: !selectedElement.filterGrayscale })}
                          className={`px-3 py-1 rounded text-xs font-bold ${
                            selectedElement.filterGrayscale ? 'studio-gradient-btn cosmic' : 'bg-slate-900 border border-slate-700 text-slate-300'
                          }`}
                        >
                          {selectedElement.filterGrayscale ? 'ON' : 'OFF'}
                        </button>
                      </div>
                    </div>

                    {/* Frame Corner Radius & Border */}
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800">
                      <div>
                        <span className="studio-prop-sublabel">Corner Radius</span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={selectedElement.style?.borderRadius || 0}
                          onChange={(e) =>
                            updateSelectedElement({
                              style: { ...selectedElement.style, borderRadius: parseInt(e.target.value, 10) || 0 },
                            })
                          }
                          className="studio-prop-input"
                        />
                      </div>
                      <div>
                        <span className="studio-prop-sublabel">Border Width</span>
                        <input
                          type="number"
                          min={0}
                          max={20}
                          value={selectedElement.style?.borderWidth || 0}
                          onChange={(e) =>
                            updateSelectedElement({
                              style: { ...selectedElement.style, borderWidth: parseInt(e.target.value, 10) || 0 },
                            })
                          }
                          className="studio-prop-input"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* VECTOR SHAPES & 3-GRADIENT SUITE (STAGE 3) */}
                {selectedElement.type === 'shape' && (
                  <div className="studio-inspector-section">
                    <span className="studio-section-title">🔶 Vector Geometry &amp; 3-Gradient Fill</span>

                    {/* Shape Geometry */}
                    <div>
                      <label className="studio-prop-label">Shape Geometry</label>
                      <div className="grid grid-cols-3 gap-1">
                        {[
                          { id: 'rectangle', label: 'Rectangle' },
                          { id: 'pill', label: 'Pill / Card' },
                          { id: 'circle', label: 'Circle' },
                        ].map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              const bRad = s.id === 'circle' ? 9999 : s.id === 'pill' ? 24 : 0;
                              updateSelectedElement({
                                shapeType: s.id as any,
                                style: { ...selectedElement.style, borderRadius: bRad },
                              });
                            }}
                            className={`studio-fmt-btn ${ (selectedElement.shapeType || 'rectangle') === s.id ? 'active' : '' }`}
                            style={{ fontSize: '10px' }}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Fill Mode: Solid vs 3-Gradient */}
                    <div>
                      <label className="studio-prop-label">Fill Type</label>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => updateSelectedElement({ fillType: 'solid' })}
                          className={`studio-fmt-btn ${ (selectedElement.fillType || 'solid') === 'solid' ? 'active' : '' }`}
                        >
                          Solid Color
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateSelectedElement({
                              fillType: 'gradient',
                              gradientFill: selectedElement.gradientFill || {
                                stop1: '#0284c7',
                                stop2: '#0369a1',
                                stop3: '#ec4899',
                                angle: 135,
                              },
                            })
                          }
                          className={`studio-fmt-btn ${ selectedElement.fillType === 'gradient' ? 'active' : '' }`}
                        >
                          🎨 3-Gradient Fill
                        </button>
                      </div>
                    </div>

                    {/* If Solid Fill */}
                    {selectedElement.fillType !== 'gradient' ? (
                      <div>
                        <label className="studio-prop-label">Solid Fill Color</label>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="color"
                            value={selectedElement.style?.backgroundColor || '#1E293B'}
                            onChange={(e) =>
                              updateSelectedElement({
                                style: { ...selectedElement.style, backgroundColor: e.target.value },
                              })
                            }
                            className="w-8 h-8 rounded border border-slate-700 bg-slate-900 cursor-pointer p-0.5"
                          />
                          <input
                            type="text"
                            value={selectedElement.style?.backgroundColor || '#1E293B'}
                            onChange={(e) =>
                              updateSelectedElement({
                                style: { ...selectedElement.style, backgroundColor: e.target.value },
                              })
                            }
                            className="studio-prop-input font-mono uppercase text-xs"
                          />
                        </div>
                      </div>
                    ) : (
                      /* If 3-Gradient Fill */
                      <div className="space-y-2.5 pt-1">
                        <div>
                          <label className="studio-prop-label">3 Gradient Color Stops</label>
                          <div className="grid grid-cols-3 gap-1.5">
                            {[1, 2, 3].map((stopIdx) => {
                              const sKey = `stop${stopIdx}` as 'stop1' | 'stop2' | 'stop3';
                              const currentVal =
                                selectedElement.gradientFill?.[sKey] || (stopIdx === 1 ? '#0284c7' : stopIdx === 2 ? '#0369a1' : '#ec4899');
                              return (
                                <div key={stopIdx} className="flex flex-col items-center gap-1 p-1.5 rounded bg-slate-900 border border-slate-800">
                                  <span style={{ fontSize: '9px', color: '#94a3b8' }}>Stop {stopIdx}</span>
                                  <input
                                    type="color"
                                    value={currentVal}
                                    onChange={(e) => {
                                      const prevGrad = selectedElement.gradientFill || { stop1: '#0284c7', stop2: '#0369a1', stop3: '#ec4899', angle: 135 };
                                      updateSelectedElement({
                                        gradientFill: { ...prevGrad, [sKey]: e.target.value },
                                      });
                                    }}
                                    className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent p-0"
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Angle Slider & Compass */}
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="studio-prop-sublabel">Gradient Angle</span>
                            <span className="font-mono text-xs text-sky-400">{selectedElement.gradientFill?.angle ?? 135}°</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={360}
                            value={typeof selectedElement.gradientFill?.angle === 'number' ? selectedElement.gradientFill.angle : 135}
                            onChange={(e) => {
                              const prevGrad = selectedElement.gradientFill || { stop1: '#0284c7', stop2: '#0369a1', stop3: '#ec4899', angle: 135 };
                              updateSelectedElement({
                                gradientFill: { ...prevGrad, angle: parseInt(e.target.value, 10) },
                              });
                            }}
                            style={{ width: '100%', accentColor: '#0284c7' }}
                          />

                          {/* 8-Direction Quick Angle Buttons */}
                          <div className="grid grid-cols-4 gap-1 mt-1.5">
                            {[
                              { label: '0° ⬆', deg: 0 },
                              { label: '45° ↗', deg: 45 },
                              { label: '90° ➡', deg: 90 },
                              { label: '135° ↘', deg: 135 },
                              { label: '180° ⬇', deg: 180 },
                              { label: '225° ↙', deg: 225 },
                              { label: '270° ⬅', deg: 270 },
                              { label: 'Radial', deg: 'radial' as any },
                            ].map((dir) => (
                              <button
                                key={dir.label}
                                type="button"
                                onClick={() => {
                                  const prevGrad = selectedElement.gradientFill || { stop1: '#0284c7', stop2: '#0369a1', stop3: '#ec4899', angle: 135 };
                                  updateSelectedElement({
                                    gradientFill: { ...prevGrad, angle: dir.deg },
                                  });
                                }}
                                className="studio-tool-btn cosmic"
                                style={{ padding: '3px 2px', fontSize: '9px' }}
                              >
                                {dir.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* 3-Gradient Presets */}
                        <div>
                          <label className="studio-prop-label">Gradient Presets</label>
                          <div className="grid grid-cols-2 gap-1.5">
                            {GRADIENT_PRESETS.slice(0, 4).map((p) => (
                              <button
                                key={p.name}
                                type="button"
                                onClick={() => {
                                  updateSelectedElement({
                                    gradientFill: { stop1: p.stop1, stop2: p.stop2, stop3: p.stop3, angle: p.angle },
                                  });
                                }}
                                style={{
                                  padding: '5px 8px',
                                  borderRadius: '6px',
                                  fontSize: '10px',
                                  fontWeight: 600,
                                  color: '#ffffff',
                                  background: buildGradientCss(p.stop1, p.stop2, p.stop3, p.angle),
                                  border: '1px solid rgba(255,255,255,0.2)',
                                  textAlign: 'left',
                                  cursor: 'pointer',
                                }}
                              >
                                {p.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Borders & Styling */}
                    <div className="space-y-2 pt-2 border-t border-slate-800">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="studio-prop-sublabel">Border Style</span>
                          <select
                            value={selectedElement.style?.borderStyle || 'solid'}
                            onChange={(e) =>
                              updateSelectedElement({
                                style: { ...selectedElement.style, borderStyle: e.target.value as any },
                              })
                            }
                            className="studio-prop-select"
                          >
                            <option value="solid">Solid</option>
                            <option value="dashed">Dashed</option>
                            <option value="dotted">Dotted</option>
                            <option value="none">None</option>
                          </select>
                        </div>
                        <div>
                          <span className="studio-prop-sublabel">Border Width</span>
                          <input
                            type="number"
                            min={0}
                            max={20}
                            value={selectedElement.style?.borderWidth || 0}
                            onChange={(e) =>
                              updateSelectedElement({
                                style: { ...selectedElement.style, borderWidth: parseInt(e.target.value, 10) || 0 },
                              })
                            }
                            className="studio-prop-input"
                          />
                        </div>
                      </div>

                      <div>
                        <span className="studio-prop-sublabel">Border Color</span>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="color"
                            value={selectedElement.style?.borderColor || '#334155'}
                            onChange={(e) =>
                              updateSelectedElement({
                                style: { ...selectedElement.style, borderColor: e.target.value },
                              })
                            }
                            className="w-8 h-8 rounded border border-slate-700 bg-slate-900 cursor-pointer p-0.5"
                          />
                          <input
                            type="text"
                            value={selectedElement.style?.borderColor || '#334155'}
                            onChange={(e) =>
                              updateSelectedElement({
                                style: { ...selectedElement.style, borderColor: e.target.value },
                              })
                            }
                            className="studio-prop-input font-mono uppercase text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* COMMERCIAL PRODUCT CARD SUITE (STAGE 3) */}
                {(selectedElement.type === 'product' || selectedElement.type === 'productCard') && (
                  <div className="studio-inspector-section">
                    <span className="studio-section-title">🛒 Commercial Product &amp; WhatsApp Specs</span>

                    <div>
                      <label className="studio-prop-label">Product Name / Title</label>
                      <input
                        type="text"
                        value={selectedElement.name || ''}
                        onChange={(e) => updateSelectedElement({ name: e.target.value })}
                        className="studio-prop-input"
                        placeholder="Product title"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="studio-prop-label">Selling Price</label>
                        <input
                          type="text"
                          value={selectedElement.price || ''}
                          onChange={(e) => updateSelectedElement({ price: e.target.value })}
                          className="studio-prop-input font-bold"
                          style={{ color: '#f87171' }}
                          placeholder="$49.00"
                        />
                      </div>
                      <div>
                        <label className="studio-prop-label">Was / Original Price</label>
                        <input
                          type="text"
                          value={selectedElement.originalPrice || ''}
                          onChange={(e) => updateSelectedElement({ originalPrice: e.target.value })}
                          className="studio-prop-input text-slate-400"
                          placeholder="$79.00"
                        />
                      </div>
                    </div>

                    {/* Product SKU */}
                    <div>
                      <label className="studio-prop-label">SKU / Product Code</label>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={selectedElement.sku || ''}
                          onChange={(e) => updateSelectedElement({ sku: e.target.value })}
                          className="studio-prop-input font-mono flex-1 uppercase"
                          placeholder="e.g. SKU-PAC-001"
                        />
                        <button
                          type="button"
                          onClick={() => updateSelectedElement({ sku: `SKU-${Math.random().toString(36).substring(2, 8).toUpperCase()}` })}
                          className="studio-tool-btn ocean"
                          style={{ padding: '4px 8px', fontSize: '10px' }}
                          title="Generate Unique SKU"
                        >
                          🎲 Gen
                        </button>
                      </div>
                    </div>

                    {/* Promo Splash Badge */}
                    <div>
                      <label className="studio-prop-label">Promo Splash Badge</label>
                      <input
                        type="text"
                        value={selectedElement.badge || ''}
                        onChange={(e) => updateSelectedElement({ badge: e.target.value })}
                        className="studio-prop-input font-bold"
                        style={{ color: '#fbbf24' }}
                        placeholder="e.g. HOT DEAL, 40% OFF"
                      />
                      <div className="flex gap-1 mt-1">
                        {['HOT DEAL', 'SAVE 30%', 'NEW', 'FEATURED', 'LIMITED'].map((badgePreset) => (
                          <button
                            key={badgePreset}
                            type="button"
                            onClick={() => updateSelectedElement({ badge: badgePreset })}
                            className="studio-tool-btn cosmic"
                            style={{ padding: '2px 5px', fontSize: '9px' }}
                          >
                            {badgePreset}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Stock Status Selector */}
                    <div>
                      <label className="studio-prop-label">Inventory &amp; Stock Status</label>
                      <select
                        value={selectedElement.stockStatus || 'in_stock'}
                        onChange={(e) => updateSelectedElement({ stockStatus: e.target.value as any })}
                        className="studio-prop-select"
                      >
                        <option value="in_stock">✅ In Stock (Ready to Deliver)</option>
                        <option value="low_stock">⚠️ Low Stock (Hurry Only Few Left)</option>
                        <option value="out_of_stock">❌ Sold Out / Pre-Order</option>
                      </select>
                    </div>

                    {/* Star Rating Selector (1 to 5 stars) */}
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="studio-prop-label" style={{ margin: 0 }}>Customer Star Rating</label>
                        <span className="font-mono text-xs text-amber-400">{selectedElement.rating || 5}.0 / 5</span>
                      </div>
                      <div className="flex gap-1.5 mt-1">
                        {[1, 2, 3, 4, 5].map((starVal) => (
                          <button
                            key={starVal}
                            type="button"
                            onClick={() => updateSelectedElement({ rating: starVal })}
                            className={`studio-star-btn ${ (selectedElement.rating || 5) >= starVal ? 'active' : '' }`}
                          >
                            ★
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Image URL */}
                    <div>
                      <label className="studio-prop-label">Product Image URL</label>
                      <input
                        type="text"
                        value={selectedElement.image || selectedElement.url || ''}
                        onChange={(e) => updateSelectedElement({ image: e.target.value, url: e.target.value })}
                        className="studio-prop-input"
                        placeholder="https://..."
                      />
                      <div className="flex gap-1 mt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setAssetTab('stock');
                            setAssetCategory('retail');
                            setAssetModalOpen(true);
                          }}
                          className="studio-tool-btn ocean w-full text-center"
                          style={{ padding: '4px 8px', fontSize: '10px' }}
                        >
                          🛒 Pick FMCG from Pacific Stock Library
                        </button>
                      </div>
                    </div>

                    {/* WhatsApp 1-Tap Ordering */}
                    <div>
                      <label className="studio-prop-label">WhatsApp Business Number</label>
                      <input
                        type="text"
                        value={selectedElement.whatsappNumber || ''}
                        onChange={(e) => updateSelectedElement({ whatsappNumber: e.target.value })}
                        placeholder="+6799991234"
                        className="studio-prop-input font-mono"
                        style={{ color: '#34d399' }}
                      />
                    </div>

                    {/* Direct QR Code Overlay Toggle */}
                    <div className="flex items-center justify-between pt-1">
                      <div>
                        <span className="studio-prop-sublabel">Direct QR Code on Card</span>
                        <p style={{ fontSize: '10px', color: '#64748b', margin: 0 }}>Renders a 1-tap mobile ordering scan badge</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => updateSelectedElement({ showQrCode: !selectedElement.showQrCode })}
                        className={`px-3 py-1 rounded text-xs font-bold ${
                          selectedElement.showQrCode ? 'studio-gradient-btn cosmic' : 'bg-slate-900 border border-slate-700 text-slate-300'
                        }`}
                      >
                        {selectedElement.showQrCode ? 'QR ON' : 'QR OFF'}
                      </button>
                    </div>

                    {selectedElement.whatsappNumber && (
                      <a
                        href={`https://wa.me/${selectedElement.whatsappNumber.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                          `Bula! I would like to order: ${selectedElement.name || 'Product'} (${selectedElement.price || ''}) SKU: ${selectedElement.sku || 'N/A'}`
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        className="studio-gradient-btn emerald"
                        style={{
                          width: '100%',
                          marginTop: '6px',
                          padding: '7px 12px',
                          fontSize: '11px',
                          textDecoration: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                        }}
                      >
                        <span>💬</span> Test WhatsApp Ordering Link ↗
                      </a>
                    )}
                  </div>
                )}

                {/* STUDENT PROFILE & HONORS (YEARBOOK) */}
                {selectedElement.type === 'studentCard' && (
                  <div className="studio-inspector-section">
                    <span className="studio-section-title">🎓 Student Profile &amp; Honors</span>

                    <div>
                      <label className="studio-prop-label">Student Full Name</label>
                      <input
                        type="text"
                        value={selectedElement.name || ''}
                        onChange={(e) => updateSelectedElement({ name: e.target.value })}
                        className="studio-prop-input font-bold"
                        placeholder="e.g. Mereani Ravula"
                      />
                    </div>

                    <div>
                      <label className="studio-prop-label">Academic Honors / Award</label>
                      <input
                        type="text"
                        value={selectedElement.award || ''}
                        onChange={(e) => updateSelectedElement({ award: e.target.value })}
                        className="studio-prop-input font-bold"
                        style={{ color: '#fbbf24' }}
                        placeholder="e.g. 🏆 Dux of Class 2026"
                      />
                      <div className="flex flex-wrap gap-1 mt-1">
                        {['🏆 Dux of Class', '🥇 Gold Medalist', '⭐ Head Prefect', '🌟 Academic Excellence', '🎖️ Sports Captain'].map((awardPreset) => (
                          <button
                            key={awardPreset}
                            type="button"
                            onClick={() => updateSelectedElement({ award: awardPreset })}
                            className="studio-tool-btn ocean"
                            style={{ padding: '2px 5px', fontSize: '9px' }}
                          >
                            {awardPreset}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="studio-prop-label">Class / Graduation Year</label>
                      <input
                        type="text"
                        value={selectedElement.classYear || ''}
                        onChange={(e) => updateSelectedElement({ classYear: e.target.value })}
                        className="studio-prop-input"
                        placeholder="Class of 2026 • Form 7 Arts"
                      />
                    </div>

                    <div>
                      <label className="studio-prop-label">Farewell Quote / Ambition</label>
                      <textarea
                        value={selectedElement.quote || selectedElement.description || ''}
                        onChange={(e) => updateSelectedElement({ quote: e.target.value, description: e.target.value })}
                        rows={3}
                        className="studio-prop-input"
                        placeholder="&ldquo;Integrity and curiosity pave the path to leadership.&rdquo;"
                      />
                    </div>

                    <div>
                      <label className="studio-prop-label">Portrait Photo URL</label>
                      <input
                        type="text"
                        value={selectedElement.image || selectedElement.src || selectedElement.photoUrl || ''}
                        onChange={(e) =>
                          updateSelectedElement({
                            image: e.target.value,
                            src: e.target.value,
                            photoUrl: e.target.value,
                            assetRef: { source: 'upload', url: e.target.value }
                          })
                        }
                        className="studio-prop-input"
                        placeholder="https://..."
                      />
                      <div className="flex gap-1 mt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setAssetTab('stock');
                            setAssetCategory('yearbook');
                            setAssetModalOpen(true);
                          }}
                          className="studio-tool-btn ocean w-full text-center"
                          style={{ padding: '4px 8px', fontSize: '10px' }}
                        >
                          📷 Pick Portrait from Pacific Stock Library
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* TABLE OF CONTENTS INSPECTOR */}
                {selectedElement.type === 'toc' && (
                  <div className="studio-inspector-section">
                    <span className="studio-section-title">📑 Table of Contents Settings</span>

                    <div>
                      <label className="studio-prop-label">TOC Header Title</label>
                      <input
                        type="text"
                        value={selectedElement.content || 'TABLE OF CONTENTS'}
                        onChange={(e) => updateSelectedElement({ content: e.target.value })}
                        className="studio-prop-input font-bold"
                      />
                    </div>

                    {/* Auto-Sync with Document Pages Button */}
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          const detectedItems: TocItem[] = [];
                          pages.forEach((p, idx) => {
                            const pageNum = idx + 1;
                            let foundTitle = '';
                            for (const el of p.elements || []) {
                              if ((el.type === 'text' || el.type === 'column_text' || el.type === 'article') && el.content) {
                                const fs = el.style?.fontSize || 14;
                                if (fs >= 18 || !foundTitle) {
                                  foundTitle = el.content.split('\n')[0].trim().slice(0, 40);
                                  if (fs >= 18) break;
                                }
                              } else if ((el.type === 'product' || el.type === 'productCard') && el.name) {
                                if (!foundTitle) foundTitle = el.name.slice(0, 40);
                              } else if (el.type === 'studentCard' && el.name) {
                                if (!foundTitle) foundTitle = `Profile: ${el.name.slice(0, 30)}`;
                              }
                            }
                            if (foundTitle && pageNum > 1) {
                              detectedItems.push({
                                page_number: pageNum,
                                title: foundTitle
                              });
                            }
                          });

                          if (detectedItems.length === 0) {
                            for (let i = 2; i <= Math.min(6, pages.length); i++) {
                              detectedItems.push({
                                page_number: i,
                                title: `Feature Section ${i}`
                              });
                            }
                          }

                          updateSelectedElement({ tocItems: detectedItems });
                          alert(`Auto-detected ${detectedItems.length} chapter headings across document pages!`);
                        }}
                        className="studio-tool-btn ocean w-full text-center"
                      >
                        <span>⚡</span> Auto-Detect Headings from All Pages
                      </button>
                    </div>

                    {/* Manual TOC Entry Editor */}
                    <div className="space-y-2 pt-2 border-t border-slate-800">
                      <div className="flex items-center justify-between">
                        <label className="studio-prop-label mb-0">Index Entries ({selectedElement.tocItems?.length || 0})</label>
                        <button
                          type="button"
                          onClick={() => {
                            const currentItems = [...(selectedElement.tocItems || [])];
                            currentItems.push({
                              page_number: Math.min(pages.length, (currentItems.length > 0 ? currentItems[currentItems.length - 1].page_number + 1 : 2)),
                              title: `New Section ${currentItems.length + 1}`
                            });
                            updateSelectedElement({ tocItems: currentItems });
                          }}
                          className="text-[10px] text-sky-400 font-bold hover:underline"
                        >
                          + Add Entry
                        </button>
                      </div>

                      {(selectedElement.tocItems || []).map((tItem, tIdx) => (
                        <div key={tIdx} className="flex gap-1.5 items-center bg-slate-900 p-2 rounded-lg border border-slate-800 text-xs">
                          <input
                            type="number"
                            min={1}
                            max={pages.length}
                            value={tItem.page_number}
                            onChange={(e) => {
                              const updated = [...(selectedElement.tocItems || [])];
                              updated[tIdx] = { ...updated[tIdx], page_number: parseInt(e.target.value, 10) || 1 };
                              updateSelectedElement({ tocItems: updated });
                            }}
                            className="w-12 studio-prop-input text-center font-mono font-bold"
                            title="Page Number"
                          />
                          <input
                            type="text"
                            value={tItem.title}
                            onChange={(e) => {
                              const updated = [...(selectedElement.tocItems || [])];
                              updated[tIdx] = { ...updated[tIdx], title: e.target.value };
                              updateSelectedElement({ tocItems: updated });
                            }}
                            className="flex-1 studio-prop-input"
                            placeholder="Chapter title"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const updated = (selectedElement.tocItems || []).filter((_, i) => i !== tIdx);
                              updateSelectedElement({ tocItems: updated });
                            }}
                            className="text-red-400 hover:text-red-300 font-bold px-1.5"
                            title="Remove entry"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* RUNNING FOLIO (HEADER / FOOTER) INSPECTOR */}
                {selectedElement.type === 'folio' && (
                  <div className="studio-inspector-section">
                    <span className="studio-section-title">📄 Running Folio Settings</span>

                    <div>
                      <label className="studio-prop-label">Header / Publication Title</label>
                      <input
                        type="text"
                        value={selectedElement.folioHeader || ''}
                        onChange={(e) => updateSelectedElement({ folioHeader: e.target.value })}
                        className="studio-prop-input"
                        placeholder="{title} • {category}"
                      />
                      <p style={{ fontSize: '10px', color: '#64748b', margin: '4px 0 0 0' }}>
                        Tokens: &#123;title&#125;, &#123;page&#125;, &#123;total&#125;, &#123;category&#125;
                      </p>
                    </div>

                    <div>
                      <label className="studio-prop-label">Section Category Name</label>
                      <input
                        type="text"
                        value={selectedElement.sectionCategory || ''}
                        onChange={(e) => updateSelectedElement({ sectionCategory: e.target.value })}
                        className="studio-prop-input uppercase"
                        placeholder="e.g. FEATURE STORY, EDITORIAL"
                      />
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="studio-prop-sublabel">Show Page Number Token</span>
                      <button
                        type="button"
                        onClick={() => updateSelectedElement({ folioShowPage: !selectedElement.folioShowPage })}
                        className={`px-3 py-1 rounded text-xs font-bold ${
                          selectedElement.folioShowPage ? 'studio-gradient-btn cosmic' : 'bg-slate-900 border border-slate-700 text-slate-300'
                        }`}
                      >
                        {selectedElement.folioShowPage ? 'PAGE NUM ON' : 'PAGE NUM OFF'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* No element selected empty state */
              <div style={{ textAlign: 'center', padding: '36px 12px' }}>
                <div style={{ fontSize: '32px', marginBottom: '10px' }}>🎯</div>
                <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#f1f5f9', marginBottom: '6px' }}>
                  No Element Selected
                </h4>
                <p style={{ fontSize: '11px', color: '#94a3b8', lineHeight: 1.5, marginBottom: '16px' }}>
                  Click any element on the canvas to inspect and edit its position, font, colors, and content.
                </p>
                <button
                  type="button"
                  onClick={() => setInspectorTab('page')}
                  className="studio-gradient-btn cosmic"
                  style={{ padding: '8px 16px', fontSize: '11px', borderRadius: '8px' }}
                >
                  🎨 Open Page &amp; 3-Gradient Settings
                </button>
              </div>
            )
          ) : (
            /* ==========================================================
               PAGE & 3-GRADIENT STUDIO SUITE
               ========================================================== */
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="font-bold uppercase tracking-wider text-sky-400 text-[10px]">
                  Page {activePageIndex + 1} of {pages.length} Background
                </span>
                <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600 }}>
                  {activePage?.background?.type === 'gradient' ? '3-Gradient' : 'Solid Color'}
                </span>
              </div>

              {/* Background Style Mode Picker */}
              <div style={{ display: 'flex', gap: '4px', background: '#0b1120', padding: '3px', borderRadius: '8px', border: '1px solid #1e293b' }}>
                <button
                  type="button"
                  onClick={() => {
                    setBgMode('gradient');
                    if (activePage?.background?.type !== 'gradient') {
                      const s1 = activePage?.background?.stop1 || '#0284c7';
                      const s2 = activePage?.background?.stop2 || '#0369a1';
                      const s3 = activePage?.background?.stop3 || '#ec4899';
                      const ang = activePage?.background?.angle ?? 135;
                      const css = buildGradientCss(s1, s2, s3, ang);
                      const updated = [...pages];
                      updated[activePageIndex] = {
                        ...updated[activePageIndex],
                        background: { type: 'gradient', value: css, stop1: s1, stop2: s2, stop3: s3, angle: ang },
                      };
                      setPages(updated);
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: '6px 4px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    background: bgMode === 'gradient' ? 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)' : 'transparent',
                    color: bgMode === 'gradient' ? '#ffffff' : '#94a3b8',
                  }}
                >
                  🌈 3-Color Gradient
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBgMode('solid');
                    if (activePage?.background?.type !== 'color') {
                      const updated = [...pages];
                      updated[activePageIndex] = {
                        ...updated[activePageIndex],
                        background: { type: 'color', value: '#FFFFFF' },
                      };
                      setPages(updated);
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: '6px 4px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    background: bgMode === 'solid' ? 'linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%)' : 'transparent',
                    color: bgMode === 'solid' ? '#ffffff' : '#94a3b8',
                  }}
                >
                  🎨 Solid Color
                </button>
              </div>

              {bgMode === 'gradient' ? (
                /* 3-GRADIENT CONTROLS */
                <div className="space-y-3.5">
                  {/* Live Gradient Preview Swatch */}
                  <div>
                    <label className="studio-prop-label">Live Background Preview</label>
                    <div
                      style={{
                        height: '52px',
                        borderRadius: '10px',
                        background: activePage?.background?.value || 'linear-gradient(135deg, #0284c7 0%, #0369a1 50%, #0c4a6e 100%)',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative',
                        overflow: 'hidden',
                      }}
                    >
                      <span
                        style={{
                          background: 'rgba(15, 23, 42, 0.75)',
                          backdropFilter: 'blur(4px)',
                          padding: '3px 10px',
                          borderRadius: '12px',
                          fontSize: '10px',
                          fontWeight: 700,
                          color: '#ffffff',
                          border: '1px solid rgba(255, 255, 255, 0.15)',
                        }}
                      >
                        {activePage?.background?.angle === 'radial' ? 'Radial Center Glow' : `${activePage?.background?.angle ?? 135}° Angle`}
                      </span>
                    </div>
                  </div>

                  {/* Gradient Alignment Options (Compass 3x3 Grid) */}
                  <div>
                    <label className="studio-prop-label">
                      Alignment &amp; Direction (9 Options)
                    </label>
                    <div className="studio-align-grid">
                      {ALIGNMENT_OPTIONS.map((opt) => {
                        const currentAngle = activePage?.background?.angle ?? 135;
                        const isCurrent = currentAngle === opt.angle;
                        return (
                          <button
                            key={String(opt.angle)}
                            type="button"
                            onClick={() => {
                              const s1 = activePage?.background?.stop1 || '#0284c7';
                              const s2 = activePage?.background?.stop2 || '#0369a1';
                              const s3 = activePage?.background?.stop3 || '#ec4899';
                              const css = buildGradientCss(s1, s2, s3, opt.angle);
                              const updated = [...pages];
                              updated[activePageIndex] = {
                                ...updated[activePageIndex],
                                background: {
                                  type: 'gradient',
                                  value: css,
                                  stop1: s1,
                                  stop2: s2,
                                  stop3: s3,
                                  angle: opt.angle,
                                },
                              };
                              setPages(updated);
                            }}
                            className={`studio-align-btn ${isCurrent ? 'active' : ''}`}
                            title={opt.label}
                          >
                            <span style={{ fontSize: '14px', lineHeight: 1 }}>{opt.icon}</span>
                            <span style={{ fontSize: '9px', fontWeight: 700 }}>
                              {opt.angle === 'radial' ? 'Radial' : `${opt.angle}°`}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 3 Color Gradient Stops */}
                  <div>
                    <label className="studio-prop-label">3 Color Gradient Stops</label>
                    <div className="space-y-2">
                      {/* Stop 1 */}
                      <div>
                        <span className="studio-prop-sublabel">Stop 1 (Start 0%)</span>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="color"
                            value={activePage?.background?.stop1 || '#0284c7'}
                            onChange={(e) => {
                              const s1 = e.target.value;
                              const s2 = activePage?.background?.stop2 || '#0369a1';
                              const s3 = activePage?.background?.stop3 || '#ec4899';
                              const ang = activePage?.background?.angle ?? 135;
                              const css = buildGradientCss(s1, s2, s3, ang);
                              const updated = [...pages];
                              updated[activePageIndex] = {
                                ...updated[activePageIndex],
                                background: { type: 'gradient', value: css, stop1: s1, stop2: s2, stop3: s3, angle: ang },
                              };
                              setPages(updated);
                            }}
                            className="w-8 h-8 rounded border border-slate-700 bg-slate-900 cursor-pointer p-0.5"
                          />
                          <input
                            type="text"
                            value={activePage?.background?.stop1 || '#0284c7'}
                            onChange={(e) => {
                              const s1 = e.target.value;
                              const s2 = activePage?.background?.stop2 || '#0369a1';
                              const s3 = activePage?.background?.stop3 || '#ec4899';
                              const ang = activePage?.background?.angle ?? 135;
                              const css = buildGradientCss(s1, s2, s3, ang);
                              const updated = [...pages];
                              updated[activePageIndex] = {
                                ...updated[activePageIndex],
                                background: { type: 'gradient', value: css, stop1: s1, stop2: s2, stop3: s3, angle: ang },
                              };
                              setPages(updated);
                            }}
                            className="studio-prop-input font-mono uppercase text-xs"
                          />
                        </div>
                      </div>

                      {/* Stop 2 */}
                      <div>
                        <span className="studio-prop-sublabel">Stop 2 (Midpoint 50%)</span>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="color"
                            value={activePage?.background?.stop2 || '#0369a1'}
                            onChange={(e) => {
                              const s1 = activePage?.background?.stop1 || '#0284c7';
                              const s2 = e.target.value;
                              const s3 = activePage?.background?.stop3 || '#ec4899';
                              const ang = activePage?.background?.angle ?? 135;
                              const css = buildGradientCss(s1, s2, s3, ang);
                              const updated = [...pages];
                              updated[activePageIndex] = {
                                ...updated[activePageIndex],
                                background: { type: 'gradient', value: css, stop1: s1, stop2: s2, stop3: s3, angle: ang },
                              };
                              setPages(updated);
                            }}
                            className="w-8 h-8 rounded border border-slate-700 bg-slate-900 cursor-pointer p-0.5"
                          />
                          <input
                            type="text"
                            value={activePage?.background?.stop2 || '#0369a1'}
                            onChange={(e) => {
                              const s1 = activePage?.background?.stop1 || '#0284c7';
                              const s2 = e.target.value;
                              const s3 = activePage?.background?.stop3 || '#ec4899';
                              const ang = activePage?.background?.angle ?? 135;
                              const css = buildGradientCss(s1, s2, s3, ang);
                              const updated = [...pages];
                              updated[activePageIndex] = {
                                ...updated[activePageIndex],
                                background: { type: 'gradient', value: css, stop1: s1, stop2: s2, stop3: s3, angle: ang },
                              };
                              setPages(updated);
                            }}
                            className="studio-prop-input font-mono uppercase text-xs"
                          />
                        </div>
                      </div>

                      {/* Stop 3 */}
                      <div>
                        <span className="studio-prop-sublabel">Stop 3 (End 100%)</span>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="color"
                            value={activePage?.background?.stop3 || '#ec4899'}
                            onChange={(e) => {
                              const s1 = activePage?.background?.stop1 || '#0284c7';
                              const s2 = activePage?.background?.stop2 || '#0369a1';
                              const s3 = e.target.value;
                              const ang = activePage?.background?.angle ?? 135;
                              const css = buildGradientCss(s1, s2, s3, ang);
                              const updated = [...pages];
                              updated[activePageIndex] = {
                                ...updated[activePageIndex],
                                background: { type: 'gradient', value: css, stop1: s1, stop2: s2, stop3: s3, angle: ang },
                              };
                              setPages(updated);
                            }}
                            className="w-8 h-8 rounded border border-slate-700 bg-slate-900 cursor-pointer p-0.5"
                          />
                          <input
                            type="text"
                            value={activePage?.background?.stop3 || '#ec4899'}
                            onChange={(e) => {
                              const s1 = activePage?.background?.stop1 || '#0284c7';
                              const s2 = activePage?.background?.stop2 || '#0369a1';
                              const s3 = e.target.value;
                              const ang = activePage?.background?.angle ?? 135;
                              const css = buildGradientCss(s1, s2, s3, ang);
                              const updated = [...pages];
                              updated[activePageIndex] = {
                                ...updated[activePageIndex],
                                background: { type: 'gradient', value: css, stop1: s1, stop2: s2, stop3: s3, angle: ang },
                              };
                              setPages(updated);
                            }}
                            className="studio-prop-input font-mono uppercase text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 8 Pre-Crafted 3-Gradient Presets */}
                  <div>
                    <label className="studio-prop-label">Instant 3-Gradient Presets</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                      {GRADIENT_PRESETS.map((preset) => {
                        const presetCss = buildGradientCss(preset.stop1, preset.stop2, preset.stop3, preset.angle);
                        const isSelected =
                          activePage?.background?.stop1 === preset.stop1 &&
                          activePage?.background?.stop2 === preset.stop2 &&
                          activePage?.background?.stop3 === preset.stop3;
                        return (
                          <div
                            key={preset.name}
                            onClick={() => {
                              const css = buildGradientCss(preset.stop1, preset.stop2, preset.stop3, preset.angle);
                              const updated = [...pages];
                              updated[activePageIndex] = {
                                ...updated[activePageIndex],
                                background: {
                                  type: 'gradient',
                                  value: css,
                                  stop1: preset.stop1,
                                  stop2: preset.stop2,
                                  stop3: preset.stop3,
                                  angle: preset.angle,
                                },
                              };
                              setPages(updated);
                            }}
                            className={`studio-preset-card ${isSelected ? 'active' : ''}`}
                            title={preset.name}
                          >
                            <div
                              style={{
                                height: '24px',
                                borderRadius: '5px',
                                background: presetCss,
                                border: '1px solid rgba(255,255,255,0.1)',
                              }}
                            />
                            <span style={{ fontSize: '10px', fontWeight: 700, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {preset.name}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                /* SOLID COLOR PALETTE */
                <div className="space-y-3">
                  <label className="studio-prop-label">Curated Magazine Colors</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                    {[
                      { name: 'White', color: '#FFFFFF' },
                      { name: 'Warm Cream', color: '#FDFBF7' },
                      { name: 'Slate Light', color: '#F1F5F9' },
                      { name: 'Dark Navy', color: '#0F172A' },
                      { name: 'Midnight', color: '#090D16' },
                      { name: 'Emerald Isle', color: '#064E3B' },
                      { name: 'Pacific Abyss', color: '#0C4A6E' },
                      { name: 'Sunset Crimson', color: '#450A0A' },
                    ].map((bg, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          const updated = [...pages];
                          updated[activePageIndex].background = { type: 'color', value: bg.color };
                          setPages(updated);
                        }}
                        style={{
                          backgroundColor: bg.color,
                          height: '32px',
                          borderRadius: '6px',
                          border: activePage?.background?.value === bg.color ? '2px solid #0284c7' : '1px solid #475569',
                          cursor: 'pointer',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                        }}
                        title={bg.name}
                      />
                    ))}
                  </div>

                  <div>
                    <label className="studio-prop-label">Custom Solid Color</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={activePage?.background?.value && !activePage?.background?.value.includes('gradient') ? activePage.background.value : '#FFFFFF'}
                        onChange={(e) => {
                          const updated = [...pages];
                          updated[activePageIndex].background = { type: 'color', value: e.target.value };
                          setPages(updated);
                        }}
                        className="w-8 h-8 rounded border border-slate-700 bg-slate-900 cursor-pointer p-0.5"
                      />
                      <input
                        type="text"
                        value={activePage?.background?.value && !activePage?.background?.value.includes('gradient') ? activePage.background.value : '#FFFFFF'}
                        onChange={(e) => {
                          const updated = [...pages];
                          updated[activePageIndex].background = { type: 'color', value: e.target.value };
                          setPages(updated);
                        }}
                        className="studio-prop-input font-mono uppercase text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Action: Apply Background to All Pages */}
              <div style={{ paddingTop: '8px', borderTop: '1px solid #1e293b' }}>
                <button
                  type="button"
                  onClick={() => {
                    const currentBg = activePage?.background || {
                      type: 'gradient',
                      value: buildGradientCss('#0284c7', '#0369a1', '#ec4899', 135),
                      stop1: '#0284c7',
                      stop2: '#0369a1',
                      stop3: '#ec4899',
                      angle: 135,
                    };
                    const updated = pages.map((p) => ({
                      ...p,
                      background: { ...currentBg },
                    }));
                    setPages(updated);
                    alert(`✨ Successfully applied background to all ${pages.length} pages!`);
                  }}
                  className="studio-gradient-btn cosmic"
                  style={{ width: '100%', padding: '9px 12px', fontSize: '11px', borderRadius: '8px' }}
                >
                  ✨ Apply to All {pages.length} Pages
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* 3. DEDICATED BOTTOM PAGE STRIP (Stage 1) */}
      <footer
        className="studio-bottom-page-strip"
        style={{
          height: bottomStripCollapsed ? '34px' : '115px',
          minHeight: bottomStripCollapsed ? '34px' : '115px',
          maxHeight: bottomStripCollapsed ? '34px' : '115px',
          transition: 'height 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Strip Header Bar */}
        <div
          style={{
            height: '34px',
            minHeight: '34px',
            background: '#090d16',
            borderBottom: bottomStripCollapsed ? 'none' : '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px',
            fontSize: '11px',
          }}
        >
          {/* Left: Page count, active page info, and + Add Page */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontWeight: 700, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span>📄</span> Pages ({pages.length})
            </span>
            <span style={{ height: '14px', width: '1px', background: '#334155' }} />
            <span style={{ color: '#a5b4fc', fontWeight: 600, fontSize: '10px' }}>
              Active: Page {activePageIndex + 1}
            </span>
            <button
              type="button"
              onClick={handleAddPage}
              className="studio-gradient-btn cosmic"
              style={{
                padding: '3px 10px',
                fontSize: '10px',
                borderRadius: '6px',
                fontWeight: 700,
              }}
              title="Add a new blank page to the end of document"
            >
              + Add Page
            </button>
          </div>

          {/* Right: Toggle Collapse Button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setBottomStripCollapsed(!bottomStripCollapsed)}
              style={{
                padding: '3px 9px',
                borderRadius: '6px',
                background: '#1e293b',
                border: '1px solid #334155',
                color: '#94a3b8',
                cursor: 'pointer',
                fontSize: '10px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
              title={bottomStripCollapsed ? "Expand Page Thumbnails Strip" : "Minimize Strip to Expand Canvas Workspace"}
            >
              {bottomStripCollapsed ? '▲ Expand Strip' : '▼ Minimize Strip'}
            </button>
          </div>
        </div>

        {/* Thumbnail Carousel (when expanded) */}
        {!bottomStripCollapsed && (
          <div className="studio-thumb-scroll" style={{ height: '81px' }}>
            {pages.map((p, idx) => {
              const isActive = idx === activePageIndex;
              const bgVal = p.background?.value || '#FFFFFF';
              const thumbW = currentDoc?.orientation === 'landscape' ? 68 : 46;
              const thumbH = currentDoc?.orientation === 'landscape' ? 46 : 64;

              return (
                <div
                  key={p.id || idx}
                  className={`studio-page-thumb-card ${isActive ? 'active' : ''}`}
                  onClick={() => {
                    setActivePageIndex(idx);
                    setSelectedElementId(null);
                  }}
                  title={`Go to Page ${idx + 1}`}
                >
                  {/* Miniature Live Preview Box */}
                  <div
                    className="studio-page-thumb-preview"
                    style={{
                      width: `${thumbW}px`,
                      height: `${thumbH}px`,
                      background: bgVal,
                    }}
                  >
                    {/* Elements mini indicators */}
                    <div style={{ pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%', opacity: 0.85 }}>
                      <span
                        style={{
                          fontSize: '9px',
                          fontWeight: 800,
                          color: bgVal.includes('0F172A') || bgVal.includes('090D16') || bgVal.includes('1E1B4B') || bgVal.includes('gradient') ? '#ffffff' : '#1e293b',
                          background: 'rgba(0,0,0,0.25)',
                          padding: '1px 4px',
                          borderRadius: '3px',
                        }}
                      >
                        {idx + 1}
                      </span>
                    </div>

                    {/* Hover Actions: Move Left, Move Right, Duplicate, Delete */}
                    <div className="studio-thumb-actions" onClick={(e) => e.stopPropagation()}>
                      {idx > 0 && (
                        <button
                          type="button"
                          className="studio-thumb-btn"
                          onClick={() => handleMovePage(idx, idx - 1)}
                          title="Move page earlier"
                        >
                          ◀
                        </button>
                      )}
                      {idx < pages.length - 1 && (
                        <button
                          type="button"
                          className="studio-thumb-btn"
                          onClick={() => handleMovePage(idx, idx + 1)}
                          title="Move page later"
                        >
                          ▶
                        </button>
                      )}
                      <button
                        type="button"
                        className="studio-thumb-btn"
                        onClick={() => handleDuplicatePage(idx)}
                        title="Duplicate this page"
                      >
                        ⧉
                      </button>
                      {pages.length > 1 && (
                        <button
                          type="button"
                          className="studio-thumb-btn delete"
                          onClick={() => handleDeletePage(p.id)}
                          title="Delete page"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Page Label Below */}
                  <span className="studio-page-thumb-label">
                    Page {idx + 1}
                  </span>
                </div>
              );
            })}

            {/* Quick Add Blank Page End Card */}
            <div
              onClick={handleAddPage}
              className="studio-page-thumb-card"
              style={{
                width: currentDoc?.orientation === 'landscape' ? '68px' : '46px',
                height: currentDoc?.orientation === 'landscape' ? '46px' : '64px',
                border: '1.5px dashed #475569',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#94a3b8',
                fontSize: '18px',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              title="Add a new page"
            >
              +
            </div>
          </div>
        )}
      </footer>

      {/* PUBLISHED SUCCESS MODAL */}
      {publishModal?.open && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-sky-500/40 rounded-3xl max-w-lg w-full p-8 shadow-2xl text-center relative text-white">
            <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center text-3xl mx-auto mb-4 border border-emerald-500/30">
              ✓
            </div>
            <h2 className="text-2xl font-black mb-2">Published to Interactive Flipbook!</h2>
            <p className="text-slate-300 text-sm mb-6">
              Your document canvas has been compiled into a high-performance vector flipbook with active WhatsApp buying hotspots, senior rosters, and mobile zoom.
            </p>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center justify-between mb-6">
              <span className="font-mono text-xs text-sky-300 truncate max-w-xs">{window.location.origin}{publishModal.url}</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}${publishModal.url}`);
                  alert('Copied reader link to clipboard!');
                }}
                className="px-3.5 py-1.5 studio-gradient-btn cosmic rounded-lg text-xs font-bold text-white ml-2"
              >
                Copy
              </button>
            </div>

            <div className="flex items-center justify-center gap-3 flex-wrap">
              <Button variant="outline" onClick={() => setPublishModal(null)} className="border-slate-700 text-slate-300 hover:text-white">
                Keep Editing
              </Button>
              {(publishModal.previewUrl || publishModal.flipbookId) && (
                <a
                  href={publishModal.previewUrl || `/dashboard/preview/${publishModal.flipbookId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="studio-gradient-btn cosmic text-white font-bold py-2.5 px-5 rounded-xl text-sm"
                  title="Open in Administrative Interactive Preview"
                >
                  Dashboard Preview 👁️
                </a>
              )}
              <a
                href={publishModal.url}
                target="_blank"
                rel="noreferrer"
                className="studio-gradient-btn emerald text-white font-bold py-2.5 px-6 rounded-xl text-sm"
                title="Open in Public Flipbook Reader"
              >
                Open Live Reader ↗
              </a>
            </div>
          </div>
        </div>
      )}
      {/* Stage 4: Save As Custom Template Modal */}
      {showSaveAsTemplateModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: '#0f172a', borderRadius: '20px', maxWidth: '520px', width: '100%', padding: '28px', boxShadow: '0 25px 60px rgba(0,0,0,0.5)', border: '1px solid #334155', color: '#f8fafc' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '24px' }}>🎨</span>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>Save as Reusable Template</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSaveAsTemplateModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '18px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>
            <p style={{ fontSize: '0.82rem', color: '#94a3b8', lineHeight: 1.5, margin: '0 0 20px 0' }}>
              Convert this publication's layout, multi-column styling, and element compositions into a reusable starter template for your workspace team.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label className="studio-prop-label">Template Name</label>
                <input
                  type="text"
                  value={templateFormName}
                  onChange={(e) => setTemplateFormName(e.target.value)}
                  className="studio-prop-input"
                  placeholder="e.g. Suva Weekly FMCG Catalogue Template"
                />
              </div>

              <div>
                <label className="studio-prop-label">Commercial Category</label>
                <select
                  value={templateFormCategory}
                  onChange={(e) => setTemplateFormCategory(e.target.value)}
                  className="studio-prop-select"
                >
                  {TEMPLATE_CATEGORIES.filter((c) => c.id !== 'all').map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.icon} {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="studio-prop-label">Description (Optional)</label>
                <textarea
                  rows={3}
                  value={templateFormDesc}
                  onChange={(e) => setTemplateFormDesc(e.target.value)}
                  className="studio-prop-textarea"
                  placeholder="Describe the intended publication format, target audience, and layout features…"
                />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #1e293b' }}>
              <button
                type="button"
                onClick={() => setShowSaveAsTemplateModal(false)}
                style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid #334155', background: 'transparent', color: '#cbd5e1', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingTemplate || !templateFormName.trim()}
                onClick={handleSaveAsTemplate}
                className="studio-gradient-btn cosmic"
                style={{ padding: '9px 22px', fontSize: '0.88rem' }}
              >
                {savingTemplate ? 'Saving Template…' : '✓ Save Reusable Template'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stage 7: Pre-Flight DPI Guard Modal */}
      {showDpiGuardModal && (() => {
        const imageList: Array<{
          pageNumber: number;
          elementId: string;
          type: string;
          name: string;
          src?: string;
          dpi: number;
          status: 'low' | 'good' | 'optimal';
          printInchesW: number;
          printInchesH: number;
          naturalW: number;
          naturalH: number;
        }> = [];

        pages.forEach((p) => {
          p.elements.forEach((el) => {
            if (el.type === 'image' || el.type === 'album_spread' || (el.type === 'product' && el.image)) {
              const dpiInfo = calculateElementDpi(el);
              imageList.push({
                pageNumber: p.page_number,
                elementId: el.id,
                type: el.type,
                name: el.name || (el.type === 'product' ? el.name : el.caption) || 'Photo Frame',
                src: el.src || el.image || el.albumPhotos?.[0]?.url,
                dpi: dpiInfo.dpi,
                status: dpiInfo.status,
                printInchesW: dpiInfo.printInchesW,
                printInchesH: dpiInfo.printInchesH,
                naturalW: dpiInfo.naturalW,
                naturalH: dpiInfo.naturalH,
              });
            }
          });
        });

        const lowCount = imageList.filter((i) => i.status === 'low').length;

        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
            <div style={{ background: '#0f172a', borderRadius: '24px', maxWidth: '680px', width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 60px rgba(0,0,0,0.6)', border: '1px solid #334155', color: '#f8fafc', overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '24px' }}>🛡️</span>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>Pre-Flight Print Resolution Guard</h3>
                    <p style={{ margin: 0, fontSize: '0.78rem', color: '#94a3b8' }}>
                      Commercial print verification across {pages.length} pages • 72 pt/inch physical standard
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDpiGuardModal(false)}
                  style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '20px', cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>

              <div style={{ padding: '16px 24px', background: lowCount > 0 ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                  <span>{lowCount > 0 ? '⚠️' : '✨'}</span>
                  <span style={{ fontWeight: 700, color: lowCount > 0 ? '#fca5a5' : '#6ee7b7' }}>
                    {lowCount > 0
                      ? `Found ${lowCount} image frame(s) with resolution below 150 DPI`
                      : 'All photos meet or exceed high-definition print specifications!'}
                  </span>
                </div>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                  {imageList.length} Total Image Frame(s)
                </span>
              </div>

              <div style={{ padding: '16px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {imageList.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: '#64748b', fontSize: '13px' }}>
                    No image frames found in this document yet.
                  </div>
                ) : (
                  imageList.map((img, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 14px',
                        background: '#1e293b',
                        borderRadius: '12px',
                        border: img.status === 'low' ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid #334155',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {img.src ? (
                          <img src={img.src} alt={img.name} style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #475569' }} />
                        ) : (
                          <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🖼️</div>
                        )}
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontWeight: 700, fontSize: '13px', color: '#ffffff' }}>{img.name}</span>
                            <span style={{ fontSize: '10px', background: '#0f172a', padding: '2px 6px', borderRadius: '4px', color: '#94a3b8' }}>Page {img.pageNumber}</span>
                          </div>
                          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                            Est. Pixel Res: {img.naturalW}×{img.naturalH} px • Print Size: {img.printInchesW}″ × {img.printInchesH}″
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 700,
                            background:
                              img.status === 'low' ? 'rgba(239, 68, 68, 0.2)'
                              : img.status === 'good' ? 'rgba(59, 130, 246, 0.2)'
                              : 'rgba(16, 185, 129, 0.2)',
                            color:
                              img.status === 'low' ? '#f87171'
                              : img.status === 'good' ? '#60a5fa'
                              : '#34d399',
                            border: `1px solid ${
                              img.status === 'low' ? 'rgba(239, 68, 68, 0.4)'
                              : img.status === 'good' ? 'rgba(59, 130, 246, 0.4)'
                              : 'rgba(16, 185, 129, 0.4)'
                            }`,
                          }}
                        >
                          {img.dpi} DPI • {img.status === 'low' ? 'Low Print Res' : img.status === 'good' ? 'Web Ready' : 'Print Perfect'}
                        </span>

                        <button
                          type="button"
                          onClick={() => {
                            setActivePageIndex(img.pageNumber - 1);
                            setSelectedElementIds([img.elementId]);
                            setShowDpiGuardModal(false);
                          }}
                          className="studio-gradient-btn cosmic"
                          style={{ padding: '5px 12px', fontSize: '11px', borderRadius: '6px' }}
                        >
                          Jump ↗
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div style={{ padding: '16px 24px', borderTop: '1px solid #1e293b', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setShowDpiGuardModal(false)}
                  className="studio-gradient-btn cosmic"
                  style={{ padding: '8px 20px', fontSize: '12px', borderRadius: '8px' }}
                >
                  Close Inspection
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Stage 9: Brand Kits Reusable Visual Identity Modal */}
      {showBrandKitsModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: '#0f172a', borderRadius: '24px', maxWidth: '620px', width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 60px rgba(0,0,0,0.6)', border: '1px solid #334155', color: '#f8fafc', overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '24px' }}>🎨</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>Workspace Brand Kits</h3>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: '#94a3b8' }}>
                    1-Click apply consistent logos, palettes, and typography tokens across all publication spreads
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBrandKitsModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '20px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '18px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {loadingBrandKits ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Loading workspace brand kits…</div>
              ) : brandKits.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>No brand kits registered yet.</div>
              ) : (
                brandKits.map((kit) => (
                  <div key={kit.id} className="studio-brand-card">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 800, fontSize: '14px', color: '#ffffff' }}>{kit.name}</span>
                        {kit.is_default === 1 && (
                          <span style={{ fontSize: '9px', fontWeight: 800, background: 'rgba(14,116,144,0.2)', color: '#a5b4fc', border: '1px solid rgba(14,116,144,0.4)', padding: '1px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>
                            Default
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={applyingBrandKit}
                        onClick={() => handleApplyBrandKit(kit)}
                        className="studio-gradient-btn cosmic"
                        style={{ padding: '6px 14px', fontSize: '11px', borderRadius: '8px' }}
                      >
                        {applyingBrandKit ? 'Applying…' : 'Apply to Publication ↗'}
                      </button>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div className="studio-swatch-circle" style={{ background: kit.primary_color }} title={`Primary: ${kit.primary_color}`} />
                        <div className="studio-swatch-circle" style={{ background: kit.secondary_color }} title={`Secondary: ${kit.secondary_color}`} />
                        <div className="studio-swatch-circle" style={{ background: kit.accent_color }} title={`Accent: ${kit.accent_color}`} />
                      </div>
                      <div style={{ fontSize: '11px', color: '#cbd5e1', textAlign: 'right' }}>
                        Font: <span style={{ fontWeight: 700, color: '#f5d0fe' }}>{kit.font_family}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}

              {/* Save current document theme as new Brand Kit */}
              <div style={{ padding: '14px', background: '#1e293b', borderRadius: '14px', border: '1px solid #334155', marginTop: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#ffffff', display: 'block', marginBottom: '8px' }}>
                  💾 Save Current Style as New Brand Kit
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={newBrandKitName}
                    onChange={(e) => setNewBrandKitName(e.target.value)}
                    placeholder="e.g. Pacific Horizon Summer Palette"
                    className="studio-prop-input"
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    disabled={!newBrandKitName.trim()}
                    onClick={handleSaveCurrentBrandKit}
                    className="studio-gradient-btn sunset"
                    style={{ padding: '6px 14px', fontSize: '11px', borderRadius: '8px', whiteSpace: 'nowrap' }}
                  >
                    Save Brand Kit
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stage 8: Background Export Modal */}
      {showExportModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: '#0f172a', borderRadius: '24px', maxWidth: '520px', width: '100%', padding: '24px', boxShadow: '0 25px 60px rgba(0,0,0,0.6)', border: '1px solid #334155', color: '#f8fafc' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '24px' }}>🖨️</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>Export Commercial Publication</h3>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: '#94a3b8' }}>High-fidelity 300 DPI vector PDF and print-ready options</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowExportModal(false);
                  setExportJobProgress(null);
                  setExportDownloadUrl(null);
                }}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '20px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {exportJobProgress !== null ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <span style={{ fontSize: '28px', display: 'block', marginBottom: '8px' }}>
                  {exportJobProgress === 100 ? '🎉' : '⚙️'}
                </span>
                <h4 style={{ fontWeight: 800, color: '#ffffff', fontSize: '14px', marginBottom: '6px' }}>
                  {exportJobProgress === 100 ? 'Print PDF Ready for Download!' : `Compiling Vector Layers (${exportJobProgress}%)`}
                </h4>
                <div className="studio-export-progress-track">
                  <div className="studio-export-progress-fill" style={{ width: `${exportJobProgress}%` }} />
                </div>
                {exportDownloadUrl && (
                  <a
                    href={exportDownloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="studio-gradient-btn emerald"
                    style={{ display: 'inline-block', padding: '10px 24px', fontSize: '13px', borderRadius: '10px', textDecoration: 'none', marginTop: '12px', fontWeight: 700 }}
                  >
                    📥 Download Vector Print PDF
                  </a>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <a
                  href={`/api/v1/studio/documents/${currentDoc?.id}/export-pdf?print=1`}
                  target="_blank"
                  rel="noreferrer"
                  className="studio-brand-card"
                  style={{ textDecoration: 'none', cursor: 'pointer', display: 'block' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 800, fontSize: '13px', color: '#ffffff' }}>⚡ Instant Vector Print Dialog</span>
                    <span className="studio-gradient-btn ocean" style={{ padding: '4px 10px', fontSize: '10px', borderRadius: '6px' }}>Browser Print ↗</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>
                    Opens the browser print dialog immediately with @page CSS, bleed safe guides, and uncompressed vector layers.
                  </p>
                </a>

                <div
                  className="studio-brand-card"
                  style={{ cursor: 'pointer' }}
                  onClick={handleQueueExportJob}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 800, fontSize: '13px', color: '#ffffff' }}>🚀 300 DPI Background Worker Job</span>
                    <span className="studio-gradient-btn orchid" style={{ padding: '4px 10px', fontSize: '10px', borderRadius: '6px' }}>Queue Job ⚡</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>
                    Queues asynchronous rasterization worker for maximum resolution offset lithography printing with full bleed.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
