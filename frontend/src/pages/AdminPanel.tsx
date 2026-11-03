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

export default function AdminPanel() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'overview' | 'users' | 'companies' | 'subscriptions'>('overview');

  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [userQuery, setUserQuery] = useState('');
  const [companyQuery, setCompanyQuery] = useState('');

  // Modals state
  const [userModal, setUserModal] = useState<{ open: boolean; user: AdminUser | null }>({ open: false, user: null });
  const [passwordModal, setPasswordModal] = useState<{ open: boolean; user: AdminUser | null }>({ open: false, user: null });
  const [companyModal, setCompanyModal] = useState<{ open: boolean; company: Company | null }>({ open: false, company: null });
  const [planModal, setPlanModal] = useState<{ open: boolean; plan: Plan | null }>({ open: false, plan: null });

  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showMsg = (text: string, type: 'success' | 'error' = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 4000);
  };

  const loadStats = useCallback(() => api<Stats>('/admin/stats').then(setStats), []);
  const loadUsers = useCallback(() => api<AdminUser[]>(`/admin/users?q=${encodeURIComponent(userQuery)}`).then(setUsers), [userQuery]);
  const loadCompanies = useCallback(() => api<Company[]>(`/admin/companies?q=${encodeURIComponent(companyQuery)}`).then(setCompanies), [companyQuery]);
  const loadPlans = useCallback(() => api<Plan[]>('/admin/plans').then(setPlans), []);

  const refreshAll = useCallback(() => {
    setLoading(true);
    Promise.all([loadStats(), loadUsers(), loadCompanies(), loadPlans()])
      .finally(() => setLoading(false));
  }, [loadStats, loadUsers, loadCompanies, loadPlans]);

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
            Manage users, corporate tenants, subscription plans, quotas, and customer isolation.
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
                  onClick={() => setTab('subscriptions')}
                >
                  <span className="action-icon">💳</span>
                  <div>
                    <b>Review Subscription Plans</b>
                    <p className="muted">Configure pricing, limits, and quotas</p>
                  </div>
                </button>
              </div>
            </div>

            <div className="admin-card">
              <div className="card-header-row">
                <h3>System Architecture & Isolation</h3>
              </div>
              <div className="system-info-list">
                <div className="sys-info-row">
                  <span>Customer Isolation:</span>
                  <span className="badge badge-success">Active (Multi-Tenant RLS)</span>
                </div>
                <div className="sys-info-row">
                  <span>Storage Sandboxing:</span>
                  <span className="badge badge-success">/storage/tenants/{'{id}'}/</span>
                </div>
                <div className="sys-info-row">
                  <span>Password Security:</span>
                  <span className="badge badge-info">Argon2id (PHP 8.3)</span>
                </div>
                <div className="sys-info-row">
                  <span>Token Rotation:</span>
                  <span className="badge badge-info">Dual JWT + HttpOnly Cookies</span>
                </div>
                <div className="sys-info-row">
                  <span>Poppler Converter:</span>
                  <span className="badge badge-success">Background Daemon Active</span>
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
                    <td colSpan={8} className="center muted" style={{ padding: '32px' }}>
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
