# Production Update Runbook — v2.2.1 (Cleanup, CI/Quality, Session Revocation, Auth Resilience)

**Status:** 🟡 Built in dev, ready to release. Deploy when you are.

**Baseline assumption:** the previous packaged release was **v2.2.0** (migrations
`001`–`004`), but it was never tagged or confirmed deployed — so this runbook covers
**both** likely baselines:

| If production is on… | DB migrations present | This release applies |
|---|---|---|
| **v2.1.x** (2.2.0 never shipped) | 001, 002, 003 | **004 then 005** |
| **v2.2.0** | 001, 002, 003, 004 | **005 only** |

Both paths use information_schema guards, so applying either set is safe to re-check.

**What to deploy:** `jamwork-2.2.1.zip` (built locally via `scripts/build-release.sh`;
output at `release/jamwork-2.2.1.zip`, a gitignored build artifact). Source: `main`,
tagged `v2.2.1` when the release is cut. The package contains a production-only `vendor/`
(no dev tooling) and the prebuilt frontend.

**Purpose:** Ship the audit/refactor/CI work, session-revocation (migration 005), and the
auth-resilience fixes with **zero data loss** and **no surprise logouts** for existing users.

---

## Changes in this batch

- **Internal refactor (no behavior change):** Slim app factory extracted from `index.php`;
  `TaskService`/`SprintService` extracted from their route files; validation consolidated
  through `Validator`. Guarded by a real-MySQL HTTP characterization test suite.
- **Frontend refactor:** migrated to TanStack Query; removed the window-event bus;
  decomposed large components. No user-facing feature change.
- **Security headers (audit S5):** Content-Security-Policy and HSTS now sent.
- **Session revocation (audit S3 → migration 005):** `users.token_version`; a user's
  existing sessions are invalidated the first time they change/reset their password.
- **Auth resilience fixes (code only — no migration):**
  - **Rate limiter:** the login limiter now has its own per-IP bucket instead of sharing one
    with the global limiter, so normal browsing can no longer exhaust the login budget and
    cause a spurious "Too many requests" on the first login.
  - **DB outage handling:** when the database is unreachable the API now returns a clean
    `503` (with `Retry-After`, no detail leak) instead of a raw `500`.
  - **Client error handling:** a 401 funnels to the login page from one place; a 5xx / network
    failure shows a "can't reach the server" screen (not a wrongful logout); task/board/timeline
    views show an error+retry state instead of a silent empty list.
  - **Forced password reset:** now re-issues the auth cookie (like change-password), so a user
    who completes a forced reset stays logged in instead of being bounced to the login screen.
- **Quality infrastructure:** PHPUnit harness, MySQL-backed integration tests in CI, and a
  blocking client lint gate. (Dev-only; not in the release package.)
- **Bug fixes:** sprint-backlog assign dropdown now shows ended-but-active sprints; fixed an
  infinite render loop in TaskList on first load.
- **DB impact:** migration **005** (plus **004** if production is still on v2.1.x). The
  auth-resilience fixes add **no** schema changes.

---

## Pre-flight: JWT_SECRET length (php-jwt ^7)

This release uses `firebase/php-jwt ^7`. HS256 token signing/verification requires a
**JWT_SECRET of at least 32 characters**. The app reads `$_ENV['JWT_SECRET']` directly with
no in-app length check (`api/src/Lib/Auth.php`), so a too-short secret does not warn — it
surfaces as **failed logins / "session expired"** after the upgrade.

**Before deploying**, check the live `api/.env`:

```bash
awk -F= '/^JWT_SECRET=/{ v=$2; gsub(/^[ \t"]+|[ \t"]+$/,"",v); print length(v) }' api/.env
```

If the result is `< 32`, set a new ≥32-char secret **before** the deploy. Note: changing
`JWT_SECRET` invalidates all existing sessions (everyone re-logs in once) — schedule
accordingly. If it is already ≥32, no action needed.

---

## Database migrations

### Migration 005 — `users.token_version`

File: `api/migrations/005_add_token_version.sql`

```sql
-- Adds users.token_version INT NOT NULL DEFAULT 0, guarded so re-running is safe.
ALTER TABLE `users` ADD COLUMN `token_version` INT NOT NULL DEFAULT 0;
```

- **Type:** additive `ADD COLUMN` with a default. The shipped file wraps this in an
  information_schema guard (idempotent; MySQL-8 compatible — no `ADD COLUMN IF NOT EXISTS`).
  INSTANT/metadata-only on MySQL 8.0.12+. No meaningful downtime.
- **Required by:** `AuthMiddleware` — the column must exist before the new code runs.
- **Existing sessions:** preserved. Pre-upgrade tokens carry no version claim and are read as
  `0`, matching the default; a user's sessions invalidate on their next password change/reset.

### Migration 004 — only if production is still on v2.1.x

If the matrix above puts you on the **v2.1.x** row, apply `004` **before** `005`. It is
additive (notification-preference columns) and documented in full in
`production-update-runbook-v2.2.0.md`.

### Guarded apply (run each only when its check returns 0)

```sql
-- 004 (notifications) — only needed from a v2.1.x baseline:
SELECT COUNT(*) FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'notify_assigned';
-- if 0, run api/migrations/004_notification_preferences.sql

-- 005 (token_version):
SELECT COUNT(*) FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'token_version';
-- if 0, run api/migrations/005_add_token_version.sql
```

⚠️ **Do NOT run `install.php` to update.** Its migration list is for fresh installs only.

---

## Deployment runbook

### 1. Back up the production database (always)

```bash
mysqldump -u <user> -p <dbname> > backup-before-v2.2.1-$(date +%F).sql
```

### 2. JWT_SECRET pre-flight

Run the length check above; fix the secret if `< 32` (see Pre-flight section).

### 3. Apply pending migrations (guarded)

Apply `004` (only from a v2.1.x baseline) then `005` via your prod DB tool, using the
information_schema guards above. Both are additive and backward-compatible, so they can land
**before** the code swap.

### 4. Deploy the v2.2.1 package

Upload the contents of `jamwork-2.2.1.zip` to the web root, per the deploy README inside the ZIP.

- **Overwrite in place — never delete `api/`.** Deleting it destroys `api/.env` and
  `api/.installed`, which are excluded from the ZIP precisely so they survive updates.
- The bundled frontend is the prebuilt `dist`; no build step on the server.
- `vendor/` in the package is production-only — uploading it replaces any prior vendor safely.

### 5. Post-deploy verification

- Log in as an existing user → succeeds (confirms `JWT_SECRET` length + php-jwt ^7 are fine).
- Existing users are **not** logged out by the deploy itself.
- Change a user's password → that user's other sessions are invalidated on next request
  (token_version revocation working).
- Spot-check: response headers include `Content-Security-Policy` and `Strict-Transport-Security`.
- **Auth resilience spot-checks:**
  - Normal browsing followed by a login does **not** return "Too many requests".
  - If the DB is briefly unavailable, the app shows a "can't reach the server" state (a clean
    `503` from the API), not a blank/empty screen or a wrongful logout.
  - A forced password reset lands the user in the app (still logged in), not back on the login page.

---

## Rollback

- **Preferred:** revert the code (frontend, then backend). The extra `token_version` column is
  harmless to the old code, so no DB rollback is needed.
- **Only if you must remove the schema:** `ALTER TABLE users DROP COLUMN token_version;`
  (and, if you also applied 004 this round, its columns) — discards any saved state. Prefer
  the code revert.
- **Worst case:** restore the `mysqldump` from step 1.
- **JWT_SECRET note:** if you changed the secret and roll back, keep the new secret — it is
  compatible with old and new code; reverting it would just force another round of logouts.

---

## Migration history by version

| Version | DB migrations present |
|---|---|
| v2.0.0 / v2.0.1 | 001, 002 |
| v2.1.0 / v2.1.1 | 001, 002, 003 |
| v2.2.0 | 001, 002, 003, 004 |
| **v2.2.1 (this release)** | 001, 002, 003, 004, **005** |
