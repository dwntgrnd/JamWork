# JW-CC03 — MySQL Schema (Initial Migration)

**Context:** JamWork-v2 Phase 3. The database schema needs to be translated from the v1 PostgreSQL/Prisma schema to MySQL 8.0 DDL. The Prisma schema at `/Users/dorenberge/WorkInProgress/VIBE/JamWork/server/prisma/schema.prisma` is the source of truth. That file is READ-ONLY — do not modify it.

**Target file:** `api/migrations/001_initial_schema.sql` (currently a placeholder with one comment line).

**Database:** MySQL 8.0 on SiteGround shared hosting. Character set: `utf8mb4`, collation: `utf8mb4_unicode_ci`.

---

## Task

Replace the contents of `api/migrations/001_initial_schema.sql` with the complete DDL for all 11 tables. The migration must be idempotent — use `CREATE TABLE IF NOT EXISTS` for every table.

---

## Schema Translation Rules

Follow these type mappings from Prisma/PostgreSQL to MySQL:

| Prisma Type | MySQL Type | Notes |
|-------------|-----------|-------|
| `@id @default(uuid()) @db.Uuid` | `CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID())` | MySQL 8.0 supports expression defaults |
| `String` | `VARCHAR(255)` | Default for short strings |
| `String` (description, notes) | `TEXT` | For longer content fields |
| `@db.VarChar(500)` | `VARCHAR(500)` | Explicit length override |
| `String @unique` | `VARCHAR(255) ... UNIQUE` | Unique constraint |
| `Boolean @default(false)` | `TINYINT(1) NOT NULL DEFAULT 0` | |
| `Boolean @default(true)` | `TINYINT(1) NOT NULL DEFAULT 1` | |
| `Int` | `INT` | |
| `Int?` | `INT DEFAULT NULL` | Nullable integer (effort field) |
| `DateTime @default(now())` | `TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP` | |
| `DateTime @updatedAt` | `TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | Auto-update on row change |
| `DateTime?` | `TIMESTAMP NULL DEFAULT NULL` | Nullable timestamps |
| `DateTime` (required, no default) | `TIMESTAMP NOT NULL` | Sprint start/end dates, milestone date |
| `@db.Uuid` (FK columns) | `CHAR(36)` | NOT NULL or NULL depending on relation optionality |

### Nullable FK Columns

Some foreign keys are optional in the Prisma schema (indicated by `?` on the relation). These FK columns must be nullable in MySQL:

- `tasks.sprint_id` → `CHAR(36) DEFAULT NULL` (task may not be in a sprint)
- `sprints.project_id` → `CHAR(36) DEFAULT NULL` (sprint may outlive its project — ON DELETE SET NULL)
- `milestones.project_id` → `CHAR(36) DEFAULT NULL` (Prisma shows `Project?` but ON DELETE CASCADE — see note below)

**Important correction for milestones.project_id:** The Prisma schema shows `project Project? @relation(...)` with `onDelete: Cascade`. This means the column is nullable (can exist without a project) BUT if the referenced project is deleted, the milestone is also deleted. In MySQL:
```sql
project_id CHAR(36) DEFAULT NULL,
FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
```

### Required FK Columns

All other FK columns are required (NOT NULL):
- `projects.created_by_id`
- `tasks.project_id`
- `tasks.created_by_id`
- `subtasks.task_id`
- `labels.created_by_id`
- `task_assignees.task_id`
- `task_assignees.user_id`
- `task_labels.task_id`
- `task_labels.label_id`
- `sprints.created_by_id`
- `milestones.created_by_id`
- `task_links.task_id`
- `task_links.created_by_id`

---

## Table Definitions

Create tables in this order (respects FK dependencies):

### 1. `users`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `CHAR(36)` | `NOT NULL PRIMARY KEY DEFAULT (UUID())` |
| `email` | `VARCHAR(255)` | `NOT NULL UNIQUE` |
| `password_hash` | `VARCHAR(255)` | `NOT NULL` |
| `display_name` | `VARCHAR(255)` | `NOT NULL` |
| `role` | `VARCHAR(50)` | `NOT NULL DEFAULT 'member'` |
| `must_reset_password` | `TINYINT(1)` | `NOT NULL DEFAULT 0` |
| `created_at` | `TIMESTAMP` | `NOT NULL DEFAULT CURRENT_TIMESTAMP` |
| `updated_at` | `TIMESTAMP` | `NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` |

### 2. `workspace_settings`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `CHAR(36)` | `NOT NULL PRIMARY KEY DEFAULT (UUID())` |
| `key` | `VARCHAR(255)` | `NOT NULL UNIQUE` |
| `value` | `VARCHAR(255)` | `NOT NULL` |
| `updated_at` | `TIMESTAMP` | `NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` |

No foreign keys. No `created_at` (matches Prisma schema).

### 3. `projects`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `CHAR(36)` | `NOT NULL PRIMARY KEY DEFAULT (UUID())` |
| `name` | `VARCHAR(255)` | `NOT NULL` |
| `description` | `TEXT` | `DEFAULT NULL` |
| `created_by_id` | `CHAR(36)` | `NOT NULL` |
| `start_date` | `TIMESTAMP` | `NULL DEFAULT NULL` |
| `end_date` | `TIMESTAMP` | `NULL DEFAULT NULL` |
| `created_at` | `TIMESTAMP` | `NOT NULL DEFAULT CURRENT_TIMESTAMP` |
| `updated_at` | `TIMESTAMP` | `NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` |

Foreign keys:
- `created_by_id` → `users(id)` — NO cascade (do not delete projects when user is deleted; app handles reassignment)

Index: `created_by_id`

**Note on user deletion FK behavior:** The v1 app handles user deletion by reassigning owned entities to the admin before deleting the user (see admin routes). Therefore, FK constraints on `created_by_id` columns should use `ON DELETE RESTRICT` (or no action) rather than CASCADE. This prevents accidental data loss and lets the application control the reassignment logic.

### 4. `sprints`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `CHAR(36)` | `NOT NULL PRIMARY KEY DEFAULT (UUID())` |
| `name` | `VARCHAR(255)` | `NOT NULL` |
| `description` | `VARCHAR(500)` | `DEFAULT NULL` |
| `start_date` | `TIMESTAMP` | `NOT NULL` |
| `end_date` | `TIMESTAMP` | `NOT NULL` |
| `status` | `VARCHAR(50)` | `NOT NULL DEFAULT 'active'` |
| `project_id` | `CHAR(36)` | `DEFAULT NULL` |
| `created_by_id` | `CHAR(36)` | `NOT NULL` |
| `created_at` | `TIMESTAMP` | `NOT NULL DEFAULT CURRENT_TIMESTAMP` |
| `updated_at` | `TIMESTAMP` | `NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` |

Foreign keys:
- `project_id` → `projects(id)` ON DELETE SET NULL
- `created_by_id` → `users(id)` ON DELETE RESTRICT

Indexes: `project_id`, `created_by_id`

### 5. `milestones`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `CHAR(36)` | `NOT NULL PRIMARY KEY DEFAULT (UUID())` |
| `name` | `VARCHAR(255)` | `NOT NULL` |
| `date` | `TIMESTAMP` | `NOT NULL` |
| `project_id` | `CHAR(36)` | `DEFAULT NULL` |
| `created_by_id` | `CHAR(36)` | `NOT NULL` |
| `created_at` | `TIMESTAMP` | `NOT NULL DEFAULT CURRENT_TIMESTAMP` |
| `updated_at` | `TIMESTAMP` | `NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` |

Foreign keys:
- `project_id` → `projects(id)` ON DELETE CASCADE
- `created_by_id` → `users(id)` ON DELETE RESTRICT

Indexes: `project_id`, `created_by_id`

### 6. `tasks`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `CHAR(36)` | `NOT NULL PRIMARY KEY DEFAULT (UUID())` |
| `title` | `VARCHAR(255)` | `NOT NULL` |
| `description` | `TEXT` | `DEFAULT NULL` |
| `notes` | `TEXT` | `DEFAULT NULL` |
| `status` | `VARCHAR(50)` | `NOT NULL DEFAULT 'todo'` |
| `priority` | `VARCHAR(50)` | `NOT NULL DEFAULT 'medium'` |
| `effort` | `INT` | `DEFAULT NULL` |
| `due_date` | `TIMESTAMP` | `NULL DEFAULT NULL` |
| `start_date` | `TIMESTAMP` | `NULL DEFAULT NULL` |
| `sort_order` | `INT` | `NOT NULL DEFAULT 0` |
| `recurrence` | `VARCHAR(50)` | `DEFAULT NULL` |
| `sprint_id` | `CHAR(36)` | `DEFAULT NULL` |
| `in_sprint_backlog` | `TINYINT(1)` | `NOT NULL DEFAULT 0` |
| `project_id` | `CHAR(36)` | `NOT NULL` |
| `created_by_id` | `CHAR(36)` | `NOT NULL` |
| `created_at` | `TIMESTAMP` | `NOT NULL DEFAULT CURRENT_TIMESTAMP` |
| `updated_at` | `TIMESTAMP` | `NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` |
| `deleted_at` | `TIMESTAMP` | `NULL DEFAULT NULL` |

Foreign keys:
- `sprint_id` → `sprints(id)` ON DELETE SET NULL
- `project_id` → `projects(id)` ON DELETE CASCADE
- `created_by_id` → `users(id)` ON DELETE RESTRICT

Indexes: `sprint_id`, `project_id`, `created_by_id`, `deleted_at` (for soft-delete filtering), `status`, `priority`

### 7. `subtasks`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `CHAR(36)` | `NOT NULL PRIMARY KEY DEFAULT (UUID())` |
| `title` | `VARCHAR(255)` | `NOT NULL` |
| `completed` | `TINYINT(1)` | `NOT NULL DEFAULT 0` |
| `sort_order` | `INT` | `NOT NULL DEFAULT 0` |
| `task_id` | `CHAR(36)` | `NOT NULL` |
| `created_at` | `TIMESTAMP` | `NOT NULL DEFAULT CURRENT_TIMESTAMP` |

Foreign keys:
- `task_id` → `tasks(id)` ON DELETE CASCADE

Index: `task_id`

No `updated_at` column (matches Prisma schema).

### 8. `labels`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `CHAR(36)` | `NOT NULL PRIMARY KEY DEFAULT (UUID())` |
| `name` | `VARCHAR(255)` | `NOT NULL` |
| `color` | `VARCHAR(50)` | `NOT NULL` |
| `created_by_id` | `CHAR(36)` | `NOT NULL` |
| `created_at` | `TIMESTAMP` | `NOT NULL DEFAULT CURRENT_TIMESTAMP` |

Foreign keys:
- `created_by_id` → `users(id)` ON DELETE RESTRICT

Index: `created_by_id`

No `updated_at` column (matches Prisma schema).

### 9. `task_assignees`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `CHAR(36)` | `NOT NULL PRIMARY KEY DEFAULT (UUID())` |
| `task_id` | `CHAR(36)` | `NOT NULL` |
| `user_id` | `CHAR(36)` | `NOT NULL` |
| `assigned_at` | `TIMESTAMP` | `NOT NULL DEFAULT CURRENT_TIMESTAMP` |

Foreign keys:
- `task_id` → `tasks(id)` ON DELETE CASCADE
- `user_id` → `users(id)` ON DELETE CASCADE

Unique constraint: `UNIQUE (task_id, user_id)`

Indexes: `task_id`, `user_id` (covered by FK indexes and the unique constraint)

**Note:** `user_id` FK uses ON DELETE CASCADE here (matching Prisma). When a user is deleted, their task assignments are removed. This is correct — the admin route reassigns tasks but clears assignee relationships.

### 10. `task_labels`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `CHAR(36)` | `NOT NULL PRIMARY KEY DEFAULT (UUID())` |
| `task_id` | `CHAR(36)` | `NOT NULL` |
| `label_id` | `CHAR(36)` | `NOT NULL` |

Foreign keys:
- `task_id` → `tasks(id)` ON DELETE CASCADE
- `label_id` → `labels(id)` ON DELETE CASCADE

Unique constraint: `UNIQUE (task_id, label_id)`

No timestamp columns (matches Prisma schema).

### 11. `task_links`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `CHAR(36)` | `NOT NULL PRIMARY KEY DEFAULT (UUID())` |
| `title` | `VARCHAR(255)` | `DEFAULT NULL` |
| `url` | `TEXT` | `NOT NULL` |
| `task_id` | `CHAR(36)` | `NOT NULL` |
| `created_by_id` | `CHAR(36)` | `NOT NULL` |
| `created_at` | `TIMESTAMP` | `NOT NULL DEFAULT CURRENT_TIMESTAMP` |

Foreign keys:
- `task_id` → `tasks(id)` ON DELETE CASCADE
- `created_by_id` → `users(id)` ON DELETE RESTRICT

Indexes: `task_id`, `created_by_id`

No `updated_at` column (matches Prisma schema).

---

## SQL File Format

The migration file should:

1. Start with a header comment identifying the migration
2. Set the character set and collation for the session
3. Create each table with `CREATE TABLE IF NOT EXISTS`
4. Use backtick quoting for all table and column names
5. Include all foreign keys, indexes, and unique constraints inline in the CREATE TABLE statement
6. End with a comment confirming completion

Example structure:
```sql
-- JamWork v2 — Initial Schema Migration
-- Generated for MySQL 8.0
-- Run with: mysql -u root -p jamwork < 001_initial_schema.sql

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

CREATE TABLE IF NOT EXISTS `users` (
  ...
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ... remaining tables ...

-- Migration complete: 11 tables
```

---

## MySQL TIMESTAMP Behavior Note

MySQL has a known behavior where the **first** `TIMESTAMP` column in a table automatically gets `DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` unless explicitly defined otherwise. To avoid unexpected auto-updates on the wrong column, **explicitly define DEFAULT and ON UPDATE for every TIMESTAMP column** — never rely on implicit MySQL defaults.

For columns that should NOT auto-update (like `created_at`), explicitly write:
```sql
`created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
```

For columns that SHOULD auto-update (like `updated_at`), explicitly write:
```sql
`updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
```

For nullable date columns (like `due_date`, `start_date`, `deleted_at`), explicitly write:
```sql
`due_date` TIMESTAMP NULL DEFAULT NULL
```

---

## Verification

After writing the SQL file:

1. **Syntax check:** Run the migration against a local MySQL 8.0 instance (or SiteGround's MySQL):
   ```bash
   mysql -u root -p jamwork < api/migrations/001_initial_schema.sql
   ```

2. **Verify all 11 tables exist:**
   ```sql
   SHOW TABLES;
   ```
   Expected: `labels`, `milestones`, `projects`, `sprints`, `subtasks`, `task_assignees`, `task_labels`, `task_links`, `tasks`, `users`, `workspace_settings`

3. **Verify foreign keys:**
   ```sql
   SELECT TABLE_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME
   FROM information_schema.KEY_COLUMN_USAGE
   WHERE TABLE_SCHEMA = 'jamwork' AND REFERENCED_TABLE_NAME IS NOT NULL
   ORDER BY TABLE_NAME;
   ```

4. **Verify unique constraints:**
   - `users.email` is unique
   - `workspace_settings.key` is unique
   - `task_assignees(task_id, user_id)` is unique
   - `task_labels(task_id, label_id)` is unique

5. **Test idempotency:** Run the migration a second time — should complete without errors.

6. **Test UUID generation:** Insert a row without specifying `id` and verify a UUID is auto-generated:
   ```sql
   INSERT INTO workspace_settings (`key`, `value`) VALUES ('workspace_name', 'Test Workspace');
   SELECT * FROM workspace_settings;
   ```

---

## Files Created/Modified

| File | Action |
|------|--------|
| `api/migrations/001_initial_schema.sql` | Replaced (was one-line placeholder) |

## Files NOT Modified

- Everything else — this prompt only writes the migration SQL file.
- Do NOT run `composer install` — that was handled in JW-CC02.
- Do NOT modify any PHP files.
- Do NOT modify anything in `/Users/dorenberge/WorkInProgress/VIBE/JamWork/` (v1 is READ-ONLY).
