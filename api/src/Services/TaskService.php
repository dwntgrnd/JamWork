<?php

namespace JamWork\Services;

use JamWork\Lib\Database;
use JamWork\Lib\NotificationService;
use JamWork\Lib\Validator;
use JamWork\Models\TaskModel;
use PDO;
use Ramsey\Uuid\Uuid;

/**
 * Business/data logic for the /tasks endpoints. Routes handle HTTP concerns
 * (parsing, input validation, response shaping); this service performs the
 * operations and returns plain data, raising ServiceException for not-found
 * cases. Behavior is identical to the pre-extraction route handlers.
 */
class TaskService
{
    private const FETCH_QUERY = '
        SELECT t.*,
               p.id AS project_rel_id, p.name AS project_rel_name
        FROM tasks t
        LEFT JOIN projects p ON t.project_id = p.id
    ';

    /** PUT /tasks/reorder — set sort_order to the position of each id. */
    public static function reorder(array $taskIds): void
    {
        $db = Database::getInstance();
        $db->beginTransaction();
        try {
            $stmt = $db->prepare('UPDATE tasks SET sort_order = :sortOrder WHERE id = :id AND deleted_at IS NULL');
            foreach ($taskIds as $i => $taskId) {
                $stmt->execute(['sortOrder' => $i, 'id' => $taskId]);
            }
            $db->commit();
        } catch (\Exception $e) {
            $db->rollBack();
            throw $e;
        }
    }

    /**
     * PUT /tasks/bulk-update — apply validated fields to many tasks.
     * @return int number of rows updated
     */
    public static function bulkUpdate(array $taskIds, array $fields): int
    {
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

        // Maintain completed_at when bulk-setting status (CC30a). Order-independent:
        // keys off the new status value, not the column being updated in the same statement.
        if (array_key_exists('status', $fields)) {
            $setClauses[] = $fields['status'] === 'done'
                ? 'completed_at = CASE WHEN completed_at IS NULL THEN NOW() ELSE completed_at END'
                : 'completed_at = NULL';
        }

        $in = TaskModel::buildInClause($taskIds, 'tid');
        $setString = implode(', ', $setClauses);
        $sql = "UPDATE tasks SET {$setString} WHERE id IN ({$in['clause']}) AND deleted_at IS NULL";

        $db = Database::getInstance();
        $stmt = $db->prepare($sql);
        $stmt->execute(array_merge($setParams, $in['params']));

        return $stmt->rowCount();
    }

    /** POST /tasks/bulk-delete — soft-delete many tasks. @return int rows affected */
    public static function bulkDelete(array $taskIds): int
    {
        $in = TaskModel::buildInClause($taskIds, 'tid');
        $db = Database::getInstance();
        $stmt = $db->prepare("UPDATE tasks SET deleted_at = NOW() WHERE id IN ({$in['clause']}) AND deleted_at IS NULL");
        $stmt->execute($in['params']);

        return $stmt->rowCount();
    }

    /** GET /tasks — filtered, sorted list of mapped tasks. */
    public static function listTasks(array $params, ?string $userId): array
    {
        $conditions = ['t.deleted_at IS NULL'];
        $queryParams = [];

        if (!empty($params['projectId'])) {
            $conditions[] = 't.project_id = :projectId';
            $queryParams['projectId'] = $params['projectId'];
        }

        if (!empty($params['status'])) {
            $conditions[] = 't.status = :status';
            $queryParams['status'] = $params['status'];
        }

        if (($params['excludeCompleted'] ?? '') === 'true') {
            $conditions[] = "t.status != 'done'";
        }

        if (!empty($params['priority'])) {
            $conditions[] = 't.priority = :priority';
            $queryParams['priority'] = $params['priority'];
        }

        if (!empty($params['assigneeId'])) {
            $actualAssigneeId = $params['assigneeId'] === 'me' ? $userId : $params['assigneeId'];
            $conditions[] = 'EXISTS (SELECT 1 FROM task_assignees ta_filter WHERE ta_filter.task_id = t.id AND ta_filter.user_id = :assigneeId)';
            $queryParams['assigneeId'] = $actualAssigneeId;
        }

        if (!empty($params['labelId'])) {
            $conditions[] = 'EXISTS (SELECT 1 FROM task_labels tl_filter WHERE tl_filter.task_id = t.id AND tl_filter.label_id = :labelId)';
            $queryParams['labelId'] = $params['labelId'];
        }

        // sprintId ('null' string = unassigned = backlog; exclude opted-out projects)
        if (array_key_exists('sprintId', $params)) {
            if ($params['sprintId'] === 'null') {
                $conditions[] = 't.sprint_id IS NULL';
                $conditions[] = 'p.sprint_planning = 1';
            } else {
                $conditions[] = 't.sprint_id = :sprintId';
                $queryParams['sprintId'] = $params['sprintId'];
            }
        }

        if (($params['sprint'] ?? '') === 'backlog') {
            $conditions[] = 't.in_sprint_backlog = 1';
            $conditions[] = 't.sprint_id IS NULL';
            $conditions[] = 'p.sprint_planning = 1';
        }

        $sortBy = $params['sortBy'] ?? 'sortOrder';
        $sortDir = in_array($params['sortDir'] ?? 'asc', ['asc', 'desc']) ? ($params['sortDir'] ?? 'asc') : 'asc';

        $orderClause = match ($sortBy) {
            'dueDate' => "CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END {$sortDir}, t.due_date {$sortDir}",
            // priority/status are enum strings — order by logical rank, not alphabetically.
            'priority' => "FIELD(t.priority, 'low', 'medium', 'high', 'urgent') {$sortDir}",
            'status' => "FIELD(t.status, 'todo', 'in_progress', 'blocked', 'review', 'done') {$sortDir}",
            'effort' => "CASE WHEN t.effort IS NULL THEN 1 ELSE 0 END {$sortDir}, t.effort {$sortDir}",
            'createdAt' => "t.created_at {$sortDir}",
            'title' => "t.title {$sortDir}",
            default => "t.sort_order {$sortDir}, t.created_at DESC",
        };

        $db = Database::getInstance();
        $whereClause = implode(' AND ', $conditions);
        $sql = self::FETCH_QUERY . " WHERE {$whereClause} ORDER BY {$orderClause}";

        $stmt = $db->prepare($sql);
        $stmt->execute($queryParams);
        $taskRows = $stmt->fetchAll();

        $taskIds = array_column($taskRows, 'id');

        if (empty($taskIds)) {
            return [];
        }

        $relations = TaskModel::fetchRelationsForTasks($taskIds, [
            'full' => true,
            'includeLinks' => true,
            'includeSprint' => true,
            'creatorIds' => array_unique(array_column($taskRows, 'created_by_id')),
            'sprintIds' => array_unique(array_filter(array_column($taskRows, 'sprint_id'))),
        ]);

        return array_map(function ($row) use ($relations) {
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
    }

    /** POST /tasks — create a task with assignees/labels and notifications. */
    public static function createTask(array $data, ?string $userId): array
    {
        $db = Database::getInstance();
        $stmt = $db->prepare('SELECT id, default_notify_enabled FROM projects WHERE id = :id');
        $stmt->execute(['id' => $data['projectId']]);
        $project = $stmt->fetch();
        if (!$project) {
            throw new ServiceException(404, 'Project not found');
        }

        // Seed the task-wide flag from the project default (PRD §9.2), unless explicitly set.
        $notifyEnabled = array_key_exists('notifyEnabled', $data)
            ? ($data['notifyEnabled'] ? 1 : 0)
            : (int) $project['default_notify_enabled'];

        // Visibility flags default to 1 (appears everywhere); stored as 0 only when explicitly disabled (CC34).
        $showOnTimeline = array_key_exists('showOnTimeline', $data) ? ($data['showOnTimeline'] ? 1 : 0) : 1;
        $includeInReport = array_key_exists('includeInReport', $data) ? ($data['includeInReport'] ? 1 : 0) : 1;

        $id = Uuid::uuid4()->toString();
        $sortOrder = TaskModel::getNextSortOrder($data['projectId']);

        $assigneeIds = $data['assigneeIds'] ?? [];
        $labelIds = $data['labelIds'] ?? [];

        // A task created directly as 'done' gets its completion timestamp now (CC30a).
        $completedAtExpr = ($data['status'] ?? 'todo') === 'done' ? 'NOW()' : 'NULL';

        $db->beginTransaction();
        try {
            $stmt = $db->prepare(
                'INSERT INTO tasks (id, title, description, notes, status, priority, effort, due_date, start_date, sort_order, recurrence, sprint_id, project_id, created_by_id, notify_enabled, show_on_timeline, include_in_report, completed_at)
                 VALUES (:id, :title, :description, :notes, :status, :priority, :effort, :due_date, :start_date, :sort_order, :recurrence, :sprint_id, :project_id, :created_by_id, :notify_enabled, :show_on_timeline, :include_in_report, ' . $completedAtExpr . ')'
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
                'show_on_timeline' => $showOnTimeline,
                'include_in_report' => $includeInReport,
            ]);

            if (!empty($assigneeIds)) {
                $stmt = $db->prepare('INSERT INTO task_assignees (id, task_id, user_id) VALUES (:id, :task_id, :user_id)');
                foreach ($assigneeIds as $assigneeUserId) {
                    $stmt->execute(['id' => Uuid::uuid4()->toString(), 'task_id' => $id, 'user_id' => $assigneeUserId]);
                }
            }

            if (!empty($labelIds)) {
                $stmt = $db->prepare('INSERT INTO task_labels (id, task_id, label_id) VALUES (:id, :task_id, :label_id)');
                foreach ($labelIds as $labelId) {
                    $stmt->execute(['id' => Uuid::uuid4()->toString(), 'task_id' => $id, 'label_id' => $labelId]);
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

        $stmt = $db->prepare(self::FETCH_QUERY . ' WHERE t.id = :id');
        $stmt->execute(['id' => $id]);
        return self::mapFullTask($db, $stmt->fetch());
    }

    /** PUT /tasks/{id}/move — move a task to another project. */
    public static function moveTask(string $id, string $projectId): array
    {
        $db = Database::getInstance();

        $stmt = $db->prepare('SELECT id FROM tasks WHERE id = :id AND deleted_at IS NULL');
        $stmt->execute(['id' => $id]);
        if (!$stmt->fetch()) {
            throw new ServiceException(404, 'Task not found');
        }

        $stmt = $db->prepare('SELECT id FROM projects WHERE id = :id');
        $stmt->execute(['id' => $projectId]);
        if (!$stmt->fetch()) {
            throw new ServiceException(404, 'Target project not found');
        }

        $sortOrder = TaskModel::getNextSortOrder($projectId);

        $stmt = $db->prepare('UPDATE tasks SET project_id = :projectId, sort_order = :sortOrder WHERE id = :id');
        $stmt->execute(['projectId' => $projectId, 'sortOrder' => $sortOrder, 'id' => $id]);

        $stmt = $db->prepare(self::FETCH_QUERY . ' WHERE t.id = :id');
        $stmt->execute(['id' => $id]);
        return self::mapFullTask($db, $stmt->fetch());
    }

    /** GET /tasks/{id} — a single task with full relations. */
    public static function getTask(string $id): array
    {
        $db = Database::getInstance();
        $stmt = $db->prepare(self::FETCH_QUERY . ' WHERE t.id = :id AND t.deleted_at IS NULL');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();

        if (!$row) {
            throw new ServiceException(404, 'Task not found');
        }

        return self::mapFullTask($db, $row);
    }

    /**
     * PUT /tasks/{id} — update fields/assignees/labels, with recurrence clone.
     * @return array{task: array, clonedTask: ?array}
     */
    public static function updateTask(string $id, array $data, ?string $userId): array
    {
        $db = Database::getInstance();

        $stmt = $db->prepare('SELECT * FROM tasks WHERE id = :id AND deleted_at IS NULL');
        $stmt->execute(['id' => $id]);
        $existingTask = $stmt->fetch();

        if (!$existingTask) {
            throw new ServiceException(404, 'Task not found');
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

            // Maintain completed_at on the Done transition (CC30a); updated_at is not a proxy.
            if ($data['status'] === 'done' && $existingTask['status'] !== 'done') {
                $updates[] = 'completed_at = NOW()';
            } elseif ($data['status'] !== 'done' && $existingTask['status'] === 'done') {
                $updates[] = 'completed_at = NULL';
            }
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
        if (array_key_exists('showOnTimeline', $data)) {
            $updates[] = 'show_on_timeline = :show_on_timeline';
            $updateParams['show_on_timeline'] = $data['showOnTimeline'] ? 1 : 0;
        }
        if (array_key_exists('includeInReport', $data)) {
            $updates[] = 'include_in_report = :include_in_report';
            $updateParams['include_in_report'] = $data['includeInReport'] ? 1 : 0;
        }

        $clonedTaskId = null;

        $db->beginTransaction();
        try {
            if (!empty($updates)) {
                $sql = 'UPDATE tasks SET ' . implode(', ', $updates) . ' WHERE id = :id';
                $stmt = $db->prepare($sql);
                $stmt->execute($updateParams);
            }

            if (array_key_exists('assigneeIds', $data)) {
                $stmt = $db->prepare('DELETE FROM task_assignees WHERE task_id = :taskId');
                $stmt->execute(['taskId' => $id]);

                $assigneeIds = $data['assigneeIds'] ?? [];
                if (!empty($assigneeIds)) {
                    $stmt = $db->prepare('INSERT INTO task_assignees (id, task_id, user_id) VALUES (:id, :task_id, :user_id)');
                    foreach ($assigneeIds as $assigneeUserId) {
                        $stmt->execute(['id' => Uuid::uuid4()->toString(), 'task_id' => $id, 'user_id' => $assigneeUserId]);
                    }
                }
            }

            if (array_key_exists('labelIds', $data)) {
                $stmt = $db->prepare('DELETE FROM task_labels WHERE task_id = :taskId');
                $stmt->execute(['taskId' => $id]);

                $labelIds = $data['labelIds'] ?? [];
                if (!empty($labelIds)) {
                    $stmt = $db->prepare('INSERT INTO task_labels (id, task_id, label_id) VALUES (:id, :task_id, :label_id)');
                    foreach ($labelIds as $labelId) {
                        $stmt->execute(['id' => Uuid::uuid4()->toString(), 'task_id' => $id, 'label_id' => $labelId]);
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
                    'INSERT INTO tasks (id, title, description, notes, status, priority, effort, due_date, start_date, sort_order, recurrence, sprint_id, project_id, created_by_id, notify_enabled, show_on_timeline, include_in_report)
                     VALUES (:id, :title, :description, :notes, :status, :priority, :effort, :due_date, :start_date, :sort_order, :recurrence, :sprint_id, :project_id, :created_by_id, :notify_enabled, :show_on_timeline, :include_in_report)'
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
                    'show_on_timeline' => (int) $existingTask['show_on_timeline'],
                    'include_in_report' => (int) $existingTask['include_in_report'],
                ]);

                if (!empty($existingAssigneeRows)) {
                    $stmt = $db->prepare('INSERT INTO task_assignees (id, task_id, user_id) VALUES (:id, :task_id, :user_id)');
                    foreach ($existingAssigneeRows as $a) {
                        $stmt->execute(['id' => Uuid::uuid4()->toString(), 'task_id' => $clonedTaskId, 'user_id' => $a['user_id']]);
                    }
                }

                if (!empty($existingLabelRows)) {
                    $stmt = $db->prepare('INSERT INTO task_labels (id, task_id, label_id) VALUES (:id, :task_id, :label_id)');
                    foreach ($existingLabelRows as $l) {
                        $stmt->execute(['id' => Uuid::uuid4()->toString(), 'task_id' => $clonedTaskId, 'label_id' => $l['label_id']]);
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

        $stmt = $db->prepare(self::FETCH_QUERY . ' WHERE t.id = :id');
        $stmt->execute(['id' => $id]);
        $task = self::mapFullTask($db, $stmt->fetch());

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

        return ['task' => $task, 'clonedTask' => $clonedTask];
    }

    /** DELETE /tasks/{id} — soft-delete. */
    public static function deleteTask(string $id): void
    {
        $db = Database::getInstance();

        $stmt = $db->prepare('SELECT id FROM tasks WHERE id = :id AND deleted_at IS NULL');
        $stmt->execute(['id' => $id]);
        if (!$stmt->fetch()) {
            throw new ServiceException(404, 'Task not found');
        }

        $stmt = $db->prepare('UPDATE tasks SET deleted_at = NOW() WHERE id = :id');
        $stmt->execute(['id' => $id]);
    }

    /** POST /tasks/{id}/subtasks — add a subtask. */
    public static function createSubtask(string $taskId, string $title): array
    {
        $db = Database::getInstance();

        $stmt = $db->prepare('SELECT id FROM tasks WHERE id = :id AND deleted_at IS NULL');
        $stmt->execute(['id' => $taskId]);
        if (!$stmt->fetch()) {
            throw new ServiceException(404, 'Task not found');
        }

        $stmt = $db->prepare('SELECT MAX(sort_order) AS max_order FROM subtasks WHERE task_id = :taskId');
        $stmt->execute(['taskId' => $taskId]);
        $row = $stmt->fetch();
        $sortOrder = ($row['max_order'] !== null) ? (int) $row['max_order'] + 1 : 0;

        $subtaskId = Uuid::uuid4()->toString();
        $stmt = $db->prepare('INSERT INTO subtasks (id, title, sort_order, task_id) VALUES (:id, :title, :sortOrder, :taskId)');
        $stmt->execute(['id' => $subtaskId, 'title' => $title, 'sortOrder' => $sortOrder, 'taskId' => $taskId]);

        return self::fetchSubtask($db, $subtaskId);
    }

    /** PUT /tasks/{taskId}/subtasks/{subtaskId} — update a subtask. */
    public static function updateSubtask(string $taskId, string $subtaskId, array $data): array
    {
        $db = Database::getInstance();

        $stmt = $db->prepare('SELECT id FROM subtasks WHERE id = :subtaskId AND task_id = :taskId');
        $stmt->execute(['subtaskId' => $subtaskId, 'taskId' => $taskId]);
        if (!$stmt->fetch()) {
            throw new ServiceException(404, 'Subtask not found');
        }

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

        return self::fetchSubtask($db, $subtaskId);
    }

    /** DELETE /tasks/{taskId}/subtasks/{subtaskId}. */
    public static function deleteSubtask(string $taskId, string $subtaskId): void
    {
        $db = Database::getInstance();

        $stmt = $db->prepare('SELECT id FROM subtasks WHERE id = :subtaskId AND task_id = :taskId');
        $stmt->execute(['subtaskId' => $subtaskId, 'taskId' => $taskId]);
        if (!$stmt->fetch()) {
            throw new ServiceException(404, 'Subtask not found');
        }

        $stmt = $db->prepare('DELETE FROM subtasks WHERE id = :subtaskId');
        $stmt->execute(['subtaskId' => $subtaskId]);
    }

    // --- Private helpers ----------------------------------------------------

    /** Map a freshly-fetched task row with all relations (the shared shape). */
    private static function mapFullTask(PDO $db, array $row): array
    {
        $id = $row['id'];
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

        return TaskModel::mapTask($row, $taskRelations, true);
    }

    private static function fetchSubtask(PDO $db, string $subtaskId): array
    {
        $stmt = $db->prepare('SELECT id, title, completed, sort_order, task_id, created_at FROM subtasks WHERE id = :id');
        $stmt->execute(['id' => $subtaskId]);
        $row = $stmt->fetch();

        return [
            'id' => $row['id'],
            'title' => $row['title'],
            'completed' => (bool) $row['completed'],
            'sortOrder' => (int) $row['sort_order'],
            'taskId' => $row['task_id'],
            'createdAt' => date('c', strtotime($row['created_at'])),
        ];
    }
}
