import { useEffect, useState, type FormEvent } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import FlipbookViewer, {
  type PageInfo,
  type TocItem,
  type ViewerHotspot,
  type ViewerSettings,
} from '../components/FlipbookViewer';
import { Badge } from '../components/ui/badge';

interface SeoMeta {
  title?: string;
  description?: string;
  keywords?: string;
  ogImage?: string;
  canonicalUrl?: string;
  noindex?: boolean;
}

interface PublicFlipbookData {
  title: string;
  description: string;
  tenantName?: string;
  slug: string;
  version?: number;
  workflowStatus?: string;
  isPreview?: boolean;
  locked: boolean;
  settings?: ViewerSettings;
  seoMeta?: SeoMeta;
  toc?: TocItem[];
  pages?: PageInfo[];
  hotspots?: Record<number, ViewerHotspot[]>;
}

function setOrUpdateMeta(attr: 'name' | 'property', key: string, content?: string) {
  if (!content) return;
  let el = document.head.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

export default function PublicViewer() {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const previewToken = searchParams.get('preview') || '';
  const initialPage = Number(searchParams.get('page') || '0') || undefined;
  const [sessionId] = useState(() => 'sess_' + Math.random().toString(36).slice(2, 12));

  const utmParams: Record<string, string> = {
    utm_source: searchParams.get('utm_source') || '',
    utm_medium: searchParams.get('utm_medium') || '',
    utm_campaign: searchParams.get('utm_campaign') || '',
    utm_term: searchParams.get('utm_term') || '',
    utm_content: searchParams.get('utm_content') || '',
  };

  const [data, setData] = useState<PublicFlipbookData | null>(null);
  const [missing, setMissing] = useState(false);
  const [lifecycleNotice, setLifecycleNotice] = useState<{ state: string; message: string; date?: string } | null>(null);
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [token, setToken] = useState('');
  const [unlockExpiresAt, setUnlockExpiresAt] = useState<string | null>(null);

  const load = (t = token) => {
    const headers: Record<string, string> = {};
    if (t) headers['X-Unlock-Token'] = t;
    if (previewToken) headers['X-Preview-Token'] = previewToken;

    const query = previewToken ? `?preview=${encodeURIComponent(previewToken)}` : '';
    fetch(`/api/v1/public/${slug}${query}`, { headers, credentials: 'same-origin' }).then(async (r) => {
      if (!r.ok) {
        try {
          const errBody = await r.json();
          if (errBody?.fields?.lifecycleState) {
            setLifecycleNotice({
              state: errBody.fields.lifecycleState,
              message: errBody.error || 'This publication is currently unavailable.',
              date: errBody.fields.scheduledAt || errBody.fields.expiresAt,
            });
            return;
          }
        } catch {
          // fallback
        }
        return setMissing(true);
      }
      const d: PublicFlipbookData = await r.json();
      setData(d);

      // Apply Custom SEO Metadata
      const seo = d.seoMeta || {};
      const pageTitle = seo.title || d.title;
      const pageDesc = seo.description || d.description || `Read ${d.title} on Nuvis Flipex`;
      document.title = d.isPreview ? `[Draft Preview] ${pageTitle}` : pageTitle;

      const coverUrl = seo.ogImage || `${window.location.origin}/api/v1/public/${slug}/cover`;
      setOrUpdateMeta('name', 'description', pageDesc);
      if (seo.keywords) setOrUpdateMeta('name', 'keywords', seo.keywords);
      setOrUpdateMeta('property', 'og:type', 'article');
      setOrUpdateMeta('property', 'og:site_name', 'Nuvis Flipex');
      setOrUpdateMeta('property', 'og:title', pageTitle);
      setOrUpdateMeta('property', 'og:description', pageDesc);
      setOrUpdateMeta('property', 'og:image', coverUrl);
      setOrUpdateMeta('property', 'og:image:secure_url', coverUrl);
      setOrUpdateMeta('property', 'og:image:type', 'image/jpeg');
      setOrUpdateMeta('name', 'twitter:card', 'summary_large_image');
      setOrUpdateMeta('name', 'twitter:title', pageTitle);
      setOrUpdateMeta('name', 'twitter:description', pageDesc);
      setOrUpdateMeta('name', 'twitter:image', coverUrl);
      setOrUpdateMeta('name', 'robots', seo.noindex || d.isPreview ? 'noindex, nofollow' : 'index, follow');

      // Track reader view analytics with UTM attribution (only for live published views)
      if (!d.locked && !d.isPreview) {
        fetch(`/api/v1/public/${slug}/view`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            referrer: document.referrer || undefined,
            utmSource: utmParams.utm_source || undefined,
            utmMedium: utmParams.utm_medium || undefined,
            utmCampaign: utmParams.utm_campaign || undefined,
            utmTerm: utmParams.utm_term || undefined,
            utmContent: utmParams.utm_content || undefined,
          }),
        }).catch(() => {});
      }
    });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [slug, previewToken]);

  const unlock = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    const r = await fetch(`/api/v1/public/${slug}/unlock`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    });
    if (!r.ok) return setErr('Incorrect password');
    const body = await r.json();
    const unlockToken = body.unlockToken || '';
    setToken(unlockToken);
    setPw('');
    if (body.expiresAt) {
      setUnlockExpiresAt(body.expiresAt);
    }
    load(unlockToken);
  };

  const lockSession = async () => {
    const headers: Record<string, string> = {};
    if (token) headers['X-Unlock-Token'] = token;
    await fetch(`/api/v1/public/${slug}/lock`, {
      method: 'POST',
      credentials: 'same-origin',
      headers,
    }).catch(() => {});
    setToken('');
    setUnlockExpiresAt(null);
    load('');
  };

  useEffect(() => {
    if (!unlockExpiresAt) return;
    const msRemaining = new Date(unlockExpiresAt).getTime() - Date.now();
    if (msRemaining <= 0) {
      setToken('');
      setUnlockExpiresAt(null);
      setErr('Your 30-minute reading session has expired. Please re-enter the password.');
      load('');
      return;
    }
    const timer = window.setTimeout(() => {
      setToken('');
      setUnlockExpiresAt(null);
      setErr('Your 30-minute reading session has expired. Please re-enter the password.');
      load('');
    }, msRemaining);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlockExpiresAt]);

  if (lifecycleNotice) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
        <div className="max-w-md rounded-2xl border border-amber-500/30 bg-slate-900 p-8 text-center shadow-2xl">
          <Badge variant="golden" className="mb-3 uppercase">
            {lifecycleNotice.state === 'scheduled' ? 'Scheduled Publication' : 'Archived / Expired'}
          </Badge>
          <h1 className="text-xl font-bold text-white">{lifecycleNotice.message}</h1>
          {lifecycleNotice.date && (
            <p className="mt-2 text-sm text-slate-400">
              {lifecycleNotice.state === 'scheduled' ? 'Scheduled release: ' : 'Expired on: '}
              <span className="font-semibold text-amber-400">{new Date(lifecycleNotice.date).toLocaleString()}</span>
            </p>
          )}
        </div>
      </div>
    );
  }

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
    <div className="public-reader-wrap relative">
      {unlockExpiresAt && !data.isPreview && (
        <button
          type="button"
          onClick={lockSession}
          title="Lock protected publication & revoke session token"
          className="fixed bottom-3 right-3 z-50 flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-slate-950/85 px-3 py-1 text-[11px] font-medium text-amber-300 shadow-lg backdrop-blur-md transition hover:border-amber-400 hover:bg-slate-900"
        >
          <span>Lock Session</span>
        </button>
      )}
      {data.isPreview && (
        <div className="fixed top-3 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-amber-400/50 bg-slate-950/90 px-4 py-1.5 text-xs font-medium text-amber-300 shadow-lg backdrop-blur-md">
          <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
          <span>Authorized Draft Preview</span>
          <span className="text-slate-400">•</span>
          <span className="uppercase tracking-wider text-white">{data.workflowStatus || 'draft'}</span>
          <span className="text-slate-400">•</span>
          <span>v{data.version || 1}</span>
        </div>
      )}
      <FlipbookViewer
        pages={data.pages!}
        title={data.title}
        description={data.description}
        tenantName={data.tenantName}
        slug={data.slug}
        settings={data.settings}
        hotspots={data.hotspots}
        toc={data.toc}
        initialPage={initialPage}
        enableTelemetry={!data.isPreview}
        sessionId={sessionId}
        utmParams={utmParams}
      />
    </div>
  );
}
