# JW-CC05b — Admin Endpoints + Workspace Settings + Email

**Context:** JamWork-v2 Phase 3. API foundation (JW-CC02), MySQL schema (JW-CC03), auth endpoints (JW-CC04), and auth validation patch (JW-CC05a) are complete. This prompt implements admin user management, workspace settings, and the PHPMailer email integration for invitations. After this prompt, Phase 3 is complete.

**Reference files (READ-ONLY — do not modify):**
- Admin routes (v1): `/Users/dorenberge/WorkInProgress/VIBE/JamWork/server/src/routes/admin.ts`
- Workspace settings routes (v1): `/Users/dorenberge/WorkInProgress/VIBE/JamWork/server/src/routes/workspace-settings.ts`
- Validation rules (v1): `/Users/dorenberge/WorkInProgress/VIBE/JamWork/server/src/middleware/validation.ts`
- Frontend admin page (v2): `/Users/dorenberge/WorkInProgress/VIBE/JamWork_v2/client/src/pages/admin.tsx`
- Frontend API client (v2): `/Users/dorenberge/WorkInProgress/VIBE/JamWork_v2/client/src/lib/api.ts`

**Existing v2 files to reference (patterns to follow):**
- Auth routes: `api/src/Routes/AuthRoutes.php` — route group structure, middleware chaining, response format, DB query patterns
- Validator: `api/src/Lib/Validator.php` — available rules: `required`, `optional`, `email`, `min:N`, `max:N`, `uuid`, etc.
- Auth helper: `api/src/Lib/Auth.php` — password hashing, cookie management
- Middleware: `api/src/Middleware/AuthMiddleware.php`, `api/src/Middleware/AdminMiddleware.php`
- Database: `api/src/Lib/Database.php` — `Database::getInstance()` returns PDO
- Schema: `api/migrations/001_initial_schema.sql` — table definitions for `users` and `workspace_settings`
- .env.example: `api/.env.example` — already contains SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM_EMAIL, SMTP_FROM_NAME, APP_URL

**Dependencies already installed:** `phpmailer/phpmailer` ^6.0 is declared in `composer.json` and installed in `vendor/`.

---

## Tasks

### 1. Create `api/src/Lib/Mailer.php`

PHPMailer wrapper for sending transactional emails via SiteGround SMTP.

```
Namespace: JamWork\Lib
Class: Mailer

Purpose: Thin wrapper around PHPMailer. Reads SMTP config from $_ENV.
Designed for graceful failure — returns success/failure status, never throws.
```

**Constructor:**
- Create a PHPMailer instance (passing `true` to enable exceptions internally)
- Configure SMTP from environment variables:
  - `$mail->isSMTP()`
  - `$mail->Host = $_ENV['SMTP_HOST']`
  - `$mail->Port = (int) ($_ENV['SMTP_PORT'] ?? 465)`
  - `$mail->SMTPAuth = true`
  - `$mail->Username = $_ENV['SMTP_USER']`
  - `$mail->Password = $_ENV['SMTP_PASS']`
  - `$mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS` (port 465 = SSL; if port is 587, use `ENCRYPTION_STARTTLS`)
  - `$mail->setFrom($_ENV['SMTP_FROM_EMAIL'], $_ENV['SMTP_FROM_NAME'] ?? 'JamWork')`
  - `$mail->isHTML(true)`
  - `$mail->CharSet = 'UTF-8'`
- Store the configured PHPMailer instance as a private property

**Port-based encryption logic:**
```php
if ($port === 587) {
    $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
} else {
    $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
}
```

**Public method — `sendInviteEmail()`:**

```php
public function sendInviteEmail(
    string $toEmail,
    string $displayName,
    string $temporaryPassword,
    string $workspaceName,
    string $loginUrl
): array
```

Returns: `['sent' => bool, 'error' => string|null]`

Logic:
1. Set recipient: `$this->mail->addAddress($toEmail, $displayName)`
2. Set subject: `"You've been invited to {$workspaceName}"`
3. Load the HTML template from `__DIR__ . '/../Mail/templates/invite.html'`
4. Replace placeholders in template:
   - `{{WORKSPACE_NAME}}` → `$workspaceName`
   - `{{DISPLAY_NAME}}` → `$displayName`
   - `{{EMAIL}}` → `$toEmail`
   - `{{TEMPORARY_PASSWORD}}` → `$temporaryPassword`
   - `{{LOGIN_URL}}` → `$loginUrl`
5. Set body: `$this->mail->Body = $processedTemplate`
6. Set alt body (plain text fallback):
   ```
   Hi {displayName},

   You've been invited to {workspaceName}.

   Login URL: {loginUrl}
   Email: {toEmail}
   Temporary password: {temporaryPassword}

   You'll be asked to change your password on first login.
   ```
7. Try `$this->mail->send()`:
   - On success: return `['sent' => true, 'error' => null]`
   - On failure: log error with `error_log('Mailer error: ' . $this->mail->ErrorInfo)`, return `['sent' => false, 'error' => $this->mail->ErrorInfo]`
8. Always call `$this->mail->clearAddresses()` after sending (in a finally block) so the instance can be reused

**Important:** The method must NEVER throw. Wrap everything in try/catch. Email failure must not break the invite flow.

**Static convenience method — `isConfigured()`:**

```php
public static function isConfigured(): bool
{
    return !empty($_ENV['SMTP_HOST'])
        && !empty($_ENV['SMTP_USER'])
        && !empty($_ENV['SMTP_PASS'])
        && !empty($_ENV['SMTP_FROM_EMAIL']);
}
```

This allows the invite endpoint to skip email sending entirely if SMTP is not configured (local development, for example).

---

### 2. Create `api/src/Mail/templates/invite.html`

Simple, clean HTML email template. Must render well in all major email clients (Gmail, Outlook, Apple Mail). Use inline CSS only — email clients strip `<style>` tags.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You've been invited to {{WORKSPACE_NAME}}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 480px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">

          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center;">
              <h1 style="margin: 0; font-size: 20px; font-weight: 600; color: #18181b;">
                Welcome to {{WORKSPACE_NAME}}
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 0 32px 24px;">
              <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #3f3f46;">
                Hi {{DISPLAY_NAME}},
              </p>
              <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.6; color: #3f3f46;">
                You've been invited to join <strong>{{WORKSPACE_NAME}}</strong>. Use the credentials below to log in.
              </p>

              <!-- Credentials box -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5; border-radius: 6px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <p style="margin: 0 0 8px; font-size: 13px; color: #71717a;">Email</p>
                    <p style="margin: 0 0 16px; font-size: 14px; font-weight: 500; color: #18181b; font-family: monospace;">{{EMAIL}}</p>
                    <p style="margin: 0 0 8px; font-size: 13px; color: #71717a;">Temporary Password</p>
                    <p style="margin: 0; font-size: 14px; font-weight: 500; color: #18181b; font-family: monospace;">{{TEMPORARY_PASSWORD}}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA Button -->
          <tr>
            <td style="padding: 0 32px 24px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center;">
                    <a href="{{LOGIN_URL}}" style="display: inline-block; padding: 10px 24px; background-color: #18181b; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 500;">
                      Log In
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer note -->
          <tr>
            <td style="padding: 0 32px 32px;">
              <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #a1a1aa;">
                You'll be asked to change your password when you first log in.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

**Design rationale:** Uses table-based layout for email client compatibility. Colors match the JamWork design system's zinc palette (neutral grays). Inline styles only. No images, no external resources. Button uses dark background matching the app's primary button style. Minimal — no branding beyond workspace name.

---

### 3. Create `api/src/Routes/AdminRoutes.php`

All admin user management endpoints. Register as a Slim route group under `/admin`. Every route in this group requires both AuthMiddleware and AdminMiddleware.

```
Namespace: JamWork\Routes
Class: AdminRoutes

Static method:
  register(App $app): void
    - Creates route group '/admin'
    - Applies AdminMiddleware to the group (runs AFTER AuthMiddleware)
    - Applies AuthMiddleware to the group
```

**Middleware ordering:** Slim middleware executes LIFO. Chain on the group:

```php
$app->group('/admin', function (RouteCollectorProxy $group) {
    // ... route definitions
})->add(new AdminMiddleware())->add(new AuthMiddleware());
```

AuthMiddleware runs first (last added), AdminMiddleware runs second. Correct order.

#### Endpoints

---

**POST /admin/invite**

Create a new user account and optionally send an invite email.

Request body:
```json
{
  "email": "user@example.com",
  "displayName": "New User",
  "password": "temporarypass123"
}
```

Validation:
- `email`: `required|email`
- `displayName`: `required|min:1|max:100`
- `password`: `optional|min:10`

Logic:
1. Lowercase and trim email
2. Check if email already exists. If yes: return 409 `{ "error": "User with this email already exists" }`
3. If `password` is provided, use it. If not, generate a random 16-character hex string: `bin2hex(random_bytes(8))`
4. Hash the password (bcrypt, cost 12) via `Auth::hashPassword()`
5. Generate UUID via `Ramsey\Uuid\Uuid::uuid4()->toString()`
6. Insert user with `role='member'`, `must_reset_password=1`
7. **Attempt to send invite email:**
   a. Check `Mailer::isConfigured()`. If false, skip email (`emailSent = false`, no error).
   b. If configured:
      - Get workspace name: query `workspace_settings` for `key = 'workspace_name'`, default to `'JamWork'` if not found
      - Build login URL: `$_ENV['APP_URL'] . '/login'`
      - Instantiate `Mailer` and call `sendInviteEmail()`
      - Capture result: `['sent' => bool, 'error' => string|null]`
   c. Set `$emailSent` based on result
8. Return 201:
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "displayName": "New User",
    "role": "member"
  },
  "temporaryPassword": "temporarypass123",
  "emailSent": true,
  "message": "Invitation sent"
}
```

If email failed:
```json
{
  "user": { ... },
  "temporaryPassword": "temporarypass123",
  "emailSent": false,
  "message": "Invitation sent"
}
```

**Important:**
- Always return `temporaryPassword` in the response — whether admin-provided or auto-generated. The frontend displays this as a fallback.
- The `message` field is always `"Invitation sent"` regardless of email success/failure (matches v1).
- `emailSent` is a new field. The current frontend ignores unknown response fields, so this is safe. A future CC prompt will update the frontend to display email status.
- Email failure must NEVER prevent user creation. The user account is always created first, email is attempted second.
- If email sending throws unexpectedly (despite Mailer's internal try/catch), catch it in the route handler and set `emailSent = false`. Belt and suspenders.

---

**PUT /admin/transfer**

Transfer admin rights to another user. Current admin becomes a member. Uses a MySQL transaction.

Request body:
```json
{ "targetUserId": "uuid" }
```

Validation:
- `targetUserId`: `required|uuid`

Logic:
1. Get current admin's ID from request attribute (`$request->getAttribute('userId')`)
2. If `targetUserId === currentAdminId`: return 400 `{ "error": "Cannot transfer admin to yourself" }`
3. Find target user by ID. If not found: return 404 `{ "error": "Target user not found" }`
4. Execute in a transaction (`Database::getInstance()->beginTransaction()`, etc.):
   a. UPDATE current admin: set `role = 'member'`
   b. UPDATE target user: set `role = 'admin'`
   c. Commit
5. Return 200:
```json
{
  "message": "Admin rights transferred",
  "newAdmin": {
    "id": "uuid",
    "email": "user@example.com",
    "displayName": "New Admin"
  }
}
```

**Important:** On transaction failure, rollback and return 500 `{ "error": "Failed to transfer admin rights" }`.

---

**PUT /admin/users/{id}/reset-password**

Reset a user's password. Generates a new temporary password and sets `mustResetPassword = true`.

Route parameter: `{id}` — user UUID

No request body.

Logic:
1. Get admin's own ID from request attribute
2. If `:id === adminId`: return 400 `{ "error": "Cannot reset your own password here. Use the settings page." }`
3. Validate `:id` is a valid UUID format. If not: return 400 `{ "error": "id must be a valid UUID" }`
4. Find target user by ID. If not found: return 404 `{ "error": "User not found" }`
5. Generate temporary password: `bin2hex(random_bytes(8))` (16 hex chars)
6. Hash password via `Auth::hashPassword()`
7. UPDATE user: set `password_hash`, set `must_reset_password = 1`
8. Return 200:
```json
{
  "temporaryPassword": "a1b2c3d4e5f6g7h8",
  "message": "Password reset successfully"
}
```

---

**PUT /admin/users/{id}**

Update a user's profile (email and/or displayName). Admin cannot edit their own profile here.

Route parameter: `{id}` — user UUID

Request body (all fields optional):
```json
{
  "email": "updated@example.com",
  "displayName": "Updated Name"
}
```

Validation:
- `email`: `optional|email`
- `displayName`: `optional|min:1|max:100`

Logic:
1. Get admin's own ID from request attribute
2. If `:id === adminId`: return 400 `{ "error": "Cannot edit your own profile here. Use the settings page." }`
3. Validate `:id` is a valid UUID format. If not: return 400 `{ "error": "id must be a valid UUID" }`
4. Find target user by ID. If not found: return 404 `{ "error": "User not found" }`
5. If `email` provided and different from current:
   a. Lowercase and trim
   b. Check if another user has this email. If yes: return 409 `{ "error": "A user with this email already exists" }`
   c. Add to updates
6. If `displayName` provided: trim and add to updates
7. If no updates: return the current user data unchanged (200, not an error)
8. Execute UPDATE
9. Fetch updated user and return 200:
```json
{
  "user": {
    "id": "uuid",
    "email": "updated@example.com",
    "displayName": "Updated Name",
    "role": "member"
  }
}
```

**Pattern:** Follow the same dynamic SQL building pattern used in `PUT /auth/profile` in AuthRoutes.php — build `$updates[]` array and `$params` array, then `implode(', ', $updates)`.

---

**DELETE /admin/users/{id}**

Delete a user. Reassigns their owned entities (projects, tasks, sprints, milestones, labels, task links) to the admin performing the deletion. Uses a MySQL transaction.

Route parameter: `{id}` — user UUID

No request body.

Logic:
1. Get admin's own ID from request attribute
2. If `:id === adminId`: return 400 `{ "error": "Cannot delete yourself" }`
3. Validate `:id` is a valid UUID format. If not: return 400 `{ "error": "id must be a valid UUID" }`
4. Find target user by ID. If not found: return 404 `{ "error": "User not found" }`
5. If target user's role is `'admin'`: return 403 `{ "error": "Cannot delete an admin user" }`
6. Execute in a transaction:
   a. UPDATE `projects` SET `created_by_id = :adminId` WHERE `created_by_id = :userId`
   b. UPDATE `tasks` SET `created_by_id = :adminId` WHERE `created_by_id = :userId`
   c. UPDATE `sprints` SET `created_by_id = :adminId` WHERE `created_by_id = :userId`
   d. UPDATE `milestones` SET `created_by_id = :adminId` WHERE `created_by_id = :userId`
   e. UPDATE `labels` SET `created_by_id = :adminId` WHERE `created_by_id = :userId`
   f. UPDATE `task_links` SET `created_by_id = :adminId` WHERE `created_by_id = :userId`
   g. DELETE FROM `task_assignees` WHERE `user_id = :userId`
   h. DELETE FROM `users` WHERE `id = :userId`
   i. Commit
7. Return 200: `{ "message": "User deleted" }`

**Important:**
- The reassignment must happen BEFORE the user delete because of FK constraints (`ON DELETE RESTRICT` on `created_by_id`).
- `task_assignees` uses `ON DELETE CASCADE` on `user_id`, but explicitly deleting them in the transaction is cleaner and matches v1 behavior.
- On transaction failure, rollback and return 500 `{ "error": "Failed to delete user" }`.

---

### 4. Create `api/src/Routes/WorkspaceSettingsRoutes.php`

Workspace settings endpoints. Register as a Slim route group under `/workspace-settings`.

```
Namespace: JamWork\Routes
Class: WorkspaceSettingsRoutes

Static method:
  register(App $app): void
    - Creates route group '/workspace-settings'
    - GET requires AuthMiddleware only (any user can read)
    - PUT requires both AuthMiddleware and AdminMiddleware
```

**Route-level middleware:** Because GET and PUT have different middleware requirements, apply middleware per-route (not on the group). Follow the same pattern as AuthRoutes.php where `->add(new AuthMiddleware())` is chained on individual routes.

#### Endpoints

---

**GET /workspace-settings**

Get workspace name. Accessible to any authenticated user. If no workspace name exists, create the default.

No request body.

Logic:
1. Query: `SELECT * FROM workspace_settings WHERE \`key\` = 'workspace_name'`
2. If no row found:
   a. Generate UUID
   b. INSERT: `key = 'workspace_name'`, `value = 'TeamTask'` (default name, matches v1)
   c. Return the newly created value
3. Return 200:
```json
{ "workspaceName": "TeamTask" }
```

**Important:** The `key` column name conflicts with MySQL reserved word. Always backtick-quote it in queries: `` `key` ``.

---

**PUT /workspace-settings**

Update workspace name. Admin only.

Request body:
```json
{ "name": "My Workspace" }
```

Validation:
- `name`: `required|min:1|max:50`

Logic:
1. Trim the name value
2. Try to UPDATE: `UPDATE workspace_settings SET value = :value WHERE \`key\` = 'workspace_name'`
3. If no row was updated (rowCount() === 0), INSERT instead (upsert pattern):
   a. Generate UUID
   b. INSERT: `key = 'workspace_name'`, `value = trimmed name`
4. Return 200:
```json
{ "workspaceName": "My Workspace" }
```

---

### 5. Wire Routes into `api/index.php`

Add both route registrations to `index.php`, AFTER `AuthRoutes::register($app)` and BEFORE `$app->run()`:

```php
use JamWork\Routes\AdminRoutes;
use JamWork\Routes\WorkspaceSettingsRoutes;

// ... existing code ...

AuthRoutes::register($app);
AdminRoutes::register($app);
WorkspaceSettingsRoutes::register($app);

// Future route groups will be added here (ProjectRoutes, TaskRoutes, etc.)
```

Add the `use` statements at the top of the file with the existing imports.

---

## Route Parameter Validation Helper

Multiple admin endpoints need to validate that a route parameter (`:id`) is a valid UUID. Rather than duplicating this check in every handler, create a small helper pattern.

**Option chosen: inline validation.** Each handler that takes `:id` validates inline at the top of the handler function:

```php
$id = $args['id'] ?? '';
if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $id)) {
    $response->getBody()->write(json_encode(['error' => 'id must be a valid UUID']));
    return $response->withHeader('Content-Type', 'application/json')->withStatus(400);
}
```

This is simpler than creating a new middleware for parameter validation and only applies to 3 endpoints. If Phase 4 introduces many parameterized routes, we can extract to middleware then.

**Slim 4 route parameters:** In Slim 4 route handlers, the `$args` array is passed as the third argument to the callback:

```php
$group->put('/users/{id}', function (Request $request, Response $response, array $args) {
    $id = $args['id'];
    // ...
});
```

---

## Response Format Conventions

Follow the same conventions established in CC04:

**Success with user object:** `{ "user": { ... } }` — id, email, displayName, role (no passwordHash, no mustResetPassword unless the endpoint specifically concerns it)
**Success with message:** `{ "message": "..." }`
**Validation errors:** `{ "errors": [{ "field": "email", "message": "..." }] }` — 400
**Auth errors:** `{ "error": "..." }` — 401 (singular "error")
**Forbidden:** `{ "error": "..." }` — 403
**Not found:** `{ "error": "..." }` — 404
**Conflict:** `{ "error": "..." }` — 409
**Server error:** `{ "error": "..." }` — 500

**camelCase in JSON:** All response keys use camelCase (matching JavaScript convention). Database columns use snake_case. Map in the response: `display_name` → `displayName`, `must_reset_password` → `mustResetPassword`, `created_by_id` → `createdById`, `workspace_name` → (mapped to `workspaceName` as a response key).

---

## Transaction Pattern

For endpoints that need atomic operations (transfer, delete), use PDO transactions:

```php
$db = Database::getInstance();
try {
    $db->beginTransaction();

    // ... multiple queries ...

    $db->commit();
} catch (\Exception $e) {
    $db->rollBack();
    // return 500 error
}
```

`Database::getInstance()` returns the PDO instance directly. PDO supports `beginTransaction()`, `commit()`, and `rollBack()` natively.

---

## Verification

After implementing all files, run these tests in order:

**Prerequisites:** API must be running with a database that has at least the admin user from CC04 testing.

```bash
cd api && php -S localhost:8080 -t . index.php
```

If starting fresh, create the admin user first:
```bash
curl -X POST http://localhost:8080/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@test.com","password":"testpassword123","displayName":"Admin User"}' \
  -c cookies.txt -v
```

---

**1. Login as admin:**
```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@test.com","password":"testpassword123"}' \
  -c cookies.txt -v
```
Expected: 200 with user object

**2. Test invite (create new user with password):**
```bash
curl -X POST http://localhost:8080/api/admin/invite \
  -H 'Content-Type: application/json' \
  -d '{"email":"member@test.com","displayName":"Team Member","password":"temporary1234"}' \
  -b cookies.txt -v
```
Expected: 201 with user object, `temporaryPassword: "temporary1234"`, `emailSent: true|false`, `message: "Invitation sent"`

**3. Test invite — verify emailSent field is present:**
The response from test 2 MUST include `"emailSent"` as a boolean. If SMTP is not configured in `.env`, it should be `false`. If SMTP is configured and working, it should be `true`.

**4. Test invite duplicate email:**
```bash
curl -X POST http://localhost:8080/api/admin/invite \
  -H 'Content-Type: application/json' \
  -d '{"email":"member@test.com","displayName":"Duplicate","password":"temporary1234"}' \
  -b cookies.txt -v
```
Expected: 409 `{ "error": "User with this email already exists" }`

**5. Test invite without password (auto-generate):**
```bash
curl -X POST http://localhost:8080/api/admin/invite \
  -H 'Content-Type: application/json' \
  -d '{"email":"member2@test.com","displayName":"Auto Pass User"}' \
  -b cookies.txt -v
```
Expected: 201 with `temporaryPassword` being a 16-character hex string, `emailSent` present

**6. Test list users (verify new users appear):**
```bash
curl http://localhost:8080/api/auth/users -b cookies.txt
```
Expected: 200 with 3 users (admin + 2 invited members)

**7. Test admin reset-password for a member:**
First, get member's user ID from the /auth/users response above. Then:
```bash
curl -X PUT http://localhost:8080/api/admin/users/MEMBER_UUID/reset-password \
  -b cookies.txt -v
```
Expected: 200 with `temporaryPassword` (16-char hex) and `message: "Password reset successfully"`

**8. Test admin reset own password (should be blocked):**
Get admin's UUID from /auth/users, then:
```bash
curl -X PUT http://localhost:8080/api/admin/users/ADMIN_UUID/reset-password \
  -b cookies.txt -v
```
Expected: 400 `{ "error": "Cannot reset your own password here. Use the settings page." }`

**9. Test admin edit user:**
```bash
curl -X PUT http://localhost:8080/api/admin/users/MEMBER_UUID \
  -H 'Content-Type: application/json' \
  -d '{"displayName":"Updated Member Name"}' \
  -b cookies.txt -v
```
Expected: 200 with updated user object

**10. Test workspace settings GET (first call creates default):**
```bash
curl http://localhost:8080/api/workspace-settings -b cookies.txt
```
Expected: 200 `{ "workspaceName": "TeamTask" }`

**11. Test workspace settings PUT:**
```bash
curl -X PUT http://localhost:8080/api/workspace-settings \
  -H 'Content-Type: application/json' \
  -d '{"name":"JamWork Team"}' \
  -b cookies.txt -v
```
Expected: 200 `{ "workspaceName": "JamWork Team" }`

**12. Test workspace settings GET (verify update persisted):**
```bash
curl http://localhost:8080/api/workspace-settings -b cookies.txt
```
Expected: 200 `{ "workspaceName": "JamWork Team" }`

**13. Test transfer admin:**
```bash
curl -X PUT http://localhost:8080/api/admin/transfer \
  -H 'Content-Type: application/json' \
  -d '{"targetUserId":"MEMBER_UUID"}' \
  -b cookies.txt -v
```
Expected: 200 with `message: "Admin rights transferred"` and `newAdmin` object

**14. Test admin endpoints as non-admin (current user is now member):**
```bash
curl -X POST http://localhost:8080/api/admin/invite \
  -H 'Content-Type: application/json' \
  -d '{"email":"nope@test.com","displayName":"Nope","password":"temporary1234"}' \
  -b cookies.txt -v
```
Expected: 403 `{ "error": "Admin access required" }`

**15. Login as new admin and test delete:**
```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"member@test.com","password":"temporary1234"}' \
  -c cookies.txt -v
```
Note: This user has `mustResetPassword=true`, so the frontend would redirect to reset-password. But the login endpoint itself works. If login succeeds, test delete:
```bash
curl -X DELETE http://localhost:8080/api/admin/users/MEMBER2_UUID \
  -b cookies.txt -v
```
Expected: 200 `{ "message": "User deleted" }`

**16. Test delete self (should be blocked):**
```bash
curl -X DELETE http://localhost:8080/api/admin/users/CURRENT_ADMIN_UUID \
  -b cookies.txt -v
```
Expected: 400 `{ "error": "Cannot delete yourself" }`

**17. Test workspace settings PUT without admin (should be blocked):**
Login as the demoted member first:
```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@test.com","password":"testpassword123"}' \
  -c cookies.txt -v
```
Then:
```bash
curl -X PUT http://localhost:8080/api/workspace-settings \
  -H 'Content-Type: application/json' \
  -d '{"name":"Unauthorized Change"}' \
  -b cookies.txt -v
```
Expected: 403 `{ "error": "Admin access required" }`

**18. Test workspace settings GET as non-admin (should succeed):**
```bash
curl http://localhost:8080/api/workspace-settings -b cookies.txt
```
Expected: 200 (any authenticated user can read workspace name)

---

## Files Created/Modified

| File | Action |
|------|--------|
| `api/src/Lib/Mailer.php` | Created — PHPMailer SMTP wrapper with graceful failure |
| `api/src/Mail/templates/invite.html` | Created — HTML email template for invitations |
| `api/src/Routes/AdminRoutes.php` | Created — 5 admin endpoints (invite with email, transfer, reset-password, edit user, delete user) |
| `api/src/Routes/WorkspaceSettingsRoutes.php` | Created — 2 workspace settings endpoints |
| `api/index.php` | Modified — add AdminRoutes and WorkspaceSettingsRoutes registration + use statements |

## Files NOT Modified

- Everything in `client/` — no frontend changes (emailSent field is ignored by current frontend)
- Everything in `/Users/dorenberge/WorkInProgress/VIBE/JamWork/` — v1 is READ-ONLY
- `api/src/Routes/AuthRoutes.php` — already patched by JW-CC05a
- `api/src/Lib/Auth.php`, `api/src/Lib/Database.php`, `api/src/Lib/Validator.php` — no changes
- `api/src/Middleware/` — no changes (AuthMiddleware and AdminMiddleware already exist from CC04)
- `api/src/Models/` — not used yet (queries inline in route handlers, same pattern as AuthRoutes)
- `api/migrations/` — schema already complete from CC03
- `api/composer.json` — PHPMailer already declared and installed
- `api/.env.example` — SMTP vars already present from CC02
- `api/.env` — developer must fill in SMTP credentials manually for email to work

---

## Environment Variables for Email

The following vars in `.env` must be set for email sending to work. If any of SMTP_HOST, SMTP_USER, SMTP_PASS, or SMTP_FROM_EMAIL are empty, email sending is skipped gracefully (user still created, `emailSent: false` returned).

```
SMTP_HOST=mail.yourdomain.com
SMTP_PORT=465
SMTP_USER=noreply@yourdomain.com
SMTP_PASS=your-smtp-password
SMTP_FROM_EMAIL=noreply@yourdomain.com
SMTP_FROM_NAME=JamWork

APP_URL=https://tasks.yourdomain.com
```

For SiteGround specifically:
- SMTP host is typically `mail.yourdomain.com`
- Port 465 with SSL (default) or 587 with STARTTLS
- Create a dedicated email account in cPanel (e.g., `noreply@yourdomain.com`)
- APP_URL is the full URL to the frontend (used to construct the login link in invite emails)

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| PHPMailer via SiteGround SMTP | PRD FR-013 requires it. PHPMailer is already in composer.json. SiteGround provides SMTP gateway on all hosting plans. |
| Graceful email failure | PRD §7.1 Error Case 2: user account created even if email fails. Admin always gets temporaryPassword in response as fallback. |
| `emailSent` response field (Option B) | Future-proofs the API response. Frontend currently ignores it. A future CC prompt will update admin.tsx to display email status. No frontend breakage. |
| `Mailer::isConfigured()` static check | Allows invite endpoint to skip email entirely in local dev without SMTP configured. No error, just `emailSent: false`. |
| Port-based encryption selection | SiteGround uses port 465 (SSL) by default. Also supports 587 (STARTTLS). Mailer auto-selects based on port value. |
| Inline CSS in email template | Email clients (especially Outlook, Gmail) strip `<style>` tags. Inline styles are the only reliable approach. |
| Table-based email layout | Standard email HTML practice for cross-client compatibility. Div-based layouts break in Outlook. |
| Workspace name in invite email subject | Personalizes the email. Requires a DB query for workspace name — acceptable overhead on an infrequent operation. |
| Inline UUID validation for route params | Only 3 endpoints need it. Middleware extraction deferred to Phase 4 if many parameterized routes emerge. |
| Workspace default name "TeamTask" | Matches v1 exactly. Created on first GET if no row exists. |
| Workspace settings upsert pattern | UPDATE then INSERT-if-no-rows-affected. Simpler than MySQL INSERT...ON DUPLICATE KEY UPDATE for a single-row table. |
| Transaction for transfer and delete | Both operations modify multiple rows that must be atomic. Matches v1 Prisma `$transaction` pattern. |
| Reassign then delete (not cascade) | `created_by_id` FK uses `ON DELETE RESTRICT` by design. Must explicitly reassign ownership before deleting the user. |
| Group middleware for /admin (not per-route) | All 5 admin routes require the same auth + admin check. Applying once on the group is cleaner than chaining on each route. |
| Per-route middleware for /workspace-settings | GET and PUT have different auth requirements (auth-only vs auth+admin). Must be per-route. |
