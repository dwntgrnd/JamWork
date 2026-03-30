# JW-CC09 — Tasks Core (TaskModel + TaskRoutes + SprintRoutes Refactor)

## Context

JamWork-v2 is a Vite + React SPA with a PHP/MySQL backend (Slim 4 framework).
CC08a/b (Sprint CRUD + Close + Task Expansion) has been implemented and committed.
This prompt introduces the TaskModel class and builds the 6 core task endpoints, plus refactors SprintRoutes to delegate task mapping to TaskModel.

**This is the most complex CC prompt in the project.** Read all referenced files carefully before writing any code.

## Existing Patterns (MUST follow exactly)

Read these files before writing any code:

- `api/src/Routes/SprintRoutes.php` — **you will refactor this** (task mapping extraction)
- `api/src/Routes/ProjectRoutes.php` — response shape and route pattern reference
- `api/src/Lib/Validator.php` — validation rules (available: required, optional, nullable, min, max, in, uuid, iso8601, boolean, array, url, hex_color, uuid_array)
- `api/src/Lib/Database.php` — PDO singleton (`Database::getInstance()`)
- `api/index.php` — route registration (you will add TaskRoutes here)

### Key conventions (non-negotiable):

1. **Raw PDO** with `Database::getInstance()`. No ORM.
2. **UUIDs** via `Ramsey\Uuid\Uuid::uuid4()->toString()`.
3. **camelCase JSON** response keys mapped from `snake_case` DB columns.
4. **ISO 8601 dates** via `date('c', strtotime($row['column']))`. Nullable dates: ternary check before formatting.
5. **Type casting:** `effort` → `(int)` or `null`. `completed` → `(bool)`. `inSprintBacklog` → `(bool)`. `sortOrder` → `(int)`.
6. **Soft delete** on tasks: `deleted_at` column. All queries on tasks MUST include `AND deleted_at IS NULL` (or `t.deleted_at IS NULL` with alias).
7. **Validation** via `Validator::validate()` + `Validator::respondWithErrors()`.
8. **UUID param validation** at handler top: `preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $id)` → 400 if invalid.
9. **AuthMiddleware** on the route group: `->add(new AuthMiddleware())`.
10. **userId** from auth: `$request->getAttribute('userId')`.
11. **IN clause** pattern: numbered named placeholders (`:tid0`, `:tid1`, etc.) built in a loop. Never string-interpolate IDs into SQL.
12. **Multi-query approach** for relations: fetch base entities, then batch-fetch related entities with `WHERE x_id IN (...)`. Group results in PHP. Do NOT attempt massive JOINs.
13. **PDO transactions** via `$db->beginTransaction()`, `$db->commit()`, `$db->rollBack()`.
14. **`array_key_exists`** for nullable fields that the client may explicitly set to `null` (e.g., `description`, `notes`, `dueDate`, `startDate`, `recurrence`, `effort`, `sprintId`).
15. **Dynamic SET clause** for updates: build `$updates[]` and `$params[]` arrays conditionally, then `implode(', ', $updates)`.
16. **201 on POST**, 200 on everything else (except 400/404 errors).
17. **Static routes before parameterized routes** (Decision #21): `/tasks/reorder` etc. must register before `/tasks/{id}`. CC09 doesn't add static routes yet (those are CC10), but the route group must be structured so CC10 can prepend them.

## Files to Create

### 1. `api/src/Models/TaskModel.php` (NEW)

### 2. `api/src/Routes/TaskRoutes.php` (NEW)

## Files to Modify

### 3. `api/src/Routes/SprintRoutes.php` (REFACTOR — extract mapping to TaskModel)

### 4. `api/index.php` (ADD TaskRoutes registration)

---

## Part 1: TaskModel.php

Create `api/src/Models/TaskModel.php`.

```php
<?php

namespace JamWork\Models;

use JamWork\Lib\Database;

class TaskModel
{
    // ... methods below
}
```

### Method 1: `mapTask(array $row, array $relations, bool $full = false): array`

Static method. Converts a raw DB row into the camelCase JSON shape. The `$relations` parameter is a keyed array:

```php
$relations = [
    'assignees' => [...],  // array of assignee objects for this task
    'labels' => [...],     // array of label objects for this task
    'subtasks' => [...],   // array of subtask objects (only when $full)
    'creator' => [...],    // creator user object (only when $full)
    'links' => [...],      // array of link objects (optional)
    'sprint' => [...],     // sprint object (optional)
];
```

Returns:

```php
[
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
    'projectId' => $row['project_id'],
    'createdById' => $row['created_by_id'],
    'createdAt' => date('c', strtotime($row['created_at'])),
    'updatedAt' => date('c', strtotime($row['updated_at'])),
    'deletedAt' => $row['deleted_at'] ? date('c', strtotime($row['deleted_at'])) : null,
    'project' => $row['project_rel_id'] ? [
        'id' => $row['project_rel_id'],
        'name' => $row['project_rel_name'],
    ] : null,
    'assignees' => $relations['assignees'] ?? [],
    'labels' => $relations['labels'] ?? [],
]
```

Conditionally add:
- If `$full`: add `'subtasks' => $relations['subtasks'] ?? []`
- If `$full`: add `'createdBy' => $relations['creator'] ?? null`
- If `isset($relations['links'])`: add `'links' => $relations['links']`
- If `isset($relations['sprint'])`: add `'sprint' => $relations['sprint']`

**IMPORTANT:** The `createdBy` key in the response (not `creator`). The `$relations` array uses `creator` internally, but the JSON response key is `createdBy` to match v1.

### Method 2: `fetchRelationsForTasks(array $taskIds, array $options = []): array`

Static method. Batch-fetches all relations for a set of task IDs.

Options:
- `$options['full']` (bool, default false) — include subtasks and creators
- `$options['includeLinks']` (bool, default false) — include task links
- `$options['includeSprint']` (bool, default false) — include sprint data

Returns a keyed structure:
```php
[
    'assignees' => [taskId => [assignee, ...], ...],
    'labels' => [taskId => [label, ...], ...],
    'subtasks' => [taskId => [subtask, ...], ...],   // only if full
    'creators' => [userId => creator, ...],           // only if full
    'links' => [taskId => [link, ...], ...],          // only if includeLinks
    'sprints' => [sprintId => sprint, ...],           // only if includeSprint
]
```

If `$taskIds` is empty, return empty arrays for all keys.

#### Assignees (always fetched):

```sql
SELECT ta.task_id, ta.id, ta.user_id, ta.assigned_at,
       u.id AS user_id_rel, u.email AS user_email, u.display_name AS user_display_name
FROM task_assignees ta
JOIN users u ON ta.user_id = u.id
WHERE ta.task_id IN (:placeholders)
```

Group by `task_id`. Each maps to:
```php
[
    'id' => $row['id'],
    'taskId' => $row['task_id'],
    'userId' => $row['user_id'],
    'assignedAt' => date('c', strtotime($row['assigned_at'])),
    'user' => [
        'id' => $row['user_id_rel'],
        'email' => $row['user_email'],
        'displayName' => $row['user_display_name'],
    ],
]
```

#### Labels (always fetched):

```sql
SELECT tl.task_id, tl.id, tl.label_id,
       l.id AS label_id_rel, l.name AS label_name, l.color AS label_color,
       l.created_by_id AS label_created_by_id, l.created_at AS label_created_at
FROM task_labels tl
JOIN labels l ON tl.label_id = l.id
WHERE tl.task_id IN (:placeholders)
```

Group by `task_id`. Each maps to:
```php
[
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
]
```

#### Subtasks (only if `$options['full']`):

```sql
SELECT s.id, s.title, s.completed, s.sort_order, s.task_id, s.created_at
FROM subtasks s
WHERE s.task_id IN (:placeholders)
ORDER BY s.sort_order ASC
```

Group by `task_id`. Each maps to:
```php
[
    'id' => $row['id'],
    'title' => $row['title'],
    'completed' => (bool) $row['completed'],
    'sortOrder' => (int) $row['sort_order'],
    'taskId' => $row['task_id'],
    'createdAt' => date('c', strtotime($row['created_at'])),
]
```

#### Creators (only if `$options['full']`):

Collect unique `created_by_id` values from the caller (passed via `$options['creatorIds']` — an array of user IDs). Batch-fetch:

```sql
SELECT id, email, display_name FROM users WHERE id IN (:placeholders)
```

Return as lookup: `[userId => ['id' => ..., 'email' => ..., 'displayName' => ...], ...]`

**Wait — design adjustment.** The caller doesn't always have access to the task rows when calling `fetchRelationsForTasks`. Better approach: accept `$taskRows` as a parameter instead of just `$taskIds`, OR have the caller pass creator IDs explicitly.

**Revised signature:**

```php
public static function fetchRelationsForTasks(array $taskIds, array $options = []): array
```

Where `$options` includes:
- `'full'` (bool)
- `'includeLinks'` (bool)
- `'includeSprint'` (bool)
- `'creatorIds'` (array of user IDs — required when `full` is true)
- `'sprintIds'` (array of sprint IDs — required when `includeSprint` is true)

This keeps the method signature clean. The caller extracts the IDs from their task rows and passes them in.

#### Links (only if `$options['includeLinks']`):

```sql
SELECT tl.id, tl.title, tl.url, tl.task_id, tl.created_by_id, tl.created_at,
       u.id AS user_id_rel, u.display_name AS user_display_name
FROM task_links tl
JOIN users u ON tl.created_by_id = u.id
WHERE tl.task_id IN (:placeholders)
ORDER BY tl.created_at DESC
```

Group by `task_id`. Each maps to:
```php
[
    'id' => $row['id'],
    'title' => $row['title'],
    'url' => $row['url'],
    'taskId' => $row['task_id'],
    'createdById' => $row['created_by_id'],
    'createdAt' => date('c', strtotime($row['created_at'])),
    'createdBy' => [
        'id' => $row['user_id_rel'],
        'displayName' => $row['user_display_name'],
    ],
]
```

#### Sprints (only if `$options['includeSprint']`):

Collect unique non-null sprint IDs from `$options['sprintIds']`. Batch-fetch:

```sql
SELECT id, name, start_date, end_date, status FROM sprints WHERE id IN (:placeholders)
```

Return as lookup: `[sprintId => ['id' => ..., 'name' => ..., 'startDate' => ..., 'endDate' => ..., 'status' => ...], ...]`

### Method 3: `buildInClause(array $ids, string $prefix): array`

Static helper. Returns `['clause' => ':p0, :p1, ...', 'params' => ['p0' => id0, ...]]`.

This is a utility extracted from the repeated IN-clause building pattern. Used by `fetchRelationsForTasks` and by route handlers.

```php
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
```

### Method 4: `getNextSortOrder(string $projectId): int`

Static method. Returns `MAX(sort_order) + 1` for non-deleted tasks in the project. Returns `0` if no tasks exist.

```php
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
```

---

## Part 2: Refactor SprintRoutes.php

Replace the `fetchTasksForSprints` method to use TaskModel for relation-fetching and mapping. Add the use statement at the top:

```php
use JamWork\Models\TaskModel;
```

### Refactored `fetchTasksForSprints`

The method keeps its signature and sprint-grouping logic, but delegates to TaskModel:

```php
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
```

### Refactor the sprint close inline mapping

In the `PUT /{id}/close` handler, replace the inline `array_map` closure that maps `$incompleteTasks` with:

```php
$mappedTasks = array_map(function ($row) {
    return TaskModel::mapTask($row, [], false);
}, $incompleteTasks);
```

**IMPORTANT:** The close endpoint's `incompleteTasks` don't include `project_rel_id` / `project_rel_name` columns (they're fetched with `SELECT *` from tasks only, no JOIN). So `mapTask` must handle missing `project_rel_id` gracefully — check with `isset($row['project_rel_id'])` or `$row['project_rel_id'] ?? null` in the `project` field mapping. Update `mapTask` accordingly:

```php
'project' => isset($row['project_rel_id']) && $row['project_rel_id'] ? [
    'id' => $row['project_rel_id'],
    'name' => $row['project_rel_name'],
] : null,
```

This handles both cases: when the JOIN alias is present and when it's absent.

---

## Part 3: TaskRoutes.php

Create `api/src/Routes/TaskRoutes.php`.

```php
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

class TaskRoutes
{
    private const UUID_PATTERN = '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i';
```

### Base query constant

```php
    private const FETCH_QUERY = '
        SELECT t.*,
               p.id AS project_rel_id, p.name AS project_rel_name
        FROM tasks t
        LEFT JOIN projects p ON t.project_id = p.id
    ';
```

### Route group structure

```php
    public static function register(App $app): void
    {
        $app->group('/tasks', function (RouteCollectorProxy $group) {

            // ============================================================
            // STATIC ROUTES (must come before /{id} parameterized routes)
            // CC10 will add: PUT /reorder, PUT /bulk-update, PATCH /bulk, POST /bulk-delete here
            // ============================================================

            // ============================================================
            // COLLECTION ROUTES
            // ============================================================

            // GET /tasks  — filtered list
            // POST /tasks — create

            // ============================================================
            // PARAMETERIZED ROUTES (/{id} and /{id}/*)
            // ============================================================

            // GET /tasks/{id}
            // PUT /tasks/{id}
            // DELETE /tasks/{id}
            // PUT /tasks/{id}/move

        })->add(new AuthMiddleware());
    }
```

---

### Endpoint 1: GET /tasks (filtered list)

```php
$group->get('', function (Request $request, Response $response) {
```

**Step 1:** Read query params:
```php
$params = $request->getQueryParams();
$userId = $request->getAttribute('userId');
```

**Step 2:** Build WHERE clause dynamically.

Start with base condition:
```php
$conditions = ['t.deleted_at IS NULL'];
$queryParams = [];
$joinClauses = [];
```

Apply filters:

- `projectId`:
```php
if (!empty($params['projectId'])) {
    $conditions[] = 't.project_id = :projectId';
    $queryParams['projectId'] = $params['projectId'];
}
```

- `status`:
```php
if (!empty($params['status'])) {
    $conditions[] = 't.status = :status';
    $queryParams['status'] = $params['status'];
}
```

- `priority`:
```php
if (!empty($params['priority'])) {
    $conditions[] = 't.priority = :priority';
    $queryParams['priority'] = $params['priority'];
}
```

- `assigneeId` (supports `me` shortcut):
```php
if (!empty($params['assigneeId'])) {
    $actualAssigneeId = $params['assigneeId'] === 'me' ? $userId : $params['assigneeId'];
    $conditions[] = 'EXISTS (SELECT 1 FROM task_assignees ta_filter WHERE ta_filter.task_id = t.id AND ta_filter.user_id = :assigneeId)';
    $queryParams['assigneeId'] = $actualAssigneeId;
}
```

Use `EXISTS` subquery rather than a JOIN to avoid row multiplication.

- `labelId`:
```php
if (!empty($params['labelId'])) {
    $conditions[] = 'EXISTS (SELECT 1 FROM task_labels tl_filter WHERE tl_filter.task_id = t.id AND tl_filter.label_id = :labelId)';
    $queryParams['labelId'] = $params['labelId'];
}
```

- `sprintId` (supports `null` string for unassigned):
```php
if (array_key_exists('sprintId', $params)) {
    if ($params['sprintId'] === 'null') {
        $conditions[] = 't.sprint_id IS NULL';
    } else {
        $conditions[] = 't.sprint_id = :sprintId';
        $queryParams['sprintId'] = $params['sprintId'];
    }
}
```

Use `array_key_exists` here because the client may pass `sprintId=null` as a query string (the value is the literal string `"null"`).

- `sprint=backlog`:
```php
if (($params['sprint'] ?? '') === 'backlog') {
    $conditions[] = 't.in_sprint_backlog = 1';
    $conditions[] = 't.sprint_id IS NULL';
}
```

**Step 3:** Build ORDER BY clause.

```php
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
```

For `dueDate`, use the CASE expression to push NULLs to the end regardless of sort direction.

**Step 4:** Execute the query:

```php
$db = Database::getInstance();
$whereClause = implode(' AND ', $conditions);
$sql = self::FETCH_QUERY . " WHERE {$whereClause} ORDER BY {$orderClause}";

$stmt = $db->prepare($sql);
$stmt->execute($queryParams);
$taskRows = $stmt->fetchAll();
```

**Step 5:** Fetch relations and assemble response:

```php
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
```

**IMPORTANT:** The list endpoint returns FULL task objects (with subtasks, createdBy, links, sprint). This matches v1's `buildTaskIncludes({ includeLinks: true, includeSprint: true })`.

---

### Endpoint 2: GET /tasks/{id} (single task)

```php
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
```

---

### Endpoint 3: POST /tasks (create)

```php
$group->post('', function (Request $request, Response $response) {
    $data = $request->getParsedBody() ?? [];

    $errors = Validator::validate($data, [
        'title' => 'required|min:1|max:255',
        'description' => 'optional|nullable',
        'notes' => 'optional|nullable',
        'status' => 'optional|in:todo,in_progress,review,done',
        'priority' => 'optional|in:low,medium,high,urgent',
        'dueDate' => 'optional|nullable|iso8601',
        'startDate' => 'optional|nullable|iso8601',
        'recurrence' => 'optional|nullable|in:daily,weekly,biweekly,monthly',
        'effort' => 'optional|nullable',
        'sprintId' => 'optional|nullable|uuid',
        'projectId' => 'required|uuid',
        'assigneeIds' => 'optional|uuid_array',
        'labelIds' => 'optional|uuid_array',
    ]);

    if (!empty($errors)) {
        return Validator::respondWithErrors($response, $errors);
    }
```

**Effort validation** (Validator doesn't have an `in` rule for integers, so validate manually):
```php
    if (isset($data['effort']) && $data['effort'] !== null) {
        if (!in_array((int) $data['effort'], [1, 2, 4, 8], true)) {
            $response->getBody()->write(json_encode([
                'errors' => [['field' => 'effort', 'message' => 'effort must be one of: 1, 2, 4, 8']],
            ]));
            return $response->withHeader('Content-Type', 'application/json')->withStatus(400);
        }
    }
```

**Verify project exists:**
```php
    $db = Database::getInstance();
    $stmt = $db->prepare('SELECT id FROM projects WHERE id = :id');
    $stmt->execute(['id' => $data['projectId']]);
    if (!$stmt->fetch()) {
        $response->getBody()->write(json_encode(['error' => 'Project not found']));
        return $response->withHeader('Content-Type', 'application/json')->withStatus(404);
    }
```

**Get next sort order and create:**
```php
    $userId = $request->getAttribute('userId');
    $id = Uuid::uuid4()->toString();
    $sortOrder = TaskModel::getNextSortOrder($data['projectId']);

    $assigneeIds = $data['assigneeIds'] ?? [];
    $labelIds = $data['labelIds'] ?? [];

    $db->beginTransaction();
    try {
        $stmt = $db->prepare(
            'INSERT INTO tasks (id, title, description, notes, status, priority, effort, due_date, start_date, sort_order, recurrence, sprint_id, project_id, created_by_id)
             VALUES (:id, :title, :description, :notes, :status, :priority, :effort, :due_date, :start_date, :sort_order, :recurrence, :sprint_id, :project_id, :created_by_id)'
        );
        $stmt->execute([
            'id' => $id,
            'title' => $data['title'],
            'description' => $data['description'] ?? null,
            'notes' => $data['notes'] ?? null,
            'status' => $data['status'] ?? 'todo',
            'priority' => $data['priority'] ?? 'medium',
            'effort' => isset($data['effort']) && $data['effort'] !== null ? (int) $data['effort'] : null,
            'due_date' => $data['dueDate'] ?? null,
            'start_date' => $data['startDate'] ?? null,
            'sort_order' => $sortOrder,
            'recurrence' => $data['recurrence'] ?? null,
            'sprint_id' => $data['sprintId'] ?? null,
            'project_id' => $data['projectId'],
            'created_by_id' => $userId,
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
```

**Re-fetch and return:**
```php
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
```

---

### Endpoint 4: PUT /tasks/{id} (update with recurrence clone)

This is the most complex endpoint. It must:
1. Validate input
2. Fetch the existing task (with current assignees and labels for clone)
3. Build dynamic update
4. Handle assigneeIds/labelIds replacement (delete-all, re-insert)
5. Detect recurrence clone trigger (status → done, recurrence non-null, was NOT done)
6. Execute clone within the same transaction
7. Return `{ task, clonedTask }`

```php
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
        'status' => 'optional|in:todo,in_progress,review,done',
        'priority' => 'optional|in:low,medium,high,urgent',
        'dueDate' => 'optional|nullable|iso8601',
        'startDate' => 'optional|nullable|iso8601',
        'recurrence' => 'optional|nullable|in:daily,weekly,biweekly,monthly',
        'effort' => 'optional|nullable',
        'sprintId' => 'optional|nullable|uuid',
        'assigneeIds' => 'optional|uuid_array',
        'labelIds' => 'optional|uuid_array',
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
```

**Build dynamic update:**
```php
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
        $updateParams['due_date'] = $data['dueDate'];
    }
    if (array_key_exists('startDate', $data)) {
        $updates[] = 'start_date = :start_date';
        $updateParams['start_date'] = $data['startDate'];
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
```

**Execute transaction:**
```php
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
                'INSERT INTO tasks (id, title, description, notes, status, priority, effort, due_date, start_date, sort_order, recurrence, sprint_id, project_id, created_by_id)
                 VALUES (:id, :title, :description, :notes, :status, :priority, :effort, :due_date, :start_date, :sort_order, :recurrence, :sprint_id, :project_id, :created_by_id)'
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
            ]);

            // Clone assignees from EXISTING task (not from request body)
            $stmt = $db->prepare('SELECT user_id FROM task_assignees WHERE task_id = :taskId');
            $stmt->execute(['taskId' => $id]);
            $existingAssignees = $stmt->fetchAll();

            if (!empty($existingAssignees)) {
                $stmt = $db->prepare(
                    'INSERT INTO task_assignees (id, task_id, user_id) VALUES (:id, :task_id, :user_id)'
                );
                foreach ($existingAssignees as $a) {
                    $stmt->execute([
                        'id' => Uuid::uuid4()->toString(),
                        'task_id' => $clonedTaskId,
                        'user_id' => $a['user_id'],
                    ]);
                }
            }

            // Clone labels from EXISTING task
            $stmt = $db->prepare('SELECT label_id FROM task_labels WHERE task_id = :taskId');
            $stmt->execute(['taskId' => $id]);
            $existingLabels = $stmt->fetchAll();

            if (!empty($existingLabels)) {
                $stmt = $db->prepare(
                    'INSERT INTO task_labels (id, task_id, label_id) VALUES (:id, :task_id, :label_id)'
                );
                foreach ($existingLabels as $l) {
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
```

**CRITICAL NOTE on recurrence clone assignees/labels:** The clone copies the EXISTING task's assignees and labels — NOT the updated ones from the request body. This is because in v1, `existingTask.assignees` and `existingTask.labels` are read BEFORE the update. However, note that if `assigneeIds` was in the request body, we already replaced them on the original task above. So we need to fetch the CURRENT assignees (post-update) for the clone.

**Wait — v1 behavior analysis:** In v1, the transaction does:
1. Update the task (including assignee/label replacement)
2. Check clone condition on the UPDATED task
3. Clone from `existingTask` (pre-update snapshot) for title, description, notes, priority, effort, recurrence
4. Clone assignees from `existingTask.assignees` (pre-update)
5. Clone labels from `existingTask.labels` (pre-update)

So v1 clones the PRE-UPDATE assignees and labels. This means if a user marks a task done AND changes assignees in the same request, the clone gets the OLD assignees. This is intentional v1 behavior.

**FIX:** The clone should use the pre-update assignees/labels. But we already deleted them if `assigneeIds` was in the body. So we need to **snapshot the assignees and labels BEFORE the replacement**.

Revised approach — before the transaction, fetch existing assignees and labels:
```php
    // Snapshot existing assignees and labels for potential clone
    $stmt = $db->prepare('SELECT user_id FROM task_assignees WHERE task_id = :taskId');
    $stmt->execute(['taskId' => $id]);
    $existingAssigneeRows = $stmt->fetchAll();

    $stmt = $db->prepare('SELECT label_id FROM task_labels WHERE task_id = :taskId');
    $stmt->execute(['taskId' => $id]);
    $existingLabelRows = $stmt->fetchAll();
```

Then in the clone section, use `$existingAssigneeRows` and `$existingLabelRows` instead of re-querying.

**Re-fetch updated task and optional clone, return:**
```php
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
```

---

### Endpoint 5: DELETE /tasks/{id} (soft-delete)

```php
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
```

---

### Endpoint 6: PUT /tasks/{id}/move

```php
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
```

---

## Part 4: index.php Wiring

Add the import and registration:

```php
use JamWork\Routes\TaskRoutes;
```

Register after SprintRoutes:
```php
SprintRoutes::register($app);
TaskRoutes::register($app);
```

---

## Testing Verification

After implementation, verify with curl:

```bash
# Assumes PHP dev server running and logged in with cookies.txt
# Assumes projects and sprints exist from prior CC prompts

# --- CREATE ---
curl -s -b cookies.txt -X POST http://127.0.0.1:8000/api/tasks \
  -H 'Content-Type: application/json' \
  -d '{"title":"Test Task","projectId":"<PROJECT_ID>","priority":"high","status":"todo"}' | jq .

# Verify 201 status and full response shape with nested assignees, labels, subtasks, createdBy, links, sprint, project

# Create with assignees and labels
curl -s -b cookies.txt -X POST http://127.0.0.1:8000/api/tasks \
  -H 'Content-Type: application/json' \
  -d '{"title":"Assigned Task","projectId":"<PROJECT_ID>","assigneeIds":["<USER_ID>"],"labelIds":["<LABEL_ID>"]}' | jq .

# --- LIST ---
# All tasks
curl -s -b cookies.txt "http://127.0.0.1:8000/api/tasks" | jq .

# Filter by project
curl -s -b cookies.txt "http://127.0.0.1:8000/api/tasks?projectId=<PROJECT_ID>" | jq .

# Filter by assignee (me)
curl -s -b cookies.txt "http://127.0.0.1:8000/api/tasks?assigneeId=me" | jq .

# Filter by status
curl -s -b cookies.txt "http://127.0.0.1:8000/api/tasks?status=todo" | jq .

# Sort by dueDate
curl -s -b cookies.txt "http://127.0.0.1:8000/api/tasks?sortBy=dueDate&sortDir=asc" | jq .

# Backlog filter
curl -s -b cookies.txt "http://127.0.0.1:8000/api/tasks?sprint=backlog" | jq .

# Null sprintId filter
curl -s -b cookies.txt "http://127.0.0.1:8000/api/tasks?sprintId=null" | jq .

# --- SINGLE ---
curl -s -b cookies.txt http://127.0.0.1:8000/api/tasks/<TASK_ID> | jq .

# --- UPDATE ---
curl -s -b cookies.txt -X PUT http://127.0.0.1:8000/api/tasks/<TASK_ID> \
  -H 'Content-Type: application/json' \
  -d '{"title":"Updated Title","priority":"urgent"}' | jq .

# Verify clonedTask is null when not transitioning to done

# --- RECURRENCE CLONE ---
# First set recurrence on a task
curl -s -b cookies.txt -X PUT http://127.0.0.1:8000/api/tasks/<TASK_ID> \
  -H 'Content-Type: application/json' \
  -d '{"recurrence":"weekly","dueDate":"2026-04-01T00:00:00Z"}' | jq .

# Now mark done — should trigger clone
curl -s -b cookies.txt -X PUT http://127.0.0.1:8000/api/tasks/<TASK_ID> \
  -H 'Content-Type: application/json' \
  -d '{"status":"done"}' | jq .

# Verify response has both task (status=done) and clonedTask (status=todo, dueDate shifted 7 days)

# --- DELETE ---
curl -s -b cookies.txt -X DELETE http://127.0.0.1:8000/api/tasks/<TASK_ID> | jq .

# Verify soft-deleted (not returned in list)

# --- MOVE ---
curl -s -b cookies.txt -X PUT http://127.0.0.1:8000/api/tasks/<TASK_ID>/move \
  -H 'Content-Type: application/json' \
  -d '{"projectId":"<OTHER_PROJECT_ID>"}' | jq .

# --- SPRINT ROUTES REGRESSION ---
# Verify SprintRoutes still work after refactor
curl -s -b cookies.txt "http://127.0.0.1:8000/api/sprints?includeTasks=true" | jq .
curl -s -b cookies.txt http://127.0.0.1:8000/api/sprints/<SPRINT_ID> | jq .

# --- VALIDATION ---
# Missing title
curl -s -b cookies.txt -X POST http://127.0.0.1:8000/api/tasks \
  -H 'Content-Type: application/json' \
  -d '{"projectId":"<PROJECT_ID>"}' | jq .

# Invalid effort
curl -s -b cookies.txt -X POST http://127.0.0.1:8000/api/tasks \
  -H 'Content-Type: application/json' \
  -d '{"title":"Bad Effort","projectId":"<PROJECT_ID>","effort":3}' | jq .

# Invalid UUID
curl -s -b cookies.txt http://127.0.0.1:8000/api/tasks/not-a-uuid | jq .

# Non-existent task
curl -s -b cookies.txt http://127.0.0.1:8000/api/tasks/00000000-0000-0000-0000-000000000000 | jq .

# Move to non-existent project
curl -s -b cookies.txt -X PUT http://127.0.0.1:8000/api/tasks/<TASK_ID>/move \
  -H 'Content-Type: application/json' \
  -d '{"projectId":"00000000-0000-0000-0000-000000000000"}' | jq .
```

## Verification Checklist

### TaskModel.php
- [ ] `mapTask` handles missing `project_rel_id` gracefully (for callers that don't JOIN projects)
- [ ] `mapTask` conditionally includes `subtasks`, `createdBy`, `links`, `sprint` based on params
- [ ] `mapTask` response key is `createdBy` (not `creator`)
- [ ] `fetchRelationsForTasks` returns empty arrays when `$taskIds` is empty
- [ ] `fetchRelationsForTasks` fetches assignees and labels always
- [ ] `fetchRelationsForTasks` fetches subtasks and creators only when `full` is true
- [ ] `fetchRelationsForTasks` fetches links only when `includeLinks` is true
- [ ] `fetchRelationsForTasks` fetches sprints only when `includeSprint` is true
- [ ] `buildInClause` returns `['clause' => ..., 'params' => ...]`
- [ ] `getNextSortOrder` returns 0 when no tasks exist
- [ ] Type casting: effort→int|null, completed→bool, inSprintBacklog→bool, sortOrder→int
- [ ] ISO 8601 dates via `date('c', ...)` with null checks

### SprintRoutes.php Refactor
- [ ] `use JamWork\Models\TaskModel;` added at top
- [ ] `fetchTasksForSprints` uses `TaskModel::buildInClause`
- [ ] `fetchTasksForSprints` delegates to `TaskModel::fetchRelationsForTasks`
- [ ] `fetchTasksForSprints` delegates to `TaskModel::mapTask`
- [ ] Sprint close inline mapping replaced with `TaskModel::mapTask`
- [ ] GET /sprints with `includeTasks=true` still works (regression)
- [ ] GET /sprints/:id full expansion still works (regression)
- [ ] PUT /sprints/:id/close still works (regression)
- [ ] No new public methods or changed response shapes

### TaskRoutes.php
- [ ] Route group on `/tasks` with `AuthMiddleware`
- [ ] Comment block marking where CC10 will add static routes
- [ ] GET /tasks returns full task objects (subtasks, createdBy, links, sprint)
- [ ] GET /tasks filters: projectId, status, priority, assigneeId (with `me`), labelId, sprintId (with `null`), sprint=backlog
- [ ] GET /tasks sorting: sortOrder (default), dueDate (NULLs last), priority, createdAt, title, status
- [ ] GET /tasks/{id} returns full task with all relations
- [ ] POST /tasks creates with assigneeIds/labelIds in transaction, returns 201
- [ ] POST /tasks defaults: status=todo, priority=medium
- [ ] POST /tasks validates effort enum manually (1,2,4,8)
- [ ] POST /tasks verifies project exists (404 if not)
- [ ] POST /tasks computes sortOrder via `TaskModel::getNextSortOrder`
- [ ] PUT /tasks/{id} builds dynamic SET clause with `array_key_exists` for nullable fields
- [ ] PUT /tasks/{id} replaces assignees/labels with delete-all + re-insert when provided
- [ ] PUT /tasks/{id} recurrence clone triggers only on status→done + recurrence non-null + was NOT done
- [ ] PUT /tasks/{id} clone copies pre-update assignees and labels (snapshot before replacement)
- [ ] PUT /tasks/{id} clone calculates shifted dates correctly (daily +1, weekly +7, biweekly +14, monthly +1 month)
- [ ] PUT /tasks/{id} clone gets status=todo, new sortOrder, new UUID, createdById=current user
- [ ] PUT /tasks/{id} returns `{ task, clonedTask }` (clonedTask is null when no clone)
- [ ] DELETE /tasks/{id} soft-deletes (sets deleted_at)
- [ ] DELETE /tasks/{id} checks task exists and is not already soft-deleted
- [ ] PUT /tasks/{id}/move verifies task exists and target project exists
- [ ] PUT /tasks/{id}/move recalculates sortOrder for target project
- [ ] All endpoints validate UUID params at handler top → 400
- [ ] All `WHERE` on tasks include `deleted_at IS NULL`
- [ ] IN clauses use numbered named placeholders

### index.php
- [ ] `use JamWork\Routes\TaskRoutes;` added
- [ ] `TaskRoutes::register($app);` added after SprintRoutes
