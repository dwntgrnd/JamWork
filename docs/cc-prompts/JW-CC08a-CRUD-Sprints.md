# JW-CC08a — CRUD: Sprints

## Context

JamWork-v2 is a Vite + React SPA with a PHP/MySQL backend (Slim 4 framework).
Phase 3 (auth, admin, workspace settings) is complete.
CC07a (Projects & Labels) and CC07b (Milestones & Task Links) are implemented and committed.
This prompt implements Sprint CRUD — the basic 5 endpoints without task expansion or sprint close.

**What this prompt does NOT cover (deferred to CC08b):**
- The `includeTasks=true` query param on GET /sprints (task relation expansion)
- Full task expansion on GET /sprints/:id
- PUT /sprints/:id/close (sprint close transaction)

## Existing Patterns (MUST follow exactly)

Read these files before writing any code:

- `api/src/Routes/ProjectRoutes.php` — **primary pattern reference** (CC07a, closest match)
- `api/src/Routes/MilestoneRoutes.php` — CC07b reference (similar field patterns: projectId, dates)
- `api/src/Lib/Validator.php` — validation rules
- `api/src/Lib/Database.php` — PDO singleton
- `api/src/Middleware/AuthMiddleware.php` — auth middleware
- `api/index.php` — route wiring

### Key conventions (non-negotiable):

1. Static `register(App $app): void` method on each Routes class
2. `$app->group('/path', function (RouteCollectorProxy $group) { ... })` for route groups
3. `->add(new AuthMiddleware())` applied to the **group** (not individual routes)
4. `Validator::validate($data, [...])` at the top of each handler, return early on errors
5. `Ramsey\Uuid\Uuid::uuid4()->toString()` for new entity IDs
6. All responses: `$response->getBody()->write(json_encode([...]))`, `->withHeader('Content-Type', 'application/json')`, `->withStatus(XXX)`
7. snake_case DB columns → camelCase JSON keys
8. Timestamps as ISO 8601 via `date('c', strtotime(...))` — nullable timestamps return JSON `null`
9. `$request->getAttribute('userId')` for authenticated user ID
10. SELECT before UPDATE/DELETE to check existence → 404 if not found
11. UUID route params validated via regex at handler top → 400 if invalid

## File to Create

### `api/src/Routes/SprintRoutes.php`

**Namespace:** `JamWork\Routes`
**Group path:** `/sprints`
**Auth:** All endpoints require `AuthMiddleware` (group-level)

Define a class constant for the UUID pattern (same as other route files):
```php
private const UUID_PATTERN = '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i';
```

Define a constant for the fetch query that includes the project relation and task count:
```php
private const FETCH_QUERY = '
    SELECT s.*,
           p.id AS project_id_rel, p.name AS project_name,
           (SELECT COUNT(*) FROM tasks t WHERE t.sprint_id = s.id AND t.deleted_at IS NULL) AS task_count
    FROM sprints s
    LEFT JOIN projects p ON s.project_id = p.id
';
```

**IMPORTANT:** The projects JOIN is a LEFT JOIN because `project_id` is nullable. Sprints can exist without a project association.

**IMPORTANT:** The alias for the joined project ID is `project_id_rel` (not `project_id`) to avoid colliding with the sprint's own `project_id` column in `SELECT s.*`.

Define a static mapper:
```php
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
```

---

#### GET /sprints

List sprints with optional project filter and optional stats.

**Query parameters** (all optional):
- `projectId` — filter by project UUID
- `include` — comma-separated list; currently only `stats` is supported

**Step 1:** Read query params:
```php
$params = $request->getQueryParams();
$projectId = $params['projectId'] ?? null;
$includeParam = $params['include'] ?? '';
$includeStats = in_array('stats', explode(',', $includeParam));
```

**Step 2:** Build and execute query:
```php
if ($projectId !== null) {
    $stmt = $db->prepare(self::FETCH_QUERY . ' WHERE s.project_id = :projectId ORDER BY s.start_date ASC');
    $stmt->execute(['projectId' => $projectId]);
} else {
    $stmt = $db->query(self::FETCH_QUERY . ' ORDER BY s.start_date ASC');
}
$rows = $stmt->fetchAll();
$sprints = array_map([self::class, 'mapSprint'], $rows);
```

**Step 3:** If `stats` requested, compute per-sprint task counts:
```php
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
    unset($sprint); // break reference
}
```

**NOTE:** The N+1 queries for stats are acceptable at this app's scale (small teams, few sprints). The prepared statements are reused across iterations, so the overhead is minimal. This matches the v1 Prisma implementation which also uses N+1 for stats.

Response: `{ "sprints": [...] }` with status **200**.

---

#### GET /sprints/{id}

Get a single sprint.

Validate UUID param at handler top → 400.

Query:
```php
$stmt = $db->prepare(self::FETCH_QUERY . ' WHERE s.id = :id');
$stmt->execute(['id' => $id]);
$row = $stmt->fetch();
```

If not found → 404: `{ "error": "Sprint not found" }`

Response: `{ "sprint": { ... } }` with status **200**.

**NOTE:** This endpoint will be extended in CC08b to include full task expansion. For now it returns the basic sprint object with `project`, `_count.tasks`, but no `tasks` array.

---

#### POST /sprints

Create a new sprint.

Validation rules:
```php
$errors = Validator::validate($data, [
    'name' => 'required|min:1|max:100',
    'startDate' => 'required|iso8601',
    'endDate' => 'required|iso8601',
    'projectId' => 'optional|nullable|uuid',
    'description' => 'optional|max:500',
]);
```

After validation passes, cross-validate dates — endDate must be **strictly after** startDate (not equal):
```php
if (strtotime($data['endDate']) <= strtotime($data['startDate'])) {
    $response->getBody()->write(json_encode([
        'error' => 'End date must be after start date',
    ]));
    return $response->withHeader('Content-Type', 'application/json')->withStatus(400);
}
```

**IMPORTANT:** Sprint date validation uses `<=` (strictly after), unlike projects which use `<` (on or after). This matches v1 behavior — sprints must span at least some duration.

If `projectId` is provided and non-null, verify the project exists:
```php
$projectId = $data['projectId'] ?? null;
if ($projectId !== null) {
    $stmt = $db->prepare('SELECT id FROM projects WHERE id = :projectId');
    $stmt->execute(['projectId' => $projectId]);
    if (!$stmt->fetch()) {
        $response->getBody()->write(json_encode(['error' => 'Project not found']));
        return $response->withHeader('Content-Type', 'application/json')->withStatus(404);
    }
}
```

Generate UUID, set `created_by_id` from auth user. Set `status` to `'active'` (default).

INSERT:
```php
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
```

Re-SELECT with FETCH_QUERY to return the full sprint with project and `_count`.

Response: `{ "sprint": { ... } }` with status **201**.

---

#### PUT /sprints/{id}

Update a sprint. All fields optional.

Validate UUID param at handler top → 400.

Validation rules:
```php
$errors = Validator::validate($data, [
    'name' => 'optional|min:1|max:100',
    'startDate' => 'optional|iso8601',
    'endDate' => 'optional|iso8601',
    'status' => 'optional|in:active,completed',
    'description' => 'optional|nullable|max:500',
]);
```

**Note:** `description` accepts `null` to clear the value (via `nullable` rule). `status` is validated as an enum.

Date cross-validation: if BOTH `startDate` and `endDate` are provided, endDate must be strictly after startDate:
```php
if (isset($data['startDate']) && isset($data['endDate'])) {
    if (strtotime($data['endDate']) <= strtotime($data['startDate'])) {
        $response->getBody()->write(json_encode([
            'error' => 'End date must be after start date',
        ]));
        return $response->withHeader('Content-Type', 'application/json')->withStatus(400);
    }
}
```

SELECT sprint by ID → 404 if not found.

Build dynamic UPDATE SET clause (same pattern as ProjectRoutes PUT):
```php
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
```

**Note:** `description` uses `array_key_exists` (not `isset`) because sending `null` explicitly should set the DB column to NULL. All other fields use `isset` because they are non-nullable.

Execute UPDATE if any fields changed. Re-fetch with FETCH_QUERY. Return `{ "sprint": { ... } }` with status **200**.

---

#### DELETE /sprints/{id}

Delete a sprint.

Validate UUID param at handler top → 400.

SELECT to check existence → 404 if not found.

DELETE — tasks get `sprint_id` set to NULL via the FK constraint `ON DELETE SET NULL` on `tasks.sprint_id`. No manual cascade code needed.

Response: `{ "message": "Sprint deleted successfully" }` with status **200**.

---

## File to Modify

### `api/index.php`

Add `use` statement at the top (after the existing route `use` statements):

```php
use JamWork\Routes\SprintRoutes;
```

Add route registration after the existing route registrations (after `TaskLinkRoutes::register($app);`):

```php
SprintRoutes::register($app);
```

---

## Response Mapping Reference

MySQL snake_case → JSON camelCase:
- `created_by_id` → `createdById` (flat UUID string, same as milestones)
- `created_at` → `createdAt` (ISO 8601)
- `updated_at` → `updatedAt` (ISO 8601)
- `start_date` → `startDate` (ISO 8601, required — never null)
- `end_date` → `endDate` (ISO 8601, required — never null)
- `project_id` → `projectId` (nullable UUID)
- `project_id_rel` + `project_name` → nested `project` object or `null`
- `task_count` → nested `_count.tasks` (integer)
- `stats` → only present when `include=stats` query param is set

---

## Testing Verification

After implementation, verify with curl:

```bash
# Assumes PHP dev server running and logged in with cookies.txt

# --- Sprints ---
# List (empty initially)
curl -s -b cookies.txt http://127.0.0.1:8000/api/sprints | jq .

# List with stats
curl -s -b cookies.txt "http://127.0.0.1:8000/api/sprints?include=stats" | jq .

# Create (no project)
curl -s -b cookies.txt -X POST http://127.0.0.1:8000/api/sprints \
  -H 'Content-Type: application/json' \
  -d '{"name":"Sprint 1","startDate":"2026-04-01T00:00:00Z","endDate":"2026-04-15T00:00:00Z"}' | jq .

# Create (with project — use a project ID from previous testing)
curl -s -b cookies.txt -X POST http://127.0.0.1:8000/api/sprints \
  -H 'Content-Type: application/json' \
  -d '{"name":"Sprint 2","startDate":"2026-04-16T00:00:00Z","endDate":"2026-04-30T00:00:00Z","projectId":"<PROJECT_ID>","description":"Second sprint"}' | jq .

# List filtered by project
curl -s -b cookies.txt "http://127.0.0.1:8000/api/sprints?projectId=<PROJECT_ID>" | jq .

# Get single sprint
curl -s -b cookies.txt http://127.0.0.1:8000/api/sprints/<SPRINT_ID> | jq .

# Update
curl -s -b cookies.txt -X PUT http://127.0.0.1:8000/api/sprints/<SPRINT_ID> \
  -H 'Content-Type: application/json' \
  -d '{"name":"Sprint 1 — Updated","description":"Updated description"}' | jq .

# Update status
curl -s -b cookies.txt -X PUT http://127.0.0.1:8000/api/sprints/<SPRINT_ID> \
  -H 'Content-Type: application/json' \
  -d '{"status":"completed"}' | jq .

# Delete
curl -s -b cookies.txt -X DELETE http://127.0.0.1:8000/api/sprints/<SPRINT_ID> | jq .

# --- Validation tests ---
# Missing required fields
curl -s -b cookies.txt -X POST http://127.0.0.1:8000/api/sprints \
  -H 'Content-Type: application/json' \
  -d '{"name":"Bad Sprint"}' | jq .

# End date not after start date
curl -s -b cookies.txt -X POST http://127.0.0.1:8000/api/sprints \
  -H 'Content-Type: application/json' \
  -d '{"name":"Bad Sprint","startDate":"2026-04-15T00:00:00Z","endDate":"2026-04-01T00:00:00Z"}' | jq .

# Equal dates (should fail — must be strictly after)
curl -s -b cookies.txt -X POST http://127.0.0.1:8000/api/sprints \
  -H 'Content-Type: application/json' \
  -d '{"name":"Bad Sprint","startDate":"2026-04-01T00:00:00Z","endDate":"2026-04-01T00:00:00Z"}' | jq .

# Invalid status enum
curl -s -b cookies.txt -X PUT http://127.0.0.1:8000/api/sprints/<SPRINT_ID> \
  -H 'Content-Type: application/json' \
  -d '{"status":"cancelled"}' | jq .

# Non-existent project
curl -s -b cookies.txt -X POST http://127.0.0.1:8000/api/sprints \
  -H 'Content-Type: application/json' \
  -d '{"name":"Bad Sprint","startDate":"2026-04-01T00:00:00Z","endDate":"2026-04-15T00:00:00Z","projectId":"00000000-0000-0000-0000-000000000000"}' | jq .
```

## Verification Checklist

- [ ] SprintRoutes.php created and follows CC07a/CC07b patterns exactly
- [ ] All 5 endpoints return correct HTTP status codes (200, 201, 400, 404)
- [ ] Response shape matches v1: camelCase keys, nested `project` object (or null), `_count.tasks`
- [ ] `project` is LEFT JOIN — null projectId returns `"project": null`
- [ ] `_count.tasks` counts only non-soft-deleted tasks (`deleted_at IS NULL`)
- [ ] `stats` (taskCount + completedCount) only present when `include=stats` query param set
- [ ] UUID route params validated at handler top → 400 if invalid
- [ ] Validation errors return 400 with `{ "errors": [...] }` format
- [ ] Not-found returns 404 with `{ "error": "..." }` format
- [ ] All timestamps formatted as ISO 8601
- [ ] Sprint date cross-validation: endDate must be **strictly after** startDate (`<=` check, not `<`)
- [ ] POST creates sprint with `status: 'active'` default
- [ ] PUT accepts `status` field with enum validation (`active`, `completed`)
- [ ] PUT: `description` uses `array_key_exists` for nullable handling; other fields use `isset`
- [ ] POST: projectId verified against projects table when non-null
- [ ] DELETE: tasks get `sprint_id = NULL` via FK `ON DELETE SET NULL` — no manual cascade
- [ ] POST returns status 201 (not 200)
- [ ] index.php updated with SprintRoutes registration
- [ ] `project_id_rel` alias used in FETCH_QUERY to avoid column name collision with `s.project_id`
