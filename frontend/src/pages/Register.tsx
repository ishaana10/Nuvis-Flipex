import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { AuthCard, Field, useForm } from '../components/Form';

function toUrlSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export default function Register() {
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companySlug, setCompanySlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugCheck, setSlugCheck] = useState<{
    checking: boolean;
    available?: boolean;
    reason?: string;
    suggestion?: string;
  }>({ checking: false });

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [createdProfileUrl, setCreatedProfileUrl] = useState('');
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    api<{ allowed: boolean }>('/auth/registration-status')
      .then((d) => setAllowed(d.allowed))
      .catch(() => setAllowed(true));
  }, []);

  // Auto-generate companySlug from companyName (or name) until user manually edits slug
  useEffect(() => {
    if (!slugTouched) {
      const source = companyName.trim() || name.trim();
      setCompanySlug(toUrlSlug(source));
    }
  }, [companyName, name, slugTouched]);

  // Live debounced availability check for custom company URL slug
  useEffect(() => {
    const clean = toUrlSlug(companySlug);
    if (!clean || clean.length < 3) {
      setSlugCheck({
        checking: false,
        available: clean.length > 0 ? false : undefined,
        reason: clean.length > 0 ? 'Must be at least 3 characters' : undefined,
      });
      return;
    }

    setSlugCheck({ checking: true });
    const timer = window.setTimeout(() => {
      api<{ valid: boolean; available: boolean; slug: string; reason?: string; suggestion?: string }>(
        `/auth/check-company-slug?slug=${encodeURIComponent(clean)}`
      )
        .then((res) => {
          setSlugCheck({
            checking: false,
            available: res.available,
            reason: res.reason,
            suggestion: res.suggestion,
          });
        })
        .catch(() => {
          setSlugCheck({ checking: false });
        });
    }, 280);

    return () => window.clearTimeout(timer);
  }, [companySlug]);

  const f = useForm(async () => {
    const res = await api<{ message: string; companySlug?: string; profileUrl?: string }>('/auth/register', 'POST', {
      name,
      companyName: companyName.trim() || name.trim(),
      companySlug: toUrlSlug(companySlug),
      email,
      password,
    });
    if (res?.profileUrl) {
      setCreatedProfileUrl(`${window.location.origin}${res.profileUrl}`);
    } else if (companySlug) {
      setCreatedProfileUrl(`${window.location.origin}/${toUrlSlug(companySlug)}`);
    }
    setDone(true);
  });

  if (allowed === false) {
    return (
      <AuthCard title="Registration Disabled">
        <div className="banner" style={{ background: '#fef3c7', border: '1px solid #fde68a', color: '#92400e' }}>
          ⚠️ Public self-registration has been disabled by the system administrator.
        </div>
        <p className="muted" style={{ fontSize: '14px', lineHeight: 1.6 }}>
          New customer and team accounts are created by administrator invitation only. Please contact your company or platform administrator to obtain your access credentials.
        </p>
        <p style={{ marginTop: '20px' }}>
          Already have an account? <Link to="/login">Sign in here</Link>
        </p>
      </AuthCard>
    );
  }

  if (done) {
    return (
      <AuthCard title="Check your email">
        <p>We sent a verification link and welcome instructions to <b>{email}</b>.</p>
        {createdProfileUrl && (
          <div
            style={{
              margin: '14px 0',
              padding: '12px 14px',
              borderRadius: 10,
              background: 'var(--brand-soft)',
              border: '1px solid var(--brand-border)',
              fontSize: 13,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Your Branded Publisher Link is Reserved:</div>
            <a href={createdProfileUrl} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700, wordBreak: 'break-all' }}>
              {createdProfileUrl} ↗
            </a>
          </div>
        )}
        <Link to="/login">Go to sign in</Link>
      </AuthCard>
    );
  }

  const hostDisplay = typeof window !== 'undefined' ? window.location.host : 'flipex.nuvistechnologies.com.fj';
  const cleanSlug = toUrlSlug(companySlug) || 'yourcompanyname';

  return (
    <AuthCard title="Create your publisher account">
      <form onSubmit={f.submit}>
        <Field label="Your Full Name" name="name" autoComplete="name" value={name} onChange={setName} error={f.fields.name} />

        <Field
          label="Company / Publisher Display Name"
          name="companyName"
          autoComplete="organization"
          value={companyName}
          onChange={setCompanyName}
          error={f.fields.companyName}
        />

        {/* Custom Branded Company URL Input (Issuu-style Publisher Slug) */}
        <div className="field" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Custom Company URL Name</span>
            {slugCheck.checking ? (
              <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Checking…</span>
            ) : slugCheck.available === true ? (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: '#047857',
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                }}
              >
                ✓ Available
              </span>
            ) : slugCheck.available === false ? (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: 'rgba(239, 68, 68, 0.14)',
                  color: '#b91c1c',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                }}
              >
                ✗ Unavailable
              </span>
            ) : null}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              overflow: 'hidden',
              background: 'var(--surface)',
            }}
          >
            <span
              style={{
                padding: '10px 8px 10px 10px',
                fontSize: 12,
                color: '#64748b',
                background: 'var(--surface-muted)',
                borderRight: '1px solid #e2e8f0',
                whiteSpace: 'nowrap',
                userSelect: 'none',
              }}
            >
              {hostDisplay}/
            </span>
            <input
              type="text"
              name="companySlug"
              value={companySlug}
              placeholder="yourcompanyname"
              onChange={(e) => {
                setSlugTouched(true);
                setCompanySlug(toUrlSlug(e.target.value));
              }}
              style={{
                border: 'none',
                outline: 'none',
                padding: '10px',
                fontSize: 14,
                fontWeight: 600,
                width: '100%',
                background: 'transparent',
                color: 'var(--text-main)',
              }}
            />
          </div>

          <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 4 }}>
            Publisher profile: <b style={{ color: 'var(--brand)' }}>https://{hostDisplay}/{cleanSlug}</b>
            <br />
            Publications: <code>https://{hostDisplay}/{cleanSlug}/docs/catalogue-2026</code>
          </div>

          {(f.fields.companySlug || (slugCheck.available === false && slugCheck.reason)) && (
            <div style={{ fontSize: 12, color: 'var(--err)', marginTop: 4 }}>
              {f.fields.companySlug || slugCheck.reason}
              {slugCheck.suggestion && (
                <button
                  type="button"
                  className="link"
                  style={{ marginLeft: 8, fontSize: 12, fontWeight: 700, textDecoration: 'underline' }}
                  onClick={() => {
                    setSlugTouched(true);
                    setCompanySlug(slugCheck.suggestion!);
                  }}
                >
                  Try “{slugCheck.suggestion}”
                </button>
              )}
            </div>
          )}
        </div>

        <Field label="Email" name="email" type="email" autoComplete="email" value={email} onChange={setEmail} error={f.fields.email} />
        <Field label="Password (min 8 chars)" name="password" type="password" autoComplete="new-password" value={password} onChange={setPassword} error={f.fields.password} />
        {f.error && <p className="err">{f.error}</p>}
        <button disabled={f.busy || slugCheck.available === false}>{f.busy ? 'Creating…' : 'Create account'}</button>
      </form>
      <p>Already registered? <Link to="/login">Sign in</Link></p>
    </AuthCard>
  );
}
