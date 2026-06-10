<?php

namespace JamWork\Routes;

use JamWork\Lib\Database;
use JamWork\Lib\Validator;
use JamWork\Middleware\AdminMiddleware;
use JamWork\Middleware\AuthMiddleware;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Ramsey\Uuid\Uuid;
use Slim\App;
use Slim\Routing\RouteCollectorProxy;

/**
 * Admin-gated configuration for scheduled report delivery (CC32a). The schedule
 * is a singleton row (PUT upserts); recipients are listed by joining users so a
 * member without an explicit row reads as implicitly enabled. UTC-only — no
 * timezone conversion anywhere (Decision #102). Same middleware stack as the
 * admin routes group: AuthMiddleware (sets role) then AdminMiddleware (gates).
 */
class ReportScheduleRoutes
{
    /** HH:MM, 00-23 hours, 00-59 minutes. */
    private const TIME_PATTERN = '/^([01]\d|2[0-3]):[0-5]\d$/';

    public static function register(App $app): void
    {
        $app->group('/admin', function (RouteCollectorProxy $group) {

            // GET /admin/report-schedule — current config, or defaults if unset.
            $group->get('/report-schedule', function (Request $request, Response $response) {
                $db = Database::getInstance();
                $row = $db->query('SELECT enabled, day_of_week, send_time_utc, frequency FROM report_schedule LIMIT 1')->fetch();

                return self::json($response, self::scheduleShape($row));
            });

            // PUT /admin/report-schedule — upsert the singleton row.
            $group->put('/report-schedule', function (Request $request, Response $response) {
                $data = $request->getParsedBody() ?? [];

                if ($error = self::validateSchedule($data)) {
                    return self::json($response, ['error' => $error], 422);
                }

                $enabled = (int) (bool) $data['enabled'];
                $dayOfWeek = (int) $data['dayOfWeek'];
                $sendTime = $data['sendTimeUtc'] . ':00';
                $frequency = $data['frequency'];

                $db = Database::getInstance();
                $existing = $db->query('SELECT id FROM report_schedule LIMIT 1')->fetch();

                if ($existing) {
                    $stmt = $db->prepare(
                        'UPDATE report_schedule
                         SET enabled = :enabled, day_of_week = :day, send_time_utc = :time, frequency = :freq
                         WHERE id = :id'
                    );
                    $stmt->execute([
                        'enabled' => $enabled, 'day' => $dayOfWeek, 'time' => $sendTime,
                        'freq' => $frequency, 'id' => $existing['id'],
                    ]);
                } else {
                    $stmt = $db->prepare(
                        'INSERT INTO report_schedule (id, enabled, day_of_week, send_time_utc, frequency)
                         VALUES (:id, :enabled, :day, :time, :freq)'
                    );
                    $stmt->execute([
                        'id' => Uuid::uuid4()->toString(), 'enabled' => $enabled, 'day' => $dayOfWeek,
                        'time' => $sendTime, 'freq' => $frequency,
                    ]);
                }

                $row = $db->query('SELECT enabled, day_of_week, send_time_utc, frequency FROM report_schedule LIMIT 1')->fetch();
                return self::json($response, self::scheduleShape($row));
            });

            // GET /admin/report-recipients — every user with recipient status.
            $group->get('/report-recipients', function (Request $request, Response $response) {
                $db = Database::getInstance();
                $rows = $db->query(
                    'SELECT u.id AS user_id, u.display_name, u.email, rr.enabled
                     FROM users u
                     LEFT JOIN report_recipients rr ON rr.user_id = u.id
                     ORDER BY u.display_name ASC'
                )->fetchAll();

                $recipients = array_map(fn($r) => [
                    'userId' => $r['user_id'],
                    'displayName' => $r['display_name'],
                    'email' => $r['email'],
                    // No row yet → implicitly enabled (included until explicitly excluded).
                    'enabled' => $r['enabled'] === null ? true : (bool) (int) $r['enabled'],
                ], $rows);

                return self::json($response, ['recipients' => $recipients]);
            });

            // PUT /admin/report-recipients/{userId} — toggle one recipient.
            $group->put('/report-recipients/{userId}', function (Request $request, Response $response, array $args) {
                $userId = $args['userId'];
                if (!Validator::isUuid($userId)) {
                    return self::json($response, ['error' => 'userId must be a valid UUID'], 400);
                }

                $data = $request->getParsedBody() ?? [];
                if (!array_key_exists('enabled', $data) || !is_bool($data['enabled'])) {
                    return self::json($response, ['error' => 'enabled must be a boolean'], 422);
                }
                $enabled = (int) $data['enabled'];

                $db = Database::getInstance();
                $stmt = $db->prepare('SELECT id FROM users WHERE id = :id');
                $stmt->execute(['id' => $userId]);
                if (!$stmt->fetch()) {
                    return self::json($response, ['error' => 'User not found'], 404);
                }

                // Upsert the recipient row (UNIQUE(user_id) makes this safe).
                $stmt = $db->prepare(
                    'INSERT INTO report_recipients (id, user_id, enabled)
                     VALUES (:id, :user_id, :enabled)
                     ON DUPLICATE KEY UPDATE enabled = VALUES(enabled)'
                );
                $stmt->execute(['id' => Uuid::uuid4()->toString(), 'user_id' => $userId, 'enabled' => $enabled]);

                return self::json($response, ['userId' => $userId, 'enabled' => (bool) $enabled]);
            });

        })->add(new AdminMiddleware())->add(new AuthMiddleware());
    }

    /** Shape a schedule row (or null) into the canonical response object. */
    private static function scheduleShape(mixed $row): array
    {
        if (!$row) {
            return ['enabled' => false, 'dayOfWeek' => 1, 'sendTimeUtc' => '09:00', 'frequency' => 'weekly'];
        }
        return [
            'enabled' => (bool) (int) $row['enabled'],
            'dayOfWeek' => (int) $row['day_of_week'],
            'sendTimeUtc' => substr($row['send_time_utc'], 0, 5), // TIME "HH:MM:SS" → "HH:MM"
            'frequency' => $row['frequency'],
        ];
    }

    /** Returns an error message string when the schedule body is invalid, else null. */
    private static function validateSchedule(array $data): ?string
    {
        if (!array_key_exists('enabled', $data) || !is_bool($data['enabled'])) {
            return 'enabled must be a boolean';
        }
        if (!isset($data['dayOfWeek']) || !is_int($data['dayOfWeek']) || $data['dayOfWeek'] < 1 || $data['dayOfWeek'] > 7) {
            return 'dayOfWeek must be an integer between 1 and 7';
        }
        if (!isset($data['sendTimeUtc']) || !is_string($data['sendTimeUtc']) || !preg_match(self::TIME_PATTERN, $data['sendTimeUtc'])) {
            return 'sendTimeUtc must be a time in HH:MM format (00:00–23:59)';
        }
        if (($data['frequency'] ?? null) !== 'weekly') {
            return 'frequency must be "weekly"';
        }
        return null;
    }

    /** Write a JSON body with the given status and content type. */
    private static function json(Response $response, array $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data));
        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    }
}
