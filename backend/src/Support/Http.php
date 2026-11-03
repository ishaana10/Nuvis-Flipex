<?php
declare(strict_types=1);

namespace App\Support;

use Psr\Http\Message\ResponseInterface as Response;

final class Http
{
    public static function json(Response $res, mixed $data, int $status = 200): Response
    {
        $res->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        return $res->withHeader('Content-Type', 'application/json')->withStatus($status);
    }

    public static function error(Response $res, string $message, int $status = 400, array $fields = []): Response
    {
        return self::json($res, ['error' => $message, 'fields' => (object) $fields], $status);
    }
}
