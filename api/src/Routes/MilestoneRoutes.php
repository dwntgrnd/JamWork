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

class MilestoneRoutes
{
    private const UUID_PATTERN = '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i';

    private static function mapMilestone(array $row): array
    {
        return [
            'id' => $row['id'],
            'name' => $row['name'],
            'date' => date('c', strtotime($row['date'])),
            'projectId' => $row['project_id'],
            'createdById' => $row['created_by_id'],
            'createdAt' => date('c', strtotime($row['created_at'])),
            'updatedAt' => date('c', strtotime($row['updated_at'])),
        ];
    }

    public static function register(App $app): void
    {
        $app->group('/milestones', function (RouteCollectorProxy $group) {

            // GET /milestones
            $group->get('', function (Request $request, Response $response) {
                $db = Database::getInstance();
                $projectId = $request->getQueryParams()['projectId'] ?? null;

                if ($projectId !== null) {
                    $stmt = $db->prepare('SELECT * FROM milestones WHERE project_id = :projectId ORDER BY date ASC');
                    $stmt->execute(['projectId' => $projectId]);
                } else {
                    $stmt = $db->query('SELECT * FROM milestones ORDER BY date ASC');
                }

                $rows = $stmt->fetchAll();
                $milestones = array_map([self::class, 'mapMilestone'], $rows);

                $response->getBody()->write(json_encode(['milestones' => $milestones]));
                return $response
                    ->withHeader('Content-Type', 'application/json')
                    ->withStatus(200);
            });

            // POST /milestones
            $group->post('', function (Request $request, Response $response) {
                $data = $request->getParsedBody() ?? [];

                $errors = Validator::validate($data, [
                    'name' => 'required|min:1|max:100',
                    'date' => 'required|iso8601',
                    'projectId' => 'optional|nullable|uuid',
                ]);

                if (!empty($errors)) {
                    return Validator::respondWithErrors($response, $errors);
                }

                $db = Database::getInstance();

                // Verify project exists if provided
                $projectId = $data['projectId'] ?? null;
                if ($projectId !== null) {
                    $stmt = $db->prepare('SELECT id FROM projects WHERE id = :projectId');
                    $stmt->execute(['projectId' => $projectId]);
                    if (!$stmt->fetch()) {
                        $response->getBody()->write(json_encode(['error' => 'Project not found']));
                        return $response
                            ->withHeader('Content-Type', 'application/json')
                            ->withStatus(404);
                    }
                }

                $userId = $request->getAttribute('userId');
                $id = Uuid::uuid4()->toString();

                $stmt = $db->prepare(
                    'INSERT INTO milestones (id, name, date, project_id, created_by_id)
                     VALUES (:id, :name, :date, :project_id, :created_by_id)'
                );
                $stmt->execute([
                    'id' => $id,
                    'name' => $data['name'],
                    'date' => $data['date'],
                    'project_id' => $projectId,
                    'created_by_id' => $userId,
                ]);

                $stmt = $db->prepare('SELECT * FROM milestones WHERE id = :id');
                $stmt->execute(['id' => $id]);
                $row = $stmt->fetch();

                $response->getBody()->write(json_encode(['milestone' => self::mapMilestone($row)]));
                return $response
                    ->withHeader('Content-Type', 'application/json')
                    ->withStatus(201);
            });

            // PUT /milestones/{id}
            $group->put('/{id}', function (Request $request, Response $response, array $args) {
                $id = $args['id'];

                if (!preg_match(MilestoneRoutes::UUID_PATTERN, $id)) {
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
                    'date' => 'optional|iso8601',
                    'projectId' => 'optional|nullable|uuid',
                ]);

                if (!empty($errors)) {
                    return Validator::respondWithErrors($response, $errors);
                }

                $db = Database::getInstance();

                // Verify project exists if provided and non-null
                if (array_key_exists('projectId', $data) && $data['projectId'] !== null) {
                    $stmt = $db->prepare('SELECT id FROM projects WHERE id = :projectId');
                    $stmt->execute(['projectId' => $data['projectId']]);
                    if (!$stmt->fetch()) {
                        $response->getBody()->write(json_encode(['error' => 'Project not found']));
                        return $response
                            ->withHeader('Content-Type', 'application/json')
                            ->withStatus(404);
                    }
                }

                $stmt = $db->prepare('SELECT id FROM milestones WHERE id = :id');
                $stmt->execute(['id' => $id]);
                if (!$stmt->fetch()) {
                    $response->getBody()->write(json_encode(['error' => 'Milestone not found']));
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

                if (isset($data['date'])) {
                    $updates[] = 'date = :date';
                    $params['date'] = $data['date'];
                }

                if (array_key_exists('projectId', $data)) {
                    $updates[] = 'project_id = :project_id';
                    $params['project_id'] = $data['projectId'];
                }

                if (!empty($updates)) {
                    $sql = 'UPDATE milestones SET ' . implode(', ', $updates) . ' WHERE id = :id';
                    $stmt = $db->prepare($sql);
                    $stmt->execute($params);
                }

                $stmt = $db->prepare('SELECT * FROM milestones WHERE id = :id');
                $stmt->execute(['id' => $id]);
                $row = $stmt->fetch();

                $response->getBody()->write(json_encode(['milestone' => self::mapMilestone($row)]));
                return $response
                    ->withHeader('Content-Type', 'application/json')
                    ->withStatus(200);
            });

            // DELETE /milestones/{id}
            $group->delete('/{id}', function (Request $request, Response $response, array $args) {
                $id = $args['id'];

                if (!preg_match(MilestoneRoutes::UUID_PATTERN, $id)) {
                    $response->getBody()->write(json_encode([
                        'error' => 'id must be a valid UUID',
                    ]));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(400);
                }

                $db = Database::getInstance();

                $stmt = $db->prepare('SELECT id FROM milestones WHERE id = :id');
                $stmt->execute(['id' => $id]);
                if (!$stmt->fetch()) {
                    $response->getBody()->write(json_encode(['error' => 'Milestone not found']));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(404);
                }

                $stmt = $db->prepare('DELETE FROM milestones WHERE id = :id');
                $stmt->execute(['id' => $id]);

                $response->getBody()->write(json_encode(['message' => 'Milestone deleted successfully']));
                return $response
                    ->withHeader('Content-Type', 'application/json')
                    ->withStatus(200);
            });

        })->add(new AuthMiddleware());
    }
}
