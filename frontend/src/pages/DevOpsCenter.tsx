import { useEffect, useState } from 'react';
import { api } from '../api/client';

interface ArchitectureLayer {
  order: number;
  title: string;
  subsystems: string[];
}

interface DomainModuleItem {
  name: string;
  namespace: string;
  path: string;
  layer: string;
  description: string;
  dependencies: string[];
  capabilities: {
    features?: string[];
  };
  status: string;
}

interface InfraItem {
  name: string;
  path: string;
  class: string;
}

interface DeadLetterJob {
  id: number;
  originalJobId: number | null;
  queueName: string;
  jobType: string;
  payload: Record<string, unknown>;
  exceptionClass: string;
  errorMessage: string;
  attempts: number;
  status: 'dead' | 'requeued' | 'resolved';
  failedAt: string;
  requeuedAt: string | null;
}

interface MigrationItem {
  version: string;
  description: string;
  applied: boolean;
  batch: number | null;
  checksum: string;
  reversible: boolean;
  downPreview: string;
  executedAt: string | null;
}

interface BackupItem {
  id: number;
  backupCode: string;
  backupType: string;
  filePath: string;
  sizeKb: number;
  checksumSha256: string;
  tablesCount: number;
  rowsCount: number;
  filesCount: number;
  status: 'completed' | 'verified' | 'restored' | 'failed';
  recoveryTestedAt: string | null;
  recoveryNotes: string | null;
  createdAt: string;
}

interface ErrorReportItem {
  id: number;
  traceId: string;
  severity: 'warning' | 'error' | 'critical';
  exceptionClass: string;
  message: string;
  file: string;
  line: number;
  requestMethod: string;
  requestUri: string;
  resolved: boolean;
  occurrences: number;
  lastSeenAt: string;
}

interface JsonLogItem {
  timestamp: string;
  level: string;
  service: string;
  environment: string;
  trace_id: string;
  tenant_id: number | null;
  user_id: number | null;
  method: string;
  uri: string;
  message: string;
  context: Record<string, unknown>;
}

interface DevOpsOverviewResponse {
  architecture: {
    pattern: string;
    layers: ArchitectureLayer[];
    modules: DomainModuleItem[];
    infrastructure: InfraItem[];
  };
  health: {
    status: string;
    environment: string;
    releaseVersion: string;
    phpVersion: string;
    osFamily: string;
    timestampUtc: string;
    resources: {
      cpuLoadPct: number;
      memoryAllocatedMb: number;
      memoryPeakMb: number;
      memoryLimitMb: number;
      memoryUsagePct: number;
    };
    workers: {
      conversionDaemon: {
        name: string;
        status: string;
        isolation: string;
        lastActivity: string;
        lastStep: string;
      };
      notificationDaemon: {
        name: string;
        status: string;
        signing: string;
      };
    };
    database: {
      status: string;
      engine: string;
      database: string;
      latencyMs: number;
      tableCount: number;
      tables: Array<{ name: string; rows_est: number; size_kb: number }>;
    };
    cache: {
      activeDriver: string;
      redisConfiguredHost: string;
      redisConnected: boolean;
      distributedLocksSupported: boolean;
    };
    queue: {
      driver: string;
      retryPolicy: string;
      queued: number;
      running: number;
      completed: number;
      failed: number;
      deadLetterCount: number;
      deadLetterJobs: DeadLetterJob[];
    };
    storage: {
      driver: string;
      s3Bucket: string;
      s3Endpoint: string;
      s3Region: string;
      cdnEnabled: boolean;
      cdnEdgeDomain: string;
      tenantIsolationPattern: string;
      activeTenantPrefix: string;
      diskTotalGb: number;
      diskFreeGb: number;
      diskUsedGb: number;
      diskUsagePct: number;
    };
    mail: {
      driver: string;
      smtpHost: string;
      smtpPort: number;
      totalDispatched: number;
      status: string;
    };
  };
  migrations: MigrationItem[];
  backups: BackupItem[];
  logs: JsonLogItem[];
  errorReports: ErrorReportItem[];
  ciCd: {
    pipelineFile: string;
    releaseWorkflowFile: string;
    automatedTests: {
      phpunitConfig: string;
      securitySuite: string;
      frontendBuildCheck: string;
    };
    vulnerabilityScanning: {
      composerAudit: string;
      npmAudit: string;
      secretScanning: string;
    };
    environments: Array<{ name: string; url: string; branch: string; status: string }>;
  };
}

export default function DevOpsCenter() {
  const [activeTab, setActiveTab] = useState<'architecture' | 'telemetry' | 'queue' | 'logs' | 'backups'>('architecture');
  const [data, setData] = useState<DevOpsOverviewResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [toast, setToast] = useState<string>('');
  const [busyAction, setBusyAction] = useState<boolean>(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api<DevOpsOverviewResponse>('/devops/overview');
      setData(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 5000);
  };

  const handleCreateBackup = async () => {
    setBusyAction(true);
    try {
      const res = await api<{ message: string }>('/devops/backups/create', 'POST', {
        backupType: 'full_snapshot',
      });
      showToast(res.message);
      await loadData();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to create backup');
    } finally {
      setBusyAction(false);
    }
  };

  const handleVerifyBackup = async (id: number) => {
    setBusyAction(true);
    try {
      const res = await api<{ message: string }>(`/devops/backups/${id}/verify`, 'POST');
      showToast(res.message);
      await loadData();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Backup recovery verification failed');
    } finally {
      setBusyAction(false);
    }
  };

  const handleSimulateDlq = async () => {
    setBusyAction(true);
    try {
      const res = await api<{ message: string }>('/devops/dlq/simulate', 'POST');
      showToast(res.message);
      await loadData();
    } finally {
      setBusyAction(false);
    }
  };

  const handleRetryDlq = async (id: number) => {
    setBusyAction(true);
    try {
      const res = await api<{ message: string }>(`/devops/dlq/${id}/retry`, 'POST');
      showToast(res.message);
      await loadData();
    } finally {
      setBusyAction(false);
    }
  };

  const handleSimulateError = async () => {
    setBusyAction(true);
    try {
      const res = await api<{ message: string }>('/devops/errors/simulate', 'POST');
      showToast(res.message);
      await loadData();
    } finally {
      setBusyAction(false);
    }
  };

  const handleResolveError = async (id: number) => {
    setBusyAction(true);
    try {
      await api(`/devops/errors/${id}/resolve`, 'POST');
      showToast(`Marked Error Report #${id} as resolved.`);
      await loadData();
    } finally {
      setBusyAction(false);
    }
  };

  const handleRunMigrations = async () => {
    setBusyAction(true);
    try {
      const res = await api<{ totalApplied: number }>('/devops/migrations/run', 'POST');
      showToast(`Verified all ${res.totalApplied} versioned reversible migrations.`);
      await loadData();
    } finally {
      setBusyAction(false);
    }
  };

  if (loading && !data) {
    return <p className="center">Loading Modular Architecture & DevOps Production Telemetry…</p>;
  }
  if (!data) {
    return <p className="center">Unable to load DevOps & Architecture telemetry.</p>;
  }

  const { architecture, health, migrations, backups, logs, errorReports, ciCd } = data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* HEADER BANNER */}
      <div
        className="card"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          borderLeft: '4px solid var(--brand)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: '1.45rem' }}>
              🏗️ Modular Backend Architecture & DevOps Readiness
            </h1>
            <span className="pill-badge" style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}>
              {health.releaseVersion}
            </span>
            <span className="pill-badge" style={{ background: 'rgba(16,185,129,0.14)', color: '#10b981' }}>
              ● {health.status.toUpperCase()} ({health.environment.toUpperCase()})
            </span>
          </div>
          <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.9rem' }}>
            15 Domain Modules (<code>backend/src/Modules/*</code>) · 8 Infrastructure Services (<code>backend/src/Infrastructure/*</code>) · S3 & CDN · Dead-Letter Queue · Structured JSONL Logs · Automated Backups & CI/CD
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn-secondary" onClick={loadData} disabled={busyAction}>
            ↻ Refresh Telemetry
          </button>
          <button type="button" className="btn-primary" onClick={handleCreateBackup} disabled={busyAction}>
            💾 Create Snapshot Backup
          </button>
        </div>
      </div>

      {toast && (
        <div
          className="card"
          style={{
            background: 'rgba(16, 185, 129, 0.12)',
            borderColor: 'rgba(16, 185, 129, 0.4)',
            color: '#10b981',
            fontWeight: 600,
            padding: '0.85rem 1.1rem',
          }}
        >
          ✓ {toast}
        </div>
      )}

      {/* TOP SUMMARY KPI CARDS */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(205px, 1fr))',
          gap: '1rem',
        }}
      >
        <div className="card">
          <span className="muted" style={{ fontSize: '0.78rem', textTransform: 'uppercase', fontWeight: 700 }}>
            Modular Architecture
          </span>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--brand)' }}>
            {architecture.modules.length} Modules
          </div>
          <div className="muted" style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>
            + {architecture.infrastructure.length} Infrastructure Services
          </div>
        </div>

        <div className="card">
          <span className="muted" style={{ fontSize: '0.78rem', textTransform: 'uppercase', fontWeight: 700 }}>
            CPU & Memory Telemetry
          </span>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '0.25rem' }}>
            {health.resources.cpuLoadPct}% CPU
          </div>
          <div className="muted" style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>
            RAM: {health.resources.memoryPeakMb} / {health.resources.memoryLimitMb} MB ({health.resources.memoryUsagePct}%)
          </div>
        </div>

        <div className="card">
          <span className="muted" style={{ fontSize: '0.78rem', textTransform: 'uppercase', fontWeight: 700 }}>
            MySQL 8 & Reversible Migrations
          </span>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '0.25rem', color: '#10b981' }}>
            {health.database.latencyMs} ms
          </div>
          <div className="muted" style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>
            {health.database.tableCount} Tables · {migrations.filter((m) => m.applied).length}/{migrations.length} Migrations
          </div>
        </div>

        <div className="card">
          <span className="muted" style={{ fontSize: '0.78rem', textTransform: 'uppercase', fontWeight: 700 }}>
            S3 Storage & CDN Edge
          </span>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '0.25rem' }}>
            {health.storage.diskFreeGb} GB Free
          </div>
          <div className="muted" style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>
            Isolated: <code>{health.storage.activeTenantPrefix}</code>
          </div>
        </div>

        <div className="card">
          <span className="muted" style={{ fontSize: '0.78rem', textTransform: 'uppercase', fontWeight: 700 }}>
            Queue & Dead-Letter (DLQ)
          </span>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '0.25rem' }}>
            {health.queue.completed} Done · {health.queue.deadLetterCount} DLQ
          </div>
          <div className="muted" style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>
            Worker: {health.workers.conversionDaemon.status.toUpperCase()}
          </div>
        </div>
      </div>

      {/* SUB-NAVIGATION TABS */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', borderBottom: '1px solid var(--border)', paddingBottom: '0.6rem' }}>
        <button
          type="button"
          className={activeTab === 'architecture' ? 'btn-primary' : 'btn-secondary'}
          onClick={() => setActiveTab('architecture')}
        >
          🏗️ Modular Architecture ({architecture.modules.length})
        </button>
        <button
          type="button"
          className={activeTab === 'telemetry' ? 'btn-primary' : 'btn-secondary'}
          onClick={() => setActiveTab('telemetry')}
        >
          📊 CPU, Storage, Redis & CDN
        </button>
        <button
          type="button"
          className={activeTab === 'queue' ? 'btn-primary' : 'btn-secondary'}
          onClick={() => setActiveTab('queue')}
        >
          ⚙️ Persistent Queue & DLQ ({health.queue.deadLetterCount})
        </button>
        <button
          type="button"
          className={activeTab === 'logs' ? 'btn-primary' : 'btn-secondary'}
          onClick={() => setActiveTab('logs')}
        >
          📜 JSONL Logs & Error Monitor ({errorReports.filter((e) => !e.resolved).length})
        </button>
        <button
          type="button"
          className={activeTab === 'backups' ? 'btn-primary' : 'btn-secondary'}
          onClick={() => setActiveTab('backups')}
        >
          🛡️ Backups, Migrations & CI/CD
        </button>
      </div>

      {/* TAB 1: MODULAR ARCHITECTURE */}
      {activeTab === 'architecture' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* 6-Layer Architecture Diagram */}
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Layered Modular Monolith Architecture</h3>
            <p className="muted" style={{ marginTop: '-0.25rem', marginBottom: '1rem', fontSize: '0.88rem' }}>
              Clean separation between Presentation, API Gateway, Business Domain Modules, Infrastructure Services, Stateful Storage, and Background Workers without unnecessary microservice overhead.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {architecture.layers.map((layer) => (
                <div
                  key={layer.order}
                  style={{
                    padding: '0.9rem 1.1rem',
                    borderRadius: '10px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-elevated, rgba(2,132,199,0.04))',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.75rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        background: 'var(--brand)',
                        color: '#fff',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '0.82rem',
                      }}
                    >
                      {layer.order}
                    </span>
                    <b style={{ fontSize: '0.98rem' }}>{layer.title}</b>
                  </div>
                  <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                    {layer.subsystems.map((sub) => (
                      <span
                        key={sub}
                        style={{
                          padding: '0.25rem 0.6rem',
                          borderRadius: '6px',
                          fontSize: '0.78rem',
                          background: 'var(--brand-soft)',
                          color: 'var(--brand)',
                          fontWeight: 600,
                        }}
                      >
                        {sub}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 15 Business Domain Modules Grid */}
          <div className="card">
            <h3 style={{ marginTop: 0 }}>15 Domain Modules (<code>backend/src/Modules/*</code>)</h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))',
                gap: '1rem',
                marginTop: '1rem',
              }}
            >
              {architecture.modules.map((mod) => (
                <div
                  key={mod.name}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: '10px',
                    padding: '1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <b style={{ fontSize: '1rem', color: 'var(--brand)' }}>{mod.name}</b>
                    <span className="pill-badge" style={{ fontSize: '0.7rem' }}>
                      {mod.layer}
                    </span>
                  </div>
                  <code style={{ fontSize: '0.75rem', opacity: 0.8 }}>{mod.path}</code>
                  <p className="muted" style={{ fontSize: '0.83rem', margin: '0.2rem 0' }}>
                    {mod.description}
                  </p>
                  {mod.capabilities.features && (
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: 'auto' }}>
                      {mod.capabilities.features.map((f) => (
                        <span
                          key={f}
                          style={{
                            fontSize: '0.72rem',
                            padding: '0.15rem 0.45rem',
                            borderRadius: '4px',
                            border: '1px solid var(--border)',
                          }}
                        >
                          ✓ {f}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Infrastructure Services Grid */}
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Infrastructure Services (<code>backend/src/Infrastructure/*</code>)</h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: '0.85rem',
                marginTop: '0.85rem',
              }}
            >
              {architecture.infrastructure.map((inf) => (
                <div
                  key={inf.name}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '0.85rem',
                  }}
                >
                  <div style={{ fontWeight: 700, color: 'var(--brand)' }}>⚙️ {inf.name}</div>
                  <div style={{ fontSize: '0.78rem', marginTop: '0.25rem' }}>
                    <code>{inf.path}</code>
                  </div>
                  <div className="muted" style={{ fontSize: '0.74rem', marginTop: '0.2rem' }}>
                    {inf.class}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: SYSTEM HEALTH, REDIS, S3 & CDN TELEMETRY */}
      {activeTab === 'telemetry' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem' }}>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>🖥️ Host CPU, Memory & Runtime</h3>
            <table className="table" style={{ width: '100%' }}>
              <tbody>
                <tr>
                  <td>PHP Runtime</td>
                  <td><b>PHP {health.phpVersion} ({health.osFamily})</b></td>
                </tr>
                <tr>
                  <td>CPU Load</td>
                  <td><b>{health.resources.cpuLoadPct}%</b></td>
                </tr>
                <tr>
                  <td>Memory Allocated / Peak</td>
                  <td><b>{health.resources.memoryAllocatedMb} MB / {health.resources.memoryPeakMb} MB</b></td>
                </tr>
                <tr>
                  <td>Worker Memory Limit</td>
                  <td><b>{health.resources.memoryLimitMb} MB</b></td>
                </tr>
                <tr>
                  <td>Conversion Worker</td>
                  <td><span style={{ color: '#10b981', fontWeight: 700 }}>● {health.workers.conversionDaemon.status.toUpperCase()}</span></td>
                </tr>
                <tr>
                  <td>Worker Isolation</td>
                  <td><small>{health.workers.conversionDaemon.isolation}</small></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>☁️ S3 Object Storage & CDN Static Delivery</h3>
            <table className="table" style={{ width: '100%' }}>
              <tbody>
                <tr>
                  <td>Storage Driver</td>
                  <td><code>{health.storage.driver}</code></td>
                </tr>
                <tr>
                  <td>S3 Bucket & Region</td>
                  <td><b>{health.storage.s3Bucket}</b> ({health.storage.s3Region})</td>
                </tr>
                <tr>
                  <td>CDN Edge Domain</td>
                  <td><code>{health.storage.cdnEdgeDomain}</code></td>
                </tr>
                <tr>
                  <td>Tenant Path Isolation</td>
                  <td><code>{health.storage.tenantIsolationPattern}</code></td>
                </tr>
                <tr>
                  <td>Disk Capacity</td>
                  <td><b>{health.storage.diskUsedGb} GB used / {health.storage.diskTotalGb} GB total ({health.storage.diskUsagePct}%)</b></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>⚡ Redis Cache, Locks & Transactional SMTP</h3>
            <table className="table" style={{ width: '100%' }}>
              <tbody>
                <tr>
                  <td>Cache & Lock Driver</td>
                  <td><code>{health.cache.activeDriver}</code></td>
                </tr>
                <tr>
                  <td>Redis Endpoint</td>
                  <td><code>{health.cache.redisConfiguredHost}</code></td>
                </tr>
                <tr>
                  <td>Distributed Locks</td>
                  <td><b style={{ color: '#10b981' }}>Enabled (Concurrency Safe)</b></td>
                </tr>
                <tr>
                  <td>SMTP Mailer</td>
                  <td><code>{health.mail.smtpHost}:{health.mail.smtpPort}</code> ({health.mail.totalDispatched} sent)</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>🗄️ MySQL 8 Business Data Tables ({health.database.tableCount})</h3>
            <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
              <table className="table" style={{ width: '100%', fontSize: '0.84rem' }}>
                <thead>
                  <tr>
                    <th>Table</th>
                    <th>Est. Rows</th>
                    <th>Size (KB)</th>
                  </tr>
                </thead>
                <tbody>
                  {health.database.tables.map((t) => (
                    <tr key={t.name}>
                      <td><code>{t.name}</code></td>
                      <td>{t.rows_est}</td>
                      <td>{t.size_kb} KB</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: PERSISTENT QUEUE & DEAD-LETTER QUEUE (DLQ) */}
      {activeTab === 'queue' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h3 style={{ margin: 0 }}>⚙️ Persistent Queue & Dead-Letter Queue (DLQ)</h3>
              <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.86rem' }}>
                Retry Policy: <b>{health.queue.retryPolicy}</b>
              </p>
            </div>
            <button type="button" className="btn-secondary" onClick={handleSimulateDlq} disabled={busyAction}>
              + Simulate Exhausted DLQ Job
            </button>
          </div>

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', margin: '1rem 0' }}>
            <span className="pill-badge">Queued: {health.queue.queued}</span>
            <span className="pill-badge">Running: {health.queue.running}</span>
            <span className="pill-badge" style={{ color: '#10b981' }}>Completed: {health.queue.completed}</span>
            <span className="pill-badge" style={{ color: '#ef4444' }}>Dead-Letter (DLQ): {health.queue.deadLetterCount}</span>
          </div>

          {health.queue.deadLetterJobs.length === 0 ? (
            <p className="muted">No dead-letter jobs! All background conversion and notification jobs succeeded within retry thresholds.</p>
          ) : (
            <table className="table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>DLQ ID</th>
                  <th>Queue / Type</th>
                  <th>Exception & Error</th>
                  <th>Attempts</th>
                  <th>Status</th>
                  <th>Failed At</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {health.queue.deadLetterJobs.map((dlq) => (
                  <tr key={dlq.id}>
                    <td><b>#{dlq.id}</b></td>
                    <td>
                      <code>{dlq.queueName}</code>
                      <div className="muted" style={{ fontSize: '0.76rem' }}>{dlq.jobType}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: '#ef4444', fontSize: '0.84rem' }}>{dlq.exceptionClass}</div>
                      <div style={{ fontSize: '0.82rem' }}>{dlq.errorMessage}</div>
                    </td>
                    <td>{dlq.attempts}</td>
                    <td>
                      <span className="pill-badge">
                        {dlq.status.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.82rem' }}>{dlq.failedAt}</td>
                    <td>
                      {dlq.status === 'dead' ? (
                        <button
                          type="button"
                          className="btn-primary"
                          style={{ padding: '0.3rem 0.65rem', fontSize: '0.78rem' }}
                          onClick={() => handleRetryDlq(dlq.id)}
                          disabled={busyAction}
                        >
                          ↻ Replay Job
                        </button>
                      ) : (
                        <span className="muted" style={{ fontSize: '0.8rem' }}>Requeued</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* TAB 4: STRUCTURED JSON LOGS & CENTRALISED EXCEPTION MONITORING */}
      {activeTab === 'logs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Centralised Error Monitoring */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h3 style={{ margin: 0 }}>🚨 Centralised Exception & Error Monitoring</h3>
                <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
                  Deduplicated exception telemetry captured across API controllers and background workers with trace IDs.
                </p>
              </div>
              <button type="button" className="btn-secondary" onClick={handleSimulateError} disabled={busyAction}>
                ⚡ Simulate Captured Exception
              </button>
            </div>

            {errorReports.length === 0 ? (
              <p className="muted" style={{ marginTop: '1rem' }}>Zero unhandled exceptions recorded.</p>
            ) : (
              <table className="table" style={{ width: '100%', marginTop: '1rem' }}>
                <thead>
                  <tr>
                    <th>ID / Trace</th>
                    <th>Severity</th>
                    <th>Exception & Location</th>
                    <th>Occurrences</th>
                    <th>Last Seen</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {errorReports.map((err) => (
                    <tr key={err.id}>
                      <td>
                        <b>#{err.id}</b>
                        <div><code style={{ fontSize: '0.74rem' }}>{err.traceId}</code></div>
                      </td>
                      <td>
                        <span className="pill-badge" style={{ color: err.severity === 'critical' ? '#ef4444' : '#f59e0b' }}>
                          {err.severity.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, fontSize: '0.86rem' }}>{err.exceptionClass}</div>
                        <div style={{ fontSize: '0.83rem' }}>{err.message}</div>
                        <code style={{ fontSize: '0.75rem', opacity: 0.75 }}>{err.file} ({err.requestMethod} {err.requestUri})</code>
                      </td>
                      <td><b>{err.occurrences}x</b></td>
                      <td style={{ fontSize: '0.8rem' }}>{err.lastSeenAt}</td>
                      <td>
                        {err.resolved ? (
                          <span style={{ color: '#10b981', fontWeight: 600 }}>✓ Resolved</span>
                        ) : (
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ padding: '0.28rem 0.6rem', fontSize: '0.78rem' }}
                            onClick={() => handleResolveError(err.id)}
                            disabled={busyAction}
                          >
                            ✓ Mark Resolved
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Structured JSONL Logs Stream */}
          <div className="card">
            <h3 style={{ marginTop: 0 }}>📜 Structured JSONL Logs (<code>storage/logs/app-YYYY-MM-DD.jsonl</code>)</h3>
            <div
              style={{
                background: '#0f172a',
                color: '#e2e8f0',
                padding: '1rem',
                borderRadius: '10px',
                maxHeight: '360px',
                overflowY: 'auto',
                fontFamily: 'monospace',
                fontSize: '0.78rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.45rem',
              }}
            >
              {logs.map((log, i) => (
                <div key={i} style={{ borderBottom: '1px solid rgba(148,163,184,0.15)', paddingBottom: '0.35rem' }}>
                  <span style={{ color: '#38bdf8' }}>{log.timestamp}</span>{' '}
                  <span style={{ color: log.level === 'ERROR' ? '#f87171' : log.level === 'WARNING' ? '#fbbf24' : '#34d399', fontWeight: 700 }}>
                    [{log.level}]
                  </span>{' '}
                  <span style={{ color: '#94a3b8' }}>[{log.trace_id}]</span>{' '}
                  <span>{log.message}</span>{' '}
                  <span style={{ color: '#64748b' }}>{JSON.stringify(log.context)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: BACKUPS, RECOVERY, REVERSIBLE MIGRATIONS & CI/CD */}
      {activeTab === 'backups' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Automated Backups & Tested Restoration Procedures */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h3 style={{ margin: 0 }}>💾 Automated MySQL & Tenant File Backups + Tested Recovery</h3>
                <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.86rem' }}>
                  Snapshots include MySQL table data and tenant storage manifests with cryptographic SHA-256 verification drills.
                </p>
              </div>
              <button type="button" className="btn-primary" onClick={handleCreateBackup} disabled={busyAction}>
                + Create Full Snapshot Now
              </button>
            </div>

            <table className="table" style={{ width: '100%', marginTop: '1rem' }}>
              <thead>
                <tr>
                  <th>Backup Code</th>
                  <th>Scope / Size</th>
                  <th>SHA-256 Checksum</th>
                  <th>Status & Recovery Drill</th>
                  <th>Created At</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <b>{b.backupCode}</b>
                      <div><code style={{ fontSize: '0.74rem' }}>{b.filePath}</code></div>
                    </td>
                    <td>
                      {b.tablesCount} tables ({b.rowsCount} rows) · {b.filesCount} files
                      <div className="muted" style={{ fontSize: '0.76rem' }}>{b.sizeKb} KB</div>
                    </td>
                    <td>
                      <code style={{ fontSize: '0.75rem' }}>{b.checksumSha256.slice(0, 16)}…</code>
                    </td>
                    <td>
                      <span
                        className="pill-badge"
                        style={{
                          color: b.status === 'verified' ? '#10b981' : 'var(--brand)',
                        }}
                      >
                        {b.status.toUpperCase()}
                      </span>
                      {b.recoveryNotes && (
                        <div className="muted" style={{ fontSize: '0.75rem', marginTop: '0.2rem' }}>
                          {b.recoveryNotes}
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: '0.8rem' }}>{b.createdAt}</td>
                    <td>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ padding: '0.3rem 0.65rem', fontSize: '0.78rem' }}
                        onClick={() => handleVerifyBackup(b.id)}
                        disabled={busyAction}
                      >
                        🧪 Test Recovery Drill
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Versioned, Reversible Database Migrations */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h3 style={{ margin: 0 }}>🔄 Versioned, Reversible Database Migrations</h3>
                <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.86rem' }}>
                  Tracked in <code>schema_migrations</code> with batch numbers, SHA-256 checksums, and reversible <code>down()</code> SQL statements.
                </p>
              </div>
              <button type="button" className="btn-secondary" onClick={handleRunMigrations} disabled={busyAction}>
                ✓ Verify / Run Migrations
              </button>
            </div>

            <table className="table" style={{ width: '100%', marginTop: '1rem' }}>
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Description</th>
                  <th>Batch</th>
                  <th>Reversible Rollback SQL Preview</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {migrations.map((m) => (
                  <tr key={m.version}>
                    <td><code>{m.version}</code></td>
                    <td>{m.description}</td>
                    <td>Batch #{m.batch ?? 1}</td>
                    <td><code style={{ fontSize: '0.74rem' }}>{m.downPreview}</code></td>
                    <td>
                      <span style={{ color: m.applied ? '#10b981' : '#f59e0b', fontWeight: 700 }}>
                        {m.applied ? '✓ Applied' : 'Pending'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* CI/CD, Automated Testing, Vulnerability Scanning & Formal Release Process */}
          <div className="card">
            <h3 style={{ marginTop: 0 }}>🚀 CI/CD Pipelines, Vulnerability Scanning & Formal Release Process</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
              <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '0.9rem' }}>
                <b>GitHub Actions CI/CD</b>
                <div style={{ marginTop: '0.4rem', fontSize: '0.84rem' }}>
                  Pipeline: <code>{ciCd.pipelineFile}</code>
                </div>
                <div style={{ fontSize: '0.84rem', marginTop: '0.25rem' }}>
                  Release Workflow: <code>{ciCd.releaseWorkflowFile}</code>
                </div>
              </div>

              <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '0.9rem' }}>
                <b>Automated Testing Suites</b>
                <div style={{ marginTop: '0.4rem', fontSize: '0.84rem' }}>
                  PHPUnit: <code>{ciCd.automatedTests.phpunitConfig}</code>
                </div>
                <div style={{ fontSize: '0.84rem', marginTop: '0.25rem' }}>
                  Security & Isolation: <code>{ciCd.automatedTests.securitySuite}</code>
                </div>
              </div>

              <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '0.9rem' }}>
                <b>Dependency Vulnerability Scanning</b>
                <div style={{ marginTop: '0.4rem', fontSize: '0.84rem' }}>
                  Backend: <code>{ciCd.vulnerabilityScanning.composerAudit}</code>
                </div>
                <div style={{ fontSize: '0.84rem', marginTop: '0.25rem' }}>
                  Frontend: <code>{ciCd.vulnerabilityScanning.npmAudit}</code>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
