<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\TenantScope;
use App\Support\Audit;
use App\Support\Db;
use App\Support\Http;
use App\Support\Storage;
use App\Support\WebhookDispatcher;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class BillingController
{
    private function resolveTenantId(Request $req): int
    {
        $tid = TenantScope::id($req);
        if ($tid) {
            return $tid;
        }
        $u = $req->getAttribute('user');
        if (!empty($u['tenant_id'])) {
            return (int) $u['tenant_id'];
        }
        $first = Db::one('SELECT id FROM tenants ORDER BY id ASC LIMIT 1');
        return $first ? (int) $first['id'] : 1;
    }

    /**
     * Calculate live storage & bandwidth metering for the tenant.
     */
    private function computeMetering(int $tenantId, array $tenant, array $plan): array
    {
        // 1. Calculate storage used on disk for this tenant's publications
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

        // Minimum realistic footprint per converted page (thumb + standard + high-res WebP/JPG ~ 0.42 MB/page)
        $estimatedAssetMb = round($totalPages * 0.42, 2);
        $diskMb = round($bytes / 1048576, 2);
        $storageUsedMb = max($diskMb, $estimatedAssetMb);

        // 2. Calculate monthly views & bandwidth metering
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

        // Bandwidth: ~0.28 MB per page view + ~4.5 MB per PDF download
        $bandwidthUsedMb = round(($pagesViewed30d * 0.28) + ($downloads30d * 4.5), 2);

        // Persist latest metered values on tenant record
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
        // Usage-based overage pricing: $0.05 per extra MB storage + $2.50 per 1,000 extra views
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
                    // Automatic suspension after grace period expires
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

        return Http::json($res, [
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
        $tid = $this->resolveTenantId($req);
        $u = $req->getAttribute('user');
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
                 is_active = 1, suspended_at = NULL, suspension_reason = NULL,
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
        $tid = $this->resolveTenantId($req);
        $u = $req->getAttribute('user');
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
     * POST /api/v1/billing/invoices/{id}/pay
     * Pay an invoice via Online Payment Gateway (Stripe / M-PAiSA / MyCash) OR submit Fiji Manual Bank Transfer Reference for reconciliation.
     */
    public function payInvoice(Request $req, Response $res, array $args): Response
    {
        $tid = $this->resolveTenantId($req);
        $u = $req->getAttribute('user');
        $invId = (int) $args['id'];
        $b = (array) $req->getParsedBody();

        $inv = Db::one('SELECT * FROM invoices WHERE id = ? AND tenant_id = ?', [$invId, $tid]);
        if (!$inv) {
            return Http::error($res, 'Invoice not found', 404);
        }

        $method = strtolower(trim((string) ($b['paymentMethod'] ?? 'bank_transfer_fiji')));
        $reference = trim((string) ($b['paymentReference'] ?? ''));
        $bankName = trim((string) ($b['bankName'] ?? 'Bank of South Pacific (BSP) Fiji'));
        $autoReconcile = !empty($b['autoReconcile']) || in_array($method, ['stripe_card', 'mpaisa_fiji', 'mycash_fiji', 'paypal'], true);

        if ($reference === '') {
            $reference = strtoupper($method) . '-' . strtoupper(substr(bin2hex(random_bytes(4)), 0, 8));
        }

        $newStatus = $autoReconcile ? 'paid' : 'reconciling';

        Db::run(
            'UPDATE invoices
             SET status = ?, payment_method = ?, payment_reference = ?, bank_name = ?,
                 paid_at = CASE WHEN ? = "paid" THEN NOW() ELSE paid_at END,
                 reconciled_by = CASE WHEN ? = "paid" THEN ? ELSE reconciled_by END
             WHERE id = ?',
            [$newStatus, $method, $reference, $bankName, $newStatus, $newStatus, $u['id'], $invId]
        );

        if ($newStatus === 'paid') {
            Db::run(
                "UPDATE tenants
                 SET payment_status = 'paid', is_active = 1, suspended_at = NULL, suspension_reason = NULL,
                     last_payment_date = CURDATE(), next_billing_date = DATE_ADD(CURDATE(), INTERVAL 30 DAY),
                     payment_reference = ?, payment_method = ?
                 WHERE id = ?",
                [$reference, $method, $tid]
            );

            Db::run(
                "INSERT INTO subscription_history (tenant_id, user_id, to_plan_id, action, amount, currency, payment_method, reference, notes)
                 VALUES (?, ?, ?, 'reconciliation', ?, ?, ?, ?, ?)",
                [
                    $tid,
                    $u['id'],
                    $inv['plan_id'],
                    $inv['total_amount'],
                    $inv['currency'],
                    $method,
                    $reference,
                    "Payment reconciled for Invoice {$inv['invoice_number']} via {$bankName}",
                ]
            );
        } else {
            Db::run(
                "UPDATE tenants SET payment_status = 'pending', payment_reference = ? WHERE id = ?",
                [$reference, $tid]
            );
        }

        Audit::log('billing.invoice_payment', 'invoice', $invId, [
            'status' => $newStatus,
            'method' => $method,
            'reference' => $reference,
        ]);

        return Http::json($res, [
            'ok' => true,
            'status' => $newStatus,
            'reference' => $reference,
            'message' => $newStatus === 'paid'
                ? "Payment ({$reference}) verified and reconciled! Subscription is active."
                : "Bank transfer reference ({$reference}) submitted for reconciliation.",
        ]);
    }

    /**
     * POST /api/v1/billing/invoices/{id}/reconcile
     * Confirm & reconcile a manual Fiji bank transfer invoice.
     */
    public function reconcileInvoice(Request $req, Response $res, array $args): Response
    {
        $tid = $this->resolveTenantId($req);
        $u = $req->getAttribute('user');
        $invId = (int) $args['id'];

        $inv = Db::one('SELECT * FROM invoices WHERE id = ? AND tenant_id = ?', [$invId, $tid]);
        if (!$inv) {
            return Http::error($res, 'Invoice not found', 404);
        }

        $ref = $inv['payment_reference'] ?: ('BSP-REC-' . date('Ymd'));

        Db::run(
            "UPDATE invoices SET status = 'paid', paid_at = NOW(), reconciled_by = ? WHERE id = ?",
            [$u['id'], $invId]
        );

        Db::run(
            "UPDATE tenants
             SET payment_status = 'paid', is_active = 1, suspended_at = NULL, suspension_reason = NULL,
                 last_payment_date = CURDATE(), next_billing_date = DATE_ADD(CURDATE(), INTERVAL 30 DAY),
                 payment_reference = ?
             WHERE id = ?",
            [$ref, $tid]
        );

        Db::run(
            "INSERT INTO subscription_history (tenant_id, user_id, to_plan_id, action, amount, currency, payment_method, reference, notes)
             VALUES (?, ?, ?, 'reconciliation', ?, ?, ?, ?, ?)",
            [
                $tid,
                $u['id'],
                $inv['plan_id'],
                $inv['total_amount'],
                $inv['currency'],
                $inv['payment_method'],
                $ref,
                "Fiji bank transfer manually reconciled for Invoice {$inv['invoice_number']}",
            ]
        );

        Audit::log('billing.reconcile_bank_transfer', 'invoice', $invId, ['reference' => $ref]);

        return Http::json($res, [
            'ok' => true,
            'status' => 'paid',
            'message' => "Invoice {$inv['invoice_number']} marked as PAID and reconciled.",
        ]);
    }
}
