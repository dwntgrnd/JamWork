# JamWork v2 — LAMP Replatform

## Project Overview
Lightweight shared task management app for small remote teams. Re-platform of JamWork v1 from Node.js/Next.js/PostgreSQL to a LAMP-compatible stack for SiteGround shared hosting. Frontend is pixel-identical to v1; backend is rebuilt in PHP.

## ⛔ CRITICAL: v1 Codebase is STRICTLY READ-ONLY

**Path:** `/Users/dorenberge/WorkInProgress/VIBE/JamWork/`

This is the original JamWork codebase. It is a reference resource ONLY. Under NO circumstances should any operation:
- **Create** any file in this directory or its subdirectories
- **Modify** any file in this directory or its subdirectories
- **Delete** any file in this directory or its subdirectories
- **Move or rename** any file in this directory or its subdirectories

This applies to ALL files — source code, config, environment files, lock files, node_modules, everything. The v1 codebase exists solely to inform design decisions, reference frontend patterns, and verify API response shapes. It must remain untouched.

**If you are ever uncertain whether a file path targets v1 or v2, STOP and confirm before proceeding.**

All new work targets `/Users/dorenberge/WorkInProgress/VIBE/JamWork_v2/` exclusively.

## Tech Stack

### Client (`client/`)
- **Build Tool**: Vite 6
- **Framework**: React 19, React Router 7, TypeScript 5
- **Styling**: Tailwind CSS 4, shadcn/ui (Radix primitives), tw-animate-css
- **Font**: Manrope (Google Fonts, `--font-manrope`)
- **DnD**: @hello-pangea/dnd
- **Icons**: lucide-react
- **Toasts**: sonner

### API (`api/`)
- **Runtime**: PHP 8.2+ (Apache/SiteGround shared hosting)
- **Framework**: Slim 4 (PSR-7/PSR-15)
- **Database**: MySQL 8.0 via PDO (prepared statements only)
- **Auth**: JWT (firebase/php-jwt) + password_hash(), httpOnly cookie-based
- **Email**: PHPMailer via SiteGround SMTP
- **UUID**: ramsey/uuid
- **Config**: vlucas/phpdotenv

## Commands

```bash
# Client
cd client
npm run dev              # Vite dev server on :3000 (proxies /api to :8080)
npm run build            # Production build to dist/

# API (local PHP dev server)
cd api
php -S localhost:8080    # Built-in PHP server for local dev
composer install         # Install PHP dependencies
```

## Project Structure

```
client/src/
├── components/
│   ├── ui/              # shadcn primitives (Button, Dialog, etc.)
│   ├── sidebar.tsx      # Main navigation (React Router NavLink)
│   ├── auth-guard.tsx   # Route protection (React Router)
│   ├── task-list.tsx    # List view
│   ├── board-view.tsx   # Kanban board
│   ├── timeline-view.tsx # Gantt-style timeline
│   ├── task-drawer.tsx  # Task create/edit drawer
│   └── [all other components from v1]
├── hooks/               # use-auth, use-theme, use-auto-save, etc.
├── lib/
│   ├── api.ts           # Typed fetch wrappers — base URL: /api
│   ├── style-tokens.ts  # Status/priority/effort color tokens
│   ├── date-utils.ts    # Date formatting and overdue logic
│   └── utils.ts         # cn() helper
├── pages/               # Route components (extracted from v1 app/)
│   ├── LoginPage.tsx
│   ├── ProjectPage.tsx
│   ├── AllTasksPage.tsx
│   ├── MyTasksPage.tsx
│   ├── SprintsPage.tsx
│   ├── TimelinePage.tsx
│   ├── SettingsPage.tsx
│   ├── AdminPage.tsx
│   └── [etc.]
├── router.tsx           # React Router configuration
├── App.tsx              # Root component with providers
├── main.tsx             # Vite entry point
├── styles/
│   └── globals.css      # Design token system (OKLch, CSS variables)
└── types/               # Shared TypeScript types

api/
├── index.php            # Slim 4 entry point
├── .htaccess            # Apache rewrite rules
├── .env                 # Environment config (not committed)
├── composer.json        # PHP dependencies
├── src/
│   ├── Routes/          # Route handlers (one file per domain)
│   ├── Middleware/       # Auth, admin, validation, rate limiting
│   ├── Models/          # Data access layer (PDO)
│   ├── Lib/             # Database, JWT, mailer, validator helpers
│   └── Mail/templates/  # Email templates
└── migrations/          # MySQL DDL scripts
```

## Design System

### Token Architecture
All colors use **OKLch** via CSS custom properties in `globals.css`. Identical to v1 — no changes permitted. No hardcoded Tailwind color classes.

**Core palette:**
- Deep Navy (`oklch(0.22 0.04 265)`) — header, primary
- Teal (`oklch(0.76 0.13 192)`) — interactive/active, focus rings
- Copper (`oklch(0.72 0.15 60)`) — emphasis, CTAs
- Coral (`oklch(0.62 0.20 15)`) — destructive
- Purple (`oklch(0.55 0.16 305)`) — info/tertiary
- Golden (`oklch(0.82 0.16 80)`) — warning

**Token categories (auto light/dark):**
- `--header` / `--header-foreground` / `--header-muted` — dark navy chrome
- `--interactive` / `--emphasis` — teal and copper accent pair
- `--status-{todo,in_progress,review,done}-{bg,fg}` — status chips
- `--priority-{urgent,high,medium,low}` — priority dots
- `--effort-{1,2,4,8}-{bg,fg}` — effort badges
- `--shadow-{xs,sm,md,lg,header}` — navy-tinted (light) / black (dark)

**Usage pattern:**
```tsx
// Correct — semantic token
className="text-destructive"
className="bg-status-in_progress-bg text-status-in_progress-fg"
className="bg-priority-urgent"

// Wrong — hardcoded color
className="text-red-600 dark:text-red-400"
className="bg-blue-600 dark:bg-blue-500"
```

### Style Tokens (`lib/style-tokens.ts`)
Centralized token records for status, priority, and effort styling. All components import from here. Returns CSS-variable-based Tailwind classes — no `dark:` variants needed.

## API Contract

All API endpoints live at `/api/` (same origin, no CORS). Response shapes must be **identical** to v1 Express API. You may READ v1 route files for reference at:
`/Users/dorenberge/WorkInProgress/VIBE/JamWork/server/src/routes/`

**Reminder: reading v1 files for reference is permitted. Modifying them is not. Ever.**

### Endpoint Groups
- `/api/auth/` — signup, login, logout, me, reset-password, profile, change-password, users
- `/api/admin/` — invite, transfer, user CRUD (admin-only)
- `/api/projects/` — CRUD with task counts
- `/api/tasks/` — CRUD, filters, sort, bulk ops, reorder, subtasks, recurrence clone
- `/api/tasks/:taskId/links/` — task link CRUD
- `/api/labels/` — CRUD
- `/api/sprints/` — CRUD, close with task handling, stats
- `/api/milestones/` — CRUD
- `/api/workspace-settings/` — get/set workspace name

### Auth Pattern
- JWT in httpOnly cookie (30-day expiry, secure in production, sameSite=lax)
- `requireAuth` middleware extracts userId from JWT
- `requireAdmin` middleware checks user.role === 'admin'
- All endpoints except signup/login/logout/health require auth

## Database

MySQL 8.0 with 11 tables. Schema translated from v1 Prisma/PostgreSQL. You may READ the v1 schema for reference at:
`/Users/dorenberge/WorkInProgress/VIBE/JamWork/server/prisma/schema.prisma`

Key differences from v1:
- UUIDs stored as `CHAR(36)` (no native UUID type in MySQL)
- `updated_at` uses `ON UPDATE CURRENT_TIMESTAMP`
- All queries via PDO prepared statements — no string interpolation

## Rules

### ⛔ Codebase Boundary (highest priority)
- **NEVER write to `/Users/dorenberge/WorkInProgress/VIBE/JamWork/`** — this is the v1 codebase and is strictly read-only. No creates, no modifications, no deletions, no renames. Not even "harmless" changes like formatting or comments.
- **ALL writes go to `/Users/dorenberge/WorkInProgress/VIBE/JamWork_v2/`** — this is the only valid write target.
- **When in doubt about a path, STOP.** Ask before writing. A wrong write to v1 is unrecoverable.

### Frontend Rules (carried from v1 — no exceptions)
- **Never use left-border accents for active/selected states.** Use background color, text color, or font weight changes instead.
- **No hardcoded Tailwind colors.** Always use CSS variable tokens from `globals.css`.
- **No `dark:` variant classes.** The token system handles light/dark automatically.
- **Destructive actions** use `text-destructive`, `bg-destructive`, or `bg-destructive/10`.
- **Required field asterisks** use `text-destructive`.
- **Error messages** use `text-destructive`. Error backgrounds use `bg-destructive/10`.

### Routing Rules (v2-specific)
- **No Next.js imports.** No `next/link`, `next/navigation`, `next/image`, `next/font`.
- Use React Router: `Link`, `NavLink`, `useNavigate`, `useLocation`, `useParams`, `useSearchParams`.
- `<Link to="...">` not `<Link href="...">`.
- Environment variables use `import.meta.env.VITE_*` not `process.env.NEXT_PUBLIC_*`.

### Backend Rules (v2-specific)
- **PDO prepared statements only.** Never concatenate user input into SQL strings.
- **Response shapes must match v1.** Same JSON keys, same HTTP status codes, same error formats.
- **UUID generation** via `Ramsey\Uuid::uuid4()` — never MySQL `AUTO_INCREMENT` for primary keys.
- **Password hashing** via `password_hash($pw, PASSWORD_BCRYPT, ['cost' => 12])`.
- **Environment config** via `.env` file (phpdotenv) — never hardcode credentials.

## Deployment

**Target:** SiteGround shared hosting (cPanel, Apache, MySQL)
- Frontend: `npm run build` → upload `dist/` contents to `public_html/`
- API: upload `api/` directory (with `vendor/` from `composer install`)
- `.htaccess` in `public_html/` rewrites SPA routes to `index.html`
- `.htaccess` in `api/` rewrites API routes to `index.php`
- Same-origin deployment: no CORS configuration needed

## Documentation

- **PRD:** `/Users/dorenberge/WorkInProgress/UI-Projects-Vault/Projects/JamWork-v2/Specs/JW-Spec-01_LAMP-Replatform-PRD.md`
- **CC Prompts:** `/Users/dorenberge/WorkInProgress/VIBE/JamWork_v2/docs/cc-prompts/`
- **Session Handoffs:** `/Users/dorenberge/WorkInProgress/UI-Projects-Vault/Projects/JamWork-v2/Sessions/`
