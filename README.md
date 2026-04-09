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

1. **Download** — Clone this repository or download and extract the ZIP file
2. **Upload** — Upload all files to your web server's document root (or subdirectory) via SFTP
3. **Set permissions** — Ensure the `api/` directory is writable by the web server (755 on most hosts)
4. **Create a database** — Create an empty MySQL database and a database user with full privileges on it. Note the database name, username, and password.
5. **Run the installer** — Visit your site URL in a browser. The installation wizard will guide you through setup.
6. **Log in** — Use the admin account you created during installation

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

MIT License

Copyright (c) 2026 dwntgrnd

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
