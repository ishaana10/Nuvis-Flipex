import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import type { PageInfo } from '../components/FlipbookViewer';

export interface Hotspot {
  id?: number;
  pageNumber: number;
  type: 'link' | 'video';
  x: number;
  y: number;
  w: number;
  h: number;
  payload: { url?: string; title?: string };
}

interface FlipbookDetails {
  id: number;
  title: string;
  slug: string;
  pages: PageInfo[];
}

export default function HotspotEditor() {
  const { id } = useParams();
  const [details, setDetails] = useState<FlipbookDetails | null>(null);
  const [page, setPage] = useState<number>(1);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [selected, setSelected] = useState<Hotspot | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const stageRef = useRef<HTMLDivElement>(null);

  // Load details and hotspots
  useEffect(() => {
    api<FlipbookDetails>(`/flipbooks/${id}`).then((d) => setDetails(d));
    loadHotspots();
  }, [id]);

  const loadHotspots = () => {
    api<Hotspot[]>(`/flipbooks/${id}/hotspots`).then((list) => {
      setHotspots(list);
    });
  };

  const currentPage = details?.pages.find((p) => p.n === page);
  const pageHotspots = hotspots.filter((h) => h.pageNumber === page);

  const addHotspot = (type: 'link' | 'video') => {
    const newHotspot: Hotspot = {
      pageNumber: page,
      type,
      x: 25,
      y: 25,
      w: 30,
      h: 15,
      payload: {
        url: type === 'link' ? 'https://' : 'https://www.youtube.com/watch?v=',
        title: type === 'link' ? 'Website Link' : 'Featured Video',
      },
    };

    setSaving(true);
    api<Hotspot>(`/flipbooks/${id}/hotspots`, 'POST', newHotspot)
      .then((created) => {
        setHotspots([...hotspots, created]);
        setSelected(created);
        setMsg('Hotspot added');
      })
      .finally(() => setSaving(false));
  };

  const updateSelected = (updates: Partial<Hotspot>) => {
    if (!selected || !selected.id) return;
    const updated = { ...selected, ...updates };
    setSelected(updated);
    setHotspots(hotspots.map((h) => (h.id === updated.id ? updated : h)));

    api(`/flipbooks/${id}/hotspots/${selected.id}`, 'PATCH', updated).then(() => {
      setMsg('Saved');
    });
  };

  const removeHotspot = (hid?: number) => {
    if (!hid) return;
    if (!confirm('Delete this hotspot?')) return;
    api(`/flipbooks/${id}/hotspots/${hid}`, 'DELETE').then(() => {
      setHotspots(hotspots.filter((h) => h.id !== hid));
      if (selected?.id === hid) setSelected(null);
      setMsg('Deleted');
    });
  };

  if (!details) return <p className="center">Loading hotspot editor…</p>;

  return (
    <div className="editor-wrap">
      <div className="preview-topbar">
        <Link to="/dashboard" className="btn-back">← Back to Flipbooks</Link>
        <span className="preview-title">Hotspots: {details.title}</span>
        <div style={{ display: 'flex', gap: '10px' }}>
          <Link to={`/dashboard/preview/${details.id}`} className="btn-pub-primary">
            <span>Preview</span> <span>👁️</span>
          </Link>
        </div>
      </div>

      <div className="editor-layout">
        {/* Left Sidebar: Pages & Hotspot List */}
        <div className="editor-sidebar card">
          <h3>Pages</h3>
          <div className="editor-pages-nav">
            <button
              disabled={page <= 1}
              onClick={() => { setPage(page - 1); setSelected(null); }}
            >
              ‹
            </button>
            <span>Page {page} of {details.pages.length}</span>
            <button
              disabled={page >= details.pages.length}
              onClick={() => { setPage(page + 1); setSelected(null); }}
            >
              ›
            </button>
          </div>

          <div className="editor-add-actions">
            <button className="btn-primary" onClick={() => addHotspot('link')} disabled={saving}>
              + Link Hotspot
            </button>
            <button className="btn-secondary" onClick={() => addHotspot('video')} disabled={saving}>
              + Video Hotspot
            </button>
          </div>

          <hr style={{ margin: '16px 0', borderColor: '#eee' }} />

          <h3>Page Hotspots ({pageHotspots.length})</h3>
          {pageHotspots.length === 0 ? (
            <p className="muted" style={{ fontSize: '13px' }}>
              No hotspots on this page yet. Click a button above to add one!
            </p>
          ) : (
            <div className="hotspot-list">
              {pageHotspots.map((h) => (
                <div
                  key={h.id}
                  className={`hotspot-item ${selected?.id === h.id ? 'active' : ''}`}
                  onClick={() => setSelected(h)}
                >
                  <span className="hotspot-badge">{h.type === 'video' ? '🎬' : '🔗'}</span>
                  <div className="hotspot-meta">
                    <b>{h.payload.title || (h.type === 'video' ? 'Video' : 'Link')}</b>
                    <small className="muted">{h.payload.url || 'No URL set'}</small>
                  </div>
                  <button
                    className="link err"
                    onClick={(e) => { e.stopPropagation(); removeHotspot(h.id); }}
                    title="Delete"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {selected && (
            <div className="hotspot-inspector">
              <hr style={{ margin: '16px 0', borderColor: '#eee' }} />
              <h4>Edit Hotspot #{selected.id}</h4>
              <label className="field">
                <span>Label / Title</span>
                <input
                  type="text"
                  value={selected.payload.title ?? ''}
                  onChange={(e) =>
                    updateSelected({
                      payload: { ...selected.payload, title: e.target.value },
                    })
                  }
                />
              </label>
              <label className="field">
                <span>Target URL ({selected.type === 'video' ? 'YouTube / MP4' : 'Web URL'})</span>
                <input
                  type="text"
                  value={selected.payload.url ?? ''}
                  placeholder={selected.type === 'video' ? 'https://youtube.com/watch?v=...' : 'https://example.com'}
                  onChange={(e) =>
                    updateSelected({
                      payload: { ...selected.payload, url: e.target.value },
                    })
                  }
                />
              </label>

              <div className="coord-grid">
                <label className="field">
                  <span>Left (X%)</span>
                  <input
                    type="number"
                    min="0"
                    max="90"
                    value={Math.round(selected.x)}
                    onChange={(e) => updateSelected({ x: Number(e.target.value) })}
                  />
                </label>
                <label className="field">
                  <span>Top (Y%)</span>
                  <input
                    type="number"
                    min="0"
                    max="90"
                    value={Math.round(selected.y)}
                    onChange={(e) => updateSelected({ y: Number(e.target.value) })}
                  />
                </label>
                <label className="field">
                  <span>Width (%)</span>
                  <input
                    type="number"
                    min="5"
                    max="100"
                    value={Math.round(selected.w)}
                    onChange={(e) => updateSelected({ w: Number(e.target.value) })}
                  />
                </label>
                <label className="field">
                  <span>Height (%)</span>
                  <input
                    type="number"
                    min="4"
                    max="100"
                    value={Math.round(selected.h)}
                    onChange={(e) => updateSelected({ h: Number(e.target.value) })}
                  />
                </label>
              </div>

              {msg && <small className="status-saved">{msg}</small>}
            </div>
          )}
        </div>

        {/* Center: Interactive Page Canvas */}
        <div className="editor-canvas card">
          <div className="canvas-container" ref={stageRef}>
            {currentPage ? (
              <div className="canvas-sheet">
                <img src={currentPage.image} alt={`Page ${page}`} className="sheet-image" />
                {pageHotspots.map((h) => (
                  <div
                    key={h.id}
                    className={`canvas-hotspot ${h.type} ${selected?.id === h.id ? 'is-selected' : ''}`}
                    style={{
                      left: `${h.x}%`,
                      top: `${h.y}%`,
                      width: `${h.w}%`,
                      height: `${h.h}%`,
                    }}
                    onClick={() => setSelected(h)}
                  >
                    <span className="hotspot-pin">
                      {h.type === 'video' ? '▶' : '🔗'}
                    </span>
                    <span className="hotspot-label">{h.payload.title || h.type}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p>Page not found</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
