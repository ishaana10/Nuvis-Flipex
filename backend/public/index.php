<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use App\Controllers\AdminController;
use App\Controllers\AnalyticsController;
use App\Controllers\AuthController;
use App\Controllers\FlipbookController;
use App\Controllers\HotspotController;
use App\Controllers\MeController;
use App\Controllers\PublicController;
use App\Middleware\Auth;
use App\Middleware\Cors;
use App\Middleware\RateLimit;
use App\Support\Http;
use Slim\Factory\AppFactory;
use Slim\Routing\RouteCollectorProxy;

Dotenv\Dotenv::createImmutable(__DIR__ . '/..')->safeLoad();

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
        $status = $e instanceof \Slim\Exception\HttpException ? $e->getCode() : 500;
        $msg = $status === 500 ? 'Server error' : $e->getMessage();
        return Http::error($app->getResponseFactory()->createResponse(), $msg, $status);
    });

$app->options('/{routes:.+}', fn($req, $res) => $res); // handled by Cors

$app->group('/api/v1', function (RouteCollectorProxy $g) {
    $g->get('/health', fn($req, $res) => Http::json($res, ['status' => 'ok']));

    $g->group('/auth', function (RouteCollectorProxy $a) {
        $a->post('/register', [AuthController::class, 'register'])->add(new RateLimit('register', 10, 3600));
        $a->post('/login', [AuthController::class, 'login'])->add(new RateLimit('login', 10, 300));
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

        // Hotspots
        $f->get('/{id:[0-9]+}/hotspots', [HotspotController::class, 'index']);
        $f->post('/{id:[0-9]+}/hotspots', [HotspotController::class, 'create']);
        $f->patch('/{id:[0-9]+}/hotspots/{hid:[0-9]+}', [HotspotController::class, 'update']);
        $f->delete('/{id:[0-9]+}/hotspots/{hid:[0-9]+}', [HotspotController::class, 'delete']);

        // Analytics
        $f->get('/{id:[0-9]+}/analytics', [AnalyticsController::class, 'show']);
    })->add(new Auth());

    $g->get('/public/{slug}', [PublicController::class, 'show']);
    $g->post('/public/{slug}/unlock', [PublicController::class, 'unlock'])->add(new RateLimit('unlock', 20, 300));
    $g->post('/public/{slug}/view', [PublicController::class, 'trackView']);
    $g->get('/public/{slug}/download', [PublicController::class, 'download']);

    $g->group('/me', function (RouteCollectorProxy $m) {
        $m->get('', [MeController::class, 'show']);
        $m->patch('', [MeController::class, 'update']);
        $m->put('/password', [MeController::class, 'changePassword']);
        $m->get('/sessions', [MeController::class, 'sessions']);
        $m->delete('/sessions/{id}', [MeController::class, 'revokeSession']);
        $m->delete('', [MeController::class, 'delete']);
    })->add(new Auth());

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
        $adm->delete('/companies/{id:[0-9]+}', [AdminController::class, 'deleteCompany']);

        // Company Subscriptions & Plans
        $adm->get('/plans', [AdminController::class, 'plans']);
        $adm->patch('/plans/{id:[0-9]+}', [AdminController::class, 'updatePlan']);
    })->add(new Auth('admin'));
});

$app->run();

