import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';

interface AnalyticsData {
  flipbook: { id: number; title: string; slug: string };
  totalViews: number;
  uniqueReaders: number;
  viewsByDay: Array<{ date: string; views: number; unique_visitors: number }>;
  devices: Array<{ device: string; count: number }>;
  referrers: Array<{ ref: string; count: number }>;
  recent: Array<{ id: number; device: string; referrer: string; created_at: string }>;
}

export default function Analytics() {
  const { id } = useParams();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<AnalyticsData>(`/flipbooks/${id}/analytics`)
      .then((d) => setData(d))
      .catch((err) => setError(err.message || 'Failed to load analytics'));
  }, [id]);

  if (error) return <p className="center err">{error}</p>;
  if (!data) return <p className="center">Loading analytics…</p>;

  const maxDailyViews = Math.max(...data.viewsByDay.map((d) => Number(d.views)), 1);

  return (
    <div className="analytics-wrap">
      <div className="preview-topbar">
        <Link to="/dashboard" className="btn-back">← Back to Flipbooks</Link>
        <span className="preview-title">Analytics: {data.flipbook.title}</span>
        <a href={`/v/${data.flipbook.slug}`} target="_blank" rel="noreferrer" className="btn-pub">
          Open Public Reader ↗
        </a>
      </div>

      {/* Overview Stat Cards */}
      <div className="stat-grid">
        <div className="card stat-card">
          <span className="stat-label">Total Page Views</span>
          <b className="stat-value">{data.totalViews}</b>
          <span className="stat-hint">All visits & reads</span>
        </div>
        <div className="card stat-card">
          <span className="stat-label">Unique Readers</span>
          <b className="stat-value">{data.uniqueReaders}</b>
          <span className="stat-hint">Distinct devices</span>
        </div>
        <div className="card stat-card">
          <span className="stat-label">Total Devices Logged</span>
          <b className="stat-value">{data.devices.reduce((acc, d) => acc + Number(d.count), 0)}</b>
          <span className="stat-hint">Desktop, mobile & tablet</span>
        </div>
      </div>

      {/* Chart: Daily Views */}
      <div className="card chart-card">
        <h3>Views over the last 30 days</h3>
        {data.viewsByDay.length === 0 ? (
          <p className="muted" style={{ padding: '24px 0', textAlign: 'center' }}>
            No views recorded yet in the last 30 days. Share your link to start tracking readers!
          </p>
        ) : (
          <div className="bar-chart">
            {data.viewsByDay.map((d) => {
              const heightPercent = Math.max((Number(d.views) / maxDailyViews) * 100, 8);
              return (
                <div key={d.date} className="bar-col" title={`${d.date}: ${d.views} views (${d.unique_visitors} unique)`}>
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

      {/* Breakdown Grid: Devices & Referrers */}
      <div className="breakdown-grid">
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
                      <span>{d.device === 'desktop' ? '💻 Desktop' : d.device === 'mobile' ? '📱 Mobile' : '📟 Tablet'}</span>
                      <b>{d.count} ({pct}%)</b>
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

        <div className="card">
          <h3>Top Referrers</h3>
          {data.referrers.length === 0 ? (
            <p className="muted">No referrer data yet.</p>
          ) : (
            <div className="referrer-list">
              {data.referrers.map((r, i) => (
                <div key={i} className="ref-row">
                  <span className="ref-name">{r.ref || 'Direct'}</span>
                  <span className="ref-count">{r.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Activity Table */}
      <div className="card">
        <h3>Recent Reader Activity</h3>
        {data.recent.length === 0 ? (
          <p className="muted">No recent views recorded.</p>
        ) : (
          <table className="activity-table">
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Device</th>
                <th>Referrer</th>
              </tr>
            </thead>
            <tbody>
              {data.recent.map((ev) => (
                <tr key={ev.id}>
                  <td>{ev.created_at}</td>
                  <td>{ev.device}</td>
                  <td>{ev.referrer || 'Direct / Bookmark'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
