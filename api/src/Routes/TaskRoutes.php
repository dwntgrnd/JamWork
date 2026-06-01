<?php

namespace JamWork\Routes;

use JamWork\Lib\Database;
use JamWork\Lib\NotificationService;
use JamWork\Lib\Validator;
use JamWork\Middleware\AuthMiddleware;
use JamWork\Models\TaskModel;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Ramsey\Uuid\Uuid;
use Slim\App;
use Slim\Routing\RouteCollectorProxy;

class TaskRoutes
{
    private const UUID_PATTERN = '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i';

    private const FETCH_QUERY = '
        SELECT t.*,
               p.id AS project_rel_id, p.name AS project_rel_name
        FROM tasks t
        LEFT JOIN projects p ON t.project_id = p.id
    ';

    public static function register(App $app): void
    {
        $app->group('/tasks', function (RouteCollectorProxy $group) {

            // ============================================================
            // STATIC ROUTES (must come before /{id} parameterized routes)
            // ============================================================

            // PUT /tasks/reorder
            $group->put('/reorder', function (Request $request, Response $response) {
                $data = $request->getParsedBody() ?? [];

                $errors = Validator::validate($data, [
                    'taskIds' => 'required|uuid_array',
                ]);

                if (!empty($errors)) {
                    return Validator::respondWithErrors($response, $errors);
                }

                $db = Database::getInstance();
                $db->beginTransaction();
                try {
                    $stmt = $db->prepare('UPDATE tasks SET sort_order = :sortOrder WHERE id = :id AND deleted_at IS NULL');
                    foreach ($data['taskIds'] as $i => $taskId) {
                        $stmt->execute(['sortOrder' => $i, 'id' => $taskId]);
                    }
                    $db->commit();
                } catch (\Exception $e) {
                    $db->rollBack();
                    throw $e;
                }

                $response->getBody()->write(json_encode(['message' => 'Tasks reordered successfully']));
                return $response->withHeader('Content-Type', 'application/json')->withStatus(200);
            });

            // PUT /tasks/bulk-update
            $group->put('/bulk-update', function (Request $request, Response $response) {
                $data = $request->getParsedBody() ?? [];

                // Validate taskIds
                if (!isset($data['taskIds']) || !is_array($data['taskIds']) || empty($data['taskIds'])) {
                    $response->getBody()->write(json_encode(['error' => 'taskIds must be a non-empty array of UUIDs']));
                    return $response->withHeader('Content-Type', 'application/json')->withStatus(400);
                }
                foreach ($data['taskIds'] as $taskId) {
                    if (!is_string($taskId) || !preg_match(TaskRoutes::UUID_PATTERN, $taskId)) {
                        $response->getBody()->write(json_encode(['error' => 'taskIds must contain only valid UUIDs']));
                        return $response->withHeader('Content-Type', 'application/json')->withStatus(400);
                    }
                }

                // Validate fields
                if (!isset($data['fields']) || !is_array($data['fields']) || empty($data['fields'])) {
                    $response->getBody()->write(json_encode(['error' => 'fields must be a non-empty object']));
                    return $response->withHeader('Content-Type', 'application/json')->withStatus(400);
                }

                $allowedFields = ['status', 'priority', 'sprintId', 'inSprintBacklog'];
                foreach (array_keys($data['fields']) as $key) {
                    if (!in_array($key, $allowedFields, true)) {
                        $response->getBody()->write(json_encode(['error' => "Field '{$key}' is not allowed"]));
                        return $response->withHeader('Content-Type', 'application/json')->withStatus(400);
                    }
                }

                $fields = $data['fields'];
                if (isset($fields['status']) && !in_array($fields['status'], ['todo', 'in_progress', 'blocked', 'review', 'done'], true)) {
                    $response->getBody()->write(json_encode(['error' => 'status must be one of: todo, in_progress, blocked, review, done']));
                    return $response->withHeader('Content-Type', 'application/json')->withStatus(400);
                }
                if (isset($fields['priority']) && !in_array($fields['priority'], ['low', 'medium', 'high', 'urgent'], true)) {
                    $response->getBody()->write(json_encode(['error' => 'priority must be one of: low, medium, high, urgent']));
                    return $response->withHeader('Content-Type', 'application/json')->withStatus(400);
                }
                if (array_key_exists('sprintId', $fields) && $fields['sprintId'] !== null && !preg_match(TaskRoutes::UUID_PATTERN, $fields['sprintId'])) {
                    $response->getBody()->write(json_encode(['error' => 'sprintId must be null or a valid UUID']));
                    return $response->withHeader('Content-Type', 'application/json')->withStatus(400);
                }
                if (array_key_exists('inSprintBacklog', $fields) && !is_bool($fields['inSprintBacklog'])) {
                    $response->getBody()->write(json_encode(['error' => 'inSprintBacklog must be a boolean']));
                    return $response->withHeader('Content-Type', 'application/json')->withStatus(400);
                }

                // Build dynamic SET clause
                $columnMap = [
                    'status' => 'status',
                    'priority' => 'priority',
                    'sprintId' => 'sprint_id',
                    'inSprintBacklog' => 'in_sprint_backlog',
                ];

                $setClauses = [];
                $setParams = [];
                foreach ($fields as $key => $value) {
                    $col = $columnMap[$key];
                    $setClauses[] = "{$col} = :{$col}";
                    $setParams[$col] = $key === 'inSprintBacklog' ? (int) $value : $value;
                }

                $in = TaskModel::buildInClause($data['taskIds'], 'tid');
                $setString = implode(', ', $setClauses);
                $sql = "UPDATE tasks SET {$setString} WHERE id IN ({$in['clause']}) AND deleted_at IS NULL";

                $db = Database::getInstance();
                $stmt = $db->prepare($sql);
                $stmt->execute(array_merge($setParams, $in['params']));

                $response->getBody()->write(json_encode(['count' => $stmt->rowCount()]));
                return $response->withHeader('Content-Type', 'application/json')->withStatus(200);
            });

            // POST /tasks/bulk-delete
            $group->post('/bulk-delete', function (Request $request, Response $response) {
                $data = $request->getParsedBody() ?? [];

                $errors = Validator::validate($data, [
                    'taskIds' => 'required|uuid_array',
                ]);

                if (!empty($errors)) {
                    return Validator::respondWithErrors($response, $errors);
                }

                if (empty($data['taskIds'])) {
                    $response->getBody()->write(json_encode(['error' => 'taskIds must be a non-empty array']));
                    return $response->withHeader('Content-Type', 'application/json')->withStatus(400);
                }

                $in = TaskModel::buildInClause($data['taskIds'], 'tid');
                $db = Database::getInstance();
                $stmt = $db->prepare("UPDATE tasks SET deleted_at = NOW() WHERE id IN ({$in['clause']}) AND deleted_at IS NULL");
                $stmt->execute($in['params']);

                $response->getBody()->write(json_encode(['count' => $stmt->rowCount()]));
                return $response->withHeader('Content-Type', 'application/json')->withStatus(200);
            });

            // ============================================================
            // COLLECTION ROUTES
            // ============================================================

            // GET /tasks — filtered list
            $group->get('', function (Request $request, Response $response) {
                $params = $request->getQueryParams();
                $userId = $request->getAttribute('userId');

                $conditions = ['t.deleted_at IS NULL'];
                $queryParams = [];

                // Filter: projectId
                if (!empty($params['projectId'])) {
                    $conditions[] = 't.project_id = :projectId';
                    $queryParams['projectId'] = $params['projectId'];
                }

                // Filter: status
                if (!empty($params['status'])) {
                    $conditions[] = 't.status = :status';
                    $queryParams['status'] = $params['status'];
                }

                // Filter: excludeCompleted — hide done tasks ("Show completed" off)
                if (($params['excludeCompleted'] ?? '') === 'true') {
                    $conditions[] = "t.status != 'done'";
                }

                // Filter: priority
                if (!empty($params['priority'])) {
                    $conditions[] = 't.priority = :priority';
                    $queryParams['priority'] = $params['priority'];
                }

                // Filter: assigneeId (supports 'me' shortcut)
                if (!empty($params['assigneeId'])) {
                    $actualAssigneeId = $params['assigneeId'] === 'me' ? $userId : $params['assigneeId'];
                    $conditions[] = 'EXISTS (SELECT 1 FROM task_assignees ta_filter WHERE ta_filter.task_id = t.id AND ta_filter.user_id = :assigneeId)';
                    $queryParams['assigneeId'] = $actualAssigneeId;
                }

                // Filter: labelId
                if (!empty($params['labelId'])) {
                    $conditions[] = 'EXISTS (SELECT 1 FROM task_labels tl_filter WHERE tl_filter.task_id = t.id AND tl_filter.label_id = :labelId)';
                    $queryParams['labelId'] = $params['labelId'];
                }

                // Filter: sprintId (supports 'null' string for unassigned)
                // The unassigned set IS the sprint backlog, so exclude tasks whose project
                // opted out of sprint planning (p.sprint_planning = 0) — they should not clutter it.
                if (array_key_exists('sprintId', $params)) {
                    if ($params['sprintId'] === 'null') {
                        $conditions[] = 't.sprint_id IS NULL';
                        $conditions[] = 'p.sprint_planning = 1';
                    } else {
                        $conditions[] = 't.sprint_id = :sprintId';
                        $queryParams['sprintId'] = $params['sprintId'];
                    }
                }

                // Filter: sprint=backlog
                if (($params['sprint'] ?? '') === 'backlog') {
                    $conditions[] = 't.in_sprint_backlog = 1';
                    $conditions[] = 't.sprint_id IS NULL';
                    $conditions[] = 'p.sprint_planning = 1';
                }

                // Sorting
                $sortBy = $params['sortBy'] ?? 'sortOrder';
                $sortDir = in_array($params['sortDir'] ?? 'asc', ['asc', 'desc']) ? ($params['sortDir'] ?? 'asc') : 'asc';

                $orderClause = match ($sortBy) {
                    'dueDate' => "CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END {$sortDir}, t.due_date {$sortDir}",
                    'priority' => "t.priority {$sortDir}",
                    'createdAt' => "t.created_at {$sortDir}",
                    'title' => "t.title {$sortDir}",
                    'status' => "t.status {$sortDir}",
                    default => "t.sort_order {$sortDir}, t.created_at DESC",
                };

                $db = Database::getInstance();
                $whereClause = implode(' AND ', $conditions);
                $sql = self::FETCH_QUERY . " WHERE {$whereClause} ORDER BY {$orderClause}";

                $stmt = $db->prepare($sql);
                $stmt->execute($queryParams);
                $taskRows = $stmt->fetchAll();

                $taskIds = array_column($taskRows, 'id');

                if (!empty($taskIds)) {
                    $relations = TaskModel::fetchRelationsForTasks($taskIds, [
                        'full' => true,
                        'includeLinks' => true,
                        'includeSprint' => true,
                        'creatorIds' => array_unique(array_column($taskRows, 'created_by_id')),
                        'sprintIds' => array_unique(array_filter(array_column($taskRows, 'sprint_id'))),
                    ]);

                    $tasks = array_map(function ($row) use ($relations) {
                        $taskId = $row['id'];
                        $taskRelations = [
                            'assignees' => $relations['assignees'][$taskId] ?? [],
                            'labels' => $relations['labels'][$taskId] ?? [],
                            'subtasks' => $relations['subtasks'][$taskId] ?? [],
                            'creator' => $relations['creators'][$row['created_by_id']] ?? null,
                            'links' => $relations['links'][$taskId] ?? [],
                            'sprint' => isset($row['sprint_id']) ? ($relations['sprints'][$row['sprint_id']] ?? null) : null,
                        ];
                        return TaskModel::mapTask($row, $taskRelations, true);
                    }, $taskRows);
                } else {
                    $tasks = [];
                }

                $response->getBody()->write(json_encode(['tasks' => $tasks]));
                return $response->withHeader('Content-Type', 'application/json')->withStatus(200);
            });

            // POST /tasks — create
            $group->post('', function (Request $request, Response $response) {
                $data = $request->getParsedBody() ?? [];

                $errors = Validator::validate($data, [
                    'title' => 'required|min:1|max:255',
                    'description' => 'optional|nullable',
                    'notes' => 'optional|nullable',
                    'status' => 'optional|in:todo,in_progress,blocked,review,done',
                    'priority' => 'optional|in:low,medium,high,urgent',
                    'dueDate' => 'optional|nullable|iso8601',
                    'startDate' => 'optional|nullable|iso8601',
                    'recurrence' => 'optional|nullable|in:daily,weekly,biweekly,monthly',
                    'effort' => 'optional|nullable',
                    'sprintId' => 'optional|nullable|uuid',
                    'projectId' => 'required|uuid',
                    'assigneeIds' => 'optional|uuid_array',
                    'labelIds' => 'optional|uuid_array',
                    'notifyEnabled' => 'optional|boolean',
                ]);

                if (!empty($errors)) {
                    return Validator::respondWithErrors($response, $errors);
                }

                // Effort validation (manual — Validator doesn't have int-in rule)
                if (isset($data['effort']) && $data['effort'] !== null) {
                    if (!in_array((int) $data['effort'], [1, 2, 4, 8], true)) {
                        $response->getBody()->write(json_encode([
                            'errors' => [['field' => 'effort', 'message' => 'effort must be one of: 1, 2, 4, 8']],
                        ]));
                        return $response->withHeader('Content-Type', 'application/json')->withStatus(400);
                    }
                }

                // Verify project exists (and read its notification default to seed the task flag)
                $db = Database::getInstance();
                $stmt = $db->prepare('SELECT id, default_notify_enabled FROM projects WHERE id = :id');
                $stmt->execute(['id' => $data['projectId']]);
                $project = $stmt->fetch();
                if (!$project) {
                    $response->getBody()->write(json_encode(['error' => 'Project not found']));
                    return $response->withHeader('Content-Type', 'application/json')->withStatus(404);
                }

                // Seed the task-wide flag from the project default (PRD §9.2), unless explicitly set.
                $notifyEnabled = array_key_exists('notifyEnabled', $data)
                    ? ($data['notifyEnabled'] ? 1 : 0)
                    : (int) $project['default_notify_enabled'];

                $userId = $request->getAttribute('userId');
                $id = Uuid::uuid4()->toString();
                $sortOrder = TaskModel::getNextSortOrder($data['projectId']);

                $assigneeIds = $data['assigneeIds'] ?? [];
                $labelIds = $data['labelIds'] ?? [];

                $db->beginTransaction();
                try {
                    $stmt = $db->prepare(
                        'INSERT INTO tasks (id, title, description, notes, status, priority, effort, due_date, start_date, sort_order, recurrence, sprint_id, project_id, created_by_id, notify_enabled)
                         VALUES (:id, :title, :description, :notes, :status, :priority, :effort, :due_date, :start_date, :sort_order, :recurrence, :sprint_id, :project_id, :created_by_id, :notify_enabled)'
                    );
                    $stmt->execute([
                        'id' => $id,
                        'title' => $data['title'],
                        'description' => $data['description'] ?? null,
                        'notes' => $data['notes'] ?? null,
                        'status' => $data['status'] ?? 'todo',
                        'priority' => $data['priority'] ?? 'medium',
                        'effort' => isset($data['effort']) && $data['effort'] !== null ? (int) $data['effort'] : null,
                        'due_date' => Validator::toMySQLDate($data['dueDate'] ?? null),
                        'start_date' => Validator::toMySQLDate($data['startDate'] ?? null),
                        'sort_order' => $sortOrder,
                        'recurrence' => $data['recurrence'] ?? null,
                        'sprint_id' => $data['sprintId'] ?? null,
                        'project_id' => $data['projectId'],
                        'created_by_id' => $userId,
                        'notify_enabled' => $notifyEnabled,
                    ]);

                    // Insert assignees
                    if (!empty($assigneeIds)) {
                        $stmt = $db->prepare(
                            'INSERT INTO task_assignees (id, task_id, user_id) VALUES (:id, :task_id, :user_id)'
                        );
                        foreach ($assigneeIds as $assigneeUserId) {
                            $stmt->execute([
                                'id' => Uuid::uuid4()->toString(),
                                'task_id' => $id,
                                'user_id' => $assigneeUserId,
                            ]);
                        }
                    }

                    // Insert labels
                    if (!empty($labelIds)) {
                        $stmt = $db->prepare(
                            'INSERT INTO task_labels (id, task_id, label_id) VALUES (:id, :task_id, :label_id)'
                        );
                        foreach ($labelIds as $labelId) {
                            $stmt->execute([
                                'id' => Uuid::uuid4()->toString(),
                                'task_id' => $id,
                                'label_id' => $labelId,
                            ]);
                        }
                    }

                    $db->commit();
                } catch (\Exception $e) {
                    $db->rollBack();
                    throw $e;
                }

                // Send assignment notifications (single decision point — PRD §5/§8).
                NotificationService::dispatchForTaskSave(
                    $db,
                    [
                        'id' => $id,
                        'title' => $data['title'],
                        'project_id' => $data['projectId'],
                        'notify_enabled' => $notifyEnabled,
                    ],
                    $userId,
                    [],          // no prior assignees on create
                    $assigneeIds,
                    false,       // no "changed" event on create
                    true         // isCreate
                );

                // Re-fetch the created task with all relations
                $stmt = $db->prepare(self::FETCH_QUERY . ' WHERE t.id = :id');
                $stmt->execute(['id' => $id]);
                $row = $stmt->fetch();

                $relations = TaskModel::fetchRelationsForTasks([$id], [
                    'full' => true,
                    'includeLinks' => true,
                    'includeSprint' => true,
                    'creatorIds' => [$userId],
                    'sprintIds' => $row['sprint_id'] ? [$row['sprint_id']] : [],
                ]);

                $taskRelations = [
                    'assignees' => $relations['assignees'][$id] ?? [],
                    'labels' => $relations['labels'][$id] ?? [],
                    'subtasks' => $relations['subtasks'][$id] ?? [],
                    'creator' => $relations['creators'][$userId] ?? null,
                    'links' => $relations['links'][$id] ?? [],
                    'sprint' => $row['sprint_id'] ? ($relations['sprints'][$row['sprint_id']] ?? null) : null,
                ];

                $task = TaskModel::mapTask($row, $taskRelations, true);

                $response->getBody()->write(json_encode(['task' => $task]));
                return $response->withHeader('Content-Type', 'application/json')->withStatus(201);
            });

            // ============================================================
            // PARAMETERIZED ROUTES (/{id} and /{id}/*)
            // ============================================================

            // PUT /tasks/{id}/move — must be before /{id} PUT
            $group->put('/{id}/move', function (Request $request, Response $response, array $args) {
                $id = $args['id'];

                if (!preg_match(TaskRoutes::UUID_PATTERN, $id)) {
                    $response->getBody()->write(json_encode(['error' => 'id must be a valid UUID']));
                    return $response->withHeader('Content-Type', 'application/json')->withStatus(400);
                }

                $data = $request->getParsedBody() ?? [];

                $errors = Validator::validate($data, [
                    'projectId' => 'required|uuid',
                ]);

                if (!empty($errors)) {
                    return Validator::respondWithErrors($response, $errors);
                }

                $db = Database::getInstance();

                // Verify task exists
                $stmt = $db->prepare('SELECT id FROM tasks WHERE id = :id AND deleted_at IS NULL');
                $stmt->execute(['id' => $id]);
                if (!$stmt->fetch()) {
                    $response->getBody()->write(json_encode(['error' => 'Task not found']));
                    return $response->withHeader('Content-Type', 'application/json')->withStatus(404);
                }

                // Verify target project exists
                $stmt = $db->prepare('SELECT id FROM projects WHERE id = :id');
                $stmt->execute(['id' => $data['projectId']]);
                if (!$stmt->fetch()) {
                    $response->getBody()->write(json_encode(['error' => 'Target project not found']));
                    return $response->withHeader('Content-Type', 'application/json')->withStatus(404);
                }

                // Get next sort order in target project
                $sortOrder = TaskModel::getNextSortOrder($data['projectId']);

                // Move task
                $stmt = $db->prepare('UPDATE tasks SET project_id = :projectId, sort_order = :sortOrder WHERE id = :id');
                $stmt->execute([
                    'projectId' => $data['projectId'],
                    'sortOrder' => $sortOrder,
                    'id' => $id,
                ]);

                // Re-fetch with full relations
                $stmt = $db->prepare(self::FETCH_QUERY . ' WHERE t.id = :id');
                $stmt->execute(['id' => $id]);
                $row = $stmt->fetch();

                $relations = TaskModel::fetchRelationsForTasks([$id], [
                    'full' => true,
                    'includeLinks' => true,
                    'includeSprint' => true,
                    'creatorIds' => [$row['created_by_id']],
                    'sprintIds' => $row['sprint_id'] ? [$row['sprint_id']] : [],
                ]);

                $taskRelations = [
                    'assignees' => $relations['assignees'][$id] ?? [],
                    'labels' => $relations['labels'][$id] ?? [],
                    'subtasks' => $relations['subtasks'][$id] ?? [],
                    'creator' => $relations['creators'][$row['created_by_id']] ?? null,
                    'links' => $relations['links'][$id] ?? [],
                    'sprint' => $row['sprint_id'] ? ($relations['sprints'][$row['sprint_id']] ?? null) : null,
                ];

                $task = TaskModel::mapTask($row, $taskRelations, true);

                $response->getBody()->write(json_encode(['task' => $task]));
                return $response->withHeader('Content-Type', 'application/json')->withStatus(200);
            });

            // GET /tasks/{id}
            $group->get('/{id}', function (Request $request, Response $response, array $args) {
                $id = $args['id'];

                if (!preg_match(TaskRoutes::UUID_PATTERN, $id)) {
                    $response->getBody()->write(json_encode(['error' => 'id must be a valid UUID']));
                    return $response->withHeader('Content-Type', 'application/json')->withStatus(400);
                }

                $db = Database::getInstance();
                $stmt = $db->prepare(self::FETCH_QUERY . ' WHERE t.id = :id AND t.deleted_at IS NULL');
                $stmt->execute(['id' => $id]);
                $row = $stmt->fetch();

                if (!$row) {
                    $response->getBody()->write(json_encode(['error' => 'Task not found']));
                    return $response->withHeader('Content-Type', 'application/json')->withStatus(404);
                }

                $relations = TaskModel::fetchRelationsForTasks([$id], [
                    'full' => true,
                    'includeLinks' => true,
                    'includeSprint' => true,
                    'creatorIds' => [$row['created_by_id']],
                    'sprintIds' => $row['sprint_id'] ? [$row['sprint_id']] : [],
                ]);

                $taskRelations = [
                    'assignees' => $relations['assignees'][$id] ?? [],
                    'labels' => $relations['labels'][$id] ?? [],
                    'subtasks' => $relations['subtasks'][$id] ?? [],
                    'creator' => $relations['creators'][$row['created_by_id']] ?? null,
                    'links' => $relations['links'][$id] ?? [],
                    'sprint' => $row['sprint_id'] ? ($relations['sprints'][$row['sprint_id']] ?? null) : null,
                ];

                $task = TaskModel::mapTask($row, $taskRelations, true);

                $response->getBody()->write(json_encode(['task' => $task]));
                return $response->withHeader('Content-Type', 'application/json')->withStatus(200);
            });

            // PUT /tasks/{id} — update with recurrence clone
            $group->put('/{id}', function (Request $request, Response $response, array $args) {
                $id = $args['id'];

                if (!preg_match(TaskRoutes::UUID_PATTERN, $id)) {
                    $response->getBody()->write(json_encode(['error' => 'id must be a valid UUID']));
                    return $response->withHeader('Content-Type', 'application/json')->withStatus(400);
                }

                $data = $request->getParsedBody() ?? [];

                $errors = Validator::validate($data, [
                    'title' => 'optional|min:1|max:255',
                    'description' => 'optional|nullable',
                    'notes' => 'optional|nullable',
                    'status' => 'optional|in:todo,in_progress,blocked,review,done',
                    'priority' => 'optional|in:low,medium,high,urgent',
                    'dueDate' => 'optional|nullable|iso8601',
                    'startDate' => 'optional|nullable|iso8601',
                    'recurrence' => 'optional|nullable|in:daily,weekly,biweekly,monthly',
                    'effort' => 'optional|nullable',
                    'sprintId' => 'optional|nullable|uuid',
                    'assigneeIds' => 'optional|uuid_array',
                    'labelIds' => 'optional|uuid_array',
                    'notifyEnabled' => 'optional|boolean',
                ]);

                if (!empty($errors)) {
                    return Validator::respondWithErrors($response, $errors);
                }

                // Effort validation (same as POST)
                if (isset($data['effort']) && $data['effort'] !== null) {
                    if (!in_array((int) $data['effort'], [1, 2, 4, 8], true)) {
                        $response->getBody()->write(json_encode([
                            'errors' => [['field' => 'effort', 'message' => 'effort must be one of: 1, 2, 4, 8']],
                        ]));
                        return $response->withHeader('Content-Type', 'application/json')->withStatus(400);
                    }
                }

                $db = Database::getInstance();

                // Fetch existing task
                $stmt = $db->prepare('SELECT * FROM tasks WHERE id = :id AND deleted_at IS NULL');
                $stmt->execute(['id' => $id]);
                $existingTask = $stmt->fetch();

                if (!$existingTask) {
                    $response->getBody()->write(json_encode(['error' => 'Task not found']));
                    return $response->withHeader('Content-Type', 'application/json')->withStatus(404);
                }

                // Snapshot existing assignees and labels for potential clone (pre-update)
                $stmt = $db->prepare('SELECT user_id FROM task_assignees WHERE task_id = :taskId');
                $stmt->execute(['taskId' => $id]);
                $existingAssigneeRows = $stmt->fetchAll();

                $stmt = $db->prepare('SELECT label_id FROM task_labels WHERE task_id = :taskId');
                $stmt->execute(['taskId' => $id]);
                $existingLabelRows = $stmt->fetchAll();

                // Build dynamic update
                $updates = [];
                $updateParams = ['id' => $id];

                if (isset($data['title'])) {
                    $updates[] = 'title = :title';
                    $updateParams['title'] = $data['title'];
                }
                if (array_key_exists('description', $data)) {
                    $updates[] = 'description = :description';
                    $updateParams['description'] = $data['description'];
                }
                if (array_key_exists('notes', $data)) {
                    $updates[] = 'notes = :notes';
                    $updateParams['notes'] = $data['notes'];
                }
                if (isset($data['status'])) {
                    $updates[] = 'status = :status';
                    $updateParams['status'] = $data['status'];
                }
                if (isset($data['priority'])) {
                    $updates[] = 'priority = :priority';
                    $updateParams['priority'] = $data['priority'];
                }
                if (array_key_exists('dueDate', $data)) {
                    $updates[] = 'due_date = :due_date';
                    $updateParams['due_date'] = Validator::toMySQLDate($data['dueDate']);
                }
                if (array_key_exists('startDate', $data)) {
                    $updates[] = 'start_date = :start_date';
                    $updateParams['start_date'] = Validator::toMySQLDate($data['startDate']);
                }
                if (array_key_exists('recurrence', $data)) {
                    $updates[] = 'recurrence = :recurrence';
                    $updateParams['recurrence'] = $data['recurrence'];
                }
                if (array_key_exists('effort', $data)) {
                    $updates[] = 'effort = :effort';
                    $updateParams['effort'] = $data['effort'] !== null ? (int) $data['effort'] : null;
                }
                if (array_key_exists('sprintId', $data)) {
                    $updates[] = 'sprint_id = :sprint_id';
                    $updateParams['sprint_id'] = $data['sprintId'];
                }
                if (array_key_exists('notifyEnabled', $data)) {
                    // Toggling the task flag is NOT itself a notifiable change (PRD §10.5).
                    $updates[] = 'notify_enabled = :notify_enabled';
                    $updateParams['notify_enabled'] = $data['notifyEnabled'] ? 1 : 0;
                }

                $userId = $request->getAttribute('userId');
                $clonedTaskId = null;

                $db->beginTransaction();
                try {
                    // Update task fields
                    if (!empty($updates)) {
                        $sql = 'UPDATE tasks SET ' . implode(', ', $updates) . ' WHERE id = :id';
                        $stmt = $db->prepare($sql);
                        $stmt->execute($updateParams);
                    }

                    // Replace assignees if provided
                    if (array_key_exists('assigneeIds', $data)) {
                        $stmt = $db->prepare('DELETE FROM task_assignees WHERE task_id = :taskId');
                        $stmt->execute(['taskId' => $id]);

                        $assigneeIds = $data['assigneeIds'] ?? [];
                        if (!empty($assigneeIds)) {
                            $stmt = $db->prepare(
                                'INSERT INTO task_assignees (id, task_id, user_id) VALUES (:id, :task_id, :user_id)'
                            );
                            foreach ($assigneeIds as $assigneeUserId) {
                                $stmt->execute([
                                    'id' => Uuid::uuid4()->toString(),
                                    'task_id' => $id,
                                    'user_id' => $assigneeUserId,
                                ]);
                            }
                        }
                    }

                    // Replace labels if provided
                    if (array_key_exists('labelIds', $data)) {
                        $stmt = $db->prepare('DELETE FROM task_labels WHERE task_id = :taskId');
                        $stmt->execute(['taskId' => $id]);

                        $labelIds = $data['labelIds'] ?? [];
                        if (!empty($labelIds)) {
                            $stmt = $db->prepare(
                                'INSERT INTO task_labels (id, task_id, label_id) VALUES (:id, :task_id, :label_id)'
                            );
                            foreach ($labelIds as $labelId) {
                                $stmt->execute([
                                    'id' => Uuid::uuid4()->toString(),
                                    'task_id' => $id,
                                    'label_id' => $labelId,
                                ]);
                            }
                        }
                    }

                    // --- Recurrence clone logic ---
                    $newStatus = $data['status'] ?? $existingTask['status'];
                    $recurrence = array_key_exists('recurrence', $data) ? $data['recurrence'] : $existingTask['recurrence'];

                    if (
                        $newStatus === 'done'
                        && $recurrence !== null
                        && $existingTask['status'] !== 'done'
                    ) {
                        // Calculate next due date
                        $baseDate = $existingTask['due_date']
                            ? new \DateTime($existingTask['due_date'])
                            : new \DateTime();

                        $nextDueDate = clone $baseDate;
                        match ($recurrence) {
                            'daily' => $nextDueDate->modify('+1 day'),
                            'weekly' => $nextDueDate->modify('+7 days'),
                            'biweekly' => $nextDueDate->modify('+14 days'),
                            'monthly' => $nextDueDate->modify('+1 month'),
                            default => null,
                        };

                        // Shift start date by the same duration
                        $nextStartDate = null;
                        if ($existingTask['start_date'] && $existingTask['due_date']) {
                            $originalStart = new \DateTime($existingTask['start_date']);
                            $originalDue = new \DateTime($existingTask['due_date']);
                            $duration = $originalStart->diff($originalDue);
                            $nextStartDate = clone $nextDueDate;
                            $nextStartDate->sub($duration);
                        }

                        $clonedTaskId = Uuid::uuid4()->toString();
                        $cloneSortOrder = TaskModel::getNextSortOrder($existingTask['project_id']);

                        $stmt = $db->prepare(
                            'INSERT INTO tasks (id, title, description, notes, status, priority, effort, due_date, start_date, sort_order, recurrence, sprint_id, project_id, created_by_id, notify_enabled)
                             VALUES (:id, :title, :description, :notes, :status, :priority, :effort, :due_date, :start_date, :sort_order, :recurrence, :sprint_id, :project_id, :created_by_id, :notify_enabled)'
                        );
                        $stmt->execute([
                            'id' => $clonedTaskId,
                            'title' => $existingTask['title'],
                            'description' => $existingTask['description'],
                            'notes' => $existingTask['notes'],
                            'status' => 'todo',
                            'priority' => $existingTask['priority'],
                            'effort' => $existingTask['effort'],
                            'due_date' => $nextDueDate->format('Y-m-d H:i:s'),
                            'start_date' => $nextStartDate ? $nextStartDate->format('Y-m-d H:i:s') : null,
                            'sort_order' => $cloneSortOrder,
                            'recurrence' => $recurrence,
                            'sprint_id' => $existingTask['sprint_id'],
                            'project_id' => $existingTask['project_id'],
                            'created_by_id' => $userId,
                            'notify_enabled' => (int) $existingTask['notify_enabled'],
                        ]);

                        // Clone pre-update assignees
                        if (!empty($existingAssigneeRows)) {
                            $stmt = $db->prepare(
                                'INSERT INTO task_assignees (id, task_id, user_id) VALUES (:id, :task_id, :user_id)'
                            );
                            foreach ($existingAssigneeRows as $a) {
                                $stmt->execute([
                                    'id' => Uuid::uuid4()->toString(),
                                    'task_id' => $clonedTaskId,
                                    'user_id' => $a['user_id'],
                                ]);
                            }
                        }

                        // Clone pre-update labels
                        if (!empty($existingLabelRows)) {
                            $stmt = $db->prepare(
                                'INSERT INTO task_labels (id, task_id, label_id) VALUES (:id, :task_id, :label_id)'
                            );
                            foreach ($existingLabelRows as $l) {
                                $stmt->execute([
                                    'id' => Uuid::uuid4()->toString(),
                                    'task_id' => $clonedTaskId,
                                    'label_id' => $l['label_id'],
                                ]);
                            }
                        }
                    }

                    $db->commit();
                } catch (\Exception $e) {
                    $db->rollBack();
                    throw $e;
                }

                // Dispatch notifications (Assigned / Unassigned / Changed) — single decision point.
                // §7 significant fields: status, priority, due_date. Title/notes/etc. are cosmetic.
                $significantChanged = false;
                if (isset($data['status']) && $data['status'] !== $existingTask['status']) {
                    $significantChanged = true;
                }
                if (isset($data['priority']) && $data['priority'] !== $existingTask['priority']) {
                    $significantChanged = true;
                }
                if (array_key_exists('dueDate', $data)
                    && Validator::toMySQLDate($data['dueDate']) !== $existingTask['due_date']) {
                    $significantChanged = true;
                }

                $oldAssigneeIds = array_column($existingAssigneeRows, 'user_id');
                $newAssigneeIds = array_key_exists('assigneeIds', $data)
                    ? ($data['assigneeIds'] ?? [])
                    : $oldAssigneeIds; // assignees unchanged when not in the payload

                $effectiveNotifyEnabled = array_key_exists('notifyEnabled', $data)
                    ? ($data['notifyEnabled'] ? 1 : 0)
                    : (int) $existingTask['notify_enabled'];

                NotificationService::dispatchForTaskSave(
                    $db,
                    [
                        'id' => $id,
                        'title' => $data['title'] ?? $existingTask['title'],
                        'project_id' => $existingTask['project_id'],
                        'notify_enabled' => $effectiveNotifyEnabled,
                    ],
                    $userId,
                    $oldAssigneeIds,
                    $newAssigneeIds,
                    $significantChanged,
                    false
                );

                // Re-fetch updated task with full relations
                $stmt = $db->prepare(self::FETCH_QUERY . ' WHERE t.id = :id');
                $stmt->execute(['id' => $id]);
                $row = $stmt->fetch();

                $relations = TaskModel::fetchRelationsForTasks([$id], [
                    'full' => true,
                    'includeLinks' => true,
                    'includeSprint' => true,
                    'creatorIds' => [$row['created_by_id']],
                    'sprintIds' => $row['sprint_id'] ? [$row['sprint_id']] : [],
                ]);

                $taskRelations = [
                    'assignees' => $relations['assignees'][$id] ?? [],
                    'labels' => $relations['labels'][$id] ?? [],
                    'subtasks' => $relations['subtasks'][$id] ?? [],
                    'creator' => $relations['creators'][$row['created_by_id']] ?? null,
                    'links' => $relations['links'][$id] ?? [],
                    'sprint' => $row['sprint_id'] ? ($relations['sprints'][$row['sprint_id']] ?? null) : null,
                ];
                $task = TaskModel::mapTask($row, $taskRelations, true);

                // Fetch clone if created
                $clonedTask = null;
                if ($clonedTaskId) {
                    $stmt = $db->prepare(self::FETCH_QUERY . ' WHERE t.id = :id');
                    $stmt->execute(['id' => $clonedTaskId]);
                    $cloneRow = $stmt->fetch();

                    if ($cloneRow) {
                        $cloneRelations = TaskModel::fetchRelationsForTasks([$clonedTaskId], [
                            'full' => true,
                            'includeLinks' => false,
                            'includeSprint' => true,
                            'creatorIds' => [$cloneRow['created_by_id']],
                            'sprintIds' => $cloneRow['sprint_id'] ? [$cloneRow['sprint_id']] : [],
                        ]);

                        $cloneTaskRelations = [
                            'assignees' => $cloneRelations['assignees'][$clonedTaskId] ?? [],
                            'labels' => $cloneRelations['labels'][$clonedTaskId] ?? [],
                            'subtasks' => $cloneRelations['subtasks'][$clonedTaskId] ?? [],
                            'creator' => $cloneRelations['creators'][$cloneRow['created_by_id']] ?? null,
                            'sprint' => $cloneRow['sprint_id'] ? ($cloneRelations['sprints'][$cloneRow['sprint_id']] ?? null) : null,
                        ];
                        $clonedTask = TaskModel::mapTask($cloneRow, $cloneTaskRelations, true);
                    }
                }

                $response->getBody()->write(json_encode(['task' => $task, 'clonedTask' => $clonedTask]));
                return $response->withHeader('Content-Type', 'application/json')->withStatus(200);
            });

            // DELETE /tasks/{id} — soft-delete
            $group->delete('/{id}', function (Request $request, Response $response, array $args) {
                $id = $args['id'];

                if (!preg_match(TaskRoutes::UUID_PATTERN, $id)) {
                    $response->getBody()->write(json_encode(['error' => 'id must be a valid UUID']));
                    return $response->withHeader('Content-Type', 'application/json')->withStatus(400);
                }

                $db = Database::getInstance();

                $stmt = $db->prepare('SELECT id FROM tasks WHERE id = :id AND deleted_at IS NULL');
                $stmt->execute(['id' => $id]);
                if (!$stmt->fetch()) {
                    $response->getBody()->write(json_encode(['error' => 'Task not found']));
                    return $response->withHeader('Content-Type', 'application/json')->withStatus(404);
                }

                $stmt = $db->prepare('UPDATE tasks SET deleted_at = NOW() WHERE id = :id');
                $stmt->execute(['id' => $id]);

                $response->getBody()->write(json_encode(['message' => 'Task deleted successfully']));
                return $response->withHeader('Content-Type', 'application/json')->withStatus(200);
            });

            // ============================================================
            // SUBTASK ROUTES
            // ============================================================

            // POST /tasks/{id}/subtasks
            $group->post('/{id}/subtasks', function (Request $request, Response $response, array $args) {
                $id = $args['id'];

                if (!preg_match(TaskRoutes::UUID_PATTERN, $id)) {
                    $response->getBody()->write(json_encode(['error' => 'id must be a valid UUID']));
                    return $response->withHeader('Content-Type', 'application/json')->withStatus(400);
                }

                $data = $request->getParsedBody() ?? [];

                $errors = Validator::validate($data, [
                    'title' => 'required|min:1|max:255',
                ]);

                if (!empty($errors)) {
                    return Validator::respondWithErrors($response, $errors);
                }

                $db = Database::getInstance();

                // Verify parent task exists and is not deleted
                $stmt = $db->prepare('SELECT id FROM tasks WHERE id = :id AND deleted_at IS NULL');
                $stmt->execute(['id' => $id]);
                if (!$stmt->fetch()) {
                    $response->getBody()->write(json_encode(['error' => 'Task not found']));
                    return $response->withHeader('Content-Type', 'application/json')->withStatus(404);
                }

                // Get next sort_order
                $stmt = $db->prepare('SELECT MAX(sort_order) AS max_order FROM subtasks WHERE task_id = :taskId');
                $stmt->execute(['taskId' => $id]);
                $row = $stmt->fetch();
                $sortOrder = ($row['max_order'] !== null) ? (int) $row['max_order'] + 1 : 0;

                // Insert subtask
                $subtaskId = Uuid::uuid4()->toString();
                $stmt = $db->prepare(
                    'INSERT INTO subtasks (id, title, sort_order, task_id) VALUES (:id, :title, :sortOrder, :taskId)'
                );
                $stmt->execute([
                    'id' => $subtaskId,
                    'title' => $data['title'],
                    'sortOrder' => $sortOrder,
                    'taskId' => $id,
                ]);

                // Re-fetch
                $stmt = $db->prepare('SELECT id, title, completed, sort_order, task_id, created_at FROM subtasks WHERE id = :id');
                $stmt->execute(['id' => $subtaskId]);
                $row = $stmt->fetch();

                $subtask = [
                    'id' => $row['id'],
                    'title' => $row['title'],
                    'completed' => (bool) $row['completed'],
                    'sortOrder' => (int) $row['sort_order'],
                    'taskId' => $row['task_id'],
                    'createdAt' => date('c', strtotime($row['created_at'])),
                ];

                $response->getBody()->write(json_encode(['subtask' => $subtask]));
                return $response->withHeader('Content-Type', 'application/json')->withStatus(201);
            });

            // PUT /tasks/{taskId}/subtasks/{subtaskId}
            $group->put('/{taskId}/subtasks/{subtaskId}', function (Request $request, Response $response, array $args) {
                $taskId = $args['taskId'];
                $subtaskId = $args['subtaskId'];

                if (!preg_match(TaskRoutes::UUID_PATTERN, $taskId)) {
                    $response->getBody()->write(json_encode(['error' => 'taskId must be a valid UUID']));
                    return $response->withHeader('Content-Type', 'application/json')->withStatus(400);
                }
                if (!preg_match(TaskRoutes::UUID_PATTERN, $subtaskId)) {
                    $response->getBody()->write(json_encode(['error' => 'subtaskId must be a valid UUID']));
                    return $response->withHeader('Content-Type', 'application/json')->withStatus(400);
                }

                $data = $request->getParsedBody() ?? [];

                $errors = Validator::validate($data, [
                    'title' => 'optional|min:1|max:255',
                    'completed' => 'optional|boolean',
                ]);

                if (!empty($errors)) {
                    return Validator::respondWithErrors($response, $errors);
                }

                if (!array_key_exists('title', $data) && !array_key_exists('completed', $data)) {
                    $response->getBody()->write(json_encode(['error' => 'At least one field (title or completed) must be provided']));
                    return $response->withHeader('Content-Type', 'application/json')->withStatus(400);
                }

                $db = Database::getInstance();

                // Verify subtask exists and belongs to task
                $stmt = $db->prepare('SELECT id FROM subtasks WHERE id = :subtaskId AND task_id = :taskId');
                $stmt->execute(['subtaskId' => $subtaskId, 'taskId' => $taskId]);
                if (!$stmt->fetch()) {
                    $response->getBody()->write(json_encode(['error' => 'Subtask not found']));
                    return $response->withHeader('Content-Type', 'application/json')->withStatus(404);
                }

                // Build dynamic UPDATE
                $setClauses = [];
                $params = ['subtaskId' => $subtaskId];

                if (array_key_exists('title', $data)) {
                    $setClauses[] = 'title = :title';
                    $params['title'] = $data['title'];
                }
                if (array_key_exists('completed', $data)) {
                    $setClauses[] = 'completed = :completed';
                    $params['completed'] = (int) $data['completed'];
                }

                $setString = implode(', ', $setClauses);
                $stmt = $db->prepare("UPDATE subtasks SET {$setString} WHERE id = :subtaskId");
                $stmt->execute($params);

                // Re-fetch
                $stmt = $db->prepare('SELECT id, title, completed, sort_order, task_id, created_at FROM subtasks WHERE id = :id');
                $stmt->execute(['id' => $subtaskId]);
                $row = $stmt->fetch();

                $subtask = [
                    'id' => $row['id'],
                    'title' => $row['title'],
                    'completed' => (bool) $row['completed'],
                    'sortOrder' => (int) $row['sort_order'],
                    'taskId' => $row['task_id'],
                    'createdAt' => date('c', strtotime($row['created_at'])),
                ];

                $response->getBody()->write(json_encode(['subtask' => $subtask]));
                return $response->withHeader('Content-Type', 'application/json')->withStatus(200);
            });

            // DELETE /tasks/{taskId}/subtasks/{subtaskId}
            $group->delete('/{taskId}/subtasks/{subtaskId}', function (Request $request, Response $response, array $args) {
                $taskId = $args['taskId'];
                $subtaskId = $args['subtaskId'];

                if (!preg_match(TaskRoutes::UUID_PATTERN, $taskId)) {
                    $response->getBody()->write(json_encode(['error' => 'taskId must be a valid UUID']));
                    return $response->withHeader('Content-Type', 'application/json')->withStatus(400);
                }
                if (!preg_match(TaskRoutes::UUID_PATTERN, $subtaskId)) {
                    $response->getBody()->write(json_encode(['error' => 'subtaskId must be a valid UUID']));
                    return $response->withHeader('Content-Type', 'application/json')->withStatus(400);
                }

                $db = Database::getInstance();

                // Verify subtask exists and belongs to task
                $stmt = $db->prepare('SELECT id FROM subtasks WHERE id = :subtaskId AND task_id = :taskId');
                $stmt->execute(['subtaskId' => $subtaskId, 'taskId' => $taskId]);
                if (!$stmt->fetch()) {
                    $response->getBody()->write(json_encode(['error' => 'Subtask not found']));
                    return $response->withHeader('Content-Type', 'application/json')->withStatus(404);
                }

                $stmt = $db->prepare('DELETE FROM subtasks WHERE id = :subtaskId');
                $stmt->execute(['subtaskId' => $subtaskId]);

                $response->getBody()->write(json_encode(['message' => 'Subtask deleted successfully']));
                return $response->withHeader('Content-Type', 'application/json')->withStatus(200);
            });

        })->add(new AuthMiddleware());
    }
}
