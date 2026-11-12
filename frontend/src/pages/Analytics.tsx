import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, getAccessToken } from '../api/client';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  Activity,
  Clock,
  Download,
  ExternalLink,
  Globe,
  Send,
  Sparkles,
  X,
} from '../components/ui/icons';

interface PageHeatmapItem {
  page: number;
  views: number;
  uniqueReaders: number;
  avgDwellSeconds: number;
  linkClicks: number;
  videoPlays: number;
  attentionScore: number;
  thumbUrl: string | null;
}

interface CountryStat {
  code: string;
  name: string;
  count: number;
  pct: number;
}

interface CampaignStat {
  source: string;
  medium: string;
  campaign: string;
  views: number;
  uniqueReaders: number;
  avgDurationSeconds: number;
}

interface TopInteraction {
  event_type: 'link_click' | 'video_play';
  page_number: number;
  target_url: string;
  clicks: number;
}

interface PeerPub {
  id: number;
  title: string;
  slug: string;
  pageCount: number;
}

interface AnalyticsMetrics {
  flipbook: { id: number; title: string; slug: string; pageCount: number };
  totalViews: number;
  uniqueReaders: number;
  avgReadingTimeSeconds: number;
  completionRate: number;
  linkClicksTotal: number;
  videoPlaysTotal: number;
  downloadsTotal: number;
  sharesTotal: number;
  searchesTotal: number;
  viewsByDay: Array<{ date: string; views: number; unique_visitors: number; avg_duration?: number }>;
  devices: Array<{ device: string; count: number }>;
  countries: CountryStat[];
  referrers: Array<{ ref: string; count: number }>;
  campaigns: CampaignStat[];
  topInteractions: TopInteraction[];
  pageHeatmap: PageHeatmapItem[];
  recent: Array<{
    id: number;
    country: string;
    device: string;
    referrer: string;
    duration_seconds: number;
    pages_viewed: number;
    max_page_reached: number;
    completed: number;
    utm_source: string | null;
    utm_campaign: string | null;
    created_at: string;
  }>;
}

interface AnalyticsResponse extends AnalyticsMetrics {
  dateRange: { from: string; to: string };
  comparison: AnalyticsMetrics | null;
  peerPublications: PeerPub[];
}

interface TenantOverviewData {
  dateRange: { from: string; to: string };
  totalViews: number;
  uniqueReaders: number;
  avgReadingTimeSeconds: number;
  completionRate: number;
  linkClicksTotal: number;
  videoPlaysTotal: number;
  downloadsTotal: number;
  sharesTotal: number;
  publications: Array<{
    id: number;
    title: string;
    slug: string;
    pageCount: number;
    workflowStatus: string;
    views: number;
    uniqueReaders: number;
    avgReadingTimeSeconds: number;
    completionRate: number;
  }>;
}

interface ScheduledReportItem {
  id: number;
  flipbook_id: number | null;
  flipbook_title?: string | null;
  recipient_email: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  format: 'csv' | 'pdf_summary';
  last_sent_at: string | null;
  created_at: string;
}

export default function Analytics() {
  const { id } = useParams();
  const [viewMode, setViewMode] = useState<'publication' | 'tenant'>('publication');
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [tenantOverview, setTenantOverview] = useState<TenantOverviewData | null>(null);
  const [error, setError] = useState('');

  // Date-Range & Comparison Filters
  const [daysPreset, setDaysPreset] = useState<number>(30);
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [compareId, setCompareId] = useState<string>('');

  // Scheduled Reports & UTM Builder Modals
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduledReports, setScheduledReports] = useState<ScheduledReportItem[]>([]);
  const [schedEmail, setSchedEmail] = useState('');
  const [schedFreq, setSchedFreq] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [schedFormat] = useState<'csv' | 'pdf_summary'>('pdf_summary');
  const [schedMsg, setSchedMsg] = useState('');

  // UTM Campaign Builder state
  const [utmSource, setUtmSource] = useState('newsletter');
  const [utmMedium, setUtmMedium] = useState('email');
  const [utmCampaign, setUtmCampaign] = useState('q4_launch');
  const [copiedUtm, setCopiedUtm] = useState(false);

  const buildQuery = useCallback(() => {
    const p = new URLSearchParams();
    if (fromDate && toDate) {
      p.set('from', fromDate);
      p.set('to', toDate);
    } else {
      p.set('days', String(daysPreset));
    }
    if (compareId) p.set('compareId', compareId);
    return p.toString();
  }, [daysPreset, fromDate, toDate, compareId]);

  const loadPublicationAnalytics = useCallback(() => {
    if (!id) return;
    api<AnalyticsResponse>(`/flipbooks/${id}/analytics?${buildQuery()}`)
      .then((d) => {
        setData(d);
        if (!fromDate) setFromDate(d.dateRange.from);
        if (!toDate) setToDate(d.dateRange.to);
      })
      .catch((err) => setError(err.message || 'Failed to load analytics'));
  }, [id, buildQuery, fromDate, toDate]);

  const loadTenantOverview = useCallback(() => {
    api<TenantOverviewData>(`/analytics/overview?${buildQuery()}`)
      .then(setTenantOverview)
      .catch(() => {});
  }, [buildQuery]);

  const loadScheduledReports = useCallback(() => {
    api<ScheduledReportItem[]>('/analytics/scheduled-reports')
      .then(setScheduledReports)
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadPublicationAnalytics();
    if (viewMode === 'tenant') {
      loadTenantOverview();
    }
  }, [loadPublicationAnalytics, loadTenantOverview, viewMode]);

  const formatDuration = (sec: number) => {
    if (!sec || sec <= 0) return '0s';
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  const handleExportCsv = async () => {
    if (!data) return;
    const res = await fetch(`/api/v1/flipbooks/${data.flipbook.id}/analytics/export-csv?${buildQuery()}`, {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data.flipbook.slug}_analytics_${fromDate}_${toDate}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleCreateSchedule = async () => {
    if (!schedEmail.trim()) return;
    await api('/analytics/scheduled-reports', 'POST', {
      flipbookId: viewMode === 'publication' && data ? data.flipbook.id : null,
      recipientEmail: schedEmail.trim(),
      frequency: schedFreq,
      format: schedFormat,
    });
    setSchedMsg('Scheduled report created!');
    loadScheduledReports();
  };

  if (error) return <p className="center err">{error}</p>;
  if (!data) return <p className="center">Loading commercial analytics & telemetry…</p>;

  const comp = data.comparison;
  const maxDailyViews = Math.max(...data.viewsByDay.map((d) => Number(d.views)), 1);

  const getHeatBadgeStyle = (score: number) => {
    if (score >= 75) {
      return { bg: 'rgba(239, 68, 68, 0.9)', border: '#ef4444', label: '🔥 Hot' };
    }
    if (score >= 45) {
      return { bg: 'rgba(245, 158, 11, 0.9)', border: '#f59e0b', label: '⚡ Warm' };
    }
    return { bg: 'rgba(59, 130, 246, 0.85)', border: '#3b82f6', label: '💧 Cool' };
  };

  const utmGeneratedUrl = `${window.location.origin}/v/${data.flipbook.slug}?utm_source=${encodeURIComponent(utmSource)}&utm_medium=${encodeURIComponent(utmMedium)}&utm_campaign=${encodeURIComponent(utmCampaign)}`;

  return (
    <div className="analytics-wrap space-y-6">
      {/* Top Bar */}
      <div className="preview-topbar" style={{ flexWrap: 'wrap', gap: '12px' }}>
        <div className="flex items-center gap-3">
          <Link to="/dashboard" className="btn-back">
            ← Back to Flipbooks
          </Link>
          <div>
            <span className="preview-title block">{data.flipbook.title}</span>
            <span className="text-xs text-slate-500">
              Commercial Intelligence · Page Engagement Heatmap · UTM Attribution
            </span>
          </div>
        </div>

        {/* Scope Switcher + Export & Schedule Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setViewMode('publication')}
              className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                viewMode === 'publication' ? 'bg-amber-400 text-slate-950 shadow-sm' : 'text-slate-600'
              }`}
            >
              📘 Publication View
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode('tenant');
                loadTenantOverview();
              }}
              className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                viewMode === 'tenant' ? 'bg-amber-400 text-slate-950 shadow-sm' : 'text-slate-600'
              }`}
            >
              🏢 Tenant Overview
            </button>
          </div>

          <Button size="sm" variant="outline" onClick={handleExportCsv}>
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            🖨️ Export PDF
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              loadScheduledReports();
              setShowScheduleModal(true);
            }}
          >
            <Clock className="h-3.5 w-3.5 text-amber-500" />
            Scheduled Reports
          </Button>
          <a
            href={`/v/${data.flipbook.slug}`}
            target="_blank"
            rel="noreferrer"
            className="btn-pub-outline inline-flex items-center gap-1.5"
          >
            <span>Open Reader</span> <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      {/* Date-Range Filter & Publication Comparison Bar */}
      <div className="card flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 mr-1">
            Date Range:
          </span>
          {[7, 30, 90, 365].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => {
                setDaysPreset(d);
                setFromDate('');
                setToDate('');
              }}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                daysPreset === d && !fromDate
                  ? 'bg-amber-400 text-slate-950'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {d}d
            </button>
          ))}
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs"
          />
          <span className="text-xs text-slate-400">to</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs"
          />
        </div>

        {viewMode === 'publication' && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Compare Against:
            </span>
            <select
              value={compareId}
              onChange={(e) => setCompareId(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800"
            >
              <option value="">— None (Single Publication) —</option>
              {data.peerPublications
                .filter((p) => p.id !== data.flipbook.id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} ({p.pageCount} pages)
                  </option>
                ))}
            </select>
          </div>
        )}
      </div>

      {viewMode === 'tenant' && tenantOverview ? (
        /* TENANT-WIDE EXECUTIVE DASHBOARD */
        <div className="space-y-6">
          <div className="stat-grid">
            <div className="card stat-card">
              <span className="stat-label">Workspace Total Views</span>
              <b className="stat-value">{tenantOverview.totalViews}</b>
              <span className="stat-hint">Across all publications</span>
            </div>
            <div className="card stat-card">
              <span className="stat-label">Workspace Unique Readers</span>
              <b className="stat-value">{tenantOverview.uniqueReaders}</b>
              <span className="stat-hint">Distinct audience reach</span>
            </div>
            <div className="card stat-card">
              <span className="stat-label">Avg Reading Time</span>
              <b className="stat-value">{formatDuration(tenantOverview.avgReadingTimeSeconds)}</b>
              <span className="stat-hint">Organization engagement</span>
            </div>
            <div className="card stat-card">
              <span className="stat-label">Avg Completion Rate</span>
              <b className="stat-value">{tenantOverview.completionRate}%</b>
              <span className="stat-hint">Readers finishing issues</span>
            </div>
          </div>

          <div className="card">
            <h3 className="mb-3">All Tenant Publications Performance Comparison</h3>
            <table className="activity-table">
              <thead>
                <tr>
                  <th>Publication</th>
                  <th>Status</th>
                  <th>Pages</th>
                  <th>Total Views</th>
                  <th>Unique Readers</th>
                  <th>Avg Read Time</th>
                  <th>Completion Rate</th>
                </tr>
              </thead>
              <tbody>
                {tenantOverview.publications.map((pub) => (
                  <tr key={pub.id}>
                    <td>
                      <Link
                        to={`/dashboard/analytics/${pub.id}`}
                        onClick={() => setViewMode('publication')}
                        className="font-bold text-amber-600 hover:underline"
                      >
                        {pub.title}
                      </Link>
                    </td>
                    <td>
                      <Badge variant={pub.workflowStatus === 'published' ? 'success' : 'golden'}>
                        {pub.workflowStatus}
                      </Badge>
                    </td>
                    <td>{pub.pageCount}</td>
                    <td><b>{pub.views}</b></td>
                    <td>{pub.uniqueReaders}</td>
                    <td>{formatDuration(pub.avgReadingTimeSeconds)}</td>
                    <td>{pub.completionRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* SINGLE PUBLICATION + OPTIONAL SIDE-BY-SIDE COMPARISON */
        <>
          {/* 8 Commercial KPI Cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="card stat-card">
              <span className="stat-label">Total Views (Reach)</span>
              <b className="stat-value">{data.totalViews}</b>
              {comp ? (
                <span className="text-xs font-semibold text-amber-600">
                  vs {comp.totalViews} ({comp.flipbook.title})
                </span>
              ) : (
                <span className="stat-hint">All publication reads</span>
              )}
            </div>

            <div className="card stat-card">
              <span className="stat-label">Unique Readers</span>
              <b className="stat-value">{data.uniqueReaders}</b>
              {comp ? (
                <span className="text-xs font-semibold text-amber-600">
                  vs {comp.uniqueReaders} unique
                </span>
              ) : (
                <span className="stat-hint">Audience size</span>
              )}
            </div>

            <div className="card stat-card">
              <span className="stat-label">Avg Reading Time</span>
              <b className="stat-value">{formatDuration(data.avgReadingTimeSeconds)}</b>
              {comp ? (
                <span className="text-xs font-semibold text-amber-600">
                  vs {formatDuration(comp.avgReadingTimeSeconds)}
                </span>
              ) : (
                <span className="stat-hint">Session dwell engagement</span>
              )}
            </div>

            <div className="card stat-card">
              <span className="stat-label">Completion Rate</span>
              <b className="stat-value">{data.completionRate}%</b>
              {comp ? (
                <span className="text-xs font-semibold text-amber-600">
                  vs {comp.completionRate}% retention
                </span>
              ) : (
                <span className="stat-hint">Reader retention to end</span>
              )}
            </div>

            <div className="card stat-card">
              <span className="stat-label">Link Clicks</span>
              <b className="stat-value">{data.linkClicksTotal}</b>
              <span className="stat-hint">Marketing CTA effectiveness</span>
            </div>

            <div className="card stat-card">
              <span className="stat-label">Video Engagement</span>
              <b className="stat-value">{data.videoPlaysTotal}</b>
              <span className="stat-hint">Embedded video plays</span>
            </div>

            <div className="card stat-card">
              <span className="stat-label">PDF Downloads</span>
              <b className="stat-value">{data.downloadsTotal}</b>
              <span className="stat-hint">Content distribution</span>
            </div>

            <div className="card stat-card">
              <span className="stat-label">Shares & Searches</span>
              <b className="stat-value">{data.sharesTotal + data.searchesTotal}</b>
              <span className="stat-hint">
                {data.sharesTotal} shares · {data.searchesTotal} searches
              </span>
            </div>
          </div>

          {/* PAGE ENGAGEMENT HEATMAP (Visual Attention Grid) */}
          <div className="card space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 style={{ margin: 0 }}>🔥 Page-by-Page Engagement Heatmap</h3>
                <p className="text-xs text-slate-500" style={{ margin: '2px 0 0 0' }}>
                  Visualizes which pages attract the highest reader attention based on views, dwell time, and interactive hotspot clicks.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <Badge variant="danger">🔥 Hot (75–100%)</Badge>
                <Badge variant="warning">⚡ Warm (45–74%)</Badge>
                <Badge variant="default">💧 Cool (0–44%)</Badge>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
              {data.pageHeatmap.map((pg) => {
                const heat = getHeatBadgeStyle(pg.attentionScore);
                return (
                  <div
                    key={pg.page}
                    className="relative overflow-hidden rounded-xl border bg-slate-900 text-white shadow-md transition-transform hover:scale-[1.02]"
                    style={{ borderColor: heat.border }}
                  >
                    <div className="relative h-36 w-full bg-slate-800">
                      {pg.thumbUrl && (
                        <img
                          src={pg.thumbUrl}
                          alt={`Page ${pg.page}`}
                          loading="lazy"
                          className="h-full w-full object-cover opacity-85"
                        />
                      )}
                      {/* Thermal Heat Tint Overlay */}
                      <div
                        className="pointer-events-none absolute inset-0"
                        style={{
                          background: `linear-gradient(to top, rgba(2,6,23,0.92) 15%, ${
                            pg.attentionScore >= 75
                              ? 'rgba(239, 68, 68, 0.32)'
                              : pg.attentionScore >= 45
                                ? 'rgba(245, 158, 11, 0.25)'
                                : 'rgba(59, 130, 246, 0.18)'
                          } 100%)`,
                        }}
                      />
                      <span
                        className="absolute top-2 left-2 rounded-full px-2 py-0.5 text-[10px] font-bold text-white shadow"
                        style={{ background: heat.bg }}
                      >
                        {pg.attentionScore}% Attention
                      </span>
                      <span className="absolute top-2 right-2 rounded bg-slate-950/80 px-1.5 py-0.5 text-[10px] font-bold text-amber-400">
                        p. {pg.page}
                      </span>
                    </div>
                    <div className="p-2.5 text-[11px] space-y-1 bg-slate-950">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Views:</span>
                        <b className="text-white">{pg.views}</b>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Avg Dwell:</span>
                        <b className="text-amber-400">{pg.avgDwellSeconds}s</b>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Clicks/Video:</span>
                        <b className="text-emerald-400">{pg.linkClicks + pg.videoPlays}</b>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Chart: Daily Views */}
          <div className="card chart-card">
            <h3>Daily Views & Unique Readers ({data.dateRange.from} to {data.dateRange.to})</h3>
            {data.viewsByDay.length === 0 ? (
              <p className="muted" style={{ padding: '24px 0', textAlign: 'center' }}>
                No views recorded in this date range.
              </p>
            ) : (
              <div className="bar-chart">
                {data.viewsByDay.map((d) => {
                  const heightPercent = Math.max((Number(d.views) / maxDailyViews) * 100, 8);
                  return (
                    <div
                      key={d.date}
                      className="bar-col"
                      title={`${d.date}: ${d.views} views (${d.unique_visitors} unique)`}
                    >
                      <div className="bar-fill" style={{ height: `${heightPercent}%` }}>
                        <span className="bar-val">{d.views}</span>
                      </div>
                      <span className="bar-label">{d.date.slice(5)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Geographic, Device & Top Referrers Breakdown */}
          <div className="breakdown-grid">
            {/* Geographic Breakdown */}
            <div className="card">
              <h3 className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-amber-500" />
                Geographic Audience Breakdown
              </h3>
              {data.countries.length === 0 ? (
                <p className="muted">No geographic data yet.</p>
              ) : (
                <div className="device-list">
                  {data.countries.map((c) => (
                    <div key={c.code} className="device-row">
                      <div className="device-info">
                        <span>
                          🌍 <b>{c.name}</b> ({c.code})
                        </span>
                        <b>
                          {c.count} ({c.pct}%)
                        </b>
                      </div>
                      <div className="progress-bg">
                        <div className="progress-fill" style={{ width: `${Math.max(4, c.pct)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Device Breakdown */}
            <div className="card">
              <h3>Reader Devices</h3>
              {data.devices.length === 0 ? (
                <p className="muted">No device data yet.</p>
              ) : (
                <div className="device-list">
                  {data.devices.map((d) => {
                    const total = Math.max(data.totalViews, 1);
                    const pct = Math.round((Number(d.count) / total) * 100);
                    return (
                      <div key={d.device} className="device-row">
                        <div className="device-info">
                          <span>
                            {d.device === 'desktop'
                              ? '💻 Desktop'
                              : d.device === 'mobile'
                                ? '📱 Mobile'
                                : '📟 Tablet'}
                          </span>
                          <b>
                            {d.count} ({pct}%)
                          </b>
                        </div>
                        <div className="progress-bg">
                          <div className="progress-fill" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Campaign Tracking, UTM Attribution & Interactive UTM Builder */}
          <div className="card space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 style={{ margin: 0 }}>🎯 Campaign Tracking & UTM Attribution</h3>
                <p className="text-xs text-slate-500" style={{ margin: '2px 0 0 0' }}>
                  Track marketing campaigns, email newsletters, and social channels driving reader engagement.
                </p>
              </div>
            </div>

            {/* Built-in UTM Link Generator */}
            <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3.5 space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700">
                <Sparkles className="h-3.5 w-3.5" />
                <span>Campaign UTM Link Builder</span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Input
                  value={utmSource}
                  onChange={(e) => setUtmSource(e.target.value)}
                  placeholder="utm_source (e.g. newsletter)"
                />
                <Input
                  value={utmMedium}
                  onChange={(e) => setUtmMedium(e.target.value)}
                  placeholder="utm_medium (e.g. email)"
                />
                <Input
                  value={utmCampaign}
                  onChange={(e) => setUtmCampaign(e.target.value)}
                  placeholder="utm_campaign (e.g. term3_launch)"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={utmGeneratedUrl}
                  className="boardui-input flex-1 text-xs"
                />
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    navigator.clipboard?.writeText(utmGeneratedUrl);
                    setCopiedUtm(true);
                    setTimeout(() => setCopiedUtm(false), 2000);
                  }}
                >
                  {copiedUtm ? '✓ Copied UTM Link' : 'Copy Tracked Link'}
                </Button>
              </div>
            </div>

            <table className="activity-table">
              <thead>
                <tr>
                  <th>UTM Source</th>
                  <th>UTM Medium</th>
                  <th>UTM Campaign</th>
                  <th>Views</th>
                  <th>Unique Readers</th>
                  <th>Avg Reading Time</th>
                </tr>
              </thead>
              <tbody>
                {data.campaigns.map((c, idx) => (
                  <tr key={idx}>
                    <td><b>{c.source}</b></td>
                    <td>{c.medium}</td>
                    <td><Badge variant="golden">{c.campaign}</Badge></td>
                    <td>{c.views}</td>
                    <td>{c.uniqueReaders}</td>
                    <td>{formatDuration(c.avgDurationSeconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Link Clicks & Video Engagement Table */}
          {data.topInteractions.length > 0 && (
            <div className="card">
              <h3>🔗 Top Clicked Links & Video Hotspots</h3>
              <table className="activity-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Page</th>
                    <th>Target URL / Media</th>
                    <th>Total Engagements</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topInteractions.map((it, idx) => (
                    <tr key={idx}>
                      <td>
                        <Badge variant={it.event_type === 'video_play' ? 'warning' : 'success'}>
                          {it.event_type === 'video_play' ? '▶ Video Play' : '🔗 Link Click'}
                        </Badge>
                      </td>
                      <td>Page {it.page_number}</td>
                      <td className="truncate max-w-xs">{it.target_url}</td>
                      <td><b>{it.clicks}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Recent Reader Sessions Table */}
          <div className="card">
            <h3>Recent Reader Sessions</h3>
            {data.recent.length === 0 ? (
              <p className="muted">No recent views recorded.</p>
            ) : (
              <table className="activity-table">
                <thead>
                  <tr>
                    <th>Date & Time</th>
                    <th>Country</th>
                    <th>Device</th>
                    <th>Duration</th>
                    <th>Max Page</th>
                    <th>Campaign / Referrer</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent.map((ev) => (
                    <tr key={ev.id}>
                      <td>{ev.created_at}</td>
                      <td>🌍 {ev.country || 'FJ'}</td>
                      <td>{ev.device}</td>
                      <td>{formatDuration(Number(ev.duration_seconds || 0))}</td>
                      <td>
                        Page {ev.max_page_reached || 1}
                        {Number(ev.completed) === 1 && (
                          <Badge variant="success" className="ml-1">Completed</Badge>
                        )}
                      </td>
                      <td>
                        {ev.utm_campaign
                          ? `${ev.utm_source || 'direct'} / ${ev.utm_campaign}`
                          : ev.referrer || 'Direct'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* Scheduled Reports Modal */}
      {showScheduleModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
          onClick={() => setShowScheduleModal(false)}
        >
          <div
            className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-amber-500" />
                <h2 className="text-base font-bold text-slate-900">
                  Automated Scheduled Analytics Reports
                </h2>
              </div>
              <button onClick={() => setShowScheduleModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {schedMsg && (
              <div className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-700">
                {schedMsg}
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Input
                type="email"
                placeholder="Recipient email..."
                value={schedEmail}
                onChange={(e) => setSchedEmail(e.target.value)}
              />
              <select
                value={schedFreq}
                onChange={(e) => setSchedFreq(e.target.value as 'daily' | 'weekly' | 'monthly')}
                className="boardui-input"
              >
                <option value="daily">Daily Report</option>
                <option value="weekly">Weekly Report</option>
                <option value="monthly">Monthly Report</option>
              </select>
              <Button size="sm" variant="primary" onClick={handleCreateSchedule}>
                + Schedule Report
              </Button>
            </div>

            <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 max-h-60 overflow-y-auto">
              {scheduledReports.length === 0 ? (
                <p className="p-4 text-center text-xs text-slate-400">
                  No scheduled reports configured yet.
                </p>
              ) : (
                scheduledReports.map((sr) => (
                  <div key={sr.id} className="flex items-center justify-between px-4 py-3 text-xs">
                    <div>
                      <b className="text-slate-800">{sr.recipient_email}</b>
                      <span className="ml-2 uppercase text-[10px] font-bold text-amber-600">
                        {sr.frequency}
                      </span>
                      <p className="text-[11px] text-slate-400">
                        Scope: {sr.flipbook_title || 'All Workspace Publications'}
                        {sr.last_sent_at ? ` · Last sent: ${sr.last_sent_at}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          await api(`/analytics/scheduled-reports/${sr.id}/send-now`, 'POST');
                          setSchedMsg(`Dispatched report to ${sr.recipient_email}`);
                          loadScheduledReports();
                        }}
                      >
                        <Send className="h-3 w-3" /> Send Now
                      </Button>
                      <button
                        className="text-red-500 hover:underline text-[11px]"
                        onClick={async () => {
                          await api(`/analytics/scheduled-reports/${sr.id}`, 'DELETE');
                          loadScheduledReports();
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
