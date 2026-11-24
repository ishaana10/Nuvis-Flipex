import { useState, type FormEvent, type ReactNode } from 'react';
import { ApiError } from '../api/client';
import { APP_VERSION } from '../version';

export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="auth-wrap">
      <div className="auth-brand-header">
        <img src="/logo.png" alt="Nuvis Flipex" className="nuvis-brand-logo" />
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="nuvis-brand-text" style={{ fontSize: '24px' }}>Nuvis Flipex</span>
          <span
            className="auth-version-chip"
            style={{
              fontSize: '11px',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: '999px',
              background: 'rgba(245, 197, 66, 0.15)',
              color: '#d97706',
              border: '1px solid rgba(245, 197, 66, 0.4)',
              letterSpacing: '0.4px',
            }}
          >
            v{APP_VERSION}
          </span>
        </div>
      </div>
      <div className="card">
        <h1>{title}</h1>
        {children}
      </div>
      <div
        className="auth-footer"
        style={{
          marginTop: '16px',
          textAlign: 'center',
          fontSize: '11.5px',
          color: '#64748b',
          display: 'flex',
          flexDirection: 'column',
          gap: '3px',
          alignItems: 'center',
        }}
      >
        <span>
          Nuvis Flipex Platform · <b>v{APP_VERSION}</b>
        </span>
        <span>© {new Date().getFullYear()} Nuvis Technologies · All rights reserved</span>
      </div>
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
