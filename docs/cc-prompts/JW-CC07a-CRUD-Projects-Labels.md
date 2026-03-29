# JW-CC07a — CRUD: Projects & Labels

## Context

JamWork-v2 is a Vite + React SPA with a PHP/MySQL backend (Slim 4 framework).
Phase 3 (auth, admin, workspace settings) is complete and committed.
This prompt implements the first batch of Phase 4 CRUD endpoints: Projects and Labels.

## Existing Patterns (MUST follow exactly)

Read these files before writing any code — they define the patterns you must replicate:

- `api/src/Routes/AuthRoutes.php` — route registration pattern, response formatting, middleware wiring
- `api/src/Routes/AdminRoutes.php` — additional route pattern reference
- `api/src/Lib/Validator.php` — validation rules and error response format
- `api/src/Lib/Database.php` — PDO singleton (`Database::getInstance()`)
- `api/src/Middleware/AuthMiddleware.php` — authentication middleware
- `api/index.php` — route wiring pattern

### Key conventions (non-negotiable):

1. Static `register(App $app): void` method on each Routes class
2. `$app->group('/path', function (RouteCollectorProxy $group) { ... })` for route groups
3. `->add(new AuthMiddleware())` applied to the **group** (not individual routes)
4. `Validator::validate($data, [...])` at the top of each handler, return early on errors via `Validator::respondWithErrors()`
5. `Ramsey\Uuid\Uuid::uuid4()->toString()` for new entity IDs
6. All responses: `$response->getBody()->write(json_encode([...]))`, `->withHeader('Content-Type', 'application/json')`, `->withStatus(XXX)`
7. snake_case DB columns mapped to camelCase JSON response keys
8. All timestamps returned as ISO 8601 via `date('c', strtotime($row['column']))` — nullable timestamps return JSON `null`
9. `$request->getAttribute('userId')` to get authenticated user ID (set by AuthMiddleware)
10. For not-found cases: SELECT first to check existence, return 404 with `{ "error": "..." }` — do NOT rely on PDO exceptions for not-found

## Files to Create

### 1. `api/src/Routes/ProjectRoutes.php`

**Namespace:** `JamWork\Routes`
**Group path:** `/projects`
**Auth:** All endpoints require `AuthMiddleware` (group-level)
**Imports:** Same pattern as AuthRoutes — `Database`, `Validator`, `AuthMiddleware`, `Uuid`, Slim types, `RouteCollectorProxy`

#### GET /projects

List all projects with task count and creator info.

Query:
```sql
SELECT p.*,
       u.id AS creator_id, u.email AS creator_email, u.display_name AS creator_display_name,
       (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.deleted_at IS NULL) AS task_count
FROM projects p
JOIN users u ON p.created_by_id = u.id
ORDER BY p.name ASC
```

Response shape (status 200):
```json
{
  "projects": [
    {
      "id": "uuid",
      "name": "string",
      "description": "string|null",
      "startDate": "ISO8601|null",
      "endDate": "ISO8601|null",
      "createdAt": "ISO8601",
      "updatedAt": "ISO8601",
      "createdBy": {
        "id": "uuid",
        "email": "string",
        "displayName": "string"
      },
      "_count": {
        "tasks": 5
      }
    }
  ]
}
```

**IMPORTANT:** The `_count.tasks` shape matches v1's Prisma convention. The frontend reads `project._count.tasks`. Do NOT rename this to `taskCount` or any other shape.

Map each row using a helper function or inline mapping:
- `task_count` (int) → nested `_count.tasks`
- `start_date` → `startDate` (nullable ISO 8601)
- `end_date` → `endDate` (nullable ISO 8601)
- `created_at` → `createdAt` (ISO 8601)
- `updated_at` → `updatedAt` (ISO 8601)
- `creator_id`, `creator_email`, `creator_display_name` → nested `createdBy` object

#### POST /projects

Create a new project.

Validation rules:
```php
$errors = Validator::validate($data, [
    'name' => 'required|min:1|max:100',
    'description' => 'optional|max:5000',
    'startDate' => 'optional|iso8601',
    'endDate' => 'optional|iso8601',
]);
```

After validation passes, if BOTH `startDate` and `endDate` are provided and non-null, check `endDate >= startDate`. If not, return 400:
```json
{ "error": "End date must be on or after start date" }
```

Generate UUID via `Uuid::uuid4()->toString()`.
Set `created_by_id` from `$request->getAttribute('userId')`.

INSERT, then re-SELECT with the same JOIN query as GET (filter `WHERE p.id = :id`) to return the full project object with `createdBy` and `_count`.

Response shape: `{ "project": { ... } }` with status **201**.

#### PUT /projects/{id}

Update a project. All fields optional.

**UUID param validation:** At the top of the handler, validate `{id}` matches UUID regex `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`. If not, return 400: `{ "error": "id must be a valid UUID" }`.

Validation rules:
```php
$errors = Validator::validate($data, [
    'name' => 'optional|min:1|max:100',
    'description' => 'optional',
    'startDate' => 'optional|nullable|iso8601',
    'endDate' => 'optional|nullable|iso8601',
]);
```

**Note:** `startDate` and `endDate` accept `null` to clear the value. The `nullable` rule in the Validator allows this.

Date cross-validation: if both provided and both non-null, endDate >= startDate.

SELECT first to check existence → 404 `{ "error": "Project not found" }` if missing.

Build dynamic UPDATE SET clause — only include fields present in `$data`. Use the same pattern as AuthRoutes PUT /auth/profile (build `$updates[]` array and `$params`).

For date fields: if the value is `null`, set DB column to `NULL`. If non-null, store as MySQL TIMESTAMP via the ISO 8601 value.

Re-fetch with JOIN, return `{ "project": { ... } }` with status 200.

#### DELETE /projects/{id}

Delete a project.

Validate UUID param. SELECT to check existence → 404 if not found.

DELETE — tasks cascade via the FK `ON DELETE CASCADE` on the `tasks.project_id` column. No manual cascade needed.

Response: `{ "message": "Project deleted successfully" }` with status 200.

---

### 2. `api/src/Routes/LabelRoutes.php`

**Namespace:** `JamWork\Routes`
**Group path:** `/labels`
**Auth:** All endpoints require `AuthMiddleware` (group-level)

#### GET /labels

List all labels with creator info.

Query:
```sql
SELECT l.*,
       u.id AS creator_id, u.email AS creator_email, u.display_name AS creator_display_name
FROM labels l
JOIN users u ON l.created_by_id = u.id
ORDER BY l.name ASC
```

Response shape (status 200):
```json
{
  "labels": [
    {
      "id": "uuid",
      "name": "string",
      "color": "#FF5733",
      "createdAt": "ISO8601",
      "createdBy": {
        "id": "uuid",
        "email": "string",
        "displayName": "string"
      }
    }
  ]
}
```

Note: The `labels` table has `created_at` but no `updated_at` column.

#### POST /labels

Create a new label.

Validation rules:
```php
$errors = Validator::validate($data, [
    'name' => 'required|min:1|max:50',
    'color' => 'required|hex_color',
]);
```

Generate UUID, set `created_by_id`. INSERT, re-SELECT with JOIN, return `{ "label": { ... } }` with status **201**.

#### PUT /labels/{id}

Update a label.

Validate UUID param. Validation rules:
```php
$errors = Validator::validate($data, [
    'name' => 'optional|min:1|max:50',
    'color' => 'optional|hex_color',
]);
```

SELECT existence → 404. Dynamic UPDATE (only provided fields). Re-fetch with JOIN. Return `{ "label": { ... } }` with status 200.

#### DELETE /labels/{id}

Validate UUID param. SELECT existence → 404.

DELETE — `task_labels` cascade via FK `ON DELETE CASCADE`. No manual cascade.

Response: `{ "message": "Label deleted successfully" }` with status 200.

---

## File to Modify

### `api/index.php`

Add `use` statements at the top (after the existing `use JamWork\Routes\WorkspaceSettingsRoutes;`):

```php
use JamWork\Routes\ProjectRoutes;
use JamWork\Routes\LabelRoutes;
```

Add route registrations after the existing `WorkspaceSettingsRoutes::register($app);` line:

```php
ProjectRoutes::register($app);
LabelRoutes::register($app);
```

---

## Response Mapping Reference

MySQL snake_case → JSON camelCase:
- `created_by_id` → not returned directly (used for JOIN)
- `created_at` → `createdAt` (ISO 8601 via `date('c', strtotime(...))`)
- `updated_at` → `updatedAt` (ISO 8601)
- `start_date` → `startDate` (nullable ISO 8601 — return `null` if DB value is NULL)
- `end_date` → `endDate` (nullable ISO 8601)
- `display_name` → `displayName`
- `task_count` → nested `_count.tasks` (integer)
- `deleted_at` → never returned (internal only)

---

## Testing Verification

After implementation, verify with curl:

```bash
# Start PHP dev server (if not running)
php -S 127.0.0.1:8000 -t api api/index.php

# Login first to get auth cookie
curl -s -c cookies.txt -X POST http://127.0.0.1:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@test.com","password":"testpassword1"}'

# --- Projects ---
# List (empty initially)
curl -s -b cookies.txt http://127.0.0.1:8000/api/projects | jq .

# Create
curl -s -b cookies.txt -X POST http://127.0.0.1:8000/api/projects \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test Project","description":"A test project"}' | jq .

# Update (use the id from create response)
curl -s -b cookies.txt -X PUT http://127.0.0.1:8000/api/projects/<PROJECT_ID> \
  -H 'Content-Type: application/json' \
  -d '{"name":"Updated Project","startDate":"2026-04-01T00:00:00Z"}' | jq .

# Delete
curl -s -b cookies.txt -X DELETE http://127.0.0.1:8000/api/projects/<PROJECT_ID> | jq .

# --- Labels ---
# List (empty initially)
curl -s -b cookies.txt http://127.0.0.1:8000/api/labels | jq .

# Create
curl -s -b cookies.txt -X POST http://127.0.0.1:8000/api/labels \
  -H 'Content-Type: application/json' \
  -d '{"name":"Bug","color":"#FF0000"}' | jq .

# Update
curl -s -b cookies.txt -X PUT http://127.0.0.1:8000/api/labels/<LABEL_ID> \
  -H 'Content-Type: application/json' \
  -d '{"name":"Critical Bug","color":"#CC0000"}' | jq .

# Delete
curl -s -b cookies.txt -X DELETE http://127.0.0.1:8000/api/labels/<LABEL_ID> | jq .
```

## Verification Checklist

- [ ] Both route files created and follow Phase 3 patterns exactly
- [ ] All 8 endpoints return correct HTTP status codes (200, 201, 400, 404)
- [ ] Response shapes match v1 (camelCase keys, nested `createdBy` objects, `_count` for projects)
- [ ] UUID route params validated at handler top → 400 if invalid
- [ ] Validation errors return 400 with `{ "errors": [...] }` format (array of `{field, message}`)
- [ ] Not-found returns 404 with `{ "error": "..." }` format (singular string)
- [ ] All timestamps formatted as ISO 8601 via `date('c', strtotime(...))`
- [ ] Nullable fields (description, startDate, endDate) return JSON `null` when DB value is NULL
- [ ] index.php updated with both route registrations
- [ ] Project DELETE cascades to tasks (FK handles it — no manual cascade code)
- [ ] Label DELETE cascades to task_labels (FK handles it)
- [ ] POST endpoints return status 201 (not 200)
- [ ] No new Validator rules needed — all existing rules suffice
