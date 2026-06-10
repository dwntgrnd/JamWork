# Production Update Runbook — v2.3.0 (Status Reports, Multi-Admin Roles, Scheduled Report Delivery)

**Status:** 🟡 Built in dev, ready to release. Deploy when you are.

**Baseline assumption:** the previous deployed release was **v2.2.1** (migrations
`001`–`005`, deployed 2026-06-03). This release applies the three migrations that have
accumulated on `main` since then — **006, 007, and 008** — together.

| If production is on… | DB migrations present | This release applies |
|---|---|---|
| **v2.2.1** (expected) | 001–005 | **006, 007, 008** |
| **v2.2.0** (005 never shipped) | 001–004 | **005, 006, 007, 008** |

All applies below use information_schema guards, so re-checking either path is safe.

**What to deploy:** `jamwork-2.3.0.zip` (built locally via `scripts/build-release.sh`;
output at `release/jamwork-2.3.0.zip`, a gitignored build artifact). Source: `main`,
tagged `v2.3.0` when the release is cut. The package contains a production-only `vendor/`
(no dev tooling) and the prebuilt frontend.

> **Build prerequisite:** `scripts/build-release.sh` currently pins `VERSION="2.2.1"`. Set
> it to `2.3.0` before building, or the artifact will be misnamed.

**Purpose:** Ship the Status Report feature, the three-tier role model (owner/admin/member),
and scheduled report email delivery with **zero data loss** and **no surprise logouts**.

---

## Changes in this batch

- **Status Report (CC30a/b → migration 006):** on-demand status report generation, in-app
  view, markdown download, and an archive. Adds the `reports` table, a per-project
  `include_in_status_report` flag (default ON), and `tasks.completed_at` (backs the Done
  window). One-time approximate backfill seeds `completed_at` from `updated_at` for already-done
  tasks.
- **Multi-Admin role model (CC31a/b → migration 007):** `users.role` becomes an
  `ENUM('owner','admin','member')`; the existing sole admin is promoted to `owner`. New
  promote/demote endpoints and a refactored ownership transfer; the admin page is now a tabbed
  interface (Workspace / Team / Reports) with role-aware actions.
- **Scheduled Report Delivery (CC32a/b → migration 008 + `CRON_SECRET`):** a cron endpoint
  generates + persists a `scheduled` report and emails it to enabled recipients. Adds the
  `report_schedule` (singleton) and `report_recipients` tables; the Reports admin tab gains a
  schedule config card and a recipient toggle list. UTC-only scheduling, no timezone conversion.
- **DB impact:** migrations **006, 007, 008** (additive; details below). **New env var:**
  `CRON_SECRET`.

---

## Pre-flight A — `CRON_SECRET` (new this release)

The cron endpoint `POST /api/cron/generate-report` is **not** behind user auth — it is secured
by a shared secret in `api/.env`. Behavior keyed on the variable:

- **Unset / empty →** the endpoint returns `503 {"error":"Cron endpoint not configured"}`. The
  rest of the app is unaffected; scheduled email simply never fires.
- **Set →** the cron request must send `Authorization: Bearer {CRON_SECRET}` or it gets `401`.

**Before (or with) the deploy**, add a strong secret to the live `api/.env`:

```bash
# generate a value:
php -r "echo bin2hex(random_bytes(32)), \"\n\";"
```

```
# append to api/.env (Application/Cron section):
CRON_SECRET=<paste the generated value>
```

Keep this value — you'll paste the same string into the SiteGround cron command (below). If you
deploy without it, scheduled delivery stays dormant (503) until you set it; nothing breaks.

## Pre-flight B — `JWT_SECRET` length (carried from v2.2.1)

Already satisfied if you are on v2.2.1 (php-jwt ^7 shipped then). If in doubt, re-check that the
live `api/.env` `JWT_SECRET` is ≥32 chars:

```bash
awk -F= '/^JWT_SECRET=/{ v=$2; gsub(/^[ \t"]+|[ \t"]+$/,"",v); print length(v) }' api/.env
```

If `< 32`, set a new ≥32-char secret (this forces a one-time re-login for everyone).

---

## Database migrations

Apply **in order: 006 → 007 → 008**. All are additive and backward-compatible, so they can land
**before** the code swap. Use the guards below — run each block only when its check returns `0`.

### Migration 006 — Status Report tables

File: `api/migrations/006_status_report.sql` — creates `reports`, adds
`projects.include_in_status_report` (default 1) and `tasks.completed_at`, and backfills
`completed_at` for done tasks. INSTANT/metadata-only column adds on MySQL 8.0.12+.

```sql
SELECT COUNT(*) FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_name = 'reports';
-- if 0, run api/migrations/006_status_report.sql
```

### Migration 007 — Multi-Admin role model

File: `api/migrations/007_multi_admin_roles.sql` — constrains `users.role` to
`ENUM('owner','admin','member')` and promotes the existing sole admin to `owner`.

```sql
SELECT COUNT(*) FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'users'
  AND column_name = 'role' AND data_type = 'enum';
-- if 0, run api/migrations/007_multi_admin_roles.sql
```

⚠️ **Do not re-run 007 once applied** — its `UPDATE … SET role='owner' WHERE role='admin'` would
re-promote every admin. The guard above prevents that (it returns non-zero after the first run).

### Migration 008 — Scheduled report delivery tables

File: `api/migrations/008_report_schedule.sql` — creates `report_schedule` (singleton config)
and `report_recipients` (`UNIQUE(user_id)`, `ON DELETE CASCADE`), then seeds **every existing
user** as an enabled recipient.

```sql
SELECT COUNT(*) FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_name = 'report_schedule';
-- if 0, run api/migrations/008_report_schedule.sql
```

⚠️ **Do not re-run 008 once applied** — the recipient seed would collide with `UNIQUE(user_id)`.
The guard prevents re-running.

> If production turns out to be on **v2.2.0** (005 absent), apply `005` first — see
> `production-update-runbook-v2.2.1.md`.

⚠️ **Do NOT run `install.php` to update.** Its migration list is for fresh installs only.

---

## Post-deploy manual step — confirm the workspace owner (migration 007)

Migration 007 promotes the *current sole admin* to `owner`. In production that user is the
intended owner (`doren@downtoground.com`), so **no action is normally needed**. Verify, and only
swap if the wrong account holds `owner`:

```sql
-- verify exactly one owner, and who it is:
SELECT email, role FROM users WHERE role = 'owner';

-- ONLY if the wrong user is owner, reassign (run both, as one step):
UPDATE users SET role = 'admin' WHERE role = 'owner';
UPDATE users SET role = 'owner' WHERE email = 'doren@downtoground.com';
```

Invariant: exactly one `owner` at all times.

---

## SiteGround cron configuration (scheduled delivery)

The schedule's day/time is configured **in-app** (Admin → Reports → Schedule Configuration, in
UTC). SiteGround cron simply pokes the endpoint frequently; the endpoint itself decides whether
to send (it no-ops unless the in-app schedule is enabled and due).

1. In **Site Tools → Devs → Cron Jobs**, add a job that runs at least hourly (e.g. top of every
   hour). A `curl` command works:

   ```bash
   curl -s -X POST https://jamwork.alchemyk12.com/api/cron/generate-report \
     -H "Authorization: Bearer <CRON_SECRET>"
   ```

   Use the **same** `CRON_SECRET` value you put in `api/.env`.
2. The endpoint is idempotent-safe to call when not due: it returns `200 {"skipped":...}` and does
   nothing. It only generates + emails when the in-app schedule is enabled and the window matches.
3. Portability: any scheduler (systemd timer, GitHub Actions, external webhook) that can POST with
   the Bearer header works — SiteGround cron is just the chosen mechanism.

---

## Deployment runbook

### 1. Back up the production database (always)

```bash
mysqldump -u <user> -p <dbname> > backup-before-v2.3.0-$(date +%F).sql
```

### 2. Env pre-flight

- Add `CRON_SECRET` to `api/.env` (Pre-flight A). Keep the value for the cron command.
- Re-confirm `JWT_SECRET` length if unsure (Pre-flight B).

### 3. Apply pending migrations (guarded)

Apply `006 → 007 → 008` via your prod DB tool (phpMyAdmin), using the information_schema guards
above. All additive and backward-compatible — safe to land before the code swap.

### 4. Deploy the v2.3.0 package

Upload the contents of `jamwork-2.3.0.zip` to the web root, per the deploy README inside the ZIP.

- **Overwrite in place — never delete `api/`.** Deleting it destroys `api/.env` (now including
  `CRON_SECRET`) and `api/.installed`, which are excluded from the ZIP so they survive updates.
- The bundled frontend is the prebuilt `dist`; no build step on the server.
- `vendor/` in the package is production-only — uploading it replaces any prior vendor safely.
- Flush OPcache and the SiteGround Dynamic Cache after upload.

### 5. Confirm the owner role

Run the verification query in the post-deploy manual step above; reassign only if needed.

### 6. Configure the cron job

Add the SiteGround cron job (section above) with the `CRON_SECRET` Bearer header.

### 7. Post-deploy verification

- Log in as an existing user → succeeds; existing users are **not** logged out by the deploy.
- **Reports (006):** Admin → can generate a status report, view it, download markdown, see it in
  the archive.
- **Multi-Admin (007):** the admin page shows Workspace / Team / Reports tabs; exactly one owner;
  promote/demote actions appear for the owner; admins see member-only actions.
- **Scheduled delivery (008):**
  - Admin → Reports → Schedule Configuration loads (defaults Weekly / Monday / 09:00 UTC), saves,
    shows the success message; Save is disabled until a change is made.
  - Report Recipients lists team members with working toggles (all enabled by default).
  - Manually fire the cron once with the correct secret and confirm the JSON result:
    ```bash
    curl -s -X POST https://jamwork.alchemyk12.com/api/cron/generate-report \
      -H "Authorization: Bearer <CRON_SECRET>"
    ```
    - Schedule disabled → `{"skipped":"schedule_disabled"}`.
    - Enabled with projects + recipients + working SMTP → `{"generated":true,"reportId":"…","emailsSent":N}`
      and the report appears in the archive as a `scheduled` report (no triggerer).
  - Wrong/missing secret → `401`; secret unset in `.env` → `503`.

---

## Rollback

- **Preferred:** revert the code (frontend, then backend). The added tables/columns
  (`reports`, `report_schedule`, `report_recipients`, `include_in_status_report`,
  `completed_at`, the `role` ENUM) are harmless to older code, so no DB rollback is needed.
- **Role ENUM note:** old code treated `role` as a string and checked for `admin`. After 007 the
  sole prior admin is now `owner`, which old middleware would **not** recognize as admin → that
  user could lose admin access under reverted code. If you roll back the code, also run:
  `UPDATE users SET role='admin' WHERE role='owner';` (then widen the column back to VARCHAR only
  if you must: `ALTER TABLE users MODIFY COLUMN role VARCHAR(50) NOT NULL DEFAULT 'member';`).
- **Only if you must remove the new schema:**
  `DROP TABLE IF EXISTS report_recipients; DROP TABLE IF EXISTS report_schedule;`
  (Status-report objects from 006 can stay; dropping them discards saved reports.)
- **CRON_SECRET:** harmless to leave in `.env` after a rollback — old code ignores it.
- **Worst case:** restore the `mysqldump` from step 1.

---

## Migration history by version

| Version | DB migrations present |
|---|---|
| v2.0.0 / v2.0.1 | 001, 002 |
| v2.1.0 / v2.1.1 | 001, 002, 003 |
| v2.2.0 | 001, 002, 003, 004 |
| v2.2.1 | 001, 002, 003, 004, 005 |
| **v2.3.0 (this release)** | 001–005, **006, 007, 008** |
