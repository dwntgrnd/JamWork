# Test Foundation (Pass 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up PHPUnit (api) and Vitest + React Testing Library (client), migrate the two hand-rolled PHP harnesses to PHPUnit, add the client characterization tests that protect the upcoming refactors, and make both suites blocking CI gates.

**Architecture:** Pure-logic only — no test database (deferred to Pass 2). The client tests are *characterization tests*: they pin the current behavior of the `window`-event state-sync seam (`useProject`) and one representative task-mutation component (`bulk-action-bar`) so the 4.2/4.3/4.1 refactors can be verified against them. PHPUnit goes in `require-dev` and must **never** be committed into the production `api/vendor/` tree (which is shipped to hosting that can't run Composer).

**Tech Stack:** PHP 8.2 / Composer / PHPUnit 11 (api); Vite 7 / React 19 / TypeScript 5.9 / Vitest + React Testing Library + jsdom (client); GitHub Actions.

**Source:** `docs/specs/2026-06-02-test-foundation-design.md` (approved design).

---

## Context

Key facts the tasks rely on (verified in the codebase):

- **API autoload:** `composer.json` has PSR-4 `JamWork\` → `src/`, **no `require-dev`, no scripts**. `api/vendor/` is **committed and shipped to production**.
- **Existing harnesses:** `api/tests/NotificationServiceTest.php` (17 `check()` assertions) and `api/tests/SecurityHardeningTest.php` (17 `check()` assertions) are dependency-free scripts run via `php tests/X.php`. They exercise only **pure/static** functions — no DB.
- **CI today** (`.github/workflows/ci.yml`): the `api` job runs `php tests/NotificationServiceTest.php` then `php tests/SecurityHardeningTest.php`; the `client` job runs lint (non-blocking), `tsc -b`, `npm run build`, `npm audit`. There is **no** client test step.
- **Client config:** `vite.config.ts` defines `@` → `./src` alias and the React + Tailwind plugins. `tsconfig.app.json` has `"include": ["src"]` and `paths { "@/*": ["./src/*"] }`. There is **no** test runner.
- **Client seam:** `hooks/use-project.ts` fetches `/projects` via `apiGet` and re-fetches on the `projects-updated` window event. `components/bulk-action-bar.tsx` exports `BulkActionBar`; its "Mark as Done" button calls `apiPut('/tasks/bulk-update', { taskIds, fields: { status: 'done' } })` then `window.dispatchEvent(new Event('projects-updated'))` then `onActionComplete()`.
- **`api.ts`:** `apiGet/apiPost/apiPut/apiDelete` wrap `fetch`; on `!response.ok` they throw an (unexported) `ApiError` with `.status`, `.message`, `.name === 'ApiError'`, where the message comes from the JSON `error`/`message` field, falling back to `statusText`.

**Branch:** Work on `test/foundation-pass-1` (already created off `main`; the design spec is committed there). An untracked root `CLAUDE.md` is unrelated — **never stage it**.

**Note on TDD framing:** These are *migration* and *characterization* tests — they assert the behavior of code that already exists, so they pass on first green run rather than starting red. That is correct and expected for this pass; the "verify it fails" red step is replaced by a "verify it runs and passes / matches the old count" check where noted.

---

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `api/composer.json` | Modify | Add `require-dev` (phpunit ^11), `autoload-dev` (`Tests\`), `test` script |
| `api/composer.lock` | Regenerate | Record the dev requirement |
| `api/phpunit.xml` | Create | PHPUnit config (bootstrap, test dir, cache dir) |
| `api/.gitignore` | Modify/Create | Ignore `.phpunit.cache/` |
| `api/tests/NotificationServiceTest.php` | Rewrite | PHPUnit `TestCase` (17 assertions, same logic) |
| `api/tests/SecurityHardeningTest.php` | Rewrite | PHPUnit `TestCase` (17 assertions, same logic) |
| `.github/workflows/ci.yml` | Modify | api job → `vendor/bin/phpunit`; client job → vitest step |
| `client/package.json` | Modify | Add Vitest + RTL devDeps, `test` script |
| `client/vitest.config.ts` | Create | Merge vite config + jsdom test env + setup |
| `client/src/test/setup.ts` | Create | Register jest-dom matchers |
| `client/tsconfig.app.json` | Modify | Exclude test files + setup from the production build |
| `client/src/lib/api.test.ts` | Create | Unit test of the fetch wrapper / error mapping |
| `client/src/hooks/use-project.test.ts` | Create | Characterization test of the `projects-updated` seam |
| `client/src/components/bulk-action-bar.test.tsx` | Create | Representative task-mutation component test |

**`api/vendor/` is intentionally NOT in this table.** PHPUnit is dev-only; the committed production tree must stay unchanged. See Task 4.

---

## Task 0: Confirm branch and baseline

- [ ] **Step 1: Confirm branch, clean tree, and that both harnesses pass today**

```bash
cd /Users/dorenberge/WorkInProgress/VIBE/JamWork_v2
git branch --show-current        # expect: test/foundation-pass-1
git status --short               # expect: only "?? CLAUDE.md"
cd api && php tests/NotificationServiceTest.php; echo "exit: $?"
php tests/SecurityHardeningTest.php; echo "exit: $?"
```
Expected: branch matches; tree clean (only `CLAUDE.md` untracked); each harness prints `17 checks, 0 failure(s)` and `exit: 0`. These two `17`s are the parity baseline for Tasks 2–3.

---

## Task 1: Install PHPUnit + config (api)

**Files:**
- Modify: `api/composer.json`
- Regenerate: `api/composer.lock`
- Create: `api/phpunit.xml`
- Modify/Create: `api/.gitignore`

- [ ] **Step 1: Add PHPUnit as a dev dependency**

```bash
cd /Users/dorenberge/WorkInProgress/VIBE/JamWork_v2/api
composer require --dev "phpunit/phpunit:^11.0"
```
Expected: Composer adds a `require-dev` block, updates `composer.lock`, and installs PHPUnit 11.x into `vendor/` (PHPUnit 11 supports PHP ≥ 8.2).

- [ ] **Step 2: Add the `autoload-dev` mapping and `test` script**

Edit `api/composer.json` so it reads exactly (the `require-dev` version may differ in patch — leave whatever `composer require` wrote):

```json
{
  "name": "jamwork/api",
  "description": "JamWork v2 PHP REST API",
  "require": {
    "php": ">=8.2",
    "slim/slim": "^4.0",
    "slim/psr7": "^1.6",
    "firebase/php-jwt": "^7.0",
    "phpmailer/phpmailer": "^6.0",
    "vlucas/phpdotenv": "^5.0",
    "ramsey/uuid": "^4.0"
  },
  "require-dev": {
    "phpunit/phpunit": "^11.0"
  },
  "autoload": {
    "psr-4": {
      "JamWork\\": "src/"
    }
  },
  "autoload-dev": {
    "psr-4": {
      "Tests\\": "tests/"
    }
  },
  "scripts": {
    "test": "phpunit"
  }
}
```

Then regenerate the autoloader:
```bash
cd /Users/dorenberge/WorkInProgress/VIBE/JamWork_v2/api && composer dump-autoload
```

- [ ] **Step 3: Create `api/phpunit.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<phpunit xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:noNamespaceSchemaLocation="vendor/phpunit/phpunit/phpunit.xsd"
         bootstrap="vendor/autoload.php"
         colors="true"
         cacheDirectory=".phpunit.cache"
         failOnWarning="true"
         failOnRisky="true">
    <testsuites>
        <testsuite name="JamWork">
            <directory>tests</directory>
        </testsuite>
    </testsuites>
</phpunit>
```

- [ ] **Step 4: Ignore the PHPUnit cache**

Append to `api/.gitignore` (create the file if it does not exist):
```
.phpunit.cache/
```

- [ ] **Step 5: Verify PHPUnit is installed**

```bash
cd /Users/dorenberge/WorkInProgress/VIBE/JamWork_v2/api && vendor/bin/phpunit --version
```
Expected: prints `PHPUnit 11.x`.

> Do **not** run the full `vendor/bin/phpunit` yet. The two existing `*Test.php` files are still plain scripts: each ends in `exit()` and both declare a global `check()` function, so a full run would terminate early or fatal on `Cannot redeclare check()`. Run the suite only after both files are converted to classes (Task 3 Step 3). Tasks 2–3 run PHPUnit against one converted file at a time, which is safe.

- [ ] **Step 6: Commit (composer.json + lock + config only — NOT vendor)**

```bash
cd /Users/dorenberge/WorkInProgress/VIBE/JamWork_v2
git add api/composer.json api/composer.lock api/phpunit.xml api/.gitignore
git commit -m "test(api): install PHPUnit 11 as a dev dependency + config"
```
Do **not** `git add api/vendor/`. Vendor handling is finalized in Task 4.

---

## Task 2: Migrate NotificationServiceTest to PHPUnit

**Files:**
- Rewrite: `api/tests/NotificationServiceTest.php`

- [ ] **Step 1: Replace the harness with a PHPUnit test class**

Overwrite `api/tests/NotificationServiceTest.php` with (every assertion mirrors a `check()` from the original, in the same order):

```php
<?php

namespace Tests;

use PHPUnit\Framework\TestCase;
use JamWork\Lib\NotificationService as NS;

/**
 * Pure-logic tests for the task-notification decision functions (PRD §5/§7/§8/§10).
 * No DB, no network — exercises NS::resolveEvents() and NS::passesSendRule().
 */
final class NotificationServiceTest extends TestCase
{
    /** A user row with all toggles ON and a valid email. */
    private function userRow(string $id, array $overrides = []): array
    {
        return array_merge([
            'id' => $id,
            'email' => "{$id}@example.com",
            'display_name' => $id,
            'notify_assigned' => 1,
            'notify_unassigned' => 1,
            'notify_changed' => 1,
        ], $overrides);
    }

    public function testResolveEventsSingleSaveDedupe(): void
    {
        // §10.1/§10.9 — actor is never notified (self-assignment on create).
        $this->assertSame([], NS::resolveEvents('actor', [], ['actor'], false, true));

        // Create: each new assignee (excluding actor) → Assigned (§10.8).
        $this->assertSame(
            ['a' => NS::EVENT_ASSIGNED, 'b' => NS::EVENT_ASSIGNED],
            NS::resolveEvents('actor', [], ['a', 'b', 'actor'], false, true)
        );

        // §10.3 — reassignment in one save: A removed → Unassigned, B added → Assigned.
        $this->assertSame(
            ['b' => NS::EVENT_ASSIGNED, 'a' => NS::EVENT_UNASSIGNED],
            NS::resolveEvents('actor', ['a'], ['b'], false, false)
        );

        // §10.2 — no field change, no assignee change → no events.
        $this->assertSame([], NS::resolveEvents('actor', ['actor', 'a'], ['actor', 'a'], false, false));

        // §7 — still-assigned + cosmetic change → no Changed.
        $this->assertSame([], NS::resolveEvents('actor', ['a', 'b'], ['a', 'b'], false, false));

        // §7 — still-assigned + significant change → Changed for both.
        $this->assertSame(
            ['a' => NS::EVENT_CHANGED, 'b' => NS::EVENT_CHANGED],
            NS::resolveEvents('actor', ['a', 'b'], ['a', 'b'], true, false)
        );

        // §10.9 — editor who is also an assignee is not notified of their own change.
        $this->assertSame(
            ['a' => NS::EVENT_CHANGED],
            NS::resolveEvents('actor', ['actor', 'a'], ['actor', 'a'], true, false)
        );

        // Dedupe priority: a newly-added user during a significant-change save gets Assigned, not Changed.
        $this->assertSame(
            ['b' => NS::EVENT_ASSIGNED, 'a' => NS::EVENT_CHANGED],
            NS::resolveEvents('actor', ['a'], ['a', 'b'], true, false)
        );
    }

    public function testPassesSendRuleAndComposition(): void
    {
        // All layers ON → send.
        $this->assertTrue(NS::passesSendRule(true, true, $this->userRow('a'), NS::EVENT_ASSIGNED));

        // §5.1 — mailer not configured suppresses.
        $this->assertFalse(NS::passesSendRule(false, true, $this->userRow('a'), NS::EVENT_ASSIGNED));

        // §5.2 / §10.4 — task flag OFF suppresses (including Unassigned).
        $this->assertFalse(NS::passesSendRule(true, false, $this->userRow('a'), NS::EVENT_UNASSIGNED));

        // §5.3 — each per-user toggle independently suppresses its own event.
        $this->assertFalse(NS::passesSendRule(true, true, $this->userRow('a', ['notify_assigned' => 0]), NS::EVENT_ASSIGNED));
        $this->assertFalse(NS::passesSendRule(true, true, $this->userRow('a', ['notify_unassigned' => 0]), NS::EVENT_UNASSIGNED));
        $this->assertFalse(NS::passesSendRule(true, true, $this->userRow('a', ['notify_changed' => 0]), NS::EVENT_CHANGED));

        // A toggle being off only suppresses its own event, not the others.
        $this->assertTrue(NS::passesSendRule(true, true, $this->userRow('a', ['notify_changed' => 0]), NS::EVENT_ASSIGNED));

        // §5.5 / §10.7 — missing/invalid email suppresses + never throws.
        $this->assertFalse(NS::passesSendRule(true, true, $this->userRow('a', ['email' => '']), NS::EVENT_ASSIGNED));
        $this->assertFalse(NS::passesSendRule(true, true, $this->userRow('a', ['email' => 'not-an-email']), NS::EVENT_ASSIGNED));
    }
}
```

- [ ] **Step 2: Run and verify parity**

```bash
cd /Users/dorenberge/WorkInProgress/VIBE/JamWork_v2/api && vendor/bin/phpunit --testdox tests/NotificationServiceTest.php
```
Expected: `OK (2 tests, 17 assertions)` — the **17 assertions** match the original 17 `check()` calls.

- [ ] **Step 3: Commit**

```bash
cd /Users/dorenberge/WorkInProgress/VIBE/JamWork_v2
git add api/tests/NotificationServiceTest.php
git commit -m "test(api): migrate NotificationService harness to PHPUnit"
```

---

## Task 3: Migrate SecurityHardeningTest to PHPUnit

**Files:**
- Rewrite: `api/tests/SecurityHardeningTest.php`

- [ ] **Step 1: Replace the harness with a PHPUnit test class**

Overwrite `api/tests/SecurityHardeningTest.php` with (every assertion mirrors a `check()` from the original):

```php
<?php

namespace Tests;

use PHPUnit\Framework\TestCase;
use JamWork\Lib\Auth;
use JamWork\Lib\Mailer;
use JamWork\Lib\Validator;
use JamWork\Middleware\RateLimitMiddleware;

/**
 * Pure-logic tests for Security Hardening Round 2 (audit S3–S9).
 * No DB, no network — exercises the extracted decision/util functions.
 */
final class SecurityHardeningTest extends TestCase
{
    protected function setUp(): void
    {
        // Token round-trip tests need a secret present.
        $_ENV['JWT_SECRET'] = 'test-secret-key-for-security-hardening-tests';
    }

    public function testInviteEmailEscaping(): void // S9
    {
        $tpl = '<h1>{{WORKSPACE_NAME}}</h1><p>{{EMAIL}}</p>';
        $out = Mailer::renderInviteBody($tpl, '<script>x</script>', 'Dana', 'd@example.com', 'pw1234567890', 'https://app/login');

        $this->assertStringContainsString('&lt;script&gt;', $out);
        $this->assertStringNotContainsString('<script>', $out);
        $this->assertStringContainsString('d@example.com', $out);
    }

    public function testAdminInvitePasswordPolicy(): void // S8
    {
        $rules = ['password' => 'optional|min:10'];

        $this->assertNotSame([], Validator::validate(['password' => 'short'], $rules));
        $this->assertSame([], Validator::validate(['password' => 'longenough10'], $rules));
        $this->assertSame([], Validator::validate([], $rules));
    }

    public function testConstantTimeLoginDummyHash(): void // S6
    {
        $info = password_get_info(Auth::DUMMY_PASSWORD_HASH);
        $this->assertSame('bcrypt', $info['algoName']);
        $this->assertFalse(Auth::verifyPassword('any-attempt', Auth::DUMMY_PASSWORD_HASH));
    }

    public function testClientIpResolution(): void // S4
    {
        $server = ['REMOTE_ADDR' => '10.0.0.5'];

        $this->assertSame('10.0.0.5', RateLimitMiddleware::resolveClientIp($server, '1.2.3.4', false));
        $this->assertSame('5.6.7.8', RateLimitMiddleware::resolveClientIp($server, '1.2.3.4, 5.6.7.8', true));
        $this->assertSame('203.0.113.9', RateLimitMiddleware::resolveClientIp($server, '203.0.113.9', true));
        $this->assertSame('10.0.0.5', RateLimitMiddleware::resolveClientIp($server, '', true));
        $this->assertSame('10.0.0.5', RateLimitMiddleware::resolveClientIp($server, null, true));
    }

    public function testTokenVersionMatchingAndClaim(): void // S3
    {
        $this->assertTrue(Auth::tokenVersionMatches(3, 3));
        $this->assertFalse(Auth::tokenVersionMatches(2, 3));
        $this->assertTrue(Auth::tokenVersionMatches(null, 0));
        $this->assertFalse(Auth::tokenVersionMatches(null, 1));

        $token = Auth::generateToken('user-1', 'member', 4);
        $decoded = Auth::decodeToken($token);
        $this->assertIsArray($decoded);
        $this->assertSame(4, (int) ($decoded['tv'] ?? -1));
    }
}
```

- [ ] **Step 2: Run and verify parity**

```bash
cd /Users/dorenberge/WorkInProgress/VIBE/JamWork_v2/api && vendor/bin/phpunit --testdox tests/SecurityHardeningTest.php
```
Expected: `OK (5 tests, 19 assertions)`. (The original had 17 `check()` calls. Two compound `&&` checks are faithfully split into two assertions each — the S9 "escaped + not-unescaped" check, and the S3 round-trip `is_array(...) && tv === 4` check — so 17 + 2 = 19. No behavior is dropped.)

- [ ] **Step 3: Run the whole suite**

```bash
cd /Users/dorenberge/WorkInProgress/VIBE/JamWork_v2/api && vendor/bin/phpunit; echo "exit: $?"
```
Expected: `OK (7 tests, 36 assertions)`, `exit: 0`.

- [ ] **Step 4: Commit**

```bash
cd /Users/dorenberge/WorkInProgress/VIBE/JamWork_v2
git add api/tests/SecurityHardeningTest.php
git commit -m "test(api): migrate SecurityHardening harness to PHPUnit"
```

---

## Task 4: Point the CI api job at PHPUnit + verify vendor stays prod-only

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Replace the two script steps with one PHPUnit step**

In `.github/workflows/ci.yml`, in the `api` job, replace these two steps:

```yaml
      - name: Run notification decision tests
        run: php tests/NotificationServiceTest.php

      - name: Run security hardening tests
        run: php tests/SecurityHardeningTest.php
```

with:

```yaml
      - name: Run PHPUnit
        run: vendor/bin/phpunit
```

Leave every other step in the `api` job unchanged (`composer validate --strict`, `composer install --prefer-dist --no-progress` — which installs dev deps and so provides PHPUnit, and `composer audit`).

- [ ] **Step 2: Verify the api CI commands locally**

```bash
cd /Users/dorenberge/WorkInProgress/VIBE/JamWork_v2/api
composer validate --strict && vendor/bin/phpunit && composer audit >/dev/null && echo "API job ✓"
```
Expected: `OK (7 tests, 36 assertions)` then `API job ✓`. (If `composer validate --strict` complains that `composer.lock` is out of date, run `composer update --lock` and re-stage `composer.lock`.)

- [ ] **Step 3: Confirm PHPUnit is NOT committed into the production vendor tree**

```bash
cd /Users/dorenberge/WorkInProgress/VIBE/JamWork_v2
git ls-files api/vendor | grep -ic phpunit
```
Expected: `0`. PHPUnit lives in the working tree's `vendor/` (installed by `composer require --dev`) but is **not tracked**, so the shipped production tree never gains it. Do **not** stage `api/vendor/`.

> If `git status` shows modified/new tracked files under `api/vendor/` (Composer can touch shared autoload files), restore them so the committed prod tree is untouched: `git checkout -- api/vendor` then re-confirm Step 2 still passes against the working-tree (untracked) PHPUnit. The committed vendor must reflect the production (`--no-dev`) dependency set only.

- [ ] **Step 4: Commit**

```bash
cd /Users/dorenberge/WorkInProgress/VIBE/JamWork_v2
git add .github/workflows/ci.yml
git commit -m "ci(api): run PHPUnit instead of standalone test scripts"
```

---

## Task 5: Install Vitest + RTL, configure, and write the api.ts test (client)

**Files:**
- Modify: `client/package.json`
- Create: `client/vitest.config.ts`
- Create: `client/src/test/setup.ts`
- Modify: `client/tsconfig.app.json`
- Create: `client/src/lib/api.test.ts`

- [ ] **Step 1: Install the test dependencies**

```bash
cd /Users/dorenberge/WorkInProgress/VIBE/JamWork_v2/client
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```
Expected: the five packages are added to `devDependencies`; `package-lock.json` updates.

- [ ] **Step 2: Add the `test` script**

In `client/package.json`, add `"test": "vitest run"` to `scripts` so it reads:

```json
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "vite preview",
    "test": "vitest run"
  },
```

- [ ] **Step 3: Create the Vitest config (reuses the Vite plugins + `@` alias)**

Create `client/vitest.config.ts`:

```ts
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

// Reuse the app's Vite config (React plugin + `@` alias) and layer on the test env.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test/setup.ts',
      css: false,
    },
  }),
)
```

- [ ] **Step 4: Create the setup file (jest-dom matchers)**

Create `client/src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 5: Keep test files out of the production build**

In `client/tsconfig.app.json`, add an `exclude` array (it currently has none) alongside `"include": ["src"]`:

```json
  "include": ["src"],
  "exclude": ["src/**/*.test.ts", "src/**/*.test.tsx", "src/test/**"]
```

- [ ] **Step 6: Write the api.ts wrapper test**

Create `client/src/lib/api.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { apiGet } from '@/lib/api'

describe('apiGet / fetch wrapper', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns parsed JSON on a 2xx response', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ value: 42 }),
    })

    await expect(apiGet<{ value: number }>('/thing')).resolves.toEqual({ value: 42 })
    expect(fetch).toHaveBeenCalledWith('/api/thing', expect.objectContaining({ method: 'GET' }))
  })

  it('throws with the JSON error message and status on a non-2xx response', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Not found' }),
    })

    await expect(apiGet('/missing')).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      message: 'Not found',
    })
  })

  it('falls back to statusText when the error body is not JSON', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      json: async () => {
        throw new Error('not json')
      },
    })

    await expect(apiGet('/boom')).rejects.toMatchObject({
      name: 'ApiError',
      status: 500,
      message: 'Server Error',
    })
  })
})
```

- [ ] **Step 7: Run the test**

```bash
cd /Users/dorenberge/WorkInProgress/VIBE/JamWork_v2/client && npm run test
```
Expected: 1 file, 3 tests passing, exit 0. (This proves the runner, the `@` alias, jsdom, and the mocking pattern all work.)

- [ ] **Step 8: Verify the production build is unaffected and ships no test files**

```bash
cd /Users/dorenberge/WorkInProgress/VIBE/JamWork_v2/client && npm run build; echo "exit: $?"
git status --porcelain dist | grep -i test || echo "no test files in dist ✓"
```
Expected: `tsc -b` + `vite build` succeed (`exit: 0`); no `*.test.*` files appear under `dist/`. (If the committed `dist/` changes from the rebuild and you don't intend to refresh the bundle, `git checkout -- dist`.)

- [ ] **Step 9: Commit**

```bash
cd /Users/dorenberge/WorkInProgress/VIBE/JamWork_v2
git add client/package.json client/package-lock.json client/vitest.config.ts client/src/test/setup.ts client/tsconfig.app.json client/src/lib/api.test.ts
git commit -m "test(client): set up Vitest + RTL; test the api fetch wrapper"
```

---

## Task 6: Characterization test for the `projects-updated` seam (client)

This is the load-bearing test: it pins the exact behavior the 4.2 event-bus refactor must preserve — `useProject` refetches when `projects-updated` fires. The "called twice" assertion can only pass while the window listener exists.

**Files:**
- Create: `client/src/hooks/use-project.test.ts`

- [ ] **Step 1: Write the characterization test**

Create `client/src/hooks/use-project.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useProject } from '@/hooks/use-project'
import { apiGet } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  apiGet: vi.fn(),
}))

const mockedApiGet = apiGet as ReturnType<typeof vi.fn>

describe('useProject — projects-updated seam', () => {
  beforeEach(() => {
    mockedApiGet.mockReset()
    mockedApiGet.mockResolvedValue({ projects: [{ id: 'p1', name: 'Alpha' }] })
  })

  it('fetches /projects and resolves the matching project', async () => {
    const { result } = renderHook(() => useProject('p1'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockedApiGet).toHaveBeenCalledWith('/projects')
    expect(result.current.project).toMatchObject({ id: 'p1', name: 'Alpha' })
  })

  it('refetches when a projects-updated event fires (the 4.2 seam)', async () => {
    renderHook(() => useProject('p1'))

    await waitFor(() => expect(mockedApiGet).toHaveBeenCalledTimes(1))

    act(() => {
      window.dispatchEvent(new Event('projects-updated'))
    })

    await waitFor(() => expect(mockedApiGet).toHaveBeenCalledTimes(2))
  })
})
```

- [ ] **Step 2: Run it**

```bash
cd /Users/dorenberge/WorkInProgress/VIBE/JamWork_v2/client && npm run test -- src/hooks/use-project.test.ts
```
Expected: 2 tests pass, exit 0.

- [ ] **Step 3: Sanity-check that the test is meaningful (optional, do not commit the edit)**

Temporarily comment out the `window.addEventListener('projects-updated', handler)` line in `client/src/hooks/use-project.ts:35`, re-run Step 2, and confirm the second test **fails** (`expected 2, got 1`). Then restore the line. This proves the test actually guards the seam rather than passing vacuously.

- [ ] **Step 4: Commit**

```bash
cd /Users/dorenberge/WorkInProgress/VIBE/JamWork_v2
git add client/src/hooks/use-project.test.ts
git commit -m "test(client): characterize useProject projects-updated refetch (4.2 seam)"
```

---

## Task 7: Representative task-mutation component test (client)

**Files:**
- Create: `client/src/components/bulk-action-bar.test.tsx`

- [ ] **Step 1: Write the component test**

Create `client/src/components/bulk-action-bar.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BulkActionBar } from '@/components/bulk-action-bar'
import { apiGet, apiPut } from '@/lib/api'
import type { Task } from '@/types'

vi.mock('@/lib/api', () => ({
  apiGet: vi.fn(),
  apiPut: vi.fn(),
  apiPost: vi.fn(),
}))
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const mockedApiGet = apiGet as ReturnType<typeof vi.fn>
const mockedApiPut = apiPut as ReturnType<typeof vi.fn>

// Minimal task shape — only id/status are read by the component under test.
const task = { id: 't1', status: 'todo' } as unknown as Task

describe('BulkActionBar — Mark as Done', () => {
  beforeEach(() => {
    mockedApiGet.mockReset().mockResolvedValue({ sprints: [] })
    mockedApiPut.mockReset().mockResolvedValue({})
  })
  afterEach(() => cleanup())

  it('bulk-updates status to done and dispatches projects-updated', async () => {
    const onActionComplete = vi.fn()
    const projectsUpdated = vi.fn()
    window.addEventListener('projects-updated', projectsUpdated)

    render(
      <BulkActionBar
        selectedTaskIds={new Set(['t1'])}
        tasks={[task]}
        onActionComplete={onActionComplete}
        onClearSelection={vi.fn()}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: /mark as done/i }))

    await waitFor(() => {
      expect(mockedApiPut).toHaveBeenCalledWith('/tasks/bulk-update', {
        taskIds: ['t1'],
        fields: { status: 'done' },
      })
    })
    expect(projectsUpdated).toHaveBeenCalled()
    expect(onActionComplete).toHaveBeenCalled()

    window.removeEventListener('projects-updated', projectsUpdated)
  })
})
```

- [ ] **Step 2: Run it**

```bash
cd /Users/dorenberge/WorkInProgress/VIBE/JamWork_v2/client && npm run test -- src/components/bulk-action-bar.test.tsx
```
Expected: 1 test passes, exit 0.

> If the radix `ui` imports make the component hard to mount in jsdom (unexpected render error), fall back to the simpler `project-settings-dialog` per the spec: test that saving the dialog calls its `apiPut` and dispatches `projects-updated`. Keep the same assertion shape (api call + event dispatched).

- [ ] **Step 3: Run the whole client suite**

```bash
cd /Users/dorenberge/WorkInProgress/VIBE/JamWork_v2/client && npm run test
```
Expected: 3 files, 6 tests passing, exit 0.

- [ ] **Step 4: Commit**

```bash
cd /Users/dorenberge/WorkInProgress/VIBE/JamWork_v2
git add client/src/components/bulk-action-bar.test.tsx
git commit -m "test(client): cover BulkActionBar mark-as-done mutation + event"
```

---

## Task 8: Add the client CI test gate + end-to-end verification

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add a blocking Vitest step to the client job**

In `.github/workflows/ci.yml`, in the `client` job, add this step immediately **after** the existing `Type-check` step (`npx tsc -b`) and before `Build`:

```yaml
      - name: Test
        run: npm run test
```
Leave the non-blocking `Lint` step (`continue-on-error: true`) as-is — clearing the lint backlog is a separate item.

- [ ] **Step 2: Verify both CI jobs locally (full parity with the pipeline)**

```bash
cd /Users/dorenberge/WorkInProgress/VIBE/JamWork_v2/api
composer validate --strict && vendor/bin/phpunit && composer audit >/dev/null && echo "API job ✓"
cd ../client
npx tsc -b && npm run test && npm run build >/dev/null && npm audit --audit-level=high && echo "client job ✓"
```
Expected: `API job ✓` and `client job ✓`.

- [ ] **Step 3: Confirm the diff touches only intended files**

```bash
cd /Users/dorenberge/WorkInProgress/VIBE/JamWork_v2
git diff main --stat
git ls-files api/vendor | grep -ic phpunit   # expect 0
```
Expected: the stat lists only `api/composer.json`, `api/composer.lock`, `api/phpunit.xml`, `api/.gitignore`, `api/tests/*.php`, `.github/workflows/ci.yml`, `client/package.json`, `client/package-lock.json`, `client/vitest.config.ts`, `client/src/test/setup.ts`, `client/tsconfig.app.json`, and the three client test files (plus optionally a rebuilt `client/dist/` if you chose to keep it). PHPUnit count is `0`.

- [ ] **Step 4: Commit and push**

```bash
cd /Users/dorenberge/WorkInProgress/VIBE/JamWork_v2
git add .github/workflows/ci.yml
git commit -m "ci(client): add blocking Vitest gate"
git push -u origin test/foundation-pass-1
```

- [ ] **Step 5: Verify the PR run is green**

Open the PR (or the Actions tab) and confirm both `API (PHP)` and `Client (TypeScript)` jobs pass, with PHPUnit and Vitest steps green. Lint remains a non-blocking ⚠️ — expected until the backlog is cleared.

---

## Verification (end-to-end)

After all tasks, on the branch:

1. **API suite green:** `cd api && vendor/bin/phpunit` → `OK (7 tests, 36 assertions)`, exit 0.
2. **PHPUnit not shipped:** `git ls-files api/vendor | grep -ic phpunit` → `0`; production vendor tree unchanged.
3. **Client suite green:** `cd client && npm run test` → 3 files / 6 tests pass.
4. **`useProject` seam guarded:** the characterization test fails if the `projects-updated` listener is removed (verified in Task 6 Step 3).
5. **Build clean, no test files shipped:** `cd client && npm run build` succeeds; no `*.test.*` under `dist/`.
6. **CI:** both jobs blocking-green on the PR; lint the only non-blocking step.
7. **Scoped diff:** `git diff main --stat` lists only the files in the File Structure table (+ optional `dist/`).

---

## Out of Scope (Pass 2 — separate plan)

- Test-database strategy (MySQL 8) with fixtures + transaction rollback.
- API integration tests: task CRUD, route handlers, `AuthMiddleware` end-to-end `token_version` enforcement.
- God-file characterization tests (written just-in-time during the 4.1 decomposition).
- Clearing the 72-error ESLint backlog and flipping the lint gate to blocking.
