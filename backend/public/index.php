<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use App\Controllers\AdminController;
use App\Controllers\AnalyticsController;
use App\Controllers\AuthController;
use App\Controllers\BillingController;
use App\Controllers\DevOpsController;
use App\Controllers\FlipbookController;
use App\Controllers\HotspotController;
use App\Controllers\IntegrationController;
use App\Controllers\MeController;
use App\Controllers\PublicController;
use App\Infrastructure\Logging\CentralExceptionReporter;
use App\Middleware\Auth;
use App\Middleware\Cors;
use App\Middleware\RateLimit;
use App\Middleware\TenantScope;
use App\Support\Http;
use Slim\Factory\AppFactory;
use Slim\Routing\RouteCollectorProxy;

Dotenv\Dotenv::createImmutable(__DIR__ . '/..')->safeLoad();

// Normalize SCRIPT_NAME when rewritten from domain root (.htaccess RewriteRule ^(api|v)/(.*)$ backend/public/index.php)
if (isset($_SERVER['REQUEST_URI'], $_SERVER['SCRIPT_NAME']) && (str_starts_with($_SERVER['REQUEST_URI'], '/api/') || str_starts_with($_SERVER['REQUEST_URI'], '/v/')) && str_contains($_SERVER['SCRIPT_NAME'], '/backend/public/index.php')) {
    $_SERVER['SCRIPT_NAME'] = '/index.php';
}

$app = AppFactory::create();
$app->addBodyParsingMiddleware();
$app->addRoutingMiddleware();
$app->add(new Cors());

// Dev convenience (php -S): serve converted page images. In Docker, nginx serves /storage.
if (PHP_SAPI === 'cli-server' && str_starts_with($_SERVER['REQUEST_URI'], '/storage/')) {
    $file = realpath(__DIR__ . '/../storage/' . substr(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH), 9));
    $root = realpath(__DIR__ . '/../storage/public');
    if ($file && $root && str_starts_with($file, $root) && is_file($file)) {
        header('Content-Type: ' . (mime_content_type($file) ?: 'application/octet-stream'));
        readfile($file);
    } else {
        http_response_code(404);
    }
    return;
}

$app->addErrorMiddleware(($_ENV['APP_ENV'] ?? 'local') !== 'production', true, true)
    ->setDefaultErrorHandler(function ($req, Throwable $e) use ($app) {
        error_log((string) $e);
        $code = (int) $e->getCode();
        $status = ($code >= 400 && $code < 600) ? $code : ($e instanceof \Slim\Exception\HttpException ? $e->getCode() : 500);
        if ($status >= 500) {
            CentralExceptionReporter::report($e, 'error');
        }
        $msg = $status === 500 ? 'Server error' : $e->getMessage();
        return Http::error($app->getResponseFactory()->createResponse(), $msg, $status);
    });

$app->options('/{routes:.+}', fn($req, $res) => $res); // handled by Cors

$app->group('/api/v1', function (RouteCollectorProxy $g) {
    $g->get('/health', fn($req, $res) => Http::json($res, ['status' => 'ok']));

    $g->group('/auth', function (RouteCollectorProxy $a) {
        $a->get('/registration-status', [AuthController::class, 'registrationStatus']);
        $a->post('/register', [AuthController::class, 'register'])->add(new RateLimit('register', 10, 3600));
        $a->post('/login', [AuthController::class, 'login'])->add(new RateLimit('login', 10, 300));
        $a->post('/verify-2fa', [AuthController::class, 'verify2fa'])->add(new RateLimit('2fa', 15, 300));
        $a->post('/resend-2fa', [AuthController::class, 'resend2fa'])->add(new RateLimit('2fa_resend', 5, 300));
        $a->post('/refresh', [AuthController::class, 'refresh']);
        $a->post('/logout', [AuthController::class, 'logout']);
        $a->post('/verify-email', [AuthController::class, 'verifyEmail']);
        $a->post('/forgot-password', [AuthController::class, 'forgotPassword'])->add(new RateLimit('forgot', 5, 3600));
        $a->post('/reset-password', [AuthController::class, 'resetPassword'])->add(new RateLimit('reset', 10, 3600));
        $a->post('/resend-verification', [AuthController::class, 'resendVerification'])
            ->add(new RateLimit('resend', 5, 3600))->add(new Auth());
    });

    $g->group('/flipbooks', function (RouteCollectorProxy $f) {
        $f->get('', [FlipbookController::class, 'index']);
        $f->post('', [FlipbookController::class, 'create'])->add(new RateLimit('upload', 20, 3600));
        $f->get('/{id:[0-9]+}', [FlipbookController::class, 'show']);
        $f->patch('/{id:[0-9]+}', [FlipbookController::class, 'update']);
        $f->delete('/{id:[0-9]+}', [FlipbookController::class, 'delete']);
        $f->get('/{id:[0-9]+}/status', [FlipbookController::class, 'status']);

        // Publishing Lifecycle, Duplication, PDF Replacement & Version History
        $f->post('/{id:[0-9]+}/workflow', [FlipbookController::class, 'transitionWorkflow']);
        $f->post('/{id:[0-9]+}/duplicate', [FlipbookController::class, 'duplicate']);
        $f->post('/{id:[0-9]+}/replace-pdf', [FlipbookController::class, 'replacePdf'])->add(new RateLimit('upload', 20, 3600));
        $f->get('/{id:[0-9]+}/versions', [FlipbookController::class, 'versions']);
        $f->post('/{id:[0-9]+}/versions/{versionId:[0-9]+}/restore', [FlipbookController::class, 'restoreVersion']);
        $f->post('/{id:[0-9]+}/retry', [FlipbookController::class, 'retryConversion']);
        $f->post('/{id:[0-9]+}/revoke-unlock-tokens', [FlipbookController::class, 'revokeUnlockTokens']);

        // Protected Document & Thumbnail Streaming (Strictly Authenticated & Tenant-Scoped)
        $f->get('/{id:[0-9]+}/pages/{page:[0-9]+}', [FlipbookController::class, 'servePage']);
        $f->get('/{id:[0-9]+}/thumbs/{page:[0-9]+}', [FlipbookController::class, 'serveThumb']);

        // Hotspots
        $f->get('/{id:[0-9]+}/hotspots', [HotspotController::class, 'index']);
        $f->post('/{id:[0-9]+}/hotspots', [HotspotController::class, 'create']);
        $f->patch('/{id:[0-9]+}/hotspots/{hid:[0-9]+}', [HotspotController::class, 'update']);
        $f->delete('/{id:[0-9]+}/hotspots/{hid:[0-9]+}', [HotspotController::class, 'delete']);

        // Analytics
        $f->get('/{id:[0-9]+}/analytics', [AnalyticsController::class, 'show']);
        $f->get('/{id:[0-9]+}/analytics/export-csv', [AnalyticsController::class, 'exportCsv']);
    })->add(new TenantScope())->add(new Auth());

    // Tenant-Wide Executive Analytics & Scheduled Reports (Authenticated & Tenant-Scoped)
    $g->group('/analytics', function (RouteCollectorProxy $an) {
        $an->get('/overview', [AnalyticsController::class, 'tenantDashboard']);
        $an->get('/scheduled-reports', [AnalyticsController::class, 'listScheduledReports']);
        $an->post('/scheduled-reports', [AnalyticsController::class, 'createScheduledReport']);
        $an->delete('/scheduled-reports/{id:[0-9]+}', [AnalyticsController::class, 'deleteScheduledReport']);
        $an->post('/scheduled-reports/{id:[0-9]+}/send-now', [AnalyticsController::class, 'sendScheduledReportNow']);
    })->add(new TenantScope())->add(new Auth());

    // Categories, Collections & Document Processing Job Queue (Authenticated & Tenant-Scoped)
    $g->group('/categories', function (RouteCollectorProxy $c) {
        $c->get('', [FlipbookController::class, 'listCategories']);
        $c->post('', [FlipbookController::class, 'createCategory']);
        $c->delete('/{id:[0-9]+}', [FlipbookController::class, 'deleteCategory']);
    })->add(new TenantScope())->add(new Auth());

    $g->group('/collections', function (RouteCollectorProxy $col) {
        $col->get('', [FlipbookController::class, 'listCollections']);
        $col->post('', [FlipbookController::class, 'createCollection']);
        $col->delete('/{id:[0-9]+}', [FlipbookController::class, 'deleteCollection']);
    })->add(new TenantScope())->add(new Auth());

    $g->group('/jobs', function (RouteCollectorProxy $j) {
        $j->get('', [FlipbookController::class, 'listJobs']);
        $j->post('/process-next', [FlipbookController::class, 'processNextJob']);
        $j->post('/{id:[0-9]+}/retry', [FlipbookController::class, 'retryJob']);
        $j->delete('/{id:[0-9]+}', [FlipbookController::class, 'cancelJob']);
    })->add(new TenantScope())->add(new Auth());

    $g->get('/public/{slug}', [PublicController::class, 'show']);
    $g->get('/public/{slug}/cover', [PublicController::class, 'cover']);
    $g->get('/public/{slug}/pages/{page:[0-9]+}', [PublicController::class, 'page']);
    $g->get('/public/{slug}/thumbs/{page:[0-9]+}', [PublicController::class, 'thumb']);
    $g->get('/public/{slug}/search', [PublicController::class, 'search']);
    $g->post('/public/{slug}/unlock', [PublicController::class, 'unlock'])->add(new RateLimit('unlock', 20, 300));
    $g->post('/public/{slug}/lock', [PublicController::class, 'lock']);
    $g->post('/public/{slug}/view', [PublicController::class, 'trackView']);
    $g->post('/public/{slug}/telemetry', [PublicController::class, 'trackTelemetry']);
    $g->get('/public/{slug}/download', [PublicController::class, 'download']);
    $g->get('/files/signed', [FlipbookController::class, 'serveSigned']);
    $g->get('/oembed', [IntegrationController::class, 'oembed']);

    // Enterprise Integrations Hub (REST API Keys, Webhooks, SSO, LDAP/AD, WordPress, ERP Catalogue API, CRM, Cloud Storage)
    $g->group('/integrations', function (RouteCollectorProxy $int) {
        $int->get('/api-keys', [IntegrationController::class, 'listApiKeys']);
        $int->post('/api-keys', [IntegrationController::class, 'createApiKey']);
        $int->post('/api-keys/{id:[0-9]+}/rotate', [IntegrationController::class, 'rotateApiKey']);
        $int->delete('/api-keys/{id:[0-9]+}', [IntegrationController::class, 'revokeApiKey']);

        $int->get('/webhooks', [IntegrationController::class, 'listWebhooks']);
        $int->post('/webhooks', [IntegrationController::class, 'createWebhook']);
        $int->post('/webhooks/{id:[0-9]+}/test', [IntegrationController::class, 'testWebhook']);
        $int->delete('/webhooks/{id:[0-9]+}', [IntegrationController::class, 'deleteWebhook']);

        $int->get('/connectors', [IntegrationController::class, 'listConnectors']);
        $int->put('/connectors/{type}', [IntegrationController::class, 'saveConnector']);
        $int->post('/connectors/{type}/test', [IntegrationController::class, 'testConnector']);

        $int->post('/erp/publish-catalogue', [IntegrationController::class, 'publishErpCatalogue']);
        $int->get('/erp/sync-logs', [IntegrationController::class, 'listErpSyncLogs']);
        $int->get('/wordpress-plugin', [IntegrationController::class, 'downloadWordpressPlugin']);
    })->add(new TenantScope())->add(new Auth());

    // Signed Payment Gateway Webhook Verification (HMAC-SHA256 via X-Payment-Signature)
    $g->post('/billing/webhooks/{provider}', [BillingController::class, 'handlePaymentWebhook']);

    // Commercial Billing, Invoices, Tax, Metering, Renewals & Fiji Bank Reconciliation
    $g->group('/billing', function (RouteCollectorProxy $bil) {
        $bil->get('/overview', [BillingController::class, 'overview']);
        $bil->patch('/settings', [BillingController::class, 'updateSettings']);
        $bil->post('/change-plan', [BillingController::class, 'changePlan']);
        $bil->post('/invoices/generate', [BillingController::class, 'generateInvoice']);
        $bil->post('/generate-invoice', [BillingController::class, 'generateInvoice']);
        $bil->post('/invoices/{id:[0-9]+}/pay', [BillingController::class, 'payInvoice']);
        $bil->post('/invoices/{id:[0-9]+}/reconcile', [BillingController::class, 'reconcileInvoice']);
        $bil->post('/invoices/{id:[0-9]+}/reverse', [BillingController::class, 'reversePayment']);
    })->add(new TenantScope())->add(new Auth());

    // Modular Architecture, System Telemetry, DLQ, Structured Logs, Error Monitor & Backups
    $g->group('/devops', function (RouteCollectorProxy $dev) {
        $dev->get('/overview', [DevOpsController::class, 'overview']);
        $dev->get('/jobs', [DevOpsController::class, 'publicationJobs']);
        $dev->post('/backups/create', [DevOpsController::class, 'createBackup']);
        $dev->post('/backups/{id:[0-9]+}/verify', [DevOpsController::class, 'verifyBackup']);
        $dev->post('/dlq/{id:[0-9]+}/retry', [DevOpsController::class, 'retryDeadLetter']);
        $dev->post('/dlq/simulate', [DevOpsController::class, 'simulateDeadLetter']);
        $dev->post('/errors/simulate', [DevOpsController::class, 'simulateErrorReport']);
        $dev->post('/errors/{id:[0-9]+}/resolve', [DevOpsController::class, 'resolveErrorReport']);
        $dev->post('/migrations/run', [DevOpsController::class, 'runMigrations']);
        $dev->post('/secrets/rotate', [DevOpsController::class, 'rotateSecrets']);
    })->add(new TenantScope())->add(new Auth());

    $g->group('/me', function (RouteCollectorProxy $m) {
        $m->get('', [MeController::class, 'show']);
        $m->patch('', [MeController::class, 'update']);
        $m->get('/password-policy', [MeController::class, 'passwordPolicy']);
        $m->put('/password', [MeController::class, 'changePassword']);
        $m->post('/two-factor', [MeController::class, 'toggleTwoFactor']);
        $m->post('/totp/setup', [MeController::class, 'setupTotp']);
        $m->post('/totp/enable', [MeController::class, 'enableTotp']);
        $m->post('/totp/disable', [MeController::class, 'disableTotp']);
        $m->get('/tenant-billing', [MeController::class, 'tenantBilling']);
        $m->get('/sessions', [MeController::class, 'sessions']);
        $m->delete('/sessions/{id}', [MeController::class, 'revokeSession']);
        $m->delete('/sessions', [MeController::class, 'revokeAllSessions']);
        $m->delete('', [MeController::class, 'delete']);
    })->add(new TenantScope())->add(new Auth());

    $g->group('/admin', function (RouteCollectorProxy $adm) {
        $adm->get('/stats', [AdminController::class, 'stats']);

        // User Management
        $adm->get('/users', [AdminController::class, 'users']);
        $adm->post('/users', [AdminController::class, 'createUser']);
        $adm->patch('/users/{id:[0-9]+}', [AdminController::class, 'updateUser']);
        $adm->post('/users/{id:[0-9]+}/reset-password', [AdminController::class, 'resetUserPassword']);
        $adm->delete('/users/{id:[0-9]+}', [AdminController::class, 'deleteUser']);

        // Company (Tenant) Management
        $adm->get('/companies', [AdminController::class, 'companies']);
        $adm->post('/companies', [AdminController::class, 'createCompany']);
        $adm->patch('/companies/{id:[0-9]+}', [AdminController::class, 'updateCompany']);
        $adm->put('/companies/{id:[0-9]+}/billing', [AdminController::class, 'updateCompanyBilling']);
        $adm->delete('/companies/{id:[0-9]+}', [AdminController::class, 'deleteCompany']);

        // Company Subscriptions & Plans
        $adm->get('/plans', [AdminController::class, 'plans']);
        $adm->patch('/plans/{id:[0-9]+}', [AdminController::class, 'updatePlan']);

        // Platform Settings & Email Setup
        $adm->get('/settings', [AdminController::class, 'settings']);
        $adm->patch('/settings', [AdminController::class, 'updateSettings']);
        $adm->post('/settings/test-email', [AdminController::class, 'testEmail']);
        $adm->get('/email-logs', [AdminController::class, 'emailLogs']);
        $adm->post('/notifications/broadcast', [AdminController::class, 'sendBroadcast']);

        // Security Monitoring & Audit Trail
        $adm->get('/security-events', [AdminController::class, 'securityEvents']);
        $adm->get('/audit-logs', [AdminController::class, 'auditLogs']);
    })->add(new Auth('admin'));
});

// Server-Side Rendered Reader Shell with OpenGraph Cover Page & Social Preview
$app->get('/v/{slug}[/]', [PublicController::class, 'renderViewerHtml']);

$app->run();

