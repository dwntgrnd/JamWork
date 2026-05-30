# Production Update Runbook

**Status:** 🟡 In progress — accumulating changes in local dev. Do **not** deploy to
production until this batch is finalized and this doc is marked ready.

**Purpose:** Track every change being prepared in local dev that needs to reach
production, with special attention to **database schema changes** (the only changes that
carry data risk). Code-only changes (frontend + backend PHP) deploy with zero data risk;
schema changes are listed explicitly so the production update is deliberate and safe.

How to use this doc: as each feature/bugfix is built in dev, add an entry under
**Changes in this batch**. If it touches the database, also add its migration to
**Consolidated database migrations**. When the batch is ready, follow **Deployment
runbook** top to bottom.

---

## Changes in this batch

### 1. Per-project "Part of sprint planning" setting + Project Settings panel

- **What:** New per-project toggle ("Part of sprint planning", default ON). When OFF:
  the project's own timeline hides sprint background bands, and the project's
  sprint-less tasks are excluded from the global sprint backlog. Introduced a Project
  Settings dialog (gear button) as the single home for name/description/dates + the
  toggle, now accessible from all three project views (List / Board / Timeline) via a
  shared `ProjectHeader`.
- **DB impact:** ✅ Yes — one additive column (see migration 003 below).
- **Backend (code-only):** `ProjectRoutes.php` (maps/validates/persists `sprintPlanning`),
  `TaskRoutes.php` (backlog query excludes `sprint_planning = 0` projects),
  `install.php` (registered migration 003 for fresh installs).
- **Frontend (code-only):** new `project-header.tsx`, `project-settings-dialog.tsx`,
  `ui/switch.tsx`; refactored `project.tsx`, `project-board.tsx`, `project-timeline.tsx`;
  `refreshKey` prop added to `board-view.tsx` and `timeline-view.tsx`; `Project` type
  gained `sprintPlanning?: boolean`.

### 2. New task status: "Blocked"

- **What:** Add a 5th workflow status `blocked` (alongside todo / in_progress / review /
  done), with its own board column. Lightweight by design — no task-dependency linking;
  the reason a task is blocked is managed in the task description.
- **DB impact:** ❌ None. The `tasks.status` column is `VARCHAR(50)` (not an ENUM), so new
  status strings need no migration. **This change is code-only.**
- **Backend (code-only):** `TaskRoutes.php` — add `blocked` to the three hardcoded status
  validation lists (POST `~289`, PUT `~604`, bulk-update array `~95`).
- **Frontend (code-only):** `types/index.ts` (`TaskStatus` union + `STATUS_LABELS`),
  `style-tokens.ts` (`STATUS_COLORS`), `globals.css` (new `--status-blocked-*` tokens, amber
  hue 55, light + dark), `board-view.tsx` (`columns` array). Status `<Select>`s in **five**
  places: `task-drawer.tsx`, `task-list.tsx` (inline row editor), `task-filters.tsx`,
  `sprints.tsx` (backlog filter). Order everywhere: In Progress → **Blocked** → Review.
- **Timeline indicator:** `timeline-view.tsx` — `getStatusColor` gained a `blocked` case
  (was falling through to the todo gray, so blocked bars looked like To Do), plus an amber
  ring (`ring-status-blocked-fg/60`) on the bar/dots as an exception-state cue. The amber
  ring yields to the red overdue ring when a task is both blocked and overdue.
- **Status:** ✅ implemented in dev, verified (typecheck clean).

### 3. Project task count = open tasks only

- **What:** The project task count now counts only **open** tasks (status `!= 'done'`) —
  todo / in_progress / blocked / review all count; done is excluded. Keeps the sidebar
  folder badge and project-page header reflecting remaining work instead of growing with
  completed tasks.
- **DB impact:** ❌ None. Query-logic change only. **Code-only.**
- **Backend (code-only):** `ProjectRoutes.php` — `FETCH_QUERY` task-count subquery gains
  `AND t.status != 'done'` (escaped as `\'done\'` inside the single-quoted PHP string).
  Feeds `project._count.tasks` for the GET list, POST, and PUT responses.
- **Frontend (code-only):** `project-header.tsx` — header label changed from "X tasks" to
  "X open" so the meaning is explicit. Sidebar badge unchanged (just shows the number,
  which now means open tasks).
- **Dynamic refresh (code-only):** the count updates live (no page reload) on the existing
  `projects-updated` window event.
  - *Dispatch side:* status-change paths that didn't already fire it now do —
    `task-list.tsx` (inline status edit), `task-drawer.tsx` (`handleStatusChange`),
    `board-view.tsx` (`handleDragEnd`), `bulk-action-bar.tsx` (mark-as-done + its undo).
    Create/delete already dispatched.
  - *Listen side:* the sidebar already listened. The **project-page header** did not — its
    `project` state was fetched per-page and never refreshed on the event. Fixed by a new
    shared `useProject(projectId)` hook (`hooks/use-project.ts`) that fetches the project
    *and* listens for `projects-updated`; `project.tsx`, `project-board.tsx`, and
    `project-timeline.tsx` now use it, which also removed three copies of identical
    fetch logic.
- **Status:** ✅ implemented in dev, verified (DB count check: a project with 7 total / 2
  done now reports 5).

<!-- Add change #4, … here as they are built. Note DB impact for each. -->

---

## Future cleanups / tech debt (non-blocking)

Quality notes captured while building this batch. None block the production update — they're
opportunistic refactors for next time the area is touched.

- **Centralize task-status option lists.** Status `<SelectItem>` lists are hand-written in
  five components (`task-drawer.tsx`, `task-list.tsx`, `task-filters.tsx`, `sprints.tsx`,
  and the board `columns` array in `board-view.tsx`), so adding a status means editing all
  five (plus three backend validation strings in `TaskRoutes.php`). Surfaced when adding
  "Blocked" — two selectors were initially missed. Cleanup: render options by mapping over
  `STATUS_LABELS`, and derive a single backend allow-list constant referenced by all three
  validation sites. Would turn "add a status" into a ~2-line change.

- **Centralize the `projects-updated` signal.** The sidebar refreshes its open-task badge
  by listening for a `projects-updated` window event that each task-mutation site
  dispatches by hand (`task-list`, `task-drawer`, `board-view`, `bulk-action-bar`). Same
  class of scattered-wiring risk as the status lists — a new mutation path can forget to
  fire it (the bulk mark-as-done path originally did). Cleanup: dispatch it once from the
  `/tasks` mutation helpers in `lib/api.ts` (or a thin wrapper), so every task write
  refreshes counts automatically.

---

## Deferred / parked (not in this batch)

### "Archived" tasks — deferred

Considered adding an "archived" concept for tasks; **deliberately deferred** to keep the
product lean (it's not a current pain point and warrants deeper design).

When revisited, the recommended model is **not** a status value (which would erase a
task's real status on archive and complicate un-archiving). Instead, use a separate
nullable `archived_at TIMESTAMP NULL` on `tasks` — mirroring the existing `deleted_at`
soft-delete pattern. Normal views filter `archived_at IS NULL` by default (like the
existing `excludeCompleted` param); an opt-in "Show archived" toggle or view reveals them.
Open questions to resolve before building: can any task be archived or only `done` ones;
does archiving auto-remove from sprint/backlog; how counts/stats treat archived; archive
vs. delete; bulk archive sweeps. **Would be one additive migration when pursued.**

---

## Consolidated database migrations

All schema changes in this batch, in apply order. Each is **additive and
backward-compatible** (the current production code keeps working against the new schema),
so they can be applied before the code deploy.

### Migration 003 — `projects.sprint_planning`

File: `api/migrations/003_project_sprint_planning.sql`

```sql
ALTER TABLE `projects`
  ADD COLUMN `sprint_planning` TINYINT(1) NOT NULL DEFAULT 1;
```

- **Type:** additive `ADD COLUMN`. Does not read, rewrite, rename, or drop existing data.
- **Existing rows:** `NOT NULL DEFAULT 1` auto-fills every existing project with `1`
  (sprint planning ON), preserving current production behavior exactly. No backfill.
- **Locking:** INSTANT (metadata-only) on MySQL 8.0.12+; `projects` is tiny regardless.
  No meaningful downtime.

<!-- Add migration 004, 005, … here as new schema changes are introduced. -->

---

## Deployment runbook

Run in this order when the batch is finalized.

### 1. Back up the production database (always, no exceptions)

```bash
mysqldump -u <user> -p <dbname> > backup-before-batch-$(date +%F).sql
```

### 2. Apply database migrations to the live DB

Apply each migration from **Consolidated database migrations** above, in order, via your
prod DB tool (mysql client / phpMyAdmin / Adminer).

⚠️ **Do NOT run `install.php` against the production database.** It re-runs the full
migration list and the `ADD COLUMN` statements are not idempotent in plain MySQL (no
`ADD COLUMN IF NOT EXISTS`) — they would error with "Duplicate column" on an existing DB.
The installer's migration list is for **fresh installs only**. For an existing prod DB,
apply only the delta.

Idempotency guard (safe to run / re-run) — check before applying:

```sql
SELECT COUNT(*) FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name = 'projects'
  AND column_name = 'sprint_planning';
-- if 0, run migration 003
```

### 3. Deploy backend code (PHP API)

Must happen **after** the column exists (the new backend references `sprint_planning`).
Safe because the column is backward-compatible — the old backend also works against the
new schema, so step 2 before step 3 carries no risk.

### 4. Deploy frontend code

The old frontend works against the new backend (it ignores `sprintPlanning`), so frontend
can deploy last without a flag-day.

---

## Rollback

- **Preferred:** revert the code (frontend, then backend). The extra column(s) sitting
  in the schema are harmless even with the old code, so no DB rollback is needed.
- **Only if you must remove the schema change:** e.g. `ALTER TABLE projects DROP COLUMN
  sprint_planning;` — but this discards any toggles users set. Prefer code revert.
- **Worst case:** restore from the `mysqldump` taken in step 1.

---

## Principles (for future changes)

- **Safe (no data risk):** new column with a default, new table, new index. Additive only.
- **Risky (needs care / staged migration):** drop or rename a column, change a column
  type, add `NOT NULL` without a default to a table that has existing rows, data
  backfills/transforms.
- Always back up before any schema change, even "safe" ones.
- Keep schema changes backward-compatible so the column/table can land before the code
  that uses it — this removes flag-day coupling between DB and code deploys.
