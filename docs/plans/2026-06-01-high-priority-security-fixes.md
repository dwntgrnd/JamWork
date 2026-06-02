# High-Priority Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three High-priority findings from the 2026-06-01 code audit — the `firebase/php-jwt` CVE, the vulnerable npm dependencies, and the absence of CI.

**Architecture:** Three independent, sequential tasks. Tasks 1 and 2 patch vulnerable dependencies; Task 3 adds a GitHub Actions pipeline that gates future changes (and only passes once Tasks 1–2 have removed the flagged vulnerabilities). Each task is a self-contained, committable change.

**Tech Stack:** PHP 8.2 / Composer (api), Node / npm / Vite / TypeScript (client), GitHub Actions (repo: `github.com/dwntgrnd/JamWork`).

**Source:** Findings S1, S2, and the CI gap from `docs/audits/2026-06-01-code-audit.md`.

---

## Context

The audit confirmed three High-priority issues:

- **S1** — `firebase/php-jwt v6.11.1` is vulnerable to **CVE-2025-45769** ("weak encryption"). The advisory's affected range is **`<7.0.0`**, so the current `^6.0` constraint can never reach a fixed release — this requires a **major version bump to `^7.0`**, not a `composer update`. The library is used in exactly one file (`api/src/Lib/Auth.php`) via the stable `JWT::encode` / `JWT::decode` / `Key` API, and v7.0.5 requires `php ^8.0` (the project requires `>=8.2`), so the upgrade is low-risk. HS256 signing is unchanged between 6.x and 7.x, so **tokens issued before the upgrade stay valid** (logged-in users are not forced out).
- **S2** — `npm audit` reports 12 vulnerabilities (5 high, 7 moderate), all fixable **in-range** via `npm audit fix` (no `--force`). The only direct dependency involved is Vite (`^7.3.1`), whose fix is a patch release within range; the rest are transitive (postcss, qs, picomatch).
- **CI gap** — No `.github/workflows/`. There is no automated gate, so the lint/type/test/audit state can regress silently.

**Branching:** The repo's default branch is `main`. Create a feature branch before any change.

---

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `api/composer.json` | Modify | Bump `firebase/php-jwt` constraint `^6.0` → `^7.0` |
| `api/composer.lock` | Regenerate | Lock the patched JWT release |
| `client/package.json` | Modify (auto) | Bump Vite to the patched in-range version |
| `client/package-lock.json` | Regenerate | Lock patched client deps |
| `.github/workflows/ci.yml` | Create | CI pipeline: api job + client job |

No application source changes are required (the JWT API usage in `Auth.php` is unchanged across the upgrade).

---

## Task 0: Get on the working branch

The audit report and this plan were already committed on branch `fix/high-priority-audit-items`, so it exists. Check it out and confirm a clean tree before starting.

- [ ] **Step 1: Check out the branch**

```bash
cd /Users/dorenberge/WorkInProgress/VIBE/JamWork_v2
git checkout fix/high-priority-audit-items
git status   # expect: clean working tree
```

(Fresh clone? Run `git fetch origin && git checkout fix/high-priority-audit-items` first.)

---

## Task 1: Upgrade `firebase/php-jwt` to 7.x (S1)

**Files:**
- Modify: `api/composer.json` (constraint `^6.0` → `^7.0`)
- Regenerate: `api/composer.lock`
- Verify (no change expected): `api/src/Lib/Auth.php:5-6,26,33`

- [ ] **Step 1: Confirm the pre-upgrade test baseline passes**

Run:
```bash
cd api && php tests/NotificationServiceTest.php; echo "exit: $?"
```
Expected: `17 checks, 0 failure(s)` and `exit: 0`. (This is the only runnable test; it does not touch JWT but is our regression anchor.)

- [ ] **Step 2: Upgrade to the fixed major version**

Run:
```bash
cd api && composer require firebase/php-jwt:^7.0
```
Expected: Composer updates `firebase/php-jwt` to `v7.0.5` (or latest 7.x) and rewrites `composer.json` + `composer.lock`. No other production package should change.

- [ ] **Step 3: Verify the CVE is cleared**

Run:
```bash
cd api && composer audit 2>/dev/null | grep -v -i 'deprecat' | grep -iE 'jwt|CVE-2025-45769|No security' | head
```
Expected: **No** `firebase/php-jwt` / `CVE-2025-45769` row. (Other advisories, if any, are out of scope for this task.)

- [ ] **Step 4: Confirm our JWT API usage is still compatible**

The only usage is in `api/src/Lib/Auth.php`:
```php
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
// ...
return JWT::encode($payload, $secret, 'HS256');               // line 26
$decoded = JWT::decode($token, new Key($secret, 'HS256'));    // line 33
```
These signatures are unchanged in 7.x. Verify the file still parses and autoloads:
```bash
cd api && php -r "require 'vendor/autoload.php'; new Firebase\JWT\Key('x','HS256'); echo \"jwt ok\n\";"
```
Expected: `jwt ok` (no fatal error).

- [ ] **Step 5: Re-run the test suite**

Run:
```bash
cd api && php tests/NotificationServiceTest.php; echo "exit: $?"
```
Expected: `17 checks, 0 failure(s)`, `exit: 0`.

- [ ] **Step 6: Manual auth smoke test (token continuity)**

With a local API + DB running (see `docs/LOCAL-DEV.md`):
1. Before nothing else — if you already had a session cookie from before the upgrade, hit `GET /api/auth/me` and confirm it still returns your user (proves pre-upgrade HS256 tokens validate under 7.x).
2. `POST /api/auth/login` with valid credentials → expect `200` + `Set-Cookie: token=...`.
3. `GET /api/auth/me` with that cookie → expect `200` + your user JSON.
4. `POST /api/auth/logout` → expect `200`.

Expected: all four succeed. If `/auth/me` rejects a valid token, stop — investigate before committing.

- [ ] **Step 7: Commit**

```bash
git add api/composer.json api/composer.lock
git commit -m "fix(security): upgrade firebase/php-jwt to ^7.0 (CVE-2025-45769)"
```

---

## Task 2: Patch vulnerable npm dependencies (S2)

**Files:**
- Modify (auto): `client/package.json`
- Regenerate: `client/package-lock.json`

- [ ] **Step 1: Record the pre-fix vulnerability count**

Run:
```bash
cd client && npm audit 2>&1 | tail -3
```
Expected: `12 vulnerabilities (7 moderate, 5 high)`.

- [ ] **Step 2: Apply in-range fixes (no `--force`)**

Run:
```bash
cd client && npm audit fix
```
Expected: Vite bumps to the patched `7.3.x`; postcss/qs/picomatch resolve. `--force` is intentionally **not** used — it would pull breaking majors (Vite 8, etc.), which are out of scope here (tracked separately as a Low/Med item).

- [ ] **Step 3: Confirm no High-severity vulnerabilities remain**

Run:
```bash
cd client && npm audit --audit-level=high; echo "exit: $?"
```
Expected: `exit: 0` (zero high-severity findings). If a residual *moderate* transitive advisory remains that has no in-range fix, that is acceptable for this task — record it in the commit body. Do **not** run `npm audit fix --force` to clear it.

- [ ] **Step 4: Verify the app still type-checks and builds**

Run:
```bash
cd client && npx tsc -b && npm run build
```
Expected: `tsc` exits 0; `vite build` completes and writes `dist/`. (The repo ships a built `dist/`; you may discard build artifact changes — `git checkout -- dist` — unless a bundle refresh is intended.)

- [ ] **Step 5: Commit**

```bash
git add client/package.json client/package-lock.json
git commit -m "fix(security): patch npm dependency vulnerabilities (npm audit fix)"
```

---

## Task 3: Add GitHub Actions CI pipeline

**Files:**
- Create: `.github/workflows/ci.yml`

**Design notes:**
- Runs on PRs to `main` and on pushes to `main`.
- **api job:** install deps, run the standalone notification test (it exits non-zero on failure — CI-safe), and gate on `composer audit`. The audit gate only passes because Task 1 cleared the JWT CVE.
- **client job:** `npm ci`, type-check, build, and gate on `npm audit --audit-level=high` (passes after Task 2).
- **Lint is included but NON-blocking** (`continue-on-error: true`) because the codebase currently has 72 ESLint errors (audit §6). This surfaces lint in CI without blocking merges today. **Flip `continue-on-error` to `false` (or remove it) once the lint backlog is fixed** — that cleanup is the separate Low/Med item in the audit, not part of this plan.

- [ ] **Step 1: Create the workflow file**

Create `.github/workflows/ci.yml`:
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  api:
    name: API (PHP)
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: api
    steps:
      - uses: actions/checkout@v4

      - name: Set up PHP
        uses: shivammathur/setup-php@v2
        with:
          php-version: '8.2'
          tools: composer

      - name: Validate composer files
        run: composer validate --strict

      - name: Install dependencies
        run: composer install --prefer-dist --no-progress

      - name: Run notification decision tests
        run: php tests/NotificationServiceTest.php

      - name: Security audit (fails on known advisories)
        run: composer audit

  client:
    name: Client (TypeScript)
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: client
    steps:
      - uses: actions/checkout@v4

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: npm
          cache-dependency-path: client/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Lint (non-blocking until backlog cleared — see docs/audits/2026-06-01-code-audit.md §6)
        run: npm run lint
        continue-on-error: true

      - name: Type-check
        run: npx tsc -b

      - name: Build
        run: npm run build

      - name: Security audit (high severity)
        run: npm audit --audit-level=high
```

- [ ] **Step 2: Lint the workflow locally before pushing**

Run each gated command locally to confirm CI will be green (with Tasks 1–2 already committed):
```bash
cd api && composer validate --strict && php tests/NotificationServiceTest.php && composer audit >/dev/null && echo "API job ✓"
cd ../client && npx tsc -b && npm run build >/dev/null && npm audit --audit-level=high && echo "client job ✓"
```
Expected: both lines print `✓`. If `composer audit` or `npm audit` fail here, Task 1 or Task 2 is incomplete — fix before proceeding.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions pipeline (php tests + audits, type-check, build)"
```

- [ ] **Step 4: Push and verify the run is green**

```bash
git push -u origin fix/high-priority-audit-items
```
Then open the PR (or the Actions tab) and confirm both `API (PHP)` and `Client (TypeScript)` jobs pass. The Lint step may show a ⚠️ (non-blocking) — that is expected until the lint backlog is fixed.

---

## Verification (end-to-end)

After all tasks, on the branch:

1. **S1 cleared:** `cd api && composer audit 2>/dev/null | grep -c CVE-2025-45769` → `0`.
2. **S2 cleared:** `cd client && npm audit --audit-level=high; echo $?` → `0`.
3. **Auth works:** login → `/auth/me` → logout all succeed (Task 1, Step 6).
4. **CI green:** GitHub Actions shows both jobs passing on the PR; Lint is the only (non-blocking) warning.
5. **No unintended source changes:** `git diff main --stat` lists only `composer.json/lock`, `package.json/lock`, and `.github/workflows/ci.yml` (plus optionally a rebuilt `client/dist/` if you chose to keep it).

---

## Out of Scope (tracked separately in the audit)

- Fixing the 72 ESLint errors and flipping the Lint gate to blocking (audit §6, Low–Med).
- Major dependency upgrades requiring `--force` / code changes — Vite 8, ESLint 10, TypeScript 6, React Router (audit §7).
- Standing up Vitest + PHPUnit for real coverage (audit §6, Medium) — this plan only wires the *existing* test into CI.
- Medium/Low security items S3–S10 (JWT revocation, proxy-aware rate limiting, CSP/HSTS, etc.).
