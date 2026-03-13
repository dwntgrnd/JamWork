# JW-CC04 — Auth Endpoints + Middleware

**Context:** JamWork-v2 Phase 3. API foundation (JW-CC02) and MySQL schema (JW-CC03) are complete. This prompt implements authentication endpoints, JWT middleware, admin middleware, input validation, and rate limiting. After this prompt, the API can authenticate users, manage sessions, and protect routes.

**Reference files (READ-ONLY — do not modify):**
- Auth routes: `/Users/dorenberge/WorkInProgress/VIBE/JamWork/server/src/routes/auth.ts`
- Auth middleware: `/Users/dorenberge/WorkInProgress/VIBE/JamWork/server/src/middleware/auth.ts`
- Rate limiter: `/Users/dorenberge/WorkInProgress/VIBE/JamWork/server/src/middleware/rateLimiter.ts`
- Validation: `/Users/dorenberge/WorkInProgress/VIBE/JamWork/server/src/middleware/validation.ts`

**Dependencies already installed (via JW-CC02):** `firebase/php-jwt`, `ramsey/uuid`, `vlucas/phpdotenv`, `slim/slim`, `slim/psr7`

---

## Tasks

### 1. Create `api/src/Lib/Auth.php`

JWT helper class for token generation and cookie management.

```
Namespace: JamWork\Lib
Class: Auth

Constants:
  BCRYPT_COST = 12
  COOKIE_MAX_AGE = 30 * 24 * 60 * 60  (30 days in seconds)
  TOKEN_REFRESH_THRESHOLD = 86400       (24 hours in seconds)

Static methods:

  generateToken(string $userId, string $role): string
    - Uses Firebase\JWT\JWT::encode()
    - Payload: { userId, role, iat: time() }
    - Expiry: reads $_ENV['JWT_EXPIRY'] (default '30d'), converts to seconds
    - Key: $_ENV['JWT_SECRET']
    - Algorithm: HS256

  decodeToken(string $token): ?array
    - Uses Firebase\JWT\JWT::decode()
    - Returns decoded payload as associative array, or null on any exception
    - Key: $_ENV['JWT_SECRET']
    - Algorithm: HS256

  setAuthCookie(ResponseInterface $response, string $userId, string $role): ResponseInterface
    - Generates token via generateToken()
    - Sets 'token' cookie on the response using Set-Cookie header
    - Cookie attributes:
      - HttpOnly: true
      - Secure: ($_ENV['APP_ENV'] ?? 'production') === 'production'
      - SameSite: Lax
      - Path: /
      - Max-Age: COOKIE_MAX_AGE (30 days)
    - Returns modified response

  clearAuthCookie(ResponseInterface $response): ResponseInterface
    - Sets 'token' cookie with empty value and Max-Age=0 (expires immediately)
    - Same HttpOnly, Secure, SameSite, Path attributes
    - Returns modified response

  hashPassword(string $password): string
    - Uses password_hash($password, PASSWORD_BCRYPT, ['cost' => BCRYPT_COST])

  verifyPassword(string $password, string $hash): bool
    - Uses password_verify($password, $hash)
```

**Important — Cookie setting in Slim/PSR-7:** Slim uses PSR-7 immutable responses. You cannot use `setcookie()`. Instead, build the Set-Cookie header string manually:

```php
$cookie = sprintf(
    'token=%s; HttpOnly; SameSite=Lax; Path=/; Max-Age=%d%s',
    $token,
    self::COOKIE_MAX_AGE,
    $secure ? '; Secure' : ''
);
return $response->withHeader('Set-Cookie', $cookie);
```

**Important — JWT_EXPIRY parsing:** The env var is a string like `'30d'`. Parse it: if it ends with 'd', multiply the number by 86400. Pass the resulting seconds to JWT as `exp` claim: `'exp' => time() + $expirySeconds`.

### 2. Create `api/src/Lib/Validator.php`

Input validation helper. This is a lightweight replacement for express-validator.

```
Namespace: JamWork\Lib
Class: Validator

Purpose: Validate request body fields and return structured error arrays.

Static methods:

  validate(array $data, array $rules): array
    - $data: parsed request body (associative array)
    - $rules: associative array of field => rule definitions
    - Returns array of error objects: [['field' => 'email', 'message' => 'Valid email is required'], ...]
    - Returns empty array if validation passes

Rule types to support:
  'required'           → field must exist and be non-empty string (after trim)
  'email'              → valid email format (filter_var FILTER_VALIDATE_EMAIL)
  'min:N'              → string length >= N (for passwords)
  'max:N'              → string length <= N
  'in:a,b,c'           → value must be one of the listed values
  'uuid'               → valid UUID v4 format (regex)
  'iso8601'            → valid ISO 8601 date string
  'boolean'            → value is boolean (true/false)
  'array'              → value is an array
  'url'                → starts with http:// or https://
  'hex_color'          → matches /^#[0-9A-Fa-f]{6}$/
  'nullable'           → field can be null (skip other rules if null)
  'optional'           → field can be absent (skip all rules if key missing)
  'uuid_array'         → array where every element is a valid UUID

Rules can be combined with pipe: 'optional|email' or 'required|min:10'
If 'optional' is present and key is missing from $data, skip validation for that field.
If 'nullable' is present and value is null, skip remaining rules for that field.

  respondWithErrors(ResponseInterface $response, array $errors): ResponseInterface
    - Sets 400 status code
    - Returns JSON: { "errors": [...] }
    - Matches v1 error format exactly
```

### 3. Create `api/src/Middleware/AuthMiddleware.php`

PSR-15 middleware for authentication.

```
Namespace: JamWork\Middleware
Class: AuthMiddleware
Implements: Psr\Http\Server\MiddlewareInterface

process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface

Logic:
  1. Read 'token' cookie from request (via $request->getCookieParams()['token'])
  2. If no token: return 401 JSON response { "error": "Authentication required" }
  3. Decode token via Auth::decodeToken()
  4. If decode fails: clear cookie, return 401 { "error": "Session expired. Please log in again." }
  5. Attach userId and role to request as attributes:
     $request = $request->withAttribute('userId', $decoded['userId'])
     $request = $request->withAttribute('role', $decoded['role'])
  6. Sliding session: if token is older than 24 hours (TOKEN_REFRESH_THRESHOLD),
     generate a fresh token and set a new cookie on the response AFTER calling handler:
     $response = $handler->handle($request);
     $response = Auth::setAuthCookie($response, $decoded['userId'], $decoded['role']);
     return $response;
  7. Otherwise, just return $handler->handle($request)
```

**Important — PSR-7 cookie reading:** Slim parses cookies from the `Cookie` header into `$request->getCookieParams()`. This is an associative array. Access with `$request->getCookieParams()['token'] ?? null`.

### 4. Create `api/src/Middleware/AdminMiddleware.php`

PSR-15 middleware for admin-only routes. Must be applied AFTER AuthMiddleware in the middleware chain.

```
Namespace: JamWork\Middleware
Class: AdminMiddleware
Implements: Psr\Http\Server\MiddlewareInterface

process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface

Logic:
  1. Read role from request attribute: $request->getAttribute('role')
  2. If role !== 'admin': return 403 JSON response { "error": "Admin access required" }
  3. Otherwise: return $handler->handle($request)
```

### 5. Create `api/src/Middleware/RateLimitMiddleware.php`

File-based rate limiter for shared hosting (no Redis/Memcached available).

```
Namespace: JamWork\Middleware
Class: RateLimitMiddleware
Implements: Psr\Http\Server\MiddlewareInterface

Constructor parameters:
  int $maxRequests      — max requests per window
  int $windowSeconds    — time window in seconds
  string $storageDir    — directory for rate limit files (default: sys_get_temp_dir() . '/jamwork-ratelimit')

process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface

Logic:
  1. Get client IP from request (check X-Forwarded-For first for proxied requests, fall back to REMOTE_ADDR via $_SERVER)
  2. Create storage directory if not exists
  3. Key: md5 hash of IP address
  4. Storage file: $storageDir/$key.json
  5. Read file, parse JSON: { "count": N, "window_start": timestamp }
  6. If window expired (current time - window_start > windowSeconds): reset count to 1, update window_start
  7. If count >= maxRequests: return 429 JSON { "error": "Too many requests. Please try again later." }
  8. Increment count, write back
  9. Proceed with $handler->handle($request)

Two factory static methods for convenience:
  static loginLimiter(): self    → new self(10, 15 * 60)   // 10 requests per 15 minutes
  static generalLimiter(): self  → new self(1000, 15 * 60) // 1000 requests per 15 minutes
```

**Cleanup:** Add a cleanup check — if the storage directory has files older than 1 hour, delete them (prevents disk buildup). Run this check probabilistically (1 in 100 requests) to avoid overhead.

### 6. Create `api/src/Routes/AuthRoutes.php`

All auth endpoints. Register as a Slim route group under `/auth`.

```
Namespace: JamWork\Routes
Class: AuthRoutes

Static method:
  register(App $app): void
    - Creates route group '/auth' with all routes below
    - Applies AuthMiddleware to routes that require it
    - Applies RateLimitMiddleware::loginLimiter() to POST /login
```

#### Endpoints

**POST /auth/signup** (no auth)

Register first user as admin. Subsequent signups blocked.

Request body:
```json
{ "email": "user@example.com", "password": "...", "displayName": "..." }
```

Validation: email (required, valid email), password (required, min 10 chars), displayName (required, min 1, max 100)

Logic:
1. Count users in DB. If > 0, return 403: `{ "error": "Registration is disabled. Contact your admin for an invitation." }`
2. Lowercase and trim email
3. Hash password (bcrypt, cost 12)
4. Insert user with role='admin', mustResetPassword=false
5. Generate UUID for user ID via Ramsey\Uuid\Uuid::uuid4()->toString()
6. Set auth cookie on response
7. Return 201:
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "displayName": "Name",
    "role": "admin"
  }
}
```

Error: If email already exists (duplicate key), return 400: `{ "error": "An account with this email already exists" }`

**POST /auth/login** (no auth, rate limited)

Authenticate user and set session cookie.

Request body:
```json
{ "email": "user@example.com", "password": "..." }
```

Validation: email (required, valid email), password (required, non-empty)

Logic:
1. Lowercase and trim email
2. Find user by email. If not found, return 401: `{ "error": "Invalid email or password" }`
3. Verify password. If wrong, return 401: `{ "error": "Invalid email or password" }` (same message — prevent email enumeration)
4. Set auth cookie
5. Return 200:
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "displayName": "Name",
    "role": "admin",
    "mustResetPassword": false
  }
}
```

**POST /auth/logout** (no auth required)

Clear session cookie.

Logic:
1. Clear auth cookie
2. Return 200: `{ "message": "Logged out" }`

**GET /auth/me** (auth required)

Get current authenticated user.

Logic:
1. Get userId from request attribute (set by AuthMiddleware)
2. Find user by ID. If not found (deleted while session active): clear cookie, return 401: `{ "error": "User not found" }`
3. Return 200:
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "displayName": "Name",
    "role": "admin",
    "mustResetPassword": false
  }
}
```

**PUT /auth/reset-password** (auth required)

Reset password for users with mustResetPassword flag.

Request body:
```json
{ "newPassword": "..." }
```

Validation: newPassword (required, min 10 chars)

Logic:
1. Find user by ID from auth. If not found: 404 `{ "error": "User not found" }`
2. If !mustResetPassword: 400 `{ "error": "Password reset not required" }`
3. Hash new password, update user: set passwordHash, set mustResetPassword=false
4. Return 200: `{ "message": "Password reset successfully" }`

**PUT /auth/profile** (auth required)

Update own profile (email and/or displayName).

Request body (all fields optional):
```json
{ "email": "new@example.com", "displayName": "New Name" }
```

Validation: email (optional, valid email), displayName (optional, min 1, max 100)

Logic:
1. Find current user by ID
2. If email provided and different from current:
   a. Lowercase and trim
   b. Check if another user has this email. If yes: 409 `{ "error": "A user with this email already exists" }`
   c. Update email
3. If displayName provided: trim and update
4. Return 200:
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "displayName": "Name",
    "role": "admin",
    "mustResetPassword": false
  }
}
```

**PUT /auth/change-password** (auth required)

Change password for authenticated users.

Request body:
```json
{ "currentPassword": "...", "newPassword": "..." }
```

Validation: currentPassword (required, non-empty), newPassword (required, min 10 chars)

Logic:
1. Find user by ID. If not found: 404
2. Verify currentPassword against stored hash. If wrong: 401 `{ "error": "Current password is incorrect" }`
3. Hash newPassword, update user
4. Return 200: `{ "message": "Password changed successfully" }`

**GET /auth/users** (auth required)

List all users. Any authenticated user can call this (needed for assignee dropdowns, etc.).

Logic:
1. Query all users, ordered by created_at ASC
2. Return 200:
```json
{
  "users": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "displayName": "Name",
      "role": "admin",
      "createdAt": "2026-03-13T..."
    }
  ]
}
```

Note: This endpoint returns `createdAt` (unlike other user-returning endpoints). Match this exactly.

---

### 7. Wire Routes into `api/index.php`

Add the auth route registration to `index.php`, AFTER the health check route and BEFORE `$app->run()`:

```php
// Routes
AuthRoutes::register($app);

// Future route groups will be added here (AdminRoutes, ProjectRoutes, etc.)
```

Add the general rate limiter as global middleware (applied to all routes):

```php
$app->add(RateLimitMiddleware::generalLimiter());
```

Add this BEFORE the routing middleware in the middleware stack. Order should be:
1. Body parsing middleware
2. General rate limiter
3. Routing middleware
4. Error middleware

---

## Response Format Conventions

All responses must follow these patterns exactly (matching v1):

**Success with user object:** `{ "user": { ... } }` or `{ "users": [...] }`
**Success with message:** `{ "message": "..." }`
**Validation errors:** `{ "errors": [{ "field": "email", "message": "Valid email is required" }] }` — 400 status
**Auth errors:** `{ "error": "..." }` — 401 status (note: singular "error", not "errors")
**Forbidden:** `{ "error": "..." }` — 403 status
**Not found:** `{ "error": "..." }` — 404 status
**Conflict:** `{ "error": "..." }` — 409 status
**Server error:** `{ "error": "..." }` — 500 status

---

## Date/Time Format

All datetime values returned in JSON must be ISO 8601 format. MySQL TIMESTAMP values should be converted to ISO 8601 strings when building response JSON.

PHP conversion: `date('c', strtotime($row['created_at']))` or use `DateTime` class.

Ensure timezone handling is consistent: set `date_default_timezone_set('UTC')` at the top of `index.php` (before any date operations).

---

## UUID Generation

Use `Ramsey\Uuid\Uuid::uuid4()->toString()` for all entity IDs when inserting new rows. Do NOT rely on MySQL's `UUID()` function for INSERT operations from PHP — generate in PHP and pass as parameter. The MySQL `DEFAULT (UUID())` in the schema is a safety net for manual SQL inserts only.

---

## Verification

After implementing all files:

1. **Start the API:**
   ```bash
   cd api && php -S localhost:8080 -t . index.php
   ```

2. **Test signup (first user):**
   ```bash
   curl -X POST http://localhost:8080/api/auth/signup \
     -H 'Content-Type: application/json' \
     -d '{"email":"admin@test.com","password":"testpassword123","displayName":"Admin User"}' \
     -c cookies.txt -v
   ```
   Expected: 201 with user object, Set-Cookie header with `token=...`

3. **Test signup blocked (second attempt):**
   ```bash
   curl -X POST http://localhost:8080/api/auth/signup \
     -H 'Content-Type: application/json' \
     -d '{"email":"another@test.com","password":"testpassword123","displayName":"Another"}' \
     -v
   ```
   Expected: 403 with "Registration is disabled" error

4. **Test login:**
   ```bash
   curl -X POST http://localhost:8080/api/auth/login \
     -H 'Content-Type: application/json' \
     -d '{"email":"admin@test.com","password":"testpassword123"}' \
     -c cookies.txt -v
   ```
   Expected: 200 with user object, Set-Cookie header

5. **Test /me:**
   ```bash
   curl http://localhost:8080/api/auth/me -b cookies.txt
   ```
   Expected: 200 with user object

6. **Test /me without auth:**
   ```bash
   curl http://localhost:8080/api/auth/me
   ```
   Expected: 401 `{ "error": "Authentication required" }`

7. **Test /users:**
   ```bash
   curl http://localhost:8080/api/auth/users -b cookies.txt
   ```
   Expected: 200 with users array (1 user)

8. **Test logout:**
   ```bash
   curl -X POST http://localhost:8080/api/auth/logout -b cookies.txt -c cookies.txt -v
   ```
   Expected: 200, cookie cleared

9. **Test validation:**
   ```bash
   curl -X POST http://localhost:8080/api/auth/signup \
     -H 'Content-Type: application/json' \
     -d '{"email":"bad","password":"short","displayName":""}' \
     -v
   ```
   Expected: 400 with errors array

---

## Files Created/Modified

| File | Action |
|------|--------|
| `api/src/Lib/Auth.php` | Created |
| `api/src/Lib/Validator.php` | Created |
| `api/src/Middleware/AuthMiddleware.php` | Created |
| `api/src/Middleware/AdminMiddleware.php` | Created |
| `api/src/Middleware/RateLimitMiddleware.php` | Created |
| `api/src/Routes/AuthRoutes.php` | Created |
| `api/index.php` | Modified (add route registration, rate limiter, timezone) |

## Files NOT Modified

- Everything in `client/` — no frontend changes
- Everything in `/Users/dorenberge/WorkInProgress/VIBE/JamWork/` — v1 is READ-ONLY
- `api/src/Models/` — User model queries are inline in AuthRoutes for now (can be extracted to a Model class in a future refactor if routes get too large)
- `api/migrations/` — schema already handled by JW-CC03
- `api/src/Routes/AdminRoutes.php` — separate CC prompt (JW-CC05)
- `api/src/Mail/` — separate CC prompt (JW-CC05)

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Password min 10 characters | Matches frontend validation (Decision #8 from JW-S01). PRD says 8+ but actual implementation standard is 10. |
| Inline DB queries in routes (no Model class yet) | Auth route queries are simple single-table lookups. Extracting to a Model adds indirection without value at this stage. Models will matter more for Tasks (joins, filters, transactions). |
| File-based rate limiting | SiteGround shared hosting has no Redis or Memcached. File-based with temp dir is the simplest reliable approach. Probabilistic cleanup prevents disk buildup. |
| UUID generated in PHP, not MySQL | Consistent with v1 pattern. PHP Ramsey/Uuid generates RFC 4122 v4 UUIDs. MySQL UUID() generates v1 (time-based) which would be a format mismatch. |
| Sliding session (24h refresh) | Matches v1 exactly. Tokens older than 24 hours get silently refreshed. Users stay logged in for up to 30 days without re-authenticating, with fresh tokens every 24h. |
| Set-Cookie header string (not setcookie()) | PSR-7 responses are immutable. PHP's native setcookie() writes directly to output and bypasses PSR-7. Must build cookie header manually. |
| UTC timezone default | Consistent datetime handling. All timestamps stored and returned in UTC. Frontend handles display timezone if needed. |
