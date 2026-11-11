import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';

interface BillingOverviewResponse {
  permissions?: {
    canManageBilling: boolean;
    canReconcile: boolean;
    tenantRole: string;
    systemRole: string;
  };
  tenant: {
    id: number;
    name: string;
    slug: string;
    planId: number;
    planName: string;
    planPrice: number;
    billingName: string;
    billingEmail: string;
    billingAddress: string;
    taxId: string;
    currency: string;
    billingCycle: string;
    amount: number;
    taxRate: number;
    paymentMethod: string;
    paymentGateway: string;
    paymentStatus: string;
    paymentReference: string;
    lastPaymentDate: string | null;
    nextBillingDate: string | null;
    autoRenew: boolean;
    gracePeriodDays: number;
  };
  graceAndSuspension: {
    inGracePeriod: boolean;
    gracePeriodDays: number;
    daysUntilSuspension: number | null;
    isSuspended: boolean;
    suspendedAt: string | null;
    suspensionReason: string | null;
  };
  metering: {
    flipbooksUsed: number;
    maxFlipbooks: number;
    totalPagesConverted: number;
    storageUsedMb: number;
    maxStorageMb: number;
    storagePct: number;
    bandwidthUsedMb: number;
    includedBandwidthMb: number;
    bandwidthPct: number;
    monthlyViews: number;
    includedMonthlyViews: number;
    downloads30d: number;
    storageOverageMb: number;
    viewsOverage: number;
    estimatedUsageOverageCharge: number;
  };
  availablePlans: Array<{
    id: number;
    name: string;
    price: number;
    maxFlipbooks: number;
    maxPages: number;
    maxUploadMb: number;
    monthlyViews: number;
    removeBranding: boolean;
  }>;
  invoices: Array<{
    id: number;
    invoiceNumber: string;
    billingCycle: string;
    currency: string;
    subtotal: number;
    usageOverageAmount: number;
    taxRate: number;
    taxAmount: number;
    totalAmount: number;
    status: 'draft' | 'issued' | 'pending' | 'reconciling' | 'paid' | 'overdue' | 'reversed' | 'void';
    paymentMethod: string;
    paymentReference: string | null;
    bankName: string | null;
    lineItems: Array<{ description: string; quantity: number; unit_price: number; amount: number }>;
    periodStart: string;
    periodEnd: string;
    dueDate: string;
    paidAt: string | null;
    notes: string | null;
    createdAt: string;
  }>;
  history: Array<{
    id: number;
    fromPlanName: string | null;
    toPlanName: string | null;
    action: string;
    amount: number;
    currency: string;
    paymentMethod: string | null;
    reference: string | null;
    notes: string | null;
    createdAt: string;
  }>;
  transactions?: Array<{
    id: number;
    invoiceId: number;
    transactionUid: string;
    idempotencyKey: string;
    provider: string;
    paymentReference: string | null;
    bankName: string | null;
    amount: number;
    currency: string;
    status: 'pending' | 'reconciling' | 'succeeded' | 'failed' | 'reversed';
    webhookSignatureVerified: boolean;
    verifiedBy: number | null;
    verifiedAt: string | null;
    reversalReason: string | null;
    reversedAt: string | null;
    immutableHash: string;
    createdAt: string;
  }>;
  paymentAuditLogs?: Array<{
    id: number;
    invoiceId: number;
    transactionId: number | null;
    actorUserId: number | null;
    eventType: string;
    amount: number;
    currency: string;
    statusFrom: string | null;
    statusTo: string;
    prevHash: string;
    entryHash: string;
    createdAt: string;
  }>;
  fijiBankAccounts: Array<{
    bank: string;
    accountName: string;
    accountNumber: string;
    bsbOrSwift: string;
    branch: string;
  }>;
}

export default function BillingPortal() {
  const [data, setData] = useState<BillingOverviewResponse | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'plans' | 'invoices' | 'history'>('overview');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  // Billing Profile & Renewal Settings Form
  const [billingName, setBillingName] = useState('');
  const [billingEmail, setBillingEmail] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [taxId, setTaxId] = useState('');
  const [currency, setCurrency] = useState('FJD');
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [taxRate, setTaxRate] = useState(15);
  const [autoRenew, setAutoRenew] = useState(true);
  const [gracePeriodDays, setGracePeriodDays] = useState(7);
  const [paymentGateway, setPaymentGateway] = useState('bank_transfer_fiji');

  // Payment & Fiji Bank Transfer Reconciliation Modal
  const [payModalInvoice, setPayModalInvoice] = useState<BillingOverviewResponse['invoices'][0] | null>(null);
  const [payMethod, setPayMethod] = useState('bank_transfer_fiji');
  const [payBankName, setPayBankName] = useState('Bank of South Pacific (BSP) Fiji');
  const [payReference, setPayReference] = useState('');

  // Printable Tax Invoice View Modal
  const [viewInvoice, setViewInvoice] = useState<BillingOverviewResponse['invoices'][0] | null>(null);

  const load = useCallback(() => {
    api<BillingOverviewResponse>('/billing/overview')
      .then((d) => {
        setData(d);
        setBillingName(d.tenant.billingName);
        setBillingEmail(d.tenant.billingEmail);
        setBillingAddress(d.tenant.billingAddress);
        setTaxId(d.tenant.taxId);
        setCurrency(d.tenant.currency);
        setBillingCycle(d.tenant.billingCycle);
        setTaxRate(d.tenant.taxRate);
        setAutoRenew(d.tenant.autoRenew);
        setGracePeriodDays(d.tenant.gracePeriodDays);
        setPaymentGateway(d.tenant.paymentGateway);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const flash = (text: string) => {
    setMsg(text);
    setTimeout(() => setMsg(''), 4500);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/billing/settings', 'PATCH', {
        billingName,
        billingEmail,
        billingAddress,
        taxId,
        currency,
        billingCycle,
        taxRate,
        autoRenew,
        gracePeriodDays,
        paymentGateway,
      });
      flash('Billing profile, tax calculation rate, and auto-renewal settings saved.');
      load();
    } finally {
      setBusy(false);
    }
  };

  const handleChangePlan = async (planId: number) => {
    setBusy(true);
    try {
      const res = await api<{ message: string }>('/billing/change-plan', 'POST', {
        planId,
        billingCycle,
      });
      flash(res.message);
      load();
      setActiveTab('invoices');
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateInvoice = async () => {
    setBusy(true);
    try {
      const res = await api<{ invoiceNumber: string }>('/billing/invoices/generate', 'POST');
      flash(`Generated metered tax invoice ${res.invoiceNumber}!`);
      load();
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payModalInvoice) return;
    setBusy(true);
    try {
      const idempotencyKey = `idem_${payModalInvoice.id}_${Date.now()}`;
      const res = await api<{ message: string }>(`/billing/invoices/${payModalInvoice.id}/pay`, 'POST', {
        paymentMethod: payMethod,
        bankName: payBankName,
        paymentReference: payReference,
        idempotencyKey,
      });
      flash(res.message);
      setPayModalInvoice(null);
      setPayReference('');
      load();
    } finally {
      setBusy(false);
    }
  };

  const handleReconcileInvoice = async (invId: number) => {
    setBusy(true);
    try {
      const res = await api<{ message: string }>(`/billing/invoices/${invId}/reconcile`, 'POST', {
        decision: 'approve',
      });
      flash(res.message);
      load();
    } finally {
      setBusy(false);
    }
  };

  const handleReverseInvoice = async (invId: number) => {
    const reason = prompt('Enter payment reversal / refund reason for the immutable audit log:');
    if (!reason) return;
    setBusy(true);
    try {
      const res = await api<{ message: string }>(`/billing/invoices/${invId}/reverse`, 'POST', {
        reason,
      });
      flash(res.message);
      load();
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return <p className="center">Loading subscription, metering & billing portal…</p>;
  }

  const { tenant, graceAndSuspension, metering } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="row head" style={{ flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ margin: '0 0 4px 0' }}>💳 Commercial Billing & Subscription Management</h1>
          <p className="muted" style={{ margin: 0 }}>
            Multi-Currency (`FJD`, `USD`, `AUD`, `NZD`, `EUR`) · Tax Invoices · Usage Metering · Fiji Bank Reconciliation & Gateways
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="golden">{tenant.planName} Plan</Badge>
          <Badge variant={tenant.paymentStatus === 'paid' ? 'success' : 'warning'}>
            Status: {tenant.paymentStatus.toUpperCase()}
          </Badge>
          <Badge variant="default">
            {tenant.autoRenew ? '🔄 Auto-Renew ON' : '⏸️ Manual Renewal'}
          </Badge>
        </div>
      </div>

      {msg && <div className="pw-alert pw-alert-ok">✅ {msg}</div>}

      {/* Grace Period or Suspension Alert */}
      {(graceAndSuspension.inGracePeriod || graceAndSuspension.isSuspended) && (
        <div className="pw-alert pw-alert-err">
          {graceAndSuspension.isSuspended
            ? `🚨 Subscription Suspended: ${graceAndSuspension.suspensionReason || 'Overdue past grace period'}. Reconcile your open invoice below to reactivate immediately.`
            : `⚠️ Grace Period Active: Your subscription is past due. You have ${graceAndSuspension.daysUntilSuspension} day(s) remaining in your ${graceAndSuspension.gracePeriodDays}-day grace period before automatic suspension.`}
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="admin-tabs">
        <button
          type="button"
          className={`admin-tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          📊 Usage Metering & Billing Settings
        </button>
        <button
          type="button"
          className={`admin-tab ${activeTab === 'plans' ? 'active' : ''}`}
          onClick={() => setActiveTab('plans')}
        >
          🚀 Upgrade / Downgrade Plan
        </button>
        <button
          type="button"
          className={`admin-tab ${activeTab === 'invoices' ? 'active' : ''}`}
          onClick={() => setActiveTab('invoices')}
        >
          🧾 Tax Invoices & Reconciliation ({data.invoices.length})
        </button>
        <button
          type="button"
          className={`admin-tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          📜 Subscription History ({data.history.length})
        </button>
      </div>

      {/* TAB 1: USAGE METERING & BILLING SETTINGS */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* 4 Usage & Metering KPI Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div className="card stat-card">
              <span className="stat-label">Current Subscription</span>
              <b className="stat-value">
                {tenant.currency} {tenant.amount.toFixed(2)}
              </b>
              <span className="stat-hint">
                {tenant.planName} ({tenant.billingCycle}) · Next due: {tenant.nextBillingDate || 'Active'}
              </span>
            </div>

            <div className="card stat-card">
              <span className="stat-label">Isolated Tenant Storage</span>
              <b className="stat-value">
                {metering.storageUsedMb} <small style={{ fontSize: '14px' }}>/ {metering.maxStorageMb} MB</small>
              </b>
              <div className="progress-bg mt-1">
                <div className="progress-fill" style={{ width: `${Math.max(4, metering.storagePct)}%` }} />
              </div>
              <span className="stat-hint">{metering.totalPagesConverted} pages across {metering.flipbooksUsed} flipbooks</span>
            </div>

            <div className="card stat-card">
              <span className="stat-label">Bandwidth Metering (30d)</span>
              <b className="stat-value">
                {metering.bandwidthUsedMb} <small style={{ fontSize: '14px' }}>/ {metering.includedBandwidthMb} MB</small>
              </b>
              <div className="progress-bg mt-1">
                <div className="progress-fill" style={{ width: `${Math.max(4, metering.bandwidthPct)}%` }} />
              </div>
              <span className="stat-hint">{metering.monthlyViews} reader sessions · {metering.downloads30d} downloads</span>
            </div>

            <div className="card stat-card">
              <span className="stat-label">Usage-Based Overage</span>
              <b className="stat-value">
                {tenant.currency} {metering.estimatedUsageOverageCharge.toFixed(2)}
              </b>
              <span className="stat-hint">
                Tax Rate: {tenant.taxRate}% VAT/GST · Grace Period: {tenant.gracePeriodDays}d
              </span>
            </div>
          </div>

          {/* Billing Profile, Tax Rate, Auto-Renewal & Fiji Bank Details */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <form className="card space-y-3" onSubmit={handleSaveSettings}>
              <h3 style={{ margin: 0 }}>⚙️ Subscription, Tax & Auto-Renewal Configuration</h3>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="pw-label">Billing Organization Name</label>
                  <input
                    className="boardui-input"
                    value={billingName}
                    onChange={(e) => setBillingName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="pw-label">Billing Email</label>
                  <input
                    type="email"
                    className="boardui-input"
                    value={billingEmail}
                    onChange={(e) => setBillingEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="pw-label">TIN / VAT / Tax ID</label>
                  <input
                    className="boardui-input"
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value)}
                    placeholder="e.g. TIN-50-12345-0-0"
                  />
                </div>
                <div>
                  <label className="pw-label">Billing Address</label>
                  <input
                    className="boardui-input"
                    value={billingAddress}
                    onChange={(e) => setBillingAddress(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="pw-label">Currency</label>
                  <select
                    className="boardui-input"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                  >
                    <option value="FJD">FJD (Fiji Dollar)</option>
                    <option value="USD">USD (US Dollar)</option>
                    <option value="AUD">AUD (Australian Dollar)</option>
                    <option value="NZD">NZD (NZ Dollar)</option>
                    <option value="EUR">EUR (Euro)</option>
                  </select>
                </div>
                <div>
                  <label className="pw-label">Billing Cycle</label>
                  <select
                    className="boardui-input"
                    value={billingCycle}
                    onChange={(e) => setBillingCycle(e.target.value)}
                  >
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly (5% off)</option>
                    <option value="annually">Annually (2 months free)</option>
                  </select>
                </div>
                <div>
                  <label className="pw-label">Tax Rate (% VAT/GST)</label>
                  <input
                    type="number"
                    step="0.5"
                    className="boardui-input"
                    value={taxRate}
                    onChange={(e) => setTaxRate(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="pw-label">Preferred Payment Gateway</label>
                  <select
                    className="boardui-input"
                    value={paymentGateway}
                    onChange={(e) => setPaymentGateway(e.target.value)}
                  >
                    <option value="bank_transfer_fiji">🏦 Fiji Manual Bank Transfer (BSP / ANZ / Westpac)</option>
                    <option value="stripe_card">💳 Stripe Credit / Corporate Card</option>
                    <option value="mpaisa_fiji">📱 Vodafone M-PAiSA Fiji</option>
                    <option value="mycash_fiji">📱 Digicel MyCash Fiji</option>
                    <option value="paypal">🌐 PayPal International</option>
                  </select>
                </div>
                <div>
                  <label className="pw-label">Overdue Grace Period (Days)</label>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    className="boardui-input"
                    value={gracePeriodDays}
                    onChange={(e) => setGracePeriodDays(Number(e.target.value))}
                  />
                </div>
              </div>

              <label className="pw-session-revoke-label">
                <input
                  type="checkbox"
                  checked={autoRenew}
                  onChange={(e) => setAutoRenew(e.target.checked)}
                />
                <span>Enable automatic subscription renewal at the end of each billing cycle</span>
              </label>

              <Button type="submit" variant="primary" disabled={busy}>
                Save Billing & Tax Configuration
              </Button>
            </form>

            {/* Fiji Bank Transfer Instructions Card */}
            <div className="card space-y-3">
              <h3 style={{ margin: 0 }}>🇫🇯 Fiji Bank Transfer & Reconciliation Accounts</h3>
              <p className="text-xs text-slate-500" style={{ margin: 0 }}>
                For Fiji corporate and government customers paying by direct bank transfer, remit to any of our official FJD accounts below and submit your deposit reference on the Invoices tab.
              </p>

              <div className="space-y-2.5">
                {data.fijiBankAccounts.map((b) => (
                  <div key={b.bank} className="p-3 rounded-xl border bg-slate-50/60 text-xs space-y-1">
                    <div className="flex justify-between items-center">
                      <b className="text-slate-900">{b.bank}</b>
                      <Badge variant="golden">{b.bsbOrSwift}</Badge>
                    </div>
                    <div>Account Name: <b>{b.accountName}</b></div>
                    <div>Account Number: <code className="font-bold">{b.accountNumber}</code> · Branch: {b.branch}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: SUBSCRIPTION UPGRADE & DOWNGRADE */}
      {activeTab === 'plans' && (
        <div className="plans-grid">
          {data.availablePlans.map((p) => {
            const isCurrent = p.id === tenant.planId;
            const isUpgrade = p.price > tenant.planPrice;
            return (
              <div key={p.id} className={`plan-card ${isCurrent ? 'featured' : ''}`}>
                {isCurrent && <div className="plan-badge-top">★ Current Active Plan</div>}
                <h3 className="plan-name">{p.name}</h3>
                <div className="plan-price">
                  <span className="price-num">
                    {tenant.currency} {p.price.toFixed(2)}
                  </span>
                  <span className="price-period">/ month + {tenant.taxRate}% VAT</span>
                </div>
                <div className="plan-features">
                  <div className="feature-item">
                    <span>Max Publications</span>
                    <b>{p.maxFlipbooks} flipbooks</b>
                  </div>
                  <div className="feature-item">
                    <span>Max Pages per PDF</span>
                    <b>{p.maxPages} pages</b>
                  </div>
                  <div className="feature-item">
                    <span>Max PDF Upload Size</span>
                    <b>{p.maxUploadMb} MB</b>
                  </div>
                  <div className="feature-item">
                    <span>Included Monthly Views</span>
                    <b>{p.monthlyViews.toLocaleString()} views</b>
                  </div>
                  <div className="feature-item">
                    <span>Custom White-Label Branding</span>
                    <b>{p.removeBranding ? '✓ Included' : 'Standard'}</b>
                  </div>
                </div>
                <div style={{ marginTop: '16px' }}>
                  {isCurrent ? (
                    <button className="btn-secondary w-full" disabled>
                      ✓ Active Workspace Plan
                    </button>
                  ) : (
                    <button
                      className="btn-primary w-full"
                      disabled={busy}
                      onClick={() => handleChangePlan(p.id)}
                    >
                      {isUpgrade ? `⬆️ Upgrade to ${p.name}` : `⬇️ Downgrade to ${p.name}`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 3: TAX INVOICES, PAYMENT GATEWAYS & FIJI BANK RECONCILIATION */}
      {activeTab === 'invoices' && (
        <div className="card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 style={{ margin: 0 }}>🧾 Tax Invoices, Gateway Checkout & Bank Reconciliation</h3>
              <p className="text-xs text-slate-500" style={{ margin: '2px 0 0 0' }}>
                Includes automatic tax calculation ({tenant.taxRate}% VAT/GST), usage overage metering, and Fiji bank transfer reconciliation.
              </p>
            </div>
            <Button variant="primary" disabled={busy} onClick={handleGenerateInvoice}>
              + Generate Cycle & Usage Invoice
            </Button>
          </div>

          <table className="activity-table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Period</th>
                <th>Subtotal</th>
                <th>Usage Overage</th>
                <th>Tax ({tenant.taxRate}%)</th>
                <th>Total</th>
                <th>Status</th>
                <th>Method / Reference</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.invoices.map((inv) => (
                <tr key={inv.id}>
                  <td><b>{inv.invoiceNumber}</b></td>
                  <td className="text-xs">{inv.periodStart} → {inv.periodEnd}</td>
                  <td>{inv.currency} {inv.subtotal.toFixed(2)}</td>
                  <td>{inv.currency} {inv.usageOverageAmount.toFixed(2)}</td>
                  <td>{inv.currency} {inv.taxAmount.toFixed(2)}</td>
                  <td><b>{inv.currency} {inv.totalAmount.toFixed(2)}</b></td>
                  <td>
                    <Badge
                      variant={
                        inv.status === 'paid'
                          ? 'success'
                          : inv.status === 'reconciling'
                            ? 'golden'
                            : inv.status === 'overdue'
                              ? 'danger'
                              : 'warning'
                      }
                    >
                      {inv.status.toUpperCase()}
                    </Badge>
                  </td>
                  <td className="text-xs">
                    <div>{inv.paymentMethod}</div>
                    {inv.paymentReference && <code>{inv.paymentReference}</code>}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        className="action-pill preview"
                        onClick={() => setViewInvoice(inv)}
                      >
                        🧾 View Invoice
                      </button>
                      {inv.status !== 'paid' && (
                        <button
                          className="action-pill share"
                          onClick={() => {
                            setPayModalInvoice(inv);
                            setPayMethod(inv.paymentMethod || 'bank_transfer_fiji');
                            setPayReference(inv.paymentReference || '');
                          }}
                        >
                          💳 Pay / Submit Transfer
                        </button>
                      )}
                      {(inv.status === 'reconciling' || inv.status === 'pending') && data.permissions?.canReconcile && (
                        <button
                          className="action-pill analytics"
                          onClick={() => handleReconcileInvoice(inv.id)}
                          title="Finance Administrator / Owner Verification"
                        >
                          ✓ Reconcile
                        </button>
                      )}
                      {inv.status === 'paid' && data.permissions?.canReconcile && (
                        <button
                          className="action-pill delete"
                          onClick={() => handleReverseInvoice(inv.id)}
                          title="Reverse / Refund Payment"
                        >
                          ↩ Reverse
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 4: SUBSCRIPTION HISTORY & IMMUTABLE PAYMENT AUDIT LOG */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="card space-y-3">
            <h3 style={{ margin: 0 }}>📜 Subscription Lifecycle & Reconciliation History</h3>
            <table className="activity-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Event</th>
                  <th>Plan Transition</th>
                  <th>Amount</th>
                  <th>Method / Reference</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {data.history.map((h) => (
                  <tr key={h.id}>
                    <td>{h.createdAt}</td>
                    <td>
                      <Badge
                        variant={
                          h.action === 'upgrade' || h.action === 'reconciliation'
                            ? 'success'
                            : h.action === 'suspension' || h.action === 'reversal'
                              ? 'danger'
                              : 'golden'
                        }
                      >
                        {h.action.toUpperCase()}
                      </Badge>
                    </td>
                    <td>
                      {h.fromPlanName ? `${h.fromPlanName} → ` : ''}
                      <b>{h.toPlanName || tenant.planName}</b>
                    </td>
                    <td><b>{h.currency} {h.amount.toFixed(2)}</b></td>
                    <td>
                      {h.paymentMethod || '—'}
                      {h.reference ? ` (${h.reference})` : ''}
                    </td>
                    <td className="text-xs text-slate-500">{h.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.paymentAuditLogs && data.paymentAuditLogs.length > 0 && (
            <div className="card space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 style={{ margin: 0 }}>🔒 Immutable SHA-256 Chained Payment Audit Ledger</h3>
                <Badge variant="golden">Append-Only Cryptographic Chain</Badge>
              </div>
              <table className="activity-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Event</th>
                    <th>Invoice</th>
                    <th>Amount</th>
                    <th>Transition</th>
                    <th>Chain Hash (SHA-256)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.paymentAuditLogs.map((al) => (
                    <tr key={al.id}>
                      <td>{al.createdAt}</td>
                      <td><code>{al.eventType}</code></td>
                      <td>#{al.invoiceId}</td>
                      <td><b>{al.currency} {al.amount.toFixed(2)}</b></td>
                      <td>{al.statusFrom || '—'} → <b>{al.statusTo}</b></td>
                      <td>
                        <code className="text-[11px]" title={`Prev: ${al.prevHash}\nEntry: ${al.entryHash}`}>
                          {al.entryHash.slice(0, 16)}…
                        </code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: PAY INVOICE / FIJI BANK TRANSFER RECONCILIATION */}
      {payModalInvoice && (
        <div className="modal" onClick={() => setPayModalInvoice(null)} style={{ zIndex: 90 }}>
          <form
            className="card pw-modal-card space-y-4"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSubmitPayment}
          >
            <div className="pw-modal-header">
              <div>
                <h2 style={{ margin: 0, fontSize: '17px' }}>
                  💳 Pay or Reconcile Invoice {payModalInvoice.invoiceNumber}
                </h2>
                <p className="muted" style={{ margin: '2px 0 0 0', fontSize: '12px' }}>
                  Total Due: <b>{payModalInvoice.currency} {payModalInvoice.totalAmount.toFixed(2)}</b> (includes {payModalInvoice.taxRate}% VAT)
                </p>
              </div>
              <button type="button" className="pw-close-btn" onClick={() => setPayModalInvoice(null)}>
                ✕
              </button>
            </div>

            <div>
              <label className="pw-label">Payment Channel</label>
              <select
                className="boardui-input"
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
              >
                <option value="bank_transfer_fiji">🏦 Fiji Manual Bank Transfer (BSP / ANZ / Westpac)</option>
                <option value="stripe_card">💳 Stripe Online Card Gateway (Instant)</option>
                <option value="mpaisa_fiji">📱 Vodafone M-PAiSA Fiji QR / Wallet (Instant)</option>
                <option value="mycash_fiji">📱 Digicel MyCash Fiji Wallet (Instant)</option>
              </select>
            </div>

            {payMethod === 'bank_transfer_fiji' && (
              <div>
                <label className="pw-label">Fiji Bank Used for Deposit</label>
                <select
                  className="boardui-input"
                  value={payBankName}
                  onChange={(e) => setPayBankName(e.target.value)}
                >
                  <option value="Bank of South Pacific (BSP) Fiji">Bank of South Pacific (BSP) Fiji — Acct #1098452100</option>
                  <option value="ANZ Bank (Fiji) Limited">ANZ Bank (Fiji) Limited — Acct #84019283</option>
                  <option value="Westpac Banking Corporation Fiji">Westpac Fiji — Acct #980231445</option>
                  <option value="BRED Bank Fiji">BRED Bank Fiji</option>
                  <option value="HFC Bank Fiji">HFC Bank Fiji</option>
                </select>
              </div>
            )}

            <div>
              <label className="pw-label">
                {payMethod === 'bank_transfer_fiji'
                  ? 'Bank Deposit / Receipt Reference Number'
                  : 'Gateway Transaction Reference (Optional)'}
              </label>
              <input
                className="boardui-input"
                value={payReference}
                onChange={(e) => setPayReference(e.target.value)}
                placeholder={payMethod === 'bank_transfer_fiji' ? 'e.g. BSP-SUVA-20261106' : 'Auto-generated if blank'}
                required={payMethod === 'bank_transfer_fiji'}
              />
            </div>

            <div className="pw-actions-row">
              <button type="button" className="btn-secondary" onClick={() => setPayModalInvoice(null)}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={busy}>
                {payMethod === 'bank_transfer_fiji'
                  ? 'Submit Bank Transfer Reference'
                  : `Pay ${payModalInvoice.currency} ${payModalInvoice.totalAmount.toFixed(2)} Now`}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 2: PRINTABLE ITEMIZED TAX INVOICE */}
      {viewInvoice && (
        <div className="modal" onClick={() => setViewInvoice(null)} style={{ zIndex: 95 }}>
          <div
            className="card"
            style={{ maxWidth: '640px', width: '100%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start border-b pb-4 mb-4">
              <div>
                <span className="nuvis-brand-text" style={{ fontSize: '20px' }}>Nuvis Flipex</span>
                <p className="text-xs text-slate-500" style={{ margin: '4px 0 0 0' }}>
                  Nuvis Technologies Pte Ltd · Suva, Fiji · TIN: 50-99812-0-0
                </p>
              </div>
              <div className="text-right">
                <h2 style={{ margin: 0, fontSize: '18px' }}>TAX INVOICE</h2>
                <b className="text-xs">{viewInvoice.invoiceNumber}</b>
                <div className="mt-1">
                  <Badge variant={viewInvoice.status === 'paid' ? 'success' : 'warning'}>
                    {viewInvoice.status.toUpperCase()}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs mb-4">
              <div>
                <b className="block text-slate-500 uppercase">Billed To:</b>
                <b>{tenant.billingName}</b>
                <div>{tenant.billingAddress}</div>
                {tenant.taxId && <div>TIN / Tax ID: {tenant.taxId}</div>}
                <div>{tenant.billingEmail}</div>
              </div>
              <div className="text-right">
                <div><b>Billing Period:</b> {viewInvoice.periodStart} to {viewInvoice.periodEnd}</div>
                <div><b>Due Date:</b> {viewInvoice.dueDate}</div>
                <div><b>Currency:</b> {viewInvoice.currency}</div>
                {viewInvoice.paymentReference && (
                  <div><b>Reference:</b> {viewInvoice.paymentReference}</div>
                )}
              </div>
            </div>

            <table className="activity-table mb-4">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Qty</th>
                  <th>Amount ({viewInvoice.currency})</th>
                </tr>
              </thead>
              <tbody>
                {viewInvoice.lineItems.map((li, i) => (
                  <tr key={i}>
                    <td>{li.description}</td>
                    <td>{li.quantity}</td>
                    <td>{Number(li.amount).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="space-y-1 text-xs border-t pt-3">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <b>{viewInvoice.currency} {viewInvoice.subtotal.toFixed(2)}</b>
              </div>
              <div className="flex justify-between">
                <span>Metered Usage Overage:</span>
                <b>{viewInvoice.currency} {viewInvoice.usageOverageAmount.toFixed(2)}</b>
              </div>
              <div className="flex justify-between">
                <span>Tax ({viewInvoice.taxRate}% VAT / GST):</span>
                <b>{viewInvoice.currency} {viewInvoice.taxAmount.toFixed(2)}</b>
              </div>
              <div className="flex justify-between text-base pt-2 border-t">
                <b>Total Amount:</b>
                <b>{viewInvoice.currency} {viewInvoice.totalAmount.toFixed(2)}</b>
              </div>
            </div>

            <div className="pw-actions-row mt-4">
              <button type="button" className="btn-secondary" onClick={() => setViewInvoice(null)}>
                Close
              </button>
              <button type="button" className="btn-primary" onClick={() => window.print()}>
                🖨️ Print / Save PDF Invoice
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
