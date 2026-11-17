<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Support\Audit;
use App\Support\CryptoSecrets;
use App\Support\Db;
use App\Support\Http;
use App\Support\Rbac;
use App\Support\TenantContext;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class EducationalController
{
    private const UNLOCK_TTL_SECONDS = 3600; // 1 hour session for educational reader access

    private function ensureSchema(): void
    {
        try {
            Db::pdo()->exec("
                CREATE TABLE IF NOT EXISTS `educational_profiles` (
                  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                  `tenant_id` BIGINT UNSIGNED NOT NULL UNIQUE,
                  `institution_name` VARCHAR(200) NOT NULL,
                  `motto` VARCHAR(255) NULL,
                  `academic_year` VARCHAR(50) NOT NULL DEFAULT '2026-2027',
                  `institution_type` ENUM('primary','secondary','tertiary','college','vocational','publisher') NOT NULL DEFAULT 'secondary',
                  `principal_name` VARCHAR(150) NULL,
                  `campus_address` TEXT NULL,
                  `contact_email` VARCHAR(190) NULL,
                  `contact_phone` VARCHAR(50) NULL,
                  `allowed_email_domains` TEXT NULL,
                  `crest_url` VARCHAR(500) NULL,
                  `banner_url` VARCHAR(500) NULL,
                  `portal_slug` VARCHAR(100) NULL UNIQUE,
                  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                  INDEX `idx_edu_tenant` (`tenant_id`),
                  INDEX `idx_edu_portal` (`portal_slug`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

                CREATE TABLE IF NOT EXISTS `educational_resources` (
                  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                  `tenant_id` BIGINT UNSIGNED NOT NULL,
                  `flipbook_id` BIGINT UNSIGNED NOT NULL,
                  `page_number` INT NULL,
                  `title` VARCHAR(200) NOT NULL,
                  `resource_type` ENUM('worksheet','syllabus','exam_paper','solution_guide','audio_lesson','external_link') NOT NULL DEFAULT 'worksheet',
                  `file_url` VARCHAR(500) NULL,
                  `external_url` VARCHAR(500) NULL,
                  `description` TEXT NULL,
                  `download_count` INT NOT NULL DEFAULT 0,
                  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                  INDEX `idx_edu_res_tenant` (`tenant_id`),
                  INDEX `idx_edu_res_flipbook` (`flipbook_id`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

                CREATE TABLE IF NOT EXISTS `educational_annotations` (
                  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                  `tenant_id` BIGINT UNSIGNED NOT NULL,
                  `flipbook_id` BIGINT UNSIGNED NOT NULL,
                  `page_number` INT NOT NULL,
                  `student_name` VARCHAR(120) NOT NULL,
                  `student_identifier` VARCHAR(150) NOT NULL,
                  `annotation_type` ENUM('note','highlight','bookmark') NOT NULL DEFAULT 'note',
                  `color` VARCHAR(30) NOT NULL DEFAULT '#fef08a',
                  `note_text` TEXT NULL,
                  `rect_data` TEXT NULL,
                  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                  INDEX `idx_annotations_flipbook` (`flipbook_id`, `page_number`),
                  INDEX `idx_annotations_student` (`student_identifier`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            ");
        } catch (\Throwable) {
            // tables already exist
        }
    }

    /**
     * Get educational institution profile for authenticated tenant.
     */
    public function getProfile(Request $req, Response $res): Response
    {
        $this->ensureSchema();
        $u = $req->getAttribute('user');
        $tenantId = TenantContext::id() ?? (!empty($u['tenant_id']) ? (int) $u['tenant_id'] : 1);

        $profile = Db::one('SELECT * FROM educational_profiles WHERE tenant_id = ?', [$tenantId]);
        if (!$profile) {
            $tenant = Db::one('SELECT * FROM tenants WHERE id = ?', [$tenantId]);
            $defaultName = $tenant['name'] ?? 'School Workspace';
            $defaultSlug = !empty($tenant['slug']) ? "school-{$tenant['slug']}" : "school-{$tenantId}";

            Db::run(
                'INSERT INTO educational_profiles (tenant_id, institution_name, portal_slug, contact_email)
                 VALUES (?, ?, ?, ?)',
                [$tenantId, $defaultName, $defaultSlug, $tenant['billing_email'] ?? '']
            );
            $profile = Db::one('SELECT * FROM educational_profiles WHERE tenant_id = ?', [$tenantId]);
        }

        return Http::json($res, [
            'profile' => [
                'id' => (int) $profile['id'],
                'tenantId' => $tenantId,
                'institutionName' => (string) $profile['institution_name'],
                'motto' => $profile['motto'] ?? '',
                'academicYear' => $profile['academic_year'] ?? '2026-2027',
                'institutionType' => $profile['institution_type'] ?? 'secondary',
                'principalName' => $profile['principal_name'] ?? '',
                'campusAddress' => $profile['campus_address'] ?? '',
                'contactEmail' => $profile['contact_email'] ?? '',
                'contactPhone' => $profile['contact_phone'] ?? '',
                'allowedEmailDomains' => $profile['allowed_email_domains'] ?? '',
                'crestUrl' => $profile['crest_url'] ?? '',
                'bannerUrl' => $profile['banner_url'] ?? '',
                'portalSlug' => $profile['portal_slug'] ?? '',
            ],
        ]);
    }

    /**
     * Update educational institution profile.
     */
    public function updateProfile(Request $req, Response $res): Response
    {
        $this->ensureSchema();
        $u = $req->getAttribute('user');
        $tenantId = TenantContext::id() ?? (!empty($u['tenant_id']) ? (int) $u['tenant_id'] : 1);

        $b = (array) $req->getParsedBody();
        $name = trim((string) ($b['institutionName'] ?? ''));
        if ($name === '') {
            return Http::error($res, 'Institution name is required', 422);
        }

        $motto = trim((string) ($b['motto'] ?? ''));
        $academicYear = trim((string) ($b['academicYear'] ?? '2026-2027'));
        $type = in_array($b['institutionType'] ?? '', ['primary', 'secondary', 'tertiary', 'college', 'vocational', 'publisher'], true)
            ? (string) $b['institutionType']
            : 'secondary';
        $principal = trim((string) ($b['principalName'] ?? ''));
        $address = trim((string) ($b['campusAddress'] ?? ''));
        $email = trim((string) ($b['contactEmail'] ?? ''));
        $phone = trim((string) ($b['contactPhone'] ?? ''));
        $domains = trim((string) ($b['allowedEmailDomains'] ?? ''));
        $crest = trim((string) ($b['crestUrl'] ?? ''));
        $banner = trim((string) ($b['bannerUrl'] ?? ''));
        $slug = trim((string) ($b['portalSlug'] ?? ''));
        $slug = preg_replace('/[^a-z0-9_-]/', '', strtolower($slug)) ?: "school-{$tenantId}";

        Db::run(
            'INSERT INTO educational_profiles (
                tenant_id, institution_name, motto, academic_year, institution_type,
                principal_name, campus_address, contact_email, contact_phone,
                allowed_email_domains, crest_url, banner_url, portal_slug
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                institution_name = VALUES(institution_name),
                motto = VALUES(motto),
                academic_year = VALUES(academic_year),
                institution_type = VALUES(institution_type),
                principal_name = VALUES(principal_name),
                campus_address = VALUES(campus_address),
                contact_email = VALUES(contact_email),
                contact_phone = VALUES(contact_phone),
                allowed_email_domains = VALUES(allowed_email_domains),
                crest_url = VALUES(crest_url),
                banner_url = VALUES(banner_url),
                portal_slug = VALUES(portal_slug)',
            [
                $tenantId, $name, $motto, $academicYear, $type,
                $principal, $address, $email, $phone,
                $domains, $crest, $banner, $slug
            ]
        );

        Audit::log('education.profile_updated', "Updated educational profile for {$name}", [
            'tenant_id' => $tenantId,
        ]);

        return $this->getProfile($req, $res);
    }

    /**
     * Public school portal: Lists school profile and publications grouped by educational category.
     */
    public function publicSchoolPortal(Request $req, Response $res, array $args): Response
    {
        $this->ensureSchema();
        $slug = trim((string) ($args['slug'] ?? ''));
        if ($slug === '') {
            return Http::error($res, 'School slug required', 400);
        }

        $profile = Db::one(
            'SELECT p.*, t.name as tenant_name, t.slug as tenant_slug
             FROM educational_profiles p
             JOIN tenants t ON t.id = p.tenant_id
             WHERE p.portal_slug = ? OR t.slug = ?',
            [$slug, $slug]
        );

        if (!$profile) {
            return Http::error($res, 'School portal not found', 404);
        }

        $tenantId = (int) $profile['tenant_id'];

        $flipbooks = Db::all(
            "SELECT id, title, slug, description, page_count, status, workflow_status, settings, created_at
             FROM flipbooks
             WHERE tenant_id = ? AND status = 'ready'
             ORDER BY created_at DESC",
            [$tenantId]
        );

        $categorized = [
            'yearbooks' => [],
            'newsletters' => [],
            'syllabus' => [],
            'exam_papers' => [],
            'sports_programs' => [],
            'general' => [],
        ];

        foreach ($flipbooks as $f) {
            $settings = !empty($f['settings']) ? json_decode((string) $f['settings'], true) : [];
            $eduCat = $settings['educationalCategory'] ?? 'general';
            if (!isset($categorized[$eduCat])) {
                $eduCat = 'general';
            }

            $item = [
                'id' => (int) $f['id'],
                'title' => (string) $f['title'],
                'slug' => (string) $f['slug'],
                'description' => $f['description'] ?? '',
                'pageCount' => (int) $f['page_count'],
                'coverUrl' => "/api/public/{$f['slug']}/cover",
                'readerUrl' => "/v/{$f['slug']}",
                'pinProtected' => !empty($settings['pinProtection']),
                'domainRestricted' => !empty($settings['domainRestrictionEnabled']),
                'academicTerm' => $settings['academicTerm'] ?? '',
                'brandAccentColor' => $settings['brandAccentColor'] ?? '#0284c7',
                'createdAt' => (string) $f['created_at'],
            ];

            $categorized[$eduCat][] = $item;
        }

        return Http::json($res, [
            'profile' => [
                'institutionName' => (string) $profile['institution_name'],
                'motto' => $profile['motto'] ?? '',
                'academicYear' => $profile['academic_year'] ?? '2026-2027',
                'institutionType' => $profile['institution_type'] ?? 'secondary',
                'principalName' => $profile['principal_name'] ?? '',
                'campusAddress' => $profile['campus_address'] ?? '',
                'contactEmail' => $profile['contact_email'] ?? '',
                'contactPhone' => $profile['contact_phone'] ?? '',
                'crestUrl' => $profile['crest_url'] ?? '',
                'bannerUrl' => $profile['banner_url'] ?? '',
                'portalSlug' => (string) $profile['portal_slug'],
                'allowedEmailDomains' => $profile['allowed_email_domains'] ?? '',
            ],
            'categories' => $categorized,
            'totalPublications' => count($flipbooks),
        ]);
    }

    /**
     * List educational attachments for a publication (teacher/publisher view).
     */
    public function listResources(Request $req, Response $res, array $args): Response
    {
        $this->ensureSchema();
        $u = $req->getAttribute('user');
        $tenantId = TenantContext::id() ?? (!empty($u['tenant_id']) ? (int) $u['tenant_id'] : 1);
        $flipbookId = (int) ($args['flipbookId'] ?? 0);

        $resources = Db::all(
            'SELECT * FROM educational_resources WHERE tenant_id = ? AND flipbook_id = ? ORDER BY page_number ASC, id ASC',
            [$tenantId, $flipbookId]
        );

        return Http::json($res, [
            'resources' => array_map(function ($r) {
                return [
                    'id' => (int) $r['id'],
                    'flipbookId' => (int) $r['flipbook_id'],
                    'pageNumber' => $r['page_number'] ? (int) $r['page_number'] : null,
                    'title' => (string) $r['title'],
                    'resourceType' => (string) $r['resource_type'],
                    'fileUrl' => $r['file_url'] ?? '',
                    'externalUrl' => $r['external_url'] ?? '',
                    'description' => $r['description'] ?? '',
                    'downloadCount' => (int) ($r['download_count'] ?? 0),
                    'createdAt' => (string) $r['created_at'],
                ];
            }, $resources),
        ]);
    }

    /**
     * Add a lesson resource or worksheet attachment to a publication.
     */
    public function createResource(Request $req, Response $res): Response
    {
        $this->ensureSchema();
        $u = $req->getAttribute('user');
        $tenantId = TenantContext::id() ?? (!empty($u['tenant_id']) ? (int) $u['tenant_id'] : 1);

        $b = (array) $req->getParsedBody();
        $flipbookId = (int) ($b['flipbookId'] ?? 0);
        $title = trim((string) ($b['title'] ?? ''));

        if ($flipbookId <= 0 || $title === '') {
            return Http::error($res, 'Flipbook ID and resource title are required', 422);
        }

        // Validate flipbook belongs to tenant
        $flipbook = Db::one('SELECT id FROM flipbooks WHERE id = ? AND tenant_id = ?', [$flipbookId, $tenantId]);
        if (!$flipbook) {
            return Http::error($res, 'Publication not found in workspace', 404);
        }

        $pageNumber = !empty($b['pageNumber']) ? (int) $b['pageNumber'] : null;
        $type = in_array($b['resourceType'] ?? '', ['worksheet', 'syllabus', 'exam_paper', 'solution_guide', 'audio_lesson', 'external_link'], true)
            ? (string) $b['resourceType']
            : 'worksheet';
        $fileUrl = trim((string) ($b['fileUrl'] ?? ''));
        $externalUrl = trim((string) ($b['externalUrl'] ?? ''));
        $description = trim((string) ($b['description'] ?? ''));

        Db::run(
            'INSERT INTO educational_resources (
                tenant_id, flipbook_id, page_number, title, resource_type, file_url, external_url, description
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [$tenantId, $flipbookId, $pageNumber, $title, $type, $fileUrl ?: null, $externalUrl ?: null, $description ?: null]
        );

        $resourceId = (int) Db::pdo()->lastInsertId();

        Audit::log('education.resource_added', "Added {$type} resource: {$title} to flipbook #{$flipbookId}", [
            'resource_id' => $resourceId,
            'flipbook_id' => $flipbookId,
            'tenant_id' => $tenantId,
        ]);

        return Http::json($res, [
            'success' => true,
            'id' => $resourceId,
            'message' => 'Educational resource attached successfully.',
        ], 201);
    }

    /**
     * Delete an educational attachment.
     */
    public function deleteResource(Request $req, Response $res, array $args): Response
    {
        $this->ensureSchema();
        $u = $req->getAttribute('user');
        $tenantId = TenantContext::id() ?? (!empty($u['tenant_id']) ? (int) $u['tenant_id'] : 1);
        $id = (int) ($args['id'] ?? 0);

        Db::run('DELETE FROM educational_resources WHERE id = ? AND tenant_id = ?', [$id, $tenantId]);

        return Http::json($res, ['message' => 'Educational resource removed']);
    }

    /**
     * Public Reader: Get all attached worksheets, past papers & educational resources.
     */
    public function publicResources(Request $req, Response $res, array $args): Response
    {
        $this->ensureSchema();
        $slug = trim((string) ($args['slug'] ?? ''));
        $flipbook = Db::one('SELECT id, tenant_id, title FROM flipbooks WHERE slug = ?', [$slug]);
        if (!$flipbook) {
            return Http::error($res, 'Publication not found', 404);
        }

        $resources = Db::all(
            'SELECT id, page_number, title, resource_type, file_url, external_url, description, download_count
             FROM educational_resources
             WHERE flipbook_id = ?
             ORDER BY page_number ASC, id ASC',
            [$flipbook['id']]
        );

        return Http::json($res, [
            'publicationTitle' => $flipbook['title'],
            'resources' => array_map(function ($r) {
                return [
                    'id' => (int) $r['id'],
                    'pageNumber' => $r['page_number'] ? (int) $r['page_number'] : null,
                    'title' => (string) $r['title'],
                    'resourceType' => (string) $r['resource_type'],
                    'fileUrl' => $r['file_url'] ?? '',
                    'externalUrl' => $r['external_url'] ?? '',
                    'description' => $r['description'] ?? '',
                    'downloadCount' => (int) ($r['download_count'] ?? 0),
                ];
            }, $resources),
        ]);
    }

    /**
     * Public Reader: Student Study Notes & Highlighting API.
     */
    public function listAnnotations(Request $req, Response $res, array $args): Response
    {
        $this->ensureSchema();
        $slug = trim((string) ($args['slug'] ?? ''));
        $flipbook = Db::one('SELECT id FROM flipbooks WHERE slug = ?', [$slug]);
        if (!$flipbook) {
            return Http::error($res, 'Publication not found', 404);
        }

        $student = trim((string) ($req->getQueryParams()['student'] ?? 'default_student'));

        $annotations = Db::all(
            'SELECT * FROM educational_annotations WHERE flipbook_id = ? AND student_identifier = ? ORDER BY page_number ASC, id ASC',
            [$flipbook['id'], $student]
        );

        return Http::json($res, [
            'annotations' => array_map(function ($a) {
                return [
                    'id' => (int) $a['id'],
                    'pageNumber' => (int) $a['page_number'],
                    'studentName' => (string) $a['student_name'],
                    'annotationType' => (string) $a['annotation_type'],
                    'color' => (string) $a['color'],
                    'noteText' => $a['note_text'] ?? '',
                    'rectData' => $a['rect_data'] ? json_decode((string) $a['rect_data'], true) : null,
                    'createdAt' => (string) $a['created_at'],
                ];
            }, $annotations),
        ]);
    }

    /**
     * Public Reader: Save Student Study Note or Highlight.
     */
    public function saveAnnotation(Request $req, Response $res, array $args): Response
    {
        $this->ensureSchema();
        $slug = trim((string) ($args['slug'] ?? ''));
        $flipbook = Db::one('SELECT id, tenant_id FROM flipbooks WHERE slug = ?', [$slug]);
        if (!$flipbook) {
            return Http::error($res, 'Publication not found', 404);
        }

        $b = (array) $req->getParsedBody();
        $pageNumber = max(1, (int) ($b['pageNumber'] ?? 1));
        $studentName = trim((string) ($b['studentName'] ?? 'Student'));
        $studentIdentifier = trim((string) ($b['studentIdentifier'] ?? 'default_student'));
        $type = in_array($b['annotationType'] ?? '', ['note', 'highlight', 'bookmark'], true)
            ? (string) $b['annotationType']
            : 'note';
        $color = trim((string) ($b['color'] ?? '#fef08a'));
        $noteText = trim((string) ($b['noteText'] ?? ''));
        $rectData = !empty($b['rectData']) ? json_encode($b['rectData']) : null;

        Db::run(
            'INSERT INTO educational_annotations (
                tenant_id, flipbook_id, page_number, student_name, student_identifier,
                annotation_type, color, note_text, rect_data
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                $flipbook['tenant_id'],
                $flipbook['id'],
                $pageNumber,
                $studentName,
                $studentIdentifier,
                $type,
                $color,
                $noteText ?: null,
                $rectData
            ]
        );

        $annotationId = (int) Db::pdo()->lastInsertId();

        return Http::json($res, [
            'success' => true,
            'id' => $annotationId,
            'message' => 'Study annotation saved',
        ], 201);
    }

    /**
     * Delete study annotation.
     */
    public function deleteAnnotation(Request $req, Response $res, array $args): Response
    {
        $this->ensureSchema();
        $id = (int) ($args['id'] ?? 0);
        Db::run('DELETE FROM educational_annotations WHERE id = ?', [$id]);
        return Http::json($res, ['message' => 'Annotation removed']);
    }

    /**
     * Verify 4-6 digit quick PIN code for educational/parent publication access.
     */
    public function verifyPin(Request $req, Response $res, array $args): Response
    {
        $this->ensureSchema();
        $slug = trim((string) ($args['slug'] ?? ''));
        $flipbook = Db::one('SELECT * FROM flipbooks WHERE slug = ?', [$slug]);
        if (!$flipbook) {
            return Http::error($res, 'Publication not found', 404);
        }

        $settings = !empty($flipbook['settings']) ? json_decode((string) $flipbook['settings'], true) : [];
        $expectedPin = trim((string) ($settings['pinCode'] ?? ''));

        if ($expectedPin === '' && empty($settings['pinProtection'])) {
            // No PIN required
            return Http::json($res, ['unlocked' => true]);
        }

        $b = (array) $req->getParsedBody();
        $submittedPin = trim((string) ($b['pin'] ?? ''));

        if ($submittedPin === '' || $submittedPin !== $expectedPin) {
            return Http::error($res, 'Invalid PIN code. Please try again or contact your school administrator.', 403);
        }

        // PIN verified: issue reader unlock token
        $cookies = $req->getCookieParams();
        $readerSid = isset($cookies['nvf_reader_sid']) && preg_match('/^[a-f0-9]{32}$/', (string) $cookies['nvf_reader_sid'])
            ? (string) $cookies['nvf_reader_sid']
            : bin2hex(random_bytes(16));

        $expiresAt = time() + self::UNLOCK_TTL_SECONDS;
        $jti = bin2hex(random_bytes(16));
        $claims = [
            'iss' => 'nuvis-flipex',
            'sub' => (string) $flipbook['id'],
            'jti' => $jti,
            'sid' => $readerSid,
            'role' => 'student_parent_pin',
            'exp' => $expiresAt,
        ];
        $unlockToken = CryptoSecrets::jwtEncode($claims);

        $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');
        $secureAttr = $isHttps ? '; Secure' : '';

        $res = $res
            ->withAddedHeader('Set-Cookie', "nvf_reader_sid={$readerSid}; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax{$secureAttr}")
            ->withAddedHeader('Set-Cookie', "nvf_unlock_{$flipbook['id']}={$unlockToken}; Path=/; Max-Age=" . self::UNLOCK_TTL_SECONDS . "; HttpOnly; SameSite=Lax{$secureAttr}");

        return Http::json($res, [
            'success' => true,
            'unlocked' => true,
            'unlockToken' => $unlockToken,
            'expiresAt' => gmdate('c', $expiresAt),
        ]);
    }

    /**
     * Verify student/parent school email domain (e.g. user@school.edu.fj).
     */
    public function verifyDomain(Request $req, Response $res, array $args): Response
    {
        $this->ensureSchema();
        $slug = trim((string) ($args['slug'] ?? ''));
        $flipbook = Db::one('SELECT * FROM flipbooks WHERE slug = ?', [$slug]);
        if (!$flipbook) {
            return Http::error($res, 'Publication not found', 404);
        }

        $settings = !empty($flipbook['settings']) ? json_decode((string) $flipbook['settings'], true) : [];
        $allowedDomains = !empty($settings['allowedDomains'])
            ? array_map('trim', explode(',', strtolower((string) $settings['allowedDomains'])))
            : [];

        // Check if institutional profile also specifies allowed domains
        if (empty($allowedDomains)) {
            $eduProfile = Db::one('SELECT allowed_email_domains FROM educational_profiles WHERE tenant_id = ?', [$flipbook['tenant_id']]);
            if (!empty($eduProfile['allowed_email_domains'])) {
                $allowedDomains = array_map('trim', explode(',', strtolower((string) $eduProfile['allowed_email_domains'])));
            }
        }

        $b = (array) $req->getParsedBody();
        $email = trim(strtolower((string) ($b['email'] ?? '')));

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return Http::error($res, 'Please provide a valid institutional email address.', 422);
        }

        $emailDomain = substr(strrchr($email, '@') ?: '', 1);
        $matched = false;

        foreach ($allowedDomains as $dom) {
            if ($dom !== '' && ($emailDomain === $dom || str_ends_with($emailDomain, '.' . $dom))) {
                $matched = true;
                break;
            }
        }

        if (!$matched && !empty($allowedDomains)) {
            $allowedListStr = implode(', ', $allowedDomains);
            return Http::error($res, "Access restricted to institutional email addresses ending in: {$allowedListStr}", 403);
        }

        // Domain verified: issue unlock token
        $cookies = $req->getCookieParams();
        $readerSid = isset($cookies['nvf_reader_sid']) && preg_match('/^[a-f0-9]{32}$/', (string) $cookies['nvf_reader_sid'])
            ? (string) $cookies['nvf_reader_sid']
            : bin2hex(random_bytes(16));

        $expiresAt = time() + self::UNLOCK_TTL_SECONDS;
        $jti = bin2hex(random_bytes(16));
        $claims = [
            'iss' => 'nuvis-flipex',
            'sub' => (string) $flipbook['id'],
            'jti' => $jti,
            'sid' => $readerSid,
            'email' => $email,
            'role' => 'verified_student_domain',
            'exp' => $expiresAt,
        ];
        $unlockToken = CryptoSecrets::jwtEncode($claims);

        $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');
        $secureAttr = $isHttps ? '; Secure' : '';

        $res = $res
            ->withAddedHeader('Set-Cookie', "nvf_reader_sid={$readerSid}; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax{$secureAttr}")
            ->withAddedHeader('Set-Cookie', "nvf_unlock_{$flipbook['id']}={$unlockToken}; Path=/; Max-Age=" . self::UNLOCK_TTL_SECONDS . "; HttpOnly; SameSite=Lax{$secureAttr}");

        return Http::json($res, [
            'success' => true,
            'unlocked' => true,
            'unlockToken' => $unlockToken,
            'verifiedEmail' => $email,
            'expiresAt' => gmdate('c', $expiresAt),
        ]);
    }
}
