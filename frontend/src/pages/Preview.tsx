import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import CustomizationDialog from '../components/CustomizationDialog';
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
  const [error, setError] = useState('');

  const loadPreview = useCallback(() => {
    api<FlipbookDetails>(`/flipbooks/${id}`)
      .then((d) => {
        setData(d);
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
  }, [id]);

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  if (error) return <p className="center err">{error}</p>;
  if (!data) return <p className="center">Loading preview…</p>;

  return (
    <div className="preview-wrap">
      <div className="preview-topbar">
        <Link to="/dashboard" className="btn-back">← Back to Flipbooks</Link>
        <span className="preview-title">{data.title}</span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className="btn-pub-primary"
            onClick={() => setShowCustomize(true)}
            title="Open Flipbook Style & Customization Settings"
          >
            <span>Customize Style</span>
            <span>🎨</span>
          </button>
          <Link to={`/dashboard/editor/${data.id}`} className="btn-pub-outline">
            <span>Edit Hotspots</span>
            <span>✏️</span>
          </Link>
          <a href={`/v/${data.slug}`} target="_blank" rel="noreferrer" className="btn-pub-outline">
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
    </div>
  );
}
