import { useState, type FormEvent, type ReactNode } from 'react';
import { ApiError } from '../api/client';
import { APP_VERSION } from '../version';

const HERO_POINTS = [
  {
    title: 'A reader people want to open',
    body: 'Realistic page-turning on desktop and phone, with search, zoom and sharing built in.',
    icon: <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15H5.5A1.5 1.5 0 0 0 4 20.5v-15Zm16 0A1.5 1.5 0 0 0 18.5 4H13v15h5.5a1.5 1.5 0 0 1 1.5 1.5v-15Z" />,
  },
  {
    title: 'Sell straight from the page',
    body: 'Add hotspots, product cards and one-tap WhatsApp ordering to any page.',
    icon: <path d="M6 6h15l-1.6 8.2a2 2 0 0 1-2 1.6H9.2a2 2 0 0 1-2-1.6L5.4 3H3m6.5 16.5h.01m7 0h.01" />,
  },
  {
    title: 'Know what gets read',
    body: 'Page-level views, reading time and leads, so you can see which pages earn their place.',
    icon: <path d="M5 20V10m7 10V4m7 16v-7" />,
  },
];

function HeroBook() {
  return (
    <svg className="nx-auth-book" viewBox="0 0 420 300" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="nxPageL" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity=".95" />
          <stop offset=".5" stopColor="#dbe9ff" stopOpacity=".9" />
          <stop offset="1" stopColor="#8fb4ec" stopOpacity=".85" />
        </linearGradient>
        <linearGradient id="nxPageR" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity=".95" />
          <stop offset=".55" stopColor="#c6dcff" stopOpacity=".9" />
          <stop offset="1" stopColor="#7aa5e6" stopOpacity=".85" />
        </linearGradient>
        <linearGradient id="nxCurl" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fde9a2" />
          <stop offset=".5" stopColor="#f5c542" />
          <stop offset="1" stopColor="#d99a0b" />
        </linearGradient>
      </defs>
      <path d="M210 70 C150 40 70 44 20 64 L20 250 C70 232 150 232 210 262 Z" fill="url(#nxPageL)" />
      <path d="M210 70 C262 46 330 44 380 60 L380 238 C330 226 262 236 210 262 Z" fill="url(#nxPageR)" />
      <path d="M210 70 C236 82 262 108 258 150 C256 188 232 232 210 262 C214 200 216 128 210 70Z" fill="url(#nxCurl)" opacity=".95" />
      <g stroke="#0a2a5e" strokeOpacity=".22" strokeWidth="3" strokeLinecap="round">
        <path d="M50 100h120M50 122h104M50 144h116M50 166h88" />
        <path d="M290 98h72M290 120h60M290 142h68" />
      </g>
      <rect x="48" y="184" width="86" height="34" rx="8" fill="#0a2a5e" fillOpacity=".2" />
    </svg>
  );
}

export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="nx-auth">
      <aside className="nx-auth-hero">
        <a className="nx-auth-brand" href="https://nuvistechnologies.com.fj/" rel="noopener noreferrer" aria-label="Nuvis Technologies">
          <img src="/logo.png" alt="" />
          <span className="nx-auth-wordmark">Nuvis Flipex</span>
        </a>
        <div>
          <h2>Publish catalogues people actually flip through.</h2>
          <p className="nx-lede">
            Turn any PDF into a page-turning flipbook with hotspots, WhatsApp ordering and page-level analytics,
            hosted on your own branded page.
          </p>
          <ul className="nx-auth-points">
            {HERO_POINTS.map((p) => (
              <li key={p.title}>
                <span className="nx-dot">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{p.icon}</svg>
                </span>
                <span><b>{p.title}</b>{p.body}</span>
              </li>
            ))}
          </ul>
        </div>
        <HeroBook />
        <div className="nx-auth-hero-foot">Built in Fiji for Pacific businesses, schools and publishers.</div>
      </aside>

      <main className="nx-auth-panel">
        <div className="nx-auth-mobile-brand">
          <img src="/logo.png" alt="" />
          <span className="nx-auth-wordmark">Nuvis Flipex</span>
        </div>
        <div className="card">
          <h1>{title}</h1>
          {subtitle && <p className="nx-auth-sub">{subtitle}</p>}
          {children}
        </div>
        <div className="nx-auth-foot">
          <span>Nuvis Flipex <span className="nx-version-chip">v{APP_VERSION}</span></span>
          <span>© {new Date().getFullYear()} Nuvis Technologies. All rights reserved.</span>
        </div>
      </main>
    </div>
  );
}

export function Field(props: {
  label: string; name: string; type?: string; value: string;
  onChange(v: string): void; error?: string; autoComplete?: string;
}) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <input
        name={props.name} type={props.type ?? 'text'} value={props.value}
        autoComplete={props.autoComplete} onChange={(e) => props.onChange(e.target.value)}
      />
      {props.error && <small className="err">{props.error}</small>}
    </label>
  );
}

/** Wraps a submit handler with busy/error/field-error state. */
export function useForm(action: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(''); setFields({});
    try { await action(); }
    catch (err) {
      if (err instanceof ApiError) { setError(Object.keys(err.fields).length ? '' : err.message); setFields(err.fields); }
      else setError('Something went wrong');
    } finally { setBusy(false); }
  };
  return { busy, error, fields, submit };
}
