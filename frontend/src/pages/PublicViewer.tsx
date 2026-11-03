import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import FlipbookViewer, {
  type PageInfo,
  type ViewerHotspot,
  type ViewerSettings,
} from '../components/FlipbookViewer';

interface PublicFlipbookData {
  title: string;
  description: string;
  slug: string;
  locked: boolean;
  settings?: ViewerSettings;
  pages?: PageInfo[];
  hotspots?: Record<number, ViewerHotspot[]>;
}

export default function PublicViewer() {
  const { slug } = useParams();
  const [data, setData] = useState<PublicFlipbookData | null>(null);
  const [missing, setMissing] = useState(false);
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [token, setToken] = useState('');

  const load = (t = token) =>
    fetch(`/api/v1/public/${slug}`, { headers: t ? { 'X-Unlock-Token': t } : {} }).then(async (r) => {
      if (!r.ok) return setMissing(true);
      const d = await r.json();
      setData(d);
      document.title = d.title;

      // Track reader view analytics
      if (!d.locked) {
        fetch(`/api/v1/public/${slug}/view`, { method: 'POST' }).catch(() => {});
      }
    });

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [slug]);

  const unlock = async (e: FormEvent) => {
    e.preventDefault();
    const r = await fetch(`/api/v1/public/${slug}/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    });
    if (!r.ok) return setErr('Incorrect password');
    const { unlockToken } = await r.json();
    setToken(unlockToken);
    load(unlockToken);
  };

  if (missing) return <p className="center">This flipbook doesn't exist or isn't published.</p>;
  if (!data) return <p className="center">Loading flipbook…</p>;

  if (data.locked) {
    return (
      <div className="auth-wrap">
        <form className="card" onSubmit={unlock}>
          <h1>{data.title}</h1>
          <p>This publication is password protected.</p>
          <label className="field">
            <span>Password</span>
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </label>
          {err && <p className="err">{err}</p>}
          <button>Open Flipbook</button>
        </form>
      </div>
    );
  }

  return (
    <div className="public-reader-wrap">
      <FlipbookViewer
        pages={data.pages!}
        title={data.title}
        slug={data.slug}
        settings={data.settings}
        hotspots={data.hotspots}
      />
    </div>
  );
}
