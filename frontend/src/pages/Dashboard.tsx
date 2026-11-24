import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import StudioIcon from '../components/studio/StudioIcon';
import TabBar from '../components/studio/TabBar';
import { api, ApiError, uploadForm } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import ShareDialog from '../components/ShareDialog';
import CustomizationDialog, { type FlipbookSettings } from '../components/CustomizationDialog';
import PublicationLifecycleModal, {
  type CategoryItem,
  type CollectionItem,
} from '../components/PublicationLifecycleModal';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import {
  RotateCcw,
  Activity,
  Plus,
  X,
  Clock,
  Pencil,
  Copy,
  Trash2,
  Check,
  Upload,
  Share2,
} from '../components/ui/icons';

export interface Flipbook {
  id: number;
  title: string;
  description?: string;
  slug: string;
  publicSlug?: string;
  companySlug?: string | null;
  canonicalUrl?: string;
  slugUpdatedAt?: string | null;
  slugHistory?: Array<{ old_slug: string; new_slug: string; created_at: string }>;
  tenantName?: string | null;
  status: 'uploading' | 'processing' | 'ready' | 'failed';
  workflowStatus?: 'draft' | 'processing' | 'editing' | 'in_review' | 'scheduled' | 'published' | 'archived';
  version?: number;
  visibility: 'public' | 'unlisted' | 'password';
  pageCount: number;
  published: boolean;
  publishedAt?: string | null;
  scheduledAt?: string | null;
  expiresAt?: string | null;
  categoryId?: number | null;
  categoryName?: string | null;
  categoryColor?: string | null;
  collectionId?: number | null;
  collectionName?: string | null;
  conversionProgress?: number;
  conversionStep?: string;
  conversionError?: string | null;
  reviewNotes?: string | null;
  reviewedAt?: string | null;
  pdfMetadata?: Record<string, any> | null;
  seoMeta?: Record<string, any>;
  previewToken?: string;
  previewUrl?: string;
  cover: string | null;
  settings?: FlipbookSettings;
}

interface JobQueueItem {
  id: number;
  flipbookId: number | null;
  flipbookTitle: string;
  type: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  currentStep: string;
  attempts: number;
  maxAttempts: number;
  error: string | null;
  createdAt: string;
}

export interface CommercialLead {
  id: number;
  flipbookId: number | null;
  flipbookTitle: string;
  flipbookSlug: string;
  pageNumber: number | null;
  productTitle: string;
  productSku: string;
  productPrice: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  quantity: number;
  notes: string;
  status: 'new' | 'contacted' | 'quoted' | 'converted' | 'closed';
  source: string;
  createdAt: string;
}

export interface LeadStats {
  total: number;
  new: number;
  converted: number;
}

export default function Dashboard({ view = 'flipbooks' }: { view?: 'overview' | 'flipbooks' | 'leads' }) {
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Flipbook[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [jobs, setJobs] = useState<JobQueueItem[]>([]);

  // Commercial Leads & Storefront State (Phase 3)
  const [leads, setLeads] = useState<CommercialLead[]>([]);
  const [leadStats, setLeadStats] = useState<LeadStats>({ total: 0, new: 0, converted: 0 });
  const [leadLoading, setLeadLoading] = useState(false);
  const [leadStatusFilter, setLeadStatusFilter] = useState<string>('all');
  const [leadQuery, setLeadQuery] = useState('');
  const [selectedLead, setSelectedLead] = useState<CommercialLead | null>(null);
  const [storefrontInfo, setStorefrontInfo] = useState<{ slug: string; businessName: string; whatsappPhone: string } | null>(null);
  const [copiedStorefrontLink, setCopiedStorefrontLink] = useState(false);

  const [q, setQ] = useState('');
  const [workflowFilter, setWorkflowFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [collectionFilter, setCollectionFilter] = useState<string>('');

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    fileName: string;
    fileIndex: number;
    totalFiles: number;
    pct: number;
    loadedBytes: number;
    totalBytes: number;
  } | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [error, setError] = useState('');
  const [share, setShare] = useState<Flipbook | null>(null);
  const [customize, setCustomize] = useState<Flipbook | null>(null);
  const [lifecycleBook, setLifecycleBook] = useState<{ book: Flipbook; tab: 'workflow' | 'versions' | 'seo' } | null>(null);
  const [showJobsModal, setShowJobsModal] = useState(false);
  const [showTaxonomyModal, setShowTaxonomyModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newColName, setNewColName] = useState('');

  // Inline rename & quick link copy state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  const input = useRef<HTMLInputElement>(null);
  const workerBusyRef = useRef<boolean>(false);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (workflowFilter && workflowFilter !== 'all') params.set('workflow', workflowFilter);
    if (categoryFilter) params.set('categoryId', categoryFilter);
    if (collectionFilter) params.set('collectionId', collectionFilter);
    return api<Flipbook[]>(`/flipbooks?${params.toString()}`).then((next) =>
      // keep the previous array when nothing changed so polling never re-renders (or flickers) the grid
      setItems((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
    );
  }, [q, workflowFilter, categoryFilter, collectionFilter]);

  const loadTaxonomy = useCallback(() => {
    api<CategoryItem[]>('/categories').then(setCategories).catch(() => {});
    api<CollectionItem[]>('/collections').then(setCollections).catch(() => {});
  }, []);

  const loadJobs = useCallback(() => {
    api<JobQueueItem[]>('/jobs').then(setJobs).catch(() => {});
  }, []);

  const loadLeads = useCallback(() => {
    setLeadLoading(true);
    const params = new URLSearchParams();
    if (leadStatusFilter && leadStatusFilter !== 'all') {
      params.set('status', leadStatusFilter);
    }
    return api<{ leads: CommercialLead[]; stats: LeadStats }>(`/leads?${params.toString()}`)
      .then((res) => {
        if (res?.leads) setLeads(res.leads);
        if (res?.stats) setLeadStats(res.stats);
      })
      .catch(() => {})
      .finally(() => setLeadLoading(false));
  }, [leadStatusFilter]);

  const loadStorefrontInfo = useCallback(() => {
    api<{ storefront: any }>('/biz/settings')
      .then((res) => {
        if (res?.storefront) setStorefrontInfo(res.storefront);
      })
      .catch(() => {});
  }, []);

  const handleUpdateLeadStatus = async (leadId: number, nextStatus: string) => {
    try {
      await api(`/leads/${leadId}`, 'PATCH', { status: nextStatus });
      setLeads((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, status: nextStatus as any } : l))
      );
      if (selectedLead && selectedLead.id === leadId) {
        setSelectedLead({ ...selectedLead, status: nextStatus as any });
      }
      loadLeads();
    } catch (e: any) {
      alert(`Could not update lead status: ${e.message}`);
    }
  };

  const handleDeleteLead = async (leadId: number) => {
    if (!confirm('Are you sure you want to remove this lead record?')) return;
    try {
      await api(`/leads/${leadId}`, 'DELETE');
      setLeads((prev) => prev.filter((l) => l.id !== leadId));
      if (selectedLead?.id === leadId) setSelectedLead(null);
      loadLeads();
    } catch (e: any) {
      alert(`Could not delete lead: ${e.message}`);
    }
  };

  const triggerQueueDrain = useCallback(async () => {
    if (workerBusyRef.current) return;
    workerBusyRef.current = true;
    try {
      await api('/jobs/process', 'POST').catch(() => {});
      await load();
      loadJobs();
    } catch {
      // ignore transient errors; polling continues
    } finally {
      workerBusyRef.current = false;
    }
  }, [load, loadJobs]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadTaxonomy();
    loadJobs();
    loadLeads();
    loadStorefrontInfo();
  }, [loadTaxonomy, loadJobs, loadLeads, loadStorefrontInfo]);

  // Poll while anything is converting so progress bars update. Polling uses exponential back-off
  // (2s → 15s, reset when the set of processing items changes), pauses while the tab is hidden, and
  // only drains the queue from the browser when VITE_BROWSER_QUEUE_DRAIN !== 'false' (disable it when a
  // dedicated `php bin/worker.php` is running). Claiming is lock-safe server-side, so sessions cannot double-process.
  const processingKey = items
    .filter((i) => i.status === 'processing' || i.status === 'uploading')
    .map((i) => i.id)
    .join(',');
  useEffect(() => {
    const hasProcessing = processingKey !== '';
    if (!hasProcessing && !showJobsModal) return;
    const drainInBrowser = import.meta.env.VITE_BROWSER_QUEUE_DRAIN !== 'false';

    let delay = 2000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      if (document.hidden) return; // resumed by visibilitychange
      if (hasProcessing && drainInBrowser) {
        await triggerQueueDrain();
      } else {
        await load().catch(() => {});
      }
      if (showJobsModal) loadJobs();
      if (cancelled) return;
      delay = hasProcessing ? 1800 : Math.min(15000, Math.round(delay * 1.5));
      timer = setTimeout(tick, delay);
    };

    const onVisibility = () => {
      if (!document.hidden && !cancelled) {
        if (timer) clearTimeout(timer);
        delay = 2000;
        void tick();
      }
    };

    void tick();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [processingKey, showJobsModal, load, loadJobs, triggerQueueDrain]);

  const uploadFiles = async (fileList: FileList | File[]) => {
    const pdfs = Array.from(fileList).filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );
    if (pdfs.length === 0) {
      setError('Please select or drop valid PDF files (.pdf).');
      return;
    }
    setError('');
    setUploading(true);
    try {
      for (let idx = 0; idx < pdfs.length; idx++) {
        const file = pdfs[idx];
        setUploadProgress({
          fileName: file.name,
          fileIndex: idx + 1,
          totalFiles: pdfs.length,
          pct: 0,
          loadedBytes: 0,
          totalBytes: file.size,
        });
        const fd = new FormData();
        fd.append('file', file);
        if (categoryFilter) fd.append('categoryId', categoryFilter);
        if (collectionFilter) fd.append('collectionId', collectionFilter);
        await uploadForm('/flipbooks', fd, (pct, loadedBytes, totalBytes) => {
          setUploadProgress({
            fileName: file.name,
            fileIndex: idx + 1,
            totalFiles: pdfs.length,
            pct,
            loadedBytes,
            totalBytes,
          });
        });
      }
      await load();
      loadJobs();
      void triggerQueueDrain();
    } catch (e) {
      setError(e instanceof ApiError ? (e.fields.file ?? e.message) : 'Upload failed');
    } finally {
      setUploading(false);
      setUploadProgress(null);
      if (input.current) input.current.value = '';
    }
  };

  const remove = async (f: Flipbook) => {
    if (!confirm(`Delete "${f.title}"?`)) return;
    await api(`/flipbooks/${f.id}`, 'DELETE');
    load();
  };

  const startRename = (f: Flipbook) => {
    setEditingId(f.id);
    setEditingTitle(f.title);
  };

  const handleSaveTitle = async (id: number) => {
    const clean = editingTitle.trim();
    if (!clean) return;
    try {
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, title: clean } : item))
      );
      setEditingId(null);
      await api(`/flipbooks/${id}`, 'PATCH', { title: clean });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to rename publication');
      await load();
    }
  };

  const copyPublicLink = (slug: string, canonicalUrl?: string) => {
    const path = canonicalUrl && canonicalUrl.startsWith('/') ? canonicalUrl : `/v/${slug}`;
    const url = `${window.location.origin}${path}`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        setCopiedSlug(slug);
        setTimeout(() => setCopiedSlug(null), 2500);
      }).catch(() => {});
    }
  };

  const quickPublish = async (f: Flipbook) => {
    try {
      await api(`/flipbooks/${f.id}`, 'PATCH', {
        published: true,
        workflowStatus: 'published',
      });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to publish flipbook');
    }
  };

  const duplicateBook = async (f: Flipbook) => {
    const cleanTitle = f.title.replace(/^Copy of\s+/i, '').replace(/\s*\(Copy\)$/i, '');
    const proposed = window.prompt('Enter name for the duplicated publication:', `${cleanTitle} (Copy)`);
    if (proposed === null) return;
    const finalTitle = proposed.trim() || `${f.title} (Copy)`;
    try {
      await api(`/flipbooks/${f.id}/duplicate`, 'POST', { title: finalTitle });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to duplicate publication');
    }
  };

  const retryBookConversion = async (f: Flipbook) => {
    try {
      setItems((prev) =>
        prev.map((item) =>
          item.id === f.id
            ? { ...item, status: 'processing', conversionProgress: 5, conversionStep: 'Retrying conversion...' }
            : item
        )
      );
      await api(`/flipbooks/${f.id}/retry`, 'POST');
      void triggerQueueDrain();
      await load();
      loadJobs();
    } catch (e) {
      await load();
      setError(e instanceof ApiError ? e.message : 'Failed to retry conversion');
    }
  };

  const reconvertBook = async (f: Flipbook) => {
    try {
      setItems((prev) =>
        prev.map((item) =>
          item.id === f.id
            ? { ...item, status: 'processing', conversionProgress: 5, conversionStep: 'Queued for reconversion...' }
            : item
        )
      );
      await api(`/flipbooks/${f.id}/reconvert`, 'POST');
      void triggerQueueDrain();
      await load();
      loadJobs();
    } catch (e: any) {
      await load();
      const msg = e instanceof ApiError ? e.message : (e?.message || 'Failed to reconvert publication');
      setError(msg);
      alert(`Reconversion notice: ${msg}`);
    }
  };

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return;
    await api('/categories', 'POST', { name: newCatName.trim() });
    setNewCatName('');
    loadTaxonomy();
  };

  const handleCreateCollection = async () => {
    if (!newColName.trim()) return;
    await api('/collections', 'POST', { name: newColName.trim() });
    setNewColName('');
    loadTaxonomy();
  };

  const failedJobsCount = jobs.filter((j) => j.status === 'failed').length;
  const featuredBook = items[0] || null;
  const readyBooksCount = items.filter((b) => b.status === 'ready').length;
  const publishedBooksCount = items.filter((b) => b.published || b.workflowStatus === 'published').length;
  const totalPagesConverted = items.reduce((acc, b) => acc + (b.pageCount || 0), 0);
  const progressRatio = items.length > 0 ? Math.round((readyBooksCount / items.length) * 100) : 100;
  const ringCircumference = 2 * Math.PI * 52;
  const ringOffset = ringCircumference - (progressRatio / 100) * ringCircumference;

  const getWorkflowBadgeVariant = (wf?: string): 'default' | 'golden' | 'success' | 'warning' | 'danger' => {
    switch (wf) {
      case 'published':
        return 'success';
      case 'in_review':
      case 'scheduled':
        return 'warning';
      case 'editing':
        return 'golden';
      default:
        return 'default';
    }
  };

  const filteredLeads = leads.filter((l) => {
    if (leadQuery) {
      const qLower = leadQuery.toLowerCase();
      const match =
        l.customerName.toLowerCase().includes(qLower) ||
        l.customerEmail.toLowerCase().includes(qLower) ||
        (l.customerPhone && l.customerPhone.toLowerCase().includes(qLower)) ||
        (l.productTitle && l.productTitle.toLowerCase().includes(qLower)) ||
        (l.flipbookTitle && l.flipbookTitle.toLowerCase().includes(qLower));
      if (!match) return false;
    }
    return true;
  });

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!isDraggingOver) setIsDraggingOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setIsDraggingOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDraggingOver(false);
        if (e.dataTransfer?.files?.length) {
          void uploadFiles(e.dataTransfer.files);
        }
      }}
    >
      {/* Full-Window Drag-and-Drop Overlay */}
      {isDraggingOver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-6 pointer-events-none">
          <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-amber-400 bg-slate-900/95 px-12 py-14 text-center shadow-2xl max-w-lg">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-400/20 text-amber-400">
              <Upload className="h-8 w-8" />
            </div>
            <h3 className="text-xl font-bold text-white mb-1">Drop PDF Publications Here</h3>
            <p className="text-sm text-slate-300">
              Release to upload &amp; automatically apply your Workspace Default Brand Kit
            </p>
          </div>
        </div>
      )}

      <div className="row head" style={{ flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ margin: '0 0 4px 0' }}>
            {view === 'overview'
              ? 'Workspace Overview'
              : view === 'leads'
              ? 'Commercial Storefront & Customer Leads'
              : 'Your Flipbooks'}
          </h1>
          <p className="muted" style={{ margin: 0 }}>
            {view === 'overview'
              ? 'Executive Summary · Latest Publication Telemetry · Conversion Progress'
              : view === 'leads'
              ? 'Hotspot Leads Engine · Direct WhatsApp Ordering · Verified Storefront'
              : 'Full Publishing Lifecycle · Multi-Resolution WebP Engine · Version Control'}
          </p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          {view === 'overview' && (
            <Link to="/flipbooks" className="btn-secondary boardui-btn-sm" style={{ textDecoration: 'none' }}>
              Manage All Flipbooks ({items.length})
            </Link>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowTaxonomyModal(true)}
            title="Manage Categories & Collections"
          >
            <Plus className="h-3.5 w-3.5" />
            Categories & Collections
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              loadJobs();
              setShowJobsModal(true);
            }}
            title="View Document Processing Queue & Failed Jobs"
          >
            <Activity className="h-3.5 w-3.5 text-amber-500" />
            Processing Queue
            {failedJobsCount > 0 && (
              <Badge variant="danger" className="ml-1">
                {failedJobsCount} failed
              </Badge>
            )}
          </Button>
          {can('flipbook.create') ? (
            <>
              <input
                type="file"
                accept="application/pdf"
                multiple
                hidden
                ref={input}
                onChange={(e) => e.target.files?.length && uploadFiles(e.target.files)}
              />
              {user?.role === 'admin' && (
                <Link
                  to="/studio"
                  className="btn-primary flex items-center gap-1.5 text-xs font-bold py-2 px-3.5 shadow-sm text-white"
                  style={{
                    background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                    border: 'none',
                    textDecoration: 'none',
                  }}
                  title="Flipex Studio: Visual Document Creation Engine (Developer / Admin Preview)"
                >
                  <StudioIcon name="sparkles" size={14} /> Studio
                </Link>
              )}
              <button disabled={uploading} onClick={() => input.current?.click()} className="btn-secondary">
                {uploading ? 'Uploading PDF…' : '+ Upload PDF'}
              </button>
              {featuredBook && can('hotspot.manage') && (
                <Link
                  to={`/dashboard/editor/${featuredBook.id}`}
                  className="btn-secondary flex items-center gap-1.5 text-xs font-semibold py-2 px-3"
                  title="Open Interactive Page Designer & Enrichments Studio"
                >
                  <StudioIcon name="palette" size={14} /> Interactive Page Designer
                </Link>
              )}
            </>
          ) : (
            <span className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-500">
              👁️ View Only Mode
            </span>
          )}
        </div>
      </div>

      {/* 3-View Tab Navigation: Overview | Flipbooks | Storefront & Leads */}
      <div className="mb-4">
        <TabBar
          variant="app"
          ariaLabel="Workspace views"
          testId="dash-views"
          value={view}
          onChange={(id) => navigate(id === 'overview' ? '/dashboard' : id === 'flipbooks' ? '/flipbooks' : '/leads')}
          tabs={[
            { id: 'overview', label: 'Executive Overview', icon: 'chart' },
            { id: 'flipbooks', label: 'Flipbooks Library', icon: 'book', count: items.length },
            { id: 'leads', label: 'Storefront & Leads CRM', icon: 'cart', count: leadStats.new > 0 ? `${leadStats.new} new` : undefined },
          ]}
        />
      </div>

      {/* Live Byte-Level Upload Progress Banner */}
      {uploading && uploadProgress && (
        <div className="mb-4 rounded-2xl border border-amber-400/40 bg-amber-50/90 dark:bg-slate-900/95 p-4 shadow-md">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-400 text-slate-950 font-bold text-xs">
                {uploadProgress.pct}%
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                  Uploading {uploadProgress.fileName}{' '}
                  {uploadProgress.totalFiles > 1 && (
                    <span className="text-amber-600 dark:text-amber-400">
                      ({uploadProgress.fileIndex} of {uploadProgress.totalFiles})
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {(uploadProgress.loadedBytes / 1048576).toFixed(2)} MB /{' '}
                  {Math.max(0.01, uploadProgress.totalBytes / 1048576).toFixed(2)} MB transferred ·{' '}
                  {uploadProgress.pct >= 100
                    ? 'Validating PDF structure & queuing instant cover render…'
                    : 'Streaming high-speed upload…'}
                </div>
              </div>
            </div>
            <Badge variant="golden">
              {uploadProgress.pct >= 100 ? 'Processing' : `${uploadProgress.pct}%`}
            </Badge>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div
              className="h-full bg-amber-400 transition-all duration-150"
              style={{ width: `${Math.max(4, uploadProgress.pct)}%` }}
            />
          </div>
        </div>
      )}

      {user && !user.emailVerified && (
        <div className="banner">
          Please verify your email.{' '}
          <button className="link" onClick={() => api('/auth/resend-verification', 'POST')}>
            Resend link
          </button>
        </div>
      )}
      {error && <p className="err">{error}</p>}

      {view === 'overview' && (
        /* EXECUTIVE DASHBOARD OVERVIEW (Pic 2 Layout: Info + Progress Ring + Performance) */
        <div className="overview-grid-wrap">
          <div className="overview-top-row">
            {/* Left Info Card (Pic 2 Style) */}
            <div className="card overview-info-card">
              <div className="overview-card-body">
                <h3 className="overview-card-title">Info</h3>
                {featuredBook ? (
                  <div className="overview-featured-flex">
                    <div className="overview-cover-box">
                      {featuredBook.cover ? (
                        <img src={featuredBook.cover} alt={featuredBook.title} />
                      ) : (
                        <div className="overview-cover-placeholder">PDF</div>
                      )}
                    </div>
                    <div className="overview-featured-meta">
                      <div className="overview-kpi-pair">
                        <div>
                          <b className="overview-big-num">{featuredBook.pageCount}</b>
                          <span className="overview-sub-lbl">Pages</span>
                        </div>
                        <div>
                          <b className="overview-big-num">{items.length}</b>
                          <span className="overview-sub-lbl">Publications</span>
                        </div>
                        <div>
                          <b className="overview-big-num">{totalPagesConverted}</b>
                          <span className="overview-sub-lbl">Total Pages</span>
                        </div>
                      </div>
                      <p className="overview-processed-line">
                        📖 Latest issue: <b>{featuredBook.title}</b> (`/v/{featuredBook.slug}`) · Updated by {user?.email}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-1">
                        <Link to={`/dashboard/preview/${featuredBook.id}`} className="action-pill preview">
                          View flipbook 👁️
                        </Link>
                        <button
                          type="button"
                          onClick={() => setShare(featuredBook)}
                          className="action-pill preview"
                          style={{ cursor: 'pointer', border: 'none' }}
                        >
                          <StudioIcon name="rocket" size={15} /> Share &amp; Publish
                        </button>
                        <Link to={`/dashboard/editor/${featuredBook.id}`} className="action-pill editor" title="Design interactive links, products, videos, audios & callouts">
                          <StudioIcon name="palette" size={15} /> Interactive Page Designer
                        </Link>
                        <Link to={`/dashboard/analytics/${featuredBook.id}`} className="action-pill analytics">
                          Statistics 📊
                        </Link>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="muted">Upload your first PDF publication to view workspace telemetry.</p>
                )}
              </div>
              <button
                type="button"
                className="overview-card-footer-btn"
                onClick={() => {
                  loadJobs();
                  setShowJobsModal(true);
                }}
              >
                Show processing history
              </button>
            </div>

            {/* Right Flipbook Progress Circular Ring Card (Pic 2 Style) */}
            <div className="card overview-progress-card">
              <div className="overview-card-body flex flex-col items-center justify-between">
                <h3 className="overview-card-title w-full">Flipbook progress</h3>
                <div className="overview-ring-wrap">
                  <svg width="132" height="132" viewBox="0 0 132 132">
                    <circle
                      cx="66"
                      cy="66"
                      r="52"
                      fill="none"
                      stroke="var(--border-color)"
                      strokeWidth="10"
                    />
                    <circle
                      cx="66"
                      cy="66"
                      r="52"
                      fill="none"
                      stroke="var(--brand)"
                      strokeWidth="10"
                      strokeLinecap="round"
                      strokeDasharray={ringCircumference}
                      strokeDashoffset={ringOffset}
                      transform="rotate(-90 66 66)"
                    />
                  </svg>
                  <div className="overview-ring-center">
                    <b>
                      {readyBooksCount} / {Math.max(items.length, 1)}
                    </b>
                    <span>Ready</span>
                  </div>
                </div>
              </div>
              <Link to="/flipbooks" className="overview-card-footer-btn">
                Show flipbook library ({publishedBooksCount} published)
              </Link>
            </div>
          </div>
        </div>
      )}

      {view === 'leads' ? (
        <div className="flex flex-col gap-4">
          {/* Storefront Live Showcase Card */}
          <div
            className="card"
            style={{
              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(2, 132, 199, 0.08) 100%)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              borderRadius: '16px',
              padding: '20px',
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-2xl">🏪</span>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white m-0 truncate">
                    {storefrontInfo?.businessName || 'Your Business Storefront'}
                  </h2>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-400 text-slate-950">
                    Live Public Portal
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 m-0">
                  Publisher Profile URL:{' '}
                  <code className="bg-white/80 dark:bg-slate-900/80 px-2 py-0.5 rounded font-mono text-[11px] text-amber-600 dark:text-amber-400 font-bold">
                    {window.location.origin}/{storefrontInfo?.slug || 'company'}
                  </code>
                </p>
                {storefrontInfo?.whatsappPhone && (
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 m-0 mt-1 font-semibold">
                    💬 Direct WhatsApp Ordering Active: +{storefrontInfo.whatsappPhone}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {storefrontInfo?.slug && (
                  <>
                    <a
                      href={`/${storefrontInfo.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-primary"
                      style={{ fontSize: '12px', padding: '7px 14px', textDecoration: 'none' }}
                    >
                      Open Publisher Profile ↗
                    </a>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ fontSize: '12px', padding: '7px 12px' }}
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/${storefrontInfo.slug}`);
                        setCopiedStorefrontLink(true);
                        setTimeout(() => setCopiedStorefrontLink(false), 2500);
                      }}
                    >
                      {copiedStorefrontLink ? '✓ Copied URL' : '📋 Copy Link'}
                    </button>
                  </>
                )}
                <Link
                  to="/settings#storefront"
                  className="btn-secondary"
                  style={{ fontSize: '12px', padding: '7px 12px', textDecoration: 'none' }}
                >
                  ⚙️ Storefront Settings
                </Link>
              </div>
            </div>
          </div>

          {/* CRM KPI Metrics Tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="card p-4 rounded-xl flex flex-col justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Inquiries</span>
              <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{leadStats.total}</div>
              <span className="text-[11px] text-slate-400 mt-1">From reader hotspots &amp; storefront</span>
            </div>
            <div className="card p-4 rounded-xl flex flex-col justify-between border-l-4 border-amber-500">
              <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">New Leads</span>
              <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">{leadStats.new}</div>
              <span className="text-[11px] text-slate-400 mt-1">Awaiting sales team contact</span>
            </div>
            <div className="card p-4 rounded-xl flex flex-col justify-between border-l-4 border-blue-500">
              <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">In Contact / Quoted</span>
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
                {leads.filter((l) => l.status === 'contacted' || l.status === 'quoted').length}
              </div>
              <span className="text-[11px] text-slate-400 mt-1">Active customer negotiations</span>
            </div>
            <div className="card p-4 rounded-xl flex flex-col justify-between border-l-4 border-emerald-500">
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Converted</span>
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{leadStats.converted}</div>
              <span className="text-[11px] text-slate-400 mt-1">Orders closed &amp; fulfilled</span>
            </div>
          </div>

          {/* Search & Status Filters */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <input
              type="text"
              placeholder="Search leads by customer name, email, phone, product title or publication..."
              value={leadQuery}
              onChange={(e) => setLeadQuery(e.target.value)}
              className="search"
              style={{ margin: 0, flex: '1 1 280px' }}
            />
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'all', label: `All (${leadStats.total})` },
                { id: 'new', label: `New (${leadStats.new})` },
                { id: 'contacted', label: 'Contacted' },
                { id: 'quoted', label: 'Quoted' },
                { id: 'converted', label: `Converted (${leadStats.converted})` },
                { id: 'closed', label: 'Closed' },
              ].map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setLeadStatusFilter(pill.id)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                    leadStatusFilter === pill.id
                      ? 'bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 text-slate-950 font-bold shadow-md border border-amber-300/60 transform -translate-y-0.5'
                      : 'bg-gradient-to-r from-white via-slate-50 to-slate-100 dark:from-slate-800 dark:via-slate-850 dark:to-slate-900 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white border border-slate-200 dark:border-slate-700 shadow-sm hover:-translate-y-0.5'
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </div>

          {/* Commercial Leads Table */}
          {filteredLeads.length === 0 ? (
            <div className="card p-12 text-center">
              <div className="text-3xl mb-2">📋</div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
                {leadLoading ? 'Loading inquiries...' : 'No customer inquiries found'}
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Customer leads from interactive product hotspots and your public storefront will appear here in real time.
              </p>
            </div>
          ) : (
            <div className="card overflow-x-auto p-0 rounded-2xl border border-slate-200 dark:border-slate-800">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: 'var(--header-bg, #f8fafc)', borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Customer</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Product / Publication</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Notes / Inquiry</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Date</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Status</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeads.map((lead) => (
                    <tr
                      key={lead.id}
                      style={{ borderBottom: '1px solid var(--border-color, #e2e8f0)', verticalAlign: 'middle' }}
                      className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors"
                    >
                      <td style={{ padding: '12px 16px' }}>
                        <div className="font-bold text-slate-900 dark:text-white">{lead.customerName}</div>
                        <a
                          href={`mailto:${lead.customerEmail}`}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline block"
                        >
                          {lead.customerEmail}
                        </a>
                        {lead.customerPhone && (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[11px] text-slate-500">{lead.customerPhone}</span>
                            <a
                              href={`https://wa.me/${lead.customerPhone.replace(/[^0-9]/g, '')}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold hover:underline"
                              title="Chat on WhatsApp"
                            >
                              💬 WhatsApp
                            </a>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {lead.productTitle ? (
                          <>
                            <div className="font-semibold text-slate-900 dark:text-white">
                              {lead.productTitle}
                              {lead.quantity > 1 && (
                                <span className="ml-1 text-xs text-amber-600 dark:text-amber-400 font-bold">
                                  × {lead.quantity}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {lead.productSku && `SKU: ${lead.productSku} · `}
                              {lead.productPrice && `${lead.productPrice} · `}
                              {lead.pageNumber && `Page ${lead.pageNumber}`}
                            </div>
                          </>
                        ) : (
                          <span className="text-slate-500 text-xs">General Business Inquiry</span>
                        )}
                        {lead.flipbookTitle && (
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            📖 {lead.flipbookTitle}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', maxWidth: '280px' }}>
                        <p className="text-xs text-slate-600 dark:text-slate-300 m-0 line-clamp-2">
                          {lead.notes || '—'}
                        </p>
                      </td>
                      <td style={{ padding: '12px 16px', whiteSpace: 'nowrap', fontSize: '12px', color: '#64748b' }}>
                        {lead.createdAt ? new Date(lead.createdAt).toLocaleDateString() : '—'}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <select
                          value={lead.status}
                          onChange={(e) => handleUpdateLeadStatus(lead.id, e.target.value)}
                          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold dark:border-slate-700 dark:bg-slate-900"
                          style={{
                            color:
                              lead.status === 'new'
                                ? '#d97706'
                                : lead.status === 'converted'
                                ? '#059669'
                                : lead.status === 'contacted'
                                ? '#2563eb'
                                : '#64748b',
                          }}
                        >
                          <option value="new">🟡 New</option>
                          <option value="contacted">🔵 Contacted</option>
                          <option value="quoted">🟣 Quoted</option>
                          <option value="converted">🟢 Converted</option>
                          <option value="closed">⚪ Closed</option>
                        </select>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedLead(lead)}
                            className="btn-secondary boardui-btn-sm"
                            style={{ fontSize: '11px', padding: '4px 8px' }}
                            title="View inquiry details"
                          >
                            👁️
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteLead(lead.id)}
                            className="btn-secondary boardui-btn-sm"
                            style={{ fontSize: '11px', padding: '4px 8px', color: '#ef4444' }}
                            title="Delete lead record"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Lead Details Modal */}
          {selectedLead && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
              <div className="card w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white m-0">
                      Inquiry from {selectedLead.customerName}
                    </h3>
                    <span className="text-xs text-slate-400">
                      Received {new Date(selectedLead.createdAt).toLocaleString()} · ID #{selectedLead.id}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedLead(null)}
                    className="rounded-full p-1 text-slate-400 hover:text-white"
                  >
                    ✕
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                    <span className="text-slate-400 block mb-1">Customer Email</span>
                    <a
                      href={`mailto:${selectedLead.customerEmail}`}
                      className="font-bold text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {selectedLead.customerEmail}
                    </a>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                    <span className="text-slate-400 block mb-1">Phone / WhatsApp</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {selectedLead.customerPhone || 'Not provided'}
                    </span>
                  </div>
                  {selectedLead.productTitle && (
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 col-span-2">
                      <span className="text-slate-400 block mb-1">Target Product &amp; Publication</span>
                      <div className="font-bold text-slate-900 dark:text-white">
                        {selectedLead.productTitle}{' '}
                        {selectedLead.quantity > 1 && `(Qty: ${selectedLead.quantity})`}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {selectedLead.productSku && `SKU: ${selectedLead.productSku} · `}
                        {selectedLead.productPrice && `Price: ${selectedLead.productPrice} · `}
                        {selectedLead.pageNumber && `Page ${selectedLead.pageNumber} · `}
                        {selectedLead.flipbookTitle && `Catalogue: ${selectedLead.flipbookTitle}`}
                      </div>
                    </div>
                  )}
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 col-span-2">
                    <span className="text-slate-400 block mb-1">Customer Notes / Message</span>
                    <p className="text-slate-800 dark:text-slate-200 m-0 whitespace-pre-wrap leading-relaxed">
                      {selectedLead.notes || 'No extra notes submitted.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Status:</label>
                    <select
                      value={selectedLead.status}
                      onChange={(e) => handleUpdateLeadStatus(selectedLead.id, e.target.value)}
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold dark:border-slate-700 dark:bg-slate-900"
                    >
                      <option value="new">New</option>
                      <option value="contacted">Contacted</option>
                      <option value="quoted">Quoted</option>
                      <option value="converted">Converted</option>
                      <option value="closed">Closed</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedLead.customerPhone && (
                      <a
                        href={`https://wa.me/${selectedLead.customerPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                          `Hi ${selectedLead.customerName}, thank you for your inquiry on ${selectedLead.productTitle || 'our catalogue'}!`
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-primary"
                        style={{ fontSize: '12px', padding: '6px 12px', textDecoration: 'none', background: '#25D366', borderColor: '#25D366', color: '#fff' }}
                      >
                        💬 WhatsApp Reply
                      </a>
                    )}
                    <a
                      href={`mailto:${selectedLead.customerEmail}?subject=${encodeURIComponent(
                        `Inquiry Reply: ${selectedLead.productTitle || 'Your Catalogue Inquiry'}`
                      )}`}
                      className="btn-secondary"
                      style={{ fontSize: '12px', padding: '6px 12px', textDecoration: 'none' }}
                    >
                      ✉️ Email Reply
                    </a>
                    <button
                      type="button"
                      onClick={() => setSelectedLead(null)}
                      className="btn-secondary"
                      style={{ fontSize: '12px', padding: '6px 12px' }}
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Search + Taxonomy & Workflow Filters */}
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <input
            className="search"
            style={{ margin: 0, flex: '1 1 260px' }}
            placeholder="Search publications by title, description, or custom slug…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.count ?? 0})
              </option>
            ))}
          </select>
          <select
            value={collectionFilter}
            onChange={(e) => setCollectionFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="">All Collections</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.count ?? 0})
              </option>
            ))}
          </select>
        </div>

        {/* 7-Stage Workflow Filter Pills */}
        <TabBar
          variant="app"
          className="st-flat"
          ariaLabel="Filter by publication status"
          testId="dash-status"
          value={workflowFilter}
          onChange={setWorkflowFilter}
          tabs={[
            { id: 'all', label: 'All Publications', icon: 'files' },
            { id: 'editing', label: 'Editing / Drafts', icon: 'file' },
            { id: 'in_review', label: 'In Review', icon: 'eye' },
            { id: 'scheduled', label: 'Scheduled', icon: 'history' },
            { id: 'published', label: 'Published', icon: 'checkCircle' },
            { id: 'archived', label: 'Archived', icon: 'folder' },
          ]}
        />
      </div>

      {items.length === 0 ? (
        <div
          onClick={() => !uploading && input.current?.click()}
          className="card empty cursor-pointer border-2 border-dashed border-slate-300 hover:border-amber-400 dark:border-slate-800 dark:hover:border-amber-400 transition-all p-10 text-center"
        >
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-500">
            <Upload className="h-6 w-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
            Drag &amp; drop PDF files here, or click to browse
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Supports single or batch PDF uploads. Your Workspace Default Brand Kit and multi-resolution WebP/AVIF engine will be applied automatically.
          </p>
        </div>
      ) : (
        <div className="grid">
          {items.map((f) => {
            const wf = f.workflowStatus || (f.published ? 'published' : f.status === 'ready' ? 'editing' : 'processing');
            const pct = f.conversionProgress ?? (f.status === 'ready' ? 100 : 10);
            const isProcessing = f.status === 'processing' || f.status === 'uploading';
            const isEditing = editingId === f.id;

            return (
              <div className="card fb" key={f.id}>
                <div className="fb-cover-wrap relative overflow-hidden">
                  {f.cover ? (
                    <img
                      src={f.cover}
                      alt={f.title}
                      className={`fb-cover-img ${isProcessing ? 'filter blur-[1.5px] brightness-75 scale-[1.02] transition-all duration-300' : ''}`}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : !isProcessing && f.status === 'failed' ? (
                    <div className="flex flex-col items-center justify-center p-4 text-center w-full">
                      <span className="text-red-500 font-bold text-xs mb-1">⚠️ Conversion Failed</span>
                      {f.conversionError && (
                        <span className="text-[10px] text-slate-500 line-clamp-2 mb-2">{f.conversionError}</span>
                      )}
                      <Button size="sm" variant="outline" onClick={() => retryBookConversion(f)}>
                        <RotateCcw className="h-3 w-3" /> Retry
                      </Button>
                    </div>
                  ) : null}

                  {/* Active Converting / Reconverting Progress Overlay (Visible regardless of f.cover) */}
                  {isProcessing && (
                    <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center p-4 text-center">
                      <div className="relative mb-2.5">
                        <div className="h-10 w-10 rounded-full border-2 border-amber-400/30 border-t-amber-400 animate-spin" />
                        <span className="absolute inset-0 flex items-center justify-center text-xs">⚡</span>
                      </div>
                      <span className="text-amber-400 font-bold text-xs mb-1 truncate max-w-[200px]" title={f.conversionStep || 'Processing PDF...'}>
                        {f.conversionStep || 'Converting PDF…'}
                      </span>
                      <span className="text-sky-400 font-extrabold text-sm mb-2">{pct}%</span>
                      <div className="h-2 w-full max-w-[190px] overflow-hidden rounded-full bg-slate-800 border border-slate-700">
                        <div
                          className="h-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-300 rounded-full"
                          style={{ width: `${Math.max(8, pct)}%` }}
                        />
                      </div>
                      {f.pageCount ? (
                        <span className="text-[11px] text-slate-300 mt-2 font-medium">
                          📄 {f.pageCount} pages rendered
                        </span>
                      ) : null}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => triggerQueueDrain()}
                        className="mt-3 h-7 text-[11px] px-2.5 flex items-center gap-1 border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                        title="Advance or check queued conversion"
                      >
                        <RotateCcw className="h-3 w-3" /> Advance Queue
                      </Button>
                    </div>
                  )}

                  {/* Top Badges on Cover */}
                  <div className="fb-badge-overlay z-20">
                    <span className="fb-badge-chip version">
                      v{f.version || 1}
                    </span>
                    <span className={`fb-badge-chip ${isProcessing ? 'bg-amber-500 text-slate-950 font-bold animate-pulse' : wf}`}>
                      {isProcessing ? `CONVERTING ${pct}%` : wf.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* Title & Inline Edit */}
                <div className="fb-title-wrap">
                  {isEditing ? (
                    <div className="fb-rename-box">
                      <input
                        type="text"
                        className="fb-rename-input"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveTitle(f.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        autoFocus
                      />
                      <button
                        type="button"
                        className="fb-rename-save-btn"
                        title="Save title"
                        onClick={() => handleSaveTitle(f.id)}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className="fb-rename-cancel-btn"
                        title="Cancel"
                        onClick={() => setEditingId(null)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <h3
                        className="fb-title-text"
                        title="Click to rename"
                        onClick={() => startRename(f)}
                      >
                        {f.title}
                      </h3>
                      <button
                        type="button"
                        className="fb-rename-btn"
                        title="Rename publication"
                        onClick={() => startRename(f)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>

                {/* Meta Row: Page count, Slug Pill, Category */}
                <div className="fb-meta-row">
                  <span>{f.pageCount} pages</span>
                  <span>·</span>
                  <button
                    type="button"
                    className="fb-slug-pill"
                    title="Click to copy branded publication link"
                    onClick={() => copyPublicLink(f.slug, f.canonicalUrl)}
                  >
                    <span className="truncate max-w-[180px]">{f.canonicalUrl || `/v/${f.slug}`}</span>
                    {copiedSlug === f.slug ? (
                      <span className="text-emerald-500 font-semibold text-[10px]">Copied!</span>
                    ) : (
                      <Copy className="h-3 w-3 opacity-60" />
                    )}
                  </button>
                  {f.categoryName && (
                    <>
                      <span>·</span>
                      <span className="font-semibold text-amber-500 text-[11px]">{f.categoryName}</span>
                    </>
                  )}
                </div>

                {f.scheduledAt && wf === 'scheduled' && (
                  <div className="mb-2 flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                    <Clock className="h-3 w-3" />
                    <span>Scheduled: {new Date(f.scheduledAt).toLocaleString()}</span>
                  </div>
                )}

                {/* Primary Action Button */}
                {isProcessing ? (
                  <div className="w-full py-2 px-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-500 font-medium text-xs flex items-center justify-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                    </span>
                    <span>Converting Pages ({pct}%)</span>
                  </div>
                ) : f.status === 'ready' ? (
                  <Link to={`/dashboard/preview/${f.id}`} className="fb-primary-btn">
                    <span>Preview Flipbook</span>
                    <span>👁️</span>
                  </Link>
                ) : f.status === 'failed' ? (
                  <button
                    className="fb-primary-btn bg-red-500 hover:bg-red-600 text-white"
                    onClick={() => retryBookConversion(f)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Retry Conversion
                  </button>
                ) : null}

                {/* Studio Tools Grid */}
                <div className="fb-tools-grid">
                  {f.status === 'ready' && can('hotspot.manage') && (
                    <Link to={`/dashboard/editor/${f.id}`} className="fb-tool-btn" title="Open Interactive Page Designer & Enrichments Studio">
                      <StudioIcon name="palette" size={15} /> Page Designer
                    </Link>
                  )}
                  {f.status === 'ready' && can('flipbook.edit') && (
                    <button type="button" className="fb-tool-btn" onClick={() => setCustomize(f)}>
                      <StudioIcon name="sliders" size={15} /> Customize
                    </button>
                  )}
                  {f.status === 'ready' && can('analytics.view') && (
                    <Link to={`/dashboard/analytics/${f.id}`} className="fb-tool-btn">
                      <span>📊</span> Analytics
                    </Link>
                  )}
                  {(can('flipbook.edit') || can('flipbook.publish')) && (
                    <button
                      type="button"
                      className="fb-tool-btn"
                      onClick={() => setLifecycleBook({ book: f, tab: 'workflow' })}
                      title="Workflow, Approval, Schedule, Versions & SEO"
                    >
                      <StudioIcon name="history" size={15} /> Lifecycle
                    </button>
                  )}
                </div>

                {/* Bottom Actions: Prominent Full-Width Share & Publish + Responsive 4-Column Action Grid */}
                <div className="w-full pt-2 mt-2 border-t border-slate-200 dark:border-slate-800">
                  {f.status === 'ready' && (
                    <div className="flex gap-1.5 mb-1.5">
                      {wf !== 'published' && (
                        <button
                          type="button"
                          className="py-1.5 px-3 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 transition-all flex items-center justify-center gap-1 shadow-sm"
                          onClick={() => quickPublish(f)}
                          title="Publish flipbook immediately"
                        >
                          <span><StudioIcon name="rocket" size={15} /> Publish</span>
                        </button>
                      )}
                      <button
                        type="button"
                        className="flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold text-amber-900 dark:text-amber-200 bg-gradient-to-r from-amber-100 via-amber-200 to-amber-300 dark:from-amber-950/60 dark:via-amber-900/40 dark:to-amber-950/70 hover:from-amber-200 hover:via-amber-300 hover:to-amber-400 dark:hover:from-amber-900/60 dark:hover:via-amber-800/50 dark:hover:to-amber-900/70 border border-amber-300 dark:border-amber-700/60 transition-all flex items-center justify-center gap-1.5 shadow-sm"
                        onClick={() => setShare(f)}
                        title="Share & Publish publication, Branded URL, QR Code & Embed"
                      >
                        <Share2 className="h-3.5 w-3.5 text-amber-700 dark:text-amber-300" />
                        <span>Share &amp; Publish</span>
                      </button>
                    </div>
                  )}

                  <div className="fb-quick-actions-strip">
                    {can('flipbook.edit') && (
                      <button
                        type="button"
                        className="fb-quick-action fb-qa-reconvert"
                        onClick={() => reconvertBook(f)}
                        disabled={isProcessing}
                        title="Re-run conversion pipeline on original uploaded PDF to render all pages"
                      >
                        <RotateCcw className={`h-3.5 w-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
                        <span>Reconvert</span>
                      </button>
                    )}
                    {can('flipbook.edit') && (
                      <button
                        type="button"
                        className="fb-quick-action fb-qa-replace"
                        onClick={() => setLifecycleBook({ book: f, tab: 'versions' })}
                        disabled={isProcessing}
                        title="Upload a new PDF revision while keeping the same public URL and QR code"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        <span>Replace</span>
                      </button>
                    )}
                    {can('flipbook.create') && (
                      <button
                        type="button"
                        className="fb-quick-action fb-qa-duplicate"
                        onClick={() => duplicateBook(f)}
                        disabled={isProcessing}
                        title="Duplicate publication"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        <span>Duplicate</span>
                      </button>
                    )}
                    {can('flipbook.delete') && (
                      <button
                        type="button"
                        className="fb-quick-action fb-qa-delete"
                        onClick={() => remove(f)}
                        title="Delete publication"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Delete</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
        </>
      )}

      {share && <ShareDialog flipbook={share} onClose={() => setShare(null)} onSaved={load} />}
      {customize && <CustomizationDialog flipbook={customize} onClose={() => setCustomize(null)} onSaved={load} />}
      {lifecycleBook && (
        <PublicationLifecycleModal
          book={lifecycleBook.book}
          initialTab={lifecycleBook.tab}
          categories={categories}
          collections={collections}
          onClose={() => setLifecycleBook(null)}
          onUpdated={() => {
            load();
            loadTaxonomy();
          }}
        />
      )}

      {/* Categories & Collections Manager Modal */}
      {showTaxonomyModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
          onClick={() => setShowTaxonomyModal(false)}
        >
          <div
            className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Categories & Collections
              </h2>
              <button onClick={() => setShowTaxonomyModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {/* Categories */}
              <div>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Categories</h3>
                <div className="mb-3 flex gap-1.5">
                  <input
                    className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
                    placeholder="New category..."
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                  />
                  <Button size="sm" variant="primary" onClick={handleCreateCategory}>
                    Add
                  </Button>
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {categories.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-1.5 text-xs dark:border-slate-800"
                    >
                      <span>{c.name}</span>
                      <button
                        className="text-red-500 hover:underline text-[11px]"
                        onClick={async () => {
                          await api(`/categories/${c.id}`, 'DELETE');
                          loadTaxonomy();
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Collections */}
              <div>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Collections</h3>
                <div className="mb-3 flex gap-1.5">
                  <input
                    className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
                    placeholder="New collection..."
                    value={newColName}
                    onChange={(e) => setNewColName(e.target.value)}
                  />
                  <Button size="sm" variant="primary" onClick={handleCreateCollection}>
                    Add
                  </Button>
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {collections.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-1.5 text-xs dark:border-slate-800"
                    >
                      <span>{c.name}</span>
                      <button
                        className="text-red-500 hover:underline text-[11px]"
                        onClick={async () => {
                          await api(`/collections/${c.id}`, 'DELETE');
                          loadTaxonomy();
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Document Processing Job Queue & Failed-Job Management Modal */}
      {showJobsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
          onClick={() => setShowJobsModal(false)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Document Processing Service & Failed-Job Queue
                </h2>
                <p className="text-xs text-slate-500">
                  Isolated worker conversion telemetry, retry recovery & progress monitoring
                </p>
              </div>
              <button onClick={() => setShowJobsModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {jobs.length === 0 ? (
                <p className="text-center text-xs text-slate-400 py-6">No conversion jobs recorded yet.</p>
              ) : (
                <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                  {jobs.map((j) => (
                    <div key={j.id} className="flex items-center justify-between gap-4 px-4 py-3 text-xs">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800 dark:text-slate-100">
                            #{j.id} · {j.flipbookTitle}
                          </span>
                          <Badge
                            variant={
                              j.status === 'completed'
                                ? 'success'
                                : j.status === 'failed'
                                  ? 'danger'
                                  : j.status === 'running'
                                    ? 'golden'
                                    : 'default'
                            }
                          >
                            {j.status} ({j.progress}%)
                          </Badge>
                          <span className="text-[11px] text-slate-400">
                            Attempts: {j.attempts}/{j.maxAttempts}
                          </span>
                        </div>
                        {j.currentStep && (
                          <p className="text-[11px] text-slate-500">{j.currentStep}</p>
                        )}
                        {j.error && (
                          <p className="text-[11px] text-red-500 font-medium">Error: {j.error}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {(j.status === 'failed' || j.status === 'cancelled') && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              await api(`/jobs/${j.id}/retry`, 'POST');
                              loadJobs();
                              load();
                            }}
                          >
                            <RotateCcw className="h-3 w-3" /> Retry Job
                          </Button>
                        )}
                        {(j.status === 'queued' || j.status === 'running') && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={async () => {
                              await api(`/jobs/${j.id}`, 'DELETE');
                              loadJobs();
                            }}
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
