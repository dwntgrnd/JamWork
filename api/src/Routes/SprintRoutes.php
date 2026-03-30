<?php

namespace JamWork\Routes;

use JamWork\Lib\Database;
use JamWork\Lib\Validator;
use JamWork\Middleware\AuthMiddleware;
use JamWork\Models\TaskModel;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Ramsey\Uuid\Uuid;
use Slim\App;
use Slim\Routing\RouteCollectorProxy;

class SprintRoutes
{
    private const UUID_PATTERN = '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i';

    private const FETCH_QUERY = '
        SELECT s.*,
               p.id AS project_id_rel, p.name AS project_name,
               (SELECT COUNT(*) FROM tasks t WHERE t.sprint_id = s.id AND t.deleted_at IS NULL) AS task_count
        FROM sprints s
        LEFT JOIN projects p ON s.project_id = p.id
    ';

    private static function mapSprint(array $row): array
    {
        return [
            'id' => $row['id'],
            'name' => $row['name'],
            'description' => $row['description'],
            'startDate' => date('c', strtotime($row['start_date'])),
            'endDate' => date('c', strtotime($row['end_date'])),
            'status' => $row['status'],
            'projectId' => $row['project_id'],
            'createdById' => $row['created_by_id'],
            'createdAt' => date('c', strtotime($row['created_at'])),
            'updatedAt' => date('c', strtotime($row['updated_at'])),
            'project' => $row['project_id_rel'] ? [
                'id' => $row['project_id_rel'],
                'name' => $row['project_name'],
            ] : null,
            '_count' => [
                'tasks' => (int) $row['task_count'],
            ],
        ];
    }

    /**
     * Fetch tasks with relations for the given sprint IDs.
     *
     * @param array $sprintIds UUIDs of sprints to fetch tasks for
     * @param bool $full If true, include subtasks and createdBy (single sprint view)
     * @return array Map of sprintId => array of task objects
     */
    private static function fetchTasksForSprints(array $sprintIds, bool $full = false): array
    {
        if (empty($sprintIds)) {
            return [];
        }

        $db = Database::getInstance();

        // Build IN clause for sprint IDs
        $in = TaskModel::buildInClause($sprintIds, 'sid');

        // Fetch base tasks
        $sql = "
            SELECT t.*,
                   p.id AS project_rel_id, p.name AS project_rel_name
            FROM tasks t
            LEFT JOIN projects p ON t.project_id = p.id
            WHERE t.sprint_id IN ({$in['clause']})
              AND t.deleted_at IS NULL
            ORDER BY t.sort_order ASC
        ";
        $stmt = $db->prepare($sql);
        $stmt->execute($in['params']);
        $taskRows = $stmt->fetchAll();

        $taskIds = array_column($taskRows, 'id');

        // Initialize result map
        $result = [];
        foreach ($sprintIds as $sid) {
            $result[$sid] = [];
        }

        if (empty($taskIds)) {
            return $result;
        }

        // Fetch relations via TaskModel
        $options = ['full' => $full];
        if ($full) {
            $options['creatorIds'] = array_unique(array_column($taskRows, 'created_by_id'));
        }
        $relations = TaskModel::fetchRelationsForTasks($taskIds, $options);

        // Assemble and group by sprint
        foreach ($taskRows as $row) {
            $taskId = $row['id'];
            $sprintId = $row['sprint_id'];

            $taskRelations = [
                'assignees' => $relations['assignees'][$taskId] ?? [],
                'labels' => $relations['labels'][$taskId] ?? [],
            ];
            if ($full) {
                $taskRelations['subtasks'] = $relations['subtasks'][$taskId] ?? [];
                $taskRelations['creator'] = $relations['creators'][$row['created_by_id']] ?? null;
            }

            $result[$sprintId][] = TaskModel::mapTask($row, $taskRelations, $full);
        }

        return $result;
    }

    public static function register(App $app): void
    {
        $app->group('/sprints', function (RouteCollectorProxy $group) {

            // GET /sprints
            $group->get('', function (Request $request, Response $response) {
                $db = Database::getInstance();

                $params = $request->getQueryParams();
                $projectId = $params['projectId'] ?? null;
                $includeParam = $params['include'] ?? '';
                $includeStats = in_array('stats', explode(',', $includeParam));
                $includeTasks = ($params['includeTasks'] ?? '') === 'true';

                if ($projectId !== null) {
                    $stmt = $db->prepare(self::FETCH_QUERY . ' WHERE s.project_id = :projectId ORDER BY s.start_date ASC');
                    $stmt->execute(['projectId' => $projectId]);
                } else {
                    $stmt = $db->query(self::FETCH_QUERY . ' ORDER BY s.start_date ASC');
                }
                $rows = $stmt->fetchAll();
                $sprints = array_map([self::class, 'mapSprint'], $rows);

                if ($includeStats) {
                    $stmtTotal = $db->prepare(
                        'SELECT COUNT(*) FROM tasks WHERE sprint_id = :sprintId AND deleted_at IS NULL'
                    );
                    $stmtDone = $db->prepare(
                        'SELECT COUNT(*) FROM tasks WHERE sprint_id = :sprintId AND deleted_at IS NULL AND status = :status'
                    );

                    foreach ($sprints as &$sprint) {
                        $stmtTotal->execute(['sprintId' => $sprint['id']]);
                        $taskCount = (int) $stmtTotal->fetchColumn();

                        $stmtDone->execute(['sprintId' => $sprint['id'], 'status' => 'done']);
                        $completedCount = (int) $stmtDone->fetchColumn();

                        $sprint['stats'] = [
                            'taskCount' => $taskCount,
                            'completedCount' => $completedCount,
                        ];
                    }
                    unset($sprint);
                }

                if ($includeTasks) {
                    $sprintIds = array_column($sprints, 'id');
                    $tasksBySprint = self::fetchTasksForSprints($sprintIds, false);

                    foreach ($sprints as &$sprint) {
                        $sprint['tasks'] = $tasksBySprint[$sprint['id']] ?? [];
                    }
                    unset($sprint);
                }

                $response->getBody()->write(json_encode(['sprints' => $sprints]));
                return $response
                    ->withHeader('Content-Type', 'application/json')
                    ->withStatus(200);
            });

            // POST /sprints
            $group->post('', function (Request $request, Response $response) {
                $data = $request->getParsedBody() ?? [];

                $errors = Validator::validate($data, [
                    'name' => 'required|min:1|max:100',
                    'startDate' => 'required|iso8601',
                    'endDate' => 'required|iso8601',
                    'projectId' => 'optional|nullable|uuid',
                    'description' => 'optional|max:500',
                ]);

                if (!empty($errors)) {
                    return Validator::respondWithErrors($response, $errors);
                }

                if (strtotime($data['endDate']) <= strtotime($data['startDate'])) {
                    $response->getBody()->write(json_encode([
                        'error' => 'End date must be after start date',
                    ]));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(400);
                }

                $db = Database::getInstance();

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
                    'INSERT INTO sprints (id, name, description, start_date, end_date, status, project_id, created_by_id)
                     VALUES (:id, :name, :description, :start_date, :end_date, :status, :project_id, :created_by_id)'
                );
                $stmt->execute([
                    'id' => $id,
                    'name' => $data['name'],
                    'description' => $data['description'] ?? null,
                    'start_date' => $data['startDate'],
                    'end_date' => $data['endDate'],
                    'status' => 'active',
                    'project_id' => $projectId,
                    'created_by_id' => $userId,
                ]);

                $stmt = $db->prepare(self::FETCH_QUERY . ' WHERE s.id = :id');
                $stmt->execute(['id' => $id]);
                $row = $stmt->fetch();

                $response->getBody()->write(json_encode(['sprint' => self::mapSprint($row)]));
                return $response
                    ->withHeader('Content-Type', 'application/json')
                    ->withStatus(201);
            });

            // PUT /sprints/{id}/close — must be before /{id} PUT
            $group->put('/{id}/close', function (Request $request, Response $response, array $args) {
                $id = $args['id'];

                if (!preg_match(SprintRoutes::UUID_PATTERN, $id)) {
                    $response->getBody()->write(json_encode([
                        'error' => 'id must be a valid UUID',
                    ]));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(400);
                }

                $data = $request->getParsedBody() ?? [];

                $errors = Validator::validate($data, [
                    'action' => 'required|in:backlog,next_sprint',
                    'nextSprintId' => 'optional|uuid',
                ]);

                if (!empty($errors)) {
                    return Validator::respondWithErrors($response, $errors);
                }

                if ($data['action'] === 'next_sprint' && empty($data['nextSprintId'])) {
                    $response->getBody()->write(json_encode([
                        'error' => 'Next sprint ID is required when action is "next_sprint"',
                    ]));
                    return $response->withHeader('Content-Type', 'application/json')->withStatus(400);
                }

                $db = Database::getInstance();

                $stmt = $db->prepare('SELECT id, status FROM sprints WHERE id = :id');
                $stmt->execute(['id' => $id]);
                $sprint = $stmt->fetch();

                if (!$sprint) {
                    $response->getBody()->write(json_encode(['error' => 'Sprint not found']));
                    return $response->withHeader('Content-Type', 'application/json')->withStatus(404);
                }

                $stmt = $db->prepare(
                    'SELECT * FROM tasks WHERE sprint_id = :sprintId AND deleted_at IS NULL AND status != :doneStatus'
                );
                $stmt->execute(['sprintId' => $id, 'doneStatus' => 'done']);
                $incompleteTasks = $stmt->fetchAll();

                if ($data['action'] === 'next_sprint') {
                    $stmt = $db->prepare('SELECT id FROM sprints WHERE id = :id');
                    $stmt->execute(['id' => $data['nextSprintId']]);
                    if (!$stmt->fetch()) {
                        $response->getBody()->write(json_encode(['error' => 'Next sprint not found']));
                        return $response->withHeader('Content-Type', 'application/json')->withStatus(404);
                    }
                }

                $db->beginTransaction();
                try {
                    $stmt = $db->prepare('UPDATE sprints SET status = :status WHERE id = :id');
                    $stmt->execute(['status' => 'completed', 'id' => $id]);

                    if (!empty($incompleteTasks)) {
                        $taskIds = array_column($incompleteTasks, 'id');

                        $placeholders = [];
                        $params = [];
                        foreach ($taskIds as $i => $tid) {
                            $key = "tid{$i}";
                            $placeholders[] = ":{$key}";
                            $params[$key] = $tid;
                        }
                        $inClause = implode(', ', $placeholders);

                        $newSprintId = $data['action'] === 'backlog' ? null : $data['nextSprintId'];
                        $params['newSprintId'] = $newSprintId;

                        $sql = "UPDATE tasks SET sprint_id = :newSprintId WHERE id IN ({$inClause})";
                        $stmt = $db->prepare($sql);
                        $stmt->execute($params);
                    }

                    $db->commit();
                } catch (\Exception $e) {
                    $db->rollBack();
                    throw $e;
                }

                $mappedTasks = array_map(function ($row) {
                    return TaskModel::mapTask($row, [], false);
                }, $incompleteTasks);

                $response->getBody()->write(json_encode([
                    'message' => 'Sprint closed successfully',
                    'incompleteTasks' => $mappedTasks,
                ]));
                return $response->withHeader('Content-Type', 'application/json')->withStatus(200);
            });

            // GET /sprints/{id}
            $group->get('/{id}', function (Request $request, Response $response, array $args) {
                $id = $args['id'];

                if (!preg_match(SprintRoutes::UUID_PATTERN, $id)) {
                    $response->getBody()->write(json_encode([
                        'error' => 'id must be a valid UUID',
                    ]));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(400);
                }

                $db = Database::getInstance();

                $stmt = $db->prepare(self::FETCH_QUERY . ' WHERE s.id = :id');
                $stmt->execute(['id' => $id]);
                $row = $stmt->fetch();

                if (!$row) {
                    $response->getBody()->write(json_encode(['error' => 'Sprint not found']));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(404);
                }

                $sprint = self::mapSprint($row);

                // Full task expansion
                $tasksBySprint = self::fetchTasksForSprints([$id], true);
                $sprint['tasks'] = $tasksBySprint[$id] ?? [];

                $response->getBody()->write(json_encode(['sprint' => $sprint]));
                return $response
                    ->withHeader('Content-Type', 'application/json')
                    ->withStatus(200);
            });

            // PUT /sprints/{id}
            $group->put('/{id}', function (Request $request, Response $response, array $args) {
                $id = $args['id'];

                if (!preg_match(SprintRoutes::UUID_PATTERN, $id)) {
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
                    'startDate' => 'optional|iso8601',
                    'endDate' => 'optional|iso8601',
                    'status' => 'optional|in:active,completed',
                    'description' => 'optional|nullable|max:500',
                ]);

                if (!empty($errors)) {
                    return Validator::respondWithErrors($response, $errors);
                }

                if (isset($data['startDate']) && isset($data['endDate'])) {
                    if (strtotime($data['endDate']) <= strtotime($data['startDate'])) {
                        $response->getBody()->write(json_encode([
                            'error' => 'End date must be after start date',
                        ]));
                        return $response
                            ->withHeader('Content-Type', 'application/json')
                            ->withStatus(400);
                    }
                }

                $db = Database::getInstance();

                $stmt = $db->prepare('SELECT id FROM sprints WHERE id = :id');
                $stmt->execute(['id' => $id]);
                if (!$stmt->fetch()) {
                    $response->getBody()->write(json_encode(['error' => 'Sprint not found']));
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

                if (isset($data['startDate'])) {
                    $updates[] = 'start_date = :start_date';
                    $params['start_date'] = $data['startDate'];
                }

                if (isset($data['endDate'])) {
                    $updates[] = 'end_date = :end_date';
                    $params['end_date'] = $data['endDate'];
                }

                if (isset($data['status'])) {
                    $updates[] = 'status = :status';
                    $params['status'] = $data['status'];
                }

                if (!empty($updates)) {
                    $sql = 'UPDATE sprints SET ' . implode(', ', $updates) . ' WHERE id = :id';
                    $stmt = $db->prepare($sql);
                    $stmt->execute($params);
                }

                $stmt = $db->prepare(self::FETCH_QUERY . ' WHERE s.id = :id');
                $stmt->execute(['id' => $id]);
                $row = $stmt->fetch();

                $response->getBody()->write(json_encode(['sprint' => self::mapSprint($row)]));
                return $response
                    ->withHeader('Content-Type', 'application/json')
                    ->withStatus(200);
            });

            // DELETE /sprints/{id}
            $group->delete('/{id}', function (Request $request, Response $response, array $args) {
                $id = $args['id'];

                if (!preg_match(SprintRoutes::UUID_PATTERN, $id)) {
                    $response->getBody()->write(json_encode([
                        'error' => 'id must be a valid UUID',
                    ]));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(400);
                }

                $db = Database::getInstance();

                $stmt = $db->prepare('SELECT id FROM sprints WHERE id = :id');
                $stmt->execute(['id' => $id]);
                if (!$stmt->fetch()) {
                    $response->getBody()->write(json_encode(['error' => 'Sprint not found']));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(404);
                }

                $stmt = $db->prepare('DELETE FROM sprints WHERE id = :id');
                $stmt->execute(['id' => $id]);

                $response->getBody()->write(json_encode(['message' => 'Sprint deleted successfully']));
                return $response
                    ->withHeader('Content-Type', 'application/json')
                    ->withStatus(200);
            });

        })->add(new AuthMiddleware());
    }
}
