<?php

namespace JamWork\Services;

use JamWork\Lib\Database;
use JamWork\Lib\Validator;
use JamWork\Models\TaskModel;
use Ramsey\Uuid\Uuid;

/**
 * Business/data logic for the /sprints endpoints. Routes handle HTTP concerns;
 * this service performs the operations and returns plain data, raising
 * ServiceException for not-found cases. Behavior is identical to the
 * pre-extraction route handlers.
 */
class SprintService
{
    private const FETCH_QUERY = '
        SELECT s.*,
               p.id AS project_id_rel, p.name AS project_name,
               (SELECT COUNT(*) FROM tasks t WHERE t.sprint_id = s.id AND t.deleted_at IS NULL) AS task_count
        FROM sprints s
        LEFT JOIN projects p ON s.project_id = p.id
    ';

    /** GET /sprints — list with optional stats and task expansion. */
    public static function listSprints(array $params): array
    {
        $db = Database::getInstance();

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

        return $sprints;
    }

    /** POST /sprints — create an active sprint. */
    public static function createSprint(array $data, ?string $userId): array
    {
        $db = Database::getInstance();

        $projectId = $data['projectId'] ?? null;
        if ($projectId !== null) {
            $stmt = $db->prepare('SELECT id FROM projects WHERE id = :projectId');
            $stmt->execute(['projectId' => $projectId]);
            if (!$stmt->fetch()) {
                throw new ServiceException(404, 'Project not found');
            }
        }

        $id = Uuid::uuid4()->toString();

        $stmt = $db->prepare(
            'INSERT INTO sprints (id, name, description, start_date, end_date, status, project_id, created_by_id)
             VALUES (:id, :name, :description, :start_date, :end_date, :status, :project_id, :created_by_id)'
        );
        $stmt->execute([
            'id' => $id,
            'name' => $data['name'],
            'description' => $data['description'] ?? null,
            'start_date' => Validator::toMySQLDate($data['startDate']),
            'end_date' => Validator::toMySQLDate($data['endDate']),
            'status' => 'active',
            'project_id' => $projectId,
            'created_by_id' => $userId,
        ]);

        return self::fetchMappedSprint($db, $id);
    }

    /**
     * PUT /sprints/{id}/close — complete the sprint and migrate its incomplete
     * tasks to the backlog (null) or the next sprint.
     * @return array the mapped incomplete tasks that were migrated
     */
    public static function closeSprint(string $id, string $action, ?string $nextSprintId): array
    {
        $db = Database::getInstance();

        $stmt = $db->prepare('SELECT id, status FROM sprints WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $sprint = $stmt->fetch();

        if (!$sprint) {
            throw new ServiceException(404, 'Sprint not found');
        }

        $stmt = $db->prepare(
            'SELECT * FROM tasks WHERE sprint_id = :sprintId AND deleted_at IS NULL AND status != :doneStatus'
        );
        $stmt->execute(['sprintId' => $id, 'doneStatus' => 'done']);
        $incompleteTasks = $stmt->fetchAll();

        if ($action === 'next_sprint') {
            $stmt = $db->prepare('SELECT id FROM sprints WHERE id = :id');
            $stmt->execute(['id' => $nextSprintId]);
            if (!$stmt->fetch()) {
                throw new ServiceException(404, 'Next sprint not found');
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

                $newSprintId = $action === 'backlog' ? null : $nextSprintId;
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

        return array_map(function ($row) {
            return TaskModel::mapTask($row, [], false);
        }, $incompleteTasks);
    }

    /** GET /sprints/{id} — a single sprint with full task expansion. */
    public static function getSprint(string $id): array
    {
        $db = Database::getInstance();

        $stmt = $db->prepare(self::FETCH_QUERY . ' WHERE s.id = :id');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();

        if (!$row) {
            throw new ServiceException(404, 'Sprint not found');
        }

        $sprint = self::mapSprint($row);

        $tasksBySprint = self::fetchTasksForSprints([$id], true);
        $sprint['tasks'] = $tasksBySprint[$id] ?? [];

        return $sprint;
    }

    /** PUT /sprints/{id} — update sprint fields. */
    public static function updateSprint(string $id, array $data): array
    {
        $db = Database::getInstance();

        $stmt = $db->prepare('SELECT id FROM sprints WHERE id = :id');
        $stmt->execute(['id' => $id]);
        if (!$stmt->fetch()) {
            throw new ServiceException(404, 'Sprint not found');
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
            $params['start_date'] = Validator::toMySQLDate($data['startDate']);
        }
        if (isset($data['endDate'])) {
            $updates[] = 'end_date = :end_date';
            $params['end_date'] = Validator::toMySQLDate($data['endDate']);
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

        return self::fetchMappedSprint($db, $id);
    }

    /** DELETE /sprints/{id} — hard delete. */
    public static function deleteSprint(string $id): void
    {
        $db = Database::getInstance();

        $stmt = $db->prepare('SELECT id FROM sprints WHERE id = :id');
        $stmt->execute(['id' => $id]);
        if (!$stmt->fetch()) {
            throw new ServiceException(404, 'Sprint not found');
        }

        $stmt = $db->prepare('DELETE FROM sprints WHERE id = :id');
        $stmt->execute(['id' => $id]);
    }

    // --- Private helpers ----------------------------------------------------

    private static function fetchMappedSprint(\PDO $db, string $id): array
    {
        $stmt = $db->prepare(self::FETCH_QUERY . ' WHERE s.id = :id');
        $stmt->execute(['id' => $id]);
        return self::mapSprint($stmt->fetch());
    }

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

        $in = TaskModel::buildInClause($sprintIds, 'sid');

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

        $result = [];
        foreach ($sprintIds as $sid) {
            $result[$sid] = [];
        }

        if (empty($taskIds)) {
            return $result;
        }

        $options = ['full' => $full];
        if ($full) {
            $options['creatorIds'] = array_unique(array_column($taskRows, 'created_by_id'));
        }
        $relations = TaskModel::fetchRelationsForTasks($taskIds, $options);

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
}
