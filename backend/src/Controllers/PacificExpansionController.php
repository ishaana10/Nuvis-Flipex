<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Support\Db;
use App\Support\Http;
use App\Support\Rbac;
use App\Support\TenantContext;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class PacificExpansionController
{
    private const CURRENCY_RATES = [
        'FJD' => 1.0,
        'AUD' => 0.67,
        'NZD' => 0.73,
        'USD' => 0.44,
        'PGK' => 1.76,
        'WST' => 1.22,
        'TOP' => 1.05,
        'VUV' => 52.8,
        'SBD' => 3.75,
    ];

    private const COUNTRIES = [
        'FJ' => ['name' => 'Fiji Islands', 'flag' => '🇫🇯', 'currency' => 'FJD'],
        'WS' => ['name' => 'Samoa', 'flag' => '🇼🇸', 'currency' => 'WST'],
        'TO' => ['name' => 'Tonga', 'flag' => '🇹🇴', 'currency' => 'TOP'],
        'VU' => ['name' => 'Vanuatu', 'flag' => '🇻🇺', 'currency' => 'VUV'],
        'PG' => ['name' => 'Papua New Guinea', 'flag' => '🇵🇬', 'currency' => 'PGK'],
        'SB' => ['name' => 'Solomon Islands', 'flag' => '🇸🇧', 'currency' => 'SBD'],
        'AU' => ['name' => 'Australia', 'flag' => '🇦🇺', 'currency' => 'AUD'],
        'NZ' => ['name' => 'New Zealand', 'flag' => '🇳🇿', 'currency' => 'NZD'],
        'PACIFIC' => ['name' => 'Pan-Pacific Regional', 'flag' => '🌴', 'currency' => 'USD'],
    ];

    private function ensureSchema(): void
    {
        static $checked = false;
        if ($checked) return;
        $checked = true;

        try {
            Db::pdo()->exec("
                CREATE TABLE IF NOT EXISTS `regional_directory_entries` (
                  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                  `tenant_id` BIGINT UNSIGNED NOT NULL,
                  `flipbook_id` BIGINT UNSIGNED NOT NULL,
                  `title` VARCHAR(255) NOT NULL,
                  `description` TEXT NULL,
                  `country_code` VARCHAR(10) NOT NULL DEFAULT 'FJ',
                  `region_name` VARCHAR(100) NULL,
                  `category` ENUM('commercial','education','tourism','government','lifestyle','general') NOT NULL DEFAULT 'general',
                  `tags` VARCHAR(255) NULL,
                  `cover_image_url` VARCHAR(500) NULL,
                  `is_featured` TINYINT(1) NOT NULL DEFAULT 0,
                  `is_public` TINYINT(1) NOT NULL DEFAULT 1,
                  `view_count` INT NOT NULL DEFAULT 0,
                  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                  UNIQUE KEY `uq_dir_flipbook` (`flipbook_id`),
                  INDEX `idx_dir_country` (`country_code`),
                  INDEX `idx_dir_category` (`category`),
                  INDEX `idx_dir_tenant` (`tenant_id`),
                  INDEX `idx_dir_featured` (`is_featured`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

                CREATE TABLE IF NOT EXISTS `sponsored_placements` (
                  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                  `tenant_id` BIGINT UNSIGNED NOT NULL,
                  `campaign_name` VARCHAR(200) NOT NULL,
                  `advertiser_name` VARCHAR(200) NOT NULL,
                  `advertiser_email` VARCHAR(190) NULL,
                  `placement_type` ENUM('header_banner','interstitial_page','sidebar_spotlight','directory_featured') NOT NULL DEFAULT 'header_banner',
                  `target_url` VARCHAR(500) NOT NULL,
                  `banner_image_url` VARCHAR(500) NOT NULL,
                  `headline` VARCHAR(255) NULL,
                  `subtext` VARCHAR(255) NULL,
                  `cta_text` VARCHAR(60) NOT NULL DEFAULT 'Learn More',
                  `target_country` VARCHAR(20) NOT NULL DEFAULT 'ALL',
                  `budget_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                  `currency` VARCHAR(10) NOT NULL DEFAULT 'FJD',
                  `cost_per_click` DECIMAL(10,2) NOT NULL DEFAULT 0.25,
                  `spent_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                  `impressions` INT NOT NULL DEFAULT 0,
                  `clicks` INT NOT NULL DEFAULT 0,
                  `status` ENUM('active','paused','completed','pending_review') NOT NULL DEFAULT 'active',
                  `start_date` DATETIME NULL,
                  `end_date` DATETIME NULL,
                  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                  INDEX `idx_ad_tenant` (`tenant_id`),
                  INDEX `idx_ad_status` (`status`, `placement_type`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

                CREATE TABLE IF NOT EXISTS `ad_events` (
                  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                  `placement_id` BIGINT UNSIGNED NOT NULL,
                  `event_type` ENUM('impression','click') NOT NULL,
                  `flipbook_id` BIGINT UNSIGNED NULL,
                  `country_code` VARCHAR(10) NULL,
                  `ip_hash` VARCHAR(64) NULL,
                  `user_agent` VARCHAR(255) NULL,
                  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  INDEX `idx_ad_events_placement` (`placement_id`, `event_type`),
                  INDEX `idx_ad_events_time` (`created_at`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            ");
        } catch (\Throwable) {
            // Already created
        }
    }

    // -------------------------------------------------------------
    // REGIONAL DIRECTORY ENDPOINTS
    // -------------------------------------------------------------

    public function listDirectory(Request $req, Response $res): Response
    {
        $this->ensureSchema();
        $params = $req->getQueryParams();

        $country = strtoupper(trim((string) ($params['country'] ?? 'ALL')));
        $category = strtolower(trim((string) ($params['category'] ?? 'ALL')));
        $search = trim((string) ($params['search'] ?? ''));
        $sort = strtolower(trim((string) ($params['sort'] ?? 'popular')));
        $limit = min(50, max(1, (int) ($params['limit'] ?? 24)));
        $offset = max(0, (int) ($params['offset'] ?? 0));

        $where = ['d.is_public = 1', 'f.published_at IS NOT NULL', "f.workflow_status = 'published'"];
        $bindings = [];

        if ($country !== '' && $country !== 'ALL' && array_key_exists($country, self::COUNTRIES)) {
            $where[] = 'd.country_code = ?';
            $bindings[] = $country;
        }

        if ($category !== '' && $category !== 'ALL') {
            $where[] = 'd.category = ?';
            $bindings[] = $category;
        }

        if ($search !== '') {
            $where[] = '(d.title LIKE ? OR d.description LIKE ? OR d.tags LIKE ? OR d.region_name LIKE ? OR t.name LIKE ?)';
            $wild = '%' . $search . '%';
            $bindings[] = $wild;
            $bindings[] = $wild;
            $bindings[] = $wild;
            $bindings[] = $wild;
            $bindings[] = $wild;
        }

        $orderBy = match ($sort) {
            'newest' => 'd.created_at DESC',
            'featured' => 'd.is_featured DESC, d.view_count DESC',
            default => 'd.view_count DESC, d.created_at DESC',
        };

        $whereSql = implode(' AND ', $where);

        $sql = "
            SELECT 
                d.id, d.flipbook_id, d.title, d.description, d.country_code, d.region_name,
                d.category, d.tags, d.cover_image_url, d.is_featured, d.view_count, d.created_at,
                f.slug, f.page_count AS pages_count, f.visibility, f.settings AS flipbook_settings,
                t.name AS publisher_name, t.id AS publisher_tenant_id
            FROM regional_directory_entries d
            JOIN flipbooks f ON f.id = d.flipbook_id
            JOIN tenants t ON t.id = d.tenant_id
            WHERE {$whereSql}
            ORDER BY {$orderBy}
            LIMIT {$limit} OFFSET {$offset}
        ";

        $rows = Db::all($sql, $bindings);

        // Fetch top featured entries for spotlight carousel
        $featuredSql = "
            SELECT 
                d.id, d.flipbook_id, d.title, d.description, d.country_code, d.region_name,
                d.category, d.cover_image_url, d.view_count,
                f.slug, f.page_count AS pages_count, t.name AS publisher_name
            FROM regional_directory_entries d
            JOIN flipbooks f ON f.id = d.flipbook_id
            JOIN tenants t ON t.id = d.tenant_id
            WHERE d.is_public = 1 AND f.published_at IS NOT NULL AND f.workflow_status = 'published' AND d.is_featured = 1
            ORDER BY d.view_count DESC
            LIMIT 6
        ";
        $featuredRows = Db::all($featuredSql);

        $formatEntry = function ($r) {
            $cCode = $r['country_code'] ?? 'FJ';
            $cInfo = self::COUNTRIES[$cCode] ?? self::COUNTRIES['FJ'];
            $settings = !empty($r['flipbook_settings']) ? json_decode((string) $r['flipbook_settings'], true) : [];

            return [
                'id' => (int) $r['id'],
                'flipbookId' => (int) $r['flipbook_id'],
                'title' => $r['title'],
                'description' => $r['description'] ?? '',
                'countryCode' => $cCode,
                'countryName' => $cInfo['name'],
                'countryFlag' => $cInfo['flag'],
                'currency' => $cInfo['currency'],
                'regionName' => $r['region_name'] ?? '',
                'category' => $r['category'] ?? 'general',
                'tags' => array_filter(array_map('trim', explode(',', (string) ($r['tags'] ?? '')))),
                'coverImageUrl' => $r['cover_image_url'] ?: ($settings['coverImageUrl'] ?? '/api/v1/public/' . $r['slug'] . '/cover'),
                'isFeatured' => (bool) $r['is_featured'],
                'viewCount' => (int) $r['view_count'],
                'pagesCount' => (int) ($r['pages_count'] ?? 1),
                'readerUrl' => "/v/{$r['slug']}",
                'publisherName' => $r['publisher_name'] ?? 'Pacific Publisher',
                'createdAt' => (string) $r['created_at'],
            ];
        };

        // Aggregated category and country counts
        $catCounts = Db::all('SELECT category, COUNT(*) as cnt FROM regional_directory_entries WHERE is_public = 1 GROUP BY category');
        $countryCounts = Db::all('SELECT country_code, COUNT(*) as cnt FROM regional_directory_entries WHERE is_public = 1 GROUP BY country_code');

        return Http::json($res, [
            'entries' => array_map($formatEntry, $rows),
            'featured' => array_map($formatEntry, $featuredRows),
            'pagination' => [
                'offset' => $offset,
                'limit' => $limit,
                'count' => count($rows),
            ],
            'categories' => $catCounts,
            'countries' => array_map(function ($code, $info) use ($countryCounts) {
                $found = 0;
                foreach ($countryCounts as $c) {
                    if ($c['country_code'] === $code) {
                        $found = (int) $c['cnt'];
                        break;
                    }
                }
                return [
                    'code' => $code,
                    'name' => $info['name'],
                    'flag' => $info['flag'],
                    'currency' => $info['currency'],
                    'count' => $found,
                ];
            }, array_keys(self::COUNTRIES), array_values(self::COUNTRIES)),
            'currencyRates' => self::CURRENCY_RATES,
        ]);
    }

    public function publishToDirectory(Request $req, Response $res): Response
    {
        $this->ensureSchema();
        $user = $req->getAttribute('user');
        Rbac::authorize($user, 'flipbook.publish');
        $tenantId = TenantContext::requireId();
        $b = (array) $req->getParsedBody();

        $flipbookId = (int) ($b['flipbook_id'] ?? 0);
        if ($flipbookId <= 0) {
            return Http::error($res, 'Valid flipbook_id is required', 422);
        }

        $flipbook = Db::one('SELECT * FROM flipbooks WHERE id = ? AND tenant_id = ?', [$flipbookId, $tenantId]);
        if (!$flipbook) {
            return Http::error($res, 'Flipbook not found in your workspace', 404);
        }

        $title = trim((string) ($b['title'] ?? $flipbook['title']));
        $description = trim((string) ($b['description'] ?? $flipbook['description'] ?? ''));
        $countryCode = strtoupper(trim((string) ($b['country_code'] ?? 'FJ')));
        if (!array_key_exists($countryCode, self::COUNTRIES)) {
            $countryCode = 'FJ';
        }
        $regionName = trim((string) ($b['region_name'] ?? ''));
        $category = strtolower(trim((string) ($b['category'] ?? 'general')));
        $validCats = ['commercial', 'education', 'tourism', 'government', 'lifestyle', 'general'];
        if (!in_array($category, $validCats, true)) {
            $category = 'general';
        }

        $tags = trim((string) ($b['tags'] ?? ''));
        $coverImageUrl = trim((string) ($b['cover_image_url'] ?? ''));
        $isFeatured = !empty($b['is_featured']) ? 1 : 0;
        $isPublic = !empty($b['is_public']) || !isset($b['is_public']) ? 1 : 0;

        Db::run("
            INSERT INTO regional_directory_entries (
                tenant_id, flipbook_id, title, description, country_code, region_name,
                category, tags, cover_image_url, is_featured, is_public
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                title = VALUES(title),
                description = VALUES(description),
                country_code = VALUES(country_code),
                region_name = VALUES(region_name),
                category = VALUES(category),
                tags = VALUES(tags),
                cover_image_url = VALUES(cover_image_url),
                is_featured = VALUES(is_featured),
                is_public = VALUES(is_public),
                updated_at = NOW()
        ", [
            $tenantId, $flipbookId, $title, $description, $countryCode, $regionName,
            $category, $tags, $coverImageUrl, $isFeatured, $isPublic,
        ]);

        return Http::json($res, [
            'ok' => true,
            'message' => 'Publication listed on Pacific Regional Directory successfully.',
            'directoryUrl' => "/explore?country={$countryCode}",
        ]);
    }

    public function getDirectoryEntry(Request $req, Response $res, array $args): Response
    {
        $this->ensureSchema();
        $flipbookId = (int) ($args['flipbook_id'] ?? 0);
        $entry = Db::one('SELECT * FROM regional_directory_entries WHERE flipbook_id = ?', [$flipbookId]);

        return Http::json($res, [
            'listed' => $entry !== null,
            'entry' => $entry,
            'countries' => self::COUNTRIES,
        ]);
    }

    // -------------------------------------------------------------
    // ADVERTISING MARKETPLACE & CAMPAIGN MANAGEMENT
    // -------------------------------------------------------------

    public function servePublicAds(Request $req, Response $res): Response
    {
        $this->ensureSchema();
        $params = $req->getQueryParams();
        $placementType = trim((string) ($params['placement_type'] ?? 'header_banner'));
        $country = strtoupper(trim((string) ($params['country'] ?? 'ALL')));
        $limit = min(10, max(1, (int) ($params['limit'] ?? 3)));

        $where = [
            "status = 'active'",
            "(start_date IS NULL OR start_date <= UTC_TIMESTAMP())",
            "(end_date IS NULL OR end_date >= UTC_TIMESTAMP())",
            "(budget_amount <= 0.00 OR spent_amount < budget_amount)",
        ];
        $bindings = [];

        if ($placementType !== '') {
            $where[] = 'placement_type = ?';
            $bindings[] = $placementType;
        }

        if ($country !== '' && $country !== 'ALL') {
            $where[] = '(target_country = ? OR target_country = "ALL")';
            $bindings[] = $country;
        }

        $whereSql = implode(' AND ', $where);

        $sql = "
            SELECT id, campaign_name, advertiser_name, placement_type, target_url,
                   banner_image_url, headline, subtext, cta_text, currency, target_country
            FROM sponsored_placements
            WHERE {$whereSql}
            ORDER BY RAND()
            LIMIT {$limit}
        ";

        $ads = Db::all($sql, $bindings);

        return Http::json($res, [
            'ads' => array_map(fn($a) => [
                'id' => (int) $a['id'],
                'campaignName' => $a['campaign_name'],
                'advertiserName' => $a['advertiser_name'],
                'placementType' => $a['placement_type'],
                'targetUrl' => $a['target_url'],
                'bannerImageUrl' => $a['banner_image_url'],
                'headline' => $a['headline'] ?? '',
                'subtext' => $a['subtext'] ?? '',
                'ctaText' => $a['cta_text'] ?? 'Learn More',
                'currency' => $a['currency'],
            ], $ads),
        ]);
    }

    public function trackAdEvent(Request $req, Response $res, array $args): Response
    {
        $this->ensureSchema();
        $placementId = (int) ($args['id'] ?? 0);
        $b = (array) $req->getParsedBody();
        $eventType = strtolower(trim((string) ($b['event_type'] ?? 'impression')));
        $flipbookId = !empty($b['flipbook_id']) ? (int) $b['flipbook_id'] : null;
        $countryCode = strtoupper(trim((string) ($b['country_code'] ?? 'FJ')));

        if (!in_array($eventType, ['impression', 'click'], true)) {
            return Http::error($res, 'Invalid event_type', 422);
        }

        $ad = Db::one('SELECT * FROM sponsored_placements WHERE id = ?', [$placementId]);
        if (!$ad) {
            return Http::error($res, 'Ad placement not found', 404);
        }

        // Record metrics
        $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
        $ipHash = hash('sha256', $ip . date('Y-m-d'));
        $ua = substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 250);

        Db::run('INSERT INTO ad_events (placement_id, event_type, flipbook_id, country_code, ip_hash, user_agent) VALUES (?, ?, ?, ?, ?, ?)', [
            $placementId, $eventType, $flipbookId, $countryCode, $ipHash, $ua,
        ]);

        if ($eventType === 'click') {
            Db::run('UPDATE sponsored_placements SET clicks = clicks + 1, spent_amount = spent_amount + cost_per_click WHERE id = ?', [$placementId]);
            Db::run("UPDATE sponsored_placements SET status = 'completed' WHERE id = ? AND budget_amount > 0 AND spent_amount >= budget_amount", [$placementId]);
        } else {
            Db::run('UPDATE sponsored_placements SET impressions = impressions + 1 WHERE id = ?', [$placementId]);
        }

        return Http::json($res, ['ok' => true]);
    }

    public function listCampaigns(Request $req, Response $res): Response
    {
        $this->ensureSchema();
        $user = $req->getAttribute('user');
        Rbac::authorize($user, 'tenant.settings');
        $tenantId = TenantContext::requireId();

        $rows = Db::all('SELECT * FROM sponsored_placements WHERE tenant_id = ? ORDER BY created_at DESC', [$tenantId]);

        return Http::json($res, [
            'campaigns' => array_map(fn($r) => [
                'id' => (int) $r['id'],
                'campaignName' => $r['campaign_name'],
                'advertiserName' => $r['advertiser_name'],
                'placementType' => $r['placement_type'],
                'targetUrl' => $r['target_url'],
                'bannerImageUrl' => $r['banner_image_url'],
                'headline' => $r['headline'],
                'subtext' => $r['subtext'],
                'ctaText' => $r['cta_text'],
                'targetCountry' => $r['target_country'],
                'budgetAmount' => (float) $r['budget_amount'],
                'spentAmount' => (float) $r['spent_amount'],
                'currency' => $r['currency'],
                'impressions' => (int) $r['impressions'],
                'clicks' => (int) $r['clicks'],
                'ctr' => $r['impressions'] > 0 ? round(($r['clicks'] / $r['impressions']) * 100, 2) : 0,
                'status' => $r['status'],
                'createdAt' => (string) $r['created_at'],
            ], $rows),
            'availableCurrencies' => array_keys(self::CURRENCY_RATES),
        ]);
    }

    public function createCampaign(Request $req, Response $res): Response
    {
        $this->ensureSchema();
        $user = $req->getAttribute('user');
        Rbac::authorize($user, 'tenant.settings');
        $tenantId = TenantContext::requireId();
        $b = (array) $req->getParsedBody();

        $campaignName = trim((string) ($b['campaign_name'] ?? ''));
        $targetUrl = trim((string) ($b['target_url'] ?? ''));
        $bannerImageUrl = trim((string) ($b['banner_image_url'] ?? ''));

        if ($campaignName === '' || $targetUrl === '' || $bannerImageUrl === '') {
            return Http::error($res, 'Campaign name, target link, and banner image URL are required', 422);
        }

        $advertiserName = trim((string) ($b['advertiser_name'] ?? $user['name'] ?? 'Advertiser'));
        $placementType = trim((string) ($b['placement_type'] ?? 'header_banner'));
        $headline = trim((string) ($b['headline'] ?? ''));
        $subtext = trim((string) ($b['subtext'] ?? ''));
        $ctaText = trim((string) ($b['cta_text'] ?? 'Learn More'));
        $targetCountry = strtoupper(trim((string) ($b['target_country'] ?? 'ALL')));
        $budget = max(10.0, (float) ($b['budget_amount'] ?? 100.0));
        $currency = strtoupper(trim((string) ($b['currency'] ?? 'FJD')));
        if (!array_key_exists($currency, self::CURRENCY_RATES)) {
            $currency = 'FJD';
        }

        Db::run("
            INSERT INTO sponsored_placements (
                tenant_id, campaign_name, advertiser_name, placement_type, target_url,
                banner_image_url, headline, subtext, cta_text, target_country, budget_amount, currency
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ", [
            $tenantId, $campaignName, $advertiserName, $placementType, $targetUrl,
            $bannerImageUrl, $headline, $subtext, $ctaText, $targetCountry, $budget, $currency,
        ]);

        $id = (int) Db::pdo()->lastInsertId();

        return Http::json($res, [
            'ok' => true,
            'campaignId' => $id,
            'message' => 'Sponsored advertising campaign created successfully.',
        ], 201);
    }

    public function deleteCampaign(Request $req, Response $res, array $args): Response
    {
        $this->ensureSchema();
        $user = $req->getAttribute('user');
        Rbac::authorize($user, 'tenant.settings');
        $tenantId = TenantContext::requireId();
        $id = (int) ($args['id'] ?? 0);

        Db::run('DELETE FROM sponsored_placements WHERE id = ? AND tenant_id = ?', [$id, $tenantId]);

        return Http::json($res, ['ok' => true, 'message' => 'Campaign deleted.']);
    }

    // -------------------------------------------------------------
    // AI PUBLISHING ASSISTANT (TOC & SEO AUTO-EXTRACTION)
    // -------------------------------------------------------------

    public function aiAssist(Request $req, Response $res, array $args): Response
    {
        $user = $req->getAttribute('user');
        Rbac::authorize($user, 'flipbook.edit');
        $tenantId = TenantContext::requireId();
        $flipbookId = (int) ($args['id'] ?? 0);

        $flipbook = Db::one('SELECT * FROM flipbooks WHERE id = ? AND tenant_id = ?', [$flipbookId, $tenantId]);
        if (!$flipbook) {
            return Http::error($res, 'Flipbook not found', 404);
        }

        $b = (array) $req->getParsedBody();
        $apply = !empty($b['apply']);

        // Inspect text_content from extracted pages
        $pages = Db::all(
            'SELECT page_number, text_content FROM pages WHERE flipbook_id = ? ORDER BY page_number ASC',
            [$flipbookId]
        );

        $extractedToc = [];
        $allWords = [];
        $pageSummaries = [];

        foreach ($pages as $p) {
            $pageNum = (int) $p['page_number'];
            $text = trim((string) ($p['text_content'] ?? ''));
            if ($text === '') continue;

            $lines = array_filter(array_map('trim', explode("\n", $text)));
            if (!empty($lines)) {
                // First non-numeric, prominent header line often signifies a section title
                foreach ($lines as $line) {
                    if (mb_strlen($line) >= 4 && mb_strlen($line) <= 70 && !preg_match('/^\d+$/', $line)) {
                        // Check if looks like a title/heading (all caps or title case or short heading)
                        if (ctype_upper(str_replace([' ', '-', '&', '/', ','], '', $line)) || mb_strlen($line) < 45) {
                            $extractedToc[] = [
                                'title' => ucwords(strtolower($line)),
                                'page' => $pageNum,
                            ];
                            break;
                        }
                    }
                }
            }

            // Word frequency for SEO keywords
            $cleanText = preg_replace('/[^\p{L}\p{N}\s]+/u', ' ', mb_strtolower($text));
            $words = preg_split('/\s+/u', (string) $cleanText);
            foreach ($words as $w) {
                if (mb_strlen($w) > 3 && !in_array($w, ['this', 'that', 'with', 'from', 'have', 'were', 'which', 'your', 'their', 'about', 'page'], true)) {
                    $allWords[$w] = ($allWords[$w] ?? 0) + 1;
                }
            }

            if (count($pageSummaries) < 3 && mb_strlen($text) > 40) {
                $pageSummaries[] = mb_substr(strip_tags($text), 0, 150);
            }
        }

        // Deduplicate TOC by page
        $uniqueToc = [];
        $seenPages = [];
        foreach ($extractedToc as $t) {
            if (!in_array($t['page'], $seenPages, true)) {
                $uniqueToc[] = $t;
                $seenPages[] = $t['page'];
            }
        }

        // Fallback default sections if document had scanned images without raw text
        if (empty($uniqueToc)) {
            $pageCount = count($pages);
            $uniqueToc = [
                ['title' => 'Cover Page', 'page' => 1],
                ['title' => 'Main Catalogue Content', 'page' => min(2, $pageCount)],
            ];
            if ($pageCount >= 5) {
                $uniqueToc[] = ['title' => 'Product Index & Specifications', 'page' => min(5, $pageCount)];
            }
            if ($pageCount >= 10) {
                $uniqueToc[] = ['title' => 'Back Cover & Contact Details', 'page' => $pageCount];
            }
        }

        arsort($allWords);
        $topKeywords = array_slice(array_keys($allWords), 0, 10);
        $suggestedKeywords = implode(', ', $topKeywords) ?: 'publication, fiji, catalogue, magazine, digital reader';

        $generatedDesc = !empty($pageSummaries)
            ? implode(' ', $pageSummaries)
            : "Explore {$flipbook['title']} featuring interactive digital flipbook pages, high-resolution media, and instant product inquiries.";
        $generatedDesc = mb_substr($generatedDesc, 0, 260) . '...';

        $aiResult = [
            'toc' => $uniqueToc,
            'seoMeta' => [
                'title' => "{$flipbook['title']} | Interactive Digital Publication",
                'description' => $generatedDesc,
                'keywords' => $suggestedKeywords,
            ],
            'suggestedCategory' => 'commercial',
            'summary' => "AI extracted " . count($uniqueToc) . " interactive table of contents bookmarks and optimized search keywords from " . count($pages) . " pages.",
        ];

        if ($apply) {
            Db::run('UPDATE flipbooks SET toc = ?, seo_meta = ? WHERE id = ? AND tenant_id = ?', [
                json_encode($aiResult['toc']),
                json_encode($aiResult['seoMeta']),
                $flipbookId,
                $tenantId,
            ]);
            $aiResult['applied'] = true;
        }

        return Http::json($res, $aiResult);
    }
}
