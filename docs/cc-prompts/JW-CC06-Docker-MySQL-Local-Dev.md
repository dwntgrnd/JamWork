# JW-CC06 — Docker MySQL for Local Development

**Context:** JamWork-v2 Phase 3 verification. The PHP API (`api/`) runs locally via PHP's built-in dev server (`php -S`). MySQL is needed for the API to connect to. This prompt sets up a Docker Compose configuration for a local MySQL 8.0 container, seeded with the existing migration schema.

**Prerequisites:**
- Docker Desktop for Mac installed and running
- PHP 8.4 installed locally (already confirmed)
- Composer dependencies installed (`api/vendor/` exists)

**Existing files to reference:**
- Migration schema: `api/migrations/001_initial_schema.sql`
- Environment template: `api/.env.example`
- Environment config: `api/.env` (already exists, needs DB credentials filled in)
- API entry point: `api/index.php`

---

## Tasks

### 1. Create `docker-compose.yml` in project root

Location: `/Users/dorenberge/WorkInProgress/VIBE/JamWork_v2/docker-compose.yml`

```yaml
version: '3.8'

services:
  mysql:
    image: mysql:8.0
    container_name: jamwork-mysql
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: jamwork_root
      MYSQL_DATABASE: jamwork
      MYSQL_USER: jamwork_user
      MYSQL_PASSWORD: jamwork_pass
    ports:
      - "3306:3306"
    volumes:
      - jamwork-mysql-data:/var/lib/mysql
      - ./api/migrations:/docker-entrypoint-initdb.d:ro
    command: >
      --default-authentication-plugin=mysql_native_password
      --character-set-server=utf8mb4
      --collation-server=utf8mb4_unicode_ci

volumes:
  jamwork-mysql-data:
```

**Key details:**
- The `docker-entrypoint-initdb.d` mount auto-runs `001_initial_schema.sql` on first container creation (when the data volume is empty). This seeds all 11 tables.
- Named volume `jamwork-mysql-data` persists data between container restarts.
- Port 3306 maps to localhost:3306 (matches `.env.example` default `DB_PORT=3306`).
- `mysql_native_password` ensures compatibility with PHP's PDO MySQL driver.
- Credentials are local dev only — not used in production.

### 2. Update `api/.env` with Docker MySQL credentials

Set the following values in the existing `api/.env` file:

```
DB_HOST=127.0.0.1
DB_NAME=jamwork
DB_USER=jamwork_user
DB_PASS=jamwork_pass
DB_PORT=3306
```

**Important:** Use `127.0.0.1` instead of `localhost` for `DB_HOST`. PHP's PDO with `localhost` tries a Unix socket connection, which won't reach the Docker container. `127.0.0.1` forces TCP, which hits the mapped port correctly.

Also set a JWT_SECRET if not already set:

```
JWT_SECRET=local-dev-secret-change-in-production
```

Do NOT modify any other values in `.env`. Leave SMTP vars empty (email sending is gracefully skipped when unconfigured).

### 3. Add Docker entries to `.gitignore`

Append to the project root `.gitignore` (create if it doesn't exist at `/Users/dorenberge/WorkInProgress/VIBE/JamWork_v2/.gitignore`):

```
# Docker
docker-compose.override.yml
```

Note: `docker-compose.yml` itself IS committed — it's part of the dev setup. Only local overrides are ignored.

The `api/.gitignore` already excludes `.env`, so credentials are safe.

### 4. Create `docs/LOCAL-DEV.md`

Location: `/Users/dorenberge/WorkInProgress/VIBE/JamWork_v2/docs/LOCAL-DEV.md`

```markdown
# JamWork-v2 — Local Development Setup

## Prerequisites

- PHP 8.2+ (`php -v` to check)
- Composer (`composer --version` to check)
- Docker Desktop
- Node.js 18+ (for frontend)

## Quick Start

### 1. Start MySQL

```bash
# From project root
docker compose up -d
```

First run automatically creates the `jamwork` database and runs the migration schema.

### 2. Verify MySQL is ready

```bash
docker compose logs mysql
# Look for: "ready for connections"

# Or test connectivity:
docker exec jamwork-mysql mysql -u jamwork_user -pjamwork_pass -e "SHOW TABLES FROM jamwork;"
```

All 11 tables should be listed.

### 3. Configure API environment

Copy `.env.example` to `.env` if you haven't already:

```bash
cp api/.env.example api/.env
```

Set these values in `api/.env`:

```
DB_HOST=127.0.0.1
DB_NAME=jamwork
DB_USER=jamwork_user
DB_PASS=jamwork_pass
DB_PORT=3306
JWT_SECRET=local-dev-secret-change-in-production
```

### 4. Install PHP dependencies

```bash
cd api
composer install
cd ..
```

### 5. Start the API server

```bash
cd api
php -S localhost:8080 -t . index.php
```

Verify: `curl http://localhost:8080/api/health` should return `{"status":"ok","timestamp":...}`

### 6. Start the frontend (separate terminal)

```bash
cd client
npm install
npm run dev
```

Frontend runs on `http://localhost:5173` and proxies API calls to `http://localhost:8080`.

## Common Commands

| Command | Description |
|---------|-------------|
| `docker compose up -d` | Start MySQL in background |
| `docker compose down` | Stop MySQL (data persists) |
| `docker compose down -v` | Stop MySQL AND delete data (fresh start) |
| `docker compose logs -f mysql` | Follow MySQL logs |
| `docker exec -it jamwork-mysql mysql -u jamwork_user -pjamwork_pass jamwork` | MySQL CLI |

## Resetting the Database

To wipe everything and re-run migrations:

```bash
docker compose down -v
docker compose up -d
```

The `-v` flag removes the data volume. On next startup, `001_initial_schema.sql` runs again automatically.

## Port Conflicts

If port 3306 is already in use (e.g., local MySQL installation):

1. Stop the local MySQL service, OR
2. Change the port mapping in `docker-compose.yml`: `"3307:3306"` and update `DB_PORT=3307` in `api/.env`

## Email (Optional)

SMTP is not required for local development. The invite endpoint works without it — `emailSent` will be `false` in responses. To test emails, configure the SMTP variables in `api/.env` (see `.env.example`).
```

---

## Verification

After implementing all files, run these checks in order:

**1. Start the MySQL container:**
```bash
cd /Users/dorenberge/WorkInProgress/VIBE/JamWork_v2
docker compose up -d
```
Expected: Container `jamwork-mysql` starts. First run takes ~30 seconds for initialization.

**2. Wait for MySQL to be ready, then verify tables:**
```bash
docker exec jamwork-mysql mysql -u jamwork_user -pjamwork_pass -e "SHOW TABLES FROM jamwork;"
```
Expected: All 11 tables listed (users, workspace_settings, projects, sprints, milestones, tasks, subtasks, labels, task_assignees, task_labels, task_links).

**3. Start the PHP dev server:**
```bash
cd api
php -S localhost:8080 -t . index.php
```
Expected: Server starts on localhost:8080.

**4. Test health endpoint:**
```bash
curl http://localhost:8080/api/health
```
Expected: `{"status":"ok","timestamp":...}`

**5. Test signup (creates first user as admin):**
```bash
curl -X POST http://localhost:8080/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@test.com","password":"testpassword123","displayName":"Admin User"}' \
  -c cookies.txt -v
```
Expected: 201 with user object, `role: "admin"`.

**6. Test login:**
```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@test.com","password":"testpassword123"}' \
  -c cookies.txt -v
```
Expected: 200 with user object.

**7. Test workspace settings (confirms DB read/write works end-to-end):**
```bash
curl http://localhost:8080/api/workspace-settings -b cookies.txt
```
Expected: 200 `{"workspaceName":"TeamTask"}`

If all 7 pass, the local dev environment is fully operational.

---

## Files Created/Modified

| File | Action |
|------|--------|
| `docker-compose.yml` | Created — MySQL 8.0 container with auto-migration |
| `api/.env` | Modified — DB credentials and JWT_SECRET filled in |
| `docs/LOCAL-DEV.md` | Created — Developer setup documentation |
| `.gitignore` (project root) | Created or appended — Docker override exclusion |

## Files NOT Modified

- `api/.env.example` — Template stays generic
- `api/.gitignore` — Already excludes `.env`
- `api/migrations/001_initial_schema.sql` — Used as-is for seeding
- Everything in `client/` — No frontend changes
- Everything in `/Users/dorenberge/WorkInProgress/VIBE/JamWork/` — v1 is READ-ONLY
