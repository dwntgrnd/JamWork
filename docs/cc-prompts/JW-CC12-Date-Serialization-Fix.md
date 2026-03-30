# JW-CC12 — Date Serialization Fix

## Context

The frontend sends ISO 8601 date strings (e.g., `2026-03-30T04:00:00.000Z`) from `Date.toISOString()`. The PHP backend passes these directly into MySQL TIMESTAMP columns, which reject the `T` separator and `Z`/timezone suffix. This causes unhandled MySQL exceptions on every INSERT/UPDATE that includes a date field.

**Affected operations:** Sprint create/edit, Task create/edit (due date, start date), Project create/edit (start date, end date), Milestone create/edit (date).

## Requirements

### 1. Create a date conversion utility

Add a static method to `api/src/Lib/Validator.php` (or create a new `api/src/Lib/DateHelper.php` — your choice, but co-locating in Validator is fine since it already handles date validation):

```php
/**
 * Convert an ISO 8601 date string to MySQL TIMESTAMP format.
 * Returns null if input is null.
 *
 * @param string|null $isoDate e.g. "2026-03-30T04:00:00.000Z" or "2026-03-30"
 * @return string|null e.g. "2026-03-30 04:00:00" or null
 */
```

The function must:
- Accept full ISO 8601 (`2026-03-30T04:00:00.000Z`), ISO with offset (`2026-03-30T04:00:00+00:00`), and date-only (`2026-03-30`)
- Return `Y-m-d H:i:s` format string suitable for MySQL TIMESTAMP columns
- Return `null` when input is `null` (for nullable date fields)
- Throw or return an error for unparseable strings (this should never happen since Validator already checks `iso8601`, but defend anyway)

### 2. Apply the conversion at every date write point

**SprintRoutes.php — POST /sprints (create):**
- Line with `'start_date' => $data['startDate']` → wrap in converter
- Line with `'end_date' => $data['endDate']` → wrap in converter

**SprintRoutes.php — PUT /sprints/{id} (update):**
- Line with `$params['start_date'] = $data['startDate']` → wrap in converter
- Line with `$params['end_date'] = $data['endDate']` → wrap in converter

**TaskRoutes.php — POST /tasks (create):**
- Line with `'due_date' => $data['dueDate'] ?? null` → wrap in converter
- Line with `'start_date' => $data['startDate'] ?? null` → wrap in converter

**TaskRoutes.php — PUT /tasks/{id} (update):**
- Line with `$updateParams['due_date'] = $data['dueDate']` → wrap in converter
- Line with `$updateParams['start_date'] = $data['startDate']` → wrap in converter

**ProjectRoutes.php — POST /projects (create):**
- Line with `'start_date' => $data['startDate'] ?? null` → wrap in converter
- Line with `'end_date' => $data['endDate'] ?? null` → wrap in converter

**ProjectRoutes.php — PUT /projects/{id} (update):**
- Line with `$params['start_date'] = $data['startDate']` → wrap in converter
- Line with `$params['end_date'] = $data['endDate']` → wrap in converter

**MilestoneRoutes.php — POST /milestones (create):**
- Line with `'date' => $data['date']` → wrap in converter

**MilestoneRoutes.php — PUT /milestones/{id} (update):**
- Line with `$params['date'] = $data['date']` → wrap in converter

**Do NOT touch** the recurrence handler in TaskRoutes.php (lines ~739-740) — it already formats correctly with `->format('Y-m-d H:i:s')`.

### 3. Files to modify

1. `api/src/Lib/Validator.php` (add utility method) — OR create `api/src/Lib/DateHelper.php`
2. `api/src/Routes/SprintRoutes.php` (2 write points: POST, PUT)
3. `api/src/Routes/TaskRoutes.php` (2 write points: POST, PUT)
4. `api/src/Routes/ProjectRoutes.php` (2 write points: POST, PUT)
5. `api/src/Routes/MilestoneRoutes.php` (2 write points: POST, PUT)

## Verification

After making changes, run the PHP dev server and verify:

1. **Sprint creation works:**
```bash
curl -X POST http://127.0.0.1:8080/sprints \
  -H "Content-Type: application/json" \
  -H "Cookie: token=<valid_jwt>" \
  -d '{"name":"Test Sprint","startDate":"2026-04-01T04:00:00.000Z","endDate":"2026-04-15T04:00:00.000Z"}'
```
Expected: 201 response with sprint object, `startDate` and `endDate` in ISO 8601 format in the response.

2. **Task creation with dates works:**
```bash
curl -X POST http://127.0.0.1:8080/tasks \
  -H "Content-Type: application/json" \
  -H "Cookie: token=<valid_jwt>" \
  -d '{"title":"Test Task","projectId":"<valid_project_id>","dueDate":"2026-04-10T04:00:00.000Z","startDate":"2026-04-01T04:00:00.000Z"}'
```
Expected: 201 response with task object containing populated `dueDate` and `startDate`.

3. **Null dates still work:**
```bash
curl -X POST http://127.0.0.1:8080/tasks \
  -H "Content-Type: application/json" \
  -H "Cookie: token=<valid_jwt>" \
  -d '{"title":"No Date Task","projectId":"<valid_project_id>"}'
```
Expected: 201 response with `dueDate: null`, `startDate: null`.

4. **PHP server starts with no errors:** `php -S 127.0.0.1:8080 -t . 2>&1 | head -5`

## Scope

- **Only** add the date conversion utility and apply it at write points
- Do **not** modify any read/map logic (the `date('c', strtotime(...))` calls on output are correct)
- Do **not** modify the Validator's `iso8601` rule
- Do **not** modify any frontend code
