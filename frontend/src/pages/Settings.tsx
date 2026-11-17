import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Field, useForm } from '../components/Form';
import { ChangePasswordForm } from '../components/ChangePasswordModal';

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

  const [twoFactorEnabled, setTwoFactorEnabled] = useState(user?.twoFactorEnabled ?? false);
  const [twoFactorMethod, setTwoFactorMethod] = useState<'email' | 'totp'>(user?.twoFactorMethod ?? 'email');
  const [twoFactorMsg, setTwoFactorMsg] = useState('');
  const [twoFactorBusy, setTwoFactorBusy] = useState(false);
  const [totpSetup, setTotpSetup] = useState<{ secret: string; otpAuthUri: string } | null>(null);
  const [totpCode, setOtpCode] = useState('');
  const [totpErr, setTotpErr] = useState('');

  // Tenant / Company Billing Details
  const [tenantBilling, setTenantBilling] = useState<TenantBilling | null>(null);

  // Storefront & Commercial Profile Settings
  const [storefront, setStorefront] = useState<{
    id?: number;
    businessName: string;
    slug: string;
    tagline: string;
    bio: string;
    phone: string;
    whatsappPhone: string;
    email: string;
    address: string;
    websiteUrl: string;
    currency: string;
    bannerUrl: string;
    logoUrl: string;
    isVerified?: boolean;
  }>({
    businessName: '',
    slug: '',
    tagline: '',
    bio: '',
    phone: '',
    whatsappPhone: '',
    email: '',
    address: '',
    websiteUrl: '',
    currency: 'FJD',
    bannerUrl: '',
    logoUrl: '',
  });
  const [storefrontMsg, setStorefrontMsg] = useState('');
  const [storefrontBusy, setStorefrontBusy] = useState(false);
  const [copiedStorefrontLink, setCopiedStorefrontLink] = useState(false);

  useEffect(() => {
    api<any>('/me').then((d) => {
      if (d) {
        setTwoFactorEnabled(!!d.twoFactorEnabled);
        if (d.twoFactorMethod) setTwoFactorMethod(d.twoFactorMethod);
      }
    });

    api<TenantBilling>('/me/tenant-billing').then((d) => {
      if (d) setTenantBilling(d);
    }).catch(() => {});

    api<{ storefront: any }>('/biz/settings').then((d) => {
      if (d?.storefront) {
        setStorefront((prev) => ({
          ...prev,
          ...d.storefront,
        }));
      }
    }).catch(() => {});
  }, []);

  const handleSaveStorefront = async (e: React.FormEvent) => {
    e.preventDefault();
    setStorefrontBusy(true);
    setStorefrontMsg('');
    try {
      const res = await api<{ storefront: any; message: string }>('/biz/settings', 'POST', storefront);
      if (res?.storefront) {
        setStorefront((prev) => ({
          ...prev,
          ...res.storefront,
        }));
      }
      setStorefrontMsg('Business storefront details saved successfully!');
      setTimeout(() => setStorefrontMsg(''), 4000);
    } catch (err: any) {
      setStorefrontMsg(`Failed: ${err.message}`);
    } finally {
      setStorefrontBusy(false);
    }
  };

  const toggle2fa = async () => {
    const nextState = !twoFactorEnabled;
    const action = nextState ? 'enable' : 'disable';
    if (!confirm(`Are you sure you want to ${action} Two-Factor Authentication via email?`)) return;

    setTwoFactorBusy(true);
    setTwoFactorMsg('');
    try {
      const res = await api<{ twoFactorEnabled: boolean }>('/me/two-factor', 'POST', { enabled: nextState });
      setTwoFactorEnabled(res.twoFactorEnabled);
      setTwoFactorMethod('email');
      setTwoFactorMsg(`Two-Factor Authentication via email is now ${res.twoFactorEnabled ? 'ENABLED' : 'DISABLED'}.`);
    } catch (err: any) {
      setTwoFactorMsg(`Failed: ${err.message}`);
    } finally {
      setTwoFactorBusy(false);
    }
  };

  const startTotpSetup = async () => {
    setTwoFactorBusy(true);
    setTotpErr('');
    try {
      const res = await api<{ secret: string; otpAuthUri: string }>('/me/totp/setup', 'POST');
      setTotpSetup(res);
    } catch (err: any) {
      setTotpErr(err.message);
    } finally {
      setTwoFactorBusy(false);
    }
  };

  const confirmTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!totpSetup || !totpCode) return;
    setTwoFactorBusy(true);
    setTotpErr('');
    try {
      await api('/me/totp/enable', 'POST', { secret: totpSetup.secret, code: totpCode });
      setTwoFactorEnabled(true);
      setTwoFactorMethod('totp');
      setTotpSetup(null);
      setOtpCode('');
      setTwoFactorMsg('Authenticator app (TOTP) successfully activated!');
    } catch (err: any) {
      setTotpErr(err.message);
    } finally {
      setTwoFactorBusy(false);
    }
  };

  const disableTotp = async () => {
    const pw = prompt('Enter your account password to disable Authenticator 2FA:');
    if (!pw) return;
    setTwoFactorBusy(true);
    try {
      await api('/me/totp/disable', 'POST', { password: pw });
      setTwoFactorEnabled(false);
      setTwoFactorMsg('Two-Factor Authentication disabled.');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setTwoFactorBusy(false);
    }
  };

  const [sessions, setSessions] = useState<Session[]>([]);
  const load = () => api<Session[]>('/me/sessions').then(setSessions);
  useEffect(() => { load(); }, []);

  // Phase 2: Brand Kits & Reusable Visual Identity
  const [brandKits, setBrandKits] = useState<any[]>([]);
  const [showNewKitForm, setShowNewKitForm] = useState(false);
  const [newKitName, setNewKitName] = useState('');
  const [newKitPrimary, setNewKitPrimary] = useState('#f59e0b');
  const [newKitSecondary, setNewKitSecondary] = useState('#0f172a');
  const [newKitDrawerBg, setNewKitDrawerBg] = useState('#0d1117');
  const [kitMsg, setKitMsg] = useState('');

  const loadBrandKits = () => {
    api<{ brandKits: any[] }>('/brand-kits')
      .then((res) => {
        if (res?.brandKits) setBrandKits(res.brandKits);
      })
      .catch(() => {});
  };
  useEffect(() => { loadBrandKits(); }, []);

  const handleCreateBrandKit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKitName.trim()) return;
    try {
      await api('/brand-kits', 'POST', {
        name: newKitName.trim(),
        primaryColor: newKitPrimary,
        secondaryColor: newKitSecondary,
        accentColor: newKitPrimary,
        drawerBgColor: newKitDrawerBg,
        drawerTextColor: '#f1f5f9',
      });
      setNewKitName('');
      setShowNewKitForm(false);
      setKitMsg('Brand Kit created successfully.');
      setTimeout(() => setKitMsg(''), 3000);
      loadBrandKits();
    } catch (err: any) {
      alert(err.message || 'Failed to create brand kit');
    }
  };

  const handleDeleteBrandKit = async (id: number) => {
    if (!confirm('Delete this Brand Kit?')) return;
    try {
      await api(`/brand-kits/${id}`, 'DELETE');
      loadBrandKits();
    } catch (err: any) {
      alert(err.message || 'Failed to delete brand kit');
    }
  };

  const handleSetDefaultBrandKit = async (kit: any) => {
    try {
      await api(`/brand-kits/${kit.id}`, 'PUT', {
        ...kit,
        isDefault: true,
      });
      loadBrandKits();
    } catch (err: any) {
      alert(err.message || 'Failed to set default brand kit');
    }
  };

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

      <div className="card">
        <h2 style={{ marginTop: 0 }}>🔑 Change Password & Security Policy</h2>
        <ChangePasswordForm />
      </div>

      <div className="card">
        <h2>🛡️ Two-Factor Authentication (2FA)</h2>
        <p className="muted" style={{ fontSize: '14px', lineHeight: 1.5, margin: '0 0 16px 0' }}>
          Protect your account with enterprise two-factor authentication. Choose between an Authenticator App (TOTP) or Email Verification Codes.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', paddingBottom: '16px', borderBottom: '1px solid #e2e8f0' }}>
          <div>
            <span style={{ fontSize: '14px', fontWeight: 600, marginRight: '10px' }}>Current Status:</span>
            <span className={`badge ${twoFactorEnabled ? 'badge-success' : 'badge-neutral'}`}>
              {twoFactorEnabled ? `ENABLED (${(twoFactorMethod || 'email').toUpperCase()})` : 'DISABLED'}
            </span>
          </div>
          {twoFactorEnabled && (
            <button
              type="button"
              className="btn-secondary"
              onClick={twoFactorMethod === 'totp' ? disableTotp : toggle2fa}
              disabled={twoFactorBusy}
            >
              {twoFactorBusy ? 'Updating…' : 'Disable 2FA'}
            </button>
          )}
        </div>

        {/* 2FA Method Selection when disabled */}
        {!twoFactorEnabled && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginTop: '16px' }}>
            {/* Option A: Authenticator App */}
            <div style={{ border: '1px solid #cbd5e1', borderRadius: '10px', padding: '16px', background: '#f8fafc' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '20px' }}>📱</span>
                <strong style={{ fontSize: '15px' }}>Authenticator App (Recommended)</strong>
              </div>
              <p className="muted" style={{ fontSize: '13px', lineHeight: 1.4, margin: '0 0 14px 0' }}>
                Use Google Authenticator, Microsoft Authenticator, 1Password, or Authy to generate secure 6-digit codes on your mobile device.
              </p>
              <button
                type="button"
                className="btn-primary"
                onClick={startTotpSetup}
                disabled={twoFactorBusy || !!totpSetup}
              >
                Set Up Authenticator
              </button>
            </div>

            {/* Option B: Email OTP */}
            <div style={{ border: '1px solid #cbd5e1', borderRadius: '10px', padding: '16px', background: '#f8fafc' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '20px' }}>✉️</span>
                <strong style={{ fontSize: '15px' }}>Email Verification Codes</strong>
              </div>
              <p className="muted" style={{ fontSize: '13px', lineHeight: 1.4, margin: '0 0 14px 0' }}>
                Receive a temporary 6-digit OTP code sent to your registered email address <b>{user?.email}</b> upon every login.
              </p>
              <button
                type="button"
                className="btn-secondary"
                onClick={toggle2fa}
                disabled={twoFactorBusy}
              >
                Enable Email 2FA
              </button>
            </div>
          </div>
        )}

        {/* TOTP Setup Modal / Inline Form */}
        {totpSetup && (
          <form onSubmit={confirmTotp} style={{ marginTop: '20px', padding: '18px', border: '1px solid #f59e0b', borderRadius: '10px', background: '#fffbeb' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', color: '#92400e' }}>Scan QR Code or Enter Key Manually</h3>
            <p className="muted" style={{ fontSize: '13px', margin: '0 0 14px 0' }}>
              1. Scan this QR code with Google Authenticator or your password manager.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap', marginBottom: '14px' }}>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(totpSetup.otpAuthUri)}`}
                alt="Authenticator QR Code"
                style={{ width: '130px', height: '130px', border: '2px solid #fff', borderRadius: '8px', background: '#fff', padding: '4px' }}
              />
              <div>
                <span className="muted" style={{ fontSize: '12px', display: 'block' }}>Manual Secret Key:</span>
                <code style={{ fontSize: '14px', background: '#fff', padding: '4px 8px', borderRadius: '4px', border: '1px solid #fde68a', display: 'inline-block', margin: '4px 0 8px 0' }}>
                  {totpSetup.secret}
                </code>
                <small className="muted" style={{ display: 'block' }}>Account: {user?.email}</small>
              </div>
            </div>

            <p className="muted" style={{ fontSize: '13px', margin: '0 0 8px 0' }}>
              2. Enter the 6-digit code shown in your Authenticator app:
            </p>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input
                type="text"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="123456"
                style={{ width: '140px', fontSize: '20px', letterSpacing: '4px', textAlign: 'center', fontWeight: 700 }}
                required
              />
              <button type="submit" className="btn-primary" disabled={twoFactorBusy || totpCode.length < 6}>
                {twoFactorBusy ? 'Verifying…' : 'Verify & Activate'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setTotpSetup(null)}>
                Cancel
              </button>
            </div>
            {totpErr && <p className="err" style={{ marginTop: '8px' }}>{totpErr}</p>}
          </form>
        )}

        {twoFactorMsg && <p style={{ marginTop: '12px', fontSize: '13px', color: '#166534', fontWeight: 600 }}>{twoFactorMsg}</p>}
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

      {/* Phase 2: Brand Kits & Reusable Visual Identity */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h2 style={{ margin: 0 }}>🎨 Workspace Brand Kits</h2>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: '13px' }}>
              Standardize your organization's visual identity, primary colors, navigation accents, and drawer themes across all publications.
            </p>
          </div>
          <button
            type="button"
            className="btn-primary"
            style={{ fontSize: '12px', padding: '6px 12px' }}
            onClick={() => setShowNewKitForm(!showNewKitForm)}
          >
            {showNewKitForm ? 'Cancel' : '+ New Brand Kit'}
          </button>
        </div>

        {kitMsg && (
          <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', marginBottom: '12px' }}>
            ✓ {kitMsg}
          </div>
        )}

        {showNewKitForm && (
          <form onSubmit={handleCreateBrandKit} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 700 }}>Create New Brand Kit</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Brand Kit Name</label>
                <input
                  type="text"
                  placeholder="e.g. Summer Campaign 2026"
                  value={newKitName}
                  onChange={(e) => setNewKitName(e.target.value)}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  required
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Primary Brand Accent</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="color"
                    value={newKitPrimary}
                    onChange={(e) => setNewKitPrimary(e.target.value)}
                    style={{ width: '36px', height: '32px', borderRadius: '4px', border: '1px solid #cbd5e1', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '12px', fontFamily: 'monospace' }}>{newKitPrimary}</span>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Bar / Header Shade</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="color"
                    value={newKitSecondary}
                    onChange={(e) => setNewKitSecondary(e.target.value)}
                    style={{ width: '36px', height: '32px', borderRadius: '4px', border: '1px solid #cbd5e1', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '12px', fontFamily: 'monospace' }}>{newKitSecondary}</span>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Side Drawer Shade</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="color"
                    value={newKitDrawerBg}
                    onChange={(e) => setNewKitDrawerBg(e.target.value)}
                    style={{ width: '36px', height: '32px', borderRadius: '4px', border: '1px solid #cbd5e1', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '12px', fontFamily: 'monospace' }}>{newKitDrawerBg}</span>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button type="button" className="btn-secondary" onClick={() => setShowNewKitForm(false)} style={{ fontSize: '12px' }}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" style={{ fontSize: '12px' }}>
                Save Brand Kit
              </button>
            </div>
          </form>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
          {brandKits.map((kit) => (
            <div
              key={kit.id}
              style={{
                border: kit.isDefault ? '2px solid #f59e0b' : '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '14px',
                background: kit.isDefault ? '#fffbeb' : '#ffffff',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '10px',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <b style={{ fontSize: '14px', color: '#0f172a' }}>{kit.name}</b>
                  {kit.isDefault && (
                    <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', background: '#f59e0b', color: '#0f172a' }}>
                      DEFAULT
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '8px 0' }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '6px', background: kit.accentColor, border: '1px solid rgba(0,0,0,0.1)' }} title="Accent Color" />
                  <div style={{ width: '24px', height: '24px', borderRadius: '6px', background: kit.secondaryColor, border: '1px solid rgba(0,0,0,0.1)' }} title="Bar Color" />
                  <div style={{ width: '24px', height: '24px', borderRadius: '6px', background: kit.drawerBgColor || '#0d1117', border: '1px solid rgba(0,0,0,0.1)' }} title="Drawer Color" />
                  <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '6px' }}>{kit.fontFamily}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', paddingTop: '6px', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                {!kit.isDefault && (
                  <button
                    type="button"
                    className="link"
                    style={{ fontSize: '11px', color: '#b45309', fontWeight: 600 }}
                    onClick={() => handleSetDefaultBrandKit(kit)}
                  >
                    Set Default
                  </button>
                )}
                {brandKits.length > 1 && (
                  <button
                    type="button"
                    className="link"
                    style={{ fontSize: '11px', color: '#dc2626' }}
                    onClick={() => handleDeleteBrandKit(kit.id)}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Phase 3: Public Business Profile & Storefront Hub */}
      <div className="card" id="storefront">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ margin: 0 }}>🏪 Public Business Profile &amp; Storefront</h2>
              {storefront.isVerified && (
                <span style={{ background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '12px' }}>
                  ✓ Verified Merchant
                </span>
              )}
            </div>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: '13px' }}>
              Configure your public storefront (`/biz/{storefront.slug || 'slug'}`) showcasing your corporate brand, contact channels, and all published digital catalogues.
            </p>
          </div>
          {storefront.slug && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <a
                href={`/biz/${storefront.slug}`}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary"
                style={{ fontSize: '12px', padding: '6px 12px', textDecoration: 'none' }}
              >
                View Live Storefront ↗
              </a>
              <button
                type="button"
                className="btn-secondary"
                style={{ fontSize: '12px', padding: '6px 12px' }}
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/biz/${storefront.slug}`);
                  setCopiedStorefrontLink(true);
                  setTimeout(() => setCopiedStorefrontLink(false), 2500);
                }}
              >
                {copiedStorefrontLink ? '✓ Copied Link' : '📋 Copy Storefront Link'}
              </button>
            </div>
          )}
        </div>

        {storefrontMsg && (
          <div style={{
            background: storefrontMsg.startsWith('Failed') ? '#fef2f2' : '#ecfdf5',
            border: `1px solid ${storefrontMsg.startsWith('Failed') ? '#fecaca' : '#a7f3d0'}`,
            color: storefrontMsg.startsWith('Failed') ? '#b91c1c' : '#065f46',
            borderRadius: '8px',
            padding: '10px 14px',
            fontSize: '13px',
            marginBottom: '14px'
          }}>
            {storefrontMsg}
          </div>
        )}

        <form onSubmit={handleSaveStorefront} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                Business / Company Name *
              </label>
              <input
                type="text"
                required
                value={storefront.businessName}
                onChange={(e) => setStorefront({ ...storefront, businessName: e.target.value })}
                placeholder="e.g. Mannat Investments Pte Ltd"
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                Storefront Slug (URL)
              </label>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRight: 'none', padding: '8px 10px', borderRadius: '8px 0 0 8px', fontSize: '12px', color: '#64748b' }}>
                  /biz/
                </span>
                <input
                  type="text"
                  value={storefront.slug}
                  onChange={(e) => setStorefront({ ...storefront, slug: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })}
                  placeholder="mannat-investments"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '0 8px 8px 0', border: '1px solid #cbd5e1', fontSize: '13px' }}
                />
              </div>
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                Company Tagline / Subtitle
              </label>
              <input
                type="text"
                value={storefront.tagline}
                onChange={(e) => setStorefront({ ...storefront, tagline: e.target.value })}
                placeholder="e.g. Quality Wholesale Food Products & Commercial Supplies in Fiji"
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                About Company / Bio Description
              </label>
              <textarea
                rows={3}
                value={storefront.bio}
                onChange={(e) => setStorefront({ ...storefront, bio: e.target.value })}
                placeholder="Brief introduction of your business, services, catalogues, and wholesale terms..."
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', resize: 'vertical' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                💬 WhatsApp Order Number (Direct Chat)
              </label>
              <input
                type="text"
                value={storefront.whatsappPhone}
                onChange={(e) => setStorefront({ ...storefront, whatsappPhone: e.target.value })}
                placeholder="e.g. 6799991234 (Country code + number)"
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
              />
              <span className="muted" style={{ fontSize: '11px' }}>Enables 1-click WhatsApp order buttons in catalogue reader modals</span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                Direct Telephone
              </label>
              <input
                type="text"
                value={storefront.phone}
                onChange={(e) => setStorefront({ ...storefront, phone: e.target.value })}
                placeholder="e.g. +679 330 1234"
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                Sales Inquiry Email
              </label>
              <input
                type="email"
                value={storefront.email}
                onChange={(e) => setStorefront({ ...storefront, email: e.target.value })}
                placeholder="e.g. marketing@mannat.com.fj"
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                Official Website
              </label>
              <input
                type="url"
                value={storefront.websiteUrl}
                onChange={(e) => setStorefront({ ...storefront, websiteUrl: e.target.value })}
                placeholder="https://www.mannat.com.fj"
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                Base Currency Code
              </label>
              <select
                value={storefront.currency}
                onChange={(e) => setStorefront({ ...storefront, currency: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
              >
                <option value="FJD">FJD ($ Fiji Dollar)</option>
                <option value="USD">USD ($ US Dollar)</option>
                <option value="AUD">AUD ($ Australian Dollar)</option>
                <option value="NZD">NZD ($ New Zealand Dollar)</option>
                <option value="EUR">EUR (€ Euro)</option>
                <option value="GBP">GBP (£ British Pound)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                Physical Address / Office
              </label>
              <input
                type="text"
                value={storefront.address}
                onChange={(e) => setStorefront({ ...storefront, address: e.target.value })}
                placeholder="e.g. Lot 12 Wailada Industrial Sub-Division, Lami, Fiji"
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                Company Logo URL
              </label>
              <input
                type="url"
                value={storefront.logoUrl}
                onChange={(e) => setStorefront({ ...storefront, logoUrl: e.target.value })}
                placeholder="https://.../logo.png"
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                Storefront Banner Image URL
              </label>
              <input
                type="url"
                value={storefront.bannerUrl}
                onChange={(e) => setStorefront({ ...storefront, bannerUrl: e.target.value })}
                placeholder="https://.../banner.jpg"
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
            <button
              type="submit"
              disabled={storefrontBusy}
              className="btn-primary"
              style={{ padding: '8px 20px', fontSize: '13px' }}
            >
              {storefrontBusy ? 'Saving Storefront…' : 'Save Storefront Settings'}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h2 style={{ margin: 0 }}>Active sessions</h2>
          {sessions.length > 1 && (
            <button
              type="button"
              className="btn-secondary"
              style={{ fontSize: '12px', padding: '4px 10px' }}
              onClick={async () => {
                if (confirm('Sign out of all other devices and active sessions?')) {
                  await api('/me/sessions', 'DELETE');
                  load();
                }
              }}
            >
              Sign out all other devices
            </button>
          )}
        </div>
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
