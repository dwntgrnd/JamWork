# Production Update Runbook — v2.2.0 (Task Notification Preferences)

**Status:** 🟡 Built in dev, ready to release. Deploy when you are.

**Baseline assumption:** production is currently running **v2.1.x**, so migration `003`
(`projects.sprint_planning`) is **already applied**. This release adds **only migration 004**.
If production is older than v2.1.0, apply migration 003 first (see the v2.1.0 runbook) — the
idempotency guards below make it safe to check either way.

**What to deploy:** the **`v2.2.0` release** — `jamwork-2.2.0.zip` (built locally at
`release/jamwork-2.2.0.zip` via `scripts/build-release.sh`). Source: `main` at tag `v2.2.0`.
Contains migration `004_notification_preferences.sql` plus all code for the notification feature.

**Purpose:** Deliver task notification preferences (per-user toggles, a task-wide flag, and a
project default) with **zero data loss** and **no surprise email** to existing users.

---

## Changes in this batch

### 1. Task notification preferences (three control layers)

- **What:** Notification sending is now governed by three independent layers composed as a
  pure AND (any one can suppress; none can force):
  - **Per-user toggles** (`users.notify_assigned` / `notify_unassigned` / `notify_changed`) —
    receiver-side, set in **Settings → Email notifications**.
  - **Task-wide flag** (`tasks.notify_enabled`) — silences a task for everyone; set in the task
    editor.
  - **Project default** (`projects.default_notify_enabled`) — seeds the task flag at creation;
    set in Project Settings. Not retroactive.
  - Two **new** email events were added on top of the existing *Assigned*: *Unassigned* and
    *Task changed* (fires only on §significant fields: status / due date / priority).
- **DB impact:** ✅ Yes — migration 004 (three additive `ALTER TABLE`s + one backfill `UPDATE`).
- **Backend (code):** new `src/Lib/NotificationService.php` (single send-decision point) and two
  email templates + Mailer methods; `TaskRoutes.php` (POST seeds the flag from the project
  default; PUT computes significant-change + dispatches; recurring clone carries the flag and
  stays silent); `AuthRoutes.php` (profile/login/me thread the three toggles);
  `ProjectRoutes.php` (persists `default_notify_enabled`); `TaskModel.php` (maps `notifyEnabled`);
  `install.php` (registers migration 004 for fresh installs).
- **Frontend (code):** `types/index.ts`; Settings "Email notifications" card +
  `use-auth` `updateNotificationPreferences`; `task-drawer.tsx` per-task toggle;
  `project-settings-dialog.tsx` default toggle.
- **Tests:** `api/tests/NotificationServiceTest.php` (dependency-free; `php tests/NotificationServiceTest.php`).

---

## Consolidated database migrations

### Migration 004 — notification preference columns

File: `api/migrations/004_notification_preferences.sql`

```sql
ALTER TABLE `users`
  ADD COLUMN `notify_assigned`   TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN `notify_unassigned` TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN `notify_changed`    TINYINT(1) NOT NULL DEFAULT 1;

UPDATE `users` SET `notify_unassigned` = 0, `notify_changed` = 0;

ALTER TABLE `tasks`
  ADD COLUMN `notify_enabled` TINYINT(1) NOT NULL DEFAULT 1;

ALTER TABLE `projects`
  ADD COLUMN `default_notify_enabled` TINYINT(1) NOT NULL DEFAULT 1;
```

- **Type:** additive `ADD COLUMN`s + one `UPDATE`. Nothing is read-destructively, renamed, or
  dropped. INSTANT (metadata-only) column adds on MySQL 8.0.12+; the `UPDATE` touches the small
  `users` table once. No meaningful downtime.
- **Existing rows:** every column defaults `1`, preserving the *Assigned* path exactly. The
  `UPDATE` then sets the two **new** events OFF for **existing** users so they get **no email
  type they've never seen** — they opt in via Settings. New signups keep the `DEFAULT 1` all-ON
  experience (the backfill only touches rows present at migration time).
- **Behavior note (read this):** existing users are unaffected; *Unassigned* / *Task changed*
  stay silent for them until opted in. New users get all three ON.

<!-- Add migration 005, … here as new schema changes are introduced. -->

---

## Upgrading from older than v2.1.x

The standard runbook below assumes production is on **v2.1.x** and therefore applies **only
migration 004**. A host on **v2.0.x or earlier** is also missing **migration 003**
(`projects.sprint_planning`, introduced in v2.1.0). The v2.2.0 code is a full file swap that
includes the 2.1 sprint-planning feature, so it queries `projects.sprint_planning` — if you
apply only 004, **the app will break** on that missing column.

Code upgrades all-at-once (one file swap = every feature); the **database** upgrades by applying
incremental migration deltas. So on an older host you must catch the DB up across **every**
missing migration before/with the deploy.

Migration history by version:

| Version | DB migrations present |
|---|---|
| v2.0.0 / v2.0.1 | 001, 002 |
| v2.1.0 / v2.1.1 | 001, 002, **003** |
| v2.2.0 (this release) | 001, 002, 003, **004** |

### Path A — preserve the data (data-safe delta)

After the **backup** (step 1 below), apply each missing migration **in order**, using these
guards (apply only when the check returns `0`):

```sql
-- 002 (password reset): inherently safe — CREATE TABLE IF NOT EXISTS.
-- Just run api/migrations/002_password_reset_tokens.sql as-is.

-- 003 (sprint planning):
SELECT COUNT(*) FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'projects' AND column_name = 'sprint_planning';
-- if 0, run api/migrations/003_project_sprint_planning.sql

-- 004 (notifications):
SELECT COUNT(*) FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'notify_assigned';
-- if 0, run api/migrations/004_notification_preferences.sql
```

Then continue with **step 3 (deploy the v2.2.0 package)** below. Migration 001 (the initial
schema) must already be present, or the app could never have run. If the host predates v2.0.0 it
may also be missing 002 — running it is harmless when the table already exists.

### Path B — throwaway test box (fresh install, DESTROYS data)

If the host's existing data is disposable, skip the delta entirely: drop and recreate the
database, delete `api/.installed`, deploy the v2.2.0 ZIP, and run `install.php`. The v2.2.0
installer's migration list runs **all four** migrations (001→004) in order. **Only** do this when
losing that site's data is acceptable.

---

## Deployment runbook

Run in this order when the batch is finalized.

### 1. Back up the production database (always, no exceptions)

```bash
mysqldump -u <user> -p <dbname> > backup-before-v2.2.0-$(date +%F).sql
```

### 2. Apply migration 004 to the live DB

Apply `004_notification_preferences.sql` via your prod DB tool (mysql client / phpMyAdmin /
Adminer).

⚠️ **Do NOT run `install.php` against the production database.** Its migration list is for
**fresh installs only**; the `ADD COLUMN` statements are not idempotent in plain MySQL (no
`ADD COLUMN IF NOT EXISTS`) and would error with "Duplicate column" on an existing DB. Apply
only the delta.

Idempotency guard (check before applying; safe to re-check):

```sql
SELECT COUNT(*) FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name = 'users'
  AND column_name = 'notify_assigned';
-- if 0, run migration 004
```

Migration 004 is additive and backward-compatible, so it can land **before** the code deploy —
no flag-day coupling. Because the new code references the new columns, apply 004 **first**.

### 3. Deploy the v2.2.0 package

Upload the contents of `jamwork-2.2.0.zip` to the web root, per the deploy README inside the ZIP.
This carries both the API and the prebuilt frontend together.

- **Overwrite in place — never delete `api/`.** Deleting it destroys `api/.env` and
  `api/.installed`, which are excluded from the ZIP precisely so they survive updates.
- The bundled frontend is the prebuilt `dist`, so there's no build step on the server.
- The column exists before the code that uses it (step 2 first), so ordering is correct; the
  change is backward-compatible either way.

### 4. Post-deploy verification

- **Settings → Email notifications** renders three toggles. For an existing user, *Assigned to me*
  is ON while *Removed from a task* and *Updates to my tasks* are OFF (the opt-in backfill).
- Task editor shows **"Email notifications for this task"**; Project Settings shows
  **"Default email notifications for new tasks"**.
- With SMTP configured: assign a teammate to a task → they receive one *Assigned* email.
- Turn a user's *Assigned to me* OFF (or the task flag OFF) → no email on the next assignment.

---

## Rollback

- **Preferred:** revert the code (frontend, then backend). The extra columns are harmless to the
  old code, so no DB rollback is needed.
- **Only if you must remove the schema:** e.g. `ALTER TABLE users DROP COLUMN notify_assigned,
  DROP COLUMN notify_unassigned, DROP COLUMN notify_changed;` (and the `tasks`/`projects`
  columns) — but this discards any preferences users set. Prefer the code revert.
- **Worst case:** restore the `mysqldump` from step 1.

---

## Principles (for future changes)

- **Safe (no data risk):** new column with a default, new table, new index, an additive backfill
  `UPDATE` with a deterministic target. Additive only.
- **Risky (needs care):** dropping/renaming a column, changing a type, adding `NOT NULL` without a
  default to a populated table, destructive backfills.
- Always back up before any schema change, even "safe" ones.
- Keep schema changes backward-compatible so the column/table can land before the code that uses
  it — this removes flag-day coupling between DB and code deploys.
