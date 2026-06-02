<?php

namespace JamWork\Routes;

use JamWork\Lib\Database;
use JamWork\Lib\Validator;
use JamWork\Middleware\AuthMiddleware;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Ramsey\Uuid\Uuid;
use Slim\App;
use Slim\Routing\RouteCollectorProxy;

class TaskLinkRoutes
{

    private const FETCH_QUERY = '
        SELECT tl.*,
               u.id AS creator_id, u.display_name AS creator_display_name
        FROM task_links tl
        JOIN users u ON tl.created_by_id = u.id
    ';

    private static function mapLink(array $row): array
    {
        return [
            'id' => $row['id'],
            'url' => $row['url'],
            'title' => $row['title'],
            'taskId' => $row['task_id'],
            'createdAt' => date('c', strtotime($row['created_at'])),
            'createdBy' => [
                'id' => $row['creator_id'],
                'displayName' => $row['creator_display_name'],
            ],
        ];
    }

    public static function register(App $app): void
    {
        $app->group('/tasks/{taskId}/links', function (RouteCollectorProxy $group) {

            // GET /tasks/{taskId}/links
            $group->get('', function (Request $request, Response $response, array $args) {
                $taskId = $args['taskId'];

                if (!Validator::isUuid($taskId)) {
                    $response->getBody()->write(json_encode([
                        'error' => 'taskId must be a valid UUID',
                    ]));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(400);
                }

                $db = Database::getInstance();

                $stmt = $db->prepare('SELECT id FROM tasks WHERE id = :taskId AND deleted_at IS NULL');
                $stmt->execute(['taskId' => $taskId]);
                if (!$stmt->fetch()) {
                    $response->getBody()->write(json_encode(['error' => 'Task not found']));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(404);
                }

                $stmt = $db->prepare(self::FETCH_QUERY . ' WHERE tl.task_id = :taskId ORDER BY tl.created_at DESC');
                $stmt->execute(['taskId' => $taskId]);
                $rows = $stmt->fetchAll();

                $links = array_map([self::class, 'mapLink'], $rows);

                $response->getBody()->write(json_encode(['links' => $links]));
                return $response
                    ->withHeader('Content-Type', 'application/json')
                    ->withStatus(200);
            });

            // POST /tasks/{taskId}/links
            $group->post('', function (Request $request, Response $response, array $args) {
                $taskId = $args['taskId'];

                if (!Validator::isUuid($taskId)) {
                    $response->getBody()->write(json_encode([
                        'error' => 'taskId must be a valid UUID',
                    ]));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(400);
                }

                $db = Database::getInstance();

                $stmt = $db->prepare('SELECT id FROM tasks WHERE id = :taskId AND deleted_at IS NULL');
                $stmt->execute(['taskId' => $taskId]);
                if (!$stmt->fetch()) {
                    $response->getBody()->write(json_encode(['error' => 'Task not found']));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(404);
                }

                $data = $request->getParsedBody() ?? [];

                $errors = Validator::validate($data, [
                    'url' => 'required|url|max:2000',
                    'title' => 'optional|max:200',
                ]);

                if (!empty($errors)) {
                    return Validator::respondWithErrors($response, $errors);
                }

                // Additional URL scheme check
                if (!str_starts_with($data['url'], 'http://') && !str_starts_with($data['url'], 'https://')) {
                    $response->getBody()->write(json_encode([
                        'errors' => [['field' => 'url', 'message' => 'URL must start with http:// or https://']],
                    ]));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(400);
                }

                $userId = $request->getAttribute('userId');
                $id = Uuid::uuid4()->toString();

                $stmt = $db->prepare(
                    'INSERT INTO task_links (id, url, title, task_id, created_by_id)
                     VALUES (:id, :url, :title, :task_id, :created_by_id)'
                );
                $stmt->execute([
                    'id' => $id,
                    'url' => $data['url'],
                    'title' => $data['title'] ?? null,
                    'task_id' => $taskId,
                    'created_by_id' => $userId,
                ]);

                $stmt = $db->prepare(self::FETCH_QUERY . ' WHERE tl.id = :id');
                $stmt->execute(['id' => $id]);
                $row = $stmt->fetch();

                $response->getBody()->write(json_encode(['link' => self::mapLink($row)]));
                return $response
                    ->withHeader('Content-Type', 'application/json')
                    ->withStatus(201);
            });

            // DELETE /tasks/{taskId}/links/{linkId}
            $group->delete('/{linkId}', function (Request $request, Response $response, array $args) {
                $taskId = $args['taskId'];
                $linkId = $args['linkId'];

                if (!Validator::isUuid($taskId)) {
                    $response->getBody()->write(json_encode([
                        'error' => 'taskId must be a valid UUID',
                    ]));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(400);
                }

                if (!Validator::isUuid($linkId)) {
                    $response->getBody()->write(json_encode([
                        'error' => 'linkId must be a valid UUID',
                    ]));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(400);
                }

                $db = Database::getInstance();

                $stmt = $db->prepare('SELECT id FROM task_links WHERE id = :linkId AND task_id = :taskId');
                $stmt->execute(['linkId' => $linkId, 'taskId' => $taskId]);
                if (!$stmt->fetch()) {
                    $response->getBody()->write(json_encode(['error' => 'Link not found']));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(404);
                }

                $stmt = $db->prepare('DELETE FROM task_links WHERE id = :id');
                $stmt->execute(['id' => $linkId]);

                $response->getBody()->write(json_encode(['message' => 'Link deleted successfully']));
                return $response
                    ->withHeader('Content-Type', 'application/json')
                    ->withStatus(200);
            });

        })->add(new AuthMiddleware());
    }
}
