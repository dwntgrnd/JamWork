# JW-CC05a — AuthRoutes Patch (Validation + DateTime Fix)

**Context:** JamWork-v2 Phase 3. PRD compliance audit found divergences between the implemented AuthRoutes.php (from JW-CC04) and project standards. This prompt makes targeted fixes only — no new files, no restructuring.

**Target file:** `api/src/Routes/AuthRoutes.php`

**No other files are modified.**

---

## Fixes

### Fix 1: Password minimum length — `min:8` → `min:10` (3 occurrences)

Project Decision #8 (JW-S01): password minimum is 10 characters, matching frontend validation. The CC04 prompt spec said `min:10` but the implementation used `min:8`.

**POST /auth/signup** — find:
```php
'password' => 'required|min:8',
```
Replace with:
```php
'password' => 'required|min:10',
```

**PUT /auth/reset-password** — find:
```php
'newPassword' => 'required|min:8',
```
Replace with:
```php
'newPassword' => 'required|min:10',
```

**PUT /auth/change-password** — find:
```php
'newPassword' => 'required|min:8',
```
Replace with:
```php
'newPassword' => 'required|min:10',
```

### Fix 2: displayName max length — `max:255` → `max:100` (2 occurrences)

v1 validation uses `max:100`. Frontend `admin.tsx` uses `maxLength={100}`. Frontend `settings.tsx` and signup form also use 100. The CC04 prompt spec said `max:100` but the implementation used `max:255`.

**POST /auth/signup** — find:
```php
'displayName' => 'required|min:1|max:255',
```
Replace with:
```php
'displayName' => 'required|min:1|max:100',
```

**PUT /auth/profile** — find:
```php
'displayName' => 'optional|min:1|max:255',
```
Replace with:
```php
'displayName' => 'optional|min:1|max:100',
```

### Fix 3: createdAt ISO 8601 format in GET /auth/users (1 occurrence)

CC04's own design decisions section states: "All datetime values returned in JSON must be ISO 8601 format." The current implementation returns raw MySQL TIMESTAMP format (`2026-03-13 14:30:00`). It must be ISO 8601 (`2026-03-13T14:30:00+00:00`).

**GET /auth/users** — in the `array_map` callback, find:
```php
'createdAt' => $u['created_at'],
```
Replace with:
```php
'createdAt' => date('c', strtotime($u['created_at'])),
```

The `date('c')` function outputs ISO 8601 format. Since `date_default_timezone_set('UTC')` is already set in `index.php`, this will produce correct UTC timestamps.

---

## Verification

Start the API:
```bash
cd api && php -S localhost:8080 -t . index.php
```

### Test 1: Password min:10 enforcement on change-password

Login first:
```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@test.com","password":"testpassword123"}' \
  -c cookies.txt -v
```

Then attempt a short password:
```bash
curl -X PUT http://localhost:8080/api/auth/change-password \
  -H 'Content-Type: application/json' \
  -d '{"currentPassword":"testpassword123","newPassword":"short9ch"}' \
  -b cookies.txt -v
```
**Expected:** 400 with validation error containing "at least 10 characters"

Then attempt a valid password:
```bash
curl -X PUT http://localhost:8080/api/auth/change-password \
  -H 'Content-Type: application/json' \
  -d '{"currentPassword":"testpassword123","newPassword":"validpassword10"}' \
  -b cookies.txt -v
```
**Expected:** 200 `{ "message": "Password changed successfully" }`

(Change it back for future tests:)
```bash
curl -X PUT http://localhost:8080/api/auth/change-password \
  -H 'Content-Type: application/json' \
  -d '{"currentPassword":"validpassword10","newPassword":"testpassword123"}' \
  -b cookies.txt -v
```

### Test 2: displayName max:100 enforcement on profile update

```bash
curl -X PUT http://localhost:8080/api/auth/profile \
  -H 'Content-Type: application/json' \
  -d '{"displayName":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}' \
  -b cookies.txt -v
```
(That's 103 A's)

**Expected:** 400 with validation error containing "at most 100 characters"

### Test 3: createdAt ISO 8601 format

```bash
curl http://localhost:8080/api/auth/users -b cookies.txt | python3 -m json.tool
```
**Expected:** Each user's `createdAt` field should be in ISO 8601 format: `"2026-03-13T14:30:00+00:00"` (with the `T` separator and timezone offset), NOT MySQL format `"2026-03-13 14:30:00"`.

---

## Files Modified

| File | Action |
|------|--------|
| `api/src/Routes/AuthRoutes.php` | Modified — 6 line changes (3 password min, 2 displayName max, 1 datetime format) |

## Files NOT Modified

Everything else. This is a targeted patch only.

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Password min 10 (not 8) | Decision #8 from JW-S01. Frontend enforces 10. PRD says 8+ but project standard overrides to 10. |
| displayName max 100 (not 255) | v1 validation, frontend `maxLength` attributes, and CC04 spec all say 100. Implementation deviated. |
| `date('c')` for ISO 8601 | PHP's `DATE_ATOM` / `'c'` format constant produces RFC 3339 / ISO 8601. Consistent with UTC timezone set in index.php. |
