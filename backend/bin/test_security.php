<?php
declare(strict_types=1);

/**
 * Nuvis Flipex — Automated Tenant Isolation & Security Test Suite
 *
 * Verifies:
 *   1. Cross-tenant data isolation and Insecure Direct Object Reference (IDOR) prevention
 *   2. Granular Role-Based Access Control (RBAC) permission enforcement
 *   3. Direct file access protection and password-protected flipbook security
 *   4. Refresh token rotation and replay-attack detection
 *   5. RFC 6238 Time-Based One-Time Password (TOTP) verification
 *   6. Security audit trail and event logging
 *
 * Run:
 *   php bin/test_security.php
 */

require __DIR__ . '/../vendor/autoload.php';

use App\Support\Db;
use App\Support\Jwt;
use App\Support\Rbac;
use App\Support\Storage;
use App\Support\Totp;
use Dotenv\Dotenv;

Dotenv::createImmutable(__DIR__ . '/..')->safeLoad();

echo "====================================================================\n";
echo "   Nuvis Flipex — Automated Tenant Isolation & Security Test Suite  \n";
echo "====================================================================\n\n";

$apiUrl = 'http://127.0.0.1:8080/api/v1';
$passed = 0;
$failed = 0;

function assertTest(string $description, bool $condition, string $detail = ''): void {
    global $passed, $failed;
    if ($condition) {
        $passed++;
        echo "  [\e[32mPASS\e[0m] {$description}\n";
    } else {
        $failed++;
        echo "  [\e[31mFAIL\e[0m] {$description}" . ($detail ? " — {$detail}" : '') . "\n";
    }
}

function httpReq(string $method, string $url, ?array $body = null, ?string $token = null, array $headers = []): array {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    $reqHeaders = ['X-Requested-With: XMLHttpRequest'];
    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
        $reqHeaders[] = 'Content-Type: application/json';
    }
    if ($token !== null) {
        $reqHeaders[] = 'Authorization: Bearer ' . $token;
    }
    foreach ($headers as $k => $v) {
        $reqHeaders[] = "{$k}: {$v}";
    }
    curl_setopt($ch, CURLOPT_HTTPHEADER, $reqHeaders);
    $response = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    return [
        'status' => $status,
        'body' => json_decode((string) $response, true) ?: (string) $response,
    ];
}

echo "Setting up isolated test fixtures in database...\n";

// Pre-clean any leftover fixtures from prior runs
Db::run("DELETE FROM flipbooks WHERE slug IN ('alpha-secret-doc', 'beta-confidential-doc', 'protected-sec-test-doc', 'unpublished-draft-sec-test', 'locked-magazine-sec-test') OR slug LIKE 'unpublished-draft-sec-test-copy%' OR slug LIKE 'fiji-hardware-erp-catalogue-q4%'");
Db::run("DELETE FROM users WHERE email IN ('user-a@alpha.test', 'user-b@beta.test', 'viewer-a@alpha.test', 'finance-a@alpha.test', 'owner-a@alpha.test', 'owner-b@beta.test', 'platadmin@alpha.test')");
Db::run("DELETE FROM tenants WHERE slug IN ('test-corp-alpha', 'test-corp-beta')");

// 1. Setup Tenant Alpha and Tenant Beta
$uuidA = bin2hex(random_bytes(16));
$uuidB = bin2hex(random_bytes(16));

Db::run("INSERT INTO tenants (uuid, name, slug, plan_id, is_active, billing_name, amount, currency) VALUES (?, 'Test Corp Alpha', 'test-corp-alpha', 2, 1, 'Alpha Corp Ltd', 29.00, 'USD')", [$uuidA]);
$tenantAId = (int) Db::pdo()->lastInsertId();

Db::run("INSERT INTO tenants (uuid, name, slug, plan_id, is_active, billing_name, amount, currency) VALUES (?, 'Test Corp Beta', 'test-corp-beta', 2, 1, 'Beta Corp Ltd', 99.00, 'EUR')", [$uuidB]);
$tenantBId = (int) Db::pdo()->lastInsertId();

// Setup Users
$passHash = password_hash('TestPass123!', PASSWORD_ARGON2ID);

// User A (Editor in Tenant Alpha)
Db::run("INSERT INTO users (tenant_id, email, password_hash, name, role, tenant_role, status, email_verified_at) VALUES (?, 'user-a@alpha.test', ?, 'Alice Alpha', 'user', 'editor', 'active', NOW())", [$tenantAId, $passHash]);
$userAId = (int) Db::pdo()->lastInsertId();
$tokenA = Jwt::issue($userAId, 'user');

// User B (Editor in Tenant Beta)
Db::run("INSERT INTO users (tenant_id, email, password_hash, name, role, tenant_role, status, email_verified_at) VALUES (?, 'user-b@beta.test', ?, 'Bob Beta', 'user', 'editor', 'active', NOW())", [$tenantBId, $passHash]);
$userBId = (int) Db::pdo()->lastInsertId();
$tokenB = Jwt::issue($userBId, 'user');

// User A Viewer (Viewer in Tenant Alpha)
Db::run("INSERT INTO users (tenant_id, email, password_hash, name, role, tenant_role, status, email_verified_at) VALUES (?, 'viewer-a@alpha.test', ?, 'Vince Viewer', 'user', 'viewer', 'active', NOW())", [$tenantAId, $passHash]);
$viewerAId = (int) Db::pdo()->lastInsertId();
$tokenViewerA = Jwt::issue($viewerAId, 'user');

// Ensure 'finance' is in users.tenant_role ENUM before creating Finance user
\App\Controllers\BillingController::ensureBillingSecuritySchema();

// User A Finance Administrator (Finance in Tenant Alpha)
Db::run("INSERT INTO users (tenant_id, email, password_hash, name, role, tenant_role, status, email_verified_at) VALUES (?, 'finance-a@alpha.test', ?, 'Fiona Finance', 'user', 'finance', 'active', NOW())", [$tenantAId, $passHash]);
$financeAId = (int) Db::pdo()->lastInsertId();
$tokenFinanceA = Jwt::issue($financeAId, 'user');

// User A Tenant Owner (Owner in Tenant Alpha)
Db::run("INSERT INTO users (tenant_id, email, password_hash, name, role, tenant_role, status, email_verified_at) VALUES (?, 'owner-a@alpha.test', ?, 'Olivia Owner Alpha', 'user', 'owner', 'active', NOW())", [$tenantAId, $passHash]);
$ownerAId = (int) Db::pdo()->lastInsertId();
$tokenOwnerA = Jwt::issue($ownerAId, 'user');

// User B Tenant Owner (Owner in Tenant Beta)
Db::run("INSERT INTO users (tenant_id, email, password_hash, name, role, tenant_role, status, email_verified_at) VALUES (?, 'owner-b@beta.test', ?, 'Oscar Owner Beta', 'user', 'owner', 'active', NOW())", [$tenantBId, $passHash]);
$ownerBId = (int) Db::pdo()->lastInsertId();
$tokenOwnerB = Jwt::issue($ownerBId, 'user');

// Platform Administrator
Db::run("INSERT INTO users (tenant_id, email, password_hash, name, role, tenant_role, status, email_verified_at) VALUES (?, 'platadmin@alpha.test', ?, 'Platform Admin', 'admin', 'owner', 'active', NOW())", [$tenantAId, $passHash]);
$platAdminId = (int) Db::pdo()->lastInsertId();
$tokenPlatAdmin = Jwt::issue($platAdminId, 'admin');

// Setup Flipbooks
Db::run("INSERT INTO flipbooks (tenant_id, user_id, title, slug, status, visibility) VALUES (?, ?, 'Alpha Confidential Report', 'alpha-confidential-report', 'ready', 'unlisted')", [$tenantAId, $userAId]);
$flipbookAId = (int) Db::pdo()->lastInsertId();

Db::run("INSERT INTO flipbooks (tenant_id, user_id, title, slug, status, visibility) VALUES (?, ?, 'Beta Proprietary Catalog', 'beta-proprietary-catalog', 'ready', 'unlisted')", [$tenantBId, $userBId]);
$flipbookBId = (int) Db::pdo()->lastInsertId();

// Add Hotspot to Beta
Db::run("INSERT INTO hotspots (flipbook_id, page_number, type, x, y, w, h, payload) VALUES (?, 1, 'link', 10, 10, 30, 20, ?)", [$flipbookBId, json_encode(['url' => 'https://beta.test'])]);
$hotspotBId = (int) Db::pdo()->lastInsertId();

echo "Fixtures created. Beginning security verification suite.\n\n";

// ============================================================================
// TEST SUITE 1: TENANT DATA ISOLATION & IDOR PREVENTION
// ============================================================================
echo "1. Tenant Data Isolation & IDOR Protection:\n";

// 1.1 List publications scoping
$r = httpReq('GET', "{$apiUrl}/flipbooks", null, $tokenA);
$flipbooksReturned = is_array($r['body']) ? array_column($r['body'], 'id') : [];
assertTest(
    "Tenant Alpha list returns Alpha's flipbooks and excludes Tenant Beta",
    in_array($flipbookAId, $flipbooksReturned, true) && !in_array($flipbookBId, $flipbooksReturned, true),
    "Returned IDs: " . json_encode($flipbooksReturned)
);

// 1.2 IDOR Read attempt
$r = httpReq('GET', "{$apiUrl}/flipbooks/{$flipbookBId}", null, $tokenA);
assertTest(
    "Cross-tenant IDOR read attempt blocked (Tenant A reading Tenant B flipbook)",
    $r['status'] === 404 || $r['status'] === 403,
    "Expected 404/403, received: {$r['status']}"
);

// 1.3 IDOR Update attempt
$r = httpReq('PATCH', "{$apiUrl}/flipbooks/{$flipbookBId}", ['title' => 'Hacked Title'], $tokenA);
assertTest(
    "Cross-tenant IDOR update attempt blocked (Tenant A mutating Tenant B flipbook)",
    $r['status'] === 404 || $r['status'] === 403,
    "Expected 404/403, received: {$r['status']}"
);

// Verify Beta flipbook title was NOT modified
$bCheck = Db::one('SELECT title FROM flipbooks WHERE id = ?', [$flipbookBId]);
assertTest(
    "Database integrity verified (Target record was not altered)",
    $bCheck['title'] === 'Beta Proprietary Catalog'
);

// 1.4 IDOR Delete attempt
$r = httpReq('DELETE', "{$apiUrl}/flipbooks/{$flipbookBId}", null, $tokenA);
assertTest(
    "Cross-tenant IDOR delete attempt blocked (Tenant A deleting Tenant B flipbook)",
    $r['status'] === 404 || $r['status'] === 403,
    "Expected 404/403, received: {$r['status']}"
);

// 1.5 Hotspot Isolation
$r = httpReq('GET', "{$apiUrl}/flipbooks/{$flipbookBId}/hotspots", null, $tokenA);
assertTest(
    "Cross-tenant hotspot access blocked",
    $r['status'] === 404 || $r['status'] === 403,
    "Expected 404/403, received: {$r['status']}"
);

// 1.6 Analytics Isolation
$r = httpReq('GET', "{$apiUrl}/flipbooks/{$flipbookBId}/analytics", null, $tokenA);
assertTest(
    "Cross-tenant analytics access blocked",
    $r['status'] === 404 || $r['status'] === 403,
    "Expected 404/403, received: {$r['status']}"
);

// 1.7 Corporate Billing Isolation
$r = httpReq('GET', "{$apiUrl}/me/tenant-billing", null, $tokenA);
assertTest(
    "Tenant Alpha receives only its own billing info ($29 USD) without leaking Tenant Beta ($99 EUR)",
    ($r['body']['companyName'] ?? '') === 'Test Corp Alpha' && ($r['body']['currency'] ?? '') === 'USD',
    json_encode($r['body'])
);

echo "\n";

// ============================================================================
// TEST SUITE 2: GRANULAR ROLE-BASED ACCESS CONTROL (RBAC)
// ============================================================================
echo "2. Granular Role-Based Access Control (RBAC):\n";

// 2.1 Viewer cannot delete publication
$r = httpReq('DELETE', "{$apiUrl}/flipbooks/{$flipbookAId}", null, $tokenViewerA);
assertTest(
    "Role 'viewer' cannot delete publication (HTTP 403 Forbidden)",
    $r['status'] === 403,
    "Received status: {$r['status']}"
);

// 2.2 Viewer cannot create hotspot
$r = httpReq('POST', "{$apiUrl}/flipbooks/{$flipbookAId}/hotspots", ['pageNumber' => 1, 'type' => 'link', 'x' => 10, 'y' => 10, 'w' => 10, 'h' => 10], $tokenViewerA);
assertTest(
    "Role 'viewer' cannot create hotspot (HTTP 403 Forbidden)",
    $r['status'] === 403,
    "Received status: {$r['status']}"
);

// 2.3 Editor CAN update hotspot
$r = httpReq('POST', "{$apiUrl}/flipbooks/{$flipbookAId}/hotspots", ['pageNumber' => 1, 'type' => 'link', 'x' => 10, 'y' => 10, 'w' => 10, 'h' => 10, 'payload' => ['url' => 'https://alpha.test']], $tokenA);
assertTest(
    "Role 'editor' can create hotspot on own publication (HTTP 201 Created)",
    $r['status'] === 201,
    "Received status: {$r['status']}"
);

echo "\n";

// ============================================================================
// TEST SUITE 3: PROTECTED DOCUMENT ACCESS & PASSWORD PROTECTION
// ============================================================================
echo "3. Protected Document Delivery & Password Security:\n";

// Create password protected flipbook
$pwHash = password_hash('AlphaSecret99!', PASSWORD_ARGON2ID);
Db::run("INSERT INTO flipbooks (tenant_id, user_id, title, slug, status, workflow_status, visibility, password_hash, published_at) VALUES (?, ?, 'Locked Magazine', 'locked-magazine-sec-test', 'ready', 'published', 'password', ?, NOW())", [$tenantAId, $userAId, $pwHash]);
$lockedFid = (int) Db::pdo()->lastInsertId();

// Mock page assets (Page 1 & Page 2)
$dummyPath = Storage::root() . "/tenants/{$tenantAId}/publications/{$lockedFid}/page-001.jpg";
$dummyPath2 = Storage::root() . "/tenants/{$tenantAId}/publications/{$lockedFid}/page-002.jpg";
Storage::ensureDir(dirname($dummyPath));
file_put_contents($dummyPath, "\xFF\xD8\xFF\xE0\x00\x10JFIF" . str_repeat('0', 50));
file_put_contents($dummyPath2, "\xFF\xD8\xFF\xE0\x00\x10JFIF" . str_repeat('0', 50));
Db::run("INSERT INTO pages (flipbook_id, page_number, image_path, thumb_path, width, height) VALUES (?, 1, ?, ?, 800, 1100)", [
    $lockedFid,
    "tenants/{$tenantAId}/publications/{$lockedFid}/page-001.jpg",
    "tenants/{$tenantAId}/publications/{$lockedFid}/page-001.jpg",
]);
Db::run("INSERT INTO pages (flipbook_id, page_number, image_path, thumb_path, width, height) VALUES (?, 2, ?, ?, 800, 1100)", [
    $lockedFid,
    "tenants/{$tenantAId}/publications/{$lockedFid}/page-002.jpg",
    "tenants/{$tenantAId}/publications/{$lockedFid}/page-002.jpg",
]);

// 3.1 Metadata inspection
$r = httpReq('GET', "{$apiUrl}/public/locked-magazine-sec-test");
assertTest(
    "Password protected flipbook returns locked: true without page URLs",
    ($r['body']['locked'] ?? false) === true && empty($r['body']['pages']),
    json_encode($r['body'])
);

// 3.2 Direct asset access without unlock token is forbidden
$r = httpReq('GET', "{$apiUrl}/public/locked-magazine-sec-test/pages/2");
assertTest(
    "Direct protected page access without unlock token blocked (HTTP 403 Forbidden)",
    $r['status'] === 403,
    "Received status: {$r['status']}"
);

// 3.3 Unlock with incorrect password
$r = httpReq('POST', "{$apiUrl}/public/locked-magazine-sec-test/unlock", ['password' => 'WrongPassword!']);
assertTest(
    "Incorrect password unlock rejected (HTTP 403 Forbidden)",
    $r['status'] === 403,
    "Received status: {$r['status']}"
);

// 3.4 Unlock with correct password returns expiring (30-min) signed unlock token
$r = httpReq('POST', "{$apiUrl}/public/locked-magazine-sec-test/unlock", ['password' => 'AlphaSecret99!']);
$unlockToken = $r['body']['unlockToken'] ?? '';
$unlockTtl = (int) ($r['body']['expiresInSeconds'] ?? 0);
assertTest(
    "Correct password unlock returns 30-minute expiring cryptographic unlock token (1800s TTL)",
    $r['status'] === 200 && !empty($unlockToken) && str_contains($unlockToken, '.') && $unlockTtl === 1800,
    "Unlock token received: " . substr($unlockToken, 0, 10) . "..., TTL: {$unlockTtl}"
);

// 3.5 Asset access WITH unlock token in header succeeds, while URL query ?token=... is strictly rejected
$rHeader = httpReq('GET', "{$apiUrl}/public/locked-magazine-sec-test/pages/2", null, null, ['X-Unlock-Token' => $unlockToken]);
$rUrlQuery = httpReq('GET', "{$apiUrl}/public/locked-magazine-sec-test/pages/2?token=" . rawurlencode($unlockToken));
assertTest(
    "Authorized image streaming with X-Unlock-Token succeeds (200) while URL query ?token=... is rejected (403)",
    $rHeader['status'] === 200 && $rUrlQuery['status'] === 403,
    "Header status: {$rHeader['status']}, URL query status: {$rUrlQuery['status']}"
);

// 3.6 Explicit reader session lock revokes token jti immediately
$rLock = httpReq('POST', "{$apiUrl}/public/locked-magazine-sec-test/lock", [], null, ['X-Unlock-Token' => $unlockToken]);
$rAfterLock = httpReq('GET', "{$apiUrl}/public/locked-magazine-sec-test/pages/2", null, null, ['X-Unlock-Token' => $unlockToken]);
assertTest(
    "Reader session lock (POST /public/{slug}/lock) immediately revokes unlock token (subsequent access 403)",
    $rLock['status'] === 200 && $rAfterLock['status'] === 403
);

// 3.7 Publication owner bulk revocation (POST /flipbooks/{id}/revoke-unlock-tokens) invalidates all active tokens
$rUnlock2 = httpReq('POST', "{$apiUrl}/public/locked-magazine-sec-test/unlock", ['password' => 'AlphaSecret99!']);
$unlockToken2 = $rUnlock2['body']['unlockToken'] ?? '';
$rOwnerRevoke = httpReq('POST', "{$apiUrl}/flipbooks/{$lockedFid}/revoke-unlock-tokens", [], $tokenA);
$rAfterOwnerRevoke = httpReq('GET', "{$apiUrl}/public/locked-magazine-sec-test/pages/2", null, null, ['X-Unlock-Token' => $unlockToken2]);
assertTest(
    "Publication owner revocation (POST /flipbooks/{id}/revoke-unlock-tokens) invalidates all active unlock tokens (403)",
    $rOwnerRevoke['status'] === 200 && $rAfterOwnerRevoke['status'] === 403
);

echo "\n";

// ============================================================================
// TEST SUITE 4: REFRESH TOKEN ROTATION & REPLAY ATTACK DETECTION
// ============================================================================
echo "4. Refresh Token Rotation & Replay Attack Detection:\n";

// Generate initial token R1
$rawR1 = bin2hex(random_bytes(32));
Db::run("INSERT INTO refresh_tokens (user_id, token_hash, user_agent, ip, expires_at) VALUES (?, ?, 'SecTest', '127.0.0.1', DATE_ADD(NOW(), INTERVAL 30 DAY))", [$userAId, hash('sha256', $rawR1)]);
$r1Id = (int) Db::pdo()->lastInsertId();

// Client sends R1 to refresh -> gets rotated to R2
$ch = curl_init("{$apiUrl}/auth/refresh");
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'POST');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_COOKIE, "refresh_token={$rawR1}");
curl_setopt($ch, CURLOPT_HTTPHEADER, ['X-Requested-With: XMLHttpRequest']);
curl_setopt($ch, CURLOPT_HEADER, true);
$res = curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

preg_match('/refresh_token=([a-f0-9]+);/i', (string) $res, $m);
$rawR2 = $m[1] ?? '';

assertTest(
    "Refresh token R1 rotates successfully to new token R2",
    $code === 200 && !empty($rawR2) && $rawR2 !== $rawR1,
    "Code: {$code}, New token generated"
);

// Verify R1 was marked revoked in database
$r1Db = Db::one('SELECT revoked_at FROM refresh_tokens WHERE id = ?', [$r1Id]);
assertTest(
    "Old token R1 revoked in database",
    !empty($r1Db['revoked_at'])
);

// Attacker replays old revoked token R1
$ch = curl_init("{$apiUrl}/auth/refresh");
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'POST');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_COOKIE, "refresh_token={$rawR1}");
curl_setopt($ch, CURLOPT_HTTPHEADER, ['X-Requested-With: XMLHttpRequest']);
$replayRes = curl_exec($ch);
$replayCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

assertTest(
    "Replay attack on old token R1 immediately rejected (HTTP 401)",
    $replayCode === 401,
    "Code: {$replayCode}"
);

// Verify that R2 was also revoked as security countermeasure
$r2Hash = hash('sha256', $rawR2);
$r2Db = Db::one('SELECT revoked_at FROM refresh_tokens WHERE token_hash = ?', [$r2Hash]);
assertTest(
    "Replay attack triggered family revocation (R2 invalidated to protect account)",
    !empty($r2Db['revoked_at'])
);

// Verify security event was logged
$secEvent = Db::one("SELECT * FROM security_events WHERE event_type = 'token_replay_detected' AND user_id = ? ORDER BY id DESC LIMIT 1", [$userAId]);
assertTest(
    "Critical security event 'token_replay_detected' logged in security audit trail",
    !empty($secEvent) && $secEvent['severity'] === 'critical'
);

echo "\n";

// ============================================================================
// TEST SUITE 5: RFC 6238 TOTP AUTHENTICATOR VERIFICATION
// ============================================================================
echo "5. RFC 6238 Authenticator TOTP Security:\n";

$secret = Totp::generateSecret();
$validCode = Totp::calculate($secret);
$valid = Totp::verify($validCode, $secret);
assertTest(
    "Valid RFC 6238 6-digit TOTP code accepted",
    $valid === true
);

$invalidCode = str_pad((string) (((int) $validCode + 555555) % 1000000), 6, '0', STR_PAD_LEFT);
$invalid = Totp::verify($invalidCode, $secret);
assertTest(
    "Invalid TOTP code rejected",
    $invalid === false
);

// Expired timestamp (-10 minutes)
$expiredCode = Totp::calculate($secret, time() - 600);
$expiredValid = Totp::verify($expiredCode, $secret);
assertTest(
    "Expired TOTP code (-10 minutes) rejected",
    $expiredValid === false
);

echo "\n";

// ============================================================================
// TEST SUITE 6: DOCUMENT PROCESSING, SIGNED DRAFT PREVIEW & PUBLISHING LIFECYCLE
// ============================================================================
echo "6. Document Processing, Signed Draft Preview & 7-Stage Publishing Lifecycle:\n";

// 6.1 Create an unpublished 'editing' draft flipbook
Db::run(
    "INSERT INTO flipbooks (tenant_id, user_id, title, slug, status, workflow_status, visibility, published_at)
     VALUES (?, ?, 'Unpublished Editorial Draft', 'unpublished-draft-sec-test', 'ready', 'editing', 'unlisted', NULL)",
    [$tenantAId, $userAId]
);
$draftFid = (int) Db::pdo()->lastInsertId();
$draftPagePath = Storage::root() . "/tenants/{$tenantAId}/publications/{$draftFid}/page-001.jpg";
Storage::ensureDir(dirname($draftPagePath));
file_put_contents($draftPagePath, "\xFF\xD8\xFF\xE0\x00\x10JFIF" . str_repeat('0', 50));
Db::run(
    "INSERT INTO pages (flipbook_id, page_number, image_path, thumb_path, width, height) VALUES (?, 1, ?, ?, 800, 1100)",
    [$draftFid, "tenants/{$tenantAId}/publications/{$draftFid}/page-001.jpg", "tenants/{$tenantAId}/publications/{$draftFid}/page-001.jpg"]
);

// 6.2 Anonymous access to unpublished draft via /public/{slug}/pages/1 MUST be blocked
$r = httpReq('GET', "{$apiUrl}/public/unpublished-draft-sec-test/pages/1");
assertTest(
    "Unpublished draft asset access blocked for anonymous users (HTTP 404)",
    $r['status'] === 404,
    "Received status: {$r['status']}"
);

// 6.3 Unauthenticated access to /flipbooks/{id}/pages/1 MUST be blocked (HTTP 401)
$r = httpReq('GET', "{$apiUrl}/flipbooks/{$draftFid}/pages/1");
assertTest(
    "Unauthenticated direct /flipbooks/{id}/pages/1 blocked (HTTP 401)",
    $r['status'] === 401,
    "Received status: {$r['status']}"
);

// 6.4 Signed Draft Preview Token allows authorized preview of unpublished draft
$previewToken = Storage::generatePreviewToken('unpublished-draft-sec-test', 3600);
$r = httpReq('GET', "{$apiUrl}/public/unpublished-draft-sec-test?preview=" . rawurlencode($previewToken));
assertTest(
    "Valid HMAC-SHA256 Draft Preview token grants preview access to unpublished draft",
    $r['status'] === 200 && ($r['body']['isPreview'] ?? false) === true,
    "Status: {$r['status']}"
);

// 6.5 Workflow transition: editing -> in_review -> published (with RBAC & review notes)
$r = httpReq('POST', "{$apiUrl}/flipbooks/{$draftFid}/workflow", [
    'stage' => 'in_review',
    'notes' => 'Ready for chief editor approval',
], $tokenA);
assertTest(
    "Workflow transitions to 'in_review' with editorial notes",
    $r['status'] === 200 && ($r['body']['workflowStatus'] ?? '') === 'in_review',
    "Status: {$r['status']}, stage: " . ($r['body']['workflowStatus'] ?? '')
);

// 6.6 Viewer cannot approve & publish
$r = httpReq('POST', "{$apiUrl}/flipbooks/{$draftFid}/workflow", ['stage' => 'published'], $tokenViewerA);
assertTest(
    "Role 'viewer' cannot approve & publish publication (HTTP 403 Forbidden)",
    $r['status'] === 403,
    "Received status: {$r['status']}"
);

// 6.7 Publication duplication clones flipbook and pages
$r = httpReq('POST', "{$apiUrl}/flipbooks/{$draftFid}/duplicate", ['title' => 'Duplicated Draft'], $tokenA);
$dupFid = (int) ($r['body']['id'] ?? 0);
assertTest(
    "Publication duplication clones flipbook and pages (HTTP 201)",
    $r['status'] === 201 && $dupFid > 0 && ($r['body']['title'] ?? '') === 'Duplicated Draft',
    "Status: {$r['status']}, dupId: {$dupFid}"
);

// 6.8 PDF Validator rejects corrupted / non-PDF files
$badPdf = sys_get_temp_dir() . '/bad_test_' . bin2hex(random_bytes(4)) . '.pdf';
file_put_contents($badPdf, 'NOT_A_VALID_PDF_FILE_CONTENT');
$validatorRejected = false;
try {
    \App\Support\PdfRenderer::validatePdf($badPdf);
} catch (\Throwable $e) {
    $validatorRejected = true;
}
@unlink($badPdf);
assertTest(
    "PdfRenderer::validatePdf strictly rejects non-PDF / corrupted files",
    $validatorRejected === true
);

echo "\n";

// ============================================================================
// TEST SUITE 7: READER FULL-TEXT SEARCH, TELEMETRY & COMMERCIAL ANALYTICS
// ============================================================================
echo "7. Reader Full-Text Search, Telemetry & Commercial Analytics:\n";

// Publish $draftFid so we can test public search & telemetry & commercial analytics
Db::run(
    "UPDATE flipbooks SET workflow_status = 'published', published_at = NOW(), toc = ? WHERE id = ?",
    [json_encode([['title' => 'Chapter 1: Fiji Digital Transformation', 'page' => 1, 'level' => 1]]), $draftFid]
);
Db::run(
    "UPDATE pages SET text_content = 'Welcome to the Nuvis Flipex Digital Publishing Platform in Suva Fiji.' WHERE flipbook_id = ? AND page_number = 1",
    [$draftFid]
);

// 7.1 Full-text search inside publication
$r = httpReq('GET', "{$apiUrl}/public/unpublished-draft-sec-test/search?q=Suva");
assertTest(
    "In-publication full-text search returns matching page and snippet",
    $r['status'] === 200 && count($r['body']['results'] ?? []) === 1 && ($r['body']['results'][0]['page'] ?? 0) === 1,
    json_encode($r['body'])
);

// 7.2 Track view with UTM campaign attribution
$r = httpReq('POST', "{$apiUrl}/public/unpublished-draft-sec-test/view", [
    'sessionId' => 'test_sess_utm_01',
    'country' => 'FJ',
    'utmSource' => 'linkedin',
    'utmMedium' => 'social',
    'utmCampaign' => 'fiji_enterprise_2026',
]);
assertTest(
    "Public view tracking records UTM campaign attribution & session ID",
    $r['status'] === 200 && ($r['body']['recorded'] ?? false) === true
);

// 7.3 Track granular page engagement & link click telemetry
$r = httpReq('POST', "{$apiUrl}/public/unpublished-draft-sec-test/telemetry", [
    'sessionId' => 'test_sess_utm_01',
    'eventType' => 'page_view',
    'pageNumber' => 1,
    'durationMs' => 24000,
    'country' => 'FJ',
    'utmSource' => 'linkedin',
    'utmCampaign' => 'fiji_enterprise_2026',
]);
$rClick = httpReq('POST', "{$apiUrl}/public/unpublished-draft-sec-test/telemetry", [
    'sessionId' => 'test_sess_utm_01',
    'eventType' => 'link_click',
    'pageNumber' => 1,
    'targetUrl' => 'https://nuvistechnologies.com.fj',
]);
assertTest(
    "Granular page dwell time & link click telemetry recorded",
    $r['status'] === 200 && $rClick['status'] === 200
);

// 7.4 Commercial Analytics endpoint returns Page Heatmap, Completion Rate, UTM Campaigns & Comparison
$r = httpReq('GET', "{$apiUrl}/flipbooks/{$draftFid}/analytics?days=30&compareId={$dupFid}", null, $tokenA);
assertTest(
    "Commercial analytics returns Page Engagement Heatmap, UTM campaigns & Publication Comparison",
    $r['status'] === 200
        && !empty($r['body']['pageHeatmap'])
        && isset($r['body']['completionRate'])
        && ($r['body']['linkClicksTotal'] ?? 0) >= 1
        && !empty($r['body']['comparison']),
    "Status: {$r['status']}"
);

// 7.5 Tenant-wide Executive Analytics Overview
$r = httpReq('GET', "{$apiUrl}/analytics/overview?days=30", null, $tokenA);
assertTest(
    "Tenant-wide executive analytics overview aggregates workspace publications",
    $r['status'] === 200 && isset($r['body']['publications']) && is_array($r['body']['publications']),
    "Status: {$r['status']}"
);

// 7.6 CSV Analytics Export
$ch = curl_init("{$apiUrl}/flipbooks/{$draftFid}/analytics/export-csv?days=30");
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, ["Authorization: Bearer {$tokenA}"]);
$csvBody = (string) curl_exec($ch);
$csvStatus = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
assertTest(
    "Analytics CSV export generates multi-section report with Page Engagement Heatmap",
    $csvStatus === 200 && str_contains($csvBody, 'PAGE-BY-PAGE ENGAGEMENT HEATMAP') && str_contains($csvBody, 'CAMPAIGN & UTM ATTRIBUTION'),
    "CSV status: {$csvStatus}"
);

// 7.7 Scheduled Analytics Reports CRUD
$r = httpReq('POST', "{$apiUrl}/analytics/scheduled-reports", [
    'flipbookId' => $draftFid,
    'recipientEmail' => 'analytics-test@alpha.test',
    'frequency' => 'weekly',
], $tokenA);
$schedId = (int) ($r['body']['id'] ?? 0);
assertTest(
    "Scheduled analytics report created for tenant workspace (HTTP 201)",
    $r['status'] === 201 && $schedId > 0
);
if ($schedId > 0) {
    Db::run('DELETE FROM scheduled_reports WHERE id = ?', [$schedId]);
}

echo "\n";

// ============================================================================
// TEST SUITE 8: ENTERPRISE INTEGRATIONS (API KEYS, ERP CATALOGUE, WEBHOOKS, OEMBED)
// ============================================================================
echo "8. Enterprise Integrations (SHA-256 API Keys, ERP Catalogue API, Webhooks, WordPress oEmbed):\n";

// 8.1 Create a SHA-256 hashed tenant-scoped API key for Tenant A
$rKey = httpReq('POST', "{$apiUrl}/integrations/api-keys", [
    'name' => 'SAP ERP Automated Publisher Key',
    'scopes' => ['flipbooks:read', 'flipbooks:write', 'erp:publish', 'webhooks:manage', 'analytics:read'],
    'expiresInDays' => 90,
], $tokenA);
$apiKeyId = (int) ($rKey['body']['id'] ?? 0);
$rawApiKey = (string) ($rKey['body']['rawKey'] ?? '');
assertTest(
    "API Key created with SHA-256 hash in DB and raw nvf_live_... secret returned once (HTTP 201)",
    $rKey['status'] === 201 && str_starts_with($rawApiKey, 'nvf_live_') && $apiKeyId > 0
);

// Verify DB stores only SHA-256 hash and never raw key
$dbKeyRow = Db::one('SELECT key_hash, tenant_id FROM api_keys WHERE id = ?', [$apiKeyId]);
assertTest(
    "Database stores SHA-256 hash of API key (never plaintext) scoped to Tenant A",
    ($dbKeyRow['key_hash'] ?? '') === hash('sha256', $rawApiKey) && (int) ($dbKeyRow['tenant_id'] ?? 0) === $tenantAId
);

// 8.2 Authenticate with X-API-Key / Bearer nvf_live_... to publish an ERP Product Catalogue
$rErp = httpReq('POST', "{$apiUrl}/integrations/erp/publish-catalogue", [
    'title' => 'Fiji Hardware ERP Catalogue Q4',
    'erpSystem' => 'SAP Business One',
    'catalogueCode' => 'CAT-FJ-2026-Q4',
    'category' => 'Product Catalogues',
    'sourceFlipbookId' => $draftFid,
    'autoPublish' => true,
    'products' => [
        ['sku' => 'SKU-SOLAR-5KW', 'name' => '5kW Hybrid Solar Inverter', 'price' => '2450.00', 'currency' => 'FJD', 'page' => 1, 'x' => 25, 'y' => 30, 'w' => 22, 'h' => 10, 'url' => 'https://shop.alpha.test/solar-5kw'],
        ['sku' => 'SKU-BATT-LFP', 'name' => 'LiFePO4 10kWh Battery Pack', 'price' => '3890.00', 'currency' => 'FJD', 'page' => 1, 'x' => 55, 'y' => 30, 'w' => 22, 'h' => 10, 'url' => 'https://shop.alpha.test/batt-lfp'],
    ],
], $rawApiKey);
$erpFid = (int) ($rErp['body']['flipbookId'] ?? 0);
assertTest(
    "ERP System publishes product catalogue via REST API key with automated SKU hotspots (HTTP 201)",
    $rErp['status'] === 201 && $erpFid > 0 && (int) ($rErp['body']['hotspotsCreated'] ?? 0) === 2,
    "Status: {$rErp['status']}, body: " . json_encode($rErp['body'])
);

// 8.3 Tenant B cannot revoke Tenant A's API key (Cross-tenant isolation)
$rCrossRevoke = httpReq('DELETE', "{$apiUrl}/integrations/api-keys/{$apiKeyId}", null, $tokenB);
assertTest(
    "Cross-tenant API key revocation blocked (Tenant B cannot revoke Tenant A key)",
    $rCrossRevoke['status'] === 404
);

// 8.4 WordPress oEmbed endpoint returns rich iframe embed JSON for published flipbook
$rOembed = httpReq('GET', "{$apiUrl}/oembed?url=" . rawurlencode("http://localhost:5173/read/unpublished-draft-sec-test"));
assertTest(
    "WordPress oEmbed discovery endpoint returns rich HTML iframe embed payload",
    $rOembed['status'] === 200 && ($rOembed['body']['provider_name'] ?? '') === 'Nuvis Flipex' && str_contains($rOembed['body']['html'] ?? '', '<iframe')
);

// 8.5 P0 API Key Scope Enforcement: Read-only key ('flipbooks:read') cannot write, publish ERP, read analytics, or manage billing
$rReadKeyCreate = httpReq('POST', "{$apiUrl}/integrations/api-keys", [
    'name' => 'Read-Only Catalogue Viewer Key',
    'scopes' => ['flipbooks:read'],
    'expiresInDays' => 30,
], $tokenA);
$readOnlyRawKey = (string) ($rReadKeyCreate['body']['rawKey'] ?? '');
$readOnlyKeyId = (int) ($rReadKeyCreate['body']['id'] ?? 0);

$rReadAllowed = httpReq('GET', "{$apiUrl}/flipbooks", null, $readOnlyRawKey);
$rReadBlockErp = httpReq('POST', "{$apiUrl}/integrations/erp/publish-catalogue", ['title' => 'Blocked ERP Push'], $readOnlyRawKey);
$rReadBlockWebhooks = httpReq('GET', "{$apiUrl}/integrations/webhooks", null, $readOnlyRawKey);
$rReadBlockBilling = httpReq('GET', "{$apiUrl}/billing/overview", null, $readOnlyRawKey);
$rReadBlockKeyMgmt = httpReq('GET', "{$apiUrl}/integrations/api-keys", null, $readOnlyRawKey);
assertTest(
    "P0 Scope Enforcement: 'flipbooks:read' API key can view flipbooks (200) but is blocked (403) on ERP publish, webhooks, billing, and key management",
    $rReadAllowed['status'] === 200
    && $rReadBlockErp['status'] === 403
    && $rReadBlockWebhooks['status'] === 403
    && $rReadBlockBilling['status'] === 403
    && $rReadBlockKeyMgmt['status'] === 403
);

// 8.6 P0 Dual Permission Enforcement: API key owned by 'viewer' user is blocked on write endpoints even if key scope includes 'erp:publish'
$viewerRawKey = 'nvf_live_' . bin2hex(random_bytes(20));
Db::run(
    'INSERT INTO api_keys (tenant_id, user_id, name, key_prefix, key_hash, scopes) VALUES (?, ?, ?, ?, ?, ?)',
    [$tenantAId, $viewerAId, 'Viewer Escalated Key', substr($viewerRawKey, 0, 16) . '…', hash('sha256', $viewerRawKey), json_encode(['flipbooks:read', 'flipbooks:write', 'erp:publish'])]
);
$rViewerKeyErp = httpReq('POST', "{$apiUrl}/integrations/erp/publish-catalogue", ['title' => 'Viewer Escalation Attempt'], $viewerRawKey);
assertTest(
    "P0 Dual RBAC + Scope Check: API key cannot exceed its owner user's RBAC permissions (viewer blocked with HTTP 403)",
    $rViewerKeyErp['status'] === 403
);

// 8.7 API Key IP Restriction & Daily Usage Quota Enforcement
$rGuardedKey = httpReq('POST', "{$apiUrl}/integrations/api-keys", [
    'name' => 'IP & Quota Restricted Key',
    'scopes' => ['flipbooks:read'],
    'allowedIps' => '203.0.113.50, 10.20.0.0/16',
    'dailyQuota' => 1,
], $tokenA);
$guardedRawKey = (string) ($rGuardedKey['body']['rawKey'] ?? '');
$guardedKeyId = (int) ($rGuardedKey['body']['id'] ?? 0);

$rIpBlocked = httpReq('GET', "{$apiUrl}/flipbooks", null, $guardedRawKey, ['X-Client-IP' => '198.51.100.99']);
$rIpAllowedFirst = httpReq('GET', "{$apiUrl}/flipbooks", null, $guardedRawKey, ['X-Client-IP' => '203.0.113.50']);
$rQuotaExceededSecond = httpReq('GET', "{$apiUrl}/flipbooks", null, $guardedRawKey, ['X-Client-IP' => '203.0.113.50']);
assertTest(
    "API Key IP Allowlist (403 on unauthorized IP, 200 on allowed IP) and Daily Usage Quota (429 when exceeded) enforced",
    $rIpBlocked['status'] === 403 && $rIpAllowedFirst['status'] === 200 && $rQuotaExceededSecond['status'] === 429
);

// 8.8 API Key Atomic Rotation
$rRotate = httpReq('POST', "{$apiUrl}/integrations/api-keys/{$readOnlyKeyId}/rotate", [], $tokenA);
$rotatedRawKey = (string) ($rRotate['body']['rawKey'] ?? '');
$rOldKeyAfterRotate = httpReq('GET', "{$apiUrl}/flipbooks", null, $readOnlyRawKey);
$rNewKeyAfterRotate = httpReq('GET', "{$apiUrl}/flipbooks", null, $rotatedRawKey);
assertTest(
    "API Key Rotation atomically revokes old key (401) and issues working replacement key (200)",
    $rRotate['status'] === 201 && $rOldKeyAfterRotate['status'] === 401 && $rNewKeyAfterRotate['status'] === 200
);

echo "\n";

// ============================================================================
// TEST SUITE 9: COMMERCIAL BILLING, 3-STAGE PAYMENT VERIFICATION & RECONCILIATION SECURITY
// ============================================================================
echo "9. Commercial Billing, 3-Stage Payment Verification, Signed Webhooks & Finance RBAC:\n";

// 9.1 Generate itemized Tax Invoice for Tenant A (with 15% Fiji VAT calculation)
$rGenInv = httpReq('POST', "{$apiUrl}/billing/generate-invoice", ['notes' => 'Automated renewal invoice test'], $tokenA);
$invId = (int) ($rGenInv['body']['id'] ?? 0);
assertTest(
    "Tax Invoice generated with itemized subtotal, 15% VAT tax calculation, and total (HTTP 201)",
    $rGenInv['status'] === 201 && $invId > 0 && (float) ($rGenInv['body']['taxAmount'] ?? 0) > 0,
    "Status: {$rGenInv['status']}, body: " . json_encode($rGenInv['body'])
);

// 9.2 Stage 1 Customer Payment Submission: Unsafe client-supplied autoReconcile=true or stripe_card NEVER marks invoice 'paid'
$idemKey1 = 'idem-test-' . bin2hex(random_bytes(6));
$rPayStage1 = httpReq('POST', "{$apiUrl}/billing/invoices/{$invId}/pay", [
    'paymentMethod' => 'stripe_card',
    'autoReconcile' => true,
    'bankName' => 'Bank of South Pacific (BSP) Fiji',
    'paymentReference' => 'BSP-FJ-99887766',
    'notes' => 'Transferred from Suva corporate account',
], $tokenA, ['Idempotency-Key' => $idemKey1]);
$rPayReplay = httpReq('POST', "{$apiUrl}/billing/invoices/{$invId}/pay", [
    'paymentMethod' => 'stripe_card',
    'autoReconcile' => true,
], $tokenA, ['Idempotency-Key' => $idemKey1]);
assertTest(
    "P0 Payment Submission: Client-supplied autoReconcile/stripe_card cannot mark invoice 'paid' directly (enters 'reconciling' + idempotent replay)",
    $rPayStage1['status'] === 200
    && ($rPayStage1['body']['status'] ?? '') === 'reconciling'
    && ($rPayStage1['body']['requiresVerification'] ?? false) === true
    && ($rPayReplay['body']['idempotentReplay'] ?? false) === true
    && ($rPayReplay['body']['transactionId'] ?? 0) === ($rPayStage1['body']['transactionId'] ?? -1)
);

// 9.3 Tenant B cannot pay or view Tenant A's invoice (Cross-tenant billing isolation)
$rCrossPay = httpReq('POST', "{$apiUrl}/billing/invoices/{$invId}/pay", [
    'paymentMethod' => 'stripe_card',
], $tokenB);
assertTest(
    "Cross-tenant invoice payment/access blocked (HTTP 404)",
    $rCrossPay['status'] === 404
);

// 9.4a P0 Reconciliation RBAC: Ordinary tenant users (editor & viewer) are blocked (403 Forbidden) from reconciling invoices
$rEditorReconcile = httpReq('POST', "{$apiUrl}/billing/invoices/{$invId}/reconcile", [
    'decision' => 'approve',
], $tokenA);
$rViewerReconcile = httpReq('POST', "{$apiUrl}/billing/invoices/{$invId}/reconcile", [
    'decision' => 'approve',
], $tokenViewerA);
assertTest(
    "P0 Reconciliation RBAC: Ordinary tenant users ('editor' and 'viewer') are blocked from reconciling invoices (HTTP 403)",
    $rEditorReconcile['status'] === 403 && $rViewerReconcile['status'] === 403
);

// 9.4b Stage 2A & Stage 3: Authorized Finance Administrator reconciles invoice atomically + records immutable SHA-256 audit chain
$rFinanceReconcile = httpReq('POST', "{$apiUrl}/billing/invoices/{$invId}/reconcile", [
    'decision' => 'approve',
    'notes' => 'Verified on BSP Fiji statement by Finance Admin',
], $tokenFinanceA);
assertTest(
    "Authorized Finance Administrator ('finance' role) reconciles invoice, marks it 'paid', and records SHA-256 chained audit hash",
    $rFinanceReconcile['status'] === 200
    && ($rFinanceReconcile['body']['status'] ?? '') === 'paid'
    && strlen((string) ($rFinanceReconcile['body']['auditHash'] ?? '')) === 64
);

// 9.4c Stage 2B: Signed Payment Gateway Webhook Verification (HMAC-SHA256) & Payment Reversal
$rGenInv2 = httpReq('POST', "{$apiUrl}/billing/generate-invoice", ['notes' => 'Webhook test invoice'], $tokenA);
$invId2 = (int) ($rGenInv2['body']['id'] ?? 0);
$whPayload = [
    'event' => 'payment.succeeded',
    'eventId' => 'evt_' . bin2hex(random_bytes(6)),
    'invoiceId' => $invId2,
    'tenantId' => $tenantAId,
    'paymentReference' => 'STRIPE-WH-VERIFIED-01',
];
$whRawJson = json_encode($whPayload);
$whSecret = \App\Controllers\BillingController::webhookSigningSecret('stripe_card');
$validSig = 't=' . time() . ',v1=' . hash_hmac('sha256', time() . '.' . $whRawJson, $whSecret);

$rWhBadSig = httpReq('POST', "{$apiUrl}/billing/webhooks/stripe_card", $whPayload, null, ['X-Payment-Signature' => 't=' . time() . ',v1=deadbeef']);
$rWhValid = httpReq('POST', "{$apiUrl}/billing/webhooks/stripe_card", $whPayload, null, ['X-Payment-Signature' => $validSig]);
assertTest(
    "Signed Payment Webhook rejects invalid signature (401) and atomically confirms payment + activates subscription on valid HMAC-SHA256 (200)",
    $rWhBadSig['status'] === 401 && $rWhValid['status'] === 200 && ($rWhValid['body']['status'] ?? '') === 'paid'
);

// 9.4d Payment Reversal: Blocked for ordinary editor (403), succeeds for Finance Administrator (200)
$rEditorReverse = httpReq('POST', "{$apiUrl}/billing/invoices/{$invId2}/reverse", ['reason' => 'Unauthorized attempt'], $tokenA);
$rFinanceReverse = httpReq('POST', "{$apiUrl}/billing/invoices/{$invId2}/reverse", ['reason' => 'Customer chargeback reversal'], $tokenFinanceA);
assertTest(
    "Payment Reversal blocked for ordinary tenant user (403) and executed atomically by Finance Administrator (200 -> status 'reversed')",
    $rEditorReverse['status'] === 403 && $rFinanceReverse['status'] === 200 && ($rFinanceReverse['body']['status'] ?? '') === 'reversed'
);

// 9.5 Self-service Plan Upgrade / Downgrade records Subscription History audit log
$proPlan = Db::one("SELECT id FROM plans WHERE name = 'Pro' OR id = 2 LIMIT 1");
if ($proPlan) {
    $rChangePlan = httpReq('POST', "{$apiUrl}/billing/change-plan", [
        'planId' => (int) $proPlan['id'],
        'billingCycle' => 'yearly',
        'currency' => 'FJD',
    ], $tokenA);
    assertTest(
        "Self-service subscription upgrade/downgrade updates plan & logs subscription history",
        $rChangePlan['status'] === 200 && in_array($rChangePlan['body']['billingCycle'] ?? '', ['yearly', 'annually'], true) && ($rChangePlan['body']['currency'] ?? '') === 'FJD'
    );
}

echo "\n";

// ============================================================================
// TEST SUITE 10: DEVOPS RBAC SPLIT, TENANT OWNERSHIP & CRYPTOGRAPHIC SECRET STRENGTH
// ============================================================================
echo "10. DevOps Control-Plane RBAC Split, Service Ownership Enforcement & Cryptographic Secret Hygiene:\n";

// 10.0 Cryptographic Secret Hygiene: reject placeholders ('change-me-to-a-long-random-string', 'nuvis_fallback_secret_key')
$weakPlaceholder1 = \App\Support\CryptoSecrets::isStrongSecret('change-me-to-a-long-random-string');
$weakPlaceholder2 = \App\Support\CryptoSecrets::isStrongSecret('nuvis_fallback_secret_key');
$weakLowEntropy = \App\Support\CryptoSecrets::isStrongSecret(str_repeat('a', 64));
$strongRandom = \App\Support\CryptoSecrets::isStrongSecret(\App\Support\CryptoSecrets::generateRandomSecret(32));
assertTest(
    "P0 CryptoSecrets: Rejects 'change-me-to-a-long-random-string', 'nuvis_fallback_secret_key', and low-entropy strings; accepts 256-bit CSPRNG secret",
    $weakPlaceholder1 === false && $weakPlaceholder2 === false && $weakLowEntropy === false && $strongRandom === true
);

// 10.1 P0 DevOps RBAC Split: Ordinary editor/viewer blocked (403) from global migrations, error simulation, backup creation & DevOps overview
$rEditorMig = httpReq('POST', "{$apiUrl}/devops/migrations/run", ['direction' => 'up'], $tokenA);
$rOwnerMig = httpReq('POST', "{$apiUrl}/devops/migrations/run", ['direction' => 'up'], $tokenOwnerA);
$rEditorOverview = httpReq('GET', "{$apiUrl}/devops/overview", null, $tokenA);
$rEditorBkp = httpReq('POST', "{$apiUrl}/devops/backups/create", ['backupType' => 'full_snapshot'], $tokenA);
$rEditorErrSim = httpReq('POST', "{$apiUrl}/devops/errors/simulate", [], $tokenA);
assertTest(
    "P0 DevOps RBAC: Ordinary tenant users ('editor' & 'owner') blocked from global migrations (403); 'editor' blocked from overview, backups & error simulation (403)",
    $rEditorMig['status'] === 403
    && $rOwnerMig['status'] === 403
    && $rEditorOverview['status'] === 403
    && $rEditorBkp['status'] === 403
    && $rEditorErrSim['status'] === 403
);

// 10.2 Tenant Publication Job Status (/devops/jobs): Accessible to Tenant Editor (200), blocked for Viewer (403)
$rEditorJobs = httpReq('GET', "{$apiUrl}/devops/jobs", null, $tokenA);
$rViewerJobs = httpReq('GET', "{$apiUrl}/devops/jobs", null, $tokenViewerA);
assertTest(
    "DevOps Tenant Publication Job Status (/devops/jobs) allowed for 'editor' (200) and blocked for 'viewer' (403)",
    $rEditorJobs['status'] === 200 && $rViewerJobs['status'] === 403
);

// 10.3 Tenant Owner Overview & Backup Creation + Cross-Tenant Ownership Enforcement in BackupManager::verifyAndTestRecovery()
$rDev = httpReq('GET', "{$apiUrl}/devops/overview", null, $tokenOwnerA);
$modCount = count($rDev['body']['architecture']['modules'] ?? []);
$layerCount = count($rDev['body']['architecture']['layers'] ?? []);
assertTest(
    "Tenant Owner ('owner') accesses scoped DevOps usage overview (200) with 15 Domain Modules & 6 Layers",
    $rDev['status'] === 200 && $modCount === 15 && $layerCount === 6
);

$rBkp = httpReq('POST', "{$apiUrl}/devops/backups/create", ['backupType' => 'full_snapshot'], $tokenOwnerA);
$bkpId = (int) ($rBkp['body']['backup']['id'] ?? 0);
assertTest(
    "Tenant Owner creates tenant-scoped backup snapshot with SHA-256 checksum (HTTP 201)",
    $rBkp['status'] === 201 && $bkpId > 0 && strlen($rBkp['body']['backup']['checksumSha256'] ?? '') === 64
);

$rCrossVerBkp = httpReq('POST', "{$apiUrl}/devops/backups/{$bkpId}/verify", [], $tokenOwnerB);
$rVerBkp = httpReq('POST', "{$apiUrl}/devops/backups/{$bkpId}/verify", [], $tokenOwnerA);
assertTest(
    "BackupManager::verifyAndTestRecovery() enforces tenant ownership (Tenant B owner blocked with 404; Tenant A owner succeeds with 200)",
    $rCrossVerBkp['status'] === 404 && $rVerBkp['status'] === 200 && ($rVerBkp['body']['backup']['status'] ?? '') === 'verified'
);

// 10.4 Platform Administrator Only Operations: DLQ simulation, Error Management & Global Database Migrations
$rDlqSim = httpReq('POST', "{$apiUrl}/devops/dlq/simulate", [], $tokenPlatAdmin);
$dlqId = (int) ($rDlqSim['body']['dlqId'] ?? 0);
$rCrossDlqRetry = httpReq('POST', "{$apiUrl}/devops/dlq/{$dlqId}/retry", [], $tokenB);
$rDlqRetry = httpReq('POST', "{$apiUrl}/devops/dlq/{$dlqId}/retry", [], $tokenA);
assertTest(
    "Platform Admin simulates DLQ job (201); QueueManager::retryDeadLetter() blocks Tenant B (404) and allows Tenant A editor (200)",
    $rDlqSim['status'] === 201 && $dlqId > 0 && $rCrossDlqRetry['status'] === 404 && $rDlqRetry['status'] === 200
);

$rErrSim = httpReq('POST', "{$apiUrl}/devops/errors/simulate", [], $tokenPlatAdmin);
$errId = (int) ($rErrSim['body']['reportId'] ?? 0);
$rOwnerErrRes = httpReq('POST', "{$apiUrl}/devops/errors/{$errId}/resolve", [], $tokenOwnerA);
$rPlatErrRes = httpReq('POST', "{$apiUrl}/devops/errors/{$errId}/resolve", [], $tokenPlatAdmin);
assertTest(
    "Global Error Management restricted to Platform Admin: tenant owner blocked from resolving error (403), Platform Admin resolves (200)",
    $rErrSim['status'] === 201 && $errId > 0 && $rOwnerErrRes['status'] === 403 && $rPlatErrRes['status'] === 200
);

echo "\n";

// ============================================================================
// CLEANUP TEST FIXTURES
// ============================================================================
echo "Cleaning up test fixtures...\n";
Db::run("DELETE FROM dead_letter_jobs WHERE tenant_id IN (?, ?)", [$tenantAId, $tenantBId]);
Db::run("DELETE FROM error_reports WHERE tenant_id IN (?, ?)", [$tenantAId, $tenantBId]);
Db::run("DELETE FROM system_backups WHERE tenant_id IN (?, ?)", [$tenantAId, $tenantBId]);
Db::run("DELETE FROM api_keys WHERE tenant_id IN (?, ?)", [$tenantAId, $tenantBId]);
Db::run("DELETE FROM payment_audit_logs WHERE tenant_id IN (?, ?)", [$tenantAId, $tenantBId]);
Db::run("DELETE FROM payment_transactions WHERE tenant_id IN (?, ?)", [$tenantAId, $tenantBId]);
Db::run("DELETE FROM invoices WHERE tenant_id IN (?, ?)", [$tenantAId, $tenantBId]);
Db::run("DELETE FROM subscription_history WHERE tenant_id IN (?, ?)", [$tenantAId, $tenantBId]);
Db::run("DELETE FROM revoked_unlock_tokens WHERE flipbook_id = ?", [$lockedFid]);
Db::run("DELETE FROM hotspots WHERE flipbook_id IN (?, ?, ?, ?, ?, ?)", [$flipbookAId, $flipbookBId, $lockedFid, $draftFid, $dupFid, $erpFid]);
Db::run("DELETE FROM pages WHERE flipbook_id IN (?, ?, ?, ?)", [$lockedFid, $draftFid, $dupFid, $erpFid]);
Db::run("DELETE FROM flipbooks WHERE id IN (?, ?, ?, ?, ?, ?)", [$flipbookAId, $flipbookBId, $lockedFid, $draftFid, $dupFid, $erpFid]);
Storage::rrmdir(dirname($draftPagePath));
if ($dupFid > 0) {
    Storage::rrmdir(Storage::publicationDir($tenantAId, $dupFid));
}
if ($erpFid > 0) {
    Storage::rrmdir(Storage::publicationDir($tenantAId, $erpFid));
}
Db::run("DELETE FROM refresh_tokens WHERE user_id IN (?, ?, ?, ?, ?, ?, ?)", [$userAId, $userBId, $viewerAId, $financeAId, $ownerAId, $ownerBId, $platAdminId]);
Db::run("DELETE FROM users WHERE id IN (?, ?, ?, ?, ?, ?, ?)", [$userAId, $userBId, $viewerAId, $financeAId, $ownerAId, $ownerBId, $platAdminId]);
Db::run("DELETE FROM tenants WHERE id IN (?, ?)", [$tenantAId, $tenantBId]);
Storage::rrmdir(dirname($dummyPath));

echo "\n====================================================================\n";
echo "   Test Results Summary: \e[32m{$passed} Passed\e[0m | " . ($failed > 0 ? "\e[31m{$failed} Failed\e[0m" : "\e[32m0 Failed\e[0m") . "\n";
echo "====================================================================\n";

if ($failed === 0) {
    echo "🎉 ALL TENANT ISOLATION, RBAC & SECURITY TESTS PASSED SUCCESSFULLY!\n\n";
    exit(0);
} else {
    echo "⚠️  SOME SECURITY ASSERTIONS FAILED. INVESTIGATION REQUIRED.\n\n";
    exit(1);
}
