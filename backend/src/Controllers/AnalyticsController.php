<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Support\Db;
use App\Support\Http;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class AnalyticsController
{
    public function show(Request $req, Response $res, array $args): Response
    {
        $u = $req->getAttribute('user');
        $f = Db::one('SELECT * FROM flipbooks WHERE id = ? AND user_id = ?', [(int) $args['id'], $u['id']]);
        if (!$f) return Http::error($res, 'Not found', 404);

        $fid = (int) $f['id'];

        // Total views and unique readers
        $counts = Db::one(
            'SELECT COUNT(*) AS total_views, COUNT(DISTINCT visitor_hash) AS unique_readers
             FROM views WHERE flipbook_id = ?',
            [$fid]
        );

        // Daily views last 30 days
        $byDay = Db::all(
            'SELECT DATE(created_at) AS `date`, COUNT(*) AS views, COUNT(DISTINCT visitor_hash) AS unique_visitors
             FROM views
             WHERE flipbook_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
             GROUP BY DATE(created_at)
             ORDER BY `date` ASC',
            [$fid]
        );

        // Devices
        $devices = Db::all(
            'SELECT COALESCE(device, "unknown") AS device, COUNT(*) AS count
             FROM views WHERE flipbook_id = ?
             GROUP BY device ORDER BY count DESC',
            [$fid]
        );

        // Referrers
        $referrers = Db::all(
            'SELECT COALESCE(NULLIF(referrer, ""), "Direct") AS ref, COUNT(*) AS count
             FROM views WHERE flipbook_id = ?
             GROUP BY ref ORDER BY count DESC LIMIT 10',
            [$fid]
        );

        // Recent events
        $recent = Db::all(
            'SELECT id, country, device, referrer, created_at
             FROM views WHERE flipbook_id = ?
             ORDER BY created_at DESC LIMIT 20',
            [$fid]
        );

        return Http::json($res, [
            'flipbook' => [
                'id' => $fid,
                'title' => $f['title'],
                'slug' => $f['slug'],
            ],
            'totalViews' => (int) ($counts['total_views'] ?? 0),
            'uniqueReaders' => (int) ($counts['unique_readers'] ?? 0),
            'viewsByDay' => $byDay,
            'devices' => $devices,
            'referrers' => $referrers,
            'recent' => $recent,
        ]);
    }
}
