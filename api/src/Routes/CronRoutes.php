<?php

namespace JamWork\Routes;

use JamWork\Lib\Database;
use JamWork\Lib\Mailer;
use JamWork\Services\ReportEmailRenderer;
use JamWork\Services\ReportService;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\App;
use Slim\Routing\RouteCollectorProxy;

/**
 * Cron-triggered report generation + email delivery (CC32a). This route group is
 * NOT behind AuthMiddleware/AdminMiddleware — cron has no user session. It is
 * secured by a shared secret (CRON_SECRET) sent as `Authorization: Bearer ...`
 * (Decision #101). The endpoint is portable: any scheduler that can POST with
 * the secret works; SiteGround cron is just the deployment mechanism.
 *
 * It reuses ReportService::generate() (type = 'scheduled', triggered_by = null)
 * so scheduled reports land in the same archive as manual ones, then renders the
 * payload to HTML and emails every enabled recipient.
 */
class CronRoutes
{
    public static function register(App $app): void
    {
        $app->group('/cron', function (RouteCollectorProxy $group) {

            $group->post('/generate-report', function (Request $request, Response $response) {
                // 1. Shared-secret auth.
                $secret = $_ENV['CRON_SECRET'] ?? '';
                if ($secret === '') {
                    return self::json($response, ['error' => 'Cron endpoint not configured'], 503);
                }
                if ($request->getHeaderLine('Authorization') !== 'Bearer ' . $secret) {
                    return self::json($response, ['error' => 'Unauthorized'], 401);
                }

                $db = Database::getInstance();

                // 2. Schedule gate — missing row or disabled master toggle is a no-op.
                $schedule = $db->query('SELECT enabled FROM report_schedule LIMIT 1')->fetch();
                if (!$schedule || (int) $schedule['enabled'] !== 1) {
                    return self::json($response, ['skipped' => 'schedule_disabled']);
                }

                // 3. Generate + persist (same logic as manual; scheduled, no user).
                $report = ReportService::generate(null, type: 'scheduled');
                $reportId = $report['id'];

                // 4. Nothing useful to email when no projects are included.
                if (!empty($report['payload']['projectsEmpty'])) {
                    return self::json($response, [
                        'generated' => true, 'reportId' => $reportId,
                        'emailsSent' => 0, 'note' => 'no_projects_included',
                    ]);
                }

                // 5. Enabled recipients only.
                $recipients = $db->query(
                    'SELECT u.email, u.display_name
                     FROM report_recipients rr JOIN users u ON u.id = rr.user_id
                     WHERE rr.enabled = 1
                     ORDER BY u.display_name ASC'
                )->fetchAll();
                if (empty($recipients)) {
                    return self::json($response, [
                        'generated' => true, 'reportId' => $reportId,
                        'emailsSent' => 0, 'note' => 'no_recipients',
                    ]);
                }

                // 6. SMTP must be configured to send.
                if (!Mailer::isConfigured()) {
                    error_log('Cron report generated but SMTP is not configured; no emails sent.');
                    return self::json($response, [
                        'generated' => true, 'reportId' => $reportId,
                        'emailsSent' => 0, 'note' => 'smtp_not_configured',
                    ]);
                }

                // 7. Render once from the persisted payload.
                $workspaceName = self::workspaceName($db);
                $reportUrl = ($_ENV['APP_URL'] ?? '') . '/reports/' . $reportId;
                $html = ReportEmailRenderer::render($report['payload'], $workspaceName, $reportUrl);
                $text = ReportEmailRenderer::renderText($report['payload'], $workspaceName, $reportUrl);

                // 8. Send to as many recipients as possible; failures don't abort.
                $mailer = new Mailer();
                $sent = 0;
                foreach ($recipients as $r) {
                    $result = $mailer->sendStatusReportEmail($r['email'], $r['display_name'], $html, $text, $workspaceName);
                    if ($result['sent']) {
                        $sent++;
                    } else {
                        error_log("Cron report email failed for {$r['email']}: " . ($result['error'] ?? 'unknown'));
                    }
                }

                // 9. Done.
                return self::json($response, [
                    'generated' => true, 'reportId' => $reportId, 'emailsSent' => $sent,
                ]);
            });

        });
    }

    private static function workspaceName(\PDO $db): string
    {
        $stmt = $db->prepare('SELECT `value` FROM `workspace_settings` WHERE `key` = :key');
        $stmt->execute(['key' => 'workspace_name']);
        $row = $stmt->fetch();
        return $row ? $row['value'] : 'JamWork';
    }

    private static function json(Response $response, array $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data));
        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    }
}
