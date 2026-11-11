import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getAccessToken } from '../api/client';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';

interface ApiKeyItem {
  id: number;
  name: string;
  keyPrefix: string;
  scopes: string[];
  allowedIps?: string | null;
  dailyQuota?: number | null;
  usageToday?: number;
  rotatedFromId?: number | null;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  expiresAt: string | null;
  createdAt: string;
}

const ALL_API_SCOPES = [
  'flipbooks:read',
  'flipbooks:write',
  'erp:publish',
  'analytics:read',
  'webhooks:manage',
  'billing:manage',
];

interface WebhookItem {
  id: number;
  name: string;
  targetUrl: string;
  secretToken: string;
  events: string[];
  isActive: boolean;
  lastTriggeredAt: string | null;
  lastStatusCode: number | null;
  createdAt: string;
}

interface WebhookDelivery {
  id: number;
  webhookId: number;
  webhookName: string;
  targetUrl: string;
  eventName: string;
  responseCode: number;
  durationMs: number;
  payload: any;
  createdAt: string;
}

interface ConnectorConfig {
  connectorType: string;
  providerName: string;
  isEnabled: boolean;
  syncStatus: string;
  lastSyncAt: string | null;
  config: Record<string, any>;
}

const ALL_WEBHOOK_EVENTS = [
  'flipbook.uploaded',
  'flipbook.converted',
  'flipbook.published',
  'erp.catalogue_published',
  'invoice.generated',
  'subscription.changed',
];

export default function IntegrationsHub() {
  const [activeTab, setActiveTab] = useState<'api_erp' | 'webhooks' | 'connectors' | 'wordpress'>('api_erp');

  // API Keys state
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [newKeyName, setNewKeyName] = useState('SAP / Odoo ERP Catalogue Sync Key');
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>([
    'flipbooks:read',
    'flipbooks:write',
    'erp:publish',
    'analytics:read',
  ]);
  const [newKeyAllowedIps, setNewKeyAllowedIps] = useState('');
  const [newKeyDailyQuota, setNewKeyDailyQuota] = useState('');
  const [createdRawKey, setCreatedRawKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  // ERP Catalogue API Simulator state
  const [erpTitle, setErpTitle] = useState('Q4 2026 Hardware & Solar Equipment Catalogue');
  const [erpAutoPublish, setErpAutoPublish] = useState(true);
  const [erpProductsJson, setErpProductsJson] = useState(
    JSON.stringify(
      [
        {
          sku: 'SOL-INV-5KW',
          name: 'Hybrid Solar Inverter 5kW',
          price: 'FJD 1,850.00',
          page: 1,
          x: 14,
          y: 22,
          w: 28,
          h: 14,
          url: 'https://shop.nuvistechnologies.com.fj/products/SOL-INV-5KW',
        },
        {
          sku: 'BAT-LFP-10K',
          name: 'Lithium Iron Phosphate Battery 10kWh',
          price: 'FJD 3,490.00',
          page: 1,
          x: 52,
          y: 22,
          w: 30,
          h: 14,
          url: 'https://shop.nuvistechnologies.com.fj/products/BAT-LFP-10K',
        },
        {
          sku: 'PNL-MONO-550',
          name: 'Monocrystalline Solar Panel 550W',
          price: 'FJD 365.00',
          page: 2,
          x: 20,
          y: 35,
          w: 32,
          h: 15,
          url: 'https://shop.nuvistechnologies.com.fj/products/PNL-MONO-550',
        },
      ],
      null,
      2
    )
  );
  const [erpBusy, setErpBusy] = useState(false);
  const [erpResult, setErpResult] = useState<{
    flipbookId: number;
    title: string;
    slug: string;
    skuHotspotsCreated: number;
    publicUrl: string;
    wordpressShortcode: string;
  } | null>(null);

  // Webhooks state
  const [webhooks, setWebhooks] = useState<WebhookItem[]>([]);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [whName, setWhName] = useState('ERP & CRM Event Listener');
  const [whUrl, setWhUrl] = useState('https://hooks.enterprise.local/flipex-events');
  const [whEvents, setWhEvents] = useState<string[]>([
    'flipbook.converted',
    'flipbook.published',
    'erp.catalogue_published',
    'invoice.generated',
  ]);

  // Enterprise Connectors state
  const [connectors, setConnectors] = useState<Record<string, ConnectorConfig>>({});
  const [connectorMsg, setConnectorMsg] = useState('');

  // WordPress Shortcode builder state
  const [wpSlug, setWpSlug] = useState('newsletter-1-term-3-2026');
  const [wpWidth, setWpWidth] = useState('100%');
  const [wpHeight, setWpHeight] = useState('680px');
  const [copiedWp, setCopiedWp] = useState(false);

  const loadApiKeys = useCallback(() => {
    api<ApiKeyItem[]>('/integrations/api-keys').then(setApiKeys).catch(() => {});
  }, []);

  const loadWebhooks = useCallback(() => {
    api<{ webhooks: WebhookItem[]; deliveries: WebhookDelivery[] }>('/integrations/webhooks')
      .then((d) => {
        setWebhooks(d.webhooks || []);
        setDeliveries(d.deliveries || []);
      })
      .catch(() => {});
  }, []);

  const loadConnectors = useCallback(() => {
    api<Record<string, ConnectorConfig>>('/integrations/connectors').then(setConnectors).catch(() => {});
  }, []);

  useEffect(() => {
    loadApiKeys();
    loadWebhooks();
    loadConnectors();
    api<Array<{ slug: string }>>('/flipbooks')
      .then((list) => {
        if (Array.isArray(list) && list.length > 0) {
          setWpSlug(list[0].slug);
        }
      })
      .catch(() => {});
  }, [loadApiKeys, loadWebhooks, loadConnectors]);

  const handleCreateApiKey = async () => {
    if (!newKeyName.trim() || newKeyScopes.length === 0) return;
    const res = await api<{ rawKey: string }>('/integrations/api-keys', 'POST', {
      name: newKeyName.trim(),
      scopes: newKeyScopes,
      allowedIps: newKeyAllowedIps.trim() || null,
      dailyQuota: newKeyDailyQuota.trim() ? Number(newKeyDailyQuota) : null,
      expiresInDays: 365,
    });
    setCreatedRawKey(res.rawKey);
    setNewKeyName('');
    setNewKeyAllowedIps('');
    setNewKeyDailyQuota('');
    loadApiKeys();
  };

  const handleRotateKey = async (id: number) => {
    if (!confirm('Rotate this API key now? A new key will be generated with the same scopes and the old key will be revoked immediately.')) return;
    const res = await api<{ rawKey: string }>(`/integrations/api-keys/${id}/rotate`, 'POST');
    setCreatedRawKey(res.rawKey);
    loadApiKeys();
  };

  const handleRevokeKey = async (id: number) => {
    if (!confirm('Revoke this API key immediately? Any ERP/CRM integrations using it will stop working.')) return;
    await api(`/integrations/api-keys/${id}`, 'DELETE');
    loadApiKeys();
  };

  const handleRunErpPublish = async () => {
    setErpBusy(true);
    setErpResult(null);
    try {
      let parsedProducts = [];
      try {
        parsedProducts = JSON.parse(erpProductsJson);
      } catch {
        alert('Invalid JSON in ERP Products array');
        setErpBusy(false);
        return;
      }
      const res = await api<any>('/integrations/erp/publish-catalogue', 'POST', {
        title: erpTitle,
        autoPublish: erpAutoPublish,
        products: parsedProducts,
      });
      setErpResult(res);
      loadWebhooks();
    } catch (e: any) {
      alert(e.message || 'Failed to publish ERP catalogue');
    } finally {
      setErpBusy(false);
    }
  };

  const handleCreateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!whUrl.trim()) return;
    await api('/integrations/webhooks', 'POST', {
      name: whName.trim() || 'Webhook Endpoint',
      targetUrl: whUrl.trim(),
      events: whEvents,
    });
    loadWebhooks();
  };

  const handleTestWebhook = async (id: number) => {
    await api(`/integrations/webhooks/${id}/test`, 'POST');
    loadWebhooks();
  };

  const handleDeleteWebhook = async (id: number) => {
    await api(`/integrations/webhooks/${id}`, 'DELETE');
    loadWebhooks();
  };

  const handleToggleConnector = async (type: string, current: ConnectorConfig) => {
    await api(`/integrations/connectors/${type}`, 'PUT', {
      providerName: current.providerName,
      isEnabled: !current.isEnabled,
      config: current.config,
    });
    loadConnectors();
  };

  const handleTestConnector = async (type: string) => {
    const res = await api<{ message: string }>(`/integrations/connectors/${type}/test`, 'POST');
    setConnectorMsg(res.message);
    loadConnectors();
    setTimeout(() => setConnectorMsg(''), 5000);
  };

  const handleDownloadWpPlugin = async () => {
    const res = await fetch('/api/v1/integrations/wordpress-plugin', {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nuvis-flipex-wordpress.php';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const wpShortcode = `[nuvis_flipex slug="${wpSlug}" width="${wpWidth}" height="${wpHeight}"]`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="row head" style={{ flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ margin: '0 0 4px 0' }}>🔌 Enterprise Integrations Hub</h1>
          <p className="muted" style={{ margin: 0 }}>
            REST API · Automated ERP Catalogue Publishing · Signed Webhooks · Corporate SSO · LDAP/AD · WordPress & CRM
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="golden">SHA-256 Scoped API Keys</Badge>
          <Badge variant="success">HMAC-SHA256 Webhooks</Badge>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="admin-tabs">
        <button
          type="button"
          className={`admin-tab ${activeTab === 'api_erp' ? 'active' : ''}`}
          onClick={() => setActiveTab('api_erp')}
        >
          🔑 REST API & ERP Catalogue Push
        </button>
        <button
          type="button"
          className={`admin-tab ${activeTab === 'webhooks' ? 'active' : ''}`}
          onClick={() => setActiveTab('webhooks')}
        >
          🪝 Webhooks ({webhooks.length})
        </button>
        <button
          type="button"
          className={`admin-tab ${activeTab === 'connectors' ? 'active' : ''}`}
          onClick={() => setActiveTab('connectors')}
        >
          🏢 SSO, LDAP/AD, CRM & Cloud Storage
        </button>
        <button
          type="button"
          className={`admin-tab ${activeTab === 'wordpress' ? 'active' : ''}`}
          onClick={() => setActiveTab('wordpress')}
        >
          🌐 WordPress & oEmbed
        </button>
      </div>

      {/* TAB 1: REST API KEYS & AUTOMATED ERP CATALOGUE PUBLISHING */}
      {activeTab === 'api_erp' && (
        <div className="space-y-6">
          {/* API Keys Card */}
          <div className="card space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 style={{ margin: 0 }}>🔑 Tenant-Scoped REST API Keys (SHA-256 Hashed)</h3>
                <p className="text-xs text-slate-500" style={{ margin: '2px 0 0 0' }}>
                  Authenticate external ERP systems, DAM pipelines, and custom scripts using `X-API-Key: nvf_live_...` or `Authorization: Bearer nvf_live_...`.
                </p>
              </div>
            </div>

            {createdRawKey && (
              <div className="pw-alert pw-alert-ok space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <b>✅ New API Key Generated — Copy it now (shown only once):</b>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      navigator.clipboard?.writeText(createdRawKey);
                      setCopiedKey(true);
                      setTimeout(() => setCopiedKey(false), 2500);
                    }}
                  >
                    {copiedKey ? '✓ Copied Key' : 'Copy API Key'}
                  </Button>
                </div>
                <code className="block p-2 rounded bg-slate-950 text-amber-400 text-xs font-mono">
                  {createdRawKey}
                </code>
              </div>
            )}

            <div className="space-y-3 border rounded-xl p-3 bg-slate-50/40">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <input
                  className="boardui-input"
                  placeholder="Key description (e.g. SAP Catalogue Sync)…"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                />
                <input
                  className="boardui-input"
                  placeholder="Optional IP/CIDR allowlist (e.g. 203.0.113.5, 10.0.0.0/8)"
                  value={newKeyAllowedIps}
                  onChange={(e) => setNewKeyAllowedIps(e.target.value)}
                />
                <input
                  type="number"
                  min={1}
                  className="boardui-input"
                  placeholder="Optional daily quota (e.g. 5000 req/day)"
                  value={newKeyDailyQuota}
                  onChange={(e) => setNewKeyDailyQuota(e.target.value)}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <b className="text-slate-600">Explicit API Scopes:</b>
                  {ALL_API_SCOPES.map((sc) => {
                    const checked = newKeyScopes.includes(sc);
                    return (
                      <label key={sc} className="inline-flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setNewKeyScopes((prev) =>
                              checked ? prev.filter((x) => x !== sc) : [...prev, sc]
                            )
                          }
                        />
                        <code>{sc}</code>
                      </label>
                    );
                  })}
                </div>
                <Button variant="primary" onClick={handleCreateApiKey}>
                  + Generate Scoped API Key
                </Button>
              </div>
            </div>

            <table className="activity-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Key Prefix</th>
                  <th>Enforced Scopes</th>
                  <th>Quota / IP Controls</th>
                  <th>Last Used</th>
                  <th>Expires</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {apiKeys.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center text-slate-400 py-4">
                      No active API keys yet. Generate one above to connect your ERP or external system.
                    </td>
                  </tr>
                ) : (
                  apiKeys.map((k) => (
                    <tr key={k.id}>
                      <td><b>{k.name}</b></td>
                      <td><code>{k.keyPrefix}</code></td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {k.scopes.map((s) => (
                            <Badge key={s} variant="default">{s}</Badge>
                          ))}
                        </div>
                      </td>
                      <td className="text-xs">
                        <div>
                          Quota: <b>{k.dailyQuota ? `${k.usageToday || 0}/${k.dailyQuota} day` : 'Unlimited'}</b>
                        </div>
                        <div className="text-slate-500">
                          IPs: <code>{k.allowedIps || 'Any (*)'}</code>
                        </div>
                      </td>
                      <td>{k.lastUsedAt ? `${k.lastUsedAt} (${k.lastUsedIp || 'API'})` : 'Never'}</td>
                      <td>{k.expiresAt ? k.expiresAt.slice(0, 10) : 'Never'}</td>
                      <td>
                        <div className="flex flex-wrap gap-1.5">
                          <button className="action-pill preview" onClick={() => handleRotateKey(k.id)}>
                            🔄 Rotate
                          </button>
                          <button className="action-pill delete" onClick={() => handleRevokeKey(k.id)}>
                            Revoke
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Automated ERP Product Catalogue Publishing Simulator & Docs */}
          <div className="card space-y-4">
            <div>
              <h3 style={{ margin: 0 }}>📦 Automated ERP Product Catalogue Publisher (`POST /api/v1/integrations/erp/publish-catalogue`)</h3>
              <p className="text-xs text-slate-500" style={{ margin: '4px 0 0 0' }}>
                Publish a product catalogue directly from your ERP system (SAP, Oracle NetSuite, Odoo, Dynamics 365) via REST API. Flipex automatically creates the flipbook and places interactive product SKU & pricing hotspots on the target pages!
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-3">
                <div>
                  <label className="pw-label">Catalogue Title</label>
                  <input
                    className="boardui-input"
                    value={erpTitle}
                    onChange={(e) => setErpTitle(e.target.value)}
                  />
                </div>
                <div>
                  <label className="pw-label">ERP Product SKU & Coordinate Payload (JSON)</label>
                  <textarea
                    rows={10}
                    className="boardui-textarea font-mono text-xs"
                    value={erpProductsJson}
                    onChange={(e) => setErpProductsJson(e.target.value)}
                  />
                </div>
                <label className="pw-session-revoke-label">
                  <input
                    type="checkbox"
                    checked={erpAutoPublish}
                    onChange={(e) => setErpAutoPublish(e.target.checked)}
                  />
                  <span>Auto-publish catalogue immediately and trigger `erp.catalogue_published` webhooks</span>
                </label>
                <Button variant="primary" disabled={erpBusy} onClick={handleRunErpPublish}>
                  {erpBusy ? 'Publishing ERP Catalogue…' : '🚀 Simulate ERP API Catalogue Push'}
                </Button>
              </div>

              <div className="space-y-3">
                <label className="pw-label">cURL Integration Example for Your ERP Server</label>
                <pre
                  style={{
                    background: '#0f172a',
                    color: '#e2e8f0',
                    padding: '14px',
                    borderRadius: '10px',
                    fontSize: '11px',
                    overflowX: 'auto',
                    lineHeight: 1.5,
                    margin: 0,
                  }}
                >
{`curl -X POST "${window.location.origin}/api/v1/integrations/erp/publish-catalogue" \\
  -H "X-API-Key: ${createdRawKey || 'nvf_live_YOUR_API_KEY'}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "${erpTitle}",
    "autoPublish": true,
    "products": [
      {
        "sku": "SOL-INV-5KW",
        "name": "Hybrid Solar Inverter 5kW",
        "price": "FJD 1,850.00",
        "page": 1,
        "x": 14, "y": 22, "w": 28, "h": 14,
        "url": "https://shop.example.com/sku/SOL-INV-5KW"
      }
    ]
  }'`}
                </pre>

                {erpResult && (
                  <div className="pw-alert pw-alert-ok space-y-2">
                    <b>🎉 ERP Catalogue Published Automatedly!</b>
                    <div className="text-xs space-y-1">
                      <div>Publication: <b>{erpResult.title}</b> (#{erpResult.flipbookId})</div>
                      <div>Auto-Generated SKU Hotspots: <b>{erpResult.skuHotspotsCreated} interactive product tags</b></div>
                      <div>WordPress Shortcode: <code>{erpResult.wordpressShortcode}</code></div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Link to={`/dashboard/preview/${erpResult.flipbookId}`} className="action-pill preview">
                        Open Published Catalogue 👁️
                      </Link>
                      <Link to={`/dashboard/editor/${erpResult.flipbookId}`} className="action-pill editor">
                        Inspect SKU Hotspots 🔗
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: WEBHOOKS & EVENT NOTIFICATIONS */}
      {activeTab === 'webhooks' && (
        <div className="space-y-6">
          <div className="card space-y-4">
            <h3 style={{ margin: 0 }}>🪝 Register Outgoing Event Webhook</h3>
            <p className="text-xs text-slate-500" style={{ margin: 0 }}>
              Every webhook request is signed with an `X-Flipex-Signature: sha256=...` HMAC header using your endpoint's secret token.
            </p>

            <form onSubmit={handleCreateWebhook} className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="pw-label">Webhook Description</label>
                  <input
                    className="boardui-input"
                    value={whName}
                    onChange={(e) => setWhName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="pw-label">Target Endpoint URL (HTTPS)</label>
                  <input
                    className="boardui-input"
                    value={whUrl}
                    onChange={(e) => setWhUrl(e.target.value)}
                    placeholder="https://api.yourcompany.com/webhooks/flipex"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="pw-label mb-1 block">Subscribed Events</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_WEBHOOK_EVENTS.map((ev) => {
                    const checked = whEvents.includes(ev);
                    return (
                      <button
                        key={ev}
                        type="button"
                        onClick={() =>
                          setWhEvents((prev) =>
                            checked ? prev.filter((x) => x !== ev) : [...prev, ev]
                          )
                        }
                        className={`action-pill ${checked ? 'preview' : ''}`}
                      >
                        {checked ? '✓ ' : '+ '}
                        {ev}
                      </button>
                    );
                  })}
                </div>
              </div>

              <Button type="submit" variant="primary">
                + Add Webhook Endpoint
              </Button>
            </form>

            <table className="activity-table">
              <thead>
                <tr>
                  <th>Name & Target URL</th>
                  <th>Signing Secret</th>
                  <th>Subscribed Events</th>
                  <th>Last Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {webhooks.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center text-slate-400 py-4">
                      No webhooks configured yet.
                    </td>
                  </tr>
                ) : (
                  webhooks.map((w) => (
                    <tr key={w.id}>
                      <td>
                        <b>{w.name}</b>
                        <div className="text-xs text-slate-500">{w.targetUrl}</div>
                      </td>
                      <td><code>{w.secretToken.slice(0, 14)}…</code></td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {w.events.map((e) => (
                            <Badge key={e} variant="default">{e}</Badge>
                          ))}
                        </div>
                      </td>
                      <td>
                        {w.lastStatusCode ? (
                          <Badge variant={w.lastStatusCode < 300 ? 'success' : 'warning'}>
                            HTTP {w.lastStatusCode}
                          </Badge>
                        ) : (
                          <span className="text-xs text-slate-400">Not triggered</span>
                        )}
                      </td>
                      <td>
                        <div className="flex gap-1.5">
                          <button className="action-pill preview" onClick={() => handleTestWebhook(w.id)}>
                            ⚡ Test Ping
                          </button>
                          <button className="action-pill delete" onClick={() => handleDeleteWebhook(w.id)}>
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

          {/* Recent Webhook Deliveries */}
          <div className="card space-y-3">
            <h3 style={{ margin: 0 }}>📡 Recent Webhook Delivery Telemetry</h3>
            <table className="activity-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Webhook</th>
                  <th>Event</th>
                  <th>HTTP Status</th>
                  <th>Latency</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center text-slate-400 py-4">
                      No webhook deliveries logged yet. Click "⚡ Test Ping" above to test.
                    </td>
                  </tr>
                ) : (
                  deliveries.map((d) => (
                    <tr key={d.id}>
                      <td>{d.createdAt}</td>
                      <td><b>{d.webhookName}</b></td>
                      <td><code>{d.eventName}</code></td>
                      <td>
                        <Badge variant={d.responseCode < 300 ? 'success' : 'warning'}>
                          HTTP {d.responseCode}
                        </Badge>
                      </td>
                      <td>{d.durationMs} ms</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: ENTERPRISE CONNECTORS (SSO, LDAP/AD, ERP, CRM, CLOUD STORAGE, SMTP) */}
      {activeTab === 'connectors' && (
        <div className="space-y-4">
          {connectorMsg && <div className="pw-alert pw-alert-ok">✅ {connectorMsg}</div>}

          <div className="module-hub-grid">
            {Object.values(connectors).map((conn) => (
              <div key={conn.connectorType} className={`card space-y-3 ${conn.isEnabled ? 'border-amber-400' : ''}`}>
                <div className="flex items-center justify-between">
                  <Badge variant={conn.isEnabled ? 'success' : 'default'}>
                    {conn.connectorType.toUpperCase()}
                  </Badge>
                  <span className="text-xs text-slate-500">
                    {conn.isEnabled ? '● Active' : '○ Disabled'}
                  </span>
                </div>

                <h3 style={{ margin: 0, fontSize: '15px' }}>{conn.providerName}</h3>

                <div className="text-xs text-slate-500 space-y-1 bg-slate-50/60 p-2.5 rounded-lg border">
                  {Object.entries(conn.config || {}).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-2">
                      <span className="font-semibold">{k}:</span>
                      <span className="truncate">{String(v)}</span>
                    </div>
                  ))}
                </div>

                {conn.lastSyncAt && (
                  <div className="text-[11px] text-slate-400">
                    Last Verified: {conn.lastSyncAt}
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    variant={conn.isEnabled ? 'outline' : 'primary'}
                    onClick={() => handleToggleConnector(conn.connectorType, conn)}
                  >
                    {conn.isEnabled ? 'Disable' : 'Enable Connector'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleTestConnector(conn.connectorType)}
                  >
                    ⚡ Verify Handshake
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: WORDPRESS SHORTCODE, OEMBED & PLUGIN */}
      {activeTab === 'wordpress' && (
        <div className="card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 style={{ margin: 0 }}>🌐 WordPress Shortcode, Gutenberg oEmbed & Official Plugin</h3>
              <p className="text-xs text-slate-500" style={{ margin: '4px 0 0 0' }}>
                Embed interactive 3D flipbooks into any WordPress page, WooCommerce product description, or blog post.
              </p>
            </div>
            <Button variant="primary" onClick={handleDownloadWpPlugin}>
              ⬇️ Download WordPress Plugin (.php)
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="pw-label">Publication Slug</label>
              <input
                className="boardui-input"
                value={wpSlug}
                onChange={(e) => setWpSlug(e.target.value)}
              />
            </div>
            <div>
              <label className="pw-label">Embed Width</label>
              <input
                className="boardui-input"
                value={wpWidth}
                onChange={(e) => setWpWidth(e.target.value)}
              />
            </div>
            <div>
              <label className="pw-label">Embed Height</label>
              <input
                className="boardui-input"
                value={wpHeight}
                onChange={(e) => setWpHeight(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="pw-label">WordPress Shortcode</label>
            <div className="flex gap-2">
              <input className="boardui-input font-mono text-xs flex-1" readOnly value={wpShortcode} />
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard?.writeText(wpShortcode);
                  setCopiedWp(true);
                  setTimeout(() => setCopiedWp(false), 2000);
                }}
              >
                {copiedWp ? '✓ Copied' : 'Copy Shortcode'}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="pw-label">Live oEmbed Discovery Endpoint</label>
            <code className="block p-3 rounded-lg bg-slate-100 text-xs">
              {`${window.location.origin}/api/v1/oembed?url=${encodeURIComponent(`${window.location.origin}/v/${wpSlug}`)}`}
            </code>
          </div>
        </div>
      )}
    </div>
  );
}
