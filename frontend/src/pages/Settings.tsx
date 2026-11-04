import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Field, useForm } from '../components/Form';

interface Session { id: number; userAgent: string; ip: string; createdAt: string; current: boolean }

interface TenantBilling {
  hasTenant: boolean;
  tenantId?: number;
  companyName?: string;
  slug?: string;
  planName?: string;
  planPrice?: number;
  billingName?: string;
  billingEmail?: string;
  billingAddress?: string;
  taxId?: string;
  paymentMethod?: string;
  paymentStatus?: 'paid' | 'pending' | 'overdue' | 'trial' | 'exempt';
  billingCycle?: string;
  amount?: number;
  currency?: string;
  lastPaymentDate?: string | null;
  nextBillingDate?: string | null;
  paymentReference?: string | null;
  billingNotes?: string | null;
}

export default function Settings() {
  const { user, setUser, logout } = useAuth();
  const nav = useNavigate();

  const [name, setName] = useState(user?.name ?? '');
  const [profileMsg, setProfileMsg] = useState('');
  const profile = useForm(async () => {
    const d = await api('/me', 'PATCH', { name });
    setUser({ ...user!, name: d.name });
    setProfileMsg('Saved');
  });

  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const pw = useForm(async () => {
    await api('/me/password', 'PUT', { currentPassword, newPassword });
    setCurrent(''); setNew(''); setPwMsg('Password changed');
  });

  const [twoFactorEnabled, setTwoFactorEnabled] = useState(user?.twoFactorEnabled ?? false);
  const [twoFactorMsg, setTwoFactorMsg] = useState('');
  const [twoFactorBusy, setTwoFactorBusy] = useState(false);

  // Tenant / Company Billing Details
  const [tenantBilling, setTenantBilling] = useState<TenantBilling | null>(null);

  useEffect(() => {
    api<any>('/me').then((d) => {
      if (d) setTwoFactorEnabled(!!d.twoFactorEnabled);
    });

    api<TenantBilling>('/me/tenant-billing').then((d) => {
      if (d) setTenantBilling(d);
    }).catch(() => {});
  }, []);

  const toggle2fa = async () => {
    const nextState = !twoFactorEnabled;
    const action = nextState ? 'enable' : 'disable';
    if (!confirm(`Are you sure you want to ${action} Two-Factor Authentication via email?`)) return;

    setTwoFactorBusy(true);
    setTwoFactorMsg('');
    try {
      const res = await api<{ twoFactorEnabled: boolean }>('/me/two-factor', 'POST', { enabled: nextState });
      setTwoFactorEnabled(res.twoFactorEnabled);
      setTwoFactorMsg(`Two-Factor Authentication is now ${res.twoFactorEnabled ? 'ENABLED' : 'DISABLED'}.`);
    } catch (err: any) {
      setTwoFactorMsg(`Failed: ${err.message}`);
    } finally {
      setTwoFactorBusy(false);
    }
  };

  const [sessions, setSessions] = useState<Session[]>([]);
  const load = () => api<Session[]>('/me/sessions').then(setSessions);
  useEffect(() => { load(); }, []);

  const [delPassword, setDelPassword] = useState('');
  const del = useForm(async () => {
    if (!confirm('Delete your account? This cannot be undone.')) return;
    await api('/me', 'DELETE', { password: delPassword });
    await logout(); nav('/login');
  });

  return (
    <div className="stack">
      <h1>Account settings</h1>

      <form className="card" onSubmit={profile.submit}>
        <h2>Profile</h2>
        <p className="muted">{user?.email}</p>
        <Field label="Name" name="name" value={name} onChange={setName} error={profile.fields.name} />
        <button disabled={profile.busy}>Save</button> {profileMsg && <small>{profileMsg}</small>}
      </form>

      <form className="card" onSubmit={pw.submit}>
        <h2>Password</h2>
        <Field label="Current password" name="cur" type="password" value={currentPassword} onChange={setCurrent} error={pw.fields.currentPassword} />
        <Field label="New password" name="new" type="password" value={newPassword} onChange={setNew} error={pw.fields.newPassword} />
        <button disabled={pw.busy}>Change password</button> {pwMsg && <small>{pwMsg}</small>}
      </form>

      <div className="card">
        <h2>🛡️ Two-Factor Authentication (Email)</h2>
        <p className="muted" style={{ fontSize: '14px', lineHeight: 1.5, margin: '0 0 16px 0' }}>
          Enhance your account security. When 2FA is enabled, Nuvis Flipex will send a temporary 6-digit verification code to <b>{user?.email}</b> every time you sign in.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <span style={{ fontSize: '14px', fontWeight: 600, marginRight: '10px' }}>Current Status:</span>
            <span className={`badge ${twoFactorEnabled ? 'badge-success' : 'badge-neutral'}`}>
              {twoFactorEnabled ? 'ENABLED' : 'DISABLED'}
            </span>
          </div>
          <button
            type="button"
            className={twoFactorEnabled ? 'btn-secondary' : 'btn-primary'}
            onClick={toggle2fa}
            disabled={twoFactorBusy}
          >
            {twoFactorBusy ? 'Updating…' : (twoFactorEnabled ? 'Disable 2FA' : 'Enable 2FA via Email')}
          </button>
        </div>
        {twoFactorMsg && <p style={{ marginTop: '12px', fontSize: '13px', color: '#166534' }}>{twoFactorMsg}</p>}
      </div>

      {tenantBilling && tenantBilling.hasTenant && (
        <div className="card" style={{ borderLeft: '4px solid #f59e0b' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span className="badge badge-golden">WORKSPACE BILLING</span>
                <span className="muted font-mono" style={{ fontSize: '13px' }}>/{tenantBilling.slug}</span>
              </div>
              <h2 style={{ margin: 0 }}>💳 {tenantBilling.companyName} Subscription</h2>
            </div>
            <div>
              <span className={`badge ${
                tenantBilling.paymentStatus === 'paid' ? 'badge-success' :
                tenantBilling.paymentStatus === 'pending' ? 'badge-warning' :
                tenantBilling.paymentStatus === 'overdue' ? 'badge-danger' : 'badge-neutral'
              }`} style={{ fontSize: '12px', padding: '5px 10px' }}>
                PAYMENT STATUS: {(tenantBilling.paymentStatus || 'PAID').toUpperCase()}
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', margin: '20px 0', background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div>
              <small className="muted" style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>Active Plan</small>
              <strong style={{ fontSize: '16px', color: '#0f172a' }}>{tenantBilling.planName} Tier</strong>
            </div>
            <div>
              <small className="muted" style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>Billing Rate</small>
              <strong style={{ fontSize: '16px', color: '#0f172a' }}>
                {tenantBilling.currency || 'FJD'} ${Number(tenantBilling.amount || tenantBilling.planPrice || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                <span style={{ fontSize: '13px', fontWeight: 400, color: '#64748b' }}> / {tenantBilling.billingCycle || 'monthly'}</span>
              </strong>
            </div>
            <div>
              <small className="muted" style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>Payment Method</small>
              <span style={{ fontSize: '14px', textTransform: 'capitalize' }}>
                {(tenantBilling.paymentMethod || 'bank_transfer').replace('_', ' ')}
              </span>
            </div>
            <div>
              <small className="muted" style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>Invoice / Reference #</small>
              <span className="font-mono" style={{ fontSize: '13px', color: '#d97706', fontWeight: 600 }}>
                {tenantBilling.paymentReference || '—'}
              </span>
            </div>
            <div>
              <small className="muted" style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>Last Payment Date</small>
              <span style={{ fontSize: '14px' }}>{tenantBilling.lastPaymentDate || '—'}</span>
            </div>
            <div>
              <small className="muted" style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>Next Renewal / Due Date</small>
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>{tenantBilling.nextBillingDate || '—'}</span>
            </div>
          </div>

          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px', marginBottom: '14px' }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#475569' }}>
              Billing Entity & Contact Information
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', fontSize: '13px' }}>
              <div>
                <span className="muted">Billing Entity: </span>
                <b>{tenantBilling.billingName || tenantBilling.companyName}</b>
              </div>
              <div>
                <span className="muted">Billing Email: </span>
                <b>{tenantBilling.billingEmail || '—'}</b>
              </div>
              <div>
                <span className="muted">Tax / TIN ID: </span>
                <b>{tenantBilling.taxId || '—'}</b>
              </div>
              <div>
                <span className="muted">Billing Address: </span>
                <span>{tenantBilling.billingAddress || '—'}</span>
              </div>
            </div>
            {tenantBilling.billingNotes && (
              <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed #e2e8f0', fontSize: '13px' }}>
                <span className="muted">Settlement Notes: </span>
                <span>{tenantBilling.billingNotes}</span>
              </div>
            )}
          </div>

          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '12px 14px', fontSize: '13px', color: '#92400e', lineHeight: 1.5 }}>
            ℹ️ <b>Billing Support:</b> Subscription plans, invoicing, and corporate payment methods are managed by your tenant administrator or Nuvis Technologies Accounts. For invoice copies or remittance confirmation, please email <a href="mailto:nilesh@nuvistechnologies.com.fj" style={{ color: '#b45309', fontWeight: 600, textDecoration: 'underline' }}>nilesh@nuvistechnologies.com.fj</a>.
          </div>
        </div>
      )}

      <div className="card">
        <h2>Active sessions</h2>
        {sessions.map((s) => (
          <div className="row" key={s.id}>
            <span>{s.userAgent || 'Unknown device'} · {s.ip} {s.current && <b>(this device)</b>}</span>
            {!s.current && <button className="link" onClick={() => api(`/me/sessions/${s.id}`, 'DELETE').then(load)}>Sign out</button>}
          </div>
        ))}
      </div>

      <form className="card danger" onSubmit={del.submit}>
        <h2>Delete account</h2>
        <Field label="Confirm with password" name="delpw" type="password" value={delPassword} onChange={setDelPassword} error={del.fields.password} />
        <button disabled={del.busy}>Delete my account</button>
      </form>
    </div>
  );
}
