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

class ProjectRoutes
{
    private const UUID_PATTERN = '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i';

    private const FETCH_QUERY = '
        SELECT p.*,
               u.id AS creator_id, u.email AS creator_email, u.display_name AS creator_display_name,
               (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.deleted_at IS NULL AND t.status != \'done\') AS task_count
        FROM projects p
        JOIN users u ON p.created_by_id = u.id
    ';

    private static function mapProject(array $row): array
    {
        return [
            'id' => $row['id'],
            'name' => $row['name'],
            'description' => $row['description'],
            'startDate' => $row['start_date'] ? date('c', strtotime($row['start_date'])) : null,
            'endDate' => $row['end_date'] ? date('c', strtotime($row['end_date'])) : null,
            'sprintPlanning' => (bool) $row['sprint_planning'],
            'defaultNotifyEnabled' => (bool) ($row['default_notify_enabled'] ?? 1),
            'createdAt' => date('c', strtotime($row['created_at'])),
            'updatedAt' => date('c', strtotime($row['updated_at'])),
            'createdById' => $row['created_by_id'],
            'createdBy' => [
                'id' => $row['creator_id'],
                'email' => $row['creator_email'],
                'displayName' => $row['creator_display_name'],
            ],
            '_count' => [
                'tasks' => (int) $row['task_count'],
            ],
        ];
    }

    public static function register(App $app): void
    {
        $app->group('/projects', function (RouteCollectorProxy $group) {

            // GET /projects
            $group->get('', function (Request $request, Response $response) {
                $db = Database::getInstance();

                $stmt = $db->query(self::FETCH_QUERY . ' ORDER BY p.name ASC');
                $rows = $stmt->fetchAll();

                $projects = array_map([self::class, 'mapProject'], $rows);

                $response->getBody()->write(json_encode(['projects' => $projects]));
                return $response
                    ->withHeader('Content-Type', 'application/json')
                    ->withStatus(200);
            });

            // POST /projects
            $group->post('', function (Request $request, Response $response) {
                $data = $request->getParsedBody() ?? [];

                $errors = Validator::validate($data, [
                    'name' => 'required|min:1|max:100',
                    'description' => 'optional|max:5000',
                    'startDate' => 'optional|iso8601',
                    'endDate' => 'optional|iso8601',
                    'sprintPlanning' => 'optional|boolean',
                    'defaultNotifyEnabled' => 'optional|boolean',
                ]);

                if (!empty($errors)) {
                    return Validator::respondWithErrors($response, $errors);
                }

                // Cross-validate dates
                if (isset($data['startDate']) && isset($data['endDate'])
                    && $data['startDate'] !== null && $data['endDate'] !== null) {
                    if (strtotime($data['endDate']) < strtotime($data['startDate'])) {
                        $response->getBody()->write(json_encode([
                            'error' => 'End date must be on or after start date',
                        ]));
                        return $response
                            ->withHeader('Content-Type', 'application/json')
                            ->withStatus(400);
                    }
                }

                $db = Database::getInstance();
                $userId = $request->getAttribute('userId');
                $id = Uuid::uuid4()->toString();

                $stmt = $db->prepare(
                    'INSERT INTO projects (id, name, description, start_date, end_date, sprint_planning, default_notify_enabled, created_by_id)
                     VALUES (:id, :name, :description, :start_date, :end_date, :sprint_planning, :default_notify_enabled, :created_by_id)'
                );
                $stmt->execute([
                    'id' => $id,
                    'name' => $data['name'],
                    'description' => $data['description'] ?? null,
                    'start_date' => Validator::toMySQLDate($data['startDate'] ?? null),
                    'end_date' => Validator::toMySQLDate($data['endDate'] ?? null),
                    'sprint_planning' => (int) ($data['sprintPlanning'] ?? true),
                    'default_notify_enabled' => (int) ($data['defaultNotifyEnabled'] ?? true),
                    'created_by_id' => $userId,
                ]);

                $stmt = $db->prepare(self::FETCH_QUERY . ' WHERE p.id = :id');
                $stmt->execute(['id' => $id]);
                $row = $stmt->fetch();

                $response->getBody()->write(json_encode(['project' => self::mapProject($row)]));
                return $response
                    ->withHeader('Content-Type', 'application/json')
                    ->withStatus(201);
            });

            // PUT /projects/{id}
            $group->put('/{id}', function (Request $request, Response $response, array $args) {
                $id = $args['id'];

                if (!preg_match(ProjectRoutes::UUID_PATTERN, $id)) {
                    $response->getBody()->write(json_encode([
                        'error' => 'id must be a valid UUID',
                    ]));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(400);
                }

                $data = $request->getParsedBody() ?? [];

                $errors = Validator::validate($data, [
                    'name' => 'optional|min:1|max:100',
                    'description' => 'optional',
                    'startDate' => 'optional|nullable|iso8601',
                    'endDate' => 'optional|nullable|iso8601',
                    'sprintPlanning' => 'optional|boolean',
                    'defaultNotifyEnabled' => 'optional|boolean',
                ]);

                if (!empty($errors)) {
                    return Validator::respondWithErrors($response, $errors);
                }

                // Cross-validate dates
                if (isset($data['startDate']) && isset($data['endDate'])
                    && $data['startDate'] !== null && $data['endDate'] !== null) {
                    if (strtotime($data['endDate']) < strtotime($data['startDate'])) {
                        $response->getBody()->write(json_encode([
                            'error' => 'End date must be on or after start date',
                        ]));
                        return $response
                            ->withHeader('Content-Type', 'application/json')
                            ->withStatus(400);
                    }
                }

                $db = Database::getInstance();

                $stmt = $db->prepare('SELECT id FROM projects WHERE id = :id');
                $stmt->execute(['id' => $id]);
                if (!$stmt->fetch()) {
                    $response->getBody()->write(json_encode(['error' => 'Project not found']));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(404);
                }

                $updates = [];
                $params = ['id' => $id];

                if (isset($data['name'])) {
                    $updates[] = 'name = :name';
                    $params['name'] = $data['name'];
                }

                if (array_key_exists('description', $data)) {
                    $updates[] = 'description = :description';
                    $params['description'] = $data['description'];
                }

                if (array_key_exists('startDate', $data)) {
                    $updates[] = 'start_date = :start_date';
                    $params['start_date'] = Validator::toMySQLDate($data['startDate']);
                }

                if (array_key_exists('endDate', $data)) {
                    $updates[] = 'end_date = :end_date';
                    $params['end_date'] = Validator::toMySQLDate($data['endDate']);
                }

                if (array_key_exists('sprintPlanning', $data)) {
                    $updates[] = 'sprint_planning = :sprint_planning';
                    $params['sprint_planning'] = (int) (bool) $data['sprintPlanning'];
                }
                if (array_key_exists('defaultNotifyEnabled', $data)) {
                    // Not retroactive (PRD §9.3): only seeds future task creation.
                    $updates[] = 'default_notify_enabled = :default_notify_enabled';
                    $params['default_notify_enabled'] = (int) (bool) $data['defaultNotifyEnabled'];
                }

                if (!empty($updates)) {
                    $sql = 'UPDATE projects SET ' . implode(', ', $updates) . ' WHERE id = :id';
                    $stmt = $db->prepare($sql);
                    $stmt->execute($params);
                }

                $stmt = $db->prepare(self::FETCH_QUERY . ' WHERE p.id = :id');
                $stmt->execute(['id' => $id]);
                $row = $stmt->fetch();

                $response->getBody()->write(json_encode(['project' => self::mapProject($row)]));
                return $response
                    ->withHeader('Content-Type', 'application/json')
                    ->withStatus(200);
            });

            // DELETE /projects/{id}
            $group->delete('/{id}', function (Request $request, Response $response, array $args) {
                $id = $args['id'];

                if (!preg_match(ProjectRoutes::UUID_PATTERN, $id)) {
                    $response->getBody()->write(json_encode([
                        'error' => 'id must be a valid UUID',
                    ]));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(400);
                }

                $db = Database::getInstance();

                $stmt = $db->prepare('SELECT id FROM projects WHERE id = :id');
                $stmt->execute(['id' => $id]);
                if (!$stmt->fetch()) {
                    $response->getBody()->write(json_encode(['error' => 'Project not found']));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(404);
                }

                $stmt = $db->prepare('DELETE FROM projects WHERE id = :id');
                $stmt->execute(['id' => $id]);

                $response->getBody()->write(json_encode(['message' => 'Project deleted successfully']));
                return $response
                    ->withHeader('Content-Type', 'application/json')
                    ->withStatus(200);
            });

        })->add(new AuthMiddleware());
    }
}
