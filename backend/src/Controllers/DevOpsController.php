<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Infrastructure\Backup\BackupManager;
use App\Infrastructure\Database\MigrationRunner;
use App\Infrastructure\Logging\CentralExceptionReporter;
use App\Infrastructure\Logging\JsonLogger;
use App\Infrastructure\Monitoring\SystemHealthService;
use App\Infrastructure\Queue\QueueManager;
use App\Middleware\TenantScope;
use App\Shared\ModuleRegistry;
use App\Support\Audit;
use App\Support\CryptoSecrets;
use App\Support\Http;
use App\Support\Rbac;
use App\Support\SecurityMonitor;
use App\Support\TenantContext;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * DevOps, Telemetry, Backups, Migrations & Infrastructure Controller.
 *
 * Security Control Matrix (P0 Enforced):
 * - Tenant Usage Overview (`GET /devops/overview`): Tenant Admin (`owner`, `admin`) or Platform Admin
 * - Tenant Publication Job Status & DLQ Retry (`GET /devops/jobs`, `POST /devops/dlq/{id}/retry`): Tenant Editor/Admin (`owner`, `admin`, `editor`) or Platform Admin
 * - Tenant Backup Requests (`POST /devops/backups/create`): Tenant Owner (`owner`) or Platform Admin
 * - Backup Recovery Verification (`POST /devops/backups/{id}/verify`): Authorized Operations/Platform Admin or Tenant Owner (strictly for own tenant's backup)
 * - Global Database Migrations (`POST /devops/migrations/run`): Platform Administrator ONLY (`role === 'admin'`)
 * - Global Error Management (`POST /devops/errors/simulate`, `POST /devops/errors/{id}/resolve`): Platform Administrator ONLY (`role === 'admin'`)
 * - Infrastructure Management & Secret Rotation (`POST /devops/dlq/simulate`, `POST /devops/secrets/rotate`): Platform Administrator ONLY (`role === 'admin'`)
 */
final class DevOpsController
{
    private function resolveTenantId(Request $req): ?int
    {
        $tid = TenantScope::id($req);
        if ($tid) {
            return $tid;
        }
        $u = $req->getAttribute('user');
        return !empty($u['tenant_id']) ? (int) $u['tenant_id'] : null;
    }

    private function isPlatformAdmin(?array $user): bool
    {
        if (!$user || TenantContext::isApiKeyAuth()) {
            return false;
        }
        return ($user['role'] ?? '') === 'admin';
    }

    private function requirePlatformAdmin(Request $req, ?array $user, string $operation): void
    {
        if (!$this->isPlatformAdmin($user)) {
            SecurityMonitor::logEvent(
                'unauthorized_devops_platform_action',
                'critical',
                [
                    'operation' => $operation,
                    'user_role' => $user['role'] ?? null,
                    'tenant_role' => $user['tenant_role'] ?? null,
                ],
                isset($user['id']) ? (int) $user['id'] : null,
                $this->resolveTenantId($req)
            );
            throw new \RuntimeException("Forbidden: '{$operation}' is restricted to Platform Administrators only", 403);
        }
        Rbac::authorize($user, 'devops.platform_admin');
    }

    /**
     * GET /api/v1/devops/overview
     * Required access: Tenant admin ('owner', 'admin') or Platform administrator.
     */
    public function overview(Request $req, Response $res): Response
    {
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'devops.overview');

        $tid = $this->resolveTenantId($req);
        $isPlatAdmin = $this->isPlatformAdmin($u);

        return Http::json($res, [
            'accessLevel' => $isPlatAdmin ? 'platform_admin' : 'tenant_admin',
            'architecture' => ModuleRegistry::blueprint(),
            'health' => SystemHealthService::collect($tid, $isPlatAdmin),
            'migrations' => $isPlatAdmin ? MigrationRunner::status() : [],
            'backups' => BackupManager::list($tid, $isPlatAdmin),
            'logs' => JsonLogger::recentEntries(35, $tid, $isPlatAdmin),
            'errorReports' => CentralExceptionReporter::recent($tid, 25, $isPlatAdmin),
            'ciCd' => [
                'pipelineFile' => '.github/workflows/ci-cd.yml',
                'releaseWorkflowFile' => '.github/workflows/release.yml',
                'automatedTests' => [
                    'phpunitConfig' => 'backend/phpunit.xml',
                    'securitySuite' => 'backend/bin/test_security.php',
                    'frontendBuildCheck' => 'tsc -b && vite build',
                ],
                'vulnerabilityScanning' => [
                    'composerAudit' => 'Enabled (composer audit --locked)',
                    'npmAudit' => 'Enabled (npm audit --audit-level=high)',
                    'secretScanning' => 'Domain-Separated 256-bit Secrets + SHA-256 API Keys + Argon2id',
                ],
                'environments' => [
                    ['name' => 'Staging', 'url' => 'https://staging.flipex.nuvistechnologies.com.fj', 'branch' => 'develop / main', 'status' => 'ready'],
                    ['name' => 'Production', 'url' => 'https://flipex.nuvistechnologies.com.fj', 'branch' => 'tags/v*.*.*', 'status' => 'ready'],
                ],
            ],
        ]);
    }

    /**
     * GET /api/v1/devops/jobs
     * Tenant publication job status.
     * Required access: Tenant editor/admin ('owner', 'admin', 'editor') or Platform administrator.
     */
    public function publicationJobs(Request $req, Response $res): Response
    {
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'devops.jobs');

        $tid = $this->resolveTenantId($req);
        $isPlatAdmin = $this->isPlatformAdmin($u);

        return Http::json($res, [
            'ok' => true,
            'tenantId' => $tid,
            'queue' => QueueManager::stats($tid, $isPlatAdmin),
        ]);
    }

    /**
     * POST /api/v1/devops/backups/create
     * Required access: Tenant owner ('owner') or Platform administrator.
     */
    public function createBackup(Request $req, Response $res): Response
    {
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'devops.backup_request');

        $tid = $this->resolveTenantId($req);
        $isPlatAdmin = $this->isPlatformAdmin($u);
        $b = (array) $req->getParsedBody();
        $type = (string) ($b['backupType'] ?? ($isPlatAdmin ? 'full_snapshot' : 'tenant_storage'));

        $snapshot = BackupManager::createSnapshot(
            $tid,
            !empty($u['id']) ? (int) $u['id'] : null,
            $type,
            $isPlatAdmin
        );
        Audit::log('devops.backup_create', 'system_backup', $snapshot['id'] ?? null, [
            'code' => $snapshot['backupCode'] ?? '',
            'tenant_id' => $tid,
        ]);

        return Http::json($res, [
            'ok' => true,
            'backup' => $snapshot,
            'message' => "Created backup snapshot {$snapshot['backupCode']} with verified SHA-256 checksum.",
        ], 201);
    }

    /**
     * POST /api/v1/devops/backups/{id}/verify
     * Required access: Explicitly authorized operations/platform administrator or Tenant owner (for own tenant's backup).
     * Passes tenant ownership context ($tid, $isPlatAdmin) to BackupManager::verifyAndTestRecovery().
     */
    public function verifyBackup(Request $req, Response $res, array $args): Response
    {
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'devops.backup_recovery');

        $id = (int) $args['id'];
        $tid = $this->resolveTenantId($req);
        $isPlatAdmin = $this->isPlatformAdmin($u);

        try {
            $verified = BackupManager::verifyAndTestRecovery($id, $tid, $isPlatAdmin);
            Audit::log('devops.backup_verify_recovery', 'system_backup', $id, ['tenant_id' => $tid]);
            return Http::json($res, [
                'ok' => true,
                'backup' => $verified,
                'message' => $verified['recoveryNotes'] ?? 'Backup recovery verification passed.',
            ]);
        } catch (\Throwable $e) {
            $code = (int) $e->getCode();
            $status = ($code >= 400 && $code < 500) ? $code : 422;
            CentralExceptionReporter::report($e, 'warning', ['backup_id' => $id, 'tenant_id' => $tid]);
            return Http::error($res, $e->getMessage(), $status);
        }
    }

    /**
     * POST /api/v1/devops/dlq/{id}/retry
     * Required access: Tenant editor/admin ('owner', 'admin', 'editor') or Platform administrator.
     * Passes tenant ownership context ($tid, $isPlatAdmin) to QueueManager::retryDeadLetter().
     */
    public function retryDeadLetter(Request $req, Response $res, array $args): Response
    {
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'devops.jobs');

        $tid = $this->resolveTenantId($req);
        $isPlatAdmin = $this->isPlatformAdmin($u);
        $id = (int) $args['id'];

        $ok = QueueManager::retryDeadLetter($id, $tid, $isPlatAdmin);
        if (!$ok) {
            return Http::error($res, 'Dead-letter job not found in your tenant workspace', 404);
        }
        JsonLogger::info("Requeued Dead-Letter Job #{$id} into active worker queue", ['dlq_id' => $id, 'tenant_id' => $tid]);
        return Http::json($res, [
            'ok' => true,
            'message' => "Dead-Letter Job #{$id} requeued for worker processing.",
        ]);
    }

    /**
     * POST /api/v1/devops/dlq/simulate
     * Required access: Platform administrator only.
     */
    public function simulateDeadLetter(Request $req, Response $res): Response
    {
        $u = $req->getAttribute('user');
        $this->requirePlatformAdmin($req, $u, 'devops.dlq.simulate');

        $tid = $this->resolveTenantId($req);
        $dlqId = QueueManager::moveToDeadLetter(
            $tid,
            null,
            'document-processing',
            'pdf_conversion',
            ['filename' => 'corrupted_catalogue_scan.pdf', 'stage' => 'ghostscript_render_high_res'],
            'App\\Modules\\DocumentProcessing\\ConversionTimeoutException',
            'Worker process exceeded 120s timeout on page 48 during 2400px high-res WebP rendering (exhausted 3 retries)',
            3
        );
        JsonLogger::warning("Moved exhausted job to Dead-Letter Queue (DLQ #{$dlqId})", ['dlq_id' => $dlqId]);

        return Http::json($res, [
            'ok' => true,
            'dlqId' => $dlqId,
            'message' => "Simulated exhausted job moved to Dead-Letter Queue (#{$dlqId}).",
        ], 201);
    }

    /**
     * POST /api/v1/devops/errors/simulate
     * Required access: Platform administrator only.
     */
    public function simulateErrorReport(Request $req, Response $res): Response
    {
        $u = $req->getAttribute('user');
        $this->requirePlatformAdmin($req, $u, 'devops.errors.simulate');

        $ex = new \RuntimeException('Simulated S3 edge replication timeout while syncing static WebP assets to ap-southeast-2');
        $reportId = CentralExceptionReporter::report($ex, 'warning', [
            'component' => 'Infrastructure\\Storage\\ObjectStorageAdapter',
            'retry_scheduled' => true,
        ]);

        return Http::json($res, [
            'ok' => true,
            'reportId' => $reportId,
            'message' => "Captured exception in Centralised Error Monitor (Report #{$reportId}) and appended to structured JSONL log.",
        ], 201);
    }

    /**
     * POST /api/v1/devops/errors/{id}/resolve
     * Required access: Platform administrator only (and passes tenant ownership context to CentralExceptionReporter::resolve()).
     */
    public function resolveErrorReport(Request $req, Response $res, array $args): Response
    {
        $u = $req->getAttribute('user');
        $this->requirePlatformAdmin($req, $u, 'devops.errors.resolve');

        $id = (int) $args['id'];
        $tid = $this->resolveTenantId($req);
        $isPlatAdmin = $this->isPlatformAdmin($u);

        $resolved = CentralExceptionReporter::resolve($id, $tid, $isPlatAdmin);
        if (!$resolved) {
            return Http::error($res, 'Error report not found', 404);
        }

        JsonLogger::info("Resolved centralised error report #{$id}", ['report_id' => $id, 'tenant_id' => $tid]);
        return Http::json($res, ['ok' => true]);
    }

    /**
     * POST /api/v1/devops/migrations/run
     * Global database migration.
     * Required access: Platform administrator ONLY. Never available to ordinary tenant users.
     */
    public function runMigrations(Request $req, Response $res): Response
    {
        $u = $req->getAttribute('user');
        $this->requirePlatformAdmin($req, $u, 'devops.migrations.run');

        $result = MigrationRunner::migrateUp();
        Audit::log('devops.migrations_run', 'schema_migration', null, $result);
        JsonLogger::info('Executed versioned reversible database migrations', $result);
        return Http::json($res, $result);
    }

    /**
     * POST /api/v1/devops/secrets/rotate
     * Cryptographic secret rotation procedure.
     * Required access: Platform administrator ONLY.
     */
    public function rotateSecrets(Request $req, Response $res): Response
    {
        $u = $req->getAttribute('user');
        $this->requirePlatformAdmin($req, $u, 'devops.secrets.rotate');

        $envFile = dirname(__DIR__, 2) . '/.env';
        if (!is_file($envFile) || !is_writable($envFile)) {
            return Http::error($res, 'Environment configuration file is not writable for secret rotation', 422);
        }

        $envContent = (string) file_get_contents($envFile);
        [$updatedEnv, $rotatedKeys] = CryptoSecrets::ensureEnvSecrets($envContent, true);
        file_put_contents($envFile, $updatedEnv, LOCK_EX);

        Audit::log('devops.secrets_rotated', 'system', null, ['rotated_keys' => $rotatedKeys]);
        JsonLogger::info('Rotated domain-separated cryptographic secrets', ['rotated_keys' => $rotatedKeys]);

        return Http::json($res, [
            'ok' => true,
            'rotatedKeys' => $rotatedKeys,
            'message' => 'Rotated JWT, Storage Signing, Preview, and Unlock secrets while retaining previous keys for zero-downtime verification.',
        ]);
    }
}
