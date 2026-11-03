import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, getAccessToken, refreshSession } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import ShareDialog from '../components/ShareDialog';
import CustomizationDialog, { type FlipbookSettings } from '../components/CustomizationDialog';

export interface Flipbook {
  id: number;
  title: string;
  slug: string;
  status: 'uploading' | 'processing' | 'ready' | 'failed';
  visibility: 'public' | 'unlisted' | 'password';
  pageCount: number;
  published: boolean;
  cover: string | null;
  settings?: FlipbookSettings;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [items, setItems] = useState<Flipbook[]>([]);
  const [q, setQ] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [share, setShare] = useState<Flipbook | null>(null);
  const [customize, setCustomize] = useState<Flipbook | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(() => api<Flipbook[]>(`/flipbooks?q=${encodeURIComponent(q)}`).then(setItems), [q]);
  useEffect(() => { load(); }, [load]);

  // Poll while anything is converting.
  useEffect(() => {
    if (!items.some((i) => i.status === 'processing')) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [items, load]);

  const upload = async (file: File) => {
    setError(''); setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await uploadForm('/flipbooks', fd);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? (e.fields.file ?? e.message) : 'Upload failed');
    } finally { setUploading(false); if (input.current) input.current.value = ''; }
  };

  const remove = async (f: Flipbook) => {
    if (!confirm(`Delete "${f.title}"?`)) return;
    await api(`/flipbooks/${f.id}`, 'DELETE');
    load();
  };

  const rename = async (f: Flipbook) => {
    const title = prompt('New title', f.title);
    if (title?.trim()) { await api(`/flipbooks/${f.id}`, 'PATCH', { title }); load(); }
  };

  return (
    <div>
      <div className="row head">
        <div>
          <h1 style={{ margin: '0 0 4px 0' }}>Your Flipbooks</h1>
          <p className="muted" style={{ margin: 0 }}>Create, customize, and share interactive magazines</p>
        </div>
        <div>
          <input type="file" accept="application/pdf" hidden ref={input} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <button disabled={uploading} onClick={() => input.current?.click()} className="btn-primary">
            {uploading ? 'Uploading PDF…' : '+ Upload PDF'}
          </button>
        </div>
      </div>

      {user && !user.emailVerified && (
        <div className="banner">
          Please verify your email.{' '}
          <button className="link" onClick={() => api('/auth/resend-verification', 'POST')}>Resend link</button>
        </div>
      )}
      {error && <p className="err">{error}</p>}

      <input className="search" placeholder="Search publications by title…" value={q} onChange={(e) => setQ(e.target.value)} />

      {items.length === 0 ? (
        <div className="card empty"><p>No flipbooks yet. Upload a PDF to get started.</p></div>
      ) : (
        <div className="grid">
          {items.map((f) => (
            <div className="card fb" key={f.id}>
              <div className="cover">
                {f.cover ? <img src={f.cover} alt={f.title} /> : <span>{f.status === 'failed' ? '⚠️ Failed' : '⏳ Converting…'}</span>}
              </div>
              <b className="fb-title" title={f.title}>{f.title}</b>
              <small className="muted">{f.pageCount} pages · {f.published ? 'Published' : 'Draft'} · {f.visibility}</small>
              <div className="actions">
                {f.status === 'ready' && <Link to={`/dashboard/preview/${f.id}`} className="action-pill preview">Preview 👁️</Link>}
                {f.status === 'ready' && <Link to={`/dashboard/editor/${f.id}`} className="action-pill editor">Hotspots 🔗</Link>}
                {f.status === 'ready' && <Link to={`/dashboard/analytics/${f.id}`} className="action-pill analytics">Analytics 📊</Link>}
                {f.status === 'ready' && <button className="action-pill custom" onClick={() => setCustomize(f)}>Customize 🎨</button>}
                {f.status === 'ready' && <button className="action-pill share" onClick={() => setShare(f)}>Share 🚀</button>}
                <button className="action-pill rename" onClick={() => rename(f)}>Rename</button>
                <button className="action-pill delete" onClick={() => remove(f)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {share && <ShareDialog flipbook={share} onClose={() => setShare(null)} onSaved={load} />}
      {customize && <CustomizationDialog flipbook={customize} onClose={() => setCustomize(null)} onSaved={load} />}
    </div>
  );
}

async function uploadForm(path: string, fd: FormData) {
  const send = () => fetch(`/api/v1${path}`, {
    method: 'POST', body: fd, credentials: 'include',
    headers: { 'X-Requested-With': 'XMLHttpRequest', Authorization: `Bearer ${getAccessToken()}` },
  });
  let r = await send();
  if (r.status === 401 && (await refreshSession())) r = await send();
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(data.error ?? 'Upload failed', r.status, data.fields ?? {});
  return data;
}
