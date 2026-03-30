# JW-CC10 — Tasks Bulk Operations + Subtasks

## Context

You are adding 7 endpoints to the existing `api/src/Routes/TaskRoutes.php` file. These are the final Phase 4 endpoints. No new files are created — all work is additive to TaskRoutes.php.

**Read before coding:**
- `api/src/Routes/TaskRoutes.php` — the file you are modifying
- `api/src/Models/TaskModel.php` — provides `buildInClause()` for WHERE IN queries
- `api/src/Lib/Validator.php` — available validation rules
- `api/migrations/001_initial_schema.sql` — subtasks table schema (columns: id, title, completed, sort_order, task_id, created_at)

**Key constraints:**
- Static routes (reorder, bulk-update, bulk, bulk-delete) MUST be registered in the existing comment block BEFORE the parameterized `/{id}` routes. The comment block is already in place — look for `// CC10 will add:` and replace that comment line with the 4 static routes.
- Subtask routes go AFTER the existing `DELETE /{id}` route, before the closing `})->add(new AuthMiddleware())`.
- Use `TaskModel::buildInClause()` for all WHERE IN queries.
- UUIDs are generated with `Uuid::uuid4()->toString()` (Ramsey\Uuid is already imported).
- The `UUID_PATTERN` constant is already defined on the class.
- All bulk endpoints operate only on non-deleted tasks (`deleted_at IS NULL`).

---

## Endpoint 1: PUT /tasks/reorder

Reorder tasks by assigning sort_order from array position.

**Request body:**
```json
{
  "taskIds": ["uuid1", "uuid2", "uuid3"]
}
```

**Validation:**
- `taskIds`: required, must be an array. Use `Validator::validate()` with `'taskIds' => 'required|uuid_array'`.

**Implementation:**
- Wrap all updates in a single transaction.
- For each taskId at index `$i`, execute: `UPDATE tasks SET sort_order = :sortOrder WHERE id = :id AND deleted_at IS NULL`
- Use a prepared statement inside a loop (not `buildInClause` — each row gets a different sort_order value).

**Response:** `200` with `{ "message": "Tasks reordered successfully" }`

---

## Endpoint 2: PUT /tasks/bulk-update

Apply the same field updates to multiple tasks.

**Request body:**
```json
{
  "taskIds": ["uuid1", "uuid2"],
  "fields": {
    "status": "done",
    "sprintId": null
  }
}
```

**Validation (manual — Validator cannot handle nested objects):**
1. Check `taskIds` is present, is a non-empty array, and each element matches `UUID_PATTERN`.
2. Check `fields` is present and is a non-empty associative array (use `is_array()` + `!empty()`).
3. Validate individual fields within `fields`:
   - `status`: if present, must be in `['todo', 'in_progress', 'review', 'done']`
   - `priority`: if present, must be in `['low', 'medium', 'high', 'urgent']`
   - `sprintId`: if present, must be null or match `UUID_PATTERN`
   - `inSprintBacklog`: if present, must be boolean (use `is_bool()`)
4. Reject any field key not in the allowed set: `['status', 'priority', 'sprintId', 'inSprintBacklog']`. Return 400 with error message identifying the disallowed field.

**Implementation:**
- Build a dynamic SET clause from the validated fields. Map camelCase keys to snake_case columns:
  - `status` → `status`
  - `priority` → `priority`
  - `sprintId` → `sprint_id`
  - `inSprintBacklog` → `in_sprint_backlog`
- For `inSprintBacklog`, cast to int: `(int) $value`
- Use `TaskModel::buildInClause($taskIds, 'tid')` for the WHERE IN clause.
- Single UPDATE statement (not a loop): `UPDATE tasks SET {columns} WHERE id IN ({in_clause}) AND deleted_at IS NULL`
- Merge the SET params and IN params into a single execute array.
- Use `$stmt->rowCount()` to get the count of affected rows.

**Response:** `200` with `{ "count": <int> }`

---

## Endpoint 3: PATCH /tasks/bulk

Per-task bulk update — each task gets different field values.

**Request body:**
```json
{
  "updates": [
    { "id": "uuid1", "fields": { "status": "done" } },
    { "id": "uuid2", "fields": { "priority": "high", "sprintId": null } }
  ]
}
```

**Validation (manual):**
1. Check `updates` is present, is an array, has between 1 and 100 items.
2. For each entry in `updates`:
   - `id` must be present and match `UUID_PATTERN`.
   - `fields` must be present, be a non-empty associative array.
   - Validate individual fields within `fields` using the same allowed set and rules as Endpoint 2 (status, priority, sprintId, inSprintBacklog).

**Implementation:**
- Wrap all updates in a single transaction.
- Loop through each update entry. For each:
  - Build a dynamic `UPDATE tasks SET {columns} WHERE id = :id AND deleted_at IS NULL` statement.
  - Map camelCase to snake_case (same as Endpoint 2).
  - Execute individually within the transaction.
  - Track total affected rows via `$stmt->rowCount()`.

**Response:** `200` with `{ "count": <int> }` (sum of all affected rows)

---

## Endpoint 4: POST /tasks/bulk-delete

Soft-delete multiple tasks.

**Request body:**
```json
{
  "taskIds": ["uuid1", "uuid2"]
}
```

**Validation:**
- `taskIds`: required, must be a non-empty array. Use `Validator::validate()` with `'taskIds' => 'required|uuid_array'`.
- After Validator passes, additionally check the array is non-empty. If empty, return 400: `{ "error": "taskIds must be a non-empty array" }`.

**Implementation:**
- Use `TaskModel::buildInClause($taskIds, 'tid')` for the WHERE IN clause.
- Single statement: `UPDATE tasks SET deleted_at = NOW() WHERE id IN ({in_clause}) AND deleted_at IS NULL`
- Use `$stmt->rowCount()` for the count.

**Response:** `200` with `{ "count": <int> }`

---

## Endpoint 5: POST /tasks/{id}/subtasks

Create a subtask on a task.

**Request body:**
```json
{
  "title": "Subtask title"
}
```

**Validation:**
- Validate `{id}` path param against `UUID_PATTERN`. Return 400 if invalid.
- Use `Validator::validate()` on body: `'title' => 'required|min:1|max:255'`.

**Implementation:**
1. Verify the parent task exists and is not soft-deleted: `SELECT id FROM tasks WHERE id = :id AND deleted_at IS NULL`.
2. Get next sort_order for subtasks of this task:
   ```sql
   SELECT MAX(sort_order) AS max_order FROM subtasks WHERE task_id = :taskId
   ```
   Next sort_order = `($max_order !== null) ? (int) $max_order + 1 : 0`.
3. Insert the subtask:
   ```sql
   INSERT INTO subtasks (id, title, sort_order, task_id) VALUES (:id, :title, :sortOrder, :taskId)
   ```
   Generate UUID with `Uuid::uuid4()->toString()`.
4. Re-fetch the created subtask to return it (ensures `created_at` and `completed` default are included):
   ```sql
   SELECT id, title, completed, sort_order, task_id, created_at FROM subtasks WHERE id = :id
   ```

**Response mapping (camelCase):**
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

**Response:** `201` with `{ "subtask": <mapped subtask> }`

---

## Endpoint 6: PUT /tasks/{taskId}/subtasks/{subtaskId}

Update a subtask.

**Request body (all optional, at least one required):**
```json
{
  "title": "Updated title",
  "completed": true
}
```

**Validation:**
- Validate `{taskId}` and `{subtaskId}` path params against `UUID_PATTERN`. Return 400 if either is invalid.
- Use `Validator::validate()` on body:
  ```php
  'title' => 'optional|min:1|max:255',
  'completed' => 'optional|boolean',
  ```
- After validation passes, check that at least one of `title` or `completed` is present in the body. If neither is present, return 400: `{ "error": "At least one field (title or completed) must be provided" }`.

**Implementation:**
1. Verify the subtask exists and belongs to the parent task:
   ```sql
   SELECT id FROM subtasks WHERE id = :subtaskId AND task_id = :taskId
   ```
   If not found, return 404: `{ "error": "Subtask not found" }`.
2. Build dynamic UPDATE (same pattern as task update):
   - If `title` is present: `title = :title`
   - If `completed` is present: `completed = :completed` (cast to int: `(int) $data['completed']`)
3. Execute update: `UPDATE subtasks SET {columns} WHERE id = :subtaskId`
4. Re-fetch the updated subtask and map to camelCase (same mapping as Endpoint 5).

**Response:** `200` with `{ "subtask": <mapped subtask> }`

---

## Endpoint 7: DELETE /tasks/{taskId}/subtasks/{subtaskId}

Hard-delete a subtask.

**Validation:**
- Validate `{taskId}` and `{subtaskId}` path params against `UUID_PATTERN`. Return 400 if either is invalid.

**Implementation:**
1. Verify the subtask exists and belongs to the parent task:
   ```sql
   SELECT id FROM subtasks WHERE id = :subtaskId AND task_id = :taskId
   ```
   If not found, return 404: `{ "error": "Subtask not found" }`.
2. Hard delete: `DELETE FROM subtasks WHERE id = :subtaskId`

**Response:** `200` with `{ "message": "Subtask deleted successfully" }`

---

## Route Registration Order

The final route registration order in the `/tasks` group after this prompt:

```
// STATIC ROUTES
PUT  /reorder          (Endpoint 1 — new)
PUT  /bulk-update      (Endpoint 2 — new)
PATCH /bulk            (Endpoint 3 — new)
POST /bulk-delete      (Endpoint 4 — new)

// COLLECTION ROUTES (existing from CC09)
GET  /                 (list)
POST /                 (create)

// PARAMETERIZED ROUTES (existing from CC09)
PUT  /{id}/move
GET  /{id}
PUT  /{id}
DELETE /{id}

// SUBTASK ROUTES (new)
POST   /{id}/subtasks
PUT    /{taskId}/subtasks/{subtaskId}
DELETE /{taskId}/subtasks/{subtaskId}
```

---

## Verification Checklist

After implementation, verify:

### Static Bulk Routes
- [ ] PUT /reorder: registered in static block, uses transaction, sets sort_order from index, filters deleted_at IS NULL
- [ ] PUT /bulk-update: validates taskIds (non-empty UUID array), validates fields object (allowed keys only), maps camelCase→snake_case, uses buildInClause, single UPDATE, returns count
- [ ] PATCH /bulk: validates updates array (1-100), validates each entry's id and fields, transaction with per-task UPDATE, returns sum of affected rows
- [ ] POST /bulk-delete: validates taskIds (non-empty UUID array), uses buildInClause, sets deleted_at = NOW(), returns count

### Subtask Routes
- [ ] POST /{id}/subtasks: validates parent UUID, validates title, checks parent task exists (not deleted), gets next sort_order from subtasks table, inserts with generated UUID, re-fetches and returns mapped subtask with 201
- [ ] PUT /{taskId}/subtasks/{subtaskId}: validates both UUIDs, validates body fields, requires at least one field, verifies subtask belongs to task, dynamic UPDATE, re-fetches and returns mapped subtask
- [ ] DELETE /{taskId}/subtasks/{subtaskId}: validates both UUIDs, verifies subtask belongs to task, hard DELETE, returns success message

### General
- [ ] All 4 static routes placed BEFORE parameterized routes (the `// CC10 will add:` comment line is replaced)
- [ ] All 3 subtask routes placed AFTER the DELETE /{id} route
- [ ] No changes to existing CC09 endpoints
- [ ] Subtask mapping uses camelCase (sortOrder, taskId, createdAt)
- [ ] Boolean `completed` field cast to `(bool)` on read, `(int)` on write
- [ ] `inSprintBacklog` field cast to `(int)` on write in bulk endpoints
