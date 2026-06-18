<?php

namespace JamWork\Services;

use JamWork\Lib\Database;
use JamWork\Models\TaskModel;
use PDO;
use Ramsey\Uuid\Uuid;

/**
 * Status Report aggregator (CC30a). The backend is the single aggregator: it
 * groups/orders tasks, applies the Done window, computes overdue and subtask
 * counts, filters milestones, and assembles a self-sufficient payload that the
 * frontend renders blindly (no client-side re-sorting or re-filtering).
 *
 * The pure transforms below take plain arrays so the invariants are unit-tested
 * without a database; the DB fetch + persistence live in the generate/list/get
 * methods (added in Phase 3c).
 */
class ReportService
{
    /** Report reading order — attention-drivers first, finished work last. */
    public const GROUP_ORDER = ['blocked', 'in_progress', 'review', 'todo', 'done'];

    /** Display labels — mirror of client `STATUS_LABELS` (tokens are the source of truth). */
    public const STATUS_LABELS = [
        'todo' => 'To Do',
        'in_progress' => 'In Progress',
        'blocked' => 'Blocked',
        'review' => 'Review',
        'done' => 'Done',
    ];

    public const DEFAULT_WINDOW_DAYS = 7;
    public const DEFAULT_HORIZON_DAYS = 90;

    // Rendered copy embedded in the payload so the frontend reads the exact same
    // strings as the markdown (single source of truth; no client copy decisions).
    public const COPY_NO_PROJECTS = 'No projects are included in the status report.';
    public const COPY_NO_ACTIVE_TASKS = 'No active tasks.';
    public const COPY_UNASSIGNED = 'Unassigned';

    /** A non-Done task with a due date in the past is overdue. */
    public static function isOverdue(string $status, ?string $dueDate, int $nowTs): bool
    {
        return $status !== 'done'
            && $dueDate !== null
            && $dueDate !== ''
            && strtotime($dueDate) < $nowTs;
    }

    /**
     * Build one project's status groups: non-empty groups only, in report order,
     * with the Done group limited to the trailing $windowDays.
     *
     * @param array<int,array<string,mixed>> $tasks   rows: id,title,status,due_date,completed_at
     * @param array<string,array{completed:int,total:int}> $subtaskCounts keyed by task id
     * @param array<string,array<int,array{id:string,name:string}>> $assignees keyed by task id
     * @return array<int,array{status:string,label:string,tasks:array}>
     */
    public static function buildGroups(
        array $tasks,
        int $nowTs,
        int $windowDays,
        array $subtaskCounts = [],
        array $assignees = []
    ): array {
        $windowStart = $nowTs - $windowDays * 86400;
        $buckets = [];

        foreach ($tasks as $t) {
            $status = $t['status'];

            if ($status === 'done') {
                $completedAt = $t['completed_at'] ?? null;
                // Done is windowed; a NULL completed_at never qualifies (do not guess).
                if ($completedAt === null || strtotime($completedAt) < $windowStart) {
                    continue;
                }
            }

            $id = $t['id'];
            $count = $subtaskCounts[$id] ?? null;

            $buckets[$status][] = [
                'id' => $id,
                'title' => $t['title'],
                'assignees' => $assignees[$id] ?? [],
                'dueDate' => !empty($t['due_date']) ? date('c', strtotime($t['due_date'])) : null,
                'overdue' => self::isOverdue($status, $t['due_date'] ?? null, $nowTs),
                'subtasks' => ($count && $count['total'] > 0)
                    ? ['completed' => (int) $count['completed'], 'total' => (int) $count['total']]
                    : null,
            ];
        }

        $groups = [];
        foreach (self::GROUP_ORDER as $status) {
            if (!empty($buckets[$status])) {
                $groups[] = [
                    'status' => $status,
                    'label' => self::STATUS_LABELS[$status],
                    'tasks' => $buckets[$status],
                ];
            }
        }

        return $groups;
    }

    /**
     * Upcoming milestones within the horizon, ascending by date. Mirrors the
     * existing global read (all milestones, regardless of project scope).
     *
     * @param array<int,array{name:string,date:string}> $rows
     * @return array<int,array{name:string,date:string}>
     */
    public static function filterMilestones(array $rows, int $nowTs, int $horizonDays): array
    {
        $startOfToday = strtotime('today', $nowTs);
        $horizonEnd = $startOfToday + $horizonDays * 86400;

        $out = [];
        foreach ($rows as $m) {
            $ts = strtotime($m['date']);
            if ($ts >= $startOfToday && $ts <= $horizonEnd) {
                $out[] = ['name' => $m['name'], 'date' => date('c', $ts), '_ts' => $ts];
            }
        }

        usort($out, fn($a, $b) => $a['_ts'] <=> $b['_ts']);

        return array_map(fn($m) => ['name' => $m['name'], 'date' => $m['date']], $out);
    }

    /**
     * Assemble the full, self-sufficient payload from fetched project + milestone
     * data. $projectsData entries: ['id','name','tasks','subtaskCounts','assignees'].
     */
    public static function buildPayload(
        array $projectsData,
        array $milestoneRows,
        int $nowTs,
        int $windowDays = self::DEFAULT_WINDOW_DAYS,
        int $horizonDays = self::DEFAULT_HORIZON_DAYS
    ): array {
        $projects = [];
        foreach ($projectsData as $pd) {
            $groups = self::buildGroups(
                $pd['tasks'],
                $nowTs,
                $windowDays,
                $pd['subtaskCounts'] ?? [],
                $pd['assignees'] ?? []
            );
            $projects[] = [
                'id' => $pd['id'],
                'name' => $pd['name'],
                'hasTasks' => !empty($groups),
                'groups' => $groups,
            ];
        }

        return [
            'generatedAt' => date('c', $nowTs),
            'windowDays' => $windowDays,
            'milestoneHorizonDays' => $horizonDays,
            'milestones' => self::filterMilestones($milestoneRows, $nowTs, $horizonDays),
            'projects' => $projects,
            'projectsEmpty' => empty($projectsData),
            'copy' => [
                'noProjects' => self::COPY_NO_PROJECTS,
                'noActiveTasks' => self::COPY_NO_ACTIVE_TASKS,
                'noMilestones' => "No milestones in the next {$horizonDays} days.",
                'unassigned' => self::COPY_UNASSIGNED,
            ],
        ];
    }

    // --- Generation + persistence (DB) --------------------------------------

    /**
     * POST /reports — aggregate every included project + global milestones now,
     * persist payload_json + markdown, and return the stored object. Read-only
     * with respect to tasks/projects/milestones.
     */
    public static function generate(
        ?string $userId,
        int $windowDays = self::DEFAULT_WINDOW_DAYS,
        int $horizonDays = self::DEFAULT_HORIZON_DAYS,
        string $type = 'ad_hoc'
    ): array {
        $db = Database::getInstance();
        $nowTs = time();

        $projectsData = [];
        foreach (self::fetchIncludedProjects($db) as $project) {
            $tasks = self::fetchTasks($db, $project['id']);
            $taskIds = array_column($tasks, 'id');
            $projectsData[] = [
                'id' => $project['id'],
                'name' => $project['name'],
                'tasks' => $tasks,
                'subtaskCounts' => self::fetchSubtaskCounts($db, $taskIds),
                'assignees' => self::fetchAssignees($db, $taskIds),
            ];
        }

        // Global milestones — reuse the existing unscoped read (all milestones).
        $milestoneRows = $db->query('SELECT name, date FROM milestones ORDER BY date ASC')->fetchAll();

        $payload = self::buildPayload($projectsData, $milestoneRows, $nowTs, $windowDays, $horizonDays);
        $markdown = ReportMarkdownRenderer::render($payload);

        $id = Uuid::uuid4()->toString();
        $stmt = $db->prepare(
            'INSERT INTO reports (id, generated_at, type, triggered_by, window_days, payload_json, markdown)
             VALUES (:id, :generated_at, :type, :triggered_by, :window_days, :payload_json, :markdown)'
        );
        $stmt->execute([
            'id' => $id,
            'generated_at' => date('Y-m-d H:i:s', $nowTs),
            'type' => $type,
            'triggered_by' => $userId,
            'window_days' => $windowDays,
            'payload_json' => json_encode($payload),
            'markdown' => $markdown,
        ]);

        return self::get($id);
    }

    /** GET /reports — archive list, newest-first. */
    public static function listReports(): array
    {
        $db = Database::getInstance();
        $rows = $db->query(
            'SELECT r.id, r.generated_at, r.type, r.triggered_by, u.display_name AS triggered_by_name
             FROM reports r LEFT JOIN users u ON r.triggered_by = u.id
             ORDER BY r.generated_at DESC, r.id DESC'
        )->fetchAll();

        return array_map(fn($r) => [
            'id' => $r['id'],
            'generatedAt' => date('c', strtotime($r['generated_at'])),
            'type' => $r['type'],
            'triggeredBy' => self::triggeredBy($r),
        ], $rows);
    }

    /** GET /reports/{id} — the stored object with its parsed payload. */
    public static function get(string $id): array
    {
        $db = Database::getInstance();
        $stmt = $db->prepare(
            'SELECT r.id, r.generated_at, r.type, r.triggered_by, r.window_days, r.payload_json,
                    u.display_name AS triggered_by_name
             FROM reports r LEFT JOIN users u ON r.triggered_by = u.id
             WHERE r.id = :id'
        );
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();

        if (!$row) {
            throw new ServiceException(404, 'Report not found');
        }

        return [
            'id' => $row['id'],
            'generatedAt' => date('c', strtotime($row['generated_at'])),
            'type' => $row['type'],
            'triggeredBy' => self::triggeredBy($row),
            'windowDays' => (int) $row['window_days'],
            'payload' => json_decode($row['payload_json'], true),
        ];
    }

    /** Shape the triggerer for a byline: {id, displayName} or null (departed user). */
    private static function triggeredBy(array $row): ?array
    {
        return $row['triggered_by'] !== null
            ? ['id' => $row['triggered_by'], 'displayName' => $row['triggered_by_name']]
            : null;
    }

    /** GET /reports/{id}/markdown — the stored markdown. */
    public static function markdown(string $id): string
    {
        $db = Database::getInstance();
        $stmt = $db->prepare('SELECT markdown FROM reports WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();

        if (!$row) {
            throw new ServiceException(404, 'Report not found');
        }

        return $row['markdown'];
    }

    /** DELETE /reports/{id} — hard-delete a stored snapshot. */
    public static function deleteReport(string $id): void
    {
        $db = Database::getInstance();
        $stmt = $db->prepare('SELECT id FROM reports WHERE id = :id');
        $stmt->execute(['id' => $id]);
        if (!$stmt->fetch()) {
            throw new ServiceException(404, 'Report not found');
        }

        $stmt = $db->prepare('DELETE FROM reports WHERE id = :id');
        $stmt->execute(['id' => $id]);
    }

    // --- Fetch helpers ------------------------------------------------------

    private static function fetchIncludedProjects(PDO $db): array
    {
        return $db->query(
            'SELECT id, name FROM projects WHERE include_in_status_report = 1 ORDER BY name ASC'
        )->fetchAll();
    }

    private static function fetchTasks(PDO $db, string $projectId): array
    {
        $stmt = $db->prepare(
            'SELECT id, title, status, due_date, completed_at
             FROM tasks
             WHERE project_id = :pid AND deleted_at IS NULL AND include_in_report = 1
             ORDER BY sort_order ASC, created_at DESC'
        );
        $stmt->execute(['pid' => $projectId]);
        return $stmt->fetchAll();
    }

    private static function fetchSubtaskCounts(PDO $db, array $taskIds): array
    {
        if (empty($taskIds)) {
            return [];
        }
        $in = TaskModel::buildInClause($taskIds, 'st');
        $stmt = $db->prepare(
            "SELECT task_id, COUNT(*) AS total, SUM(completed) AS completed
             FROM subtasks WHERE task_id IN ({$in['clause']}) GROUP BY task_id"
        );
        $stmt->execute($in['params']);

        $out = [];
        foreach ($stmt->fetchAll() as $r) {
            $out[$r['task_id']] = ['completed' => (int) $r['completed'], 'total' => (int) $r['total']];
        }
        return $out;
    }

    private static function fetchAssignees(PDO $db, array $taskIds): array
    {
        if (empty($taskIds)) {
            return [];
        }
        $in = TaskModel::buildInClause($taskIds, 'as');
        $stmt = $db->prepare(
            "SELECT ta.task_id, u.id AS user_id, u.display_name
             FROM task_assignees ta JOIN users u ON ta.user_id = u.id
             WHERE ta.task_id IN ({$in['clause']})
             ORDER BY u.display_name ASC"
        );
        $stmt->execute($in['params']);

        $out = [];
        foreach ($stmt->fetchAll() as $r) {
            $out[$r['task_id']][] = ['id' => $r['user_id'], 'name' => $r['display_name']];
        }
        return $out;
    }
}
