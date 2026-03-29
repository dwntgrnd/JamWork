# JW-CC08b — Sprint Close + Task Expansion

## Context

JamWork-v2 is a Vite + React SPA with a PHP/MySQL backend (Slim 4 framework).
CC08a (Sprint CRUD — 5 basic endpoints) has been implemented and committed.
This prompt adds the remaining sprint functionality:
1. `includeTasks=true` query param support on GET /sprints
2. Full task expansion on GET /sprints/:id
3. PUT /sprints/:id/close (sprint close transaction)

## Existing Patterns (MUST follow exactly)

Read these files before writing any code:

- `api/src/Routes/SprintRoutes.php` — **the file you will modify** (created in CC08a)
- `api/src/Routes/ProjectRoutes.php` — response shape reference
- `api/src/Lib/Validator.php` — validation rules
- `api/src/Lib/Database.php` — PDO singleton
- `api/index.php` — verify SprintRoutes is already registered (it should be from CC08a)

### Key conventions (non-negotiable):

All conventions from CC08a apply. Additional for this prompt:

1. **Multi-query approach for task relations:** Fetch tasks first, then batch-fetch related entities (assignees, labels, etc.) in separate queries using `WHERE task_id IN (...)`. Group in PHP. Do NOT attempt a single massive JOIN — the denormalized rows would be unwieldy.
2. **PDO transactions** via `$db->beginTransaction()`, `$db->commit()`, `$db->rollBack()` for the sprint close endpoint.
3. **Prepared statement reuse:** When iterating sprints for task expansion, prepare statements once outside the loop, execute inside.

## File to Modify

### `api/src/Routes/SprintRoutes.php`

All changes are to this file. No new files are created. No changes to index.php.

---

### Change 1: Add a `fetchTasksForSprints` helper method

Add a new **private static** method that fetches tasks with relations for a given set of sprint IDs. This method is used by both GET /sprints (with `includeTasks=true`) and GET /sprints/:id.

The method accepts two parameters:
- `array $sprintIds` — the sprint IDs to fetch tasks for
- `bool $full` — if `true`, include subtasks and createdBy (for single sprint view); if `false`, lighter shape (for list view)

```php
/**
 * Fetch tasks with relations for the given sprint IDs.
 *
 * @param array $sprintIds UUIDs of sprints to fetch tasks for
 * @param bool $full If true, include subtasks and createdBy (single sprint view)
 * @return array Map of sprintId => array of task objects
 */
private static function fetchTasksForSprints(array $sprintIds, bool $full = false): array
```

**Step 1: Fetch base tasks**

```sql
SELECT t.*,
       p.id AS project_rel_id, p.name AS project_rel_name
FROM tasks t
LEFT JOIN projects p ON t.project_id = p.id
WHERE t.sprint_id IN (:placeholders)
  AND t.deleted_at IS NULL
ORDER BY t.sort_order ASC
```

Build the IN clause dynamically using numbered placeholders:
```php
if (empty($sprintIds)) {
    return [];
}

$db = Database::getInstance();

// Build IN clause
$placeholders = [];
$params = [];
foreach ($sprintIds as $i => $sid) {
    $key = "sid{$i}";
    $placeholders[] = ":{$key}";
    $params[$key] = $sid;
}
$inClause = implode(', ', $placeholders);

$sql = "
    SELECT t.*,
           p.id AS project_rel_id, p.name AS project_rel_name
    FROM tasks t
    LEFT JOIN projects p ON t.project_id = p.id
    WHERE t.sprint_id IN ({$inClause})
      AND t.deleted_at IS NULL
    ORDER BY t.sort_order ASC
";
$stmt = $db->prepare($sql);
$stmt->execute($params);
$taskRows = $stmt->fetchAll();
```

Collect task IDs for relation queries:
```php
$taskIds = array_column($taskRows, 'id');
```

If no tasks found, return early — an empty map with each sprint ID mapped to `[]`.

**Step 2: Fetch assignees (always)**

```sql
SELECT ta.task_id, ta.id, ta.user_id, ta.assigned_at,
       u.id AS user_id_rel, u.email AS user_email, u.display_name AS user_display_name
FROM task_assignees ta
JOIN users u ON ta.user_id = u.id
WHERE ta.task_id IN (:placeholders)
```

Build the IN clause the same way (using task IDs). Group results by `task_id` into an associative array:
```php
$assigneesByTask = []; // taskId => [assignee, ...]
```

Each assignee maps to:
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

**Step 3: Fetch labels (always)**

```sql
SELECT tl.task_id, tl.id, tl.label_id,
       l.id AS label_id_rel, l.name AS label_name, l.color AS label_color,
       l.created_by_id AS label_created_by_id, l.created_at AS label_created_at
FROM task_labels tl
JOIN labels l ON tl.label_id = l.id
WHERE tl.task_id IN (:placeholders)
```

Group by `task_id`. Each task-label maps to:
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

**Step 4: Fetch subtasks (only if `$full` is true)**

```sql
SELECT s.id, s.title, s.completed, s.sort_order, s.task_id, s.created_at
FROM subtasks s
WHERE s.task_id IN (:placeholders)
ORDER BY s.sort_order ASC
```

Group by `task_id`. Each subtask maps to:
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

**Step 5: Fetch createdBy users (only if `$full` is true)**

Instead of a separate query, we can collect `created_by_id` values from task rows and batch-fetch:

```sql
SELECT id, email, display_name FROM users WHERE id IN (:placeholders)
```

Build a lookup map `$creatorsById = [userId => userObject, ...]` where each maps to:
```php
[
    'id' => $row['id'],
    'email' => $row['email'],
    'displayName' => $row['display_name'],
]
```

**Step 6: Assemble task objects and group by sprint**

Map each task row into the response shape, attaching the fetched relations:

```php
$result = []; // sprintId => [task, ...]
// Initialize all sprint IDs with empty arrays
foreach ($sprintIds as $sid) {
    $result[$sid] = [];
}

foreach ($taskRows as $row) {
    $taskId = $row['id'];
    $sprintId = $row['sprint_id'];

    $task = [
        'id' => $taskId,
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
        'projectId' => $row['project_id'],
        'createdById' => $row['created_by_id'],
        'createdAt' => date('c', strtotime($row['created_at'])),
        'updatedAt' => date('c', strtotime($row['updated_at'])),
        'project' => $row['project_rel_id'] ? [
            'id' => $row['project_rel_id'],
            'name' => $row['project_rel_name'],
        ] : null,
        'assignees' => $assigneesByTask[$taskId] ?? [],
        'labels' => $labelsByTask[$taskId] ?? [],
    ];

    if ($full) {
        $task['subtasks'] = $subtasksByTask[$taskId] ?? [];
        $task['creator'] = $creatorsById[$row['created_by_id']] ?? null;
    }

    $result[$sprintId][] = $task;
}

return $result;
```

**IMPORTANT response shape notes:**
- The `project` field on each task is a nested object `{ id, name }` or `null`. Use `project_rel_id` / `project_rel_name` aliases to avoid collision with the task's own `project_id`.
- `assignees` is always an array (empty if none). Each assignee includes a nested `user` object.
- `labels` is always an array. Each entry includes a nested `label` object with the full label data.
- `subtasks` and `creator` are ONLY included when `$full` is true (GET /:id). They are OMITTED from the list endpoint's `includeTasks` shape.
- `effort` must be cast to `int` or `null` — never returned as a string.
- `completed` on subtasks must be cast to `bool` — MySQL returns `0`/`1`.
- `inSprintBacklog` field: map `in_sprint_backlog` to `inSprintBacklog` as a boolean: `(bool) $row['in_sprint_backlog']`. Include this in the task object.

---

### Change 2: Extend GET /sprints to support `includeTasks=true`

In the existing GET handler, after the stats block, add support for `includeTasks`:

**Step 1:** Read the query param (add this alongside the existing param reading at the top):
```php
$includeTasks = ($params['includeTasks'] ?? '') === 'true';
```

**Step 2:** After stats computation (and after building the `$sprints` array), if `includeTasks` is true:
```php
if ($includeTasks) {
    $sprintIds = array_column($sprints, 'id');
    $tasksBySprint = self::fetchTasksForSprints($sprintIds, false);

    foreach ($sprints as &$sprint) {
        $sprint['tasks'] = $tasksBySprint[$sprint['id']] ?? [];
    }
    unset($sprint);
}
```

This adds a `tasks` array to each sprint in the response. The `false` parameter means lightweight shape (no subtasks, no createdBy).

---

### Change 3: Extend GET /sprints/{id} to include full task expansion

Replace the existing single-sprint handler to add task expansion after fetching the sprint:

After the existing fetch and 404 check, add:
```php
$sprint = self::mapSprint($row);

// Fetch full task expansion
$tasksBySprint = self::fetchTasksForSprints([$id], true);
$sprint['tasks'] = $tasksBySprint[$id] ?? [];

// Add _count.tasks filtered for non-deleted (already in mapSprint via FETCH_QUERY)
// The _count is already set by mapSprint — no change needed.
```

Return the sprint with the `tasks` array included.

---

### Change 4: Add PUT /sprints/{id}/close endpoint

This is a NEW route within the existing group. Add it **before** the `/{id}` PUT route (static routes before parameterized routes — Decision #21 from JW-S05).

**IMPORTANT route ordering:** The `/{id}/close` route MUST be registered before the `/{id}` PUT route. In Slim 4, `{id}` would greedily match "close" as an ID value if it comes first. Reorder the routes inside the group so that:
1. GET '' (list) — already exists
2. POST '' (create) — already exists
3. PUT '/{id}/close' — NEW, must come before /{id} PUT
4. GET '/{id}' — already exists
5. PUT '/{id}' — already exists
6. DELETE '/{id}' — already exists

Wait — actually, `/{id}/close` is a two-segment path while `/{id}` is one segment. Slim 4's FastRoute dispatcher matches by segment count first, so `/{id}/close` won't conflict with `/{id}`. However, to be safe and consistent with Decision #21, still register `/{id}/close` before the parameterized `/{id}` routes. Move the new route to appear after the POST handler and before the GET `/{id}` handler.

#### PUT /sprints/{id}/close

**Step 1:** Validate UUID param at handler top → 400.

**Step 2:** Parse and validate request body:
```php
$data = $request->getParsedBody() ?? [];

$errors = Validator::validate($data, [
    'action' => 'required|in:backlog,next_sprint',
    'nextSprintId' => 'optional|uuid',
]);

if (!empty($errors)) {
    return Validator::respondWithErrors($response, $errors);
}
```

**Step 3:** If action is `next_sprint`, `nextSprintId` is required:
```php
if ($data['action'] === 'next_sprint' && empty($data['nextSprintId'])) {
    $response->getBody()->write(json_encode([
        'error' => 'Next sprint ID is required when action is "next_sprint"',
    ]));
    return $response->withHeader('Content-Type', 'application/json')->withStatus(400);
}
```

**Step 4:** Fetch the sprint and verify it exists:
```php
$stmt = $db->prepare('SELECT id, status FROM sprints WHERE id = :id');
$stmt->execute(['id' => $id]);
$sprint = $stmt->fetch();

if (!$sprint) {
    $response->getBody()->write(json_encode(['error' => 'Sprint not found']));
    return $response->withHeader('Content-Type', 'application/json')->withStatus(404);
}
```

**Step 5:** Fetch incomplete tasks (status != 'done', not soft-deleted):
```php
$stmt = $db->prepare(
    'SELECT * FROM tasks WHERE sprint_id = :sprintId AND deleted_at IS NULL AND status != :doneStatus'
);
$stmt->execute(['sprintId' => $id, 'doneStatus' => 'done']);
$incompleteTasks = $stmt->fetchAll();
```

**Step 6:** If action is `next_sprint`, verify the next sprint exists:
```php
if ($data['action'] === 'next_sprint') {
    $stmt = $db->prepare('SELECT id FROM sprints WHERE id = :id');
    $stmt->execute(['id' => $data['nextSprintId']]);
    if (!$stmt->fetch()) {
        $response->getBody()->write(json_encode(['error' => 'Next sprint not found']));
        return $response->withHeader('Content-Type', 'application/json')->withStatus(404);
    }
}
```

**Step 7:** Execute the transaction:
```php
$db->beginTransaction();
try {
    // Close the sprint
    $stmt = $db->prepare('UPDATE sprints SET status = :status WHERE id = :id');
    $stmt->execute(['status' => 'completed', 'id' => $id]);

    // Move incomplete tasks
    if (!empty($incompleteTasks)) {
        $taskIds = array_column($incompleteTasks, 'id');

        // Build IN clause
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
```

**Step 8:** Map incomplete tasks for the response. Return flat task objects (basic fields, no nested relations — matches v1 behavior):
```php
$mappedTasks = array_map(function ($row) {
    return [
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
    ];
}, $incompleteTasks);
```

**IMPORTANT:** The `sprintId` in the returned `incompleteTasks` still shows the **original** sprint ID (because we fetched them before the UPDATE). This matches v1 behavior — the v1 endpoint fetches tasks before the transaction, so the returned objects reflect pre-transaction state. Do NOT re-fetch after the transaction.

Response:
```php
$response->getBody()->write(json_encode([
    'message' => 'Sprint closed successfully',
    'incompleteTasks' => $mappedTasks,
]));
return $response->withHeader('Content-Type', 'application/json')->withStatus(200);
```

---

## Route Registration Order

After all changes, the routes inside the `$app->group('/sprints', ...)` closure should appear in this order:

1. `$group->get('', ...)` — list sprints
2. `$group->post('', ...)` — create sprint
3. `$group->put('/{id}/close', ...)` — close sprint (static path segment before parameterized)
4. `$group->get('/{id}', ...)` — get single sprint
5. `$group->put('/{id}', ...)` — update sprint
6. `$group->delete('/{id}', ...)` — delete sprint

---

## Testing Verification

After implementation, verify with curl:

```bash
# Assumes PHP dev server running and logged in with cookies.txt
# Assumes at least one sprint exists from CC08a testing

# --- Task expansion ---
# First, manually insert a test task into a sprint (TaskRoutes don't exist yet):
# mysql -u root -p jamwork -e "INSERT INTO tasks (id, title, status, priority, sort_order, project_id, sprint_id, created_by_id) VALUES ('22222222-2222-2222-2222-222222222222', 'Sprint Test Task', 'todo', 'high', 0, '<PROJECT_ID>', '<SPRINT_ID>', '<USER_ID>');"

# List sprints with tasks
curl -s -b cookies.txt "http://127.0.0.1:8000/api/sprints?includeTasks=true" | jq .

# List sprints with tasks AND stats
curl -s -b cookies.txt "http://127.0.0.1:8000/api/sprints?includeTasks=true&include=stats" | jq .

# Get single sprint (should include full task expansion)
curl -s -b cookies.txt http://127.0.0.1:8000/api/sprints/<SPRINT_ID> | jq .

# Verify task shape has assignees and labels arrays (even if empty)
curl -s -b cookies.txt http://127.0.0.1:8000/api/sprints/<SPRINT_ID> | jq '.sprint.tasks[0].assignees'
curl -s -b cookies.txt http://127.0.0.1:8000/api/sprints/<SPRINT_ID> | jq '.sprint.tasks[0].labels'

# --- Sprint close ---
# Create two sprints for testing close
curl -s -b cookies.txt -X POST http://127.0.0.1:8000/api/sprints \
  -H 'Content-Type: application/json' \
  -d '{"name":"Close Test Sprint","startDate":"2026-04-01T00:00:00Z","endDate":"2026-04-15T00:00:00Z"}' | jq .

curl -s -b cookies.txt -X POST http://127.0.0.1:8000/api/sprints \
  -H 'Content-Type: application/json' \
  -d '{"name":"Next Sprint","startDate":"2026-04-16T00:00:00Z","endDate":"2026-04-30T00:00:00Z"}' | jq .

# Insert a task into the first sprint (replace IDs):
# mysql -u root -p jamwork -e "INSERT INTO tasks (id, title, status, priority, sort_order, project_id, sprint_id, created_by_id) VALUES ('33333333-3333-3333-3333-333333333333', 'Incomplete Task', 'in_progress', 'medium', 0, '<PROJECT_ID>', '<CLOSE_TEST_SPRINT_ID>', '<USER_ID>');"

# Close sprint — move to backlog
curl -s -b cookies.txt -X PUT http://127.0.0.1:8000/api/sprints/<CLOSE_TEST_SPRINT_ID>/close \
  -H 'Content-Type: application/json' \
  -d '{"action":"backlog"}' | jq .

# Verify task's sprintId is now null:
# mysql -u root -p jamwork -e "SELECT id, sprint_id FROM tasks WHERE id = '33333333-3333-3333-3333-333333333333';"

# Close sprint — move to next sprint
# (First, re-assign the task back and create a new sprint to close)
curl -s -b cookies.txt -X PUT http://127.0.0.1:8000/api/sprints/<ANOTHER_SPRINT_ID>/close \
  -H 'Content-Type: application/json' \
  -d '{"action":"next_sprint","nextSprintId":"<NEXT_SPRINT_ID>"}' | jq .

# --- Validation tests ---
# Missing action
curl -s -b cookies.txt -X PUT http://127.0.0.1:8000/api/sprints/<SPRINT_ID>/close \
  -H 'Content-Type: application/json' \
  -d '{}' | jq .

# Invalid action
curl -s -b cookies.txt -X PUT http://127.0.0.1:8000/api/sprints/<SPRINT_ID>/close \
  -H 'Content-Type: application/json' \
  -d '{"action":"discard"}' | jq .

# next_sprint without nextSprintId
curl -s -b cookies.txt -X PUT http://127.0.0.1:8000/api/sprints/<SPRINT_ID>/close \
  -H 'Content-Type: application/json' \
  -d '{"action":"next_sprint"}' | jq .

# Non-existent next sprint
curl -s -b cookies.txt -X PUT http://127.0.0.1:8000/api/sprints/<SPRINT_ID>/close \
  -H 'Content-Type: application/json' \
  -d '{"action":"next_sprint","nextSprintId":"00000000-0000-0000-0000-000000000000"}' | jq .
```

## Verification Checklist

- [ ] `fetchTasksForSprints` helper method added as private static
- [ ] GET /sprints with `includeTasks=true` returns tasks array on each sprint
- [ ] GET /sprints without `includeTasks` does NOT include tasks array (no regression)
- [ ] GET /sprints/:id returns full task expansion (assignees, labels, subtasks, createdBy)
- [ ] List endpoint tasks include assignees + labels but NOT subtasks or createdBy
- [ ] Single endpoint tasks include assignees + labels + subtasks + createdBy
- [ ] Task `effort` is cast to int or null (not string)
- [ ] Subtask `completed` is cast to bool (not 0/1)
- [ ] Task `inSprintBacklog` is cast to bool
- [ ] Task `project` is nested object `{id, name}` or null
- [ ] Assignee `user` is nested object `{id, email, displayName}`
- [ ] Label `label` is nested object with full label data
- [ ] Subtasks ordered by `sort_order ASC`
- [ ] Tasks ordered by `sort_order ASC`
- [ ] PUT /sprints/{id}/close registered BEFORE PUT /sprints/{id} in route order
- [ ] Sprint close uses PDO transaction (`beginTransaction`, `commit`, `rollBack`)
- [ ] Sprint close validates `action` as required enum: `backlog` or `next_sprint`
- [ ] Sprint close requires `nextSprintId` when action is `next_sprint`
- [ ] Sprint close verifies next sprint exists when action is `next_sprint`
- [ ] Sprint close sets sprint status to `completed`
- [ ] Sprint close moves incomplete tasks (status != done, not soft-deleted) to backlog (sprintId = null) or next sprint
- [ ] Sprint close returns `{ message, incompleteTasks }` with status 200
- [ ] `incompleteTasks` contains flat task objects (no nested relations)
- [ ] `incompleteTasks` reflects pre-transaction state (original sprintId)
- [ ] Empty `incompleteTasks` array returned when all tasks are done
- [ ] Stats and includeTasks can be combined: `?includeTasks=true&include=stats`
- [ ] IN clause uses numbered placeholders (`:sid0`, `:sid1`, etc.) — not string interpolation
- [ ] No new files created — all changes in SprintRoutes.php only
