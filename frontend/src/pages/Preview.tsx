import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import CustomizationDialog from '../components/CustomizationDialog';
import ShareDialog from '../components/ShareDialog';
import FlipexLoader from '../components/FlipexLoader';
import FlipbookViewer, {
  type PageInfo,
  type TocItem,
  type ViewerHotspot,
  type ViewerSettings,
} from '../components/FlipbookViewer';

interface FlipbookDetails {
  id: number;
  title: string;
  description?: string;
  tenantName?: string;
  slug: string;
  publicSlug?: string;
  companySlug?: string;
  canonicalUrl?: string;
  status?: 'uploading' | 'processing' | 'ready' | 'failed';
  published?: boolean;
  workflowStatus?: string;
  pageCount?: number;
  visibility?: 'public' | 'unlisted' | 'password';
  settings?: ViewerSettings;
  toc?: TocItem[];
  pages: PageInfo[];
}

export default function Preview() {
  const { id } = useParams();
  const [data, setData] = useState<FlipbookDetails | null>(null);
  const [hotspots, setHotspots] = useState<Record<number, ViewerHotspot[]>>({});
  const [showCustomize, setShowCustomize] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [error, setError] = useState('');
  const [sessionId] = useState(() => 'sess_' + Math.random().toString(36).slice(2, 12));

  const loadPreview = useCallback(() => {
    api<FlipbookDetails>(`/flipbooks/${id}`)
      .then((d) => {
        setData(d);
        if (d?.slug) {
          fetch(`/api/v1/public/${encodeURIComponent(d.slug)}/view`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId,
              referrer: document.referrer || 'Dashboard Preview',
            }),
          }).catch(() => {});
        }
        api<ViewerHotspot[]>(`/flipbooks/${id}/hotspots`).then((list) => {
          const grouped: Record<number, ViewerHotspot[]> = {};
          for (const h of list) {
            const p = (h as any).pageNumber || 1;
            grouped[p] = grouped[p] || [];
            grouped[p].push(h);
          }
          setHotspots(grouped);
        });
      })
      .catch((err) => setError(err.message || 'Failed to load preview'));
  }, [id, sessionId]);

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  if (error) return <p className="center err">{error}</p>;
  if (!data) return <FlipexLoader size="hero" label="Preparing publication preview…" />;

  return (
    <div className="preview-wrap">
      <div className="preview-topbar">
        <Link to="/dashboard" className="btn-back">← Back to Flipbooks</Link>
        <span className="preview-title">{data.title}</span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className="btn-pub-primary"
            onClick={() => setShowShare(true)}
            title="Publish & Share Flipbook, Branded URL, QR Code & Embed"
          >
            <span>🚀</span>
            <span>{data.published && data.workflowStatus === 'published' ? 'Share & Published' : 'Publish & Share'}</span>
          </button>
          <button
            type="button"
            className="btn-pub-outline"
            onClick={() => setShowCustomize(true)}
            title="Open Flipbook Style & Customization Settings"
          >
            <span>Customize Style</span>
            <span>🎨</span>
          </button>
          <Link
            to={`/dashboard/editor/${data.id}`}
            className="btn-pub-outline"
            title="Open Interactive Page Designer & Enrichments Studio"
          >
            <span>🎨</span>
            <span>Interactive Page Designer</span>
          </Link>
          <a
            href={data.canonicalUrl || `/v/${data.slug}`}
            target="_blank"
            rel="noreferrer"
            className="btn-pub-outline"
          >
            <span>Open Reader Link</span>
            <span>↗</span>
          </a>
        </div>
      </div>

      <FlipbookViewer
        pages={data.pages}
        title={data.title}
        description={data.description}
        tenantName={data.tenantName}
        slug={data.slug}
        settings={data.settings}
        hotspots={hotspots}
        toc={data.toc}
        enableTelemetry={true}
        sessionId={sessionId}
      />

      {showCustomize && (
        <CustomizationDialog
          flipbook={{
            id: data.id,
            title: data.title,
            description: data.description,
            visibility: data.visibility || 'public',
            settings: data.settings as any,
          }}
          onClose={() => setShowCustomize(false)}
          onSaved={loadPreview}
        />
      )}

      {showShare && (
        <ShareDialog
          flipbook={{
            id: data.id,
            title: data.title,
            description: data.description,
            slug: data.slug,
            publicSlug: data.publicSlug,
            companySlug: data.companySlug,
            canonicalUrl: data.canonicalUrl,
            status: data.status || 'ready',
            published: Boolean(data.published),
            workflowStatus: (data.workflowStatus as any) || (data.published ? 'published' : 'editing'),
            visibility: data.visibility || 'public',
            pageCount: data.pageCount || data.pages.length,
            cover: data.pages[0]?.thumb || data.pages[0]?.image || null,
            settings: data.settings as any,
          }}
          onClose={() => setShowShare(false)}
          onSaved={loadPreview}
        />
      )}
    </div>
  );
}
