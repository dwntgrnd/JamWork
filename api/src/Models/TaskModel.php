<?php

namespace JamWork\Models;

use JamWork\Lib\Database;

class TaskModel
{
    /**
     * Build an IN clause with numbered named placeholders.
     *
     * @return array{clause: string, params: array}
     */
    public static function buildInClause(array $ids, string $prefix = 'id'): array
    {
        $placeholders = [];
        $params = [];
        foreach ($ids as $i => $id) {
            $key = "{$prefix}{$i}";
            $placeholders[] = ":{$key}";
            $params[$key] = $id;
        }
        return [
            'clause' => implode(', ', $placeholders),
            'params' => $params,
        ];
    }

    /**
     * Get the next sort_order value for tasks in a project.
     */
    public static function getNextSortOrder(string $projectId): int
    {
        $db = Database::getInstance();
        $stmt = $db->prepare(
            'SELECT MAX(sort_order) AS max_order FROM tasks WHERE project_id = :projectId AND deleted_at IS NULL'
        );
        $stmt->execute(['projectId' => $projectId]);
        $row = $stmt->fetch();
        return ($row['max_order'] !== null) ? (int) $row['max_order'] + 1 : 0;
    }

    /**
     * Map a raw DB row into the camelCase JSON shape.
     *
     * @param array $row       Raw task row (may include project JOIN aliases)
     * @param array $relations Keyed array: assignees, labels, subtasks, creator, links, sprint
     * @param bool  $full      Include subtasks and createdBy
     */
    public static function mapTask(array $row, array $relations, bool $full = false): array
    {
        $task = [
            'id' => $row['id'],
            'title' => $row['title'],
            'description' => $row['description'],
            'notes' => $row['notes'],
            'status' => $row['status'],
            'priority' => $row['priority'],
            'effort' => $row['effort'] !== null ? (int) $row['effort'] : null,
            'dueDate' => $row['due_date'] ? date('c', strtotime($row['due_date'])) : null,
            'startDate' => $row['start_date'] ? date('c', strtotime($row['start_date'])) : null,
            'sortOrder' => (int) $row['sort_order'],
            'recurrence' => $row['recurrence'],
            'sprintId' => $row['sprint_id'],
            'inSprintBacklog' => (bool) $row['in_sprint_backlog'],
            'notifyEnabled' => (bool) ($row['notify_enabled'] ?? 1),
            'showOnTimeline' => (bool) ($row['show_on_timeline'] ?? 1),
            'includeInReport' => (bool) ($row['include_in_report'] ?? 1),
            'projectId' => $row['project_id'],
            'createdById' => $row['created_by_id'],
            'createdAt' => date('c', strtotime($row['created_at'])),
            'updatedAt' => date('c', strtotime($row['updated_at'])),
            'deletedAt' => $row['deleted_at'] ? date('c', strtotime($row['deleted_at'])) : null,
            'project' => isset($row['project_rel_id']) && $row['project_rel_id'] ? [
                'id' => $row['project_rel_id'],
                'name' => $row['project_rel_name'],
            ] : null,
            'assignees' => $relations['assignees'] ?? [],
            'labels' => $relations['labels'] ?? [],
        ];

        if ($full) {
            $task['subtasks'] = $relations['subtasks'] ?? [];
            $task['creator'] = $relations['creator'] ?? null;
        }

        if (isset($relations['links'])) {
            $task['links'] = $relations['links'];
        }

        if (isset($relations['sprint'])) {
            $task['sprint'] = $relations['sprint'];
        }

        return $task;
    }

    /**
     * Batch-fetch all relations for a set of task IDs.
     *
     * @param array $taskIds
     * @param array $options Keys: full (bool), includeLinks (bool), includeSprint (bool),
     *                       creatorIds (array), sprintIds (array)
     * @return array Keyed: assignees, labels, subtasks, creators, links, sprints
     */
    public static function fetchRelationsForTasks(array $taskIds, array $options = []): array
    {
        $full = $options['full'] ?? false;
        $includeLinks = $options['includeLinks'] ?? false;
        $includeSprint = $options['includeSprint'] ?? false;

        $result = [
            'assignees' => [],
            'labels' => [],
        ];

        if ($full) {
            $result['subtasks'] = [];
            $result['creators'] = [];
        }

        if ($includeLinks) {
            $result['links'] = [];
        }

        if ($includeSprint) {
            $result['sprints'] = [];
        }

        if (empty($taskIds)) {
            return $result;
        }

        $db = Database::getInstance();
        $in = self::buildInClause($taskIds, 'tid');

        // Assignees (always)
        $sql = "
            SELECT ta.task_id, ta.id, ta.user_id, ta.assigned_at,
                   u.id AS user_id_rel, u.email AS user_email, u.display_name AS user_display_name, u.role AS user_role
            FROM task_assignees ta
            JOIN users u ON ta.user_id = u.id
            WHERE ta.task_id IN ({$in['clause']})
        ";
        $stmt = $db->prepare($sql);
        $stmt->execute($in['params']);
        $rows = $stmt->fetchAll();

        foreach ($rows as $row) {
            $result['assignees'][$row['task_id']][] = [
                'id' => $row['id'],
                'taskId' => $row['task_id'],
                'userId' => $row['user_id'],
                'assignedAt' => date('c', strtotime($row['assigned_at'])),
                'user' => [
                    'id' => $row['user_id_rel'],
                    'email' => $row['user_email'],
                    'displayName' => $row['user_display_name'],
                    'role' => $row['user_role'],
                ],
            ];
        }

        // Labels (always)
        $sql = "
            SELECT tl.task_id, tl.id, tl.label_id,
                   l.id AS label_id_rel, l.name AS label_name, l.color AS label_color,
                   l.created_by_id AS label_created_by_id, l.created_at AS label_created_at
            FROM task_labels tl
            JOIN labels l ON tl.label_id = l.id
            WHERE tl.task_id IN ({$in['clause']})
        ";
        $stmt = $db->prepare($sql);
        $stmt->execute($in['params']);
        $rows = $stmt->fetchAll();

        foreach ($rows as $row) {
            $result['labels'][$row['task_id']][] = [
                'id' => $row['id'],
                'taskId' => $row['task_id'],
                'labelId' => $row['label_id'],
                'label' => [
                    'id' => $row['label_id_rel'],
                    'name' => $row['label_name'],
                    'color' => $row['label_color'],
                    'createdById' => $row['label_created_by_id'],
                    'createdAt' => date('c', strtotime($row['label_created_at'])),
                ],
            ];
        }

        // Subtasks (only if full)
        if ($full) {
            $sql = "
                SELECT s.id, s.title, s.completed, s.sort_order, s.task_id, s.created_at
                FROM subtasks s
                WHERE s.task_id IN ({$in['clause']})
                ORDER BY s.sort_order ASC
            ";
            $stmt = $db->prepare($sql);
            $stmt->execute($in['params']);
            $rows = $stmt->fetchAll();

            foreach ($rows as $row) {
                $result['subtasks'][$row['task_id']][] = [
                    'id' => $row['id'],
                    'title' => $row['title'],
                    'completed' => (bool) $row['completed'],
                    'sortOrder' => (int) $row['sort_order'],
                    'taskId' => $row['task_id'],
                    'createdAt' => date('c', strtotime($row['created_at'])),
                ];
            }
        }

        // Creators (only if full)
        if ($full) {
            $creatorIds = array_unique($options['creatorIds'] ?? []);
            if (!empty($creatorIds)) {
                $cIn = self::buildInClause(array_values($creatorIds), 'uid');
                $sql = "SELECT id, email, display_name, role FROM users WHERE id IN ({$cIn['clause']})";
                $stmt = $db->prepare($sql);
                $stmt->execute($cIn['params']);
                $rows = $stmt->fetchAll();

                foreach ($rows as $row) {
                    $result['creators'][$row['id']] = [
                        'id' => $row['id'],
                        'email' => $row['email'],
                        'displayName' => $row['display_name'],
                        'role' => $row['role'],
                    ];
                }
            }
        }

        // Links (only if includeLinks)
        if ($includeLinks) {
            $sql = "
                SELECT tl.id, tl.title, tl.url, tl.task_id, tl.created_by_id, tl.created_at,
                       u.id AS user_id_rel, u.display_name AS user_display_name, u.role AS user_role
                FROM task_links tl
                JOIN users u ON tl.created_by_id = u.id
                WHERE tl.task_id IN ({$in['clause']})
                ORDER BY tl.created_at DESC
            ";
            $stmt = $db->prepare($sql);
            $stmt->execute($in['params']);
            $rows = $stmt->fetchAll();

            foreach ($rows as $row) {
                $result['links'][$row['task_id']][] = [
                    'id' => $row['id'],
                    'title' => $row['title'],
                    'url' => $row['url'],
                    'taskId' => $row['task_id'],
                    'createdById' => $row['created_by_id'],
                    'createdAt' => date('c', strtotime($row['created_at'])),
                    'createdBy' => [
                        'id' => $row['user_id_rel'],
                        'displayName' => $row['user_display_name'],
                        'role' => $row['user_role'],
                    ],
                ];
            }
        }

        // Sprints (only if includeSprint)
        if ($includeSprint) {
            $sprintIds = array_unique(array_filter($options['sprintIds'] ?? []));
            if (!empty($sprintIds)) {
                $sIn = self::buildInClause(array_values($sprintIds), 'spid');
                $sql = "SELECT id, name, start_date, end_date, status FROM sprints WHERE id IN ({$sIn['clause']})";
                $stmt = $db->prepare($sql);
                $stmt->execute($sIn['params']);
                $rows = $stmt->fetchAll();

                foreach ($rows as $row) {
                    $result['sprints'][$row['id']] = [
                        'id' => $row['id'],
                        'name' => $row['name'],
                        'startDate' => date('c', strtotime($row['start_date'])),
                        'endDate' => date('c', strtotime($row['end_date'])),
                        'status' => $row['status'],
                    ];
                }
            }
        }

        return $result;
    }
}
