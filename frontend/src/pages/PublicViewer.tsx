import { useEffect, useState, type FormEvent } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import FlipbookViewer, {
  type PageInfo,
  type TocItem,
  type ViewerHotspot,
  type ViewerSettings,
} from '../components/FlipbookViewer';
import { Badge } from '../components/ui/badge';
import FlipexLoader from '../components/FlipexLoader';

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
  publicSlug?: string;
  companySlug?: string;
  canonicalUrl?: string;
  companyProfileUrl?: string;
  companyLogo?: string;
  redirectedCompanyFrom?: string | null;
  redirectedPubFrom?: string | null;
  version?: number;
  workflowStatus?: string;
  isPreview?: boolean;
  locked: boolean;
  lockType?: 'password' | 'pin' | 'domain';
  pinHint?: string;
  allowedDomains?: string;
  educationalCategory?: string;
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

function setOrUpdateCanonical(href?: string) {
  if (!href) return;
  let link = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  link.setAttribute('href', href);
}

export default function PublicViewer() {
  const { slug, companySlug, publicationSlug } = useParams<{
    slug?: string;
    companySlug?: string;
    publicationSlug?: string;
  }>();
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
  const [pin, setPin] = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [err, setErr] = useState('');
  const [token, setToken] = useState('');
  const [unlockExpiresAt, setUnlockExpiresAt] = useState<string | null>(null);

  const load = (t = token) => {
    const headers: Record<string, string> = {};
    if (t) headers['X-Unlock-Token'] = t;
    if (previewToken) headers['X-Preview-Token'] = previewToken;

    const query = previewToken ? `?preview=${encodeURIComponent(previewToken)}` : '';
    const endpoint =
      companySlug && publicationSlug
        ? `/api/v1/public/branded/${encodeURIComponent(companySlug)}/docs/${encodeURIComponent(publicationSlug)}${query}`
        : `/api/v1/public/${encodeURIComponent(slug || publicationSlug || '')}${query}`;

    fetch(endpoint, { headers, credentials: 'same-origin' }).then(async (r) => {
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

      // If visitor opened a renamed company slug or renamed publication slug, update URL to canonical address
      if ((d.redirectedCompanyFrom || d.redirectedPubFrom) && d.canonicalUrl) {
        try {
          window.history.replaceState(null, '', d.canonicalUrl + window.location.search);
        } catch {
          // ignore
        }
      }

      // Apply Custom SEO & Canonical Metadata
      const seo = d.seoMeta || {};
      const pageTitle = seo.title || d.title;
      const pageDesc = seo.description || d.description || `Read ${d.title} on Nuvis Flipex`;
      document.title = d.isPreview ? `[Draft Preview] ${pageTitle}` : (d.tenantName ? `${pageTitle} — ${d.tenantName}` : pageTitle);

      const resolvedSlug = d.slug || slug || publicationSlug || '';
      const coverUrl = seo.ogImage || `${window.location.origin}/api/v1/public/${resolvedSlug}/cover`;
      const canonicalHref = seo.canonicalUrl || (d.canonicalUrl ? `${window.location.origin}${d.canonicalUrl}` : window.location.href);
      setOrUpdateCanonical(canonicalHref);
      setOrUpdateMeta('name', 'description', pageDesc);
      if (seo.keywords) setOrUpdateMeta('name', 'keywords', seo.keywords);
      setOrUpdateMeta('property', 'og:type', 'article');
      setOrUpdateMeta('property', 'og:site_name', d.tenantName || 'Nuvis Flipex');
      setOrUpdateMeta('property', 'og:url', canonicalHref);
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
      if (!d.locked && !d.isPreview && resolvedSlug) {
        fetch(`/api/v1/public/${resolvedSlug}/view`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            referrer: document.referrer || undefined,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            timezoneOffset: new Date().getTimezoneOffset(),
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
  }, [slug, companySlug, publicationSlug, previewToken]);

  const activeSlug = data?.slug || slug || publicationSlug || '';

  const unlock = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    const r = await fetch(`/api/v1/public/${activeSlug}/unlock`, {
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

  const unlockPin = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      const r = await fetch(`/api/v1/public/${activeSlug}/verify-pin`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        return setErr(body.error || 'Incorrect PIN code');
      }
      const body = await r.json();
      const unlockToken = body.unlockToken || '';
      setToken(unlockToken);
      setPin('');
      if (body.expiresAt) {
        setUnlockExpiresAt(body.expiresAt);
      }
      load(unlockToken);
    } catch {
      setErr('Failed to verify PIN');
    }
  };

  const unlockDomain = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      const r = await fetch(`/api/v1/public/${activeSlug}/verify-domain`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: studentEmail }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        return setErr(body.error || 'Access restricted to approved institutional email domains');
      }
      const body = await r.json();
      const unlockToken = body.unlockToken || '';
      setToken(unlockToken);
      setStudentEmail('');
      if (body.expiresAt) {
        setUnlockExpiresAt(body.expiresAt);
      }
      load(unlockToken);
    } catch {
      setErr('Failed to verify institutional domain');
    }
  };

  const lockSession = async () => {
    const headers: Record<string, string> = {};
    if (token) headers['X-Unlock-Token'] = token;
    await fetch(`/api/v1/public/${activeSlug}/lock`, {
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
  if (!data) return <FlipexLoader size="hero" label="Opening interactive digital edition…" />;

  if (data.locked) {
    if (data.lockType === 'pin') {
      return (
        <div className="auth-wrap">
          <form className="card" onSubmit={unlockPin}>
            <div className="text-3xl mb-1">🔢</div>
            <h1 style={{ fontSize: '18px', margin: '0 0 6px' }}>{data.title}</h1>
            <p className="muted" style={{ fontSize: '13px', margin: '0 0 16px' }}>
              This publication requires a school or parent access PIN.
            </p>
            <label className="field">
              <span>Enter 4–6 Digit PIN</span>
              <input
                type="text"
                pattern="[0-9]*"
                inputMode="numeric"
                maxLength={8}
                autoFocus
                placeholder="e.g. 2026"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ''))}
                style={{ fontSize: '18px', letterSpacing: '4px', textAlign: 'center', fontWeight: 'bold' }}
              />
            </label>
            {err && <p className="err">{err}</p>}
            <button className="btn-primary" style={{ width: '100%', marginTop: '8px' }}>
              Unlock Flipbook
            </button>
          </form>
        </div>
      );
    }

    if (data.lockType === 'domain') {
      return (
        <div className="auth-wrap">
          <form className="card" onSubmit={unlockDomain}>
            <div className="text-3xl mb-1">🎓</div>
            <h1 style={{ fontSize: '18px', margin: '0 0 6px' }}>{data.title}</h1>
            <p className="muted" style={{ fontSize: '13px', margin: '0 0 16px' }}>
              Institutional Access Only. Please enter your student or faculty email address.
            </p>
            {data.allowedDomains && (
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af', padding: '8px 12px', borderRadius: '8px', fontSize: '12px', marginBottom: '14px' }}>
                Allowed domains: <b>{data.allowedDomains}</b>
              </div>
            )}
            <label className="field">
              <span>Your School Email</span>
              <input
                type="email"
                autoFocus
                placeholder="student@school.edu.fj"
                value={studentEmail}
                onChange={(e) => setStudentEmail(e.target.value)}
              />
            </label>
            {err && <p className="err">{err}</p>}
            <button className="btn-primary" style={{ width: '100%', marginTop: '8px' }}>
              Verify &amp; Open
            </button>
          </form>
        </div>
      );
    }

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
