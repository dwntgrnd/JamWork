# JW-CC02 — API Foundation (Slim 4 Bootstrap)

**Context:** JamWork-v2 Phase 3 kickoff. The `api/` directory has a scaffolded file structure (empty dirs, placeholder files, composer.json with dependencies declared). No `vendor/` directory exists yet. This prompt bootstraps the PHP API so it can receive requests and respond.

**Architecture:** Vite + React SPA frontend served by Apache. PHP REST API at `/api/` path on the same domain (same-origin — no CORS needed). MySQL 8.0 database. Hosted on SiteGround shared hosting (Apache, PHP 8.2+).

**Reference:** The v1 Express server at `/Users/dorenberge/WorkInProgress/VIBE/JamWork/server/src/index.ts` is READ-ONLY reference. Do NOT modify any files in that directory.

---

## Tasks

### 1. Install Composer Dependencies

Run `composer install` in the `api/` directory to generate `vendor/` and `composer.lock`.

The `composer.json` already declares:
- `slim/slim` ^4.0
- `slim/psr7` ^1.6
- `firebase/php-jwt` ^6.0
- `phpmailer/phpmailer` ^6.0
- `vlucas/phpdotenv` ^5.0
- `ramsey/uuid` ^4.0

Verify PHP 8.2+ is available before running.

### 2. Create `api/src/Lib/Database.php`

PDO connection singleton. Requirements:

```
Namespace: JamWork\Lib
Class: Database

- Private static ?PDO $instance = null
- Private constructor (no direct instantiation)
- Public static method getInstance(): PDO
  - Reads from $_ENV (loaded by phpdotenv in index.php)
  - DSN: mysql:host={DB_HOST};port={DB_PORT};dbname={DB_NAME};charset=utf8mb4
  - Options:
    - PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
    - PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
    - PDO::ATTR_EMULATE_PREPARES => false (use real prepared statements)
  - Connection charset: utf8mb4 (supports full Unicode including emoji)
```

Do NOT catch connection exceptions in this class — let them bubble to Slim's error handler.

### 3. Create `api/index.php`

Slim 4 application entry point. This is the single entry point for all API requests (Apache .htaccess already rewrites to this file).

Requirements:

1. Require composer autoloader: `require __DIR__ . '/vendor/autoload.php'`

2. Load environment variables:
   - Use `Dotenv\Dotenv::createImmutable(__DIR__)`
   - Call `$dotenv->load()`
   - Call `$dotenv->required(['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASS', 'JWT_SECRET'])->notEmpty()`

3. Create Slim App:
   - Use `Slim\Factory\AppFactory::create()`
   - Set base path to `/api` (because Apache serves the app at /api/ subdirectory)

4. Add middleware (order matters — first added = outermost):
   a. JSON body parsing: `$app->addBodyParsingMiddleware()`
   b. Routing: `$app->addRoutingMiddleware()`
   c. Error middleware: `$app->addErrorMiddleware($displayErrors, true, true)`
      - `$displayErrors = ($_ENV['APP_ENV'] ?? 'production') !== 'production'`
      - In production, errors return generic JSON; in dev, include details

5. Register health check route:
   `GET /health` → returns JSON:
   ```json
   {
     "status": "ok",
     "timestamp": 1741900000000
   }
   ```
   (timestamp is current Unix timestamp in milliseconds, matching v1's `Date.now()` format — use `(int)(microtime(true) * 1000)`)

6. Run the app: `$app->run()`

**Important — Base Path:** The Slim app MUST call `$app->setBasePath('/api')` so that route definitions like `/health` resolve to `/api/health` in the browser. Without this, Slim will expect requests at `/health` (root) and return 404 for `/api/health`.

**Important — Error Handling:** Slim's default error handler returns HTML. Override it to return JSON for all errors:

```php
$errorMiddleware = $app->addErrorMiddleware($displayErrors, true, true);
$errorHandler = $errorMiddleware->getDefaultErrorHandler();
$errorHandler->forceContentType('application/json');
```

If `forceContentType` alone doesn't produce clean JSON output during testing, replace it with a custom error handler:

```php
use Psr\Http\Message\ResponseInterface;

$customErrorHandler = function (
    \Psr\Http\Message\ServerRequestInterface $request,
    \Throwable $exception,
    bool $displayErrorDetails,
    bool $logErrors,
    bool $logErrorDetails
) use ($app): ResponseInterface {
    $statusCode = 500;
    if ($exception instanceof \Slim\Exception\HttpException) {
        $statusCode = $exception->getCode();
    }

    $error = ['error' => $statusCode === 404 ? 'Not found' : 'Internal server error'];
    if ($displayErrorDetails) {
        $error['message'] = $exception->getMessage();
    }

    $response = $app->getResponseFactory()->createResponse($statusCode);
    $response->getBody()->write(json_encode($error));
    return $response->withHeader('Content-Type', 'application/json');
};

$errorMiddleware->setDefaultErrorHandler($customErrorHandler);
```

Prefer the simpler `forceContentType` approach if it works. Use the custom handler only if JSON output is not clean.

### 4. Create `api/.env` (local development)

Copy `.env.example` and fill with local dev values. The `.env` file must be gitignored.

Ensure `.gitignore` in the `api/` directory (or project root) includes:
```
vendor/
.env
```

If `api/.gitignore` doesn't exist, create it.

### 5. Update `api/.env.example`

The current `.env.example` is mostly correct. Ensure it contains exactly:

```
DB_HOST=localhost
DB_NAME=jamwork
DB_USER=
DB_PASS=
DB_PORT=3306

JWT_SECRET=
JWT_EXPIRY=30d

SMTP_HOST=
SMTP_PORT=465
SMTP_USER=
SMTP_PASS=
SMTP_FROM_EMAIL=
SMTP_FROM_NAME=JamWork

APP_URL=http://localhost:5173
APP_ENV=development
```

Note: `APP_ENV=development` for local (controls error detail level). Production deploys set `APP_ENV=production`.

---

## Verification

After completing all tasks, verify the API works:

1. **Create a local `.env`** file with valid MySQL credentials pointing to a local or remote MySQL 8 database. If no MySQL is available locally, use placeholder values — the health check will still work (it doesn't query the DB).

2. **Start PHP's built-in server** from the `api/` directory:
   ```bash
   cd api && php -S localhost:8080 -t . index.php
   ```

3. **Test the health check:**
   ```bash
   curl http://localhost:8080/api/health
   ```
   Expected response:
   ```json
   {"status":"ok","timestamp":1741900000000}
   ```
   (timestamp will be current time in milliseconds)

4. **Test 404 handling:**
   ```bash
   curl -s -o - -w "\n%{http_code}" http://localhost:8080/api/nonexistent
   ```
   Expected: JSON error response body (NOT HTML), 404 status code.

5. If 404 returns HTML instead of JSON, implement the custom error handler from Task 3 above.

---

## Files Created/Modified

| File | Action |
|------|--------|
| `api/vendor/` | Created (composer install) |
| `api/composer.lock` | Created (composer install) |
| `api/src/Lib/Database.php` | Created |
| `api/index.php` | Replaced (was one-line placeholder) |
| `api/.env.example` | Updated |
| `api/.env` | Created (local dev, gitignored) |
| `api/.gitignore` | Created if not already present |

## Files NOT Modified

- Everything in `client/` — no frontend changes
- Everything in `/Users/dorenberge/WorkInProgress/VIBE/JamWork/` — v1 is READ-ONLY
- `api/src/Routes/`, `api/src/Middleware/`, `api/src/Models/`, `api/src/Mail/` — remain empty (filled in subsequent CC prompts)
- `api/.htaccess` — already correct (rewrites to index.php)
- `api/migrations/` — schema is a separate CC prompt (JW-CC03)

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| No CORS middleware | Same-origin architecture — SPA and API on same domain. v1's CORS existed for cross-origin Render deployment. |
| No CSRF middleware | Same-origin + SameSite=Lax cookies eliminates CSRF risk. |
| PDO EMULATE_PREPARES = false | MySQL handles parameter binding natively. Stronger SQL injection protection. |
| utf8mb4 charset | Full Unicode support including emoji in task titles, descriptions, notes. |
| Slim base path `/api` | Matches Apache .htaccess rewrite and frontend's `API_URL = '/api'`. |
| JSON-only error responses | SPA client expects JSON from every API response including errors. Default Slim HTML errors would break frontend error handling. |
| Database singleton pattern | Single PDO connection per request. Appropriate for shared hosting — no connection pooling available. |
| Environment validation on boot | `$dotenv->required()` fails fast if critical config is missing, rather than cryptic errors later. |
