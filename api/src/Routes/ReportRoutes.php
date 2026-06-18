<?php

namespace JamWork\Routes;

use JamWork\Lib\Validator;
use JamWork\Middleware\AdminMiddleware;
use JamWork\Middleware\AuthMiddleware;
use JamWork\Services\ReportService;
use JamWork\Services\ServiceException;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\App;
use Slim\Routing\RouteCollectorProxy;

/**
 * /reports endpoints (CC30a). All auth-gated via AuthMiddleware. The backend is
 * the single aggregator: POST generates + stores a snapshot; the GET routes are
 * pure reads of the stored payload / markdown.
 */
class ReportRoutes
{
    public static function register(App $app): void
    {
        $app->group('/reports', function (RouteCollectorProxy $group) {

            // POST /reports — generate + store; returns the stored object.
            // Optional body { projectIds: string[] } scopes an ad hoc report to a
            // subset of report-eligible projects (CC36); omitted/empty = full report.
            $group->post('', function (Request $request, Response $response) {
                $body = $request->getParsedBody();
                $projectIds = is_array($body) ? ($body['projectIds'] ?? null) : null;

                if ($projectIds !== null && !is_array($projectIds)) {
                    return self::json($response, ['error' => 'projectIds must be an array of project IDs'], 400);
                }

                try {
                    $report = ReportService::generate(
                        $request->getAttribute('userId'),
                        projectIds: $projectIds
                    );
                } catch (ServiceException $e) {
                    return self::json($response, ['error' => $e->getMessage()], $e->getStatusCode());
                }

                return self::json($response, ['report' => $report], 201);
            });

            // GET /reports — archive, newest-first
            $group->get('', function (Request $request, Response $response) {
                return self::json($response, ['reports' => ReportService::listReports()]);
            });

            // GET /reports/{id}/markdown — raw markdown download (before /{id})
            $group->get('/{id}/markdown', function (Request $request, Response $response, array $args) {
                $id = $args['id'];
                if (!Validator::isUuid($id)) {
                    return self::json($response, ['error' => 'id must be a valid UUID'], 400);
                }

                try {
                    $markdown = ReportService::markdown($id);
                } catch (ServiceException $e) {
                    return self::json($response, ['error' => $e->getMessage()], $e->getStatusCode());
                }

                $response->getBody()->write($markdown);
                return $response
                    ->withHeader('Content-Type', 'text/markdown; charset=utf-8')
                    ->withHeader('Content-Disposition', "attachment; filename=\"status-report-{$id}.md\"")
                    ->withStatus(200);
            });

            // GET /reports/{id} — stored payload for rendering
            $group->get('/{id}', function (Request $request, Response $response, array $args) {
                $id = $args['id'];
                if (!Validator::isUuid($id)) {
                    return self::json($response, ['error' => 'id must be a valid UUID'], 400);
                }

                try {
                    $report = ReportService::get($id);
                } catch (ServiceException $e) {
                    return self::json($response, ['error' => $e->getMessage()], $e->getStatusCode());
                }

                return self::json($response, ['report' => $report]);
            });

            // DELETE /reports/{id} — admin-only hard delete
            $group->delete('/{id}', function (Request $request, Response $response, array $args) {
                $id = $args['id'];
                if (!Validator::isUuid($id)) {
                    return self::json($response, ['error' => 'id must be a valid UUID'], 400);
                }

                try {
                    ReportService::deleteReport($id);
                } catch (ServiceException $e) {
                    return self::json($response, ['error' => $e->getMessage()], $e->getStatusCode());
                }

                return self::json($response, ['message' => 'Report deleted successfully']);
            })->add(new AdminMiddleware());

        })->add(new AuthMiddleware());
    }

    /** Write a JSON body with the given status and content type. */
    private static function json(Response $response, array $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data));
        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    }
}
