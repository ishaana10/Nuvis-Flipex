<?php
declare(strict_types=1);

namespace App\Modules\Integrations;

use App\Controllers\IntegrationController;
use App\Shared\ModuleContract;
use App\Support\WebhookDispatcher;

final class IntegrationsModule implements ModuleContract
{
    public static function name(): string { return 'Integrations'; }
    public static function layer(): string { return 'Business Services & Infrastructure'; }
    public static function description(): string { return 'Enterprise connectivity hub: REST API Keys, Automated ERP Product Catalogue Publishing, HMAC-SHA256 Webhooks, SAML/OIDC SSO, LDAP/AD, WordPress oEmbed/Plugin, and CRM sync.'; }
    public static function dependencies(): array { return ['Tenants', 'Publications', 'Hotspots', 'Audit']; }
    public static function capabilities(): array
    {
        return [
            'controller' => IntegrationController::class,
            'services' => [WebhookDispatcher::class],
            'features' => ['Automated ERP Catalogue API + SKU Hotspots', 'HMAC-SHA256 Signed Webhooks', 'SAML 2.0 / OIDC SSO', 'LDAP / Active Directory Sync', 'WordPress Shortcode, oEmbed & Plugin'],
        ];
    }
}
