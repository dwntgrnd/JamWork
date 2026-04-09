# JamWork

Lightweight task tracking for small teams.

JamWork helps small product teams track tasks, manage sprints, and stay aligned — without the overhead of enterprise project management tools. It's built for teams that want just enough structure to stay organized.

## Features

- **Task board** with drag-and-drop status tracking (To Do → In Progress → Review → Done)
- **Timeline view** with sprint overlays, milestones, and adjustable zoom (day/week/month)
- **Sprint management** with backlog grooming and task migration on close
- **Project organization** with milestones, labels, and task assignment
- **Subtasks, recurring tasks, and bulk operations**
- **Email notifications** for task assignments, team invitations, and password resets
- **Dark mode** with system preference detection
- **Multi-user** with role-based access (admin and member roles)
- **Self-hosted** — your data stays on your server

## Requirements

- PHP 8.2 or higher
- MySQL 8.0 or higher
- Apache web server with `mod_rewrite` enabled (most shared hosts have this)
- An empty MySQL database

## Installation

1. **Download** the latest release ZIP from the [Releases](../../releases) page
2. **Extract** the ZIP file — you'll get a `jamwork/` folder
3. **Upload** the contents of the `jamwork/` folder to your web server's document root via SFTP
4. **Set permissions** — ensure the `api/` directory is writable (755 on most hosts)
5. **Create a database** — create an empty MySQL database and note the credentials
6. **Run the installer** — visit your site URL. The installation wizard guides you through setup.
7. **Log in** with the admin account you created during installation

> **Note:** Download from **Releases**, not the green "Code" button. The repository contains development files that aren't structured for direct deployment.

## After Installation

- **Invite your team** from the admin panel (Settings → Team Members)
- **Create a project** to start organizing work
- **Configure email** (if you skipped it during setup) by editing `api/.env`

## Reinstalling

If you need to start over:

1. Delete `api/.installed`
2. Delete `api/.env`
3. Visit your site URL — the installer will appear again

> **Note:** Reinstalling does not delete existing database tables. The installer uses `CREATE TABLE IF NOT EXISTS`, so existing data is preserved. To fully reset, also drop the database tables manually.

## Development Setup

For developers contributing to JamWork:

**Prerequisites:** Node.js 18+, Docker Desktop, Composer

1. Clone the repository
2. `cd api && composer install`
3. `cd ../client && npm install`
4. Start MySQL: `docker compose up -d`
5. Copy `api/.env.example` to `api/.env` and fill in local values
6. Start PHP server: `cd api && php -S localhost:8080 -t . index.php`
7. Start Vite dev server: `cd client && npm run dev`
8. Visit `http://localhost:3000`

See `docs/LOCAL-DEV.md` for detailed development instructions.

## Tech Stack

- **Frontend:** React + TypeScript + Tailwind CSS + shadcn/ui (Vite SPA)
- **Backend:** PHP 8.2 + Slim 4 REST API
- **Database:** MySQL 8.0
- **Auth:** JWT (httpOnly cookies)
- **Email:** PHPMailer over SMTP

## License

[MIT](LICENSE)
