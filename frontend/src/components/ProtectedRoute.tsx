import { useEffect, useState } from 'react';
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import ChangePasswordModal from './ChangePasswordModal';

interface QuickJobItem {
  id: number;
  flipbookId: number | null;
  flipbookTitle: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  currentStep: string;
  createdAt: string;
}

interface DynamicBluePreset {
  id: string;
  name: string;
  brand: string;
  brandStrong: string;
  brandHover: string;
  brandSoft: string;
  brandBorder: string;
}

const DYNAMIC_BLUE_PRESETS: DynamicBluePreset[] = [
  {
    id: 'ocean',
    name: 'Dynamic Ocean Blue',
    brand: '#0284c7',
    brandStrong: '#0369a1',
    brandHover: '#075985',
    brandSoft: 'rgba(2, 132, 199, 0.12)',
    brandBorder: 'rgba(56, 189, 248, 0.4)',
  },
  {
    id: 'electric',
    name: 'Electric Azure Blue',
    brand: '#2563eb',
    brandStrong: '#1d4ed8',
    brandHover: '#1e40af',
    brandSoft: 'rgba(37, 99, 235, 0.12)',
    brandBorder: 'rgba(96, 165, 250, 0.42)',
  },
  {
    id: 'sky',
    name: 'Sky Cyan Dynamic',
    brand: '#0ea5e9',
    brandStrong: '#0284c7',
    brandHover: '#0369a1',
    brandSoft: 'rgba(14, 165, 233, 0.14)',
    brandBorder: 'rgba(56, 189, 248, 0.45)',
  },
  {
    id: 'cobalt',
    name: 'Royal Cobalt Blue',
    brand: '#1d4ed8',
    brandStrong: '#1e40af',
    brandHover: '#1e3a8a',
    brandSoft: 'rgba(29, 78, 216, 0.12)',
    brandBorder: 'rgba(96, 165, 250, 0.4)',
  },
];

const UPCOMING_MODULES = [
  {
    id: 'shop',
    name: 'Shop & E-Commerce Cart',
    category: 'Commerce',
    status: 'Ready to Enable',
    desc: 'Add interactive product tags, pricing popovers, and direct checkout cart inside flipbooks.',
  },
  {
    id: 'leadgen',
    name: 'Lead Capture & Gate Forms',
    category: 'Marketing',
    status: 'Ready to Enable',
    desc: 'Collect reader emails after N pages with customizable gated forms and webhook sync.',
  },
  {
    id: 'audio',
    name: 'AI Voice & Audio Narration',
    category: 'Accessibility',
    status: 'Modular Slot',
    desc: 'Auto-generate page-by-page spoken narration tracks for hands-free magazine listening.',
  },
  {
    id: 'crm',
    name: 'CRM & HubSpot / Salesforce Sync',
    category: 'Integrations',
    status: 'Modular Slot',
    desc: 'Push reader dwell heatmaps and UTM campaign attribution directly to your CRM.',
  },
  {
    id: 'media-hub',
    name: 'Shared Media & Asset Library',
    category: 'Content',
    status: 'Active Slot',
    desc: 'Centralized workspace repository for reusable video overlays, brand logos, and enrichment icons.',
  },
];

export function ProtectedRoute() {
  const { user, loading, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Dark Mode state persisted in localStorage
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('flipex_theme_mode') === 'dark';
    } catch {
      return false;
    }
  });

  // Dynamic Blue preset state persisted in localStorage
  const [bluePresetId, setBluePresetId] = useState<string>(() => {
    try {
      return localStorage.getItem('flipex_blue_preset') || 'ocean';
    } catch {
      return 'ocean';
    }
  });

  // Sidebar expanded vs compact rail (Pic 2 style is compact vertical icon+label rail by default)
  const [sidebarExpanded, setSidebarExpanded] = useState<boolean>(false);

  // Header right utility popovers (Pic 1's 4 segmented icon buttons)
  const [activePopover, setActivePopover] = useState<'appearance' | 'notifications' | 'drawer' | 'profile' | null>(null);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState<boolean>(false);

  // Extensible Modules / Media modal state
  const [activeModuleHub, setActiveModuleHub] = useState<'modules' | 'media' | null>(null);
  const [enabledModules, setEnabledModules] = useState<Record<string, boolean>>({
    shop: true,
    leadgen: true,
    'media-hub': true,
  });

  // Recent notifications / jobs for Bell & Drawer + Dynamic Registered Tenant Info
  const [recentJobs, setRecentJobs] = useState<QuickJobItem[]>([]);
  const [firstBookId, setFirstBookId] = useState<number | null>(null);
  const [tenantName, setTenantName] = useState<string | null>(user?.companyName || null);
  const [tenantPlan, setTenantPlan] = useState<string | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.setAttribute('data-theme', 'dark');
      root.classList.add('dark');
    } else {
      root.setAttribute('data-theme', 'light');
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('flipex_theme_mode', darkMode ? 'dark' : 'light');
    } catch {
      // ignore
    }
  }, [darkMode]);

  useEffect(() => {
    const preset = DYNAMIC_BLUE_PRESETS.find((p) => p.id === bluePresetId) || DYNAMIC_BLUE_PRESETS[0];
    const root = document.documentElement;
    root.style.setProperty('--brand', preset.brand);
    root.style.setProperty('--brand-strong', preset.brandStrong);
    root.style.setProperty('--brand-hover', preset.brandHover);
    root.style.setProperty('--brand-soft', preset.brandSoft);
    root.style.setProperty('--brand-border', preset.brandBorder);
    try {
      localStorage.setItem('flipex_blue_preset', preset.id);
    } catch {
      // ignore
    }
  }, [bluePresetId]);

  useEffect(() => {
    if (!user) return;
    api<{ companyName?: string | null; plan?: { name?: string } | null }>('/me')
      .then((me) => {
        if (me?.companyName) setTenantName(me.companyName);
        if (me?.plan?.name) setTenantPlan(me.plan.name);
      })
      .catch(() => {});
    api<QuickJobItem[]>('/jobs')
      .then((list) => setRecentJobs(Array.isArray(list) ? list.slice(0, 8) : []))
      .catch(() => {});
    api<Array<{ id: number }>>('/flipbooks')
      .then((books) => {
        if (Array.isArray(books) && books.length > 0) {
          setFirstBookId(books[0].id);
        }
      })
      .catch(() => {});
  }, [user, location.pathname]);

  // Close popovers on route change
  useEffect(() => {
    setActivePopover(null);
  }, [location.pathname]);

  if (loading) return <p className="center">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;

  const isDashboard = location.pathname === '/dashboard';
  const isFlipbooks =
    location.pathname.startsWith('/flipbooks') ||
    location.pathname.startsWith('/dashboard/preview') ||
    location.pathname.startsWith('/dashboard/editor');
  const isAnalytics = location.pathname.startsWith('/dashboard/analytics');
  const isIntegrations = location.pathname.startsWith('/integrations');
  const isBilling = location.pathname.startsWith('/billing');
  const isDevOps = location.pathname.startsWith('/devops');
  const isSettings = location.pathname.startsWith('/settings');
  const isAdmin = location.pathname.startsWith('/admin');

  const registeredTenantDisplay =
    tenantName ||
    user.companyName ||
    (user.role === 'admin' ? 'Nuvis Enterprise Workspace' : `${user.name} Workspace`);

  const unreadNotifications = recentJobs.filter((j) => j.status === 'running' || j.status === 'failed').length;

  const togglePopover = (name: 'appearance' | 'notifications' | 'drawer' | 'profile') => {
    setActivePopover((prev) => (prev === name ? null : name));
  };

  return (
    <div className={`app-shell ${sidebarExpanded ? 'sidebar-expanded' : 'sidebar-rail'}`}>
      {/* LEFT VERTICAL SIDE NAVIGATION RAIL (Pic 2 Style + Extensible Modules) */}
      <aside className="app-sidebar" aria-label="Primary Module Navigation">
        <div className="sidebar-brand">
          <Link to="/dashboard" className="sidebar-brand-link" title="Nuvis Flipex Home">
            <img src="/logo.png" alt="Nuvis Flipex" className="sidebar-logo-img" />
            <span className="sidebar-brand-title">Flipex</span>
          </Link>
        </div>

        <nav className="sidebar-nav">
          {/* 1. Dashboard Overview */}
          <Link
            to="/dashboard"
            className={`sidebar-item ${isDashboard && !activeModuleHub ? 'active' : ''}`}
            onClick={() => setActiveModuleHub(null)}
            title="Executive Dashboard Overview"
          >
            <svg viewBox="0 0 24 24" className="sidebar-icon" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="3" width="18" height="18" rx="2.5" />
              <path d="M3 9h18M9 21V9" />
            </svg>
            <span className="sidebar-label">Dashboard</span>
          </Link>

          {/* 2. Flipbooks Library & Manager */}
          <Link
            to="/flipbooks"
            className={`sidebar-item ${isFlipbooks && !activeModuleHub ? 'active' : ''}`}
            onClick={() => setActiveModuleHub(null)}
            title="Flipbooks Library & Publishing Lifecycle"
          >
            <svg viewBox="0 0 24 24" className="sidebar-icon" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              <path d="M12 2v20" />
            </svg>
            <span className="sidebar-label">Flipbooks</span>
          </Link>

          {/* 3. Extensible Modules Slot (For adding new modules later) */}
          <button
            type="button"
            className={`sidebar-item ${activeModuleHub === 'modules' ? 'active' : ''}`}
            onClick={() => setActiveModuleHub((prev) => (prev === 'modules' ? null : 'modules'))}
            title="Add-On Modules & Integrations Hub"
          >
            <svg viewBox="0 0 24 24" className="sidebar-icon" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" />
              <path d="M14 17.5h7M17.5 14v7" />
            </svg>
            <span className="sidebar-label">Modules</span>
          </button>

          {/* 4. Media Library Slot */}
          <button
            type="button"
            className={`sidebar-item ${activeModuleHub === 'media' ? 'active' : ''}`}
            onClick={() => setActiveModuleHub((prev) => (prev === 'media' ? null : 'media'))}
            title="Media & Enrichment Assets"
          >
            <svg viewBox="0 0 24 24" className="sidebar-icon" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <circle cx="8.5" cy="9.5" r="1.5" />
              <path d="m21 15-5-5L5 20" />
            </svg>
            <span className="sidebar-label">Media</span>
          </button>

          {/* 5. Displays / Commercial Statistics */}
          <button
            type="button"
            className={`sidebar-item ${isAnalytics && !activeModuleHub ? 'active' : ''}`}
            onClick={() => {
              setActiveModuleHub(null);
              if (firstBookId) {
                navigate(`/dashboard/analytics/${firstBookId}`);
              } else {
                navigate('/dashboard');
              }
            }}
            title="Displays, Heatmaps & Commercial Analytics"
          >
            <svg viewBox="0 0 24 24" className="sidebar-icon" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M9 15h6" />
            </svg>
            <span className="sidebar-label">Displays</span>
          </button>

          {/* 6. Enterprise Integrations Hub */}
          <Link
            to="/integrations"
            className={`sidebar-item ${isIntegrations && !activeModuleHub ? 'active' : ''}`}
            onClick={() => setActiveModuleHub(null)}
            title="Enterprise Integrations (REST API, ERP, Webhooks, SSO, LDAP, WordPress, CRM)"
          >
            <svg viewBox="0 0 24 24" className="sidebar-icon" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            <span className="sidebar-label">Integrations</span>
          </Link>

          {/* 7. Commercial Billing & Subscriptions */}
          <Link
            to="/billing"
            className={`sidebar-item ${isBilling && !activeModuleHub ? 'active' : ''}`}
            onClick={() => setActiveModuleHub(null)}
            title="Billing, Tax Invoices, Metering & Fiji Bank Reconciliation"
          >
            <svg viewBox="0 0 24 24" className="sidebar-icon" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <line x1="2" y1="10" x2="22" y2="10" />
            </svg>
            <span className="sidebar-label">Billing</span>
          </Link>

          {/* 8. Modular Architecture & DevOps Production Readiness */}
          <Link
            to="/devops"
            className={`sidebar-item ${isDevOps && !activeModuleHub ? 'active' : ''}`}
            onClick={() => setActiveModuleHub(null)}
            title="Modular Architecture, CPU/Memory/Storage Telemetry, DLQ, JSONL Logs & Backups"
          >
            <svg viewBox="0 0 24 24" className="sidebar-icon" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="2" y="3" width="20" height="6" rx="1.5" />
              <rect x="2" y="15" width="20" height="6" rx="1.5" />
              <circle cx="6" cy="6" r="1" />
              <circle cx="6" cy="18" r="1" />
            </svg>
            <span className="sidebar-label">DevOps</span>
          </Link>

          {/* 9. Admin Console (if admin) */}
          {user.role === 'admin' && (
            <Link
              to="/admin"
              className={`sidebar-item ${isAdmin ? 'active' : ''}`}
              onClick={() => setActiveModuleHub(null)}
              title="Super Admin Console"
            >
              <svg viewBox="0 0 24 24" className="sidebar-icon" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span className="sidebar-label">Admin</span>
            </Link>
          )}
        </nav>

        <div className="sidebar-footer">
          <Link
            to="/settings"
            className={`sidebar-item ${isSettings ? 'active' : ''}`}
            onClick={() => setActiveModuleHub(null)}
            title="Account & Security Settings"
          >
            <svg viewBox="0 0 24 24" className="sidebar-icon" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span className="sidebar-label">Settings</span>
          </Link>
        </div>
      </aside>

      {/* MAIN CONTENT COLUMN */}
      <div className="app-body">
        {/* TOP HORIZONTAL HEADER BAR (Nuvis Flipex + Dynamic Tenant Provision on Left, Segmented Icons on Right) */}
        <header className="app-topbar">
          {/* Left: Nuvis Flipex Brand + Dynamic Registered Tenant Name */}
          <div className="topbar-left">
            <Link to="/dashboard" className="topbar-brand-identity" onClick={() => setActiveModuleHub(null)}>
              <span className="nuvis-brand-text topbar-nuvis-text">Nuvis Flipex</span>
            </Link>

            <span className="topbar-brand-divider" aria-hidden="true" />

            <div className="topbar-tenant-provision" title="Registered Tenant Organization">
              <span className="tenant-building-icon">🏢</span>
              <span className="tenant-registered-name">{registeredTenantDisplay}</span>
              <span className="tenant-plan-chip">
                {tenantPlan || (user.role === 'admin' ? 'Enterprise Admin' : (user.tenantRole || 'Active Tenant'))}
              </span>
            </div>
          </div>

          {/* Right: Action Buttons + Pic 1 Segmented 4-Cell Utility Bar */}
          <div className="topbar-right">
            <div className="topbar-quick-actions">
              {firstBookId && (
                <>
                  <Link to={`/dashboard/editor/${firstBookId}`} className="topbar-action-btn outline">
                    Edit enrichments
                  </Link>
                  <Link to={`/dashboard/preview/${firstBookId}`} className="topbar-action-btn solid">
                    View flipbook
                  </Link>
                </>
              )}
            </div>

            {/* PIC 1 SEGMENTED ICON CELL BAR */}
            <div className="topbar-icon-cells">
              {/* CELL 1: Starburst 'A' Icon — Dark Mode & Dynamic Blue Accent Switcher */}
              <div className="topbar-cell-wrap">
                <button
                  type="button"
                  className={`topbar-icon-cell ${activePopover === 'appearance' ? 'active' : ''}`}
                  onClick={() => togglePopover('appearance')}
                  title="Appearance: Dark Mode & Dynamic Blue Accent"
                  aria-label="Appearance and Dark Mode settings"
                >
                  <svg viewBox="0 0 24 24" className="cell-svg" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <polygon
                      points="12 2 14.4 5.6 18.7 4.7 18.4 9 22 12 18.4 15 18.7 19.3 14.4 18.4 12 22 9.6 18.4 5.3 19.3 5.6 15 2 12 5.6 9 5.3 4.7 9.6 5.6"
                      strokeLinejoin="round"
                    />
                    <path d="M9.7 15L12 8.5L14.3 15" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M10.4 13.3h3.2" strokeLinecap="round" />
                  </svg>
                  {darkMode && <span className="cell-mode-dot" title="Dark Mode Active" />}
                </button>

                {activePopover === 'appearance' && (
                  <div className="topbar-dropdown appearance-dropdown">
                    <div className="dropdown-head">
                      <b>Appearance & Theme</b>
                      <span className="dropdown-sub">Dynamic Blue & Dark Mode</span>
                    </div>

                    {/* Dark Mode Toggle Row */}
                    <div className="appearance-mode-toggle">
                      <button
                        type="button"
                        className={`mode-pill ${!darkMode ? 'active' : ''}`}
                        onClick={() => setDarkMode(false)}
                      >
                        ☀️ Light Mode
                      </button>
                      <button
                        type="button"
                        className={`mode-pill ${darkMode ? 'active' : ''}`}
                        onClick={() => setDarkMode(true)}
                      >
                        🌙 Dark Mode
                      </button>
                    </div>

                    <div className="dropdown-divider" />

                    <div className="appearance-preset-list">
                      <span className="preset-heading">Dynamic Blue Accent</span>
                      {DYNAMIC_BLUE_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          className={`preset-option ${bluePresetId === preset.id ? 'active' : ''}`}
                          onClick={() => setBluePresetId(preset.id)}
                        >
                          <span className="preset-swatch" style={{ background: preset.brand }} />
                          <span className="preset-name">{preset.name}</span>
                          {bluePresetId === preset.id && <span className="preset-check">✓</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* CELL 2: Notification Bell Icon */}
              <div className="topbar-cell-wrap">
                <button
                  type="button"
                  className={`topbar-icon-cell ${activePopover === 'notifications' ? 'active' : ''}`}
                  onClick={() => togglePopover('notifications')}
                  title="Notifications & Conversion Telemetry"
                  aria-label="Notifications"
                >
                  <svg viewBox="0 0 24 24" className="cell-svg" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {unreadNotifications > 0 && (
                    <span className="cell-badge-dot">{unreadNotifications}</span>
                  )}
                </button>

                {activePopover === 'notifications' && (
                  <div className="topbar-dropdown notifications-dropdown">
                    <div className="dropdown-head">
                      <b>Activity & Notifications</b>
                      <span className="dropdown-sub">Document Processing & Lifecycle</span>
                    </div>
                    <div className="dropdown-list">
                      {recentJobs.length === 0 ? (
                        <p className="dropdown-empty">No recent conversion jobs or alerts.</p>
                      ) : (
                        recentJobs.slice(0, 5).map((j) => (
                          <div key={j.id} className="notif-item">
                            <div className="notif-title-row">
                              <b className="notif-title">{j.flipbookTitle || `Job #${j.id}`}</b>
                              <span className={`notif-status status-${j.status}`}>{j.status}</span>
                            </div>
                            <p className="notif-step">{j.currentStep || `${j.progress}% complete`}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* CELL 3: Side-Panel / Drawer Icon [||| (Pic 1 third icon) */}
              <div className="topbar-cell-wrap">
                <button
                  type="button"
                  className={`topbar-icon-cell ${activePopover === 'drawer' || sidebarExpanded ? 'active' : ''}`}
                  onClick={() => togglePopover('drawer')}
                  title="Workspace Rail & Module Drawer"
                  aria-label="Workspace Drawer"
                >
                  <svg viewBox="0 0 24 24" className="cell-svg" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M14 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8" strokeLinecap="round" strokeLinejoin="round" />
                    <line x1="11" y1="8" x2="11" y2="16" strokeLinecap="round" />
                    <line x1="15" y1="8" x2="15" y2="16" strokeLinecap="round" />
                    <line x1="19" y1="8" x2="19" y2="16" strokeLinecap="round" />
                  </svg>
                </button>

                {activePopover === 'drawer' && (
                  <div className="topbar-dropdown drawer-dropdown">
                    <div className="dropdown-head">
                      <b>Workspace Layout & Modules</b>
                      <span className="dropdown-sub">Customize side navigation & drawers</span>
                    </div>
                    <div className="drawer-options">
                      <button
                        type="button"
                        className="drawer-action-row"
                        onClick={() => {
                          setSidebarExpanded((prev) => !prev);
                          setActivePopover(null);
                        }}
                      >
                        <span>{sidebarExpanded ? '⬅️ Compact Side Rail' : '➡️ Expand Side Navigation'}</span>
                      </button>
                      <button
                        type="button"
                        className="drawer-action-row"
                        onClick={() => {
                          setActiveModuleHub('modules');
                          setActivePopover(null);
                        }}
                      >
                        <span>🧩 Open Extensible Modules Hub</span>
                      </button>
                      <button
                        type="button"
                        className="drawer-action-row"
                        onClick={() => {
                          setActiveModuleHub('media');
                          setActivePopover(null);
                        }}
                      >
                        <span>🖼️ Open Shared Media Library</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* CELL 4: User Profile + Lines Icon (Pic 1 fourth icon) */}
              <div className="topbar-cell-wrap">
                <button
                  type="button"
                  className={`topbar-icon-cell ${activePopover === 'profile' ? 'active' : ''}`}
                  onClick={() => togglePopover('profile')}
                  title={`Account: ${user.name} (${user.email})`}
                  aria-label="Account Menu"
                >
                  <svg viewBox="0 0 24 24" className="cell-svg" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <circle cx="9" cy="8" r="3.5" />
                    <path d="M3.5 19.5c0-3.1 2.5-5.5 5.5-5.5s5.5 2.4 5.5 5.5" strokeLinecap="round" />
                    <line x1="15.5" y1="6.5" x2="21" y2="6.5" strokeLinecap="round" />
                    <line x1="15.5" y1="10" x2="21" y2="10" strokeLinecap="round" />
                    <line x1="15.5" y1="13.5" x2="19" y2="13.5" strokeLinecap="round" />
                  </svg>
                </button>

                {activePopover === 'profile' && (
                  <div className="topbar-dropdown profile-dropdown">
                    <div className="dropdown-head">
                      <b>{user.name}</b>
                      <span className="dropdown-sub">{user.email}</span>
                      <span className="profile-role-pill">{user.role.toUpperCase()}</span>
                    </div>
                    <div className="dropdown-divider" />
                    <div className="profile-links">
                      <Link to="/flipbooks" className="profile-menu-item">
                        📚 My Publications
                      </Link>
                      <Link to="/integrations" className="profile-menu-item">
                        🔌 Enterprise Integrations & API
                      </Link>
                      <Link to="/billing" className="profile-menu-item">
                        💳 Billing, Invoices & Subscriptions
                      </Link>
                      <Link to="/devops" className="profile-menu-item">
                        🏗️ Modular Architecture & DevOps
                      </Link>
                      <Link to="/settings" className="profile-menu-item">
                        ⚙️ Account & Security (2FA / API)
                      </Link>
                      <button
                        type="button"
                        className="profile-menu-item"
                        onClick={() => {
                          setActivePopover(null);
                          setShowChangePasswordModal(true);
                        }}
                      >
                        🔑 Change Password
                      </button>
                      {user.role === 'admin' && (
                        <Link to="/admin" className="profile-menu-item">
                          🛡️ Super Admin Console
                        </Link>
                      )}
                      <button
                        type="button"
                        className="profile-menu-item"
                        onClick={() => setDarkMode((d) => !d)}
                      >
                        {darkMode ? '☀️ Switch to Light Mode' : '🌙 Switch to Dark Mode'}
                      </button>
                      <div className="dropdown-divider" />
                      <button type="button" className="profile-menu-item danger" onClick={logout}>
                        🚪 Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* EXTENSIBLE MODULES HUB / MEDIA LIBRARY DRAWER (When clicked in Left Side Nav) */}
        {activeModuleHub && (
          <div className="module-hub-banner">
            <div className="module-hub-header">
              <div>
                <h2 className="module-hub-title">
                  {activeModuleHub === 'modules'
                    ? '🧩 Modular Platform Extensions & Add-Ons'
                    : '🖼️ Workspace Media & Enrichment Assets'}
                </h2>
                <p className="module-hub-sub">
                  {activeModuleHub === 'modules'
                    ? 'Enable or plug in additional enterprise modules into your Nuvis Flipex workspace.'
                    : 'Manage reusable rich-media overlays, brand watermarks, MP4 clips, and audio files across flipbooks.'}
                </p>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setActiveModuleHub(null)}
              >
                Close Panel ✕
              </button>
            </div>

            {activeModuleHub === 'modules' ? (
              <div className="module-hub-grid">
                {UPCOMING_MODULES.map((mod) => {
                  const isOn = !!enabledModules[mod.id];
                  return (
                    <div key={mod.id} className={`module-card ${isOn ? 'enabled' : ''}`}>
                      <div className="module-card-top">
                        <span className="module-cat-badge">{mod.category}</span>
                        <span className={`module-status-pill ${isOn ? 'on' : ''}`}>
                          {isOn ? 'Enabled' : mod.status}
                        </span>
                      </div>
                      <h4 className="module-card-name">{mod.name}</h4>
                      <p className="module-card-desc">{mod.desc}</p>
                      <button
                        type="button"
                        className={isOn ? 'btn-secondary' : 'btn-primary'}
                        style={{ marginTop: 'auto', width: '100%' }}
                        onClick={() =>
                          setEnabledModules((prev) => ({ ...prev, [mod.id]: !prev[mod.id] }))
                        }
                      >
                        {isOn ? '✓ Active in Workspace' : '+ Enable Module'}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="module-hub-grid">
                <div className="module-card enabled">
                  <div className="module-card-top">
                    <span className="module-cat-badge">Brand Identity</span>
                    <span className="module-status-pill on">Active</span>
                  </div>
                  <h4 className="module-card-name">Nuvis Flipex Brand Logo</h4>
                  <p className="module-card-desc">
                    Default workspace watermark and top-bar reader emblem (`/logo.png`).
                  </p>
                </div>
                <div className="module-card enabled">
                  <div className="module-card-top">
                    <span className="module-cat-badge">Interactive Hotspots</span>
                    <span className="module-status-pill on">Ready</span>
                  </div>
                  <h4 className="module-card-name">Video & External Link Enrichments</h4>
                  <p className="module-card-desc">
                    Use the Hotspot Editor on any publication to place interactive Dynamic Blue callouts and embedded videos.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* PAGE CONTENT */}
        <main className="container app-main">
          <Outlet />
        </main>

        {/* CHANGE PASSWORD MODAL (Triggered from Top-Right Profile Menu) */}
        {showChangePasswordModal && (
          <ChangePasswordModal onClose={() => setShowChangePasswordModal(false)} />
        )}
      </div>
    </div>
  );
}
