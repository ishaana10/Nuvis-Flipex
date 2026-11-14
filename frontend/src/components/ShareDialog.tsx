import { useState } from 'react';
import { api } from '../api/client';
import type { Flipbook } from '../pages/Dashboard';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import {
  Check,
  Code,
  Copy,
  Download,
  ExternalLink,
  Globe,
  Lock,
  QrCode,
  Share2,
  X,
} from './ui/icons';

export default function ShareDialog({
  flipbook,
  onClose,
  onSaved,
}: {
  flipbook: Flipbook;
  onClose(): void;
  onSaved(): void;
}) {
  const [activeTab, setActiveTab] = useState<'link' | 'embed' | 'qr' | 'access'>('link');
  const [published, setPublished] = useState(
    flipbook.published || flipbook.workflowStatus === 'published'
  );
  const [visibility, setVisibility] = useState<'public' | 'unlisted' | 'password'>(
    flipbook.visibility
  );
  const [customSlug, setCustomSlug] = useState(flipbook.slug);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  // Link & Embed options
  const [startPage, setStartPage] = useState<number>(1);
  const [embedMode, setEmbedMode] = useState<'iframe' | 'lightbox' | 'oembed'>('iframe');
  const [embedWidth, setEmbedWidth] = useState('100%');
  const [embedHeight, setEmbedHeight] = useState('640');
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const baseUrl = `${window.location.origin}/v/${customSlug || flipbook.slug}`;
  const shareUrl = startPage > 1 ? `${baseUrl}?page=${startPage}` : baseUrl;
  const coverUrl = `${window.location.origin}/api/v1/public/${customSlug || flipbook.slug}/cover`;
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=12&data=${encodeURIComponent(
    shareUrl
  )}`;

  const iframeCode = `<iframe src="${shareUrl}" width="${embedWidth}" height="${embedHeight}" style="border:0; border-radius:12px; box-shadow:0 10px 30px rgba(0,0,0,0.18);" allowfullscreen allow="fullscreen; autoplay"></iframe>`;
  const lightboxCode = `<a href="${shareUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;text-decoration:none;text-align:center;font-family:sans-serif;">
  <img src="${coverUrl}" alt="${flipbook.title.replace(/"/g, '&quot;')}" style="max-width:260px;border-radius:10px;box-shadow:0 12px 28px rgba(0,0,0,0.22);display:block;margin-bottom:8px;" />
  <span style="display:inline-block;background:#F5C542;color:#0f172a;font-weight:700;padding:8px 16px;border-radius:999px;font-size:13px;">📖 Read Interactive Flipbook</span>
</a>`;
  const oembedUrl = `${window.location.origin}/api/v1/oembed?url=${encodeURIComponent(shareUrl)}`;

  const activeEmbedSnippet =
    embedMode === 'iframe' ? iframeCode : embedMode === 'lightbox' ? lightboxCode : oembedUrl;

  const copyText = (key: string, text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedField(key);
      setTimeout(() => setCopiedField(null), 2200);
    });
  };

  const save = async () => {
    setMsg('');
    setErr('');
    setSaving(true);
    try {
      await api(`/flipbooks/${flipbook.id}`, 'PATCH', {
        published,
        workflowStatus: published ? 'published' : 'editing',
        visibility,
        slug: customSlug.trim() || flipbook.slug,
        ...(password ? { password } : {}),
      });
      setMsg('Sharing & access settings saved!');
      setPassword('');
      onSaved();
    } catch (e: any) {
      setErr(e.fields?.password || e.fields?.slug || e.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadQr = async () => {
    try {
      const res = await fetch(qrImageUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${customSlug || flipbook.slug}-qr-code.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      window.open(qrImageUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400/15 text-amber-500">
              <Share2 className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Share & Distribute “{flipbook.title}”
                </h2>
                <Badge variant={published ? 'success' : 'warning'}>
                  {published ? 'LIVE' : 'DRAFT'}
                </Badge>
              </div>
              <p className="text-xs text-slate-500">
                Direct reader link, responsive website embeds, print-ready QR code & access protection
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50/70 px-6 dark:border-slate-800 dark:bg-slate-950/40">
          {[
            { id: 'link', label: 'Direct Link & Social', icon: Globe },
            { id: 'embed', label: 'Website Embed', icon: Code },
            { id: 'qr', label: 'QR Code (Print)', icon: QrCode },
            { id: 'access', label: 'Visibility & Password', icon: Lock },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-1.5 border-b-2 px-4 py-3 text-xs font-bold transition-colors ${
                  active
                    ? 'border-amber-400 text-amber-600 dark:text-amber-400'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {!published && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-xs">
              <div>
                <b className="text-amber-700 dark:text-amber-300">Publication is currently unpublished</b>
                <p className="text-slate-600 dark:text-slate-300 mt-0.5">
                  Enable public access below so readers can open your link without a draft token.
                </p>
              </div>
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  setPublished(true);
                  setTimeout(save, 10);
                }}
              >
                Publish Now
              </Button>
            </div>
          )}

          {/* TAB 1: DIRECT LINK & SOCIAL */}
          {activeTab === 'link' && (
            <div className="space-y-5">
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-200">
                  Public Reader Link
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={shareUrl}
                    onFocus={(e) => e.target.select()}
                    className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => copyText('shareUrl', shareUrl)}
                  >
                    {copiedField === 'shareUrl' ? (
                      <>
                        <Check className="h-3.5 w-3.5" /> Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" /> Copy Link
                      </>
                    )}
                  </Button>
                  <a
                    href={shareUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Open
                  </a>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Open at Specific Page (Deep Link)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={Math.max(1, flipbook.pageCount || 1)}
                    value={startPage}
                    onChange={(e) =>
                      setStartPage(
                        Math.max(1, Math.min(flipbook.pageCount || 999, Number(e.target.value) || 1))
                      )
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800"
                  />
                  <span className="mt-1 block text-[11px] text-slate-400">
                    Page 1 opens the cover; any other number jumps directly to that spread.
                  </span>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Custom URL Slug (`/v/...`)
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={customSlug}
                      onChange={(e) => setCustomSlug(e.target.value)}
                      className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800"
                    />
                    {customSlug !== flipbook.slug && (
                      <Button size="sm" variant="outline" onClick={save} disabled={saving}>
                        Save Slug
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-400">
                  One-Click Social & Direct Distribution
                </span>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(
                      `${flipbook.title} — Read interactive flipbook: ${shareUrl}`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-xs font-bold text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
                  >
                    💬 WhatsApp
                  </a>
                  <a
                    href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
                      shareUrl
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2.5 text-xs font-bold text-sky-700 hover:bg-sky-500/20 dark:text-sky-300"
                  >
                    💼 LinkedIn
                  </a>
                  <a
                    href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
                      flipbook.title
                    )}&url=${encodeURIComponent(shareUrl)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-slate-100 px-3 py-2.5 text-xs font-bold text-slate-800 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    𝕏 Post on X
                  </a>
                  <a
                    href={`mailto:?subject=${encodeURIComponent(
                      flipbook.title
                    )}&body=${encodeURIComponent(
                      `View our interactive digital publication "${flipbook.title}":\n\n${shareUrl}`
                    )}`}
                    className="flex items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs font-bold text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
                  >
                    ✉️ Send Email
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: WEBSITE EMBED */}
          {activeTab === 'embed' && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'iframe', label: '🖥️ Responsive 3D Iframe' },
                  { id: 'lightbox', label: '🖼️ Cover Image Card + Button' },
                  { id: 'oembed', label: '🔌 WordPress / oEmbed URL' },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setEmbedMode(m.id as any)}
                    className={`rounded-xl border px-3.5 py-2 text-xs font-bold transition ${
                      embedMode === m.id
                        ? 'border-amber-400 bg-amber-400/15 text-amber-600 dark:text-amber-300'
                        : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {embedMode === 'iframe' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                      Embed Width
                    </label>
                    <input
                      type="text"
                      value={embedWidth}
                      onChange={(e) => setEmbedWidth(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                      Embed Height (px)
                    </label>
                    <input
                      type="text"
                      value={embedHeight}
                      onChange={(e) => setEmbedHeight(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
                    />
                  </div>
                </div>
              )}

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    Embed Code Snippet
                  </span>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => copyText('embed', activeEmbedSnippet)}
                  >
                    {copiedField === 'embed' ? (
                      <>
                        <Check className="h-3.5 w-3.5" /> Copied Code!
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" /> Copy Code
                      </>
                    )}
                  </Button>
                </div>
                <textarea
                  readOnly
                  rows={4}
                  value={activeEmbedSnippet}
                  onFocus={(e) => e.target.select()}
                  className="w-full rounded-xl border border-slate-200 bg-slate-950 p-3 font-mono text-xs text-amber-300"
                />
              </div>
            </div>
          )}

          {/* TAB 3: QR CODE */}
          {activeTab === 'qr' && (
            <div className="flex flex-col items-center space-y-4 py-2 text-center">
              <div className="rounded-2xl border-2 border-amber-400/50 bg-white p-4 shadow-lg">
                <img
                  src={qrImageUrl}
                  alt={`QR Code for ${flipbook.title}`}
                  className="h-48 w-48 object-contain"
                />
              </div>
              <div className="max-w-sm space-y-1">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Print-Ready Mobile QR Code
                </h3>
                <p className="text-xs text-slate-500">
                  Place this QR code on printed brochures, store shelves, table tents, or business cards. Scanning opens{' '}
                  <b>{flipbook.title}</b> immediately on any smartphone.
                </p>
              </div>
              <div className="flex gap-2.5">
                <Button size="sm" variant="primary" onClick={handleDownloadQr}>
                  <Download className="h-3.5 w-3.5" /> Download High-Res PNG
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyText('qrLink', shareUrl)}
                >
                  {copiedField === 'qrLink' ? '✓ Link Copied' : 'Copy Target URL'}
                </Button>
              </div>
            </div>
          )}

          {/* TAB 4: VISIBILITY & PASSWORD */}
          {activeTab === 'access' && (
            <div className="space-y-4">
              <label className="flex items-center justify-between rounded-xl border border-slate-200 p-3.5 dark:border-slate-800">
                <div>
                  <span className="block text-xs font-bold text-slate-900 dark:text-white">
                    Published & Live
                  </span>
                  <span className="text-[11px] text-slate-500">
                    When enabled, readers can view this publication at <code>/v/{customSlug}</code>
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={published}
                  onChange={(e) => setPublished(e.target.checked)}
                  className="h-4 w-4 accent-amber-400"
                />
              </label>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-200">
                  Access Visibility Level
                </label>
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value as any)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-medium dark:border-slate-700 dark:bg-slate-800"
                >
                  <option value="public">🌍 Public (Indexed & accessible to everyone)</option>
                  <option value="unlisted">🔗 Unlisted (Only people with the direct link)</option>
                  <option value="password">🔒 Password Protected (Requires reader password)</option>
                </select>
              </div>

              {visibility === 'password' && (
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-200">
                    Reader Unlock Password{' '}
                    {flipbook.visibility === 'password' && (
                      <span className="font-normal text-slate-400">(leave blank to keep current password)</span>
                    )}
                  </label>
                  <input
                    type="password"
                    placeholder="Enter new reader password…"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs dark:border-slate-700 dark:bg-slate-800"
                  />
                </div>
              )}

              {msg && <p className="text-xs font-semibold text-emerald-600">{msg}</p>}
              {err && <p className="text-xs font-semibold text-red-500">{err}</p>}

              <div className="flex justify-end pt-2">
                <Button variant="primary" size="sm" onClick={save} disabled={saving}>
                  {saving ? 'Saving…' : 'Save Access Settings'}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/60 px-6 py-3.5 dark:border-slate-800 dark:bg-slate-950/50">
          <span className="text-[11px] text-slate-400">
            Slug: <code>/v/{customSlug}</code> · {flipbook.pageCount} pages
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
