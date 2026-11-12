import { useEffect, useState, useRef, type FormEvent } from 'react';
import { api, uploadForm, ApiError } from '../api/client';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input, Textarea } from './ui/input';
import {
  CheckCircle2,
  Clock,
  FileText,
  GitBranch,
  Globe,
  History,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Tag,
  Upload,
  X,
  ExternalLink,
  Archive,
  AlertCircle,
  Download,
  FolderKanban,
} from './ui/icons';

export interface FlipbookVersionItem {
  id: number;
  versionNumber: number;
  pageCount: number;
  fileSizeBytes: number;
  notes: string;
  authorName: string;
  createdAt: string;
  downloadUrl: string;
}

export interface CategoryItem {
  id: number;
  name: string;
  slug: string;
  color: string;
  count?: number;
}

export interface CollectionItem {
  id: number;
  name: string;
  slug: string;
  count?: number;
}

interface LifecycleModalProps {
  book: any;
  categories: CategoryItem[];
  collections: CollectionItem[];
  onClose: () => void;
  onUpdated: () => void;
  initialTab?: 'workflow' | 'versions' | 'seo';
}

const WORKFLOW_STAGES = [
  { key: 'draft', label: '1. Draft', desc: 'Upload PDF & configure cover' },
  { key: 'processing', label: '2. Processing', desc: 'Generate multi-res pages & metadata' },
  { key: 'editing', label: '3. Editing', desc: 'Configure hotspots, links & media' },
  { key: 'in_review', label: '4. Review', desc: 'Awaiting editorial approval' },
  { key: 'scheduled', label: '5. Scheduled', desc: 'Queued for release date & expiry' },
  { key: 'published', label: '6. Published', desc: 'Live to intended audience' },
  { key: 'archived', label: '7. Archived', desc: 'Historical record retained' },
];

export default function PublicationLifecycleModal({
  book,
  categories,
  collections,
  onClose,
  onUpdated,
  initialTab = 'workflow',
}: LifecycleModalProps) {
  const [tab, setTab] = useState<'workflow' | 'versions' | 'seo'>(initialTab);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Workflow & Schedule state
  const [stage, setStage] = useState<string>(book.workflowStatus || (book.published ? 'published' : 'editing'));
  const [reviewNotes, setReviewNotes] = useState<string>(book.reviewNotes || '');
  const [scheduledAt, setScheduledAt] = useState<string>(
    book.scheduledAt ? book.scheduledAt.slice(0, 16).replace(' ', 'T') : ''
  );
  const [expiresAt, setExpiresAt] = useState<string>(
    book.expiresAt ? book.expiresAt.slice(0, 16).replace(' ', 'T') : ''
  );

  // Version History & Replace PDF state
  const [versions, setVersions] = useState<FlipbookVersionItem[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [replaceNotes, setReplaceNotes] = useState('');
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const replaceFileRef = useRef<HTMLInputElement>(null);

  // SEO, Slug, Categories & Collections state
  const [title, setTitle] = useState<string>(book.title || '');
  const [description, setDescription] = useState<string>(book.description || '');
  const [slug, setSlug] = useState<string>(book.slug || '');
  const [categoryId, setCategoryId] = useState<string>(book.categoryId ? String(book.categoryId) : '');
  const [collectionId, setCollectionId] = useState<string>(book.collectionId ? String(book.collectionId) : '');
  const [seoTitle, setSeoTitle] = useState<string>(book.seoMeta?.title || '');
  const [seoDesc, setSeoDesc] = useState<string>(book.seoMeta?.description || '');
  const [seoKeywords, setSeoKeywords] = useState<string>(book.seoMeta?.keywords || '');
  const [canonicalUrl, setCanonicalUrl] = useState<string>(book.seoMeta?.canonicalUrl || '');
  const [noindex, setNoindex] = useState<boolean>(Boolean(book.seoMeta?.noindex));

  const loadVersions = async () => {
    setLoadingVersions(true);
    try {
      const list = await api<FlipbookVersionItem[]>(`/flipbooks/${book.id}/versions`);
      setVersions(list);
    } catch {
      // ignore
    } finally {
      setLoadingVersions(false);
    }
  };

  useEffect(() => {
    if (tab === 'versions') {
      loadVersions();
    }
    // eslint-disable-next-line
  }, [tab, book.id]);

  const handleWorkflowTransition = async (targetStage: string) => {
    setSaving(true);
    setMsg(null);
    try {
      await api(`/flipbooks/${book.id}/workflow`, 'POST', {
        stage: targetStage,
        notes: reviewNotes,
        scheduledAt: scheduledAt || null,
        expiresAt: expiresAt || null,
      });
      setStage(targetStage);
      setMsg({ type: 'ok', text: `Publication transitioned to '${targetStage.replace('_', ' ')}' stage.` });
      onUpdated();
    } catch (e: any) {
      setMsg({ type: 'err', text: e instanceof ApiError ? e.message : 'Failed to update workflow stage' });
    } finally {
      setSaving(false);
    }
  };

  const handleReplacePdf = async (file: File) => {
    setUploadingPdf(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('notes', replaceNotes || `Updated PDF (v${(book.version || 1) + 1})`);
      await uploadForm(`/flipbooks/${book.id}/replace-pdf`, fd);
      setReplaceNotes('');
      setMsg({
        type: 'ok',
        text: 'New PDF uploaded and queued for multi-resolution conversion. Previous version preserved in history.',
      });
      loadVersions();
      onUpdated();
    } catch (e: any) {
      setMsg({ type: 'err', text: e instanceof ApiError ? (e.fields.file ?? e.message) : 'Failed to replace PDF' });
    } finally {
      setUploadingPdf(false);
    }
  };

  const handleRestoreVersion = async (ver: FlipbookVersionItem) => {
    if (!confirm(`Restore version v${ver.versionNumber}? This will re-render pages from v${ver.versionNumber}'s PDF.`)) {
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      await api(`/flipbooks/${book.id}/versions/${ver.id}/restore`, 'POST');
      setMsg({ type: 'ok', text: `Restoring publication to v${ver.versionNumber}...` });
      onUpdated();
    } catch (e: any) {
      setMsg({ type: 'err', text: e instanceof ApiError ? e.message : 'Failed to restore version' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSeoAndMetadata = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      await api(`/flipbooks/${book.id}`, 'PATCH', {
        title,
        description,
        slug,
        categoryId: categoryId ? Number(categoryId) : null,
        collectionId: collectionId ? Number(collectionId) : null,
        scheduledAt: scheduledAt || null,
        expiresAt: expiresAt || null,
        seoMeta: {
          title: seoTitle.trim(),
          description: seoDesc.trim(),
          keywords: seoKeywords.trim(),
          canonicalUrl: canonicalUrl.trim(),
          noindex,
        },
      });
      book.title = title;
      book.description = description;
      book.slug = slug;
      setMsg({ type: 'ok', text: 'Publication URL, taxonomy & SEO metadata saved.' });
      onUpdated();
    } catch (e: any) {
      setMsg({ type: 'err', text: e instanceof ApiError ? e.message : 'Failed to save metadata' });
    } finally {
      setSaving(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes <= 0) return '—';
    const mb = bytes / 1048576;
    return mb >= 1 ? `${mb.toFixed(2)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
  };

  const pdfMeta = book.pdfMetadata || {};

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400/15 text-amber-500">
              <GitBranch className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">{book.title}</h2>
                <Badge variant="golden">v{book.version || 1}</Badge>
                <Badge variant={stage === 'published' ? 'success' : stage === 'in_review' ? 'warning' : 'default'} className="uppercase">
                  {stage.replace('_', ' ')}
                </Badge>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Publishing Lifecycle, Version Control, Scheduling & SEO Management
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {book.previewUrl && (
              <a
                href={book.previewUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-600 hover:bg-amber-400/20 dark:text-amber-300"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Draft Preview
              </a>
            )}
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50/60 px-6 dark:border-slate-800 dark:bg-slate-950/40">
          <button
            type="button"
            onClick={() => { setTab('workflow'); setMsg(null); }}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition-colors ${
              tab === 'workflow'
                ? 'border-amber-400 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400'
            }`}
          >
            <ShieldCheck className="h-4 w-4" />
            1. Workflow, Review & Schedule
          </button>
          <button
            type="button"
            onClick={() => { setTab('versions'); setMsg(null); }}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition-colors ${
              tab === 'versions'
                ? 'border-amber-400 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400'
            }`}
          >
            <History className="h-4 w-4" />
            2. Version History & Replace PDF
          </button>
          <button
            type="button"
            onClick={() => { setTab('seo'); setMsg(null); }}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition-colors ${
              tab === 'seo'
                ? 'border-amber-400 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400'
            }`}
          >
            <Globe className="h-4 w-4" />
            3. Custom URL, Taxonomy & SEO
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {msg && (
            <div
              className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-xs font-medium ${
                msg.type === 'ok'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'
              }`}
            >
              {msg.type === 'ok' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
              <span>{msg.text}</span>
            </div>
          )}

          {tab === 'workflow' && (
            <div className="space-y-6">
              {/* 7-Stage Stepper */}
              <div>
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  7-Stage Publishing Lifecycle
                </h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-7">
                  {WORKFLOW_STAGES.map((s) => {
                    const isActive = stage === s.key;
                    return (
                      <button
                        key={s.key}
                        type="button"
                        disabled={saving || s.key === 'processing'}
                        onClick={() => handleWorkflowTransition(s.key)}
                        className={`flex flex-col items-start rounded-xl border p-2.5 text-left transition-all ${
                          isActive
                            ? 'border-amber-400 bg-amber-400/15 shadow-sm ring-1 ring-amber-400/40'
                            : 'border-slate-200 bg-slate-50/60 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-800/40'
                        }`}
                      >
                        <span className={`text-[11px] font-bold ${isActive ? 'text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-slate-200'}`}>
                          {s.label}
                        </span>
                        <span className="mt-1 text-[10px] leading-tight text-slate-500 dark:text-slate-400">
                          {s.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Approval & Editorial Review Box */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/30 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Editorial Review & Approval Workflow
                  </span>
                  {book.reviewedAt && (
                    <span className="text-[11px] text-slate-400">
                      Last reviewed: {new Date(book.reviewedAt).toLocaleString()}
                    </span>
                  )}
                </div>
                <Textarea
                  rows={2}
                  placeholder="Add reviewer notes, requested changes, or approval sign-off comments..."
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={saving}
                    onClick={() => handleWorkflowTransition('in_review')}
                  >
                    <Send className="h-3.5 w-3.5" />
                    Submit for Review
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={saving || book.status !== 'ready'}
                    onClick={() => handleWorkflowTransition('published')}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Approve & Publish Now
                  </Button>
                  {stage === 'in_review' && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={saving}
                      onClick={() => handleWorkflowTransition('editing')}
                    >
                      Request Changes (Return to Editing)
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={saving}
                    onClick={() => handleWorkflowTransition('archived')}
                  >
                    <Archive className="h-3.5 w-3.5" />
                    Archive
                  </Button>
                </div>
              </div>

              {/* Scheduled Publishing & Automatic Expiry */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/30 space-y-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-500" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Scheduled Release & Automatic Expiry
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                      Scheduled Publish Date & Time
                    </label>
                    <Input
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                      Automatic Expiry Date & Time (Optional)
                    </label>
                    <Input
                      type="datetime-local"
                      value={expiresAt}
                      onChange={(e) => setExpiresAt(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={saving || !scheduledAt}
                    onClick={() => handleWorkflowTransition('scheduled')}
                  >
                    <Clock className="h-3.5 w-3.5" />
                    Save & Set as Scheduled
                  </Button>
                </div>
              </div>
            </div>
          )}

          {tab === 'versions' && (
            <div className="space-y-6">
              {/* Replace PDF Card */}
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Replace PDF Document (Retain URL, Hotspots & History)
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Uploading a new PDF creates version v{(book.version || 1) + 1} while archiving v{book.version || 1} for instant rollback.
                    </p>
                  </div>
                  <input
                    ref={replaceFileRef}
                    type="file"
                    accept="application/pdf"
                    hidden
                    onChange={(e) => e.target.files?.[0] && handleReplacePdf(e.target.files[0])}
                  />
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={uploadingPdf}
                    onClick={() => replaceFileRef.current?.click()}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {uploadingPdf ? 'Uploading & Validating…' : 'Upload New PDF Version'}
                  </Button>
                </div>
                <Input
                  placeholder="Version release notes (e.g., Fixed typos on page 4, updated pricing table)..."
                  value={replaceNotes}
                  onChange={(e) => setReplaceNotes(e.target.value)}
                />
              </div>

              {/* Extracted PDF Metadata */}
              {pdfMeta && Object.keys(pdfMeta).length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/30">
                  <div className="mb-2 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-amber-500" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      Extracted PDF Technical Metadata
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                    <div>
                      <span className="text-slate-400 block">PDF Version</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">PDF {pdfMeta.pdf_version || '1.4'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">File Size</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{formatBytes(pdfMeta.file_size_bytes)}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Author / Creator</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200 truncate block">
                        {pdfMeta.author || pdfMeta.creator || '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Producer</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200 truncate block">
                        {pdfMeta.producer || 'Standard PDF'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Version History List */}
              <div>
                <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Publication Version History
                </h3>
                {loadingVersions ? (
                  <p className="text-xs text-slate-400 py-4">Loading version history…</p>
                ) : versions.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4">Current version v{book.version || 1} is active.</p>
                ) : (
                  <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                    {versions.map((v) => {
                      const isCurrent = v.versionNumber === (book.version || 1);
                      return (
                        <div key={v.id} className="flex items-center justify-between gap-4 px-4 py-3 text-xs">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <Badge variant={isCurrent ? 'golden' : 'default'}>v{v.versionNumber}</Badge>
                              <span className="font-semibold text-slate-800 dark:text-slate-100">
                                {v.notes || `Version ${v.versionNumber}`}
                              </span>
                              {isCurrent && <Badge variant="success">Active</Badge>}
                            </div>
                            <p className="text-[11px] text-slate-400">
                              {v.pageCount} pages • {formatBytes(v.fileSizeBytes)} • By {v.authorName} on{' '}
                              {new Date(v.createdAt).toLocaleString()}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {v.downloadUrl && (
                              <a
                                href={v.downloadUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                              >
                                <Download className="h-3 w-3" />
                                PDF
                              </a>
                            )}
                            {!isCurrent && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={saving}
                                onClick={() => handleRestoreVersion(v)}
                              >
                                <RotateCcw className="h-3 w-3" />
                                Restore v{v.versionNumber}
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'seo' && (
            <form onSubmit={handleSaveSeoAndMetadata} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Publication Title
                  </label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Custom Publication URL Slug (/v/slug)
                  </label>
                  <Input
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="e.g. annual-report-2026"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Summary / Description
                </label>
                <Textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief summary of this publication..."
                />
              </div>

              {/* Categories & Collections */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <Tag className="h-3.5 w-3.5 text-amber-500" />
                    Publication Category
                  </label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="">— Uncategorized —</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <FolderKanban className="h-3.5 w-3.5 text-amber-500" />
                    Publication Collection
                  </label>
                  <select
                    value={collectionId}
                    onChange={(e) => setCollectionId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="">— No Collection —</option>
                    {collections.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Custom SEO Metadata */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/30 space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Custom Search Engine Optimization (SEO) & OpenGraph
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                      SEO Meta Title
                    </label>
                    <Input
                      value={seoTitle}
                      onChange={(e) => setSeoTitle(e.target.value)}
                      placeholder={title || 'Custom title for search engines'}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                      SEO Keywords (comma-separated)
                    </label>
                    <Input
                      value={seoKeywords}
                      onChange={(e) => setSeoKeywords(e.target.value)}
                      placeholder="newsletter, fiji, magazine, 2026"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                    SEO Meta Description
                  </label>
                  <Textarea
                    rows={2}
                    value={seoDesc}
                    onChange={(e) => setSeoDesc(e.target.value)}
                    placeholder="Compelling description for Google search results and social sharing cards..."
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
                  <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={noindex}
                      onChange={(e) => setNoindex(e.target.checked)}
                      className="rounded border-slate-300 text-amber-500 focus:ring-amber-500"
                    />
                    <span>Hide from search engines (robots noindex, nofollow)</span>
                  </label>
                  <Button type="submit" variant="primary" size="sm" disabled={saving}>
                    {saving ? 'Saving…' : 'Save URL, Taxonomy & SEO'}
                  </Button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
