# JW-CC11 — API Response Shape Fixes

**Context:** An API surface audit (JW-S10/S11) compared every frontend API call against the PHP route handlers. All routes exist, but three response shape mismatches were found plus dead code to remove. These are the fixes.

---

## Fix 1 — Rename `createdBy` to `creator` in TaskModel::mapTask()

**File:** `api/src/Models/TaskModel.php`

In the `mapTask()` method, the key for the task creator is `createdBy` but the frontend TypeScript `Task` interface expects `creator`.

**Change:**
```php
// BEFORE (around line 76 in mapTask):
$task['createdBy'] = $relations['creator'] ?? null;

// AFTER:
$task['creator'] = $relations['creator'] ?? null;
```

**Verify:** `grep -n "createdBy\|creator" api/src/Models/TaskModel.php` — confirm only `creator` key remains in `mapTask()` output. The variable name `$relations['creator']` on the right side stays the same.

---

## Fix 2 — Add `role` to all UserSummary sub-objects

The frontend TypeScript `UserSummary` interface includes `role: UserRole`. The PHP user sub-objects in relations (assignees, creator, links) omit `role`.

**File:** `api/src/Models/TaskModel.php` — `fetchRelationsForTasks()` method

### 2a. Assignees SQL (around line 107)
Add `u.role AS user_role` to the SELECT and include it in the output array:

```php
// BEFORE:
$sql = "
    SELECT ta.task_id, ta.id, ta.user_id, ta.assigned_at,
           u.id AS user_id_rel, u.email AS user_email, u.display_name AS user_display_name
    FROM task_assignees ta
    JOIN users u ON ta.user_id = u.id
    WHERE ta.task_id IN ({$in['clause']})
";

// AFTER:
$sql = "
    SELECT ta.task_id, ta.id, ta.user_id, ta.assigned_at,
           u.id AS user_id_rel, u.email AS user_email, u.display_name AS user_display_name, u.role AS user_role
    FROM task_assignees ta
    JOIN users u ON ta.user_id = u.id
    WHERE ta.task_id IN ({$in['clause']})
";
```

And in the output mapping (around line 118):
```php
// BEFORE:
'user' => [
    'id' => $row['user_id_rel'],
    'email' => $row['user_email'],
    'displayName' => $row['user_display_name'],
],

// AFTER:
'user' => [
    'id' => $row['user_id_rel'],
    'email' => $row['user_email'],
    'displayName' => $row['user_display_name'],
    'role' => $row['user_role'],
],
```

### 2b. Creators SQL (around line 162)
Add `role` to the SELECT and output:

```php
// BEFORE:
$sql = "SELECT id, email, display_name FROM users WHERE id IN ({$cIn['clause']})";
// and output:
$result['creators'][$row['id']] = [
    'id' => $row['id'],
    'email' => $row['email'],
    'displayName' => $row['display_name'],
];

// AFTER:
$sql = "SELECT id, email, display_name, role FROM users WHERE id IN ({$cIn['clause']})";
// and output:
$result['creators'][$row['id']] = [
    'id' => $row['id'],
    'email' => $row['email'],
    'displayName' => $row['display_name'],
    'role' => $row['role'],
];
```

### 2c. Task Links user sub-object (around line 185)
The links query already joins users. Add `u.role AS user_role` and include in output:

```php
// BEFORE (in the SELECT):
u.id AS user_id_rel, u.display_name AS user_display_name

// AFTER:
u.id AS user_id_rel, u.display_name AS user_display_name, u.role AS user_role
```

And in the link output mapping, add `role` to the `createdBy` sub-object:
```php
// BEFORE:
'createdBy' => [
    'id' => $row['user_id_rel'],
    'displayName' => $row['user_display_name'],
],

// AFTER:
'createdBy' => [
    'id' => $row['user_id_rel'],
    'displayName' => $row['user_display_name'],
    'role' => $row['user_role'],
],
```

**Verify:** `grep -n "role" api/src/Models/TaskModel.php` — should show `role` in all three sub-object outputs.

---

## Fix 3 — Add `createdById` to ProjectRoutes mapProject()

**File:** `api/src/Routes/ProjectRoutes.php`

The frontend TypeScript `Project` interface expects `createdById: string`. The PHP `mapProject()` sends a nested `createdBy` object but not the flat `createdById` field.

**Change:** In `mapProject()`, add `createdById` to the return array:

```php
// Add this line to the return array in mapProject():
'createdById' => $row['created_by_id'],
```

Place it after the `'updatedAt'` line and before `'createdBy'`.

**Verify:** `grep -n "createdById" api/src/Routes/ProjectRoutes.php` — should show the new field.

---

## Fix 4 — Remove dead code

### 4a. Remove `PATCH /tasks/bulk` route

**File:** `api/src/Routes/TaskRoutes.php`

Remove the entire `PATCH /tasks/bulk` route handler (starts at line 140 with the comment, ends before the next route). This route is never called by the frontend — the frontend uses `PUT /tasks/bulk-update` exclusively.

Find the block starting with:
```php
// PATCH /tasks/bulk
$group->patch('/bulk', function (Request $request, Response $response) {
```

Remove from that comment through the closing `});` of that route handler.

**Verify:** `grep -n "patch\|PATCH" api/src/Routes/TaskRoutes.php` — should return no results.

### 4b. Remove `apiPatch` from API helper

**File:** `client/src/lib/api.ts`

Remove the `apiPatch` export function (it is never imported anywhere in the codebase).

Find and remove:
```typescript
export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: 'PATCH',
    body: body ? JSON.stringify(body) : undefined,
  });
}
```

**Verify:** `grep -rn "apiPatch\|PATCH" client/src/` — should return no results.

---

## Verification Checklist

After all fixes, run these checks:

1. `grep -n "createdBy\b" api/src/Models/TaskModel.php` — should NOT appear as a JSON key in mapTask (only as `$relations['creator']` variable reference)
2. `grep -n "'role'" api/src/Models/TaskModel.php` — should appear 3 times (assignees, creators, links)
3. `grep -n "createdById" api/src/Routes/ProjectRoutes.php` — should appear in mapProject
4. `grep -n "patch\|PATCH" api/src/Routes/TaskRoutes.php` — should return nothing
5. `grep -rn "apiPatch" client/src/` — should return nothing
6. Start the PHP dev server and confirm no syntax errors: `cd api && php -S 127.0.0.1:8080 -t . 2>&1 | head -5`
