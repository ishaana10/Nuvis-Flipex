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

interface ButtonGradientPreset {
  id: string;
  name: string;
  stop1: string;
  stop2: string;
  stop3: string;
  angle: number;
  textColor?: 'auto' | 'light' | 'dark';
}

const BUTTON_GRADIENT_PRESETS: ButtonGradientPreset[] = [
  {
    id: 'golden_sunset',
    name: 'Golden Amber Sunset',
    stop1: '#fde047',
    stop2: '#f59e0b',
    stop3: '#b45309',
    angle: 135,
    textColor: 'dark',
  },
  {
    id: 'emerald_forest',
    name: 'Emerald Tropical Mint',
    stop1: '#34d399',
    stop2: '#10b981',
    stop3: '#047857',
    angle: 135,
    textColor: 'light',
  },
  {
    id: 'crimson_flame',
    name: 'Crimson Coral Flame',
    stop1: '#fb7185',
    stop2: '#e11d48',
    stop3: '#9f1239',
    angle: 135,
    textColor: 'light',
  },
  {
    id: 'tangerine_blaze',
    name: 'Tangerine Copper Blaze',
    stop1: '#fbbf24',
    stop2: '#f97316',
    stop3: '#c2410c',
    angle: 135,
    textColor: 'light',
  },
  {
    id: 'teal_lagoon',
    name: 'Teal Lagoon Jade',
    stop1: '#2dd4bf',
    stop2: '#0d9488',
    stop3: '#115e59',
    angle: 135,
    textColor: 'light',
  },
  {
    id: 'ocean',
    name: 'Pacific Ocean Cyan',
    stop1: '#38bdf8',
    stop2: '#0284c7',
    stop3: '#0369a1',
    angle: 135,
    textColor: 'light',
  },
  {
    id: 'cobalt',
    name: 'Royal Cobalt Sapphire',
    stop1: '#60a5fa',
    stop2: '#2563eb',
    stop3: '#1e3a8a',
    angle: 135,
    textColor: 'light',
  },
  {
    id: 'obsidian_gold',
    name: 'Obsidian Champagne Gold',
    stop1: '#f59e0b',
    stop2: '#334155',
    stop3: '#0f172a',
    angle: 135,
    textColor: 'light',
  },
];

function hexToRgbTuple(hex: string): [number, number, number] {
  const clean = (hex || '').replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16) || 0;
    const g = parseInt(clean[1] + clean[1], 16) || 0;
    const b = parseInt(clean[2] + clean[2], 16) || 0;
    return [r, g, b];
  }
  const num = parseInt(clean.padEnd(6, '0').slice(0, 6), 16);
  if (Number.isNaN(num)) return [2, 132, 199];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function computeContrastText(s1: string, s2: string, s3: string, mode: 'auto' | 'light' | 'dark'): string {
  if (mode === 'light') return '#ffffff';
  if (mode === 'dark') return '#0f172a';
  const [r1, g1, b1] = hexToRgbTuple(s1);
  const [r2, g2, b2] = hexToRgbTuple(s2);
  const [r3, g3, b3] = hexToRgbTuple(s3);
  const avgR = (r1 * 0.25 + r2 * 0.5 + r3 * 0.25) / 255;
  const avgG = (g1 * 0.25 + g2 * 0.5 + g3 * 0.25) / 255;
  const avgB = (b1 * 0.25 + b2 * 0.5 + b3 * 0.25) / 255;
  const lum = 0.2126 * avgR + 0.7152 * avgG + 0.0722 * avgB;
  return lum > 0.62 ? '#0f172a' : '#ffffff';
}

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
  const { user, loading, logout, can } = useAuth();
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

  // 3-Stop Button Gradient state persisted in localStorage (fully customizable)
  const [gradPresetId, setGradPresetId] = useState<string>(() => {
    try {
      return localStorage.getItem('flipex_btn_grad_preset') || localStorage.getItem('flipex_blue_preset') || 'golden_sunset';
    } catch {
      return 'golden_sunset';
    }
  });

  const [gradStop1, setGradStop1] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('flipex_btn_grad_stop1');
      if (saved) return saved;
      const pid = localStorage.getItem('flipex_btn_grad_preset') || localStorage.getItem('flipex_blue_preset') || 'golden_sunset';
      const found = BUTTON_GRADIENT_PRESETS.find((p) => p.id === pid);
      return found ? found.stop1 : '#fde047';
    } catch {
      return '#fde047';
    }
  });

  const [gradStop2, setGradStop2] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('flipex_btn_grad_stop2');
      if (saved) return saved;
      const pid = localStorage.getItem('flipex_btn_grad_preset') || localStorage.getItem('flipex_blue_preset') || 'golden_sunset';
      const found = BUTTON_GRADIENT_PRESETS.find((p) => p.id === pid);
      return found ? found.stop2 : '#f59e0b';
    } catch {
      return '#f59e0b';
    }
  });

  const [gradStop3, setGradStop3] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('flipex_btn_grad_stop3');
      if (saved) return saved;
      const pid = localStorage.getItem('flipex_btn_grad_preset') || localStorage.getItem('flipex_blue_preset') || 'golden_sunset';
      const found = BUTTON_GRADIENT_PRESETS.find((p) => p.id === pid);
      return found ? found.stop3 : '#b45309';
    } catch {
      return '#b45309';
    }
  });

  const [gradAngle, setGradAngle] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem('flipex_btn_grad_angle'));
      return !Number.isNaN(saved) && saved >= 0 && saved <= 360 ? saved : 135;
    } catch {
      return 135;
    }
  });

  const [gradTextMode, setGradTextMode] = useState<'auto' | 'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('flipex_btn_grad_text') as 'auto' | 'light' | 'dark' | null;
      return saved === 'light' || saved === 'dark' || saved === 'auto' ? saved : 'auto';
    } catch {
      return 'auto';
    }
  });

  const applyGradientPreset = (preset: ButtonGradientPreset) => {
    setGradPresetId(preset.id);
    setGradStop1(preset.stop1);
    setGradStop2(preset.stop2);
    setGradStop3(preset.stop3);
    setGradAngle(preset.angle);
    setGradTextMode(preset.textColor || 'auto');
  };

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
    const root = document.documentElement;
    const [r1, g1, b1] = hexToRgbTuple(gradStop1);
    const [r2, g2, b2] = hexToRgbTuple(gradStop2);
    const textColor = computeContrastText(gradStop1, gradStop2, gradStop3, gradTextMode);
    const gradientCss = `linear-gradient(${gradAngle}deg, ${gradStop1} 0%, ${gradStop2} 50%, ${gradStop3} 100%)`;
    const gradientHoverCss = `linear-gradient(${gradAngle}deg, ${gradStop1} 0%, ${gradStop2} 38%, ${gradStop3} 100%)`;
    const gradientActiveCss = `linear-gradient(${gradAngle}deg, ${gradStop2} 0%, ${gradStop3} 65%, ${gradStop3} 100%)`;

    root.style.setProperty('--btn-grad-1', gradStop1);
    root.style.setProperty('--btn-grad-2', gradStop2);
    root.style.setProperty('--btn-grad-3', gradStop3);
    root.style.setProperty('--btn-grad-angle', `${gradAngle}deg`);
    root.style.setProperty('--btn-gradient', gradientCss);
    root.style.setProperty('--btn-gradient-hover', gradientHoverCss);
    root.style.setProperty('--btn-gradient-active', gradientActiveCss);
    root.style.setProperty('--btn-text', textColor);

    root.style.setProperty('--brand', gradStop2);
    root.style.setProperty('--brand-strong', gradStop3);
    root.style.setProperty('--brand-hover', gradStop3);
    root.style.setProperty('--brand-soft', `rgba(${r2}, ${g2}, ${b2}, 0.14)`);
    root.style.setProperty('--brand-border', `rgba(${r1}, ${g1}, ${b1}, 0.5)`);
    root.style.setProperty('--brand-shadow', `rgba(${r2}, ${g2}, ${b2}, 0.32)`);

    try {
      localStorage.setItem('flipex_btn_grad_preset', gradPresetId);
      localStorage.setItem('flipex_btn_grad_stop1', gradStop1);
      localStorage.setItem('flipex_btn_grad_stop2', gradStop2);
      localStorage.setItem('flipex_btn_grad_stop3', gradStop3);
      localStorage.setItem('flipex_btn_grad_angle', String(gradAngle));
      localStorage.setItem('flipex_btn_grad_text', gradTextMode);
    } catch {
      // ignore
    }
  }, [gradPresetId, gradStop1, gradStop2, gradStop3, gradAngle, gradTextMode]);

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
  const isStudio = location.pathname.startsWith('/studio');
  const isLeads = location.pathname.startsWith('/leads');
  const isAnalytics = location.pathname.startsWith('/dashboard/analytics');
  const isIntegrations = location.pathname.startsWith('/integrations');
  const isBilling = location.pathname.startsWith('/billing');
  const isDevOps = location.pathname.startsWith('/devops');
  const isSettings = location.pathname.startsWith('/settings');
  const isAdmin = location.pathname.startsWith('/admin');

  // Enforce RBAC route access
  const isUnauthorized =
    (isBilling && !can('billing.view') && !can('billing.manage')) ||
    (isDevOps && user.role !== 'admin') ||
    (isStudio && user.role !== 'admin') ||
    (isIntegrations && !can('settings.manage') && !can('api_keys.manage') && !can('webhooks.manage')) ||
    (isAdmin && user.role !== 'admin');

  const registeredTenantDisplay =
    tenantName ||
    user.companyName ||
    (user.role === 'admin' ? 'Nuvis Enterprise Workspace' : `${user.name} Workspace`);

  const unreadNotifications = recentJobs.filter((j) => j.status === 'running' || j.status === 'failed').length;

  const togglePopover = (name: 'appearance' | 'notifications' | 'drawer' | 'profile') => {
    setActivePopover((prev) => (prev === name ? null : name));
  };

  return (
    <div className={`app-shell ${sidebarExpanded ? 'sidebar-expanded' : 'sidebar-rail'} ${isStudio ? 'studio-shell' : ''}`}>
      {/* LEFT VERTICAL SIDE NAVIGATION RAIL (Pic 2 Style + Extensible Modules) - Hidden in Studio for Full Canvas Viewport */}
      {!isStudio && (
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

          {/* 3. Flipex Studio (Developer Preview / Admin Only) */}
          {user.role === 'admin' && (
            <Link
              to="/studio"
              className={`sidebar-item ${isStudio && !activeModuleHub ? 'active' : ''}`}
              onClick={() => setActiveModuleHub(null)}
              title="Flipex Studio: Visual Document Creation Engine (Developer Preview)"
            >
              <svg viewBox="0 0 24 24" className="sidebar-icon" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              <span className="sidebar-label">Studio</span>
            </Link>
          )}

          {/* 4. Commercial Storefront & Customer Leads */}
          <Link
            to="/leads"
            className={`sidebar-item ${isLeads && !activeModuleHub ? 'active' : ''}`}
            onClick={() => setActiveModuleHub(null)}
            title="Storefront & Customer Product Inquiries CRM"
          >
            <svg viewBox="0 0 24 24" className="sidebar-icon" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
            <span className="sidebar-label">Storefront</span>
          </Link>

          {/* 4. Extensible Modules Slot (For adding new modules later) */}
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
          {(can('settings.manage') || can('api_keys.manage') || can('webhooks.manage')) && (
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
          )}

          {/* 7. Commercial Billing & Subscriptions */}
          {(can('billing.view') || can('billing.manage')) && (
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
          )}

          {/* 8. Modular Architecture & DevOps Production Readiness (Developer / Platform Admin Only) */}
          {user.role === 'admin' && (
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
          )}

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
      )}

      {/* MAIN CONTENT COLUMN */}
      <div className={`app-body ${isStudio ? 'studio-body' : ''}`}>
        {/* TOP HORIZONTAL HEADER BAR (Hidden in Studio for Full Canvas Viewport) */}
        {!isStudio && (
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
                  {can('flipbook.edit') && (
                    <Link to={`/dashboard/editor/${firstBookId}`} className="topbar-action-btn outline">
                      Edit enrichments
                    </Link>
                  )}
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
                  <div className="topbar-dropdown appearance-dropdown" style={{ width: 336 }}>
                    <div className="dropdown-head">
                      <b>Appearance & 3-Gradient Theme</b>
                      <span className="dropdown-sub">3-Stop Button Gradients & Dark Mode</span>
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

                    {/* 3-Stop Gradient Preset Library */}
                    <div className="appearance-preset-list">
                      <span className="preset-heading">3-Gradient Button Presets</span>
                      <div className="grad-presets-grid">
                        {BUTTON_GRADIENT_PRESETS.map((preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            className={`preset-option ${gradPresetId === preset.id ? 'active' : ''}`}
                            onClick={() => applyGradientPreset(preset)}
                          >
                            <span
                              className="preset-swatch-pill"
                              style={{
                                background: `linear-gradient(${preset.angle}deg, ${preset.stop1} 0%, ${preset.stop2} 50%, ${preset.stop3} 100%)`,
                              }}
                            />
                            <span className="preset-name">{preset.name}</span>
                            {gradPresetId === preset.id && <span className="preset-check">✓</span>}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="dropdown-divider" />

                    {/* Custom 3-Stop Gradient Builder */}
                    <div className="custom-grad-builder">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span className="preset-heading" style={{ margin: 0 }}>Custom 3-Stop Gradient</span>
                        {gradPresetId === 'custom' && (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: 'var(--brand-soft)', color: 'var(--brand)' }}>
                            Custom Active
                          </span>
                        )}
                      </div>

                      <div className="grad-stops-row">
                        <label className="grad-stop-cell">
                          <span className="grad-stop-label">Stop 1 (0%)</span>
                          <div className="grad-color-input-wrap">
                            <input
                              type="color"
                              value={gradStop1}
                              onChange={(e) => {
                                setGradPresetId('custom');
                                setGradStop1(e.target.value);
                              }}
                            />
                            <code>{gradStop1.toUpperCase()}</code>
                          </div>
                        </label>

                        <label className="grad-stop-cell">
                          <span className="grad-stop-label">Stop 2 (50%)</span>
                          <div className="grad-color-input-wrap">
                            <input
                              type="color"
                              value={gradStop2}
                              onChange={(e) => {
                                setGradPresetId('custom');
                                setGradStop2(e.target.value);
                              }}
                            />
                            <code>{gradStop2.toUpperCase()}</code>
                          </div>
                        </label>

                        <label className="grad-stop-cell">
                          <span className="grad-stop-label">Stop 3 (100%)</span>
                          <div className="grad-color-input-wrap">
                            <input
                              type="color"
                              value={gradStop3}
                              onChange={(e) => {
                                setGradPresetId('custom');
                                setGradStop3(e.target.value);
                              }}
                            />
                            <code>{gradStop3.toUpperCase()}</code>
                          </div>
                        </label>
                      </div>

                      {/* Direction Angle & Text Contrast Row */}
                      <div className="grad-controls-row">
                        <div className="grad-angle-group">
                          <span className="grad-stop-label">Angle ({gradAngle}°)</span>
                          <div className="grad-angle-pills">
                            {[90, 135, 180, 45].map((ang) => (
                              <button
                                key={ang}
                                type="button"
                                className={`grad-mini-pill ${gradAngle === ang ? 'active' : ''}`}
                                onClick={() => setGradAngle(ang)}
                              >
                                {ang}°
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="grad-text-group">
                          <span className="grad-stop-label">Text Color</span>
                          <div className="grad-angle-pills">
                            {(['auto', 'light', 'dark'] as const).map((tm) => (
                              <button
                                key={tm}
                                type="button"
                                className={`grad-mini-pill ${gradTextMode === tm ? 'active' : ''}`}
                                onClick={() => setGradTextMode(tm)}
                              >
                                {tm === 'auto' ? 'Auto' : tm === 'light' ? 'White' : 'Dark'}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Live 3-Gradient Button Preview */}
                      <div className="grad-live-preview-row">
                        <span
                          className="grad-live-preview-btn"
                          style={{
                            background: `linear-gradient(${gradAngle}deg, ${gradStop1} 0%, ${gradStop2} 50%, ${gradStop3} 100%)`,
                            color: computeContrastText(gradStop1, gradStop2, gradStop3, gradTextMode),
                          }}
                        >
                          ✨ Live 3-Gradient Button Preview
                        </span>
                      </div>
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
                      {(can('settings.manage') || can('api_keys.manage') || can('webhooks.manage') || user.role === 'admin') && (
                        <Link to="/integrations" className="profile-menu-item">
                          🔌 Enterprise Integrations & API
                        </Link>
                      )}
                      {(can('billing.view') || can('billing.manage') || user.role === 'admin') && (
                        <Link to="/billing" className="profile-menu-item">
                          💳 Billing, Invoices & Subscriptions
                        </Link>
                      )}
                      {user.role === 'admin' && (
                        <Link to="/devops" className="profile-menu-item">
                          🏗️ Modular Architecture & DevOps
                        </Link>
                      )}
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
        )}

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
        <main className={isStudio ? "app-main-studio" : "container app-main"}>
          {isUnauthorized ? (
            <div className="flex flex-col items-center justify-center p-8 my-12 text-center max-w-xl mx-auto">
              <div className="w-full card p-8 border border-amber-400/40 bg-white/95 dark:bg-slate-900/95 rounded-2xl shadow-2xl backdrop-blur-md">
                <div className="text-4xl mb-3">🛡️</div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                  {isStudio ? 'Developer Preview Alpha' : 'Access Restricted'}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mb-4 leading-relaxed">
                  {isStudio
                    ? 'Flipex Studio is currently in Developer Alpha Preview and is only accessible to platform developers and administrators. It will be enabled for general workspaces in an upcoming release.'
                    : (
                      <>
                        Your active workspace role <span className="font-bold text-amber-600 dark:text-amber-400 uppercase">({user.tenantRole || 'Editor'})</span> does not have permission to view or manage this module.
                      </>
                    )}
                </p>
                <div className="flex justify-center gap-3">
                  <Link to="/dashboard" className="btn-pub-primary text-xs font-bold py-2 px-5 rounded-xl shadow">
                    Return to Dashboard
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <Outlet />
          )}
        </main>

        {/* CHANGE PASSWORD MODAL (Triggered from Top-Right Profile Menu) */}
        {showChangePasswordModal && (
          <ChangePasswordModal onClose={() => setShowChangePasswordModal(false)} />
        )}
      </div>
    </div>
  );
}
