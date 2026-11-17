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
  Lock,
} from './ui/icons';

const GraduationCap = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
    <path d="M6 12v5c3 3 9 3 12 0v-5" />
  </svg>
);

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
  initialTab?: 'workflow' | 'versions' | 'seo' | 'education';
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
  const [tab, setTab] = useState<'workflow' | 'versions' | 'seo' | 'education'>(initialTab);
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

  // Educational & Academic Publishing state
  const bookSettings = book.settings || {};
  const [eduCategory, setEduCategory] = useState<string>(bookSettings.educationalCategory || 'general');
  const [academicTerm, setAcademicTerm] = useState<string>(bookSettings.academicTerm || '');
  const [teacherReviewer, setTeacherReviewer] = useState<string>(bookSettings.teacherReviewer || '');
  const [pinProtection, setPinProtection] = useState<boolean>(!!bookSettings.pinProtection);
  const [pinCode, setPinCode] = useState<string>(bookSettings.pinCode || '');
  const [pinHint, setPinHint] = useState<string>(bookSettings.pinHint || '');
  const [domainRestrictionEnabled, setDomainRestrictionEnabled] = useState<boolean>(!!bookSettings.domainRestrictionEnabled);
  const [allowedDomains, setAllowedDomains] = useState<string>(bookSettings.allowedDomains || '');

  // Attached worksheets & lesson resources
  const [modalResources, setModalResources] = useState<any[]>([]);
  const [loadingResources, setLoadingResources] = useState(false);
  const [newResTitle, setNewResTitle] = useState('');
  const [newResType, setNewResType] = useState('worksheet');
  const [newResPage, setNewResPage] = useState<string>('');
  const [newResFileUrl, setNewResFileUrl] = useState('');
  const [newResDesc, setNewResDesc] = useState('');
  const [creatingRes, setCreatingRes] = useState(false);

  // Phase 5: Pacific Regional Directory & AI Assistant state
  const [runningAiAssist, setRunningAiAssist] = useState(false);
  const [listInDirectory, setListInDirectory] = useState(false);
  const [dirCountry, setDirCountry] = useState('FJ');
  const [dirRegion, setDirRegion] = useState('');
  const [dirCategory, setDirCategory] = useState('commercial');
  const [dirTags, setDirTags] = useState('');
  const [savingDirectory, setSavingDirectory] = useState(false);

  useEffect(() => {
    if (tab === 'seo' && book.id) {
      api<any>(`/directory/entry/${book.id}`, 'GET')
        .then((res) => {
          if (res?.entry) {
            setListInDirectory(Boolean(res.entry.is_public));
            if (res.entry.country_code) setDirCountry(res.entry.country_code);
            if (res.entry.region_name) setDirRegion(res.entry.region_name);
            if (res.entry.category) setDirCategory(res.entry.category);
            if (res.entry.tags) setDirTags(res.entry.tags);
          }
        })
        .catch(() => {});
    }
  }, [tab, book.id]);

  const handleRunAiAssist = async () => {
    setRunningAiAssist(true);
    setMsg(null);
    try {
      const res = await api<any>(`/flipbooks/${book.id}/ai-assist`, 'POST', { apply: true });
      if (res?.seoMeta) {
        if (res.seoMeta.title) setSeoTitle(res.seoMeta.title);
        if (res.seoMeta.description) setSeoDesc(res.seoMeta.description);
        if (res.seoMeta.keywords) setSeoKeywords(res.seoMeta.keywords);
      }
      setMsg({
        type: 'ok',
        text: res.summary || 'AI auto-extracted table of contents bookmarks and generated SEO metadata successfully.',
      });
      onUpdated();
    } catch (e: any) {
      setMsg({ type: 'err', text: e instanceof ApiError ? e.message : 'AI assistant extraction failed' });
    } finally {
      setRunningAiAssist(false);
    }
  };

  const handleSaveDirectoryListing = async () => {
    setSavingDirectory(true);
    setMsg(null);
    try {
      await api('/directory/publish', 'POST', {
        flipbook_id: book.id,
        country_code: dirCountry,
        region_name: dirRegion.trim(),
        category: dirCategory,
        tags: dirTags.trim(),
        is_public: listInDirectory ? 1 : 0,
      });
      setMsg({ type: 'ok', text: 'Pacific Regional Directory listing updated successfully.' });
      onUpdated();
    } catch (e: any) {
      setMsg({ type: 'err', text: e instanceof ApiError ? e.message : 'Failed to update directory listing' });
    } finally {
      setSavingDirectory(false);
    }
  };

  const loadEducationalResources = async () => {
    setLoadingResources(true);
    try {
      const res = await api<any>(`/education/resources?flipbook_id=${book.id}`, 'GET');
      if (res?.resources && Array.isArray(res.resources)) {
        setModalResources(res.resources);
      }
    } catch {
      // ignore
    } finally {
      setLoadingResources(false);
    }
  };

  useEffect(() => {
    if (tab === 'education') {
      loadEducationalResources();
    }
  }, [tab, book.id]);

  const handleSaveEducationalSettings = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const updatedSettings = {
        ...(book.settings || {}),
        educationalCategory: eduCategory,
        academicTerm: academicTerm.trim(),
        teacherReviewer: teacherReviewer.trim(),
        pinProtection,
        pinCode: pinCode.trim(),
        pinHint: pinHint.trim(),
        domainRestrictionEnabled,
        allowedDomains: allowedDomains.trim(),
      };
      await api(`/flipbooks/${book.id}`, 'PATCH', {
        settings: updatedSettings,
      });
      book.settings = updatedSettings;
      setMsg({ type: 'ok', text: 'School & academic publishing settings saved.' });
      onUpdated();
    } catch (e: any) {
      setMsg({ type: 'err', text: e instanceof ApiError ? e.message : 'Failed to save educational settings' });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateResource = async (e: FormEvent) => {
    e.preventDefault();
    if (!newResTitle.trim() || !newResFileUrl.trim()) {
      setMsg({ type: 'err', text: 'Title and Resource File / Link URL are required' });
      return;
    }
    setCreatingRes(true);
    setMsg(null);
    try {
      await api('/education/resources', 'POST', {
        flipbook_id: book.id,
        page_number: newResPage ? parseInt(newResPage, 10) : null,
        title: newResTitle.trim(),
        resource_type: newResType,
        external_url: newResFileUrl.trim(),
        description: newResDesc.trim(),
      });
      setNewResTitle('');
      setNewResPage('');
      setNewResFileUrl('');
      setNewResDesc('');
      setMsg({ type: 'ok', text: 'Lesson resource attached successfully.' });
      loadEducationalResources();
    } catch (e: any) {
      setMsg({ type: 'err', text: e instanceof ApiError ? e.message : 'Failed to attach resource' });
    } finally {
      setCreatingRes(false);
    }
  };

  const handleDeleteResource = async (id: number) => {
    if (!confirm('Remove this attached lesson resource?')) return;
    try {
      await api(`/education/resources/${id}`, 'DELETE');
      setModalResources((prev) => prev.filter((r) => r.id !== id));
      setMsg({ type: 'ok', text: 'Resource removed.' });
    } catch (e: any) {
      setMsg({ type: 'err', text: e instanceof ApiError ? e.message : 'Failed to remove resource' });
    }
  };

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
          <button
            type="button"
            onClick={() => { setTab('education'); setMsg(null); }}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition-colors ${
              tab === 'education'
                ? 'border-amber-400 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400'
            }`}
          >
            <GraduationCap className="h-4 w-4" />
            4. School & Academic Publishing
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
            <div className="space-y-6">
              {/* AI Publishing Assistant Card */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-400/20 text-amber-500 font-bold">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white">
                      AI Publishing Assistant
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Auto-extract interactive Table of Contents bookmarks, SEO summary, and search keywords from page text.
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRunAiAssist}
                  disabled={runningAiAssist}
                  className="shrink-0 text-xs font-semibold border-amber-400/40 text-amber-600 dark:text-amber-300 hover:bg-amber-400/20"
                >
                  {runningAiAssist ? 'Scanning Document Pages…' : '✨ Auto-Generate with AI'}
                </Button>
              </div>

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

            {/* Pacific Regional Directory Listing Card */}
            <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                  <span>🌴</span>
                  Pacific Regional Directory Listing (/explore)
                </div>
                <Badge variant={listInDirectory ? 'success' : 'default'}>
                  {listInDirectory ? 'Listed in Directory' : 'Private'}
                </Badge>
              </div>

              <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={listInDirectory}
                  onChange={(e) => setListInDirectory(e.target.checked)}
                  className="rounded border-slate-300 text-amber-500 focus:ring-amber-500"
                />
                <span>Publish this digital catalogue to the Pacific Regional Directory</span>
              </label>

              {listInDirectory && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">
                      Island / Country
                    </label>
                    <select
                      value={dirCountry}
                      onChange={(e) => setDirCountry(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 shadow-sm focus:border-amber-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      <option value="FJ">🇫🇯 Fiji Islands</option>
                      <option value="WS">🇼🇸 Samoa</option>
                      <option value="TO">🇹🇴 Tonga</option>
                      <option value="VU">🇻🇺 Vanuatu</option>
                      <option value="PG">🇵🇬 Papua New Guinea</option>
                      <option value="SB">🇸🇧 Solomon Islands</option>
                      <option value="AU">🇦🇺 Australia</option>
                      <option value="NZ">🇳🇿 New Zealand</option>
                      <option value="PACIFIC">🌴 Pan-Pacific</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">
                      City / Region Name
                    </label>
                    <Input
                      value={dirRegion}
                      onChange={(e) => setDirRegion(e.target.value)}
                      placeholder="e.g. Suva, Nadi, Lautoka, Apia"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">
                      Directory Category
                    </label>
                    <select
                      value={dirCategory}
                      onChange={(e) => setDirCategory(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 shadow-sm focus:border-amber-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      <option value="commercial">🛍️ Commercial & Retail</option>
                      <option value="education">🎓 School & Academic</option>
                      <option value="tourism">🏖️ Tourism & Hospitality</option>
                      <option value="government">🏛️ Government & Public</option>
                      <option value="lifestyle">📖 Magazines & Culture</option>
                      <option value="general">🌐 General Publication</option>
                    </select>
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSaveDirectoryListing}
                  disabled={savingDirectory}
                >
                  {savingDirectory ? 'Updating Directory…' : 'Update Directory Listing'}
                </Button>
              </div>
            </div>
          </div>
        )}

          {tab === 'education' && (
            <div className="space-y-6">
              {/* Card 1: School & Academic Metadata */}
              <form onSubmit={handleSaveEducationalSettings} className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950/30">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                  <GraduationCap className="h-4 w-4 text-amber-500" />
                  Institutional Classification & Governance
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                      Publication Academic Type
                    </label>
                    <select
                      value={eduCategory}
                      onChange={(e) => setEduCategory(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 shadow-sm focus:border-amber-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      <option value="general">General Academic</option>
                      <option value="yearbook">School / University Yearbook</option>
                      <option value="newsletter">School Newsletter / Bulletin</option>
                      <option value="syllabus">Curriculum Syllabus & Course Outline</option>
                      <option value="exam_paper">Past Exam Paper / Revision Guide</option>
                      <option value="sports_program">Sports Fixtures & Carnival Program</option>
                      <option value="handbook">Student / Faculty Handbook</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                      Academic Term / Cohort
                    </label>
                    <Input
                      value={academicTerm}
                      onChange={(e) => setAcademicTerm(e.target.value)}
                      placeholder="e.g. Term 1 2026, Semester 1, Class of 2026"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                    Teacher / Faculty Reviewer Sign-off
                  </label>
                  <Input
                    value={teacherReviewer}
                    onChange={(e) => setTeacherReviewer(e.target.value)}
                    placeholder="e.g. Dr. H. Henderson (Head of Science)"
                  />
                </div>

                {/* Card 2: Student & Classroom Access Protection */}
                <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Student & Classroom Access Controls
                  </div>

                  {/* Quick PIN Code */}
                  <div className="rounded-lg border border-slate-200/80 bg-white p-3.5 dark:border-slate-800/80 dark:bg-slate-900/60 space-y-3">
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={pinProtection}
                        onChange={(e) => setPinProtection(e.target.checked)}
                        className="rounded border-slate-300 text-amber-500 focus:ring-amber-500"
                      />
                      <span>Enable Quick 4-6 Digit Student/Parent PIN Access</span>
                    </label>

                    {pinProtection && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-6">
                        <div>
                          <label className="block text-[11px] font-medium text-slate-500 mb-1">
                            PIN Code (4-6 digits)
                          </label>
                          <Input
                            value={pinCode}
                            onChange={(e) => setPinCode(e.target.value)}
                            placeholder="e.g. 2026"
                            maxLength={8}
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-slate-500 mb-1">
                            PIN Hint for Students
                          </label>
                          <Input
                            value={pinHint}
                            onChange={(e) => setPinHint(e.target.value)}
                            placeholder="e.g. Distributed in classroom agenda"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Institutional Email Domain restriction */}
                  <div className="rounded-lg border border-slate-200/80 bg-white p-3.5 dark:border-slate-800/80 dark:bg-slate-900/60 space-y-3">
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={domainRestrictionEnabled}
                        onChange={(e) => setDomainRestrictionEnabled(e.target.checked)}
                        className="rounded border-slate-300 text-amber-500 focus:ring-amber-500"
                      />
                      <span>Restrict Access to Institutional Email Domains</span>
                    </label>

                    {domainRestrictionEnabled && (
                      <div className="pl-6">
                        <label className="block text-[11px] font-medium text-slate-500 mb-1">
                          Allowed School Domains (comma-separated)
                        </label>
                        <Input
                          value={allowedDomains}
                          onChange={(e) => setAllowedDomains(e.target.value)}
                          placeholder="e.g. school.edu, students.school.edu"
                        />
                        <p className="mt-1 text-[10px] text-slate-400">
                          Students and teachers must authenticate with their official school email matching these domains.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button type="submit" variant="primary" size="sm" disabled={saving}>
                    {saving ? 'Saving…' : 'Save Academic Settings'}
                  </Button>
                </div>
              </form>

              {/* Card 3: Attached Lesson Resources & Worksheets Drawer Manager */}
              <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                    <Download className="h-4 w-4 text-sky-500" />
                    Lesson Worksheets & Syllabus Attachments ({modalResources.length})
                  </div>
                  <Badge variant="default">Drawer Tab</Badge>
                </div>

                {/* List of existing resources */}
                {loadingResources ? (
                  <div className="py-4 text-center text-xs text-slate-500">Loading attached resources…</div>
                ) : modalResources.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500 dark:border-slate-700">
                    No classroom worksheets or past papers attached yet. Use the form below to attach one.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {modalResources.map((res: any) => (
                      <div
                        key={res.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-sky-500 dark:text-sky-300">
                              {res.resource_type || res.resourceType}
                            </span>
                            {res.page_number || res.pageNumber ? (
                              <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                Page {res.page_number || res.pageNumber}
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-400">All pages</span>
                            )}
                          </div>
                          <div className="truncate text-xs font-semibold text-slate-900 dark:text-white mt-1">
                            {res.title}
                          </div>
                          {(res.description) && (
                            <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                              {res.description}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <a
                            href={res.file_url || res.fileUrl || res.external_url || res.externalUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded p-1 text-slate-500 hover:text-amber-500 dark:text-slate-400"
                            title="Open link"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                          <button
                            type="button"
                            onClick={() => handleDeleteResource(res.id)}
                            className="rounded p-1 text-slate-400 hover:text-red-500"
                            title="Remove attachment"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Form to attach a new resource */}
                <form onSubmit={handleCreateResource} className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Attach New Worksheet, Past Paper or Syllabus Link
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">
                        Resource Title *
                      </label>
                      <Input
                        value={newResTitle}
                        onChange={(e) => setNewResTitle(e.target.value)}
                        placeholder="e.g. Physics Lab 3 Worksheet, 2025 Mid-Year Paper"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">
                        Resource Type
                      </label>
                      <select
                        value={newResType}
                        onChange={(e) => setNewResType(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 shadow-sm focus:border-amber-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      >
                        <option value="worksheet">Classroom Worksheet</option>
                        <option value="past_paper">Past Exam Paper</option>
                        <option value="syllabus">Course Syllabus</option>
                        <option value="homework">Homework Assignment</option>
                        <option value="guide">Study & Revision Guide</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">
                        Download / External URL *
                      </label>
                      <Input
                        value={newResFileUrl}
                        onChange={(e) => setNewResFileUrl(e.target.value)}
                        placeholder="https://... PDF, Google Drive link, or worksheet URL"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">
                        Associated Page # (optional)
                      </label>
                      <Input
                        type="number"
                        min="1"
                        value={newResPage}
                        onChange={(e) => setNewResPage(e.target.value)}
                        placeholder="e.g. 5"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">
                      Instructions / Description
                    </label>
                    <Input
                      value={newResDesc}
                      onChange={(e) => setNewResDesc(e.target.value)}
                      placeholder="e.g. Complete questions 1 to 10 before Thursday lecture."
                    />
                  </div>

                  <div className="flex justify-end pt-1">
                    <Button type="submit" variant="outline" size="sm" disabled={creatingRes}>
                      {creatingRes ? 'Attaching…' : 'Attach Lesson Resource'}
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
