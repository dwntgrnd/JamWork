# Test Foundation (Pass 1) — Design Spec

**Date:** 2026-06-02
**Status:** Approved design — ready for implementation planning
**Source:** `docs/audits/2026-06-01-code-audit.md` §6 ("Tests & CI — the biggest gap"), §4 (refactoring candidates this foundation protects).

---

## 1. Goal & Scope

Establish real test frameworks on both sides of the app, convert the existing hand-rolled
harnesses, write the **client characterization tests that make the upcoming refactors
(4.2 event bus → 4.3 data-fetching → 4.1 god files) safe**, and flip CI to blocking gates.

This is **Pass 1** of a two-pass effort. It deliberately stops short of any database-backed
testing — that complexity is isolated in Pass 2 (§6) so this pass stays mechanical and
low-risk, and never blocks the client refactors.

**In scope (Pass 1):**
- PHPUnit setup + migration of the two existing harnesses (pure logic only).
- Vitest + React Testing Library setup.
- Client tests for the state-sync seam and one representative mutation component.
- Blocking CI gates for both suites.

**Out of scope (→ Pass 2, §6):**
- Any DB-touching API tests and the test-database strategy they require.
- Characterization tests for the god files themselves (written just-in-time during 4.1).
- Clearing the 72-error ESLint backlog / flipping the lint gate to blocking.

### Why this is the right next step

- The biggest breakage risk in the remaining backlog is the client refactors (4.1/4.2/4.3),
  especially 4.2 — replacing an implicit, untyped `window`-event bus whose failure mode is
  *silent* (a consumer stops updating; no compile/type/API error catches it).
- A regression net only helps if it covers the code being restructured. These refactors
  change the **client** and leave the API contract byte-identical, so the **client** tests
  are load-bearing; API tests are valuable but on a separate track (Pass 2).
- The foundation work touches **zero production code** — it can only reveal whether something
  is already broken, not introduce a break. It also retroactively validates the S3–S9
  security work (auth / `token_version` tests passing = evidence that work is solid).

---

## 2. Architecture & Guiding Principle

The pass follows **characterization testing**: pin current behavior *before* restructuring.

- Tests assert **observable behavior**, not internals — so they survive the refactor that
  changes the internals (that is the entire point of a characterization test).
- We **do not** characterize the 1,000+ LOC god files in this pass. Each gets its
  characterization tests written *just-in-time*, immediately before it is decomposed (in the
  4.1 pass). Pass 1 characterizes the **seam** — the event-bus state sync — that 4.2/4.3
  act on.

### The seam, mapped (evidence)

`grep` of `client/src` for the three window events:

- **`projects-updated`** — 11 dispatch sites (`board-view`, `task-drawer` ×4,
  `project-settings-dialog`, `task-list` ×2, `bulk-action-bar` ×3). Listeners:
  `components/sidebar.tsx:71`, `hooks/use-project.ts:35`.
- **`sprints-updated`** — 7 dispatch sites (all in `pages/sprints.tsx`). **No listener found**
  — a likely dead or cross-page-only signal. Characterization will pin/surface this before
  4.2 walks into it.
- **`workspace-name-updated`** — 1 dispatch site (`pages/admin.tsx`). Listener:
  `pages/protected-layout.tsx:55`.

`hooks/use-project.ts` is the cleanest embodiment of the seam: it fetches `/projects` and
re-fetches on `projects-updated`. It is cheap to test and pins exactly the behavior 4.2 must
preserve.

---

## 3. API Side — PHPUnit

**Install:**
- Add `phpunit/phpunit: ^11` to a new `require-dev` block (PHPUnit 11 supports PHP 8.2).
- Add a `test` script to `composer.json` and a `Tests\` `autoload-dev` PSR-4 mapping.
- Add `api/phpunit.xml`.

**Migrate** the two harnesses into PHPUnit test classes — each `check(name, cond)` becomes an
assertion. All functions they cover are **pure/static**, so **no test DB is needed**:
- `NotificationService::resolveEvents()`, `::passesSendRule()`
- `Auth::tokenVersionMatches()`, `Auth::DUMMY_PASSWORD_HASH`, `generateToken`/`decodeToken` round-trip
- `RateLimitMiddleware::resolveClientIp()`
- `Validator::validate()`
- `Mailer::renderInviteBody()`

Delete the hand-rolled `NotificationServiceTest.php` / `SecurityHardeningTest.php` **after**
confirming the migrated suite passes the same assertions.

> ⚠️ **Critical constraint — committed vendor.** `api/vendor/` is tracked and shipped to
> production (the deploy target cannot run Composer). PHPUnit therefore goes in `require-dev`
> **only**, and the committed `api/vendor/` must be regenerated with
> `composer install --no-dev` so **PHPUnit is never shipped to production**. CI and local dev
> install *with* dev deps (a plain `composer install`) to get PHPUnit. This is both the
> best practice and what keeps the production tree lean.

---

## 4. Client Side — Vitest + React Testing Library

**Install (devDependencies):** `vitest`, `@testing-library/react`, `@testing-library/jest-dom`,
`@testing-library/user-event`, `jsdom`.

**Config:**
- `jsdom` test environment.
- A setup file registering `jest-dom` matchers.
- `@/` path alias wired for Vitest (must match the Vite/tsconfig alias).
- A `test` script in `package.json`.
- Ensure `*.test.ts(x)` and the setup file are **excluded from the production `tsc -b` /
  `vite build`**, so tests never reach `dist/`.

**Tests in this pass:**

1. `lib/api.test.ts` — mock global `fetch`; assert `apiGet`/`apiFetch` error-wrapping
   (`ApiError`, `.status`, JSON-error-body vs status-text fallback). Proves the runner and
   establishes the mocking pattern against *real* logic.
2. `hooks/use-project.test.ts` — **the load-bearing test.** Mock `@/lib/api`; render
   `useProject` via `renderHook`; assert it fetches `/projects` and resolves the matching
   project; `window.dispatchEvent(new Event('projects-updated'))`; assert it refetches. This
   pins the exact behavior 4.2 must preserve.
3. `components/bulk-action-bar.test.tsx` — a small mutation component (**not** the 1,000+ LOC
   files) — assert that a successful bulk mutation calls the API and dispatches
   `projects-updated`. Establishes the component-level RTL pattern at low brittleness and
   directly exercises a task-mutation path (the audit's named "test task mutations" goal).
   (If `bulk-action-bar`'s selection coupling proves too brittle to mount, the planner may
   substitute `project-settings-dialog`, which dispatches the same event on a simpler edit.)

---

## 5. CI Wiring

In `.github/workflows/ci.yml`:
- **API job:** replace the two `php tests/*.php` steps with a single `vendor/bin/phpunit` step
  (blocking).
- **Client job:** add a `npm run test -- --run` (Vitest, blocking) step.
- **Lint gate stays non-blocking** — the 72-error backlog is a separate item, not bundled here.
- **No coverage-% thresholds** — pass/fail only. Coverage gates on a young suite create
  busywork without protecting anything.

---

## 6. Out of Scope — Pass 2 (planned, separate)

- A test-database strategy matching **MySQL 8** (not sqlite — engine-divergence is a
  best-practices trap), with fixtures + per-test transaction rollback.
- API integration tests: task CRUD, route handlers, and `AuthMiddleware` end-to-end
  `token_version` enforcement (the audit's named "biggest gap").
- God-file characterization tests (written just-in-time during the 4.1 decomposition).
- ESLint-backlog cleanup and flipping the lint gate to blocking.

---

## 7. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| PHPUnit leaking into the shipped `api/vendor/` | `require-dev` + regenerate committed vendor with `--no-dev`; explicit verification step |
| Test files reaching `dist/` | Exclude `*.test.*` + setup from production `tsc`/vite build; verify `dist` diff is empty |
| `@/` alias not resolving under Vitest | Configure the alias in Vitest config; the `api`/`use-project` tests catch it immediately |
| Harness migration silently drops a check | Migrate assertion-for-assertion; confirm equal passing count before deleting the originals |
| Brittle component tests | Keep Pass 1 to the seam + one small component; defer god-file tests to just-in-time 4.1 |

---

## 8. Success Criteria (verification)

1. `cd api && composer install && vendor/bin/phpunit` → all migrated tests green, covering the
   same assertions as the old harnesses.
2. Committed `api/vendor/` contains **no** PHPUnit. Because PHPUnit is dev-only, the
   production (`--no-dev`) tree should be **unchanged** by this work — the check is that
   PHPUnit did not sneak in (`ls api/vendor/phpunit` → absent).
3. `cd client && npm run test -- --run` → green, including the `useProject` characterization
   test.
4. `cd client && npm run build` still clean; `git diff` shows **no** test files in `dist/`.
5. CI: both jobs blocking-green on a PR; lint remains the only non-blocking step.
6. `git diff main --stat` touches only test/config/CI files, `composer.*`, `package*.json`,
   and the regenerated `vendor/`.

---

## 9. File-Change Summary

| File | Change |
|------|--------|
| `api/composer.json` | Add `require-dev` (phpunit ^11), `test` script, `Tests\` autoload-dev |
| `api/composer.lock` | Regenerated to record the dev requirement |
| `api/phpunit.xml` | Create |
| `api/tests/` | Migrate 2 harnesses → PHPUnit classes; delete the hand-rolled originals |
| `api/vendor/` | **Committed `--no-dev` tree unchanged** (phpunit is dev-only); verify phpunit absent |
| `client/package.json` | Add Vitest + RTL devDeps, `test` script |
| `client/vitest.config.ts` + setup file | Create |
| `client/src/lib/api.test.ts` | Create |
| `client/src/hooks/use-project.test.ts` | Create (characterization — the 4.2 seam) |
| `client/src/components/bulk-action-bar.test.tsx` | Create (one representative task mutation) |
| `client/tsconfig*.json` | Exclude test files from the production build |
| `.github/workflows/ci.yml` | phpunit step (api job); vitest step (client job) |
