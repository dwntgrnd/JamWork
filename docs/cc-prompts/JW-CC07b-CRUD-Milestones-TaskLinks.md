# JW-CC07b — CRUD: Milestones & Task Links

## Context

JamWork-v2 is a Vite + React SPA with a PHP/MySQL backend (Slim 4 framework).
Phase 3 (auth, admin, workspace settings) is complete.
CC07a (Projects & Labels CRUD) has been implemented and committed.
This prompt implements the second batch of Phase 4 simple CRUD: Milestones and Task Links.

## Existing Patterns (MUST follow exactly)

Read these files before writing any code:

- `api/src/Routes/ProjectRoutes.php` — **primary pattern reference** (created in CC07a, closest match to what you're building)
- `api/src/Routes/LabelRoutes.php` — additional CC07a reference
- `api/src/Routes/AuthRoutes.php` — original Phase 3 pattern
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

## Files to Create

### 1. `api/src/Routes/MilestoneRoutes.php`

**Namespace:** `JamWork\Routes`
**Group path:** `/milestones`
**Auth:** All endpoints require `AuthMiddleware` (group-level)

#### GET /milestones

List milestones, optionally filtered by project.

Check for `projectId` query parameter: `$request->getQueryParams()['projectId'] ?? null`

Query (no JOIN — v1 doesn't include relations on milestone list):
```sql
-- If projectId provided:
SELECT * FROM milestones WHERE project_id = :projectId ORDER BY date ASC

-- If no projectId:
SELECT * FROM milestones ORDER BY date ASC
```

Response shape (status 200):
```json
{
  "milestones": [
    {
      "id": "uuid",
      "name": "string",
      "date": "ISO8601",
      "projectId": "uuid|null",
      "createdById": "uuid",
      "createdAt": "ISO8601",
      "updatedAt": "ISO8601"
    }
  ]
}
```

Note: Unlike Projects and Labels, milestones return `createdById` as a flat UUID string, NOT a nested `createdBy` object. This matches v1 behavior — milestones don't include creator relations in list queries.

#### POST /milestones

Create a new milestone.

Validation rules:
```php
$errors = Validator::validate($data, [
    'name' => 'required|min:1|max:100',
    'date' => 'required|iso8601',
    'projectId' => 'optional|nullable|uuid',
]);
```

If `projectId` is provided and non-null, verify the project exists:
```sql
SELECT id FROM projects WHERE id = :projectId
```
If not found, return 404: `{ "error": "Project not found" }`

Generate UUID, set `created_by_id` from auth user. Store `date` as MySQL TIMESTAMP.

INSERT, then re-SELECT to return the milestone. Response: `{ "milestone": { ... } }` with status **201**.

#### PUT /milestones/{id}

Update a milestone. All fields optional.

Validate UUID param at handler top.

Validation rules:
```php
$errors = Validator::validate($data, [
    'name' => 'optional|min:1|max:100',
    'date' => 'optional|iso8601',
    'projectId' => 'optional|nullable|uuid',
]);
```

If `projectId` is provided and non-null, verify project exists → 404 if not.

SELECT milestone by ID → 404 `{ "error": "Milestone not found" }` if missing.

Build dynamic UPDATE SET clause (only provided fields). For `projectId`: if value is `null`, set `project_id = NULL`. If non-null UUID, set `project_id = :projectId`.

Re-fetch, return `{ "milestone": { ... } }` with status 200.

#### DELETE /milestones/{id}

Validate UUID param. SELECT existence → 404 if not found.

DELETE (no cascade concerns — milestones have no child tables).

Response: `{ "message": "Milestone deleted successfully" }` with status 200.

---

### 2. `api/src/Routes/TaskLinkRoutes.php`

**Namespace:** `JamWork\Routes`
**Group path:** `/tasks/{taskId}/links`
**Auth:** All endpoints require `AuthMiddleware` (group-level)

**IMPORTANT architectural notes:**
- This is a **nested route group** under `/tasks`. TaskRoutes.php does NOT exist yet (it will be created in CC09).
- Register this as a standalone group in `index.php`. There is no conflict — when CC09 creates TaskRoutes with group `/tasks`, Slim 4 will match the most specific route first.
- Route closures in Slim 4 receive `(Request $request, Response $response, array $args)`. Access route params via `$args['taskId']` and `$args['linkId']`.

#### GET /tasks/{taskId}/links

List links for a specific task.

**Step 1:** Validate `$args['taskId']` is UUID format → 400 `{ "error": "taskId must be a valid UUID" }`

**Step 2:** Verify parent task exists and is NOT soft-deleted:
```sql
SELECT id FROM tasks WHERE id = :taskId AND deleted_at IS NULL
```
If not found, return 404: `{ "error": "Task not found" }`

**Step 3:** Query links:
```sql
SELECT tl.*,
       u.id AS creator_id, u.display_name AS creator_display_name
FROM task_links tl
JOIN users u ON tl.created_by_id = u.id
WHERE tl.task_id = :taskId
ORDER BY tl.created_at DESC
```

Response shape (status 200):
```json
{
  "links": [
    {
      "id": "uuid",
      "url": "string",
      "title": "string|null",
      "taskId": "uuid",
      "createdAt": "ISO8601",
      "createdBy": {
        "id": "uuid",
        "displayName": "string"
      }
    }
  ]
}
```

Note: The `createdBy` object for task links only includes `id` and `displayName` (no `email`). This matches v1 behavior.

#### POST /tasks/{taskId}/links

Create a new link for a task.

**Step 1:** Validate `$args['taskId']` UUID → 400
**Step 2:** Verify task exists (not soft-deleted) → 404

Validation rules:
```php
$errors = Validator::validate($data, [
    'url' => 'required|url|max:2000',
    'title' => 'optional|max:200',
]);
```

**Additional URL check** (after Validator passes): the URL must start with `http://` or `https://`. PHP's `FILTER_VALIDATE_URL` (used by the Validator's `url` rule) is too permissive. Add a manual check:
```php
if (!str_starts_with($data['url'], 'http://') && !str_starts_with($data['url'], 'https://')) {
    $response->getBody()->write(json_encode([
        'errors' => [['field' => 'url', 'message' => 'URL must start with http:// or https://']]
    ]));
    return $response->withHeader('Content-Type', 'application/json')->withStatus(400);
}
```

Generate UUID, set `created_by_id`, set `task_id` from route param. Set `title` to `null` if not provided.

INSERT, then re-SELECT with JOIN to return the link with `createdBy`.

Response: `{ "link": { ... } }` with status **201**.

#### DELETE /tasks/{taskId}/links/{linkId}

**Step 1:** Validate both `$args['taskId']` and `$args['linkId']` as UUIDs → 400

**Step 2:** Verify the link exists AND belongs to the specified task:
```sql
SELECT id FROM task_links WHERE id = :linkId AND task_id = :taskId
```
If not found, return 404: `{ "error": "Link not found" }`

**Step 3:** DELETE the link.

Response: `{ "message": "Link deleted successfully" }` with status 200.

---

## File to Modify

### `api/index.php`

Add `use` statements at the top (after the existing route `use` statements):

```php
use JamWork\Routes\MilestoneRoutes;
use JamWork\Routes\TaskLinkRoutes;
```

Add route registrations after the existing route registrations (after `LabelRoutes::register($app);` from CC07a):

```php
MilestoneRoutes::register($app);
TaskLinkRoutes::register($app);
```

---

## Response Mapping Reference

MySQL snake_case → JSON camelCase:
- `created_by_id` → `createdById` (flat string, for milestones) or used for JOIN (task links)
- `created_at` → `createdAt` (ISO 8601)
- `updated_at` → `updatedAt` (ISO 8601)
- `project_id` → `projectId` (nullable UUID)
- `task_id` → `taskId`
- `display_name` → `displayName`

---

## Testing Verification

After implementation, verify with curl:

```bash
# Assumes PHP dev server running and logged in with cookies.txt from CC07a testing

# --- Milestones ---
# List (empty initially)
curl -s -b cookies.txt http://127.0.0.1:8000/api/milestones | jq .

# Create (no project)
curl -s -b cookies.txt -X POST http://127.0.0.1:8000/api/milestones \
  -H 'Content-Type: application/json' \
  -d '{"name":"Beta Launch","date":"2026-06-01T00:00:00Z"}' | jq .

# Create (with project — use a project ID from CC07a testing)
curl -s -b cookies.txt -X POST http://127.0.0.1:8000/api/milestones \
  -H 'Content-Type: application/json' \
  -d '{"name":"Sprint 1 End","date":"2026-04-15T00:00:00Z","projectId":"<PROJECT_ID>"}' | jq .

# List filtered by project
curl -s -b cookies.txt "http://127.0.0.1:8000/api/milestones?projectId=<PROJECT_ID>" | jq .

# Update
curl -s -b cookies.txt -X PUT http://127.0.0.1:8000/api/milestones/<MILESTONE_ID> \
  -H 'Content-Type: application/json' \
  -d '{"name":"Beta Launch v2"}' | jq .

# Delete
curl -s -b cookies.txt -X DELETE http://127.0.0.1:8000/api/milestones/<MILESTONE_ID> | jq .

# --- Task Links ---
# NOTE: Task link testing requires a task to exist.
# Since TaskRoutes (CC09) hasn't been created yet, you'll need to manually insert a task:
#
# mysql -u root -p jamwork -e "INSERT INTO tasks (id, title, project_id, created_by_id) VALUES ('11111111-1111-1111-1111-111111111111', 'Test Task', '<PROJECT_ID>', '<USER_ID>');"
#
# Then test with that task ID:

# List links (empty)
curl -s -b cookies.txt http://127.0.0.1:8000/api/tasks/11111111-1111-1111-1111-111111111111/links | jq .

# Create link
curl -s -b cookies.txt -X POST http://127.0.0.1:8000/api/tasks/11111111-1111-1111-1111-111111111111/links \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://github.com/example/repo","title":"GitHub Repo"}' | jq .

# Delete link
curl -s -b cookies.txt -X DELETE http://127.0.0.1:8000/api/tasks/11111111-1111-1111-1111-111111111111/links/<LINK_ID> | jq .
```

## Verification Checklist

- [ ] Both route files created and follow CC07a / Phase 3 patterns exactly
- [ ] All 7 endpoints return correct HTTP status codes (200, 201, 400, 404)
- [ ] Milestone response shape: flat `createdById` (not nested object)
- [ ] Task link `createdBy` includes only `id` + `displayName` (no `email`)
- [ ] UUID route params validated at handler top → 400 if invalid
- [ ] Validation errors return 400 with `{ "errors": [...] }` format
- [ ] Not-found returns 404 with `{ "error": "..." }` format
- [ ] All timestamps formatted as ISO 8601
- [ ] Nullable fields return JSON `null` when DB value is NULL
- [ ] index.php updated with both route registrations
- [ ] Milestone POST/PUT: projectId verified against projects table when non-null
- [ ] TaskLink endpoints verify parent task exists AND is not soft-deleted (`deleted_at IS NULL`)
- [ ] TaskLink POST: URL must start with http:// or https:// (manual check after Validator)
- [ ] TaskLink DELETE: verifies link belongs to the specified task (both IDs checked)
- [ ] POST endpoints return status 201 (not 200)
