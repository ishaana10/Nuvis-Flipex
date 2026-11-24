<?php
declare(strict_types=1);

namespace App\Support;

/**
 * Release metadata. The repo-root VERSION file is the single source of truth and is shared with
 * the frontend build, so the API, the DevOps console and the UI can never disagree.
 * APP_VERSION in .env may override it (e.g. for staging builds).
 */
final class AppVersion
{
    private static ?array $info = null;

    public static function info(): array
    {
        if (self::$info !== null) {
            return self::$info;
        }

        $version = null;
        foreach ([__DIR__ . '/../../../VERSION', __DIR__ . '/../../VERSION'] as $file) {
            if (is_readable($file)) {
                $raw = trim((string) file_get_contents($file));
                if (preg_match('/^\d+\.\d+\.\d+(?:[-+][\w.]+)?$/', $raw)) {
                    $version = $raw;
                    break;
                }
            }
        }
        $env = trim((string) ($_ENV['APP_VERSION'] ?? ''));
        if ($env !== '') {
            $version = ltrim($env, 'vV');
        }

        // Build metadata comes from the frontend manifest emitted at build time, when present.
        $manifest = [];
        $manifestFile = __DIR__ . '/../../../frontend/dist/version.json';
        if (is_readable($manifestFile)) {
            $decoded = json_decode((string) file_get_contents($manifestFile), true);
            if (is_array($decoded)) {
                $manifest = $decoded;
            }
        }

        return self::$info = [
            'version' => $version ?? '0.0.0',
            'build' => (string) ($manifest['build'] ?? ''),
            'commit' => (string) ($manifest['commit'] ?? ''),
            'builtAt' => (string) ($manifest['builtAt'] ?? ''),
            'platform' => 'Nuvis Flipex',
        ];
    }

    public static function version(): string
    {
        return self::info()['version'];
    }
}
