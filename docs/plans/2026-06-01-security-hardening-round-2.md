# Security Hardening Round 2 (S3–S9) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining Medium/Low security findings from the 2026-06-01 audit — session revocation (S3), proxy-aware rate limiting (S4), CSP+HSTS (S5), constant-time login (S6), scoped user list (S7), invite-password validation (S8), invite-email escaping (S9).

**Architecture:** Mostly localized changes to the PHP API plus one tiny client type change and one `.htaccess` change. The testable decision logic (token-version comparison, client-IP resolution, the invite-password rule, invite-template escaping) is extracted into pure static methods exercised by a new dependency-free test harness `api/tests/SecurityHardeningTest.php`, wired into CI. Header (S5), the per-request DB check (S3), and the user-list scoping (S7) are verified by loading the running app.

**Tech Stack:** PHP 8.2 / Slim 4 / `firebase/php-jwt` 7.x / MySQL 8 (`api`), React 19 + TypeScript (`client`), Apache `.htaccess`, GitHub Actions.

**Source:** `docs/specs/2026-06-01-security-hardening-round-2-design.md` (approved design); findings S3–S9 in `docs/audits/2026-06-01-code-audit.md`.

---

## Context

Read the design spec for the full rationale and decisions. Key facts the tasks rely on:

- **JWT** (`api/src/Lib/Auth.php`): `generateToken($userId,$role)` builds payload `userId/role/iat/exp`; `decodeToken` returns `?array`; `setAuthCookie($response,$userId,$role)` mints+sets the cookie. No identity/version claim today.
- **Auth is stateless** — `AuthMiddleware` (`api/src/Middleware/AuthMiddleware.php`) decodes the token, attaches `userId`/`role`, and re-issues the cookie when older than 24h, with **no DB read**.
- **`users` table** (`api/migrations/001_initial_schema.sql:11-20`): `id,email,password_hash,display_name,role,must_reset_password,created_at,updated_at`. No `token_version`.
- **Migrations** are `NNN_*.sql`, applied by `install.php` (the `$migrations` array at `install.php:860` + `$pdo->exec($sql)` loop). Latest is `004`. No runner for existing installs.
- **Rate limiting** (`api/src/Middleware/RateLimitMiddleware.php`): keys on `REMOTE_ADDR` (`:40`); `loginLimiter()` is `new self(20, 900)` with a stale "10" comment (`:30`); wired globally (`index.php:34`) + per-login-route.
- **Headers**: root `.htaccess:23-29` sets four headers; no CSP/HSTS. No PHP-set headers.
- **Validator** (`api/src/Lib/Validator.php`): pipe rules; `optional` skips a field that is absent, otherwise runs the remaining rules. So `'optional|min:10'` enforces `min:10` only when the field is present.
- **Test harness** (`api/tests/NotificationServiceTest.php`): `require vendor/autoload.php`; local `check(string,bool)`; ends with `echo "\n{$tests} checks, {$failures} failure(s)\n"; exit($failures === 0 ? 0 : 1);`. CI runs **only this file** today.

**Branch:** Work on `fix/security-hardening-round-2` (already created off `main`; the design spec is committed there). Confirm a clean tree before starting (an untracked root `CLAUDE.md` is unrelated — never stage it).

**Subagent note on app-dependent steps:** Several verification steps need a running API + MySQL (see `docs/LOCAL-DEV.md`). If that infrastructure is not available in your environment, perform the described **static** verification, state clearly that the live check is deferred to manual human verification, and do **not** mark the task BLOCKED for that reason alone.

---

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `api/tests/SecurityHardeningTest.php` | Create | Dependency-free checks for the pure logic (S3/S4/S6/S8/S9) |
| `.github/workflows/ci.yml` | Modify | Add a step to run the new test file |
| `api/src/Lib/Mailer.php` | Modify | Extract `renderInviteBody()`; escape workspace name (S9) |
| `api/src/Routes/AdminRoutes.php` | Modify | Add `optional|min:10` invite-password rule (S8) |
| `api/src/Lib/Auth.php` | Modify | `DUMMY_PASSWORD_HASH` const (S6); `tv` claim + `tokenVersionMatches()` (S3) |
| `api/src/Routes/AuthRoutes.php` | Modify | Constant-time login (S6); pass token_version; scope `/auth/users` (S7); bump version (S3) |
| `api/src/Middleware/RateLimitMiddleware.php` | Modify | `resolveClientIp()` + opt-in proxy config; comment fix (S4) |
| `api/src/Middleware/AuthMiddleware.php` | Modify | Enforce `token_version` per request (S3) |
| `api/migrations/005_add_token_version.sql` | Create | Idempotent `token_version` column (S3) |
| `api/install.php` | Modify | Register migration 005 (S3) |
| `client/src/types/index.ts` | Modify | `UserSummary.email` → optional (S7) |
| `docs/production-update-runbook.md` | Modify | Existing-install upgrade note for migration 005 (S3) |

---

## Task 0: Confirm the branch and baseline

- [ ] **Step 1: Confirm branch + clean tree + baseline test**

```bash
cd /Users/dorenberge/WorkInProgress/VIBE/JamWork_v2
git branch --show-current        # expect: fix/security-hardening-round-2
git status --short               # expect: only "?? CLAUDE.md"
cd api && php tests/NotificationServiceTest.php; echo "exit: $?"
```
Expected: branch matches, tree clean (CLAUDE.md untracked only), and `17 checks, 0 failure(s)`, `exit: 0`.

---

## Task 1: S9 — Escape invite-email workspace name (+ test harness + CI wiring)

This task also creates the shared test file and wires it into CI, so every later task's tests run automatically.

**Files:**
- Create: `api/tests/SecurityHardeningTest.php`
- Modify: `api/src/Lib/Mailer.php` (add `renderInviteBody`, call it in `sendInviteEmail`)
- Modify: `.github/workflows/ci.yml` (run the new test file)

- [ ] **Step 1: Write the failing test (creates the harness)**

Create `api/tests/SecurityHardeningTest.php`:

```php
<?php

/**
 * Dependency-free tests for Security Hardening Round 2 (audit S3–S9).
 *
 * No PHPUnit, no DB, no network — exercises the pure decision/util functions
 * extracted for each finding. Run:  php tests/SecurityHardeningTest.php
 */

require __DIR__ . '/../vendor/autoload.php';

use JamWork\Lib\Auth;
use JamWork\Lib\Mailer;
use JamWork\Lib\Validator;
use JamWork\Middleware\RateLimitMiddleware;

// Token round-trip tests need a secret present.
$_ENV['JWT_SECRET'] = 'test-secret-key-for-security-hardening-tests';

$tests = 0;
$failures = 0;

function check(string $name, bool $cond): void
{
    global $tests, $failures;
    $tests++;
    echo $cond ? "  ok   - {$name}\n" : "  FAIL - {$name}\n";
    if (!$cond) {
        $GLOBALS['failures']++;
    }
}

echo "S9 — invite-email escaping\n";

$tpl = '<h1>{{WORKSPACE_NAME}}</h1><p>{{EMAIL}}</p>';
$out = Mailer::renderInviteBody($tpl, '<script>x</script>', 'Dana', 'd@example.com', 'pw1234567890', 'https://app/login');
check('S9: workspace name is HTML-escaped',
    str_contains($out, '&lt;script&gt;') && !str_contains($out, '<script>'));
check('S9: other fields still escaped (email)',
    str_contains($out, 'd@example.com'));

echo "\n{$tests} checks, {$failures} failure(s)\n";
exit($failures === 0 ? 0 : 1);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd api && php tests/SecurityHardeningTest.php; echo "exit: $?"`
Expected: a fatal error (`Call to undefined method JamWork\Lib\Mailer::renderInviteBody()`) and `exit: 255` — `renderInviteBody` doesn't exist yet.

- [ ] **Step 3: Add `renderInviteBody` and use it in `sendInviteEmail`**

In `api/src/Lib/Mailer.php`, add this public static method (place it directly above `sendInviteEmail`):

```php
    /**
     * Fill the invite template, HTML-escaping every interpolated value
     * (workspace name included — see audit S9).
     */
    public static function renderInviteBody(
        string $template,
        string $workspaceName,
        string $displayName,
        string $email,
        string $temporaryPassword,
        string $loginUrl
    ): string {
        return str_replace(
            ['{{WORKSPACE_NAME}}', '{{DISPLAY_NAME}}', '{{EMAIL}}', '{{TEMPORARY_PASSWORD}}', '{{LOGIN_URL}}'],
            [
                htmlspecialchars($workspaceName),
                htmlspecialchars($displayName),
                htmlspecialchars($email),
                htmlspecialchars($temporaryPassword),
                htmlspecialchars($loginUrl),
            ],
            $template
        );
    }
```

Then replace the inline `str_replace(...)` block inside `sendInviteEmail` (currently `api/src/Lib/Mailer.php:58-62`):

```php
            $html = str_replace(
                ['{{WORKSPACE_NAME}}', '{{DISPLAY_NAME}}', '{{EMAIL}}', '{{TEMPORARY_PASSWORD}}', '{{LOGIN_URL}}'],
                [$workspaceName, htmlspecialchars($displayName), htmlspecialchars($toEmail), htmlspecialchars($temporaryPassword), htmlspecialchars($loginUrl)],
                $html
            );
```

with:

```php
            $html = self::renderInviteBody($html, $workspaceName, $displayName, $toEmail, $temporaryPassword, $loginUrl);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd api && php tests/SecurityHardeningTest.php; echo "exit: $?"`
Expected: `2 checks, 0 failure(s)`, `exit: 0`.

- [ ] **Step 5: Wire the new test file into CI**

In `.github/workflows/ci.yml`, in the `api` job, immediately **after** the existing step:

```yaml
      - name: Run notification decision tests
        run: php tests/NotificationServiceTest.php
```

add:

```yaml
      - name: Run security hardening tests
        run: php tests/SecurityHardeningTest.php
```

- [ ] **Step 6: Commit**

```bash
cd /Users/dorenberge/WorkInProgress/VIBE/JamWork_v2
git add api/tests/SecurityHardeningTest.php api/src/Lib/Mailer.php .github/workflows/ci.yml
git commit -m "fix(security): escape workspace name in invite email; add security test harness + CI (S9)"
```

---

## Task 2: S8 — Validate admin-supplied invite password

The Validator already skips an absent `optional` field, so a single rule closes the gap: a provided password must meet `min:10`; an absent one still auto-generates.

**Files:**
- Modify: `api/src/Routes/AdminRoutes.php` (invite handler rules)
- Modify: `api/tests/SecurityHardeningTest.php` (append checks)

- [ ] **Step 1: Write the failing test**

In `api/tests/SecurityHardeningTest.php`, insert this block immediately **before** the final `echo "\n{$tests}...` line:

```php
echo "S8 — admin invite password policy\n";

$rules = ['password' => 'optional|min:10'];
check('S8: short provided password is rejected',
    Validator::validate(['password' => 'short'], $rules) !== []);
check('S8: valid provided password passes',
    Validator::validate(['password' => 'longenough10'], $rules) === []);
check('S8: absent password passes (auto-generate path)',
    Validator::validate([], $rules) === []);
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd api && php tests/SecurityHardeningTest.php; echo "exit: $?"`
Expected: the new checks **pass already** (they test Validator behavior the rule relies on) — `5 checks, 0 failure(s)`, `exit: 0`. This block is a guard that the rule semantics hold; proceed to wire the rule into the route.

- [ ] **Step 3: Add the rule to the invite handler**

In `api/src/Routes/AdminRoutes.php`, change the invite validator (currently `:29-32`):

```php
                $errors = Validator::validate($data, [
                    'email' => 'required|email',
                    'displayName' => 'required|min:1|max:100',
                ]);
```

to:

```php
                $errors = Validator::validate($data, [
                    'email' => 'required|email',
                    'displayName' => 'required|min:1|max:100',
                    'password' => 'optional|min:10',
                ]);
```

- [ ] **Step 4: Verify it lints/parses and tests pass**

Run: `cd api && php -l src/Routes/AdminRoutes.php && php tests/SecurityHardeningTest.php; echo "exit: $?"`
Expected: `No syntax errors detected`, `5 checks, 0 failure(s)`, `exit: 0`.

- [ ] **Step 5: Commit**

```bash
cd /Users/dorenberge/WorkInProgress/VIBE/JamWork_v2
git add api/src/Routes/AdminRoutes.php api/tests/SecurityHardeningTest.php
git commit -m "fix(security): enforce min:10 on admin-supplied invite password (S8)"
```

---

## Task 3: S6 — Constant-time login

When the email doesn't exist, run a dummy bcrypt verify so the response time matches the wrong-password path.

**Files:**
- Modify: `api/src/Lib/Auth.php` (add `DUMMY_PASSWORD_HASH`)
- Modify: `api/src/Routes/AuthRoutes.php` (login handler)
- Modify: `api/tests/SecurityHardeningTest.php` (append check)

- [ ] **Step 1: Write the failing test**

In `api/tests/SecurityHardeningTest.php`, insert before the final `echo` line:

```php
echo "S6 — constant-time login dummy hash\n";

$info = password_get_info(Auth::DUMMY_PASSWORD_HASH);
check('S6: DUMMY_PASSWORD_HASH is a valid bcrypt hash',
    $info['algoName'] === 'bcrypt');
check('S6: dummy hash never verifies a real attempt',
    Auth::verifyPassword('any-attempt', Auth::DUMMY_PASSWORD_HASH) === false);
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd api && php tests/SecurityHardeningTest.php; echo "exit: $?"`
Expected: fatal error (`Undefined constant ... DUMMY_PASSWORD_HASH`), `exit: 255`.

- [ ] **Step 3: Add the constant to `Auth`**

In `api/src/Lib/Auth.php`, add this constant just below `private const COOKIE_MAX_AGE = ...;` (line 12):

```php
    /**
     * A fixed, valid bcrypt hash used to run a constant-time dummy verify when
     * a login email doesn't exist, so "no such user" costs the same as "wrong
     * password" (audit S6). It is not a credential for any account.
     */
    public const DUMMY_PASSWORD_HASH = '$2y$12$ckGpi7FjNYZxp/wqFPZP1e3r9P.2MkUjLtD0q2e0YAIjaaJQDfPWq';
```

- [ ] **Step 4: Make the login handler constant-time**

In `api/src/Routes/AuthRoutes.php`, replace the combined check (currently `:278-286`):

```php
                // Same error for missing user and wrong password (prevent enumeration)
                if (!$user || !Auth::verifyPassword($data['password'], $user['password_hash'])) {
                    $response->getBody()->write(json_encode([
                        'error' => 'Invalid email or password',
                    ]));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(401);
                }
```

with:

```php
                // Same error for missing user and wrong password (prevent enumeration).
                $invalidCredentials = function () use ($response) {
                    $response->getBody()->write(json_encode([
                        'error' => 'Invalid email or password',
                    ]));
                    return $response
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(401);
                };

                if (!$user) {
                    // Constant-time: a missing user costs the same bcrypt verify as a wrong password (S6).
                    Auth::verifyPassword($data['password'], Auth::DUMMY_PASSWORD_HASH);
                    return $invalidCredentials();
                }

                if (!Auth::verifyPassword($data['password'], $user['password_hash'])) {
                    return $invalidCredentials();
                }
```

- [ ] **Step 5: Verify it parses and tests pass**

Run: `cd api && php -l src/Routes/AuthRoutes.php && php tests/SecurityHardeningTest.php; echo "exit: $?"`
Expected: `No syntax errors detected`, `7 checks, 0 failure(s)`, `exit: 0`.

- [ ] **Step 6: Commit**

```bash
cd /Users/dorenberge/WorkInProgress/VIBE/JamWork_v2
git add api/src/Lib/Auth.php api/src/Routes/AuthRoutes.php api/tests/SecurityHardeningTest.php
git commit -m "fix(security): constant-time login to remove user-enumeration timing oracle (S6)"
```

---

## Task 4: S4 — Proxy-aware rate limiting (opt-in)

**Files:**
- Modify: `api/src/Middleware/RateLimitMiddleware.php` (add `resolveClientIp`, use it, fix comment)
- Modify: `api/tests/SecurityHardeningTest.php` (append checks)

- [ ] **Step 1: Write the failing test**

In `api/tests/SecurityHardeningTest.php`, insert before the final `echo` line:

```php
echo "S4 — client IP resolution\n";

$server = ['REMOTE_ADDR' => '10.0.0.5'];
check('S4: proxy off → REMOTE_ADDR',
    RateLimitMiddleware::resolveClientIp($server, '1.2.3.4', false) === '10.0.0.5');
check('S4: proxy on → right-most XFF entry',
    RateLimitMiddleware::resolveClientIp($server, '1.2.3.4, 5.6.7.8', true) === '5.6.7.8');
check('S4: proxy on, single XFF entry',
    RateLimitMiddleware::resolveClientIp($server, '203.0.113.9', true) === '203.0.113.9');
check('S4: proxy on but empty XFF → REMOTE_ADDR',
    RateLimitMiddleware::resolveClientIp($server, '', true) === '10.0.0.5');
check('S4: proxy on, null XFF → REMOTE_ADDR',
    RateLimitMiddleware::resolveClientIp($server, null, true) === '10.0.0.5');
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd api && php tests/SecurityHardeningTest.php; echo "exit: $?"`
Expected: fatal error (`Call to undefined method ... resolveClientIp()`), `exit: 255`.

- [ ] **Step 3: Add `resolveClientIp`, use it, fix the comment**

In `api/src/Middleware/RateLimitMiddleware.php`, fix the stale comment (`:30`):

```php
        return new self(20, 900); // 10 requests per 15 minutes
```
→
```php
        return new self(20, 900); // 20 requests per 15 minutes
```

Add this static method (place it directly above `process()`):

```php
    /**
     * Resolve the client IP for rate-limit keying.
     *
     * Default: REMOTE_ADDR. When RATE_LIMIT_TRUSTED_PROXY is enabled, take the
     * RIGHT-MOST X-Forwarded-For entry — the hop a single trusted reverse proxy
     * appends — since earlier entries are attacker-controllable (audit S4).
     */
    public static function resolveClientIp(array $serverParams, ?string $forwardedFor, bool $trustProxy): string
    {
        if ($trustProxy && $forwardedFor !== null && trim($forwardedFor) !== '') {
            $parts = array_values(array_filter(
                array_map('trim', explode(',', $forwardedFor)),
                fn($p) => $p !== ''
            ));
            if (!empty($parts)) {
                return end($parts);
            }
        }
        return $serverParams['REMOTE_ADDR'] ?? '127.0.0.1';
    }
```

Then, in `process()`, replace the IP line (currently `:40`):

```php
        $ip = $request->getServerParams()['REMOTE_ADDR'] ?? '127.0.0.1';
```

with:

```php
        $trustProxy = filter_var($_ENV['RATE_LIMIT_TRUSTED_PROXY'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $forwardedFor = $request->getHeaderLine('X-Forwarded-For');
        $ip = self::resolveClientIp(
            $request->getServerParams(),
            $forwardedFor === '' ? null : $forwardedFor,
            $trustProxy
        );
```

- [ ] **Step 4: Verify it parses and tests pass**

Run: `cd api && php -l src/Middleware/RateLimitMiddleware.php && php tests/SecurityHardeningTest.php; echo "exit: $?"`
Expected: `No syntax errors detected`, `12 checks, 0 failure(s)`, `exit: 0`.

- [ ] **Step 5: Commit**

```bash
cd /Users/dorenberge/WorkInProgress/VIBE/JamWork_v2
git add api/src/Middleware/RateLimitMiddleware.php api/tests/SecurityHardeningTest.php
git commit -m "fix(security): opt-in proxy-aware rate limiting via RATE_LIMIT_TRUSTED_PROXY (S4)"
```

---

## Task 5: S7 — Scope `/auth/users` for non-admins

Admins keep the full payload; non-admins get `id`/`displayName`/`role` only (no email/createdAt). Member-facing pickers already use only those fields; the admin panel uses the separate `User` type.

**Files:**
- Modify: `api/src/Routes/AuthRoutes.php` (`/auth/users` handler)
- Modify: `client/src/types/index.ts` (`UserSummary.email` optional)

- [ ] **Step 1: Scope the response by role**

In `api/src/Routes/AuthRoutes.php`, replace the `/auth/users` handler body (currently `:530-544`):

```php
                $db = Database::getInstance();

                $stmt = $db->query('SELECT id, email, display_name, role, created_at FROM users ORDER BY created_at ASC');
                $users = $stmt->fetchAll();

                // Map to camelCase response
                $mapped = array_map(fn($u) => [
                    'id' => $u['id'],
                    'email' => $u['email'],
                    'displayName' => $u['display_name'],
                    'role' => $u['role'],
                    'createdAt' => date('c', strtotime($u['created_at'])),
                ], $users);

                $response->getBody()->write(json_encode(['users' => $mapped]));
```

with:

```php
                $db = Database::getInstance();
                $isAdmin = $request->getAttribute('role') === 'admin';

                $stmt = $db->query('SELECT id, email, display_name, role, created_at FROM users ORDER BY created_at ASC');
                $users = $stmt->fetchAll();

                // Non-admins receive only id/displayName/role (no email roster) — audit S7.
                $mapped = array_map(function ($u) use ($isAdmin) {
                    $entry = [
                        'id' => $u['id'],
                        'displayName' => $u['display_name'],
                        'role' => $u['role'],
                    ];
                    if ($isAdmin) {
                        $entry['email'] = $u['email'];
                        $entry['createdAt'] = date('c', strtotime($u['created_at']));
                    }
                    return $entry;
                }, $users);

                $response->getBody()->write(json_encode(['users' => $mapped]));
```

- [ ] **Step 2: Verify the PHP parses**

Run: `cd api && php -l src/Routes/AuthRoutes.php`
Expected: `No syntax errors detected`.

- [ ] **Step 3: Make `UserSummary.email` optional in the client**

In `client/src/types/index.ts`, the interface at line 42:

```ts
export interface UserSummary {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
}
```

change `email: string;` to:

```ts
  email?: string;
```

- [ ] **Step 4: Verify the client type-checks**

Run: `cd client && npx tsc -b; echo "exit: $?"`
Expected: exit 0. (If a member-facing component is found to read `user.email` from this list and now errors, that contradicts the design's client audit — STOP and report rather than widening the type back.)

- [ ] **Step 5: (App-dependent) Verify behavior — else defer**

With a running app + DB: log in as a **member**, open a task assignee picker (works — uses displayName), and confirm `GET /api/auth/users` returns no `email` field; log in as an **admin** and confirm the admin user list still shows emails. If infra is unavailable, state the live check is deferred to manual human verification and rely on Steps 2+4.

- [ ] **Step 6: Commit**

```bash
cd /Users/dorenberge/WorkInProgress/VIBE/JamWork_v2
git add api/src/Routes/AuthRoutes.php client/src/types/index.ts
git commit -m "fix(security): scope /auth/users — hide email roster from non-admins (S7)"
```

---

## Task 6: S3a — `token_version` schema + token versioning plumbing

Add the column, embed `tv` in the JWT, and enforce it in `AuthMiddleware` (the only new per-request DB read). Pre-upgrade tokens (no `tv` claim) are treated as version 0 → no forced logout.

**Files:**
- Create: `api/migrations/005_add_token_version.sql`
- Modify: `api/install.php` (register migration)
- Modify: `api/src/Lib/Auth.php` (`tv` claim + `tokenVersionMatches`)
- Modify: `api/src/Middleware/AuthMiddleware.php` (enforce version)
- Modify: `api/src/Routes/AuthRoutes.php` (login + signup pass version)
- Modify: `api/tests/SecurityHardeningTest.php` (append checks)
- Modify: `docs/production-update-runbook.md` (existing-install note)

- [ ] **Step 1: Write the failing tests**

In `api/tests/SecurityHardeningTest.php`, insert before the final `echo` line:

```php
echo "S3 — token_version matching & claim\n";

check('S3: equal versions match',
    Auth::tokenVersionMatches(3, 3) === true);
check('S3: unequal versions do not match',
    Auth::tokenVersionMatches(2, 3) === false);
check('S3: missing claim (null) is treated as 0 and matches default',
    Auth::tokenVersionMatches(null, 0) === true);
check('S3: missing claim (null) does not match a bumped version',
    Auth::tokenVersionMatches(null, 1) === false);

// Round-trip: generateToken embeds tv; decodeToken returns it.
$token = Auth::generateToken('user-1', 'member', 4);
$decoded = Auth::decodeToken($token);
check('S3: generated token carries tv claim',
    is_array($decoded) && (int) ($decoded['tv'] ?? -1) === 4);
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd api && php tests/SecurityHardeningTest.php; echo "exit: $?"`
Expected: fatal error (`Call to undefined method ... tokenVersionMatches()`), `exit: 255`.

- [ ] **Step 3: Add `tv` claim + `tokenVersionMatches` to `Auth`**

In `api/src/Lib/Auth.php`, change `generateToken` (`:14-27`) to take a version and embed it:

```php
    public static function generateToken(string $userId, string $role, int $tokenVersion = 0): string
    {
        $secret = $_ENV['JWT_SECRET'];
        $expiry = self::parseExpiry($_ENV['JWT_EXPIRY'] ?? '30d');

        $payload = [
            'userId' => $userId,
            'role' => $role,
            'tv' => $tokenVersion,
            'iat' => time(),
            'exp' => time() + $expiry,
        ];

        return JWT::encode($payload, $secret, 'HS256');
    }
```

Change `setAuthCookie` (`:40-55`) to thread the version through:

```php
    public static function setAuthCookie(Response $response, string $userId, string $role, int $tokenVersion = 0): Response
    {
        $token = self::generateToken($userId, $role, $tokenVersion);
```
(leave the rest of `setAuthCookie` unchanged.)

Add this static method (place it just below `verifyPassword`, before `parseExpiry`):

```php
    /**
     * S3: a token is valid only if its version claim matches the user's current
     * token_version. A missing claim (tokens issued before the upgrade) is read
     * as 0, which equals the column default — so the upgrade logs nobody out.
     */
    public static function tokenVersionMatches(mixed $claimTokenVersion, int $dbTokenVersion): bool
    {
        return (int) ($claimTokenVersion ?? 0) === $dbTokenVersion;
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd api && php tests/SecurityHardeningTest.php; echo "exit: $?"`
Expected: `17 checks, 0 failure(s)`, `exit: 0`.

- [ ] **Step 5: Enforce the version in `AuthMiddleware`**

In `api/src/Middleware/AuthMiddleware.php`, add the import near the other `use` lines (after line 5):

```php
use JamWork\Lib\Database;
```

Then replace the body from the decode check through the refresh (currently `:25-44`):

```php
        $payload = Auth::decodeToken($token);

        if (!$payload || !isset($payload['userId'], $payload['role'])) {
            return $this->unauthorized('Session expired. Please log in again.');
        }

        // Attach user info to request
        $request = $request
            ->withAttribute('userId', $payload['userId'])
            ->withAttribute('role', $payload['role']);

        $response = $handler->handle($request);

        // Sliding session: refresh if token is older than 24 hours
        $tokenAge = time() - ($payload['iat'] ?? time());
        if ($tokenAge > self::TOKEN_REFRESH_THRESHOLD) {
            $response = Auth::setAuthCookie($response, $payload['userId'], $payload['role']);
        }

        return $response;
```

with:

```php
        $payload = Auth::decodeToken($token);

        if (!$payload || !isset($payload['userId'], $payload['role'])) {
            return $this->unauthorized('Session expired. Please log in again.');
        }

        // S3: reject tokens whose version is stale, or whose user no longer exists.
        $db = Database::getInstance();
        $stmt = $db->prepare('SELECT token_version FROM users WHERE id = :id');
        $stmt->execute(['id' => $payload['userId']]);
        $row = $stmt->fetch();

        if (!$row || !Auth::tokenVersionMatches($payload['tv'] ?? null, (int) $row['token_version'])) {
            return $this->unauthorized('Session expired. Please log in again.');
        }
        $dbTokenVersion = (int) $row['token_version'];

        // Attach user info to request
        $request = $request
            ->withAttribute('userId', $payload['userId'])
            ->withAttribute('role', $payload['role']);

        $response = $handler->handle($request);

        // Sliding session: refresh if token is older than 24 hours (preserve tv).
        $tokenAge = time() - ($payload['iat'] ?? time());
        if ($tokenAge > self::TOKEN_REFRESH_THRESHOLD) {
            $response = Auth::setAuthCookie($response, $payload['userId'], $payload['role'], $dbTokenVersion);
        }

        return $response;
```

- [ ] **Step 6: Pass the version when minting tokens (login + signup)**

In `api/src/Routes/AuthRoutes.php`:

Login (currently `:288`) — the handler does `SELECT * FROM users`, so `$user['token_version']` is available:

```php
                $response = Auth::setAuthCookie($response, $user['id'], $user['role']);
```
→
```php
                $response = Auth::setAuthCookie($response, $user['id'], $user['role'], (int) $user['token_version']);
```

Signup (currently `:240`) — a brand-new admin starts at version 0:

```php
                $response = Auth::setAuthCookie($response, $userId, 'admin');
```
→
```php
                $response = Auth::setAuthCookie($response, $userId, 'admin', 0);
```

- [ ] **Step 7: Create the migration**

Create `api/migrations/005_add_token_version.sql`:

```sql
-- JamWork v2 — Migration 005: users.token_version (session revocation, audit S3)
-- Idempotent + MySQL 8 compatible (no ADD COLUMN IF NOT EXISTS): guard on information_schema.
SET NAMES utf8mb4;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'token_version'
);

SET @ddl := IF(
  @col_exists = 0,
  'ALTER TABLE `users` ADD COLUMN `token_version` INT NOT NULL DEFAULT 0',
  'DO 0'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
```

- [ ] **Step 8: Register the migration in `install.php`**

In `api/install.php`, in the `$migrations` array (`:860-865`), add the new entry after the `004_notification_preferences.sql` line:

```php
    __DIR__ . '/migrations/004_notification_preferences.sql',
    __DIR__ . '/migrations/005_add_token_version.sql',
```

- [ ] **Step 9: Document the existing-install upgrade**

In `docs/production-update-runbook.md`, append this section at the end of the file:

```markdown
## Migration 005 — `users.token_version` (security hardening round 2, audit S3)

Adds session revocation. Fresh installs get the column automatically via `install.php`.
**Existing installs** must apply it once (the column is required by `AuthMiddleware`):

```sql
ALTER TABLE `users` ADD COLUMN `token_version` INT NOT NULL DEFAULT 0;
```

Existing logged-in sessions keep working after the change (tokens minted before the
upgrade carry no version claim and are treated as version 0, matching the default).
A user's sessions are invalidated the first time they change/reset their password.
```

- [ ] **Step 10: Verify parses + tests pass**

Run: `cd api && php -l src/Lib/Auth.php && php -l src/Middleware/AuthMiddleware.php && php -l src/Routes/AuthRoutes.php && php -l install.php && php tests/SecurityHardeningTest.php; echo "exit: $?"`
Expected: four `No syntax errors detected`, then `17 checks, 0 failure(s)`, `exit: 0`.

- [ ] **Step 11: Commit**

```bash
cd /Users/dorenberge/WorkInProgress/VIBE/JamWork_v2
git add api/migrations/005_add_token_version.sql api/install.php api/src/Lib/Auth.php api/src/Middleware/AuthMiddleware.php api/src/Routes/AuthRoutes.php api/tests/SecurityHardeningTest.php docs/production-update-runbook.md
git commit -m "feat(security): token_version session revocation — schema, JWT claim, middleware enforcement (S3)"
```

---

## Task 7: S3b — Bump `token_version` on password changes (+ E2E verification)

Incrementing the column invalidates that user's outstanding tokens (their `tv` claim no longer matches).

**Files:**
- Modify: `api/src/Routes/AuthRoutes.php` (three password-update statements)

- [ ] **Step 1: Bump on change-password**

In `api/src/Routes/AuthRoutes.php`, change the change-password UPDATE (currently `:519`):

```php
                $stmt = $db->prepare('UPDATE users SET password_hash = :hash WHERE id = :id');
```
→
```php
                $stmt = $db->prepare('UPDATE users SET password_hash = :hash, token_version = token_version + 1 WHERE id = :id');
```

- [ ] **Step 2: Bump on reset-password (must_reset flow)**

Change the reset-password UPDATE (currently `:383`):

```php
                $stmt = $db->prepare('UPDATE users SET password_hash = :hash, must_reset_password = 0 WHERE id = :id');
```
→
```php
                $stmt = $db->prepare('UPDATE users SET password_hash = :hash, must_reset_password = 0, token_version = token_version + 1 WHERE id = :id');
```

- [ ] **Step 3: Bump on set-new-password (forgot-password flow)**

Change the set-new-password UPDATE (currently `:163-165`):

```php
                $stmt = $db->prepare(
                    'UPDATE users SET password_hash = :hash, must_reset_password = 0 WHERE id = :id'
                );
```
→
```php
                $stmt = $db->prepare(
                    'UPDATE users SET password_hash = :hash, must_reset_password = 0, token_version = token_version + 1 WHERE id = :id'
                );
```

- [ ] **Step 4: Verify parses + the existing suite still passes**

Run: `cd api && php -l src/Routes/AuthRoutes.php && php tests/SecurityHardeningTest.php && php tests/NotificationServiceTest.php; echo "exit: $?"`
Expected: `No syntax errors detected`, `17 checks, 0 failure(s)` (hardening), `17 checks, 0 failure(s)` (notification), `exit: 0`.

- [ ] **Step 5: (App-dependent) E2E revocation check — the core S3 acceptance test**

With a running app + DB (and migration 005 applied):
1. Log in (cookie A). Confirm `GET /api/auth/me` returns your user with cookie A.
2. Change your password via `PUT /api/auth/change-password`.
3. Re-send `GET /api/auth/me` with the **old** cookie A → expect **401** (token now stale).
4. Log in again → new cookie works.
5. (Optional) Admin-delete a second user, then call `/api/auth/me` with that user's prior cookie → **401** (row gone).

If infra is unavailable, state the E2E check is deferred to manual human verification; the unit tests in Task 6 plus the SQL inspection (the three UPDATEs now increment `token_version`) cover the logic statically.

- [ ] **Step 6: Commit**

```bash
cd /Users/dorenberge/WorkInProgress/VIBE/JamWork_v2
git add api/src/Routes/AuthRoutes.php
git commit -m "feat(security): invalidate sessions on password change/reset via token_version bump (S3)"
```

---

## Task 8: S5 — Add CSP + HSTS headers

**Files:**
- Modify: root `.htaccess` (add HSTS + CSP to the existing header block)

- [ ] **Step 1: Add the headers**

In the root `.htaccess`, inside the existing `<IfModule mod_headers.c>` block (the four `Header set ...` lines at `:23-29`), add these two lines alongside them:

```apache
    Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
    Header always set Content-Security-Policy "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
```

(`'unsafe-inline'` is scoped to `style-src` only — React injects inline styles; scripts stay `'self'`. `preload` is intentionally omitted from HSTS.)

- [ ] **Step 2: (App-dependent) Verify the app loads with no CSP violations**

With the app served over the real Apache config: load the SPA, open DevTools → Console, and exercise the main views (task list, board/timeline, task drawer, settings, login). Confirm **no** `Content-Security-Policy` violation errors and that styles/images/fonts render. If a violation appears, tighten/relax the **specific** directive it names (e.g. add a needed `connect-src` origin) — do **not** broaden `default-src`. Confirm the response carries both new headers (`curl -sI https://<host>/ | grep -iE 'content-security-policy|strict-transport'`).

If a real Apache + TLS environment is unavailable, statically confirm the directives are well-formed and placed in the active `<IfModule mod_headers.c>` block, and defer the live load test to manual human verification. Note the app uses no inline `<script>`/`eval` (audit §10), so the script policy is expected to hold.

- [ ] **Step 3: Commit**

```bash
cd /Users/dorenberge/WorkInProgress/VIBE/JamWork_v2
git add .htaccess
git commit -m "fix(security): add Content-Security-Policy and HSTS headers (S5)"
```

---

## Verification (end-to-end)

After all tasks, on the branch:

1. **Unit suite green:** `cd api && php tests/SecurityHardeningTest.php && php tests/NotificationServiceTest.php` → both end `0 failure(s)`, exit 0.
2. **CI parity:** `cd api && composer validate && php tests/NotificationServiceTest.php && php tests/SecurityHardeningTest.php && composer audit >/dev/null && echo "API ok"`; `cd ../client && npx tsc -b && npm run build >/dev/null && npm audit --audit-level=high && echo "client ok"` → both print `ok`.
3. **S3 (app):** login → change password → old cookie rejected (401); admin-delete → that user's old token rejected. Pre-upgrade tokens (no `tv`) still valid until first bump.
4. **S4:** with `RATE_LIMIT_TRUSTED_PROXY` set, login throttling keys on the forwarded client IP; unset → unchanged.
5. **S5 (app):** response carries CSP + HSTS; app loads with no CSP console violations.
6. **S6:** missing-user and wrong-password logins are timing-indistinguishable (dummy verify runs).
7. **S7:** non-admin `/auth/users` omits `email`/`createdAt`; admin still gets them; member pickers work; `tsc` passes.
8. **S8/S9:** sub-10-char admin invite password rejected; invite-email workspace name HTML-escaped.
9. **No unintended changes:** `git diff main --stat` lists only the files in the File Structure table.

---

## Out of Scope (tracked separately)

- S10 (`set-new-password` bcrypt loop) — audit deems acceptable.
- A real migration runner / updater for existing installs.
- Redis/APCu rate-limit backend (multi-instance).
- §4 refactors (event bus, data-fetching, god files) and §6 test frameworks / 72-error lint backlog.
