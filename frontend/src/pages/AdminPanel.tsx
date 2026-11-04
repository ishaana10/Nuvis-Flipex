import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';

interface Stats {
  totalUsers: number;
  activeUsers: number;
  totalCompanies: number;
  activeCompanies: number;
  totalFlipbooks: number;
  readyFlipbooks: number;
  totalPages: number;
  totalViews: number;
}

interface AdminUser {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'user';
  status: 'active' | 'suspended';
  planId: number;
  planName: string;
  tenantId: number | null;
  companyName: string;
  emailVerified: boolean;
  flipbooksCount: number;
  lastLoginAt: string | null;
  createdAt: string;
}

interface Company {
  id: number;
  uuid: string;
  name: string;
  slug: string;
  planId: number;
  planName: string;
  planPrice: number;
  maxFlipbooks: number;
  maxStorageMb: number;
  isActive: boolean;
  usersCount: number;
  flipbooksCount: number;
  createdAt: string;
  billingName?: string;
  billingEmail?: string;
  billingAddress?: string;
  taxId?: string;
  paymentMethod?: string;
  paymentStatus?: 'paid' | 'pending' | 'overdue' | 'trial' | 'exempt';
  billingCycle?: 'monthly' | 'quarterly' | 'annually';
  amount?: number;
  currency?: string;
  lastPaymentDate?: string | null;
  nextBillingDate?: string | null;
  paymentReference?: string | null;
  billingNotes?: string | null;
}

interface Plan {
  id: number;
  name: string;
  price: number;
  maxFlipbooks: number;
  maxPages: number;
  maxUploadMb: number;
  monthlyViews: number;
  removeBranding: boolean;
  companiesCount: number;
  usersCount: number;
}

interface SystemSettings {
  allowSelfRegistration: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpEncryption: string;
  smtpFromEmail: string;
  smtpFromName: string;
  notifyWelcomeEmail: boolean;
  notifyCustomerOnPublish: boolean;
}

interface EmailLog {
  id: number;
  recipient: string;
  subject: string;
  template: string;
  status: 'sent' | 'simulated' | 'failed';
  errorMessage: string | null;
  preview: string | null;
  sentAt: string;
}

export default function AdminPanel() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'overview' | 'users' | 'companies' | 'subscriptions' | 'email'>('overview');

  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);

  const [loading, setLoading] = useState(true);
  const [userQuery, setUserQuery] = useState('');
  const [companyQuery, setCompanyQuery] = useState('');

  // Modals state
  const [userModal, setUserModal] = useState<{ open: boolean; user: AdminUser | null }>({ open: false, user: null });
  const [passwordModal, setPasswordModal] = useState<{ open: boolean; user: AdminUser | null }>({ open: false, user: null });
  const [companyModal, setCompanyModal] = useState<{ open: boolean; company: Company | null }>({ open: false, company: null });
  const [billingModal, setBillingModal] = useState<{ open: boolean; company: Company | null }>({ open: false, company: null });
  const [planModal, setPlanModal] = useState<{ open: boolean; plan: Plan | null }>({ open: false, plan: null });

  // Test Email & Broadcast State
  const [testEmailAddr, setTestEmailAddr] = useState('');
  const [testEmailBusy, setTestEmailBusy] = useState(false);
  const [broadcastTarget, setBroadcastTarget] = useState('all');
  const [broadcastSubject, setBroadcastSubject] = useState('');
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastBusy, setBroadcastBusy] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showMsg = (text: string, type: 'success' | 'error' = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 4500);
  };

  const loadStats = useCallback(() => api<Stats>('/admin/stats').then(setStats), []);
  const loadUsers = useCallback(() => api<AdminUser[]>(`/admin/users?q=${encodeURIComponent(userQuery)}`).then(setUsers), [userQuery]);
  const loadCompanies = useCallback(() => api<Company[]>(`/admin/companies?q=${encodeURIComponent(companyQuery)}`).then(setCompanies), [companyQuery]);
  const loadPlans = useCallback(() => api<Plan[]>('/admin/plans').then(setPlans), []);
  const loadSettings = useCallback(() => api<SystemSettings>('/admin/settings').then(setSettings), []);
  const loadEmailLogs = useCallback(() => api<EmailLog[]>('/admin/email-logs').then(setEmailLogs), []);

  const refreshAll = useCallback(() => {
    setLoading(true);
    Promise.all([loadStats(), loadUsers(), loadCompanies(), loadPlans(), loadSettings(), loadEmailLogs()])
      .finally(() => setLoading(false));
  }, [loadStats, loadUsers, loadCompanies, loadPlans, loadSettings, loadEmailLogs]);

  useEffect(() => {
    if (user?.role === 'admin') {
      refreshAll();
    }
  }, [user, refreshAll]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(loadUsers, 250);
    return () => clearTimeout(t);
  }, [userQuery, loadUsers]);

  useEffect(() => {
    const t = setTimeout(loadCompanies, 250);
    return () => clearTimeout(t);
  }, [companyQuery, loadCompanies]);

  if (user && user.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSaveSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!settings) return;
    setSavingSettings(true);
    try {
      await api('/admin/settings', 'PATCH', settings);
      showMsg('Platform & Email settings saved successfully.');
    } catch (err: any) {
      showMsg(`Error saving settings: ${err.message}`, 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSendTestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testEmailAddr) return;
    setTestEmailBusy(true);
    try {
      const res = await api<{ message: string }>('/admin/settings/test-email', 'POST', { email: testEmailAddr });
      showMsg(res.message);
      loadEmailLogs();
    } catch (err: any) {
      showMsg(err.message, 'error');
    } finally {
      setTestEmailBusy(false);
    }
  };

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastSubject || !broadcastTitle || !broadcastMessage) {
      showMsg('Subject, Title, and Message are required', 'error');
      return;
    }
    setBroadcastBusy(true);
    try {
      const res = await api<{ sentCount: number }>('/admin/notifications/broadcast', 'POST', {
        target: broadcastTarget,
        subject: broadcastSubject,
        title: broadcastTitle,
        message: broadcastMessage,
      });
      showMsg(`Broadcast notification dispatched to ${res.sentCount} customer(s).`);
      setBroadcastSubject('');
      setBroadcastTitle('');
      setBroadcastMessage('');
      loadEmailLogs();
    } catch (err: any) {
      showMsg(err.message, 'error');
    } finally {
      setBroadcastBusy(false);
    }
  };

  return (
    <div className="admin-page">
      {/* Top Banner & Header */}
      <div className="admin-header">
        <div>
          <div className="admin-badge-row">
            <span className="admin-pill">System Administration</span>
            <span className="nuvis-brand-text admin-brand-tag">Nuvis Flipex</span>
          </div>
          <h1 className="admin-title">Admin Management Console</h1>
          <p className="admin-subtitle">
            Manage users, corporate tenants, subscription plans, email setup, and security policies.
          </p>
        </div>
        <div className="admin-header-actions">
          <Link to="/settings" className="btn-secondary">
            ⚙️ My Profile & Password
          </Link>
          <button className="btn-primary" onClick={refreshAll} disabled={loading}>
            {loading ? 'Refreshing…' : '🔄 Refresh Data'}
          </button>
        </div>
      </div>

      {msg && (
        <div className={`admin-alert ${msg.type === 'error' ? 'alert-danger' : 'alert-success'}`}>
          {msg.text}
        </div>
      )}

      {/* Navigation Tabs (BoardUI Style) */}
      <div className="admin-tabs">
        <button
          className={`admin-tab-btn ${tab === 'overview' ? 'active' : ''}`}
          onClick={() => setTab('overview')}
        >
          📊 Overview
        </button>
        <button
          className={`admin-tab-btn ${tab === 'users' ? 'active' : ''}`}
          onClick={() => setTab('users')}
        >
          👥 User Management ({users.length})
        </button>
        <button
          className={`admin-tab-btn ${tab === 'companies' ? 'active' : ''}`}
          onClick={() => setTab('companies')}
        >
          🏢 Company Management ({companies.length})
        </button>
        <button
          className={`admin-tab-btn ${tab === 'subscriptions' ? 'active' : ''}`}
          onClick={() => setTab('subscriptions')}
        >
          💎 Subscriptions & Plans ({plans.length})
        </button>
        <button
          className={`admin-tab-btn ${tab === 'email' ? 'active' : ''}`}
          onClick={() => setTab('email')}
        >
          📧 Email Setup & Access
        </button>
      </div>

      {/* Tab 1: Overview */}
      {tab === 'overview' && (
        <div className="admin-tab-content">
          <div className="admin-stats-grid">
            <div className="stat-card">
              <span className="stat-label">Total Users</span>
              <b className="stat-val">{stats?.totalUsers ?? '—'}</b>
              <small className="stat-sub">{stats?.activeUsers ?? 0} active</small>
            </div>
            <div className="stat-card">
              <span className="stat-label">Companies (Tenants)</span>
              <b className="stat-val">{stats?.totalCompanies ?? '—'}</b>
              <small className="stat-sub">{stats?.activeCompanies ?? 0} active workspaces</small>
            </div>
            <div className="stat-card">
              <span className="stat-label">Publications</span>
              <b className="stat-val">{stats?.totalFlipbooks ?? '—'}</b>
              <small className="stat-sub">{stats?.readyFlipbooks ?? 0} ready for reading</small>
            </div>
            <div className="stat-card">
              <span className="stat-label">Converted Pages</span>
              <b className="stat-val">{stats?.totalPages ?? '—'}</b>
              <small className="stat-sub">High-res rendered images</small>
            </div>
            <div className="stat-card highlight">
              <span className="stat-label">Total Reader Views</span>
              <b className="stat-val nuvis-brand-text">{stats?.totalViews ?? '—'}</b>
              <small className="stat-sub">Tracked reader sessions</small>
            </div>
          </div>

          <div className="admin-overview-columns">
            <div className="admin-card">
              <div className="card-header-row">
                <h3>Quick Actions</h3>
              </div>
              <div className="quick-actions-list">
                <button
                  className="quick-action-btn"
                  onClick={() => { setUserModal({ open: true, user: null }); }}
                >
                  <span className="action-icon">👤</span>
                  <div>
                    <b>Add New User</b>
                    <p className="muted">Register user and assign company & role</p>
                  </div>
                </button>
                <button
                  className="quick-action-btn"
                  onClick={() => { setCompanyModal({ open: true, company: null }); }}
                >
                  <span className="action-icon">🏢</span>
                  <div>
                    <b>Register Company / Tenant</b>
                    <p className="muted">Create isolated multi-tenant workspace</p>
                  </div>
                </button>
                <button
                  className="quick-action-btn"
                  onClick={() => setTab('email')}
                >
                  <span className="action-icon">📧</span>
                  <div>
                    <b>Configure Email & Self-Registration</b>
                    <p className="muted">SMTP settings, 2FA, and registration policy</p>
                  </div>
                </button>
              </div>
            </div>

            <div className="admin-card">
              <div className="card-header-row">
                <h3>System Architecture & Security</h3>
              </div>
              <div className="system-info-list">
                <div className="sys-info-row">
                  <span>Self-Registration:</span>
                  <span className={`badge ${settings?.allowSelfRegistration ? 'badge-success' : 'badge-danger'}`}>
                    {settings?.allowSelfRegistration ? 'Open to Public' : 'Disabled (Admin Only)'}
                  </span>
                </div>
                <div className="sys-info-row">
                  <span>Customer Isolation:</span>
                  <span className="badge badge-success">Active (Multi-Tenant RLS)</span>
                </div>
                <div className="sys-info-row">
                  <span>2FA via Email:</span>
                  <span className="badge badge-golden">Enabled (6-Digit OTP)</span>
                </div>
                <div className="sys-info-row">
                  <span>Storage Sandboxing:</span>
                  <span className="badge badge-success">/storage/tenants/{'{id}'}/</span>
                </div>
                <div className="sys-info-row">
                  <span>Password Hashing:</span>
                  <span className="badge badge-info">Argon2id (PHP 8.3)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: User Management */}
      {tab === 'users' && (
        <div className="admin-tab-content">
          <div className="table-controls">
            <input
              type="text"
              placeholder="Search users by name, email, or company…"
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              className="admin-search-input"
            />
            <button
              className="btn-primary"
              onClick={() => setUserModal({ open: true, user: null })}
            >
              + Add User
            </button>
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Company (Tenant)</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Plan</th>
                  <th>Magazines</th>
                  <th>Created</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="center muted" style={{ padding: '32px' }}>
                      No users found.
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div className="user-cell">
                          <div className="user-avatar-circle">{u.name.charAt(0).toUpperCase()}</div>
                          <div>
                            <b>{u.name}</b>
                            <br />
                            <small className="muted">{u.email}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="company-tag">{u.companyName}</span>
                      </td>
                      <td>
                        <span className={`badge ${u.role === 'admin' ? 'badge-golden' : 'badge-neutral'}`}>
                          {u.role.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${u.status === 'active' ? 'badge-success' : 'badge-danger'}`}>
                          {u.status}
                        </span>
                      </td>
                      <td>{u.planName}</td>
                      <td><b>{u.flipbooksCount}</b></td>
                      <td><small className="muted">{new Date(u.createdAt).toLocaleDateString()}</small></td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="action-button-group">
                          <button
                            className="btn-tbl edit"
                            onClick={() => setUserModal({ open: true, user: u })}
                            title="Edit user details"
                          >
                            Edit
                          </button>
                          <button
                            className="btn-tbl pw"
                            onClick={() => setPasswordModal({ open: true, user: u })}
                            title="Set/Reset Password"
                          >
                            Password
                          </button>
                          {u.id !== user?.id && (
                            <button
                              className="btn-tbl del"
                              onClick={async () => {
                                if (!confirm(`Delete user "${u.name}" (${u.email})?`)) return;
                                try {
                                  await api(`/admin/users/${u.id}`, 'DELETE');
                                  showMsg(`User ${u.name} deleted.`);
                                  loadUsers();
                                  loadStats();
                                } catch (err: any) {
                                  showMsg(err.message, 'error');
                                }
                              }}
                              title="Delete user"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Company Management */}
      {tab === 'companies' && (
        <div className="admin-tab-content">
          <div className="table-controls">
            <input
              type="text"
              placeholder="Search companies by name or slug…"
              value={companyQuery}
              onChange={(e) => setCompanyQuery(e.target.value)}
              className="admin-search-input"
            />
            <button
              className="btn-primary"
              onClick={() => setCompanyModal({ open: true, company: null })}
            >
              + Add Company
            </button>
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Workspace Slug</th>
                  <th>Subscription Plan</th>
                  <th>Payment Status</th>
                  <th>Flipbook Quota</th>
                  <th>Storage Quota</th>
                  <th>Users</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {companies.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="center muted" style={{ padding: '32px' }}>
                      No companies found.
                    </td>
                  </tr>
                ) : (
                  companies.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <b>{c.name}</b>
                        <br />
                        <small className="muted font-mono">{c.uuid}</small>
                      </td>
                      <td>
                        <code className="text-amber-400">/{c.slug}</code>
                      </td>
                      <td>
                        <span className="badge badge-golden">{c.planName} (${c.planPrice}/mo)</span>
                      </td>
                      <td>
                        <span className={`badge ${
                          c.paymentStatus === 'paid' ? 'badge-success' :
                          c.paymentStatus === 'pending' ? 'badge-warning' :
                          c.paymentStatus === 'overdue' ? 'badge-danger' : 'badge-neutral'
                        }`}>
                          {(c.paymentStatus || 'paid').toUpperCase()}
                        </span>
                        {c.amount !== undefined && (
                          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                            {c.currency || 'FJD'} ${Number(c.amount).toFixed(2)}
                          </div>
                        )}
                      </td>
                      <td>{c.flipbooksCount} / {c.maxFlipbooks}</td>
                      <td>{c.maxStorageMb} MB</td>
                      <td><b>{c.usersCount}</b> members</td>
                      <td>
                        <span className={`badge ${c.isActive ? 'badge-success' : 'badge-danger'}`}>
                          {c.isActive ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="action-button-group">
                          <button
                            className="btn-tbl billing"
                            title="Manage Payment & Invoicing Details"
                            onClick={() => setBillingModal({ open: true, company: c })}
                          >
                            💳 Billing
                          </button>
                          <button
                            className="btn-tbl edit"
                            onClick={() => setCompanyModal({ open: true, company: c })}
                          >
                            Edit
                          </button>
                          <button
                            className="btn-tbl del"
                            onClick={async () => {
                              if (!confirm(`Delete company "${c.name}"? Members will be unassigned.`)) return;
                              try {
                                await api(`/admin/companies/${c.id}`, 'DELETE');
                                showMsg(`Company ${c.name} deleted.`);
                                loadCompanies();
                                loadStats();
                              } catch (err: any) {
                                showMsg(err.message, 'error');
                              }
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Subscriptions & Plans */}
      {tab === 'subscriptions' && (
        <div className="admin-tab-content">
          <div className="plans-grid">
            {plans.map((p) => (
              <div className={`plan-card ${p.name === 'Enterprise' ? 'featured' : ''}`} key={p.id}>
                <div className="plan-badge-top">
                  {p.name === 'Enterprise' ? '🌟 Enterprise' : 'Subscription Tier'}
                </div>
                <h3 className="plan-name">{p.name}</h3>
                <div className="plan-price">
                  <span className="price-num">${p.price}</span>
                  <span className="price-period">/ month</span>
                </div>

                <div className="plan-features">
                  <div className="feature-item">
                    <span>📚 Max Flipbooks:</span>
                    <b>{p.maxFlipbooks}</b>
                  </div>
                  <div className="feature-item">
                    <span>📄 Max Pages per PDF:</span>
                    <b>{p.maxPages}</b>
                  </div>
                  <div className="feature-item">
                    <span>💾 Max PDF Upload Size:</span>
                    <b>{p.maxUploadMb} MB</b>
                  </div>
                  <div className="feature-item">
                    <span>👁️ Monthly Views:</span>
                    <b>{p.monthlyViews.toLocaleString()}</b>
                  </div>
                  <div className="feature-item">
                    <span>🎨 White-Label / Remove Branding:</span>
                    <b>{p.removeBranding ? '✅ Enabled' : '❌ Disabled'}</b>
                  </div>
                </div>

                <div className="plan-sub-stats">
                  <span>🏢 <b>{p.companiesCount}</b> Companies</span>
                  <span>👥 <b>{p.usersCount}</b> Users</span>
                </div>

                <button
                  className="btn-primary"
                  style={{ width: '100%', marginTop: '16px' }}
                  onClick={() => setPlanModal({ open: true, plan: p })}
                >
                  Edit Plan Quotas
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 5: Email Setup & Platform Access */}
      {tab === 'email' && (
        <div className="admin-tab-content">
          <div className="admin-email-grid">
            {/* Card 1: Platform Self-Registration & Notifications Policy */}
            <div className="admin-card">
              <div className="card-header-row">
                <h3>🌐 Platform Access & Registration Policy</h3>
              </div>
              <p className="muted" style={{ fontSize: '13px', margin: '0 0 16px 0' }}>
                Control how new customers join Nuvis Flipex and configure automated transactional email triggers.
              </p>

              {settings && (
                <div className="settings-toggles-list">
                  <label className="toggle-row">
                    <div>
                      <b>Allow Public Self-Registration</b>
                      <p className="muted">
                        When OFF, public registration is blocked. Accounts can only be invited or created by Administrators.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      className="admin-checkbox"
                      checked={settings.allowSelfRegistration}
                      onChange={(e) => setSettings({ ...settings, allowSelfRegistration: e.target.checked })}
                    />
                  </label>

                  <label className="toggle-row">
                    <div>
                      <b>Send Customer Welcome Email</b>
                      <p className="muted">Automatically dispatch welcome credentials when accounts are created.</p>
                    </div>
                    <input
                      type="checkbox"
                      className="admin-checkbox"
                      checked={settings.notifyWelcomeEmail}
                      onChange={(e) => setSettings({ ...settings, notifyWelcomeEmail: e.target.checked })}
                    />
                  </label>

                  <label className="toggle-row">
                    <div>
                      <b>Customer Notification on Flipbook Conversion</b>
                      <p className="muted">Notify owner by email when PDF has converted and is ready for reading.</p>
                    </div>
                    <input
                      type="checkbox"
                      className="admin-checkbox"
                      checked={settings.notifyCustomerOnPublish}
                      onChange={(e) => setSettings({ ...settings, notifyCustomerOnPublish: e.target.checked })}
                    />
                  </label>

                  <button
                    className="btn-primary"
                    onClick={() => handleSaveSettings()}
                    disabled={savingSettings}
                    style={{ marginTop: '10px' }}
                  >
                    {savingSettings ? 'Saving Policies…' : 'Save Policy Settings'}
                  </button>
                </div>
              )}
            </div>

            {/* Card 2: SMTP Mail Server Configuration */}
            <div className="admin-card">
              <div className="card-header-row">
                <h3>⚙️ SMTP Mail Server Configuration</h3>
              </div>
              <p className="muted" style={{ fontSize: '13px', margin: '0 0 16px 0' }}>
                Configure connection credentials for your outgoing email provider (SendGrid, Mailgun, Amazon SES, Postmark, or local SMTP).
              </p>

              {settings && (
                <form onSubmit={handleSaveSettings} className="stack">
                  <div className="row-fields">
                    <label className="field">
                      <span>SMTP Host</span>
                      <input
                        value={settings.smtpHost}
                        onChange={(e) => setSettings({ ...settings, smtpHost: e.target.value })}
                        placeholder="e.g. smtp.mailgun.org or 127.0.0.1"
                        required
                      />
                    </label>
                    <label className="field">
                      <span>SMTP Port</span>
                      <input
                        type="number"
                        value={settings.smtpPort}
                        onChange={(e) => setSettings({ ...settings, smtpPort: Number(e.target.value) })}
                        placeholder="587, 465, or 1025"
                        required
                      />
                    </label>
                  </div>

                  <div className="row-fields">
                    <label className="field">
                      <span>Encryption Protocol</span>
                      <select
                        value={settings.smtpEncryption}
                        onChange={(e) => setSettings({ ...settings, smtpEncryption: e.target.value })}
                      >
                        <option value="none">None (Plain / Local)</option>
                        <option value="tls">TLS (STARTTLS - Port 587)</option>
                        <option value="ssl">SSL (SMTPS - Port 465)</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>SMTP Username</span>
                      <input
                        value={settings.smtpUser}
                        onChange={(e) => setSettings({ ...settings, smtpUser: e.target.value })}
                        placeholder="Username / API Key"
                      />
                    </label>
                  </div>

                  <label className="field">
                    <span>SMTP Password</span>
                    <input
                      type="password"
                      value={settings.smtpPass}
                      onChange={(e) => setSettings({ ...settings, smtpPass: e.target.value })}
                      placeholder="Password / API Secret"
                    />
                  </label>

                  <div className="row-fields">
                    <label className="field">
                      <span>From Email Address</span>
                      <input
                        type="email"
                        value={settings.smtpFromEmail}
                        onChange={(e) => setSettings({ ...settings, smtpFromEmail: e.target.value })}
                        required
                      />
                    </label>
                    <label className="field">
                      <span>From Name</span>
                      <input
                        value={settings.smtpFromName}
                        onChange={(e) => setSettings({ ...settings, smtpFromName: e.target.value })}
                        required
                      />
                    </label>
                  </div>

                  <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                    <button type="submit" className="btn-primary" disabled={savingSettings}>
                      {savingSettings ? 'Saving SMTP…' : 'Save SMTP Settings'}
                    </button>
                  </div>
                </form>
              )}

              {/* Quick SMTP Test */}
              <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
                <b>📨 Send SMTP Test Email</b>
                <p className="muted" style={{ fontSize: '12px', margin: '4px 0 10px 0' }}>
                  Verify that your mail server can establish connection and deliver emails.
                </p>
                <form onSubmit={handleSendTestEmail} style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="email"
                    required
                    placeholder="Recipient email address…"
                    value={testEmailAddr}
                    onChange={(e) => setTestEmailAddr(e.target.value)}
                    style={{ flex: 1, padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  />
                  <button type="submit" className="btn-secondary" disabled={testEmailBusy}>
                    {testEmailBusy ? 'Sending…' : 'Send Test'}
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* Customer Broadcast Notification Card */}
          <div className="admin-card" style={{ marginTop: '24px' }}>
            <div className="card-header-row">
              <h3>📢 Send Customer Notification / Announcement</h3>
            </div>
            <p className="muted" style={{ fontSize: '13px', margin: '0 0 16px 0' }}>
              Broadcast platform announcements, feature updates, or customer notices directly to user inboxes with branded Nuvis Flipex formatting.
            </p>
            <form onSubmit={handleSendBroadcast} className="stack">
              <div className="row-fields">
                <label className="field">
                  <span>Recipient Audience</span>
                  <select value={broadcastTarget} onChange={(e) => setBroadcastTarget(e.target.value)}>
                    <option value="all">All Active Customers ({users.length} users)</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.email}>{u.name} ({u.email})</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Email Subject Line</span>
                  <input
                    required
                    placeholder="e.g. Important Service Update"
                    value={broadcastSubject}
                    onChange={(e) => setBroadcastSubject(e.target.value)}
                  />
                </label>
              </div>

              <label className="field">
                <span>Announcement Title</span>
                <input
                  required
                  placeholder="e.g. New 3D Viewer Features Available!"
                  value={broadcastTitle}
                  onChange={(e) => setBroadcastTitle(e.target.value)}
                />
              </label>

              <label className="field">
                <span>Message Body</span>
                <textarea
                  rows={4}
                  required
                  placeholder="Type your message to customers here…"
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                />
              </label>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="submit" className="btn-primary" disabled={broadcastBusy}>
                  {broadcastBusy ? 'Dispatching…' : '🚀 Send Customer Notification'}
                </button>
              </div>
            </form>
          </div>

          {/* Email Outbox & Audit Logs */}
          <div className="admin-card" style={{ marginTop: '24px' }}>
            <div className="card-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>📨 Outbox & Transactional Email Audit Logs</h3>
              <button className="btn-secondary" onClick={loadEmailLogs}>
                🔄 Refresh Logs
              </button>
            </div>
            <p className="muted" style={{ fontSize: '13px', margin: '0 0 16px 0' }}>
              Audit trail of all password resets, 2FA security codes, account creations, and customer notifications.
            </p>

            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Recipient</th>
                    <th>Subject</th>
                    <th>Template</th>
                    <th>Status</th>
                    <th>Sent At</th>
                    <th>Preview / Details</th>
                  </tr>
                </thead>
                <tbody>
                  {emailLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="center muted" style={{ padding: '24px' }}>
                        No email activity recorded yet.
                      </td>
                    </tr>
                  ) : (
                    emailLogs.map((log) => (
                      <tr key={log.id}>
                        <td><b>{log.recipient}</b></td>
                        <td>{log.subject}</td>
                        <td><code style={{ fontSize: '12px' }}>{log.template}</code></td>
                        <td>
                          <span className={`badge ${log.status === 'sent' ? 'badge-success' : (log.status === 'simulated' ? 'badge-golden' : 'badge-danger')}`}>
                            {log.status.toUpperCase()}
                          </span>
                        </td>
                        <td><small className="muted">{new Date(log.sentAt).toLocaleString()}</small></td>
                        <td>
                          <small className="muted" title={log.errorMessage || log.preview || ''}>
                            {log.errorMessage ? `⚠️ ${log.errorMessage.slice(0, 45)}…` : `${log.preview?.slice(0, 45)}…`}
                          </small>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* User Create/Edit Modal */}
      {userModal.open && (
        <UserModal
          user={userModal.user}
          companies={companies}
          plans={plans}
          onClose={() => setUserModal({ open: false, user: null })}
          onSaved={() => {
            setUserModal({ open: false, user: null });
            loadUsers();
            loadStats();
            showMsg(userModal.user ? 'User updated successfully' : 'User created successfully');
          }}
        />
      )}

      {/* Password Reset Modal */}
      {passwordModal.open && passwordModal.user && (
        <PasswordModal
          user={passwordModal.user}
          onClose={() => setPasswordModal({ open: false, user: null })}
          onSaved={() => {
            setPasswordModal({ open: false, user: null });
            showMsg(`Password updated for ${passwordModal.user?.name}`);
          }}
        />
      )}

      {/* Company Create/Edit Modal */}
      {companyModal.open && (
        <CompanyModal
          company={companyModal.company}
          plans={plans}
          onClose={() => setCompanyModal({ open: false, company: null })}
          onSaved={() => {
            setCompanyModal({ open: false, company: null });
            loadCompanies();
            loadStats();
            showMsg(companyModal.company ? 'Company updated' : 'Company registered');
          }}
        />
      )}

      {/* Plan Edit Modal */}
      {planModal.open && planModal.plan && (
        <PlanModal
          plan={planModal.plan}
          onClose={() => setPlanModal({ open: false, plan: null })}
          onSaved={() => {
            setPlanModal({ open: false, plan: null });
            loadPlans();
            showMsg(`Plan ${planModal.plan?.name} updated.`);
          }}
        />
      )}

      {/* Company Billing & Payment Modal */}
      {billingModal.open && billingModal.company && (
        <CompanyBillingModal
          company={billingModal.company}
          onClose={() => setBillingModal({ open: false, company: null })}
          onSaved={() => {
            setBillingModal({ open: false, company: null });
            loadCompanies();
            showMsg(`Billing & payment details updated for ${billingModal.company?.name}`);
          }}
        />
      )}
    </div>
  );
}

// User Modal Component
function UserModal({
  user,
  companies,
  plans,
  onClose,
  onSaved,
}: {
  user: AdminUser | null;
  companies: Company[];
  plans: Plan[];
  onClose(): void;
  onSaved(): void;
}) {
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'user'>(user?.role ?? 'user');
  const [status, setStatus] = useState<'active' | 'suspended'>(user?.status ?? 'active');
  const [tenantId, setTenantId] = useState<number | string>(user?.tenantId ?? (companies[0]?.id || ''));
  const [planId, setPlanId] = useState<number>(user?.planId ?? 1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (user) {
        await api(`/admin/users/${user.id}`, 'PATCH', {
          name,
          role,
          status,
          tenantId: tenantId ? Number(tenantId) : null,
          planId,
        });
      } else {
        await api('/admin/users', 'POST', {
          name,
          email,
          password,
          role,
          status,
          tenantId: tenantId ? Number(tenantId) : null,
          planId,
        });
      }
      onSaved();
    } catch (err: any) {
      setError(err instanceof ApiError ? (err.fields.email || err.fields.password || err.message) : err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal" onClick={onClose}>
      <div className="card admin-modal-card" onClick={(e) => e.stopPropagation()}>
        <h2>{user ? `Edit User: ${user.name}` : 'Add New User'}</h2>
        {error && <p className="err">{error}</p>}
        <form onSubmit={submit} className="stack">
          <label className="field">
            <span>Full Name</span>
            <input required value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          {!user && (
            <label className="field">
              <span>Email Address</span>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
          )}
          {!user && (
            <label className="field">
              <span>Password (min 8 characters)</span>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
          )}
          <div className="row-fields">
            <label className="field">
              <span>Role</span>
              <select value={role} onChange={(e) => setRole(e.target.value as any)}>
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <label className="field">
              <span>Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as any)}>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
            </label>
          </div>
          <div className="row-fields">
            <label className="field">
              <span>Assigned Company (Tenant)</span>
              <select value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
                <option value="">No Company (Personal)</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Subscription Plan</span>
              <select value={planId} onChange={(e) => setPlanId(Number(e.target.value))}>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} (${p.price}/mo)</option>
                ))}
              </select>
            </label>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Saving…' : (user ? 'Save Changes' : 'Create User')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Password Reset Modal Component
function PasswordModal({
  user,
  onClose,
  onSaved,
}: {
  user: AdminUser;
  onClose(): void;
  onSaved(): void;
}) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/admin/users/${user.id}/reset-password`, 'POST', { password });
      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal" onClick={onClose}>
      <div className="card admin-modal-card" onClick={(e) => e.stopPropagation()}>
        <h2>Change Password for {user.name}</h2>
        <p className="muted">This directly updates the password and revokes any active sessions for this user.</p>
        {error && <p className="err">{error}</p>}
        <form onSubmit={submit} className="stack">
          <label className="field">
            <span>New Password (min 8 characters)</span>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter new password…"
            />
          </label>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Updating…' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Company Modal Component
function CompanyModal({
  company,
  plans,
  onClose,
  onSaved,
}: {
  company: Company | null;
  plans: Plan[];
  onClose(): void;
  onSaved(): void;
}) {
  const [name, setName] = useState(company?.name ?? '');
  const [slug, setSlug] = useState(company?.slug ?? '');
  const [planId, setPlanId] = useState<number>(company?.planId ?? 2);
  const [maxFlipbooks, setMaxFlipbooks] = useState<number>(company?.maxFlipbooks ?? 25);
  const [maxStorageMb, setMaxStorageMb] = useState<number>(company?.maxStorageMb ?? 1000);
  const [isActive, setIsActive] = useState<boolean>(company ? company.isActive : true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Auto-generate slug from name if creating
  const handleNameChange = (val: string) => {
    setName(val);
    if (!company) {
      setSlug(val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (company) {
        await api(`/admin/companies/${company.id}`, 'PATCH', {
          name,
          slug,
          planId,
          maxFlipbooks,
          maxStorageMb,
          isActive,
        });
      } else {
        await api('/admin/companies', 'POST', {
          name,
          slug,
          planId,
          maxFlipbooks,
          maxStorageMb,
        });
      }
      onSaved();
    } catch (err: any) {
      setError(err instanceof ApiError ? (err.fields.slug || err.fields.name || err.message) : err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal" onClick={onClose}>
      <div className="card admin-modal-card" onClick={(e) => e.stopPropagation()}>
        <h2>{company ? `Edit Company: ${company.name}` : 'Register New Company'}</h2>
        {error && <p className="err">{error}</p>}
        <form onSubmit={submit} className="stack">
          <label className="field">
            <span>Company / Workspace Name</span>
            <input required value={name} onChange={(e) => handleNameChange(e.target.value)} />
          </label>
          <label className="field">
            <span>URL Slug (lowercase letters, numbers, hyphens)</span>
            <input required value={slug} onChange={(e) => setSlug(e.target.value)} />
          </label>
          <div className="row-fields">
            <label className="field">
              <span>Subscription Tier</span>
              <select value={planId} onChange={(e) => setPlanId(Number(e.target.value))}>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} (${p.price}/mo)</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Status</span>
              <select value={isActive ? '1' : '0'} onChange={(e) => setIsActive(e.target.value === '1')}>
                <option value="1">Active</option>
                <option value="0">Disabled</option>
              </select>
            </label>
          </div>
          <div className="row-fields">
            <label className="field">
              <span>Max Flipbooks Quota</span>
              <input type="number" min={1} max={5000} value={maxFlipbooks} onChange={(e) => setMaxFlipbooks(Number(e.target.value))} />
            </label>
            <label className="field">
              <span>Max Storage (MB)</span>
              <input type="number" min={50} max={100000} value={maxStorageMb} onChange={(e) => setMaxStorageMb(Number(e.target.value))} />
            </label>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Saving…' : (company ? 'Save Changes' : 'Create Company')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Plan Modal Component
function PlanModal({
  plan,
  onClose,
  onSaved,
}: {
  plan: Plan;
  onClose(): void;
  onSaved(): void;
}) {
  const [name, setName] = useState(plan.name);
  const [price, setPrice] = useState(plan.price);
  const [maxFlipbooks, setMaxFlipbooks] = useState(plan.maxFlipbooks);
  const [maxPages, setMaxPages] = useState(plan.maxPages);
  const [maxUploadMb, setMaxUploadMb] = useState(plan.maxUploadMb);
  const [monthlyViews, setMonthlyViews] = useState(plan.monthlyViews);
  const [removeBranding, setRemoveBranding] = useState(plan.removeBranding);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/admin/plans/${plan.id}`, 'PATCH', {
        name,
        price,
        maxFlipbooks,
        maxPages,
        maxUploadMb,
        monthlyViews,
        removeBranding,
      });
      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal" onClick={onClose}>
      <div className="card admin-modal-card" onClick={(e) => e.stopPropagation()}>
        <h2>Edit Subscription Plan: {plan.name}</h2>
        {error && <p className="err">{error}</p>}
        <form onSubmit={submit} className="stack">
          <div className="row-fields">
            <label className="field">
              <span>Plan Name</span>
              <input required value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="field">
              <span>Monthly Price ($)</span>
              <input type="number" step="0.01" min={0} value={price} onChange={(e) => setPrice(Number(e.target.value))} />
            </label>
          </div>
          <div className="row-fields">
            <label className="field">
              <span>Max Flipbooks</span>
              <input type="number" min={1} value={maxFlipbooks} onChange={(e) => setMaxFlipbooks(Number(e.target.value))} />
            </label>
            <label className="field">
              <span>Max Pages / PDF</span>
              <input type="number" min={1} value={maxPages} onChange={(e) => setMaxPages(Number(e.target.value))} />
            </label>
          </div>
          <div className="row-fields">
            <label className="field">
              <span>Max Upload (MB)</span>
              <input type="number" min={5} value={maxUploadMb} onChange={(e) => setMaxUploadMb(Number(e.target.value))} />
            </label>
            <label className="field">
              <span>Monthly Views Limit</span>
              <input type="number" min={100} value={monthlyViews} onChange={(e) => setMonthlyViews(Number(e.target.value))} />
            </label>
          </div>
          <label className="field" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={removeBranding}
              onChange={(e) => setRemoveBranding(e.target.checked)}
              style={{ width: '18px', height: '18px' }}
            />
            <span>Allow White-Label (Remove platform branding)</span>
          </label>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save Plan Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Company Billing Modal Component (Admin)
function CompanyBillingModal({
  company,
  onClose,
  onSaved,
}: {
  company: Company;
  onClose(): void;
  onSaved(): void;
}) {
  const [billingName, setBillingName] = useState(company.billingName || company.name);
  const [billingEmail, setBillingEmail] = useState(company.billingEmail || '');
  const [billingAddress, setBillingAddress] = useState(company.billingAddress || '');
  const [taxId, setTaxId] = useState(company.taxId || '');
  const [paymentMethod, setPaymentMethod] = useState(company.paymentMethod || 'bank_transfer');
  const [paymentStatus, setPaymentStatus] = useState(company.paymentStatus || 'paid');
  const [billingCycle, setBillingCycle] = useState(company.billingCycle || 'monthly');
  const [amount, setAmount] = useState(company.amount !== undefined ? company.amount : company.planPrice);
  const [currency, setCurrency] = useState(company.currency || 'FJD');
  const [lastPaymentDate, setLastPaymentDate] = useState(company.lastPaymentDate || '');
  const [nextBillingDate, setNextBillingDate] = useState(company.nextBillingDate || '');
  const [paymentReference, setPaymentReference] = useState(company.paymentReference || '');
  const [billingNotes, setBillingNotes] = useState(company.billingNotes || '');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/admin/companies/${company.id}/billing`, 'PUT', {
        billingName,
        billingEmail,
        billingAddress,
        taxId,
        paymentMethod,
        paymentStatus,
        billingCycle,
        amount: Number(amount),
        currency: currency.toUpperCase(),
        lastPaymentDate: lastPaymentDate || null,
        nextBillingDate: nextBillingDate || null,
        paymentReference,
        billingNotes,
      });
      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal" onClick={onClose}>
      <div className="card admin-modal-card" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <div>
            <span className="badge badge-golden">TENANT BILLING</span>
            <h2 style={{ margin: '4px 0 0 0' }}>Payment Details: {company.name}</h2>
          </div>
          <span className="font-mono text-amber-400">/{company.slug}</span>
        </div>
        <p className="muted" style={{ fontSize: '13px', margin: '0 0 16px 0' }}>
          Manage corporate billing records, payment reconciliation, and subscription status for this tenant.
        </p>
        {error && <p className="err">{error}</p>}
        <form onSubmit={submit} className="stack">
          <div className="row-fields">
            <label className="field">
              <span>Billing Entity / Company Legal Name</span>
              <input value={billingName} onChange={(e) => setBillingName(e.target.value)} required />
            </label>
            <label className="field">
              <span>Billing Email (Accounts / Invoicing)</span>
              <input type="email" value={billingEmail} onChange={(e) => setBillingEmail(e.target.value)} placeholder="accounts@company.com" />
            </label>
          </div>

          <div className="row-fields">
            <label className="field">
              <span>Payment Status</span>
              <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as any)}>
                <option value="paid">PAID (Active)</option>
                <option value="pending">PENDING (Awaiting settlement)</option>
                <option value="overdue">OVERDUE (Payment delinquent)</option>
                <option value="trial">TRIAL (Free evaluation)</option>
                <option value="exempt">EXEMPT (Internal / Partner)</option>
              </select>
            </label>
            <label className="field">
              <span>Payment Method</span>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="bank_transfer">Direct Bank Transfer / Wire</option>
                <option value="credit_card">Credit / Debit Card</option>
                <option value="direct_debit">Direct Debit (BSP / ANZ / Westpac)</option>
                <option value="cheque">Cheque</option>
                <option value="cash">Cash / Remittance</option>
              </select>
            </label>
          </div>

          <div className="row-fields">
            <label className="field">
              <span>Billing Cycle</span>
              <select value={billingCycle} onChange={(e) => setBillingCycle(e.target.value as any)}>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annually">Annually</option>
              </select>
            </label>
            <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
              <label className="field" style={{ flex: 2 }}>
                <span>Amount ($)</span>
                <input type="number" step="0.01" min={0} value={amount} onChange={(e) => setAmount(Number(e.target.value))} required />
              </label>
              <label className="field" style={{ flex: 1 }}>
                <span>Currency</span>
                <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  <option value="FJD">FJD</option>
                  <option value="USD">USD</option>
                  <option value="AUD">AUD</option>
                  <option value="NZD">NZD</option>
                  <option value="EUR">EUR</option>
                </select>
              </label>
            </div>
          </div>

          <div className="row-fields">
            <label className="field">
              <span>Tax / TIN / VAT Registration #</span>
              <input value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="e.g. FJ-TIN-8938210" />
            </label>
            <label className="field">
              <span>Invoice / Payment Reference</span>
              <input value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} placeholder="e.g. INV-2026-001-NUV" />
            </label>
          </div>

          <div className="row-fields">
            <label className="field">
              <span>Last Payment Date</span>
              <input type="date" value={lastPaymentDate} onChange={(e) => setLastPaymentDate(e.target.value)} />
            </label>
            <label className="field">
              <span>Next Renewal / Due Date</span>
              <input type="date" value={nextBillingDate} onChange={(e) => setNextBillingDate(e.target.value)} />
            </label>
          </div>

          <label className="field">
            <span>Billing Address</span>
            <input value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} placeholder="e.g. Level 2, Civic House, Suva, Fiji Islands" />
          </label>

          <label className="field">
            <span>Billing Notes & Audit Trail</span>
            <textarea
              rows={2}
              value={billingNotes}
              onChange={(e) => setBillingNotes(e.target.value)}
              placeholder="Internal accounts notes, bank reference or special billing terms..."
            />
          </label>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save Billing Details'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
