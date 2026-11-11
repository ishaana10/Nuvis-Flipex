import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
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
} from '../components/ui/icons';

export interface Flipbook {
  id: number;
  title: string;
  description?: string;
  slug: string;
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

export default function Dashboard({ view = 'flipbooks' }: { view?: 'overview' | 'flipbooks' }) {
  const { user } = useAuth();
  const [items, setItems] = useState<Flipbook[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [jobs, setJobs] = useState<JobQueueItem[]>([]);

  const [q, setQ] = useState('');
  const [workflowFilter, setWorkflowFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [collectionFilter, setCollectionFilter] = useState<string>('');

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [share, setShare] = useState<Flipbook | null>(null);
  const [customize, setCustomize] = useState<Flipbook | null>(null);
  const [lifecycleBook, setLifecycleBook] = useState<{ book: Flipbook; tab: 'workflow' | 'versions' | 'seo' } | null>(null);
  const [showJobsModal, setShowJobsModal] = useState(false);
  const [showTaxonomyModal, setShowTaxonomyModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newColName, setNewColName] = useState('');

  const input = useRef<HTMLInputElement>(null);
  const workerBusyRef = useRef<boolean>(false);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (workflowFilter && workflowFilter !== 'all') params.set('workflow', workflowFilter);
    if (categoryFilter) params.set('categoryId', categoryFilter);
    if (collectionFilter) params.set('collectionId', collectionFilter);
    return api<Flipbook[]>(`/flipbooks?${params.toString()}`).then(setItems);
  }, [q, workflowFilter, categoryFilter, collectionFilter]);

  const loadTaxonomy = useCallback(() => {
    api<CategoryItem[]>('/categories').then(setCategories).catch(() => {});
    api<CollectionItem[]>('/collections').then(setCollections).catch(() => {});
  }, []);

  const loadJobs = useCallback(() => {
    api<JobQueueItem[]>('/jobs').then(setJobs).catch(() => {});
  }, []);

  const triggerQueueDrain = useCallback(async () => {
    if (workerBusyRef.current) return;
    workerBusyRef.current = true;
    try {
      await api('/jobs/process-next', 'POST');
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
  }, [loadTaxonomy, loadJobs]);

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
      delay = Math.min(15000, Math.round(delay * 1.5));
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

  const upload = async (file: File) => {
    setError('');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (categoryFilter) fd.append('categoryId', categoryFilter);
      if (collectionFilter) fd.append('collectionId', collectionFilter);
      await uploadForm('/flipbooks', fd);
      await load();
      loadJobs();
    } catch (e) {
      setError(e instanceof ApiError ? (e.fields.file ?? e.message) : 'Upload failed');
    } finally {
      setUploading(false);
      if (input.current) input.current.value = '';
    }
  };

  const remove = async (f: Flipbook) => {
    if (!confirm(`Delete "${f.title}"?`)) return;
    await api(`/flipbooks/${f.id}`, 'DELETE');
    load();
  };

  const duplicateBook = async (f: Flipbook) => {
    try {
      await api(`/flipbooks/${f.id}/duplicate`, 'POST', { title: `${f.title} (Copy)` });
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to duplicate publication');
    }
  };

  const retryBookConversion = async (f: Flipbook) => {
    try {
      await api(`/flipbooks/${f.id}/retry`, 'POST');
      load();
      loadJobs();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to retry conversion');
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

  return (
    <div>
      <div className="row head" style={{ flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ margin: '0 0 4px 0' }}>
            {view === 'overview' ? 'Workspace Overview' : 'Your Flipbooks'}
          </h1>
          <p className="muted" style={{ margin: 0 }}>
            {view === 'overview'
              ? 'Executive Summary · Latest Publication Telemetry · Conversion Progress'
              : 'Full Publishing Lifecycle · Multi-Resolution WebP Engine · Version Control'}
          </p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          {view === 'overview' && (
            <Link to="/flipbooks" className="btn-secondary boardui-btn-sm" style={{ textDecoration: 'none' }}>
              📚 Manage All Flipbooks ({items.length})
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
          <input
            type="file"
            accept="application/pdf"
            hidden
            ref={input}
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          />
          <button disabled={uploading} onClick={() => input.current?.click()} className="btn-primary">
            {uploading ? 'Validating & Uploading PDF…' : '+ Upload PDF'}
          </button>
        </div>
      </div>

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
                        <Link to={`/dashboard/editor/${featuredBook.id}`} className="action-pill editor">
                          Edit enrichments 🔗
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
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'all', label: 'All Publications' },
            { id: 'editing', label: 'Editing / Drafts' },
            { id: 'in_review', label: 'In Review' },
            { id: 'scheduled', label: 'Scheduled' },
            { id: 'published', label: 'Published' },
            { id: 'archived', label: 'Archived' },
          ].map((tabItem) => (
            <button
              key={tabItem.id}
              type="button"
              onClick={() => setWorkflowFilter(tabItem.id)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                workflowFilter === tabItem.id
                  ? 'bg-amber-400 text-slate-950 shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              {tabItem.label}
            </button>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="card empty">
          <p>No publications match your current filter. Upload a PDF or clear filters to get started.</p>
        </div>
      ) : (
        <div className="grid">
          {items.map((f) => {
            const wf = f.workflowStatus || (f.published ? 'published' : f.status === 'ready' ? 'editing' : 'processing');
            const pct = f.conversionProgress ?? (f.status === 'ready' ? 100 : 10);

            return (
              <div className="card fb" key={f.id}>
                <div className="cover relative">
                  {f.cover ? (
                    <img src={f.cover} alt={f.title} loading="lazy" decoding="async" />
                  ) : (
                    <div className="flex flex-col items-center justify-center p-4 text-center">
                      {f.status === 'failed' ? (
                        <>
                          <span className="text-red-500 font-bold text-xs mb-1">⚠️ Conversion Failed</span>
                          {f.conversionError && (
                            <span className="text-[10px] text-slate-500 line-clamp-2 mb-2">{f.conversionError}</span>
                          )}
                          <Button size="sm" variant="outline" onClick={() => retryBookConversion(f)}>
                            <RotateCcw className="h-3 w-3" /> Retry
                          </Button>
                        </>
                      ) : (
                        <div className="w-full px-3 space-y-2">
                          <span className="text-xs font-semibold text-amber-500 block">
                            ⏳ {f.conversionStep || 'Converting PDF…'} ({pct}%)
                          </span>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                            <div
                              className="h-full bg-amber-400 transition-all duration-300"
                              style={{ width: `${Math.max(5, pct)}%` }}
                            />
                          </div>
                          {pct <= 5 && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => triggerQueueDrain()}
                              className="mt-1"
                            >
                              ⚡ Convert Now
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Top-Right Version & Workflow Badges on Cover */}
                  <div className="absolute top-2 right-2 flex items-center gap-1">
                    <Badge variant="golden" className="shadow-sm backdrop-blur-md">
                      v{f.version || 1}
                    </Badge>
                    <Badge variant={getWorkflowBadgeVariant(wf)} className="uppercase shadow-sm backdrop-blur-md">
                      {wf.replace('_', ' ')}
                    </Badge>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <b className="fb-title" title={f.title}>
                    {f.title}
                  </b>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <span>{f.pageCount} pages</span>
                  <span>·</span>
                  <span>/v/{f.slug}</span>
                  {f.categoryName && (
                    <>
                      <span>·</span>
                      <span className="font-semibold text-amber-500">{f.categoryName}</span>
                    </>
                  )}
                </div>

                {f.scheduledAt && wf === 'scheduled' && (
                  <div className="mt-1 flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                    <Clock className="h-3 w-3" />
                    <span>Scheduled: {new Date(f.scheduledAt).toLocaleString()}</span>
                  </div>
                )}

                <div className="actions">
                  {f.status === 'ready' && (
                    <Link to={`/dashboard/preview/${f.id}`} className="action-pill preview">
                      Preview 👁️
                    </Link>
                  )}
                  <button
                    className="action-pill custom"
                    onClick={() => setLifecycleBook({ book: f, tab: 'workflow' })}
                    title="Workflow, Approval, Schedule, Versions & SEO"
                  >
                    Lifecycle & v{f.version || 1} 🔄
                  </button>
                  {f.status === 'ready' && (
                    <Link to={`/dashboard/editor/${f.id}`} className="action-pill editor">
                      Hotspots 🔗
                    </Link>
                  )}
                  {f.status === 'ready' && (
                    <Link to={`/dashboard/analytics/${f.id}`} className="action-pill analytics">
                      Analytics 📊
                    </Link>
                  )}
                  {f.status === 'ready' && (
                    <button className="action-pill custom" onClick={() => setCustomize(f)}>
                      Customize 🎨
                    </button>
                  )}
                  {f.status === 'ready' && (
                    <button className="action-pill share" onClick={() => setShare(f)}>
                      Share 🚀
                    </button>
                  )}
                  {f.status === 'ready' && (
                    <button
                      className="action-pill rename"
                      onClick={() => duplicateBook(f)}
                      title="Duplicate publication, pages & hotspots"
                    >
                      Duplicate 📋
                    </button>
                  )}
                  {f.status === 'failed' && (
                    <button className="action-pill preview" onClick={() => retryBookConversion(f)}>
                      Retry Conversion 🔁
                    </button>
                  )}
                  <button className="action-pill delete" onClick={() => remove(f)}>
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
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
