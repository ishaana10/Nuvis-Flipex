<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Repository\TenantRepository;
use App\Support\Audit;
use App\Support\Db;
use App\Support\Http;
use App\Support\Mailer;
use App\Support\Rbac;
use App\Support\Storage;
use App\Support\TenantContext;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Psr7\Stream;

final class AnalyticsController
{
    private const COUNTRY_NAMES = [
        'FJ' => 'Fiji',
        'AU' => 'Australia',
        'NZ' => 'New Zealand',
        'US' => 'United States',
        'GB' => 'United Kingdom',
        'CA' => 'Canada',
        'SG' => 'Singapore',
        'IN' => 'India',
        'DE' => 'Germany',
        'FR' => 'France',
        'JP' => 'Japan',
        'WS' => 'Samoa',
        'TO' => 'Tonga',
        'VU' => 'Vanuatu',
        'PG' => 'Papua New Guinea',
    ];

    public function show(Request $req, Response $res, array $args): Response
    {
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'analytics.view');

        $f = Db::one('SELECT * FROM flipbooks WHERE id = ?', [(int) $args['id']]);
        if (!$f || !TenantContext::canAccessFlipbook($f)) {
            return Http::error($res, 'Not found', 404);
        }

        $params = $req->getQueryParams();
        [$fromDate, $toDate] = $this->resolveDateRange($params);

        $primaryMetrics = $this->computePublicationMetrics($f, $fromDate, $toDate);

        // Optional Publication Comparison
        $comparison = null;
        if (!empty($params['compareId'])) {
            $compBook = Db::one('SELECT * FROM flipbooks WHERE id = ?', [(int) $params['compareId']]);
            if ($compBook && TenantContext::canAccessFlipbook($compBook)) {
                $comparison = $this->computePublicationMetrics($compBook, $fromDate, $toDate);
            }
        }

        // Peer publications in tenant workspace for comparison selector
        $tenantId = TenantContext::id();
        $peers = $tenantId !== null
            ? Db::all('SELECT id, title, slug, page_count FROM flipbooks WHERE tenant_id = ? ORDER BY title ASC', [$tenantId])
            : Db::all('SELECT id, title, slug, page_count FROM flipbooks WHERE user_id = ? ORDER BY title ASC', [$u['id']]);

        return Http::json($res, $primaryMetrics + [
            'dateRange' => ['from' => $fromDate, 'to' => $toDate],
            'comparison' => $comparison,
            'peerPublications' => array_map(static fn(array $p) => [
                'id' => (int) $p['id'],
                'title' => $p['title'],
                'slug' => $p['slug'],
                'pageCount' => (int) $p['page_count'],
            ], $peers),
        ]);
    }

    /**
     * Tenant-Specific Executive Analytics Overview across all publications in workspace.
     */
    public function tenantDashboard(Request $req, Response $res): Response
    {
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'analytics.view');

        $params = $req->getQueryParams();
        [$fromDate, $toDate] = $this->resolveDateRange($params);
        $tenantId = TenantContext::id();

        $scopeWhere = $tenantId !== null ? 'f.tenant_id = ?' : 'f.user_id = ?';
        $scopeBind = $tenantId ?? $u['id'];

        $kpis = Db::one(
            "SELECT COUNT(v.id) AS total_views,
                    COUNT(DISTINCT v.visitor_hash) AS unique_readers,
                    COALESCE(AVG(NULLIF(v.duration_seconds, 0)), 0) AS avg_duration,
                    COALESCE(SUM(CASE WHEN v.completed = 1 THEN 1 ELSE 0 END), 0) AS completed_count
             FROM flipbooks f
             LEFT JOIN views v ON v.flipbook_id = f.id AND DATE(v.created_at) BETWEEN ? AND ?
             WHERE {$scopeWhere}",
            [$fromDate, $toDate, $scopeBind]
        );

        $evCounts = Db::all(
            "SELECT e.event_type, COUNT(*) AS cnt
             FROM analytics_events e
             JOIN flipbooks f ON f.id = e.flipbook_id
             WHERE {$scopeWhere} AND DATE(e.created_at) BETWEEN ? AND ?
             GROUP BY e.event_type",
            [$scopeBind, $fromDate, $toDate]
        );
        $evMap = [];
        foreach ($evCounts as $row) {
            $evMap[$row['event_type']] = (int) $row['cnt'];
        }

        $topPublications = Db::all(
            "SELECT f.id, f.title, f.slug, f.page_count, f.workflow_status,
                    COUNT(v.id) AS views,
                    COUNT(DISTINCT v.visitor_hash) AS unique_readers,
                    COALESCE(AVG(NULLIF(v.duration_seconds, 0)), 0) AS avg_duration,
                    COALESCE(SUM(CASE WHEN v.completed = 1 THEN 1 ELSE 0 END), 0) AS completions
             FROM flipbooks f
             LEFT JOIN views v ON v.flipbook_id = f.id AND DATE(v.created_at) BETWEEN ? AND ?
             WHERE {$scopeWhere}
             GROUP BY f.id
             ORDER BY views DESC, f.id DESC",
            [$fromDate, $toDate, $scopeBind]
        );

        $totalViews = (int) ($kpis['total_views'] ?? 0);
        $completedCount = (int) ($kpis['completed_count'] ?? 0);

        return Http::json($res, [
            'dateRange' => ['from' => $fromDate, 'to' => $toDate],
            'totalViews' => $totalViews,
            'uniqueReaders' => (int) ($kpis['unique_readers'] ?? 0),
            'avgReadingTimeSeconds' => (int) round((float) ($kpis['avg_duration'] ?? 0)),
            'completionRate' => $totalViews > 0 ? round(($completedCount / $totalViews) * 100, 1) : 0.0,
            'linkClicksTotal' => $evMap['link_click'] ?? 0,
            'videoPlaysTotal' => $evMap['video_play'] ?? 0,
            'downloadsTotal' => $evMap['download'] ?? 0,
            'sharesTotal' => $evMap['share'] ?? 0,
            'publications' => array_map(static function (array $p): array {
                $v = (int) $p['views'];
                $c = (int) $p['completions'];
                return [
                    'id' => (int) $p['id'],
                    'title' => $p['title'],
                    'slug' => $p['slug'],
                    'pageCount' => (int) $p['page_count'],
                    'workflowStatus' => $p['workflow_status'] ?? 'published',
                    'views' => $v,
                    'uniqueReaders' => (int) $p['unique_readers'],
                    'avgReadingTimeSeconds' => (int) round((float) $p['avg_duration']),
                    'completionRate' => $v > 0 ? round(($c / $v) * 100, 1) : 0.0,
                ];
            }, $topPublications),
        ]);
    }

    /**
     * Export publication analytics to CSV.
     */
    public function exportCsv(Request $req, Response $res, array $args): Response
    {
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'analytics.view');

        $f = Db::one('SELECT * FROM flipbooks WHERE id = ?', [(int) $args['id']]);
        if (!$f || !TenantContext::canAccessFlipbook($f)) {
            return Http::error($res, 'Not found', 404);
        }

        [$fromDate, $toDate] = $this->resolveDateRange($req->getQueryParams());
        $m = $this->computePublicationMetrics($f, $fromDate, $toDate);

        $fh = fopen('php://temp', 'r+');
        fputcsv($fh, ['Nuvis Flipex — Commercial Publication Analytics Report']);
        fputcsv($fh, ['Publication', $f['title'], 'Slug', $f['slug'], 'Date Range', "{$fromDate} to {$toDate}"]);
        fputcsv($fh, []);

        fputcsv($fh, ['SUMMARY KPIS']);
        fputcsv($fh, ['Metric', 'Value']);
        fputcsv($fh, ['Total Views (Reach)', $m['totalViews']]);
        fputcsv($fh, ['Unique Readers (Audience Size)', $m['uniqueReaders']]);
        fputcsv($fh, ['Average Reading Time (Seconds)', $m['avgReadingTimeSeconds']]);
        fputcsv($fh, ['Completion Rate (%)', $m['completionRate'] . '%']);
        fputcsv($fh, ['Link Clicks', $m['linkClicksTotal']]);
        fputcsv($fh, ['Video Engagements', $m['videoPlaysTotal']]);
        fputcsv($fh, ['PDF Downloads', $m['downloadsTotal']]);
        fputcsv($fh, ['Social / Page Shares', $m['sharesTotal']]);
        fputcsv($fh, []);

        fputcsv($fh, ['PAGE-BY-PAGE ENGAGEMENT HEATMAP']);
        fputcsv($fh, ['Page Number', 'Page Views', 'Unique Readers', 'Avg Dwell Time (s)', 'Link Clicks', 'Video Plays', 'Attention Score (%)']);
        foreach ($m['pageHeatmap'] as $pg) {
            fputcsv($fh, [
                'Page ' . $pg['page'],
                $pg['views'],
                $pg['uniqueReaders'],
                $pg['avgDwellSeconds'],
                $pg['linkClicks'],
                $pg['videoPlays'],
                $pg['attentionScore'] . '%',
            ]);
        }
        fputcsv($fh, []);

        fputcsv($fh, ['GEOGRAPHIC BREAKDOWN']);
        fputcsv($fh, ['Country Code', 'Country Name', 'Views', 'Share (%)']);
        foreach ($m['countries'] as $c) {
            fputcsv($fh, [$c['code'], $c['name'], $c['count'], $c['pct'] . '%']);
        }
        fputcsv($fh, []);

        fputcsv($fh, ['CAMPAIGN & UTM ATTRIBUTION']);
        fputcsv($fh, ['UTM Source', 'UTM Medium', 'UTM Campaign', 'Views', 'Unique Readers', 'Avg Reading Time (s)']);
        foreach ($m['campaigns'] as $camp) {
            fputcsv($fh, [
                $camp['source'],
                $camp['medium'],
                $camp['campaign'],
                $camp['views'],
                $camp['uniqueReaders'],
                $camp['avgDurationSeconds'],
            ]);
        }

        rewind($fh);
        $stream = new Stream($fh);
        $cleanSlug = preg_replace('/[^a-zA-Z0-9_\-]/', '_', $f['slug']) ?: 'analytics';

        return $res
            ->withHeader('Content-Type', 'text/csv; charset=utf-8')
            ->withHeader('Content-Disposition', "attachment; filename=\"{$cleanSlug}_analytics_{$fromDate}_{$toDate}.csv\"")
            ->withBody($stream);
    }

    /**
     * Scheduled Analytics Reports CRUD & Instant Dispatch.
     */
    public function listScheduledReports(Request $req, Response $res): Response
    {
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'analytics.view');
        $tenantId = TenantContext::requireId();

        $rows = Db::all(
            'SELECT sr.*, f.title AS flipbook_title
             FROM scheduled_reports sr
             LEFT JOIN flipbooks f ON f.id = sr.flipbook_id AND f.tenant_id = sr.tenant_id
             WHERE sr.tenant_id = ?
             ORDER BY sr.id DESC',
            [$tenantId]
        );
        return Http::json($res, $rows);
    }

    public function createScheduledReport(Request $req, Response $res): Response
    {
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'analytics.view');
        $tenantId = TenantContext::requireId();
        $b = (array) $req->getParsedBody();

        $email = trim((string) ($b['recipientEmail'] ?? $u['email']));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return Http::error($res, 'Valid recipient email is required', 422);
        }
        $rawFreq = (string) ($b['frequency'] ?? 'weekly');
        $frequency = in_array($rawFreq, ['daily', 'weekly', 'monthly'], true) ? $rawFreq : 'weekly';
        $rawFormat = (string) ($b['format'] ?? 'pdf_summary');
        $format = in_array($rawFormat, ['csv', 'pdf_summary'], true) ? $rawFormat : 'pdf_summary';
        $flipbookId = !empty($b['flipbookId']) ? (int) $b['flipbookId'] : null;
        if ($flipbookId !== null && !TenantRepository::for('flipbooks')->existsForTenant($flipbookId, $tenantId)) {
            return Http::error($res, 'Publication not found', 404);
        }

        Db::run(
            'INSERT INTO scheduled_reports (tenant_id, user_id, flipbook_id, recipient_email, frequency, format)
             VALUES (?, ?, ?, ?, ?, ?)',
            [$tenantId, $u['id'], $flipbookId, $email, $frequency, $format]
        );
        $id = (int) Db::pdo()->lastInsertId();
        Audit::log('analytics.schedule_report', 'scheduled_report', $id, ['email' => $email, 'frequency' => $frequency]);

        return Http::json($res, TenantRepository::for('scheduled_reports')->findForTenant($id, $tenantId), 201);
    }

    public function deleteScheduledReport(Request $req, Response $res, array $args): Response
    {
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'analytics.view');
        $tenantId = TenantContext::requireId();
        $id = (int) $args['id'];

        TenantRepository::for('scheduled_reports')->deleteForTenant($id, $tenantId);
        return Http::json($res, ['ok' => true]);
    }

    public function sendScheduledReportNow(Request $req, Response $res, array $args): Response
    {
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'analytics.view');
        $tenantId = TenantContext::requireId();
        $id = (int) $args['id'];

        $sr = TenantRepository::for('scheduled_reports')->findForTenant($id, $tenantId);
        if (!$sr) return Http::error($res, 'Scheduled report not found', 404);

        $title = 'All Workspace Publications';
        if (!empty($sr['flipbook_id'])) {
            $fb = TenantRepository::for('flipbooks')->findForTenant((int) $sr['flipbook_id'], $tenantId);
            if ($fb) $title = $fb['title'];
        }

        Mailer::send(
            $sr['recipient_email'],
            "Nuvis Flipex — Scheduled Analytics Report ({$title})",
            'scheduled_analytics',
            "<h2>Nuvis Flipex Analytics Summary</h2><p>Publication Scope: <b>" . htmlspecialchars($title) . "</b></p><p>Frequency: " . strtoupper((string) $sr['frequency']) . "</p><p>Generated at: " . date('Y-m-d H:i:s') . "</p>"
        );

        Db::run('UPDATE scheduled_reports SET last_sent_at = NOW() WHERE id = ? AND tenant_id = ?', [$id, $tenantId]);
        return Http::json($res, ['ok' => true, 'sentAt' => date('Y-m-d H:i:s')]);
    }

    // ---- Internal computation helpers ----

    private function resolveDateRange(array $params): array
    {
        $dbToday = Db::one('SELECT CURDATE() AS today')['today'] ?? date('Y-m-d');
        $to = !empty($params['to']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $params['to'])
            ? (string) $params['to']
            : (string) $dbToday;

        if (!empty($params['from']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $params['from'])) {
            $from = (string) $params['from'];
        } else {
            $days = isset($params['days']) ? max(1, min(365, (int) $params['days'])) : 30;
            $from = date('Y-m-d', strtotime("-{$days} days", strtotime($to)));
        }

        return [$from, $to];
    }

    private function computePublicationMetrics(array $f, string $fromDate, string $toDate): array
    {
        $fid = (int) $f['id'];
        $pageCount = max(1, (int) $f['page_count']);

        // 1. Core Reach, Audience, Reading Time & Completion KPIs
        $counts = Db::one(
            'SELECT COUNT(*) AS total_views,
                    COUNT(DISTINCT visitor_hash) AS unique_readers,
                    COALESCE(AVG(NULLIF(duration_seconds, 0)), 0) AS avg_duration,
                    COALESCE(SUM(CASE WHEN completed = 1 OR max_page_reached >= ? THEN 1 ELSE 0 END), 0) AS completed_views
             FROM views
             WHERE flipbook_id = ? AND DATE(created_at) BETWEEN ? AND ?',
            [max(1, (int) floor($pageCount * 0.85)), $fid, $fromDate, $toDate]
        );

        $totalViews = (int) ($counts['total_views'] ?? 0);
        $uniqueReaders = (int) ($counts['unique_readers'] ?? 0);
        $avgReadingTimeSeconds = (int) round((float) ($counts['avg_duration'] ?? 0));
        $completedViews = (int) ($counts['completed_views'] ?? 0);
        $completionRate = $totalViews > 0 ? round(($completedViews / $totalViews) * 100, 1) : 0.0;

        // 2. Daily Views Time-Series
        $byDay = Db::all(
            'SELECT DATE(created_at) AS `date`,
                    COUNT(*) AS views,
                    COUNT(DISTINCT visitor_hash) AS unique_visitors,
                    COALESCE(AVG(NULLIF(duration_seconds, 0)), 0) AS avg_duration
             FROM views
             WHERE flipbook_id = ? AND DATE(created_at) BETWEEN ? AND ?
             GROUP BY DATE(created_at)
             ORDER BY `date` ASC',
            [$fid, $fromDate, $toDate]
        );

        // 3. Device Breakdown
        $devices = Db::all(
            'SELECT COALESCE(NULLIF(device, ""), "desktop") AS device, COUNT(*) AS count
             FROM views
             WHERE flipbook_id = ? AND DATE(created_at) BETWEEN ? AND ?
             GROUP BY device ORDER BY count DESC',
            [$fid, $fromDate, $toDate]
        );

        // 4. Geographic Breakdown
        $geoRows = Db::all(
            'SELECT COALESCE(NULLIF(country, ""), "FJ") AS code, COUNT(*) AS count
             FROM views
             WHERE flipbook_id = ? AND DATE(created_at) BETWEEN ? AND ?
             GROUP BY code ORDER BY count DESC LIMIT 15',
            [$fid, $fromDate, $toDate]
        );
        $countries = array_map(function (array $g) use ($totalViews): array {
            $code = strtoupper((string) $g['code']);
            $cnt = (int) $g['count'];
            return [
                'code' => $code,
                'name' => self::COUNTRY_NAMES[$code] ?? $code,
                'count' => $cnt,
                'pct' => $totalViews > 0 ? round(($cnt / $totalViews) * 100, 1) : 0.0,
            ];
        }, $geoRows);

        // 5. Referrers
        $referrers = Db::all(
            'SELECT COALESCE(NULLIF(referrer, ""), "Direct") AS ref, COUNT(*) AS count
             FROM views
             WHERE flipbook_id = ? AND DATE(created_at) BETWEEN ? AND ?
             GROUP BY ref ORDER BY count DESC LIMIT 10',
            [$fid, $fromDate, $toDate]
        );

        // 6. Campaign & UTM Attribution
        $campaignRows = Db::all(
            'SELECT COALESCE(NULLIF(utm_source, ""), "direct") AS source,
                    COALESCE(NULLIF(utm_medium, ""), "none") AS medium,
                    COALESCE(NULLIF(utm_campaign, ""), "(not set)") AS campaign,
                    COUNT(*) AS views,
                    COUNT(DISTINCT visitor_hash) AS unique_readers,
                    COALESCE(AVG(NULLIF(duration_seconds, 0)), 0) AS avg_duration
             FROM views
             WHERE flipbook_id = ? AND DATE(created_at) BETWEEN ? AND ?
             GROUP BY source, medium, campaign
             ORDER BY views DESC LIMIT 15',
            [$fid, $fromDate, $toDate]
        );
        $campaigns = array_map(static fn(array $c) => [
            'source' => $c['source'],
            'medium' => $c['medium'],
            'campaign' => $c['campaign'],
            'views' => (int) $c['views'],
            'uniqueReaders' => (int) $c['unique_readers'],
            'avgDurationSeconds' => (int) round((float) $c['avg_duration']),
        ], $campaignRows);

        // 7. Event Totals (Link Clicks, Video Plays, Downloads, Shares, Searches)
        $evRows = Db::all(
            'SELECT event_type, COUNT(*) AS cnt
             FROM analytics_events
             WHERE flipbook_id = ? AND DATE(created_at) BETWEEN ? AND ?
             GROUP BY event_type',
            [$fid, $fromDate, $toDate]
        );
        $evTotals = [];
        foreach ($evRows as $r) {
            $evTotals[$r['event_type']] = (int) $r['cnt'];
        }

        // Top Clicked Links & Played Videos
        $topInteractions = Db::all(
            "SELECT event_type, page_number, COALESCE(target_url, 'Interactive Hotspot') AS target_url, COUNT(*) AS clicks
             FROM analytics_events
             WHERE flipbook_id = ? AND event_type IN ('link_click', 'video_play') AND DATE(created_at) BETWEEN ? AND ?
             GROUP BY event_type, page_number, target_url
             ORDER BY clicks DESC LIMIT 15",
            [$fid, $fromDate, $toDate]
        );

        // 8. Page-by-Page Engagement Heatmap
        $pageRows = Db::all(
            "SELECT page_number,
                    SUM(CASE WHEN event_type = 'page_view' THEN 1 ELSE 0 END) AS page_views,
                    COUNT(DISTINCT CASE WHEN event_type = 'page_view' THEN visitor_hash END) AS unique_readers,
                    COALESCE(AVG(CASE WHEN event_type = 'page_view' AND duration_ms > 0 THEN duration_ms END), 0) AS avg_dwell_ms,
                    SUM(CASE WHEN event_type = 'link_click' THEN 1 ELSE 0 END) AS link_clicks,
                    SUM(CASE WHEN event_type = 'video_play' THEN 1 ELSE 0 END) AS video_plays
             FROM analytics_events
             WHERE flipbook_id = ? AND page_number IS NOT NULL AND DATE(created_at) BETWEEN ? AND ?
             GROUP BY page_number",
            [$fid, $fromDate, $toDate]
        );
        $pageMap = [];
        $maxScoreRaw = 1.0;
        foreach ($pageRows as $pr) {
            $pNum = (int) $pr['page_number'];
            $pv = (int) $pr['page_views'];
            $dwellSec = round(((float) $pr['avg_dwell_ms']) / 1000, 1);
            $lc = (int) $pr['link_clicks'];
            $vp = (int) $pr['video_plays'];
            $rawScore = ($pv * 1.0) + ($dwellSec * 0.4) + (($lc + $vp) * 3.0);
            if ($rawScore > $maxScoreRaw) $maxScoreRaw = $rawScore;
            $pageMap[$pNum] = [
                'views' => $pv,
                'uniqueReaders' => (int) $pr['unique_readers'],
                'avgDwellSeconds' => $dwellSec,
                'linkClicks' => $lc,
                'videoPlays' => $vp,
                'rawScore' => $rawScore,
            ];
        }

        $pagesDb = Db::all('SELECT page_number, thumb_path FROM pages WHERE flipbook_id = ? ORDER BY page_number ASC', [$fid]);
        $pageHeatmap = [];
        foreach ($pagesDb as $pRow) {
            $pNum = (int) $pRow['page_number'];
            $stat = $pageMap[$pNum] ?? [
                'views' => $pNum === 1 ? $totalViews : 0,
                'uniqueReaders' => $pNum === 1 ? $uniqueReaders : 0,
                'avgDwellSeconds' => 0.0,
                'linkClicks' => 0,
                'videoPlays' => 0,
                'rawScore' => $pNum === 1 ? (float) $totalViews : 0.0,
            ];
            $attentionScore = $maxScoreRaw > 0 ? min(100, (int) round(($stat['rawScore'] / $maxScoreRaw) * 100)) : 0;

            $pageHeatmap[] = [
                'page' => $pNum,
                'views' => $stat['views'],
                'uniqueReaders' => $stat['uniqueReaders'],
                'avgDwellSeconds' => $stat['avgDwellSeconds'],
                'linkClicks' => $stat['linkClicks'],
                'videoPlays' => $stat['videoPlays'],
                'attentionScore' => $attentionScore,
                'thumbUrl' => !empty($pRow['thumb_path']) ? Storage::temporarySignedUrl((string) $pRow['thumb_path'], 7200) : null,
            ];
        }

        // 9. Recent Reader Activity
        $recent = Db::all(
            'SELECT id, COALESCE(NULLIF(country, ""), "FJ") AS country, COALESCE(NULLIF(device, ""), "desktop") AS device,
                    referrer, duration_seconds, pages_viewed, max_page_reached, completed, utm_source, utm_campaign, created_at
             FROM views
             WHERE flipbook_id = ? AND DATE(created_at) BETWEEN ? AND ?
             ORDER BY created_at DESC LIMIT 25',
            [$fid, $fromDate, $toDate]
        );

        return [
            'flipbook' => [
                'id' => $fid,
                'title' => $f['title'],
                'slug' => $f['slug'],
                'pageCount' => $pageCount,
            ],
            'totalViews' => $totalViews,
            'uniqueReaders' => $uniqueReaders,
            'avgReadingTimeSeconds' => $avgReadingTimeSeconds,
            'completionRate' => $completionRate,
            'linkClicksTotal' => $evTotals['link_click'] ?? 0,
            'videoPlaysTotal' => $evTotals['video_play'] ?? 0,
            'downloadsTotal' => $evTotals['download'] ?? 0,
            'sharesTotal' => $evTotals['share'] ?? 0,
            'searchesTotal' => $evTotals['search'] ?? 0,
            'viewsByDay' => $byDay,
            'devices' => $devices,
            'countries' => $countries,
            'referrers' => $referrers,
            'campaigns' => $campaigns,
            'topInteractions' => $topInteractions,
            'pageHeatmap' => $pageHeatmap,
            'recent' => $recent,
        ];
    }
}
