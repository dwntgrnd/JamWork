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
