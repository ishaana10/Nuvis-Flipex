import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
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
  settings?: ViewerSettings;
  toc?: TocItem[];
  pages: PageInfo[];
}

export default function Preview() {
  const { id } = useParams();
  const [data, setData] = useState<FlipbookDetails | null>(null);
  const [hotspots, setHotspots] = useState<Record<number, ViewerHotspot[]>>({});
  const [error, setError] = useState('');

  useEffect(() => {
    api<FlipbookDetails>(`/flipbooks/${id}`)
      .then((d) => {
        setData(d);
        // Also fetch hotspots
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

  if (error) return <p className="center err">{error}</p>;
  if (!data) return <p className="center">Loading preview…</p>;

  return (
    <div className="preview-wrap">
      <div className="preview-topbar">
        <Link to="/dashboard" className="btn-back">← Back to Flipbooks</Link>
        <span className="preview-title">{data.title}</span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Link to={`/dashboard/editor/${data.id}`} className="btn-pub">
            Edit Hotspots ✏️
          </Link>
          <a href={`/v/${data.slug}`} target="_blank" rel="noreferrer" className="btn-pub">
            Open Reader Link ↗
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
    </div>
  );
}
