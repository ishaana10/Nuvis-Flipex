<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\TenantScope;
use App\Support\Audit;
use App\Support\Db;
use App\Support\Http;
use App\Support\Outbox;
use App\Support\Rbac;
use App\Support\SecurityMonitor;
use App\Support\Storage;
use App\Support\TenantContext;
use App\Support\WebhookDispatcher;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Commercial Billing, Tax Invoices, Metering & Secure 3-Stage Payment Architecture.
 *
 * Security Architecture (P0 Enforced):
 * 1. Customer Payment Submission (`payInvoice`):
 *    - Customer selects payment method and initiates payment.
 *    - Invoice transitions to `pending` (online gateway awaiting webhook) or `reconciling` (manual bank transfer).
 *    - Client-supplied `autoReconcile` flags or gateway names NEVER mark an invoice as `paid`.
 *    - Records an idempotent `payment_transactions` row (`Idempotency-Key` header or `idempotencyKey` body field).
 * 2. Payment Verification (`reconcileInvoice` / `handlePaymentWebhook`):
 *    - Only an HMAC-SHA256 signed payment gateway webhook (`X-Payment-Signature`) OR an authorized
 *      `owner`, `finance`, or platform `admin` (`Rbac::authorize($u, 'billing.reconcile')`) can confirm payment.
 * 3. Subscription Activation (`activateSubscriptionFromVerifiedPayment`) & Reversal (`reversePayment`):
 *    - Trusted backend service updates `invoices`, `payment_transactions`, `tenants`, `subscription_history`,
 *      and `payment_audit_logs` (immutable SHA-256 hash chain) inside one atomic database transaction.
 */
final class BillingController
{
    private static bool $schemaChecked = false;

    public static function ensureBillingSecuritySchema(): void
    {
        if (self::$schemaChecked) {
            return;
        }
        self::$schemaChecked = true;
        // Event tables (outbox_events, payment_webhook_events, ...) must exist before any billing transaction opens.
        Outbox::ensureSchema();
        try {
            $pdo = Db::pdo();
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS payment_transactions (
                  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                  tenant_id BIGINT UNSIGNED NOT NULL,
                  invoice_id BIGINT UNSIGNED NOT NULL,
                  user_id BIGINT UNSIGNED NULL,
                  transaction_uid VARCHAR(64) NOT NULL UNIQUE,
                  idempotency_key VARCHAR(120) NOT NULL,
                  provider VARCHAR(50) NOT NULL DEFAULT 'bank_transfer_fiji',
                  payment_reference VARCHAR(120) NULL,
                  bank_name VARCHAR(80) NULL,
                  amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                  currency VARCHAR(10) NOT NULL DEFAULT 'FJD',
                  status ENUM('pending','reconciling','succeeded','failed','reversed') NOT NULL DEFAULT 'pending',
                  webhook_signature_verified TINYINT(1) NOT NULL DEFAULT 0,
                  verified_by BIGINT UNSIGNED NULL,
                  verified_at DATETIME NULL,
                  reversal_reason VARCHAR(255) NULL,
                  reversed_by BIGINT UNSIGNED NULL,
                  reversed_at DATETIME NULL,
                  raw_payload JSON NULL,
                  immutable_hash CHAR(64) NOT NULL,
                  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                  UNIQUE KEY uniq_tenant_idempotency (tenant_id, idempotency_key),
                  INDEX (tenant_id, invoice_id),
                  INDEX (status)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            ");

            $pdo->exec("
                CREATE TABLE IF NOT EXISTS payment_audit_logs (
                  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                  tenant_id BIGINT UNSIGNED NOT NULL,
                  invoice_id BIGINT UNSIGNED NOT NULL,
                  transaction_id BIGINT UNSIGNED NULL,
                  actor_user_id BIGINT UNSIGNED NULL,
                  event_type VARCHAR(60) NOT NULL,
                  amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                  currency VARCHAR(10) NOT NULL DEFAULT 'FJD',
                  status_from VARCHAR(30) NULL,
                  status_to VARCHAR(30) NOT NULL,
                  meta JSON NULL,
                  ip VARCHAR(64) NULL,
                  prev_hash CHAR(64) NOT NULL,
                  entry_hash CHAR(64) NOT NULL,
                  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  INDEX (tenant_id, invoice_id),
                  INDEX (entry_hash)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            ");

            try {
                $pdo->exec("ALTER TABLE `users` MODIFY COLUMN `tenant_role` ENUM('owner','admin','finance','editor','viewer') NOT NULL DEFAULT 'editor'");
                $pdo->exec("ALTER TABLE `invoices` MODIFY COLUMN `status` ENUM('draft','issued','pending','reconciling','paid','overdue','reversed','void') NOT NULL DEFAULT 'issued'");
                $pdo->exec("ALTER TABLE `subscription_history` MODIFY COLUMN `action` ENUM('initial','upgrade','downgrade','renewal','grace_period','suspension','reactivation','reconciliation','payment_submitted','reversal') NOT NULL");
            } catch (\Throwable) {
                // Non-fatal if already altered
            }
        } catch (\Throwable) {
            // Non-fatal fallback
        }
    }

    /**
     * Strict tenant resolution. A missing tenant assignment is a hard 403 — never a default / first tenant.
     */
    private function resolveTenantId(Request $req): int
    {
        return TenantScope::requireId($req);
    }

    /**
     * Strict permission verification for financial reconciliation & reversals:
     * Only tenant 'owner', tenant 'finance', or platform 'admin' (interactive session only, never API key).
     */
    private function isFinanceOrOwnerOrPlatformAdmin(?array $user): bool
    {
        if (!$user || TenantContext::isApiKeyAuth()) {
            return false;
        }
        if (($user['role'] ?? '') === 'admin') {
            return true;
        }
        return in_array($user['tenant_role'] ?? '', ['owner', 'finance'], true);
    }

    /**
     * Resolve the HMAC-SHA256 signing secret used to verify payment gateway webhooks.
     */
    public static function webhookSigningSecret(string $provider = 'default'): string
    {
        $envSecret = trim((string) ($_ENV['PAYMENT_WEBHOOK_SECRET'] ?? ''));
        if ($envSecret !== '') {
            return $envSecret;
        }
        $jwtSecret = trim((string) ($_ENV['JWT_SECRET'] ?? 'nuvis-flipex-default-secret'));
        return hash_hmac('sha256', 'payment_webhook:' . strtolower($provider), $jwtSecret);
    }

    /**
     * Append a cryptographically chained SHA-256 record to `payment_audit_logs`.
     * Must be called either inside an active transaction or standalone.
     */
    private function appendImmutablePaymentAudit(
        int $tenantId,
        int $invoiceId,
        ?int $transactionId,
        ?int $actorUserId,
        string $eventType,
        float $amount,
        string $currency,
        ?string $statusFrom,
        string $statusTo,
        array $meta = []
    ): string {
        $prevRow = Db::one(
            'SELECT entry_hash FROM payment_audit_logs WHERE tenant_id = ? ORDER BY id DESC LIMIT 1',
            [$tenantId]
        );
        $prevHash = $prevRow['entry_hash'] ?? str_repeat('0', 64);
        $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
        $metaJson = json_encode($meta, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?: '{}';
        $createdAt = date('Y-m-d H:i:s');

        $canonical = implode('|', [
            $tenantId,
            $invoiceId,
            (int) $transactionId,
            (int) $actorUserId,
            $eventType,
            number_format($amount, 2, '.', ''),
            $currency,
            (string) $statusFrom,
            $statusTo,
            $metaJson,
            $prevHash,
            $createdAt,
        ]);
        $entryHash = hash('sha256', $canonical);

        Db::run(
            'INSERT INTO payment_audit_logs
             (tenant_id, invoice_id, transaction_id, actor_user_id, event_type, amount, currency, status_from, status_to, meta, ip, prev_hash, entry_hash, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                $tenantId,
                $invoiceId,
                $transactionId,
                $actorUserId,
                $eventType,
                $amount,
                $currency,
                $statusFrom,
                $statusTo,
                $metaJson,
                $ip,
                $prevHash,
                $entryHash,
                $createdAt,
            ]
        );

        return $entryHash;
    }

    /**
     * Calculate live storage & bandwidth metering for the tenant.
     */
    private function computeMetering(int $tenantId, array $tenant, array $plan): array
    {
        $root = Storage::root();
        $tenantDir = "{$root}/tenants/{$tenantId}";
        $bytes = 0;

        if (is_dir($tenantDir)) {
            $it = new \RecursiveIteratorIterator(
                new \RecursiveDirectoryIterator($tenantDir, \FilesystemIterator::SKIP_DOTS)
            );
            foreach ($it as $file) {
                if ($file->isFile()) {
                    $bytes += $file->getSize();
                }
            }
        }

        $books = Db::all('SELECT id, page_count, source_pdf_path FROM flipbooks WHERE tenant_id = ?', [$tenantId]);
        $totalPages = 0;
        foreach ($books as $b) {
            $totalPages += (int) $b['page_count'];
            if (!empty($b['source_pdf_path'])) {
                $full = $root . '/' . ltrim((string) $b['source_pdf_path'], '/');
                if (is_file($full)) {
                    $bytes += filesize($full);
                }
            }
        }

        $estimatedAssetMb = round($totalPages * 0.42, 2);
        $diskMb = round($bytes / 1048576, 2);
        $storageUsedMb = max($diskMb, $estimatedAssetMb);

        $viewsRow = Db::one(
            'SELECT COUNT(*) AS total_views, COALESCE(SUM(pages_viewed), 0) AS total_pages_viewed
             FROM views v
             JOIN flipbooks f ON f.id = v.flipbook_id
             WHERE f.tenant_id = ? AND v.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)',
            [$tenantId]
        );
        $monthlyViews = (int) ($viewsRow['total_views'] ?? 0);
        $pagesViewed30d = (int) ($viewsRow['total_pages_viewed'] ?? 0);

        $dlRow = Db::one(
            "SELECT COUNT(*) AS dl_count FROM analytics_events WHERE tenant_id = ? AND event_type = 'download' AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)",
            [$tenantId]
        );
        $downloads30d = (int) ($dlRow['dl_count'] ?? 0);

        $bandwidthUsedMb = round(($pagesViewed30d * 0.28) + ($downloads30d * 4.5), 2);

        Db::run(
            'UPDATE tenants SET storage_used_mb = ?, bandwidth_used_mb = ? WHERE id = ?',
            [$storageUsedMb, $bandwidthUsedMb, $tenantId]
        );

        $maxStorageMb = max(100, (int) ($tenant['max_storage_mb'] ?: ($plan['max_upload_mb'] ?? 1024) * 10));
        $maxFlipbooks = max(1, (int) ($tenant['max_flipbooks'] ?: ($plan['max_flipbooks'] ?? 25)));
        $includedMonthlyViews = max(500, (int) ($plan['monthly_views'] ?? 10000));
        $includedBandwidthMb = max(2048, $maxStorageMb * 5);

        $storageOverageMb = max(0, round($storageUsedMb - $maxStorageMb, 2));
        $viewsOverage = max(0, $monthlyViews - $includedMonthlyViews);
        $overageCharge = round(($storageOverageMb * 0.05) + (($viewsOverage / 1000) * 2.50), 2);

        return [
            'flipbooksUsed' => count($books),
            'maxFlipbooks' => $maxFlipbooks,
            'totalPagesConverted' => $totalPages,
            'storageUsedMb' => $storageUsedMb,
            'maxStorageMb' => $maxStorageMb,
            'storagePct' => min(100, (int) round(($storageUsedMb / $maxStorageMb) * 100)),
            'bandwidthUsedMb' => $bandwidthUsedMb,
            'includedBandwidthMb' => $includedBandwidthMb,
            'bandwidthPct' => min(100, (int) round(($bandwidthUsedMb / $includedBandwidthMb) * 100)),
            'monthlyViews' => $monthlyViews,
            'includedMonthlyViews' => $includedMonthlyViews,
            'downloads30d' => $downloads30d,
            'storageOverageMb' => $storageOverageMb,
            'viewsOverage' => $viewsOverage,
            'estimatedUsageOverageCharge' => $overageCharge,
        ];
    }

    /**
     * Evaluate overdue grace period & automatic suspension rules.
     */
    private function evaluateGraceAndSuspension(array &$tenant): array
    {
        $tid = (int) $tenant['id'];
        $nextBilling = $tenant['next_billing_date'] ?? null;
        $graceDays = (int) ($tenant['grace_period_days'] ?? 7);
        $status = $tenant['payment_status'] ?? 'paid';
        $inGracePeriod = false;
        $daysUntilSuspension = null;

        if ($nextBilling) {
            $dueTs = strtotime($nextBilling . ' 23:59:59');
            $graceEndTs = $dueTs + ($graceDays * 86400);
            $now = time();

            if ($now > $dueTs && $status !== 'paid' && $status !== 'exempt') {
                if ($now <= $graceEndTs) {
                    $inGracePeriod = true;
                    $daysUntilSuspension = max(0, (int) ceil(($graceEndTs - $now) / 86400));
                } elseif (empty($tenant['suspended_at'])) {
                    $reason = "Subscription overdue past {$graceDays}-day grace period (Due: {$nextBilling})";
                    Db::run(
                        "UPDATE tenants SET is_active = 0, payment_status = 'overdue', suspended_at = NOW(), suspension_reason = ? WHERE id = ?",
                        [$reason, $tid]
                    );
                    Db::run(
                        "INSERT INTO subscription_history (tenant_id, to_plan_id, action, amount, currency, notes)
                         VALUES (?, ?, 'suspension', 0, ?, ?)",
                        [$tid, $tenant['plan_id'], $tenant['currency'] ?: 'FJD', $reason]
                    );
                    $tenant['is_active'] = 0;
                    $tenant['payment_status'] = 'overdue';
                    $tenant['suspended_at'] = date('Y-m-d H:i:s');
                    $tenant['suspension_reason'] = $reason;
                }
            }
        }

        return [
            'inGracePeriod' => $inGracePeriod,
            'gracePeriodDays' => $graceDays,
            'daysUntilSuspension' => $daysUntilSuspension,
            'isSuspended' => !empty($tenant['suspended_at']) || empty($tenant['is_active']),
            'suspendedAt' => $tenant['suspended_at'] ?? null,
            'suspensionReason' => $tenant['suspension_reason'] ?? null,
        ];
    }

    /**
     * GET /api/v1/billing/overview
     */
    public function overview(Request $req, Response $res): Response
    {
        self::ensureBillingSecuritySchema();
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'billing.view');

        $tid = $this->resolveTenantId($req);
        $tenant = Db::one('SELECT * FROM tenants WHERE id = ?', [$tid]);
        if (!$tenant) {
            return Http::error($res, 'Tenant workspace not found', 404);
        }

        $plan = Db::one('SELECT * FROM plans WHERE id = ?', [$tenant['plan_id']]) ?: [
            'id' => 1,
            'name' => 'Pro',
            'price' => 49.00,
            'max_flipbooks' => 50,
            'max_pages' => 200,
            'max_upload_mb' => 100,
            'monthly_views' => 25000,
        ];

        $allPlans = Db::all('SELECT * FROM plans ORDER BY price ASC');
        $graceState = $this->evaluateGraceAndSuspension($tenant);
        $metering = $this->computeMetering($tid, $tenant, $plan);

        $invoices = Db::all(
            'SELECT * FROM invoices WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 30',
            [$tid]
        );
        $history = Db::all(
            'SELECT h.*, p1.name AS from_plan_name, p2.name AS to_plan_name
             FROM subscription_history h
             LEFT JOIN plans p1 ON p1.id = h.from_plan_id
             LEFT JOIN plans p2 ON p2.id = h.to_plan_id
             WHERE h.tenant_id = ?
             ORDER BY h.created_at DESC
             LIMIT 30',
            [$tid]
        );
        $transactions = Db::all(
            'SELECT * FROM payment_transactions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 30',
            [$tid]
        );
        $auditLogs = Db::all(
            'SELECT * FROM payment_audit_logs WHERE tenant_id = ? ORDER BY id DESC LIMIT 30',
            [$tid]
        );

        return Http::json($res, [
            'permissions' => [
                'canManageBilling' => Rbac::can($u, 'billing.manage'),
                'canReconcile' => Rbac::can($u, 'billing.reconcile') && $this->isFinanceOrOwnerOrPlatformAdmin($u),
                'tenantRole' => $u['tenant_role'] ?? 'editor',
                'systemRole' => $u['role'] ?? 'user',
            ],
            'tenant' => [
                'id' => (int) $tenant['id'],
                'name' => $tenant['name'],
                'slug' => $tenant['slug'],
                'planId' => (int) $tenant['plan_id'],
                'planName' => $plan['name'],
                'planPrice' => (float) $plan['price'],
                'billingName' => $tenant['billing_name'] ?: $tenant['name'],
                'billingEmail' => $tenant['billing_email'] ?: '',
                'billingAddress' => $tenant['billing_address'] ?: 'Suva, Fiji',
                'taxId' => $tenant['tax_id'] ?: '',
                'currency' => $tenant['currency'] ?: 'FJD',
                'billingCycle' => $tenant['billing_cycle'] ?: 'monthly',
                'amount' => (float) ($tenant['amount'] > 0 ? $tenant['amount'] : $plan['price']),
                'taxRate' => (float) ($tenant['tax_rate'] ?? 15.00),
                'paymentMethod' => $tenant['payment_method'] ?: 'bank_transfer_fiji',
                'paymentGateway' => $tenant['payment_gateway'] ?: 'bank_transfer_fiji',
                'paymentStatus' => $tenant['payment_status'] ?: 'paid',
                'paymentReference' => $tenant['payment_reference'] ?: '',
                'lastPaymentDate' => $tenant['last_payment_date'],
                'nextBillingDate' => $tenant['next_billing_date'],
                'autoRenew' => (bool) ($tenant['auto_renew'] ?? 1),
                'gracePeriodDays' => (int) ($tenant['grace_period_days'] ?? 7),
            ],
            'graceAndSuspension' => $graceState,
            'metering' => $metering,
            'availablePlans' => array_map(fn($p) => [
                'id' => (int) $p['id'],
                'name' => $p['name'],
                'price' => (float) $p['price'],
                'maxFlipbooks' => (int) $p['max_flipbooks'],
                'maxPages' => (int) $p['max_pages'],
                'maxUploadMb' => (int) $p['max_upload_mb'],
                'monthlyViews' => (int) $p['monthly_views'],
                'removeBranding' => (bool) $p['remove_branding'],
            ], $allPlans),
            'invoices' => array_map(fn($inv) => [
                'id' => (int) $inv['id'],
                'invoiceNumber' => $inv['invoice_number'],
                'billingCycle' => $inv['billing_cycle'],
                'currency' => $inv['currency'],
                'subtotal' => (float) $inv['subtotal'],
                'usageOverageAmount' => (float) $inv['usage_overage_amount'],
                'taxRate' => (float) $inv['tax_rate'],
                'taxAmount' => (float) $inv['tax_amount'],
                'totalAmount' => (float) $inv['total_amount'],
                'status' => $inv['status'],
                'paymentMethod' => $inv['payment_method'],
                'paymentReference' => $inv['payment_reference'],
                'bankName' => $inv['bank_name'],
                'lineItems' => json_decode((string) $inv['line_items'], true) ?: [],
                'periodStart' => $inv['period_start'],
                'periodEnd' => $inv['period_end'],
                'dueDate' => $inv['due_date'],
                'paidAt' => $inv['paid_at'],
                'notes' => $inv['notes'],
                'createdAt' => $inv['created_at'],
            ], $invoices),
            'transactions' => array_map(fn($tx) => [
                'id' => (int) $tx['id'],
                'invoiceId' => (int) $tx['invoice_id'],
                'transactionUid' => $tx['transaction_uid'],
                'idempotencyKey' => $tx['idempotency_key'],
                'provider' => $tx['provider'],
                'paymentReference' => $tx['payment_reference'],
                'bankName' => $tx['bank_name'],
                'amount' => (float) $tx['amount'],
                'currency' => $tx['currency'],
                'status' => $tx['status'],
                'webhookSignatureVerified' => (bool) $tx['webhook_signature_verified'],
                'verifiedBy' => $tx['verified_by'] ? (int) $tx['verified_by'] : null,
                'verifiedAt' => $tx['verified_at'],
                'reversalReason' => $tx['reversal_reason'],
                'reversedAt' => $tx['reversed_at'],
                'immutableHash' => $tx['immutable_hash'],
                'createdAt' => $tx['created_at'],
            ], $transactions),
            'paymentAuditLogs' => array_map(fn($al) => [
                'id' => (int) $al['id'],
                'invoiceId' => (int) $al['invoice_id'],
                'transactionId' => $al['transaction_id'] ? (int) $al['transaction_id'] : null,
                'actorUserId' => $al['actor_user_id'] ? (int) $al['actor_user_id'] : null,
                'eventType' => $al['event_type'],
                'amount' => (float) $al['amount'],
                'currency' => $al['currency'],
                'statusFrom' => $al['status_from'],
                'statusTo' => $al['status_to'],
                'prevHash' => $al['prev_hash'],
                'entryHash' => $al['entry_hash'],
                'createdAt' => $al['created_at'],
            ], $auditLogs),
            'history' => array_map(fn($h) => [
                'id' => (int) $h['id'],
                'fromPlanName' => $h['from_plan_name'],
                'toPlanName' => $h['to_plan_name'],
                'action' => $h['action'],
                'amount' => (float) $h['amount'],
                'currency' => $h['currency'],
                'paymentMethod' => $h['payment_method'],
                'reference' => $h['reference'],
                'notes' => $h['notes'],
                'createdAt' => $h['created_at'],
            ], $history),
            'fijiBankAccounts' => [
                [
                    'bank' => 'Bank of South Pacific (BSP) Fiji',
                    'accountName' => 'Nuvis Technologies Pte Ltd',
                    'accountNumber' => '1098452100',
                    'bsbOrSwift' => 'BOSPFJFJ',
                    'branch' => 'Suva Central, Fiji',
                ],
                [
                    'bank' => 'ANZ Bank (Fiji) Limited',
                    'accountName' => 'Nuvis Technologies Pte Ltd',
                    'accountNumber' => '84019283',
                    'bsbOrSwift' => 'ANZBFJFJ',
                    'branch' => 'Victoria Parade, Suva',
                ],
                [
                    'bank' => 'Westpac Banking Corporation Fiji',
                    'accountName' => 'Nuvis Technologies Pte Ltd',
                    'accountNumber' => '980231445',
                    'bsbOrSwift' => 'WPACFJFX',
                    'branch' => 'Suva Main Branch',
                ],
            ],
        ]);
    }

    /**
     * PATCH /api/v1/billing/settings
     * Update billing profile, currency, tax rate, auto-renewal, payment gateway, and grace period.
     */
    public function updateSettings(Request $req, Response $res): Response
    {
        self::ensureBillingSecuritySchema();
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'billing.manage');

        $tid = $this->resolveTenantId($req);
        $b = (array) $req->getParsedBody();

        $tenant = Db::one('SELECT * FROM tenants WHERE id = ?', [$tid]);
        if (!$tenant) {
            return Http::error($res, 'Tenant not found', 404);
        }

        $billingName = trim((string) ($b['billingName'] ?? $tenant['billing_name']));
        $billingEmail = trim((string) ($b['billingEmail'] ?? $tenant['billing_email']));
        $billingAddress = trim((string) ($b['billingAddress'] ?? $tenant['billing_address']));
        $taxId = trim((string) ($b['taxId'] ?? $tenant['tax_id']));
        $currency = strtoupper(trim((string) ($b['currency'] ?? $tenant['currency'] ?: 'FJD')));
        if (!in_array($currency, ['FJD', 'USD', 'AUD', 'NZD', 'EUR'], true)) {
            $currency = 'FJD';
        }
        $billingCycle = strtolower(trim((string) ($b['billingCycle'] ?? $tenant['billing_cycle'] ?: 'monthly')));
        $taxRate = isset($b['taxRate']) ? max(0.0, min(50.0, (float) $b['taxRate'])) : (float) ($tenant['tax_rate'] ?? 15.00);
        $autoRenew = isset($b['autoRenew']) ? ($b['autoRenew'] ? 1 : 0) : (int) ($tenant['auto_renew'] ?? 1);
        $graceDays = isset($b['gracePeriodDays']) ? max(0, min(60, (int) $b['gracePeriodDays'])) : (int) ($tenant['grace_period_days'] ?? 7);
        $paymentGateway = trim((string) ($b['paymentGateway'] ?? $tenant['payment_gateway'] ?: 'bank_transfer_fiji'));

        Db::run(
            'UPDATE tenants
             SET billing_name = ?, billing_email = ?, billing_address = ?, tax_id = ?,
                 currency = ?, billing_cycle = ?, tax_rate = ?, auto_renew = ?,
                 grace_period_days = ?, payment_gateway = ?, payment_method = ?
             WHERE id = ?',
            [
                $billingName,
                $billingEmail,
                $billingAddress,
                $taxId,
                $currency,
                $billingCycle,
                $taxRate,
                $autoRenew,
                $graceDays,
                $paymentGateway,
                $paymentGateway,
                $tid,
            ]
        );

        Audit::log('billing.update_settings', 'tenant', $tid, ['currency' => $currency, 'auto_renew' => (bool) $autoRenew]);

        return Http::json($res, ['ok' => true]);
    }

    /**
     * POST /api/v1/billing/change-plan
     * Self-service Subscription Upgrade / Downgrade with automatic prorated/cycle Invoice Generation.
     */
    public function changePlan(Request $req, Response $res): Response
    {
        self::ensureBillingSecuritySchema();
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'billing.manage');

        $tid = $this->resolveTenantId($req);
        $b = (array) $req->getParsedBody();

        $targetPlanId = (int) ($b['planId'] ?? 0);
        $billingCycle = strtolower(trim((string) ($b['billingCycle'] ?? 'monthly')));
        if ($billingCycle === 'yearly') {
            $billingCycle = 'annually';
        }
        if (!in_array($billingCycle, ['monthly', 'quarterly', 'annually'], true)) {
            $billingCycle = 'monthly';
        }

        $tenant = Db::one('SELECT * FROM tenants WHERE id = ?', [$tid]);
        $newPlan = Db::one('SELECT * FROM plans WHERE id = ?', [$targetPlanId]);
        if (!$tenant || !$newPlan) {
            return Http::error($res, 'Invalid subscription plan selected', 422);
        }

        $oldPlan = Db::one('SELECT * FROM plans WHERE id = ?', [$tenant['plan_id']]);
        $oldPrice = (float) ($oldPlan['price'] ?? 0);
        $newPrice = (float) $newPlan['price'];

        $action = $newPrice >= $oldPrice ? 'upgrade' : 'downgrade';
        $multiplier = $billingCycle === 'annually' ? 10 : ($billingCycle === 'quarterly' ? 2.85 : 1);
        $subtotal = round($newPrice * $multiplier, 2);
        $taxRate = (float) ($tenant['tax_rate'] ?? 15.00);
        $taxAmount = round($subtotal * ($taxRate / 100), 2);
        $totalAmount = round($subtotal + $taxAmount, 2);
        $reqCurrency = strtoupper(trim((string) ($b['currency'] ?? '')));
        $currency = in_array($reqCurrency, ['FJD', 'USD', 'AUD', 'NZD', 'EUR'], true) ? $reqCurrency : ($tenant['currency'] ?: 'FJD');

        $newMaxStorage = max(1024, (int) $newPlan['max_upload_mb'] * 25);
        $intervalDays = $billingCycle === 'annually' ? 365 : ($billingCycle === 'quarterly' ? 90 : 30);

        Db::run(
            'UPDATE tenants
             SET plan_id = ?, max_flipbooks = ?, max_storage_mb = ?, billing_cycle = ?, amount = ?, currency = ?,
                 next_billing_date = DATE_ADD(CURDATE(), INTERVAL ? DAY)
             WHERE id = ?',
            [$newPlan['id'], $newPlan['max_flipbooks'], $newMaxStorage, $billingCycle, $subtotal, $currency, $intervalDays, $tid]
        );

        Db::run('UPDATE users SET plan_id = ? WHERE tenant_id = ?', [$newPlan['id'], $tid]);

        $invNo = 'INV-' . date('Y') . '-' . strtoupper(substr(bin2hex(random_bytes(3)), 0, 6));
        $lineItems = [
            [
                'description' => sprintf('Subscription %s to %s Plan (%s)', ucfirst($action), $newPlan['name'], ucfirst($billingCycle)),
                'quantity' => 1,
                'unit_price' => $subtotal,
                'amount' => $subtotal,
            ],
        ];

        $invStatus = $totalAmount <= 0 ? 'paid' : 'issued';
        $invId = Db::insert(
            'INSERT INTO invoices (tenant_id, invoice_number, plan_id, billing_cycle, currency, subtotal, usage_overage_amount, tax_rate, tax_amount, total_amount, status, payment_method, line_items, period_start, period_end, due_date, paid_at, notes)
             VALUES (?, ?, ?, ?, ?, ?, 0.00, ?, ?, ?, ?, ?, ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL ? DAY), DATE_ADD(CURDATE(), INTERVAL 7 DAY), ?, ?)',
            [
                $tid,
                $invNo,
                $newPlan['id'],
                $billingCycle,
                $currency,
                $subtotal,
                $taxRate,
                $taxAmount,
                $totalAmount,
                $invStatus,
                $tenant['payment_gateway'] ?: 'bank_transfer_fiji',
                json_encode($lineItems),
                $intervalDays,
                $totalAmount <= 0 ? date('Y-m-d H:i:s') : null,
                sprintf('Plan %s from %s to %s', $action, $oldPlan['name'] ?? 'Previous', $newPlan['name']),
            ]
        );

        Db::run(
            'INSERT INTO subscription_history (tenant_id, user_id, from_plan_id, to_plan_id, action, amount, currency, payment_method, reference, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                $tid,
                $u['id'],
                $tenant['plan_id'],
                $newPlan['id'],
                $action,
                $totalAmount,
                $currency,
                $tenant['payment_gateway'] ?: 'bank_transfer_fiji',
                $invNo,
                sprintf('Changed subscription from %s to %s (%s)', $oldPlan['name'] ?? 'None', $newPlan['name'], ucfirst($billingCycle)),
            ]
        );

        WebhookDispatcher::dispatch($tid, 'subscription.changed', [
            'action' => $action,
            'fromPlan' => $oldPlan['name'] ?? null,
            'toPlan' => $newPlan['name'],
            'invoiceNumber' => $invNo,
            'totalAmount' => $totalAmount,
            'currency' => $currency,
        ]);

        Audit::log('billing.change_plan', 'tenant', $tid, ['action' => $action, 'to_plan' => $newPlan['name']]);

        return Http::json($res, [
            'ok' => true,
            'action' => $action,
            'billingCycle' => $billingCycle,
            'currency' => $currency,
            'invoiceId' => $invId,
            'invoiceNumber' => $invNo,
            'message' => sprintf('Subscription %sd to %s Plan. Invoice %s generated.', $action, $newPlan['name'], $invNo),
        ]);
    }

    /**
     * POST /api/v1/billing/invoices/generate
     * Generate a renewal or usage-metered tax invoice on demand.
     */
    public function generateInvoice(Request $req, Response $res): Response
    {
        self::ensureBillingSecuritySchema();
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'billing.manage');

        $tid = $this->resolveTenantId($req);
        $tenant = Db::one('SELECT * FROM tenants WHERE id = ?', [$tid]);
        if (!$tenant) {
            return Http::error($res, 'Tenant not found', 404);
        }

        $plan = Db::one('SELECT * FROM plans WHERE id = ?', [$tenant['plan_id']]) ?: ['id' => 1, 'name' => 'Pro', 'price' => 49.00];
        $metering = $this->computeMetering($tid, $tenant, $plan);

        $subtotal = (float) ($tenant['amount'] > 0 ? $tenant['amount'] : $plan['price']);
        $overage = (float) $metering['estimatedUsageOverageCharge'];
        $taxRate = (float) ($tenant['tax_rate'] ?? 15.00);
        $taxable = round($subtotal + $overage, 2);
        $taxAmount = round($taxable * ($taxRate / 100), 2);
        $totalAmount = round($taxable + $taxAmount, 2);
        $currency = $tenant['currency'] ?: 'FJD';
        $cycle = $tenant['billing_cycle'] ?: 'monthly';
        $invNo = 'INV-' . date('Y') . '-' . strtoupper(substr(bin2hex(random_bytes(3)), 0, 6));

        $lineItems = [
            [
                'description' => sprintf('%s Plan Subscription Renewal (%s)', $plan['name'], ucfirst($cycle)),
                'quantity' => 1,
                'unit_price' => $subtotal,
                'amount' => $subtotal,
            ],
            [
                'description' => sprintf(
                    'Metered Storage (%s/%s MB) & Bandwidth (%s MB) Usage Tier',
                    $metering['storageUsedMb'],
                    $metering['maxStorageMb'],
                    $metering['bandwidthUsedMb']
                ),
                'quantity' => 1,
                'unit_price' => $overage,
                'amount' => $overage,
            ],
        ];

        $invId = Db::insert(
            "INSERT INTO invoices (tenant_id, invoice_number, plan_id, billing_cycle, currency, subtotal, usage_overage_amount, tax_rate, tax_amount, total_amount, status, payment_method, line_items, period_start, period_end, due_date, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'issued', ?, ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 30 DAY), DATE_ADD(CURDATE(), INTERVAL 7 DAY), 'Automated subscription & usage metering invoice')",
            [
                $tid,
                $invNo,
                $plan['id'],
                $cycle,
                $currency,
                $subtotal,
                $overage,
                $taxRate,
                $taxAmount,
                $totalAmount,
                $tenant['payment_gateway'] ?: 'bank_transfer_fiji',
                json_encode($lineItems),
            ]
        );

        Db::run(
            "INSERT INTO subscription_history (tenant_id, user_id, from_plan_id, to_plan_id, action, amount, currency, payment_method, reference, notes)
             VALUES (?, ?, ?, ?, 'renewal', ?, ?, ?, ?, 'Generated cycle renewal & usage invoice')",
            [$tid, $u['id'], $plan['id'], $plan['id'], $totalAmount, $currency, $tenant['payment_gateway'] ?: 'bank_transfer_fiji', $invNo]
        );

        $this->appendImmutablePaymentAudit(
            $tid,
            $invId,
            null,
            (int) $u['id'],
            'invoice.generated',
            $totalAmount,
            $currency,
            null,
            'issued',
            ['invoice_number' => $invNo]
        );

        WebhookDispatcher::dispatch($tid, 'invoice.generated', [
            'invoiceId' => $invId,
            'invoiceNumber' => $invNo,
            'totalAmount' => $totalAmount,
            'currency' => $currency,
        ]);

        return Http::json($res, [
            'ok' => true,
            'id' => $invId,
            'invoiceId' => $invId,
            'invoiceNumber' => $invNo,
            'subtotal' => $subtotal,
            'taxRate' => $taxRate,
            'taxAmount' => $taxAmount,
            'totalAmount' => $totalAmount,
            'currency' => $currency,
        ], 201);
    }

    /**
     * STAGE 1 — CUSTOMER PAYMENT SUBMISSION
     * POST /api/v1/billing/invoices/{id}/pay
     *
     * Customer selects payment method and initiates payment.
     * - Invoice transitions to `reconciling` (or `pending`) — NEVER directly to `paid`!
     * - Client-supplied `autoReconcile` flags are ignored and logged as security warnings if set.
     * - Enforces idempotency via `Idempotency-Key` header or `idempotencyKey` body field.
     * - Creates a `payment_transactions` record and appends an immutable `payment_audit_logs` record.
     */
    public function payInvoice(Request $req, Response $res, array $args): Response
    {
        self::ensureBillingSecuritySchema();
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'billing.manage');

        $tid = $this->resolveTenantId($req);
        $invId = (int) $args['id'];
        $b = (array) $req->getParsedBody();

        $inv = Db::one('SELECT * FROM invoices WHERE id = ? AND tenant_id = ?', [$invId, $tid]);
        if (!$inv) {
            return Http::error($res, 'Invoice not found', 404);
        }

        if ($inv['status'] === 'paid') {
            return Http::error($res, 'Invoice is already paid and reconciled', 409);
        }

        // Security guard: log if client attempted to pass an unverified autoReconcile flag
        if (!empty($b['autoReconcile'])) {
            SecurityMonitor::logEvent(
                'unverified_auto_reconcile_blocked',
                'warning',
                [
                    'invoice_id' => $invId,
                    'payment_method' => $b['paymentMethod'] ?? null,
                    'message' => 'Client-supplied autoReconcile flag was ignored; payment verification requires signed webhook or finance reconciliation.',
                ],
                (int) $u['id'],
                $tid
            );
        }

        $method = strtolower(trim((string) ($b['paymentMethod'] ?? 'bank_transfer_fiji')));
        $reference = trim((string) ($b['paymentReference'] ?? ''));
        $bankName = trim((string) ($b['bankName'] ?? 'Bank of South Pacific (BSP) Fiji'));

        // Idempotency Key enforcement
        $idempotencyKey = trim($req->getHeaderLine('Idempotency-Key'));
        if ($idempotencyKey === '') {
            $idempotencyKey = trim((string) ($b['idempotencyKey'] ?? ''));
        }
        if ($idempotencyKey !== '') {
            $existingTx = Db::one(
                'SELECT * FROM payment_transactions WHERE tenant_id = ? AND idempotency_key = ?',
                [$tid, $idempotencyKey]
            );
            if ($existingTx) {
                return Http::json($res, [
                    'ok' => true,
                    'idempotentReplay' => true,
                    'status' => $inv['status'],
                    'transactionId' => (int) $existingTx['id'],
                    'transactionUid' => $existingTx['transaction_uid'],
                    'idempotencyKey' => $existingTx['idempotency_key'],
                    'reference' => $existingTx['payment_reference'],
                    'requiresVerification' => $existingTx['status'] !== 'succeeded',
                    'message' => 'Idempotent payment submission replayed; awaiting independent verification.',
                ]);
            }
        } else {
            $idempotencyKey = 'idem_' . $invId . '_' . bin2hex(random_bytes(10));
        }

        if ($reference === '') {
            $reference = strtoupper($method) . '-' . strtoupper(substr(bin2hex(random_bytes(4)), 0, 8));
        }

        // Stage 1 NEVER marks an invoice as 'paid'.
        // Both manual bank transfers and online gateway submissions enter 'reconciling' (or 'pending' transaction state)
        // until Stage 2 verification (signed gateway webhook or authorized finance/owner reconciliation).
        $newInvoiceStatus = 'reconciling';
        $txStatus = in_array($method, ['stripe_card', 'mpaisa_fiji', 'mycash_fiji', 'paypal'], true)
            ? 'pending'
            : 'reconciling';

        $txUid = 'TXN-' . strtoupper(bin2hex(random_bytes(8)));
        $amount = (float) $inv['total_amount'];
        $currency = (string) ($inv['currency'] ?: 'FJD');
        $immutableHash = hash('sha256', implode('|', [
            $tid,
            $invId,
            $txUid,
            $idempotencyKey,
            $method,
            $reference,
            number_format($amount, 2, '.', ''),
            $currency,
            $txStatus,
        ]));

        $pdo = Db::pdo();
        $pdo->beginTransaction();
        try {
            $txId = Db::insert(
                'INSERT INTO payment_transactions
                 (tenant_id, invoice_id, user_id, transaction_uid, idempotency_key, provider, payment_reference, bank_name, amount, currency, status, webhook_signature_verified, raw_payload, immutable_hash)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)',
                [
                    $tid,
                    $invId,
                    $u['id'],
                    $txUid,
                    $idempotencyKey,
                    $method,
                    $reference,
                    $bankName,
                    $amount,
                    $currency,
                    $txStatus,
                    json_encode([
                        'submittedBy' => $u['email'] ?? $u['id'],
                        'notes' => $b['notes'] ?? null,
                    ]),
                    $immutableHash,
                ]
            );

            Db::run(
                'UPDATE invoices
                 SET status = ?, payment_method = ?, payment_reference = ?, bank_name = ?
                 WHERE id = ? AND tenant_id = ?',
                [$newInvoiceStatus, $method, $reference, $bankName, $invId, $tid]
            );

            Db::run(
                "UPDATE tenants SET payment_status = 'pending', payment_reference = ?, payment_method = ? WHERE id = ?",
                [$reference, $method, $tid]
            );

            Db::run(
                "INSERT INTO subscription_history (tenant_id, user_id, to_plan_id, action, amount, currency, payment_method, reference, notes)
                 VALUES (?, ?, ?, 'payment_submitted', ?, ?, ?, ?, ?)",
                [
                    $tid,
                    $u['id'],
                    $inv['plan_id'],
                    $amount,
                    $currency,
                    $method,
                    $reference,
                    "Payment submission ({$txUid}) recorded for Invoice {$inv['invoice_number']}; awaiting verification.",
                ]
            );

            $auditHash = $this->appendImmutablePaymentAudit(
                $tid,
                $invId,
                $txId,
                (int) $u['id'],
                'payment.submitted',
                $amount,
                $currency,
                (string) $inv['status'],
                $newInvoiceStatus,
                [
                    'transaction_uid' => $txUid,
                    'idempotency_key' => $idempotencyKey,
                    'provider' => $method,
                    'reference' => $reference,
                ]
            );

            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }

        Audit::log('billing.payment_submitted', 'invoice', $invId, [
            'status' => $newInvoiceStatus,
            'transaction_uid' => $txUid,
            'method' => $method,
            'reference' => $reference,
        ]);

        return Http::json($res, [
            'ok' => true,
            'status' => $newInvoiceStatus,
            'transactionId' => $txId,
            'transactionUid' => $txUid,
            'transactionStatus' => $txStatus,
            'idempotencyKey' => $idempotencyKey,
            'reference' => $reference,
            'auditHash' => $auditHash,
            'requiresVerification' => true,
            'message' => in_array($method, ['stripe_card', 'mpaisa_fiji', 'mycash_fiji', 'paypal'], true)
                ? "Payment transaction ({$txUid}) initiated via {$method}. Awaiting signed gateway webhook or finance verification."
                : "Bank transfer reference ({$reference}) submitted for finance reconciliation.",
        ]);
    }

    /**
     * STAGE 2A — AUTHORIZED FINANCE / OWNER / PLATFORM ADMIN PAYMENT VERIFICATION
     * POST /api/v1/billing/invoices/{id}/reconcile
     *
     * Strictly requires `billing.reconcile` permission (`owner`, `finance`, or platform `admin`).
     * Ordinary tenant users (`editor`, `viewer`, regular `admin`) and API keys are rejected with 403 Forbidden.
     */
    public function reconcileInvoice(Request $req, Response $res, array $args): Response
    {
        self::ensureBillingSecuritySchema();
        $u = $req->getAttribute('user');

        // Strict RBAC check: owner, finance, or platform administrator only
        if (!Rbac::can($u, 'billing.reconcile') || !$this->isFinanceOrOwnerOrPlatformAdmin($u)) {
            SecurityMonitor::logEvent(
                'unauthorized_invoice_reconciliation_attempt',
                'critical',
                [
                    'invoice_id' => (int) ($args['id'] ?? 0),
                    'user_role' => $u['role'] ?? null,
                    'tenant_role' => $u['tenant_role'] ?? null,
                    'via_api_key' => TenantContext::isApiKeyAuth(),
                ],
                isset($u['id']) ? (int) $u['id'] : null,
                $this->resolveTenantId($req)
            );
            return Http::error(
                $res,
                'Forbidden: Invoice reconciliation requires owner, finance administrator, or platform administrator permission',
                403
            );
        }

        $tid = $this->resolveTenantId($req);
        $invId = (int) $args['id'];
        $b = (array) $req->getParsedBody();
        $decision = strtolower(trim((string) ($b['decision'] ?? 'approve')));
        $notes = trim((string) ($b['notes'] ?? 'Verified by authorized finance administrator'));

        $inv = Db::one('SELECT * FROM invoices WHERE id = ? AND tenant_id = ?', [$invId, $tid]);
        if (!$inv) {
            return Http::error($res, 'Invoice not found', 404);
        }

        if ($decision === 'reject') {
            $pdo = Db::pdo();
            $pdo->beginTransaction();
            try {
                Db::run(
                    "UPDATE invoices SET status = 'overdue', notes = ? WHERE id = ? AND tenant_id = ?",
                    [$notes, $invId, $tid]
                );
                Db::run(
                    "UPDATE payment_transactions SET status = 'failed', verified_by = ?, verified_at = NOW() WHERE invoice_id = ? AND tenant_id = ? AND status IN ('pending','reconciling')",
                    [$u['id'], $invId, $tid]
                );
                Db::run(
                    "UPDATE tenants SET payment_status = 'overdue' WHERE id = ?",
                    [$tid]
                );
                $auditHash = $this->appendImmutablePaymentAudit(
                    $tid,
                    $invId,
                    null,
                    (int) $u['id'],
                    'payment.rejected',
                    (float) $inv['total_amount'],
                    (string) $inv['currency'],
                    (string) $inv['status'],
                    'overdue',
                    ['notes' => $notes]
                );
                $pdo->commit();
            } catch (\Throwable $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                throw $e;
            }

            Audit::log('billing.reconcile_rejected', 'invoice', $invId, ['notes' => $notes]);
            return Http::json($res, [
                'ok' => true,
                'status' => 'overdue',
                'auditHash' => $auditHash,
                'message' => "Invoice {$inv['invoice_number']} reconciliation rejected and marked overdue.",
            ]);
        }

        // STAGE 3: Execute Atomic Subscription Activation & Payment Verification
        $ref = trim((string) ($b['paymentReference'] ?? $inv['payment_reference'] ?: ('BSP-REC-' . date('Ymd'))));
        $activation = $this->activateSubscriptionFromVerifiedPayment(
            $tid,
            $invId,
            (int) $u['id'],
            (string) ($inv['payment_method'] ?: 'bank_transfer_fiji'),
            $ref,
            false,
            $notes
        );

        Audit::log('billing.reconcile_approved', 'invoice', $invId, [
            'reference' => $ref,
            'transaction_uid' => $activation['transactionUid'],
            'audit_hash' => $activation['auditHash'],
        ]);

        return Http::json($res, [
            'ok' => true,
            'status' => 'paid',
            'transactionId' => $activation['transactionId'],
            'transactionUid' => $activation['transactionUid'],
            'auditHash' => $activation['auditHash'],
            'message' => "Invoice {$inv['invoice_number']} verified, marked as PAID, and subscription activated.",
        ]);
    }

    /**
     * STAGE 2B — SIGNED PAYMENT GATEWAY WEBHOOK VERIFICATION
     * POST /api/v1/billing/webhooks/{provider}
     *
     * Verifies HMAC-SHA256 signature in `X-Payment-Signature` header before confirming or reversing payment.
     * Enforces idempotency via `idempotencyKey` or `eventId`.
     */
    public function handlePaymentWebhook(Request $req, Response $res, array $args): Response
    {
        self::ensureBillingSecuritySchema();
        $provider = strtolower(trim((string) ($args['provider'] ?? 'stripe_card')));
        $rawBody = (string) $req->getBody();
        $sigHeader = trim($req->getHeaderLine('X-Payment-Signature'));

        if ($sigHeader === '') {
            SecurityMonitor::logEvent('payment_webhook_missing_signature', 'critical', [
                'provider' => $provider,
            ]);
            return Http::error($res, 'Unauthorized: Missing X-Payment-Signature header', 401);
        }

        $secret = self::webhookSigningSecret($provider);
        if (!$this->verifyWebhookSignature($rawBody, $sigHeader, $secret)) {
            SecurityMonitor::logEvent('payment_webhook_invalid_signature', 'critical', [
                'provider' => $provider,
                'signature_header' => substr($sigHeader, 0, 32),
            ]);
            return Http::error($res, 'Unauthorized: Invalid payment webhook signature', 401);
        }

        $payload = json_decode($rawBody, true);
        if (!is_array($payload)) {
            $payload = (array) $req->getParsedBody();
        }

        $eventType = strtolower(trim((string) ($payload['event'] ?? $payload['type'] ?? 'payment.succeeded')));
        $invoiceId = (int) ($payload['invoiceId'] ?? $payload['invoice_id'] ?? 0);
        $tenantId = (int) ($payload['tenantId'] ?? $payload['tenant_id'] ?? 0);
        $eventId = trim((string) ($payload['eventId'] ?? $payload['id'] ?? $req->getHeaderLine('Idempotency-Key')));
        $reference = trim((string) ($payload['paymentReference'] ?? $payload['reference'] ?? ('WH-' . strtoupper($provider) . '-' . date('YmdHis'))));

        if ($invoiceId <= 0) {
            return Http::error($res, 'Invalid webhook payload: missing invoiceId', 422);
        }
        if ($tenantId <= 0) {
            // Tenant-less invoice lookups are never allowed; gateway payloads must carry the tenant reference.
            return Http::error($res, 'Invalid webhook payload: missing tenantId', 422);
        }

        $inv = Db::one('SELECT * FROM invoices WHERE id = ? AND tenant_id = ?', [$invoiceId, $tenantId]);

        if (!$inv) {
            return Http::error($res, 'Invoice not found for webhook', 404);
        }
        $tid = (int) $inv['tenant_id'];

        // Durable inbox of every verified gateway event (replay evidence + idempotency by provider/event id)
        $webhookKey = $eventId !== '' ? $eventId : ('anon_' . hash('sha256', $rawBody));
        $webhookRecorded = false;
        try {
            $webhookRecorded = Db::run(
                "INSERT IGNORE INTO payment_webhook_events (tenant_id, provider, event_id, event_type, signature_verified, invoice_id, payload)
                 VALUES (?, ?, ?, ?, 1, ?, ?)",
                [$tid, $provider, substr($webhookKey, 0, 120), substr($eventType, 0, 80), $invoiceId, $rawBody !== '' ? json_encode($payload) : null]
            ) > 0;
        } catch (\Throwable) {
        }
        $markWebhook = static function (string $status, ?string $error = null) use ($provider, $webhookKey): void {
            try {
                Db::run(
                    'UPDATE payment_webhook_events SET status = ?, error_message = ?, processed_at = NOW() WHERE provider = ? AND event_id = ?',
                    [$status, $error, $provider, substr($webhookKey, 0, 120)]
                );
            } catch (\Throwable) {
            }
        };

        // Idempotency check for webhook event
        if ($eventId !== '') {
            $existingTx = Db::one(
                'SELECT * FROM payment_transactions WHERE tenant_id = ? AND idempotency_key = ?',
                [$tid, 'wh_' . $eventId]
            );
            if ($existingTx && in_array($existingTx['status'], ['succeeded', 'reversed'], true)) {
                return Http::json($res, [
                    'ok' => true,
                    'idempotentReplay' => true,
                    'status' => $inv['status'],
                    'transactionUid' => $existingTx['transaction_uid'],
                    'message' => 'Webhook event already processed idempotently.',
                ]);
            }
        }

        if (in_array($eventType, ['payment.reversed', 'payment.refunded', 'charge.dispute.created'], true)) {
            $reason = trim((string) ($payload['reason'] ?? "Reversed via signed {$provider} webhook"));
            $reversal = $this->executePaymentReversal($tid, $invoiceId, null, $reason, true);
            $markWebhook('processed');
            return Http::json($res, [
                'ok' => true,
                'status' => 'reversed',
                'transactionUid' => $reversal['transactionUid'],
                'auditHash' => $reversal['auditHash'],
                'message' => "Payment reversed via verified {$provider} webhook.",
            ]);
        }

        // Default: payment.succeeded / invoice.paid
        $activation = $this->activateSubscriptionFromVerifiedPayment(
            $tid,
            $invoiceId,
            null,
            $provider,
            $reference,
            true,
            "Confirmed via signed {$provider} payment webhook",
            $eventId !== '' ? ('wh_' . $eventId) : null
        );
        $markWebhook('processed');

        return Http::json($res, [
            'ok' => true,
            'status' => 'paid',
            'webhookVerified' => true,
            'transactionId' => $activation['transactionId'],
            'transactionUid' => $activation['transactionUid'],
            'auditHash' => $activation['auditHash'],
            'message' => "Invoice {$inv['invoice_number']} paid and subscription activated via signed {$provider} webhook.",
        ]);
    }

    /**
     * STAGE 3 — TRUSTED ATOMIC SUBSCRIPTION ACTIVATION SERVICE
     * Updates invoice, payment_transactions, tenant subscription state, subscription_history,
     * and cryptographically chained payment_audit_logs in a single database transaction.
     */
    private function activateSubscriptionFromVerifiedPayment(
        int $tenantId,
        int $invoiceId,
        ?int $verifiedByUserId,
        string $provider,
        string $reference,
        bool $webhookVerified,
        string $notes,
        ?string $webhookIdempotencyKey = null
    ): array {
        $pdo = Db::pdo();
        $pdo->beginTransaction();
        try {
            $inv = Db::one(
                'SELECT * FROM invoices WHERE id = ? AND tenant_id = ? FOR UPDATE',
                [$invoiceId, $tenantId]
            );
            if (!$inv) {
                throw new \RuntimeException('Invoice not found inside transaction', 404);
            }

            $prevStatus = (string) $inv['status'];
            $amount = (float) $inv['total_amount'];
            $currency = (string) ($inv['currency'] ?: 'FJD');
            $cycle = (string) ($inv['billing_cycle'] ?: 'monthly');
            $intervalDays = $cycle === 'annually' ? 365 : ($cycle === 'quarterly' ? 90 : 30);

            // Locate existing pending/reconciling transaction or create a verified transaction record
            $tx = Db::one(
                'SELECT * FROM payment_transactions WHERE invoice_id = ? AND tenant_id = ? ORDER BY id DESC LIMIT 1 FOR UPDATE',
                [$invoiceId, $tenantId]
            );

            if ($tx) {
                $txId = (int) $tx['id'];
                $txUid = (string) $tx['transaction_uid'];
                $idemKey = $webhookIdempotencyKey ?: (string) $tx['idempotency_key'];
                $immutableHash = hash('sha256', implode('|', [
                    $tenantId,
                    $invoiceId,
                    $txUid,
                    $idemKey,
                    $provider,
                    $reference,
                    number_format($amount, 2, '.', ''),
                    $currency,
                    'succeeded',
                    $webhookVerified ? '1' : '0',
                ]));

                Db::run(
                    "UPDATE payment_transactions
                     SET status = 'succeeded',
                         payment_reference = ?,
                         webhook_signature_verified = ?,
                         verified_by = ?,
                         verified_at = NOW(),
                         idempotency_key = ?,
                         immutable_hash = ?
                     WHERE id = ?",
                    [$reference, $webhookVerified ? 1 : 0, $verifiedByUserId, $idemKey, $immutableHash, $txId]
                );
            } else {
                $txUid = 'TXN-' . strtoupper(bin2hex(random_bytes(8)));
                $idemKey = $webhookIdempotencyKey ?: ('idem_ver_' . $invoiceId . '_' . bin2hex(random_bytes(8)));
                $immutableHash = hash('sha256', implode('|', [
                    $tenantId,
                    $invoiceId,
                    $txUid,
                    $idemKey,
                    $provider,
                    $reference,
                    number_format($amount, 2, '.', ''),
                    $currency,
                    'succeeded',
                    $webhookVerified ? '1' : '0',
                ]));

                $txId = Db::insert(
                    "INSERT INTO payment_transactions
                     (tenant_id, invoice_id, user_id, transaction_uid, idempotency_key, provider, payment_reference, amount, currency, status, webhook_signature_verified, verified_by, verified_at, immutable_hash)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'succeeded', ?, ?, NOW(), ?)",
                    [
                        $tenantId,
                        $invoiceId,
                        $verifiedByUserId,
                        $txUid,
                        $idemKey,
                        $provider,
                        $reference,
                        $amount,
                        $currency,
                        $webhookVerified ? 1 : 0,
                        $verifiedByUserId,
                        $immutableHash,
                    ]
                );
            }

            // 1. Mark invoice as PAID
            Db::run(
                "UPDATE invoices
                 SET status = 'paid',
                     paid_at = NOW(),
                     reconciled_by = ?,
                     payment_method = ?,
                     payment_reference = ?,
                     notes = ?
                 WHERE id = ? AND tenant_id = ?",
                [$verifiedByUserId, $provider, $reference, $notes, $invoiceId, $tenantId]
            );

            // 2. Activate / renew tenant subscription atomically
            Db::run(
                "UPDATE tenants
                 SET payment_status = 'paid',
                     is_active = 1,
                     suspended_at = NULL,
                     suspension_reason = NULL,
                     last_payment_date = CURDATE(),
                     next_billing_date = DATE_ADD(CURDATE(), INTERVAL ? DAY),
                     payment_reference = ?,
                     payment_method = ?
                 WHERE id = ?",
                [$intervalDays, $reference, $provider, $tenantId]
            );

            // 3. Record subscription lifecycle history
            Db::run(
                "INSERT INTO subscription_history (tenant_id, user_id, to_plan_id, action, amount, currency, payment_method, reference, notes)
                 VALUES (?, ?, ?, 'reconciliation', ?, ?, ?, ?, ?)",
                [
                    $tenantId,
                    $verifiedByUserId,
                    $inv['plan_id'],
                    $amount,
                    $currency,
                    $provider,
                    $reference,
                    $notes,
                ]
            );

            // 4. Append immutable SHA-256 hash-chained payment audit record
            $auditHash = $this->appendImmutablePaymentAudit(
                $tenantId,
                $invoiceId,
                $txId,
                $verifiedByUserId,
                'payment.verified_and_activated',
                $amount,
                $currency,
                $prevStatus,
                'paid',
                [
                    'transaction_uid' => $txUid,
                    'provider' => $provider,
                    'reference' => $reference,
                    'webhook_verified' => $webhookVerified,
                    'notes' => $notes,
                ]
            );

            Outbox::enqueue($tenantId, 'invoice', $invoiceId, 'invoice.paid', [
                'invoice_id' => $invoiceId,
                'invoice_number' => $inv['invoice_number'] ?? null,
                'amount' => $amount,
                'currency' => $currency,
                'provider' => $provider,
                'transaction_uid' => $txUid,
            ]);

            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }

        WebhookDispatcher::dispatch($tenantId, 'invoice.paid', [
            'invoiceId' => $invoiceId,
            'invoiceNumber' => $inv['invoice_number'],
            'transactionUid' => $txUid,
            'amount' => $amount,
            'currency' => $currency,
        ]);

        return [
            'transactionId' => $txId,
            'transactionUid' => $txUid,
            'auditHash' => $auditHash,
        ];
    }

    /**
     * PAYMENT REVERSAL / REFUND / CHARGEBACK HANDLER
     * POST /api/v1/billing/invoices/{id}/reverse
     *
     * Strictly requires `billing.reconcile` permission (`owner`, `finance`, or platform `admin`).
     */
    public function reversePayment(Request $req, Response $res, array $args): Response
    {
        self::ensureBillingSecuritySchema();
        $u = $req->getAttribute('user');

        if (!Rbac::can($u, 'billing.reconcile') || !$this->isFinanceOrOwnerOrPlatformAdmin($u)) {
            SecurityMonitor::logEvent(
                'unauthorized_payment_reversal_attempt',
                'critical',
                [
                    'invoice_id' => (int) ($args['id'] ?? 0),
                    'user_role' => $u['role'] ?? null,
                    'tenant_role' => $u['tenant_role'] ?? null,
                ],
                isset($u['id']) ? (int) $u['id'] : null,
                $this->resolveTenantId($req)
            );
            return Http::error(
                $res,
                'Forbidden: Payment reversal requires owner, finance administrator, or platform administrator permission',
                403
            );
        }

        $tid = $this->resolveTenantId($req);
        $invId = (int) $args['id'];
        $b = (array) $req->getParsedBody();
        $reason = trim((string) ($b['reason'] ?? 'Payment reversed / refunded by finance administrator'));

        $inv = Db::one('SELECT * FROM invoices WHERE id = ? AND tenant_id = ?', [$invId, $tid]);
        if (!$inv) {
            return Http::error($res, 'Invoice not found', 404);
        }
        if ($inv['status'] !== 'paid') {
            return Http::error($res, 'Only paid invoices can be reversed', 422);
        }

        $reversal = $this->executePaymentReversal($tid, $invId, (int) $u['id'], $reason, false);

        Audit::log('billing.payment_reversed', 'invoice', $invId, [
            'reason' => $reason,
            'transaction_uid' => $reversal['transactionUid'],
            'audit_hash' => $reversal['auditHash'],
        ]);

        return Http::json($res, [
            'ok' => true,
            'status' => 'reversed',
            'transactionUid' => $reversal['transactionUid'],
            'auditHash' => $reversal['auditHash'],
            'message' => "Payment for Invoice {$inv['invoice_number']} has been reversed and recorded in the immutable audit log.",
        ]);
    }

    private function executePaymentReversal(
        int $tenantId,
        int $invoiceId,
        ?int $actorUserId,
        string $reason,
        bool $viaWebhook
    ): array {
        $pdo = Db::pdo();
        $pdo->beginTransaction();
        try {
            $inv = Db::one(
                'SELECT * FROM invoices WHERE id = ? AND tenant_id = ? FOR UPDATE',
                [$invoiceId, $tenantId]
            );
            if (!$inv) {
                throw new \RuntimeException('Invoice not found', 404);
            }

            $prevStatus = (string) $inv['status'];
            $amount = (float) $inv['total_amount'];
            $currency = (string) ($inv['currency'] ?: 'FJD');

            $tx = Db::one(
                'SELECT * FROM payment_transactions WHERE invoice_id = ? AND tenant_id = ? ORDER BY id DESC LIMIT 1 FOR UPDATE',
                [$invoiceId, $tenantId]
            );
            $txId = $tx ? (int) $tx['id'] : null;
            $txUid = $tx ? (string) $tx['transaction_uid'] : ('TXN-REV-' . strtoupper(bin2hex(random_bytes(6))));

            if ($txId !== null) {
                Db::run(
                    "UPDATE payment_transactions
                     SET status = 'reversed',
                         reversal_reason = ?,
                         reversed_by = ?,
                         reversed_at = NOW()
                     WHERE id = ?",
                    [$reason, $actorUserId, $txId]
                );
            }

            Db::run(
                "UPDATE invoices SET status = 'reversed', notes = ? WHERE id = ? AND tenant_id = ?",
                [$reason, $invoiceId, $tenantId]
            );

            Db::run(
                "UPDATE tenants SET payment_status = 'overdue' WHERE id = ?",
                [$tenantId]
            );

            Db::run(
                "INSERT INTO subscription_history (tenant_id, user_id, to_plan_id, action, amount, currency, payment_method, reference, notes)
                 VALUES (?, ?, ?, 'reversal', ?, ?, ?, ?, ?)",
                [
                    $tenantId,
                    $actorUserId,
                    $inv['plan_id'],
                    $amount,
                    $currency,
                    $inv['payment_method'],
                    $inv['payment_reference'],
                    $reason,
                ]
            );

            $auditHash = $this->appendImmutablePaymentAudit(
                $tenantId,
                $invoiceId,
                $txId,
                $actorUserId,
                'payment.reversed',
                $amount,
                $currency,
                $prevStatus,
                'reversed',
                [
                    'transaction_uid' => $txUid,
                    'reason' => $reason,
                    'via_webhook' => $viaWebhook,
                ]
            );

            Outbox::enqueue($tenantId, 'invoice', $invoiceId, 'invoice.payment_reversed', [
                'invoice_id' => $invoiceId,
                'invoice_number' => $inv['invoice_number'] ?? null,
                'amount' => $amount,
                'currency' => $currency,
                'transaction_uid' => $txUid,
                'reason' => $reason,
            ]);

            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }

        return [
            'transactionUid' => $txUid,
            'auditHash' => $auditHash,
        ];
    }

    /**
     * Verify HMAC-SHA256 payment webhook signature.
     * Supports both `t=<timestamp>,v1=<hex_hmac>` and raw `<hex_hmac>` formats.
     */
    private function verifyWebhookSignature(string $rawBody, string $sigHeader, string $secret): bool
    {
        if (str_contains($sigHeader, 'v1=')) {
            $parts = [];
            foreach (explode(',', $sigHeader) as $segment) {
                [$k, $v] = array_pad(explode('=', trim($segment), 2), 2, '');
                $parts[$k] = $v;
            }
            $timestamp = $parts['t'] ?? '';
            $v1 = $parts['v1'] ?? '';
            if ($timestamp === '' || $v1 === '') {
                return false;
            }
            // Reject replay attacks older than 5 minutes
            if (abs(time() - (int) $timestamp) > 300) {
                return false;
            }
            $expected = hash_hmac('sha256', $timestamp . '.' . $rawBody, $secret);
            return hash_equals($expected, $v1);
        }

        $expected = hash_hmac('sha256', $rawBody, $secret);
        return hash_equals($expected, $sigHeader);
    }
}
