# JamWork

Lightweight task tracking for small teams.

JamWork helps small product teams track tasks, manage sprints, and stay aligned — without the overhead of enterprise project management tools. It's built for teams that want just enough structure to stay organized.

<!-- screenshot: app overview / board view → docs/images/app-overview.png -->

## Features

- **Task board** with drag-and-drop status tracking (To Do → In Progress → Blocked → Review → Done)
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

Installing JamWork for the first time takes about five minutes. You upload the
files, point your browser at the site, and a setup wizard does the rest.

1. **Download** the latest release ZIP from the [Releases](../../releases) page.
2. **Extract** it — you'll get a `jamwork/` folder.
3. **Upload** the *contents* of `jamwork/` to your web server's document root
   (via SFTP or your host's File Manager). You want `index.html` and the `api/`
   folder sitting at the top of your web root — not a nested `jamwork/` folder.
4. **Set permissions** — ensure the `api/` directory is writable (755 on most hosts).
5. **Create a database** — make an empty MySQL database and note its name, user,
   and password.
6. **Run the installer** — visit your site URL. The setup wizard walks you through
   the database connection and your admin account.
7. **Log in** with the admin account you just created.

<!-- screenshot: installer wizard (first step) → docs/images/installer-wizard.png -->

> **Download from Releases, not the green "Code" button.** The repository contains
> development source that isn't structured for direct deployment. The Releases ZIP
> is the ready-to-upload package.

## After Installation

- **Invite your team** from the admin panel (Settings → Team Members).
- **Create a project** to start organizing work.
- **Configure email** (if you skipped it during setup) by editing `api/.env`.

## Updating an existing install

Updating JamWork is a **file swap**: you replace the application code with a newer
release, keep your existing configuration and data, and apply any new database
migrations the release introduces.

**Two files make this safe — and they are never in the release package, so a normal
overwrite leaves them alone:**

- **`api/.env`** — your database credentials and secrets.
- **`api/.installed`** — the marker that tells JamWork it's already set up.

As long as you **overwrite files in place** (rather than deleting and replacing the
`api/` folder), both survive and your update goes smoothly. Your data lives in
MySQL and is never touched by a file swap.

### Steps

1. **Back up your database first — always.** In phpMyAdmin: select your database →
   **Export** → **Custom** → format **SQL** → **Save output to a file**. (Or use
   `mysqldump` if you have shell access.) This is your safety net.

2. **Check the release notes** for the version you're moving to. Note whether it
   lists any **database migrations** (new files under `api/migrations/`). Most
   releases are code-only; some add a migration.

3. **Download and extract** the new release ZIP (same as install) → `jamwork/` folder.

4. **Upload the new files over your existing install — overwrite, don't wipe.**
   - **Recommended (FTP/SFTP):** with a client like FileZilla or Cyberduck, drag the
     *contents* of `jamwork/` into your document root and choose **Overwrite** on
     conflicts. FTP merges directories — it replaces changed files and leaves
     `api/.env` and `api/.installed` in place.
   - **cPanel File Manager:** turn on **Settings → Show Hidden Files** first.
     Upload and extract the ZIP into a *temporary* folder, then copy the new files
     into place so they overwrite the old ones individually.

   > ⚠️ **The one move that breaks an update:** deleting your `api/` folder, or
   > moving the new `api/` folder *on top of* the old one in cPanel (which can
   > replace it wholesale). Either destroys `api/.env` and `api/.installed`. Always
   > merge/overwrite in place — never delete-then-replace the `api/` directory.

5. **Apply any new database migrations.** If the release notes list new migration
   files (e.g. `api/migrations/004_*.sql`), open each one, copy its SQL, and run it
   in phpMyAdmin (the **SQL** tab, with your database selected), **in order**.
   Migrations are additive and backward-compatible, so they're safe to apply before
   or after the file swap.

   > ⚠️ **Do not run `install.php` to update.** The installer is for fresh installs
   > only — re-running it against an existing database will error on duplicate
   > columns. Apply only the new migrations by hand.

6. **Refresh and verify.** Hard-refresh the site (**Ctrl/Cmd + Shift + R**) so your
   browser loads the new frontend. Confirm: the app loads (no setup wizard), you can
   log in, and the new features are present.

7. **(Optional) Tidy old assets.** The frontend ships hashed filenames
   (e.g. `assets/index-abc123.js`). After updating, the previous version's
   `assets/index-*.js` / `.css` linger as harmless orphans — you can delete the old
   ones if you like a clean directory.

## Troubleshooting

**The setup wizard appears after an update.**
Your `api/.installed` file went missing during the file swap (usually from
replacing the whole `api/` folder). Your data is fine. Recreate the file: in
`api/`, create an empty file named `.installed` (any contents work — JamWork only
checks that it exists). Refresh the site and the app returns.

**The site shows a 500 error or blank page after an update.**
Your `api/.env` is probably missing or unreadable (also lost when the `api/` folder
is replaced). Restore it from a backup, or recreate it from `api/.env.example` with
your database credentials and a `JWT_SECRET`. *Note:* if you generate a new
`JWT_SECRET`, everyone is signed out and must log in again.

**Rolling back an update.**
Re-deploy the previous release's files the same way you deployed the new ones.
Because migrations are additive and backward-compatible, the older code keeps
working against the newer schema — you generally don't need to undo migrations.
Worst case, restore the database from the backup you took in step 1.

## Reinstalling

If you need to start over from the setup wizard:

1. Delete `api/.installed`
2. Delete `api/.env`
3. Visit your site URL — the installer will appear again.

> **Note:** Reinstalling does not delete existing database tables. The installer
> uses `CREATE TABLE IF NOT EXISTS`, so existing data is preserved. To fully reset,
> also drop the database tables manually.

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
