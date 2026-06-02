# Security Hardening Round 2 (S3–S9) — Design Spec

**Date:** 2026-06-01
**Branch:** `fix/security-hardening-round-2` (off `main`)
**Source findings:** `docs/audits/2026-06-01-code-audit.md` §3.2–§3.3 (S3–S9)
**Predecessor:** `docs/plans/2026-06-01-high-priority-security-fixes.md` (S1, S2, CI — shipped)

## Goal

Close the remaining Medium and Low security findings from the 2026-06-01 audit: session/JWT revocation (S3), proxy-aware rate limiting (S4), CSP + HSTS headers (S5), constant-time login (S6), scoped user-list exposure (S7), admin invite-password validation (S8), and consistent invite-email escaping (S9). S10 is excluded — the audit deems it acceptable as-is.

## Decisions (resolved with stakeholder)

| # | Decision |
|---|----------|
| S3 | **Model A — `token_version` column.** Embed in JWT, reject stale. Bump on password change/reset; admin-delete invalidates via row removal. Logout stays cookie-clear only (this device). One DB read per authenticated request (accepted). |
| S3 upgrade | Tokens with **no `tv` claim are treated as version 0** → no forced logout on upgrade. Ship a migration; document a one-line `ALTER` for existing installs (no migration-runner exists yet). |
| S4 | **Opt-in trusted-proxy config.** Default off = `REMOTE_ADDR`. When enabled, derive client IP from right-most `X-Forwarded-For`. |
| S5 | **Enforcing CSP**, verified by loading the running app; HSTS added unconditionally (TLS-only assumption). |
| S7 | **Scope fields for non-admins** — admins keep full data incl. email; non-admins get `id`/`displayName`/`role` only. |

## Architecture context (current state, grounded)

- **JWT** (`api/src/Lib/Auth.php:19-26`): payload is `userId`, `role`, `iat`, `exp` (HS256). No identity/version claim. `COOKIE_MAX_AGE = 30d` (`:12`).
- **Auth is stateless today** — `AuthMiddleware` (`api/src/Middleware/AuthMiddleware.php:25-42`) decodes the token, attaches `userId`/`role`, and re-issues the cookie every 24h (`TOKEN_REFRESH_THRESHOLD = 86400`) by re-encoding the existing payload. **No DB read.**
- **`users` schema** (`api/migrations/001_initial_schema.sql:11-20`): `id, email, password_hash, display_name, role, must_reset_password, created_at, updated_at`. No `token_version`.
- **Migrations:** `NNN_description.sql`, idempotent, applied by `install.php`. **No tracking table / runner for existing installs.**
- **Rate limiting** (`api/src/Middleware/RateLimitMiddleware.php`): keys on `sha256(REMOTE_ADDR)` (`:40`); file storage in `sys_get_temp_dir()` (`:21`); `loginLimiter` is `new self(20, 900)` though the comment says 10 (`:28-30`); wired globally in `api/index.php:34` and per-login-route via `.add(RateLimitMiddleware::loginLimiter())`.
- **Headers:** root `.htaccess:23-29` sets `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy`. No CSP/HSTS. No headers set from PHP.
- **Login** (`api/src/Routes/AuthRoutes.php:279`): `if (!$user || !Auth::verifyPassword(...))` — skips bcrypt when the email is absent (timing oracle).
- **`GET /auth/users`** (`AuthRoutes.php:528-548`): returns `id, email, display_name, role, created_at` to anyone with `AuthMiddleware`. Client member-facing consumers (task-drawer, task-filters, task-list, sprints) use only `id`/`displayName`/`role`; only the admin-gated `admin.tsx` reads `email`/`createdAt`.
- **Admin invite** (`AdminRoutes.php:54`): `$temporaryPassword = $data['password'] ?? bin2hex(random_bytes(8));`; validator rules (`:29-32`) don't include `password`, so an admin-supplied password bypasses `min:10`.
- **Mailer** (`api/src/Lib/Mailer.php:58-61`): `sendInviteEmail` interpolates `{{WORKSPACE_NAME}}` **unescaped**; `sendPasswordResetEmail`/`sendTaskAssignmentEmail` escape it.

## Design per finding

### S3 — Session revocation via `token_version`

**Migration** `api/migrations/005_add_token_version.sql`:
- `ALTER TABLE users ADD COLUMN token_version INT NOT NULL DEFAULT 0;` — guarded so re-running is safe (MySQL 8 lacks `ADD COLUMN IF NOT EXISTS`; use an `information_schema` existence check or a documented idempotency guard consistent with how `install.php` applies migrations).
- Fresh installs: applied by `install.php`. Existing installs: runbook gains a one-line `ALTER` upgrade step.

**Token issuance** (`Auth::generateToken`): add a `tv` claim sourced from the user's current `token_version`. The login handler (and anywhere a token is minted) passes the value it just read for that user.

**Validation** (`AuthMiddleware`): after decode, look up the user's `token_version` by `userId` (single indexed read). Reject with 401 when `($payload['tv'] ?? 0) !== $dbTokenVersion`. Consequences, by design:
- Missing `tv` (pre-upgrade tokens) → `0`, matches the default column → still valid until the next bump. No forced logout on upgrade.
- Deleted user → no row → 401 (closes the admin-delete gap without extra code).
- The 24h cookie refresh re-encodes the **same** `tv` (it must read it from the validated payload, not bump it).

**Bumping** `token_version = token_version + 1` (same transaction as the password write) in: change-password (`AuthRoutes.php:518`), reset-password (`:383`), set-new-password (`:162`). Admin-delete needs no bump (row removal handles it). Logout unchanged (cookie clear only).

**Trade-off:** authenticated requests now do one indexed DB read. Accepted per audit §3.2.

### S4 — Proxy-aware rate limiting (opt-in)

- New env flag `RATE_LIMIT_TRUSTED_PROXY` (truthy = on, default off).
- Client-IP resolution: when on, take the **right-most** entry of `X-Forwarded-For` (the hop the trusted proxy actually wrote); when off, use `REMOTE_ADDR` (today's behavior). Right-most is chosen because a single trusted reverse proxy appends the real client IP last; it is the value the proxy controls, not attacker-supplied earlier entries.
- Fix the stale comment (`:28-30`) to say 20.
- File storage and the single-server assumption are unchanged; document the latter near the storage path.

### S5 — CSP + HSTS (enforcing)

Add to the root `.htaccess` header block (`mod_headers` style, matching existing directives):
- `Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"`
- `Header always set Content-Security-Policy "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"`

`'unsafe-inline'` is included for `style-src` only (React injects inline styles); scripts stay `'self'`. **Verification:** load the running app (MAMP + DB), exercise the main views and auth flow with devtools open, and resolve any CSP violations by tightening/relaxing the specific directive — not by broadening `default-src`. `preload` is intentionally omitted from HSTS (opt-in, hard to reverse).

### S6 — Constant-time login

In the login handler, when `$user` is absent, run `Auth::verifyPassword($data['password'], DUMMY_HASH)` (a constant, valid bcrypt hash) and discard the result before returning the same generic 401. Removes the fast-path timing difference between "no such user" and "wrong password."

### S7 — Scope `/auth/users` for non-admins

- Handler branches on the requester's `role` request attribute:
  - admin → `id, email, display_name, role, created_at` (unchanged).
  - non-admin → `id, display_name, role` only.
- Client: make `email` **optional** in the `UserSummary` interface (`email?: string`). Member-facing pickers already use only `id`/`displayName`/`role`; the admin panel uses the separate `User` type and continues to receive `email`.

### S8 — Validate admin-supplied invite password

- When `data['password']` is present, validate it with the existing `min:10` rule (the same policy enforced everywhere else); absent → auto-generate as today. Reject sub-policy passwords with the standard validation error.

### S9 — Escape invite-email workspace name

- `Mailer::sendInviteEmail`: wrap `$workspaceName` in `htmlspecialchars()` to match `sendPasswordResetEmail`/`sendTaskAssignmentEmail`. One-line change.

## Testing strategy

New cases in the existing lightweight harness (`api/tests/NotificationServiceTest.php` style — `check(name, cond)` assertions, run via `php tests/...`), targeting the pure/decidable logic:
- **S3:** token-version comparison — equal (accept), unequal (reject), missing claim → 0 (accept against default).
- **S4:** client-IP extraction — XFF off uses `REMOTE_ADDR`; XFF on returns right-most entry; malformed/empty XFF falls back safely.
- **S8:** the conditional `min:10` rule — present-and-short rejects, present-and-valid passes, absent generates.
- **S9:** workspace-name escaping produces escaped output.

Where logic lives in middleware/route closures, extract the decidable piece into a testable pure function/static method so the harness can exercise it without a live request.

Verified by running the app (not unit-tested): S5 headers/CSP, and the S3 per-request DB check end-to-end — **login → change password → confirm the old token is now rejected** (the core S3 acceptance test), plus admin-delete → old token rejected.

## Out of scope (unchanged from audit)

- S10 (`set-new-password` bcrypt loop) — audit deems acceptable.
- A real migration runner / updater for existing installs (deferred separately).
- Redis/APCu rate-limit backend (multi-instance) — only proxy-awareness is in scope.
- §4 refactors (event bus, data-fetching, god files) and §6 test frameworks / lint-backlog.

## Success criteria

1. Changing a password (via change-password, reset, or set-new-password) invalidates that user's previously issued tokens; admin-deleting a user invalidates theirs. Pre-upgrade tokens are **not** force-invalidated.
2. With `RATE_LIMIT_TRUSTED_PROXY` on, per-client login throttling works behind a proxy; with it off, behavior is unchanged.
3. Response carries enforcing CSP + HSTS, and the app loads/functions with no CSP violations.
4. Login response time no longer distinguishes missing vs. wrong-password.
5. Non-admins no longer receive the email roster from `/auth/users`; member pickers and the admin panel still work; `tsc` passes.
6. Admin-supplied invite passwords under 10 chars are rejected; invite-email workspace name is HTML-escaped.
7. New harness tests pass; the existing 17 checks still pass.
