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
    | 'image'
    | 'product'
    | 'shape'
    | 'badge'
    | 'button'
    | 'whatsapp'
    | 'column_text'
    | 'yearbook_grid'
    | 'album_spread'
    | 'toc'
    | 'folio';
  x: number;
  y: number;
  w: number;
  h: number;
  content?: string;
  name?: string;
  price?: string;
  originalPrice?: string;
  badge?: string;
  sku?: string;
  whatsappNumber?: string;
  src?: string;
  image?: string;
  description?: string;
  caption?: string;
  linkUrl?: string;

  // Magazine & Editorial properties
  columns?: number; // 2 or 3
  columnGutter?: number;
  dropCap?: boolean;
  authorName?: string;
  authorRole?: string;
  authorAvatar?: string;

  // Yearbook properties
  students?: StudentProfile[];

  // Photo Album properties
  albumPhotos?: PhotoFrameItem[];

  // Table of Contents
  tocItems?: TocItem[];

  // Running Folio (Header / Footer)
  folioHeader?: string;
  folioShowPage?: boolean;

  style?: {
    fontSize?: number;
    fontWeight?: string;
    fontStyle?: string;
    color?: string;
    backgroundColor?: string;
    textAlign?: 'left' | 'center' | 'right';
    borderRadius?: number;
    borderColor?: string;
    borderWidth?: number;
    letterSpacing?: string;
    lineHeight?: number;
    boxShadow?: string;
    opacity?: number;
    transform?: string;
    padding?: string | number;
  };
}

export interface StudioPage {
  id: number;
  document_id: number;
  page_number: number;
  background?: { type: string; value: string };
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
  created_at: string;
  updated_at: string;
  pages?: StudioPage[];
}

export interface StudioTemplate {
  id: number;
  category: string;
  doc_type: DocType;
  name: string;
  description: string;
  thumbnail_url: string;
  canvas_spec?: { pages: { background?: any; elements: CanvasElement[] }[] };
  is_system: number;
}

export interface StudioAsset {
  id: number;
  asset_name: string;
  asset_type: string;
  file_url: string;
  file_size: number;
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

  // Active Document in Editor
  const [currentDoc, setCurrentDoc] = useState<StudioDocument | null>(null);
  const [pages, setPages] = useState<StudioPage[]>([]);
  const [activePageIndex, setActivePageIndex] = useState<number>(0);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(100);
  const [showBleed, setShowBleed] = useState<boolean>(true);
  const [gridSnap, setGridSnap] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveMessage, setSaveMessage] = useState<string>('');
  const [publishModal, setPublishModal] = useState<{ open: boolean; slug?: string; url?: string } | null>(null);

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

  // CSV Bulk Import state (Products vs Yearbook Rosters)
  const [csvMode, setCsvMode] = useState<'products' | 'yearbook'>('products');
  const [csvText, setCsvText] = useState<string>(
    'Name,Price,WasPrice,Badge,Image,WhatsApp,SKU\n' +
    'Punjas Premium Rice 10kg,$22.50,$26.00,SAVE $3.50,https://images.unsplash.com/photo-1586201375761-83865001e31c?w=500,+6799991234,PUN-10\n' +
    'Fiji Fresh Island Bananas,$5.99,$8.50,FRESH,+6799991234,BAN-01\n' +
    'Pacific Sun Cooking Oil 2L,$11.95,$14.20,HOT DEAL,https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=500,+6799991234,OIL-02\n' +
    'Rewa Fresh Milk 1L x 6,$16.80,$19.50,BULK BUY,https://images.unsplash.com/photo-1550583724-b2692b85b150?w=500,+6799991234,MLK-06'
  );

  // Dragging & Moving elements on canvas
  const canvasRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number; elX: number; elY: number } | null>(null);

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

  // Load template library
  const loadTemplates = useCallback(async () => {
    try {
      const res = await api<{ templates: StudioTemplate[] }>('/studio/templates');
      setTemplates(res.templates || []);
    } catch {
      //
    }
  }, []);

  // Load single document in editor
  const loadDocumentEditor = useCallback(async (docId: number) => {
    setLoading(true);
    try {
      const res = await api<{ document: StudioDocument }>(`/studio/documents/${docId}`);
      if (res.document) {
        setCurrentDoc(res.document);
        setPages(res.document.pages || []);
        setActivePageIndex(0);
        setSelectedElementId(null);
        // Set default tab based on doc_type
        if (res.document.doc_type === 'magazine') setActiveToolTab('magazine');
        else if (res.document.doc_type === 'album') setActiveToolTab('album');
        else setActiveToolTab('products');
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

  // Current active page
  const activePage = pages[activePageIndex] || null;
  const selectedElement = activePage?.elements.find((e) => e.id === selectedElementId) || null;

  // Create new document
  const handleCreateDocument = async () => {
    if (!newTitle.trim()) return;
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
      alert('Failed to create document: ' + e.message);
    }
  };

  // Save current active page elements
  const handleSavePage = async () => {
    if (!currentDoc || !activePage) return;
    setSaving(true);
    try {
      await api(`/studio/documents/${currentDoc.id}/pages/${activePage.id}`, 'PUT', {
        elements: activePage.elements,
        background: activePage.background || { type: 'color', value: '#FFFFFF' },
      });
      setSaveMessage('Saved page ✓');
      setTimeout(() => setSaveMessage(''), 2500);
    } catch (e: any) {
      setSaveMessage('Save failed');
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

  // Publish to interactive flipbook
  const handlePublish = async () => {
    if (!currentDoc) return;
    await handleSavePage();
    setSaving(true);
    try {
      const res = await api<{ ok: boolean; slug: string; public_url: string; viewer_url: string }>(
        `/studio/documents/${currentDoc.id}/publish`,
        'POST'
      );
      setPublishModal({
        open: true,
        slug: res.slug,
        url: res.public_url,
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
    setSelectedElementId(newId);
  };

  // Update selected element
  const updateSelectedElement = (updates: Partial<CanvasElement>) => {
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
    }
  };

  // Delete selected element
  const deleteSelectedElement = () => {
    if (!activePage || !selectedElementId) return;
    const updatedPages = [...pages];
    updatedPages[activePageIndex].elements = updatedPages[activePageIndex].elements.filter(
      (e) => e.id !== selectedElementId
    );
    setPages(updatedPages);
    setSelectedElementId(null);
  };

  // Keyboard shortcut delete
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedElementId) {
        const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
        if (tag !== 'input' && tag !== 'textarea') {
          e.preventDefault();
          deleteSelectedElement();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedElementId, activePage, pages, activePageIndex]);

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

  // CSV Bulk Import processor (Products vs Yearbook Rosters)
  const handleImportCsv = () => {
    if (!csvText.trim()) return;
    const lines = csvText.trim().split('\n');
    if (lines.length <= 1) return;

    const rows = lines.slice(1);
    const pageWidth = currentDoc?.width_pt || 595.28;

    if (csvMode === 'products') {
      let x = 40;
      let y = 140;
      const cardW = 240;
      const cardH = 300;
      const gapX = 30;
      const gapY = 25;

      const importedElements: CanvasElement[] = [];
      rows.forEach((line, idx) => {
        const parts = line.split(',').map((p) => p.trim());
        if (parts.length < 2) return;
        importedElements.push({
          id: 'prod_' + Date.now() + '_' + idx,
          type: 'product',
          x,
          y,
          w: cardW,
          h: cardH,
          name: parts[0] || 'Product ' + (idx + 1),
          price: parts[1] || '$0.00',
          originalPrice: parts[2] || undefined,
          badge: parts[3] || undefined,
          image: parts[4] || 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=500',
          whatsappNumber: parts[5] || '+6799991234',
          sku: parts[6] || 'SKU-' + (idx + 1),
        });

        x += cardW + gapX;
        if (x + cardW > pageWidth - 30) {
          x = 40;
          y += cardH + gapY;
        }
      });

      if (importedElements.length > 0 && activePage) {
        const updatedPages = [...pages];
        updatedPages[activePageIndex].elements = [...updatedPages[activePageIndex].elements, ...importedElements];
        setPages(updatedPages);
        alert(`Successfully added ${importedElements.length} products to Page ${activePageIndex + 1}!`);
        setActiveToolTab('products');
      }
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

  // Upload image asset
  const handleUploadAsset = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await uploadForm<{ ok: boolean; file_url: string; name: string }>('/studio/assets/upload', fd);
      if (res.file_url) {
        addElement({
          type: 'image',
          src: res.file_url,
          w: 280,
          h: 220,
          caption: res.name,
        });
      }
    } catch (err: any) {
      alert('Upload failed: ' + err.message);
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
      <div className="container py-8 max-w-7xl mx-auto px-4">
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/30 rounded-3xl p-8 mb-8 shadow-xl text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="px-3 py-1 bg-indigo-500/20 text-indigo-300 rounded-full text-xs font-semibold tracking-wider uppercase border border-indigo-500/30">
                  ✨ Canva-Like Visual Creation Engine
                </span>
                <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 rounded-full text-xs font-medium">
                  Direct Vector &amp; Print PDF
                </span>
                <span className="px-2.5 py-0.5 bg-purple-500/20 text-purple-300 rounded-full text-xs font-medium">
                  WhatsApp 1-Tap Ordering
                </span>
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight mb-2">Flipex Studio</h1>
              <p className="text-slate-300 max-w-2xl text-sm leading-relaxed">
                Design stunning promotional catalogues, school &amp; university yearbooks, community editorial magazines, and luxury photo albums from scratch. Publish directly into your responsive interactive flipbook reader with 1-tap WhatsApp ordering.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="primary"
                size="lg"
                onClick={() => setShowNewDocModal(true)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 font-bold px-6 py-3 rounded-xl flex items-center gap-2"
              >
                <span>➕</span> Create New Document
              </Button>
            </div>
          </div>
        </div>

        {/* Filter Pills & Search */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-1">
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
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                  filterType === f.id
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <input
              type="text"
              placeholder="Search documents…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 pl-9 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <span className="absolute left-3 top-2.5 text-slate-400">🔍</span>
          </div>
        </div>

        {/* Documents Grid */}
        {loading ? (
          <div className="text-center py-20 text-slate-500">Loading your studio workspace…</div>
        ) : filteredDocs.length === 0 ? (
          <div className="text-center py-16 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 p-8">
            <div className="text-5xl mb-3">🎨</div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1">No Documents Found</h3>
            <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">
              Get started by launching a prebuilt supermarket catalogue, high-school yearbook, or island lifestyle magazine.
            </p>
            <Button variant="primary" onClick={() => setShowNewDocModal(true)}>
              Create Your First Document
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredDocs.map((doc) => (
              <div
                key={doc.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all group flex flex-col justify-between"
              >
                <div>
                  {/* Preview Thumbnail */}
                  <div
                    onClick={() => {
                      setActiveDocId(doc.id);
                      navigate(`/studio/${doc.id}`);
                    }}
                    className="h-52 bg-slate-100 dark:bg-slate-800 cursor-pointer overflow-hidden relative flex items-center justify-center border-b border-slate-100 dark:border-slate-800"
                  >
                    {doc.cover_thumb ? (
                      <img
                        src={doc.cover_thumb}
                        alt={doc.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="text-center p-4">
                        <span className="text-4xl block mb-2">
                          {doc.doc_type === 'catalogue' ? '🛒' : doc.doc_type === 'magazine' ? '📖' : '📷'}
                        </span>
                        <span className="text-xs font-semibold text-slate-400">Blank Canvas Page</span>
                      </div>
                    )}
                    <div className="absolute top-3 left-3">
                      <span className="px-2.5 py-1 bg-black/60 backdrop-blur-md text-white rounded-lg text-[10px] font-bold uppercase tracking-wider">
                        {doc.doc_type}
                      </span>
                    </div>
                    {doc.status === 'published' && (
                      <div className="absolute top-3 right-3">
                        <span className="px-2 py-0.5 bg-emerald-500 text-white rounded-md text-[10px] font-bold">
                          Live Reader ✓
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Body Content */}
                  <div className="p-4">
                    <h3
                      onClick={() => {
                        setActiveDocId(doc.id);
                        navigate(`/studio/${doc.id}`);
                      }}
                      className="font-bold text-base text-slate-900 dark:text-slate-100 mb-1 hover:text-indigo-600 cursor-pointer line-clamp-1"
                    >
                      {doc.title}
                    </h3>
                    <div className="flex items-center gap-3 text-xs text-slate-500 mb-3">
                      <span>📄 {doc.page_count} {doc.page_count === 1 ? 'Page' : 'Pages'}</span>
                      <span>•</span>
                      <span>{doc.orientation === 'portrait' ? '↕ Portrait' : '↔ Landscape'}</span>
                    </div>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="p-4 pt-0 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 mt-2">
                  <Link
                    to={`/studio/${doc.id}`}
                    className="flex-1 text-center py-2 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-semibold text-xs rounded-xl hover:bg-indigo-100 transition-colors"
                  >
                    Open Canvas
                  </Link>
                  <a
                    href={`/api/v1/studio/documents/${doc.id}/export-pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-2.5 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold rounded-xl hover:bg-slate-200"
                    title="Export Print PDF"
                  >
                    🖨️
                  </a>
                  {doc.flipbook_slug && (
                    <a
                      href={`/v/${doc.flipbook_slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-2 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-xs font-semibold rounded-xl hover:bg-emerald-100"
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

        {/* New Document Modal */}
        {showNewDocModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-xl w-full p-6 shadow-2xl relative">
              <button
                onClick={() => setShowNewDocModal(false)}
                className="absolute top-5 right-5 text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-1">Create Studio Document</h2>
              <p className="text-xs text-slate-500 mb-5">
                Select your document layout and pick a starter preset to accelerate creation.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Document Title</label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="e.g. Suva Weekly Supermarket Specials"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Document Type</label>
                    <select
                      value={newDocType}
                      onChange={(e) => setNewDocType(e.target.value as DocType)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                    >
                      <option value="catalogue">🛒 Product Catalogue</option>
                      <option value="magazine">📖 Editorial Magazine / Yearbook</option>
                      <option value="album">📷 Keepsake Photo Album</option>
                      <option value="custom">🎨 Custom Document</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Orientation</label>
                    <select
                      value={newOrientation}
                      onChange={(e) => setNewOrientation(e.target.value as 'portrait' | 'landscape')}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                    >
                      <option value="portrait">↕ Portrait (A4 Standard)</option>
                      <option value="landscape">↔ Landscape (Spread)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    Starter Template (Optional)
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-48 overflow-y-auto pr-1">
                    <div
                      onClick={() => setNewTemplateId(null)}
                      className={`p-3 rounded-xl border-2 cursor-pointer text-center text-xs font-semibold ${
                        newTemplateId === null
                          ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <span className="text-2xl block mb-1">📄</span>
                      Blank Canvas
                    </div>
                    {templates.map((tpl) => (
                      <div
                        key={tpl.id}
                        onClick={() => setNewTemplateId(tpl.id)}
                        className={`p-2 rounded-xl border-2 cursor-pointer text-left text-xs ${
                          newTemplateId === tpl.id
                            ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40'
                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <img src={tpl.thumbnail_url} alt={tpl.name} className="h-16 w-full object-cover rounded-lg mb-1" />
                        <span className="font-bold line-clamp-1 text-[11px]">{tpl.name}</span>
                        <span className="text-[10px] text-slate-500 uppercase">{tpl.category.replace('_', ' ')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                <Button variant="outline" onClick={() => setShowNewDocModal(false)}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={handleCreateDocument} className="bg-indigo-600 font-bold px-5">
                  Launch Studio
                </Button>
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
    <div className="flex flex-col h-[calc(100vh-64px)] bg-slate-900 text-slate-100 overflow-hidden select-none">
      {/* TOP STUDIO TOOLBAR */}
      <header className="h-14 bg-slate-950 border-b border-slate-800 px-4 flex items-center justify-between gap-4 z-30 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setActiveDocId(null);
              navigate('/studio');
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Return to Documents"
          >
            ← Back
          </button>
          <div className="h-4 w-px bg-slate-800" />
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              {currentDoc?.title}
              <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded text-[10px] uppercase font-semibold">
                {currentDoc?.doc_type}
              </span>
            </h2>
          </div>
          {saveMessage && (
            <span className="text-xs text-emerald-400 font-medium ml-2 animate-pulse">
              {saveMessage}
            </span>
          )}
        </div>

        {/* Center: Page Switcher, Zoom, Bleed & Auto Tools */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs">
            <button
              disabled={activePageIndex <= 0}
              onClick={() => setActivePageIndex(activePageIndex - 1)}
              className="px-2 py-1 text-slate-400 hover:text-white disabled:opacity-30 rounded hover:bg-slate-800"
            >
              ◀
            </button>
            <span className="px-2.5 font-semibold text-slate-200">
              Page {activePageIndex + 1} of {pages.length}
            </span>
            <button
              disabled={activePageIndex >= pages.length - 1}
              onClick={() => setActivePageIndex(activePageIndex + 1)}
              className="px-2 py-1 text-slate-400 hover:text-white disabled:opacity-30 rounded hover:bg-slate-800"
            >
              ▶
            </button>
          </div>

          <div className="h-4 w-px bg-slate-800" />

          {/* Zoom Selector */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg text-xs">
            <button
              onClick={() => setZoom(Math.max(40, zoom - 15))}
              className="px-2 py-1 text-slate-400 hover:text-white"
            >
              -
            </button>
            <span className="px-2 font-mono text-[11px] text-slate-300">{zoom}%</span>
            <button
              onClick={() => setZoom(Math.min(180, zoom + 15))}
              className="px-2 py-1 text-slate-400 hover:text-white"
            >
              +
            </button>
          </div>

          <button
            onClick={() => setShowBleed(!showBleed)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
              showBleed
                ? 'bg-pink-500/20 text-pink-300 border-pink-500/40'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
            title="Toggle 3mm Print Bleed Safe Margins"
          >
            Bleed 3mm
          </button>

          <button
            onClick={() => setGridSnap(!gridSnap)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
              gridSnap
                ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
            title="Toggle Magnetic Snap-to-Grid"
          >
            Snap Grid
          </button>

          {/* Quick Folio & TOC Generators */}
          <button
            onClick={handleAddRunningFolio}
            className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-900 text-slate-300 border border-slate-800 hover:text-white hover:border-slate-700"
            title="Add Running Header & Page Number Folio to this page"
          >
            + Folio
          </button>

          <button
            onClick={handleAutoGenerateToc}
            className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-900 text-amber-300 border border-slate-800 hover:text-amber-200 hover:border-amber-500/40"
            title="Scan document pages and generate Table of Contents"
          >
            Auto TOC
          </button>
        </div>

        {/* Right: Save, Print Export & Publish Action */}
        <div className="flex items-center gap-2">
          <a
            href={`/api/v1/studio/documents/${currentDoc?.id}/export-pdf?print=1`}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5"
            title="Export Vector 300 DPI Print PDF"
          >
            <span>🖨️</span> Print PDF
          </a>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSavePage}
            disabled={saving}
            className="text-xs bg-slate-900 border-slate-700 hover:bg-slate-800 text-slate-200"
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handlePublish}
            disabled={saving}
            className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold text-xs shadow-md shadow-indigo-500/20 px-3.5"
          >
            🚀 Publish to Flipbook
          </Button>
        </div>
      </header>

      {/* WORKSPACE BODY: LEFT TOOLBAR + CENTER CANVAS + RIGHT INSPECTOR */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT TOOLBAR TABS */}
        <aside className="w-80 bg-slate-950 border-r border-slate-800 flex flex-col z-20">
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
                className={`px-2.5 py-1.5 font-semibold rounded-lg transition-colors whitespace-nowrap text-[11px] ${
                  activeToolTab === tab.id
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* TAB: PRODUCTS (CATALOGUE CREATOR) */}
            {activeToolTab === 'products' && (
              <div className="space-y-4">
                <div className="bg-indigo-950/40 border border-indigo-500/30 rounded-xl p-3 text-xs text-indigo-300">
                  <p className="font-bold mb-1">🛒 Interactive Product Cards</p>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    Insert pre-formatted price badges, strike-through original prices, and direct WhatsApp 1-tap buy buttons.
                  </p>
                </div>

                <div className="space-y-2">
                  <Button
                    variant="outline"
                    className="w-full justify-start text-xs font-semibold py-2.5 px-3 bg-slate-900 border-slate-800 hover:border-indigo-500"
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
                  </Button>

                  <Button
                    variant="outline"
                    className="w-full justify-start text-xs font-semibold py-2.5 px-3 bg-slate-900 border-slate-800 hover:border-amber-500"
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
                  </Button>

                  <Button
                    variant="outline"
                    className="w-full justify-start text-xs font-semibold py-2.5 px-3 bg-slate-900 border-slate-800 hover:border-emerald-500"
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
                  </Button>
                </div>
              </div>
            )}

            {/* TAB: MAGAZINE (EDITORIAL & PUBLISHING) */}
            {activeToolTab === 'magazine' && (
              <div className="space-y-3">
                <div className="bg-sky-950/40 border border-sky-500/30 rounded-xl p-3 text-xs text-sky-300">
                  <p className="font-bold mb-1">📖 Editorial Articles &amp; Layouts</p>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    Balanced 2-column &amp; 3-column articles, decorative Drop-Caps, and author bylines for glossy print and digital reading.
                  </p>
                </div>

                <Button
                  variant="outline"
                  className="w-full justify-start text-xs font-semibold py-2.5 px-3 bg-slate-900 border-slate-800 hover:border-sky-500"
                  onClick={() =>
                    addElement({
                      type: 'column_text',
                      content:
                        'The warm afternoon breeze drifted across the coral reef, carrying the sound of gentle waves breaking over the outer barrier. In recent years, local marine conservation reserves have revived coral biodiversity across the island coastlines.\n\nVisitors and researchers from around the world gather to witness firsthand how community-led ecological stewardship creates sustainable balance. Every participant contributes to coral planting nurseries guided by village elders.',
                      columns: 2,
                      columnGutter: 24,
                      dropCap: true,
                      w: 500,
                      h: 220,
                      style: { fontSize: 13, color: '#334155', lineHeight: 1.6 },
                    })
                  }
                >
                  <span>📰</span> 2-Column Article with Drop-Cap
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start text-xs font-semibold py-2.5 px-3 bg-slate-900 border-slate-800 hover:border-sky-500"
                  onClick={() =>
                    addElement({
                      type: 'column_text',
                      content:
                        'Pacific trade networks are experiencing unprecedented digital connectivity. Mobile payment systems and instant inventory sync allow artisans to reach global markets without leaving village shores.\n\nEco-friendly transport and cold-chain solar hubs ensure fresh harvests arrive at five-star resorts within hours of morning picking.',
                      columns: 3,
                      columnGutter: 18,
                      w: 515,
                      h: 200,
                      style: { fontSize: 12, color: '#334155', lineHeight: 1.55 },
                    })
                  }
                >
                  <span>🗞️</span> 3-Column Magazine Spread
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start text-xs font-semibold py-2 px-3 bg-slate-900 border-slate-800 hover:border-sky-500"
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
                </Button>
              </div>
            )}

            {/* TAB: YEARBOOK (SCHOOL & UNIVERSITY) */}
            {activeToolTab === 'yearbook' && (
              <div className="space-y-3">
                <div className="bg-purple-950/40 border border-purple-500/30 rounded-xl p-3 text-xs text-purple-300">
                  <p className="font-bold mb-1">🎓 School &amp; Class Yearbooks</p>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    Graduate portrait rosters, academic awards, leadership tags, and senior memorable quotes.
                  </p>
                </div>

                <Button
                  variant="outline"
                  className="w-full justify-start text-xs font-semibold py-2.5 px-3 bg-slate-900 border-slate-800 hover:border-purple-500"
                  onClick={() =>
                    addElement({
                      type: 'yearbook_grid',
                      x: 40,
                      y: 120,
                      w: 515,
                      h: 440,
                      students: [
                        {
                          name: 'Alisi Tavua',
                          award: 'Dux of School',
                          quote: '"Wisdom begins in quiet curiosity."',
                          photoUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400',
                        },
                        {
                          name: 'Jone Naivalu',
                          award: 'Head Boy',
                          quote: '"Lead through service and resilience."',
                          photoUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400',
                        },
                        {
                          name: 'Mereani Koroi',
                          award: 'Head Girl',
                          quote: '"Honor our roots wherever we travel."',
                          photoUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
                        },
                        {
                          name: 'Timoci Ravuvu',
                          award: 'Sports Captain',
                          quote: '"Clear eyes and courageous hearts."',
                          photoUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400',
                        },
                      ],
                    })
                  }
                >
                  <span>👥</span> 4-Student Graduate Portrait Grid
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start text-xs font-semibold py-2 px-3 bg-slate-900 border-slate-800 hover:border-purple-500"
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
                </Button>
              </div>
            )}

            {/* TAB: ALBUM (KEEPSAKE PHOTO ALBUM) */}
            {activeToolTab === 'album' && (
              <div className="space-y-3">
                <div className="bg-pink-950/40 border border-pink-500/30 rounded-xl p-3 text-xs text-pink-300">
                  <p className="font-bold mb-1">📷 Keepsake Photo Albums</p>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    Romantic scrapbooks, polaroid photo frames with tilt rotation, and memory captions.
                  </p>
                </div>

                <Button
                  variant="outline"
                  className="w-full justify-start text-xs font-semibold py-2.5 px-3 bg-slate-900 border-slate-800 hover:border-pink-500"
                  onClick={() =>
                    addElement({
                      type: 'album_spread',
                      x: 40,
                      y: 120,
                      w: 515,
                      h: 360,
                      albumPhotos: [
                        {
                          url: 'https://images.unsplash.com/photo-1519741497674-611481863552?w=500',
                          caption: 'The First Dance',
                          tilt: -2,
                          frameStyle: 'polaroid',
                        },
                        {
                          url: 'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?w=500',
                          caption: 'Sunset on the Lagoon',
                          tilt: 3,
                          frameStyle: 'polaroid',
                        },
                      ],
                    })
                  }
                >
                  <span>🎞️</span> Polaroid Pair with Handwritten Tilt
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start text-xs font-semibold py-2.5 px-3 bg-slate-900 border-slate-800 hover:border-pink-500"
                  onClick={() =>
                    addElement({
                      type: 'album_spread',
                      x: 40,
                      y: 100,
                      w: 515,
                      h: 420,
                      albumPhotos: [
                        {
                          url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600',
                          caption: 'Panoramic Island Coastline',
                          frameStyle: 'shadow',
                        },
                        {
                          url: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=400',
                          caption: 'Reef Exploration',
                          frameStyle: 'rounded',
                        },
                        {
                          url: 'https://images.unsplash.com/photo-1519741497674-611481863552?w=400',
                          caption: 'Celebration',
                          frameStyle: 'rounded',
                        },
                      ],
                    })
                  }
                >
                  <span>🖼️</span> 3-Photo Keepsake Collage
                </Button>
              </div>
            )}

            {/* TAB: TEXT */}
            {activeToolTab === 'text' && (
              <div className="space-y-2.5">
                <Button
                  variant="outline"
                  className="w-full justify-start text-xs font-bold py-3 px-3 bg-slate-900 border-slate-800 hover:border-indigo-500"
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
                  <span className="text-lg font-extrabold mr-2">H1</span> Large Display Heading
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start text-xs font-semibold py-2.5 px-3 bg-slate-900 border-slate-800 hover:border-indigo-500"
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
                  <span className="text-base font-bold mr-2">H2</span> Section Subheading
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start text-xs py-2 px-3 bg-slate-900 border-slate-800 hover:border-indigo-500"
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
                  <span className="font-serif mr-2">¶</span> Editorial Body Text
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start text-xs italic py-2 px-3 bg-slate-900 border-slate-800 hover:border-indigo-500"
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
                  <span className="italic mr-2">“ ”</span> Pull Quote / Memory Note
                </Button>
              </div>
            )}

            {/* TAB: MEDIA & PHOTOS */}
            {activeToolTab === 'media' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-2">Upload Graphic or Photo</label>
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-xl p-4 cursor-pointer bg-slate-900/60 transition-colors">
                    <span className="text-2xl mb-1">📤</span>
                    <span className="text-xs text-indigo-400 font-semibold">Choose image file</span>
                    <span className="text-[10px] text-slate-500">PNG, JPG, WebP</span>
                    <input type="file" accept="image/*" onChange={handleUploadAsset} className="hidden" />
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-2">Preset High-Resolution Scenery</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { name: 'Island Lagoon', url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=500' },
                      { name: 'Coral Diver', url: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=500' },
                      { name: 'Graduation', url: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=500' },
                      { name: 'Wedding Rings', url: 'https://images.unsplash.com/photo-1519741497674-611481863552?w=500' },
                    ].map((stock, i) => (
                      <div
                        key={i}
                        onClick={() =>
                          addElement({
                            type: 'image',
                            src: stock.url,
                            w: 240,
                            h: 180,
                            caption: stock.name,
                          })
                        }
                        className="rounded-lg overflow-hidden border border-slate-800 hover:border-indigo-500 cursor-pointer group relative"
                      >
                        <img src={stock.url} alt={stock.name} className="h-16 w-full object-cover group-hover:scale-105 transition-transform" />
                        <span className="absolute bottom-1 left-1 bg-black/70 px-1.5 py-0.5 rounded text-[9px] text-white font-medium">
                          {stock.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB: SHAPES & BADGES */}
            {activeToolTab === 'shapes' && (
              <div className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full justify-start text-xs font-bold py-2 px-3 bg-red-950/40 border-red-500/40 text-red-300 hover:bg-red-900/50"
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
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start text-xs font-bold py-2 px-3 bg-amber-950/40 border-amber-500/40 text-amber-300 hover:bg-amber-900/50"
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
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start text-xs font-bold py-2 px-3 bg-indigo-950/40 border-indigo-500/40 text-indigo-300 hover:bg-indigo-900/50"
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
                </Button>
              </div>
            )}

            {/* TAB: CSV BATCH IMPORT */}
            {activeToolTab === 'csv' && (
              <div className="space-y-3">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-white">Import Mode</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          setCsvMode('products');
                          setCsvText(
                            'Name,Price,WasPrice,Badge,Image,WhatsApp,SKU\n' +
                            'Punjas Premium Rice 10kg,$22.50,$26.00,SAVE $3.50,https://images.unsplash.com/photo-1586201375761-83865001e31c?w=500,+6799991234,PUN-10\n' +
                            'Fiji Fresh Island Bananas,$5.99,$8.50,FRESH,+6799991234,BAN-01'
                          );
                        }}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          csvMode === 'products' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        Products
                      </button>
                      <button
                        onClick={() => {
                          setCsvMode('yearbook');
                          setCsvText(
                            'Name,PhotoUrl,Award,Quote,Role\n' +
                            'Alisi Tavua,https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400,Dux of School,"Lead with integrity",Prefect\n' +
                            'Jone Naivalu,https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400,Head Boy,"Honor our elders",Student Council'
                          );
                        }}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          csvMode === 'yearbook' ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        Yearbook Rosters
                      </button>
                    </div>
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed mb-2">
                    {csvMode === 'products'
                      ? 'Paste product rows (Name, Price, WasPrice, Badge, Image, WhatsApp, SKU).'
                      : 'Paste class graduates (Name, PhotoUrl, Award, Quote, Role).'}
                  </p>
                  <textarea
                    rows={6}
                    value={csvText}
                    onChange={(e) => setCsvText(e.target.value)}
                    className="w-full p-2 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px] text-slate-300 focus:ring-1 focus:ring-indigo-500"
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleImportCsv}
                    className="w-full mt-2 font-bold bg-indigo-600 hover:bg-indigo-500 text-xs py-2"
                  >
                    🚀 Auto-Generate on Page {activePageIndex + 1}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* PAGE MANAGEMENT FOOTER */}
          <div className="p-3 border-t border-slate-800 bg-slate-950 flex items-center justify-between text-xs">
            <span className="text-slate-400 font-medium">Page {activePageIndex + 1} of {pages.length}</span>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddPage}
                className="text-xs px-2.5 py-1 bg-slate-900 border-slate-700 hover:bg-slate-800"
              >
                + Add Page
              </Button>
              {pages.length > 1 && (
                <button
                  onClick={() => handleDeletePage(activePage?.id || 0)}
                  className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-950/40 rounded"
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
          className="flex-1 bg-slate-950 overflow-auto flex items-center justify-center p-12 relative"
          onClick={(e) => {
            if (e.target === canvasRef.current || (e.target as HTMLElement)?.id === 'canvas-board') {
              setSelectedElementId(null);
            }
          }}
        >
          {/* THE PAGE CANVAS */}
          <div
            id="canvas-board"
            ref={canvasRef}
            style={{
              width: `${docW}px`,
              height: `${docH}px`,
              transform: `scale(${scale})`,
              transformOrigin: 'center center',
              backgroundColor: activePage?.background?.value || '#FFFFFF',
              boxShadow: '0 25px 60px -15px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.08)',
            }}
            className="relative transition-transform duration-75 select-none rounded-sm overflow-hidden"
          >
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
              const isSelected = el.id === selectedElementId;

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
                    zIndex: isSelected ? 30 : 10,
                    outline: isSelected ? '2px solid #6366F1' : 'none',
                    boxShadow: isSelected ? '0 0 0 4px rgba(99, 102, 241, 0.25)' : 'none',
                    borderRadius: el.style?.borderRadius ? `${el.style.borderRadius}px` : undefined,
                    backgroundColor: el.style?.backgroundColor,
                    opacity: el.style?.opacity,
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setSelectedElementId(el.id);
                    isDraggingRef.current = true;
                    dragStartRef.current = {
                      x: e.clientX,
                      y: e.clientY,
                      elX: el.x,
                      elY: el.y,
                    };

                    const onMouseMove = (ev: MouseEvent) => {
                      if (!isDraggingRef.current || !dragStartRef.current) return;
                      const dx = (ev.clientX - dragStartRef.current.x) / scale;
                      const dy = (ev.clientY - dragStartRef.current.y) / scale;
                      const snap = (val: number) => (gridSnap ? Math.round(val / 10) * 10 : val);
                      updateSelectedElement({
                        x: snap(Math.max(0, dragStartRef.current.elX + dx)),
                        y: snap(Math.max(0, dragStartRef.current.elY + dy)),
                      });
                    };

                    const onMouseUp = () => {
                      isDraggingRef.current = false;
                      dragStartRef.current = null;
                      window.removeEventListener('mousemove', onMouseMove);
                      window.removeEventListener('mouseup', onMouseUp);
                    };

                    window.addEventListener('mousemove', onMouseMove);
                    window.addEventListener('mouseup', onMouseUp);
                  }}
                >
                  {/* TEXT ELEMENT */}
                  {el.type === 'text' && (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        fontSize: `${el.style?.fontSize || 16}px`,
                        fontWeight: el.style?.fontWeight || 'normal',
                        fontStyle: el.style?.fontStyle || 'normal',
                        color: el.style?.color || '#0F172A',
                        textAlign: el.style?.textAlign || 'left',
                        lineHeight: el.style?.lineHeight || 1.3,
                        letterSpacing: el.style?.letterSpacing,
                        overflow: 'hidden',
                      }}
                      contentEditable={isSelected}
                      suppressContentEditableWarning
                      onBlur={(e) => updateSelectedElement({ content: e.currentTarget.innerText })}
                    >
                      {el.content || 'Double click to edit text'}
                    </div>
                  )}

                  {/* MULTI-COLUMN ARTICLE WITH DROP-CAP (MAGAZINE) */}
                  {el.type === 'column_text' && (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        columnCount: el.columns || 2,
                        columnGap: `${el.columnGutter || 20}px`,
                        fontSize: `${el.style?.fontSize || 13}px`,
                        color: el.style?.color || '#334155',
                        lineHeight: el.style?.lineHeight || 1.6,
                        overflow: 'hidden',
                        textAlign: 'justify',
                      }}
                    >
                      {el.dropCap && el.content ? (
                        <>
                          <span
                            style={{
                              float: 'left',
                              fontSize: '48px',
                              lineHeight: '40px',
                              paddingTop: '4px',
                              paddingRight: '8px',
                              fontWeight: 'bold',
                              color: '#0F172A',
                              fontFamily: 'serif',
                            }}
                          >
                            {el.content.charAt(0)}
                          </span>
                          {el.content.slice(1)}
                        </>
                      ) : (
                        el.content
                      )}
                    </div>
                  )}

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
                    <div className="w-full h-full bg-white/90 p-6 rounded-2xl border border-slate-200 flex flex-col justify-between">
                      <div>
                        <h3 className="text-xl font-bold text-slate-900 tracking-wider mb-4 border-b pb-2">
                          {el.content || 'TABLE OF CONTENTS'}
                        </h3>
                        <div className="space-y-3">
                          {(el.tocItems || []).map((item, idx) => (
                            <div key={idx} className="flex items-baseline justify-between text-xs">
                              <span className="font-semibold text-slate-800">{item.title}</span>
                              <span className="flex-1 mx-2 border-b border-dotted border-slate-300" />
                              <span className="font-mono font-bold text-slate-900">{item.page_number}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-400 text-center uppercase tracking-widest">
                        Nuvis Flipex Publishing
                      </div>
                    </div>
                  )}

                  {/* RUNNING FOLIO (PAGE NUMBER & HEADER) */}
                  {el.type === 'folio' && (
                    <div className="w-full h-full flex items-center justify-between text-[10px] font-mono text-slate-400 border-t border-slate-200 pt-1">
                      <span>{el.folioHeader || currentDoc?.title}</span>
                      {el.folioShowPage && <span>Page {activePageIndex + 1}</span>}
                    </div>
                  )}

                  {/* IMAGE ELEMENT */}
                  {el.type === 'image' && (
                    <div className="w-full h-full relative overflow-hidden rounded">
                      <img src={el.src} alt={el.caption || 'Studio Element'} className="w-full h-full object-cover" />
                      {el.caption && (
                        <div className="absolute bottom-0 inset-x-0 bg-black/60 backdrop-blur-sm p-1.5 text-white text-[11px]">
                          {el.caption}
                        </div>
                      )}
                    </div>
                  )}

                  {/* PRODUCT CARD ELEMENT (CATALOGUE) */}
                  {el.type === 'product' && (
                    <div className="w-full h-full bg-white rounded-2xl border border-slate-200 shadow-md p-3 flex flex-col justify-between overflow-hidden relative text-slate-900">
                      {el.badge && (
                        <div className="absolute top-3 left-3 z-10">
                          <span className="px-2 py-0.5 bg-red-600 text-white rounded text-[10px] font-extrabold uppercase shadow">
                            {el.badge}
                          </span>
                        </div>
                      )}
                      {el.image && (
                        <div className="h-36 w-full rounded-xl overflow-hidden bg-slate-50 mb-2">
                          <img src={el.image} alt={el.name} className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div>
                        <h4 className="font-bold text-xs line-clamp-2 text-slate-800">{el.name}</h4>
                        {el.description && (
                          <p className="text-[10px] text-slate-500 line-clamp-2 mt-0.5">{el.description}</p>
                        )}
                        <div className="flex items-baseline gap-2 mt-1">
                          <span className="text-base font-extrabold text-red-600">{el.price}</span>
                          {el.originalPrice && (
                            <span className="text-xs text-slate-400 line-through">{el.originalPrice}</span>
                          )}
                        </div>
                      </div>
                      <div className="mt-2">
                        <button
                          type="button"
                          className="w-full py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1 shadow-sm"
                        >
                          <span>💬</span> WhatsApp Order
                        </button>
                      </div>
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
        </main>

        {/* RIGHT PROPERTY INSPECTOR */}
        <aside className="w-72 bg-slate-950 border-l border-slate-800 p-4 overflow-y-auto text-xs z-20">
          {selectedElement ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="font-bold uppercase tracking-wider text-slate-400 text-[10px]">
                  {selectedElement.type} Element
                </span>
                <button
                  onClick={deleteSelectedElement}
                  className="text-red-400 hover:text-red-300 font-bold"
                  title="Delete element"
                >
                  Delete ✕
                </button>
              </div>

              {/* Position & Size */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1.5">Position &amp; Dimensions</label>
                <div className="grid grid-cols-2 gap-2 font-mono">
                  <div>
                    <span className="text-[10px] text-slate-500">X:</span>
                    <input
                      type="number"
                      value={selectedElement.x}
                      onChange={(e) => updateSelectedElement({ x: parseInt(e.target.value, 10) || 0 })}
                      className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-800 text-xs"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500">Y:</span>
                    <input
                      type="number"
                      value={selectedElement.y}
                      onChange={(e) => updateSelectedElement({ y: parseInt(e.target.value, 10) || 0 })}
                      className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-800 text-xs"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500">W:</span>
                    <input
                      type="number"
                      value={selectedElement.w}
                      onChange={(e) => updateSelectedElement({ w: parseInt(e.target.value, 10) || 20 })}
                      className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-800 text-xs"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500">H:</span>
                    <input
                      type="number"
                      value={selectedElement.h}
                      onChange={(e) => updateSelectedElement({ h: parseInt(e.target.value, 10) || 20 })}
                      className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-800 text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Magazine Column Properties */}
              {selectedElement.type === 'column_text' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-0.5">Columns</label>
                      <select
                        value={selectedElement.columns || 2}
                        onChange={(e) => updateSelectedElement({ columns: parseInt(e.target.value, 10) })}
                        className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-800 text-xs"
                      >
                        <option value={1}>1 Column</option>
                        <option value={2}>2 Columns</option>
                        <option value={3}>3 Columns</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-0.5">Drop-Cap</label>
                      <button
                        onClick={() => updateSelectedElement({ dropCap: !selectedElement.dropCap })}
                        className={`w-full py-1 rounded font-bold text-xs ${
                          selectedElement.dropCap ? 'bg-indigo-600 text-white' : 'bg-slate-900 border border-slate-800'
                        }`}
                      >
                        {selectedElement.dropCap ? 'Drop-Cap ON' : 'Drop-Cap OFF'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Text Properties */}
              {(selectedElement.type === 'text' || selectedElement.type === 'badge' || selectedElement.type === 'column_text') && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">Content</label>
                    <textarea
                      rows={3}
                      value={selectedElement.content || ''}
                      onChange={(e) => updateSelectedElement({ content: e.target.value })}
                      className="w-full px-2 py-1.5 rounded bg-slate-900 border border-slate-800 text-xs"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-0.5">Font Size</label>
                      <input
                        type="number"
                        value={selectedElement.style?.fontSize || 16}
                        onChange={(e) =>
                          updateSelectedElement({
                            style: { ...selectedElement.style, fontSize: parseInt(e.target.value, 10) || 12 },
                          })
                        }
                        className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-800 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-0.5">Color</label>
                      <input
                        type="color"
                        value={selectedElement.style?.color || '#0F172A'}
                        onChange={(e) =>
                          updateSelectedElement({
                            style: { ...selectedElement.style, color: e.target.value },
                          })
                        }
                        className="w-full h-8 rounded bg-slate-900 border border-slate-800 cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Product Card Properties */}
              {selectedElement.type === 'product' && (
                <div className="space-y-2.5">
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-0.5">Product Title</label>
                    <input
                      type="text"
                      value={selectedElement.name || ''}
                      onChange={(e) => updateSelectedElement({ name: e.target.value })}
                      className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-800 text-xs"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-0.5">Selling Price</label>
                      <input
                        type="text"
                        value={selectedElement.price || ''}
                        onChange={(e) => updateSelectedElement({ price: e.target.value })}
                        className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-800 text-xs text-red-400 font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-0.5">Was Price</label>
                      <input
                        type="text"
                        value={selectedElement.originalPrice || ''}
                        onChange={(e) => updateSelectedElement({ originalPrice: e.target.value })}
                        className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-800 text-xs"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-0.5">Promo Badge</label>
                    <input
                      type="text"
                      value={selectedElement.badge || ''}
                      onChange={(e) => updateSelectedElement({ badge: e.target.value })}
                      className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-800 text-xs text-amber-300 font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-0.5">Image URL</label>
                    <input
                      type="text"
                      value={selectedElement.image || ''}
                      onChange={(e) => updateSelectedElement({ image: e.target.value })}
                      className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-800 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-0.5">WhatsApp Order Number</label>
                    <input
                      type="text"
                      value={selectedElement.whatsappNumber || ''}
                      onChange={(e) => updateSelectedElement({ whatsappNumber: e.target.value })}
                      placeholder="+6799991234"
                      className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-800 text-xs text-emerald-400 font-mono"
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Page Settings when no element is selected */
            <div className="space-y-4">
              <span className="font-bold uppercase tracking-wider text-slate-400 text-[10px] block border-b border-slate-800 pb-2">
                Page {activePageIndex + 1} Settings
              </span>
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-2">Page Background</label>
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {[
                    { name: 'White', color: '#FFFFFF' },
                    { name: 'Warm Cream', color: '#FDFBF7' },
                    { name: 'Slate Light', color: '#F1F5F9' },
                    { name: 'Dark Navy', color: '#0F172A' },
                  ].map((bg, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        const updated = [...pages];
                        updated[activePageIndex].background = { type: 'color', value: bg.color };
                        setPages(updated);
                      }}
                      style={{ backgroundColor: bg.color }}
                      className="h-8 rounded-lg border border-slate-700 hover:scale-105 transition-transform"
                      title={bg.name}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* PUBLISHED SUCCESS MODAL */}
      {publishModal?.open && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-indigo-500/40 rounded-3xl max-w-lg w-full p-8 shadow-2xl text-center relative text-white">
            <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center text-3xl mx-auto mb-4 border border-emerald-500/30">
              ✓
            </div>
            <h2 className="text-2xl font-black mb-2">Published to Interactive Flipbook!</h2>
            <p className="text-slate-300 text-sm mb-6">
              Your document canvas has been compiled into a high-performance vector flipbook with active WhatsApp buying hotspots, senior rosters, and mobile zoom.
            </p>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center justify-between mb-6">
              <span className="font-mono text-xs text-indigo-300 truncate max-w-xs">{window.location.origin}{publishModal.url}</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}${publishModal.url}`);
                  alert('Copied reader link to clipboard!');
                }}
                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-bold text-white ml-2"
              >
                Copy
              </button>
            </div>

            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" onClick={() => setPublishModal(null)} className="border-slate-700 text-slate-300">
                Keep Editing
              </Button>
              <a
                href={publishModal.url}
                target="_blank"
                rel="noreferrer"
                className="btn-primary bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-6 rounded-xl text-sm shadow-lg shadow-emerald-600/20"
              >
                Open Live Reader ↗
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
