# JW-CC01 — Fork Codebase and Scaffold Vite + PHP Project

## Objective

Create the JamWork v2 project structure by forking the frontend from the existing v1 codebase and scaffolding a new Vite + React Router SPA alongside a PHP API directory. The v1 codebase is the source of truth for all frontend assets. The backend is scaffolded empty (PHP implementation comes later).

## Critical Rules

- **READ-ONLY reference:** `/Users/dorenberge/WorkInProgress/VIBE/JamWork/` — COPY files from here. NEVER modify anything in this directory.
- **Write target:** `/Users/dorenberge/WorkInProgress/VIBE/JamWork_v2/` — ALL new files go here.
- **Verify before writing:** If unsure whether a path targets v1 or v2, STOP and confirm.

## Step 1: Initialize Vite Project

In `/Users/dorenberge/WorkInProgress/VIBE/JamWork_v2/client/`:

```bash
npm create vite@latest . -- --template react-ts
```

Then install dependencies to match v1's frontend stack:

```bash
npm install react@19 react-dom@19 react-router@7
npm install @hello-pangea/dnd @radix-ui/react-dropdown-menu class-variance-authority clsx lucide-react radix-ui sonner tailwind-merge
npm install -D tailwindcss@4 @tailwindcss/vite typescript @types/react @types/react-dom eslint prettier tw-animate-css
```

**Important:** Do NOT install `next`, `eslint-config-next`, or any Next.js packages.

After install, verify `package.json` contains React 19 and no Next.js references.

## Step 2: Configure Vite

Create/update `vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
```

Update `tsconfig.json` to include the path alias:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"]
}
```

## Step 3: Copy Frontend Assets from v1

Copy these directories and files **verbatim** from v1 to v2. Preserve directory structure.

### Components (copy entire directory)
```
FROM: /Users/dorenberge/WorkInProgress/VIBE/JamWork/client/src/components/
TO:   /Users/dorenberge/WorkInProgress/VIBE/JamWork_v2/client/src/components/
```

Copy ALL files including the `ui/` subdirectory. Every file.

### Hooks (copy entire directory)
```
FROM: /Users/dorenberge/WorkInProgress/VIBE/JamWork/client/src/hooks/
TO:   /Users/dorenberge/WorkInProgress/VIBE/JamWork_v2/client/src/hooks/
```

### Lib (copy entire directory)
```
FROM: /Users/dorenberge/WorkInProgress/VIBE/JamWork/client/src/lib/
TO:   /Users/dorenberge/WorkInProgress/VIBE/JamWork_v2/client/src/lib/
```

### Types (copy entire directory)
```
FROM: /Users/dorenberge/WorkInProgress/VIBE/JamWork/client/src/types/
TO:   /Users/dorenberge/WorkInProgress/VIBE/JamWork_v2/client/src/types/
```

### Global CSS
```
FROM: /Users/dorenberge/WorkInProgress/VIBE/JamWork/client/src/app/globals.css
TO:   /Users/dorenberge/WorkInProgress/VIBE/JamWork_v2/client/src/styles/globals.css
```

### Shadcn Config
```
FROM: /Users/dorenberge/WorkInProgress/VIBE/JamWork/client/components.json
TO:   /Users/dorenberge/WorkInProgress/VIBE/JamWork_v2/client/components.json
```

Update the `components.json` paths if they reference `@/` — they should point to `src/` which is the same convention.

### Public Assets
```
FROM: /Users/dorenberge/WorkInProgress/VIBE/JamWork/client/public/
TO:   /Users/dorenberge/WorkInProgress/VIBE/JamWork_v2/client/public/
```

## Step 4: Adapt Copied Files for Vite + React Router

The following files need targeted edits after copying. Do NOT rewrite them — make the minimum changes required.

### 4a. `src/lib/api.ts`

Change the API URL base:

```typescript
// BEFORE (v1):
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// AFTER (v2):
const API_URL = import.meta.env.VITE_API_URL || '/api';
```

Everything else in this file stays identical.

### 4b. `src/hooks/use-auth.tsx`

Replace Next.js routing imports with React Router:

```typescript
// BEFORE:
import { useRouter } from 'next/navigation';
// AFTER:
import { useNavigate } from 'react-router';

// BEFORE:
const router = useRouter();
// AFTER:
const navigate = useNavigate();

// BEFORE:
router.push('/login');
// AFTER:
navigate('/login');

// BEFORE:
router.replace('/login');
// AFTER:
navigate('/login', { replace: true });
```

### 4c. `src/hooks/use-filter-params.ts`

Replace Next.js searchParams with React Router:

```typescript
// BEFORE:
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
// AFTER:
import { useSearchParams } from 'react-router';
```

Adapt the implementation to use React Router's `useSearchParams` which returns `[searchParams, setSearchParams]`. The getter API is the same (`searchParams.get()`), but the setter is different — use `setSearchParams()` instead of `router.replace()`.

### 4d. `src/components/sidebar.tsx`

Replace Next.js Link and navigation:

```typescript
// BEFORE:
import Link from 'next/link';
import { usePathname } from 'next/navigation';
// AFTER:
import { Link, NavLink, useLocation } from 'react-router';

// Replace usePathname() with useLocation().pathname
// Replace <Link href="..."> with <Link to="...">
// Optionally use <NavLink> for active state styling
```

### 4e. `src/components/auth-guard.tsx`

Replace Next.js routing:

```typescript
// BEFORE:
import { useRouter } from 'next/navigation';
// AFTER:
import { useNavigate, useLocation } from 'react-router';

// Adapt redirect logic to use navigate()
```

### 4f. Any other component using Next.js imports

Search all copied files for these imports and replace:
- `next/link` → `react-router` Link
- `next/navigation` → `react-router` hooks
- `next/image` → standard `<img>` tag (or install a Vite image optimization plugin later)
- `next/font` → manual font loading in `index.html` or CSS

Run this search after copying:
```bash
grep -r "from 'next/" src/ --include="*.tsx" --include="*.ts"
grep -r "from \"next/" src/ --include="*.tsx" --include="*.ts"
```

Fix every result.

## Step 5: Create Router Configuration

Create `src/router.tsx`:

```typescript
import { createBrowserRouter } from 'react-router';
import App from './App';
// Import page components (extract from v1 app/ directory)

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/signup',
    element: <SignupPage />,
  },
  {
    path: '/reset-password',
    element: <ResetPasswordPage />,
  },
  {
    path: '/',
    element: <AuthGuard><ProtectedLayout /></AuthGuard>,
    children: [
      { index: true, element: <RootRedirect /> },
      { path: 'projects/:id', element: <ProjectPage /> },
      { path: 'all-tasks', element: <AllTasksPage /> },
      { path: 'my-tasks', element: <MyTasksPage /> },
      { path: 'sprints', element: <SprintsPage /> },
      { path: 'timeline', element: <TimelinePage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'admin', element: <AdminPage /> },
    ],
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
]);
```

**Note:** The page components need to be extracted from the v1 `app/` directory pages. Each `page.tsx` in v1 becomes a standalone component in `src/pages/`. The `layout.tsx` from `(protected)/` becomes the `ProtectedLayout` component wrapping the sidebar and header.

## Step 6: Create Entry Points

### `src/main.tsx`
```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { router } from './router';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
```

### `index.html` (in client root)
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>JamWork</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

## Step 7: Scaffold PHP API Directory

Create the directory structure (empty files with header comments):

```
/Users/dorenberge/WorkInProgress/VIBE/JamWork_v2/api/
├── index.php                    # "<?php // API entry point — Phase 3"
├── .htaccess                    # Apache rewrite rules (populate now)
├── .env.example                 # Template with required vars
├── composer.json                # Dependency manifest (populate now)
├── src/
│   ├── Routes/                  # Empty directory
│   ├── Middleware/               # Empty directory
│   ├── Models/                  # Empty directory
│   ├── Lib/                     # Empty directory
│   └── Mail/
│       └── templates/           # Empty directory
└── migrations/
    └── 001_initial_schema.sql   # Empty file — schema comes in Phase 3
```

### `.htaccess` for API:
```apache
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^ index.php [QSA,L]
```

### `.env.example`:
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

APP_URL=https://tasks.yourdomain.com
APP_ENV=production
```

### `composer.json`:
```json
{
  "name": "jamwork/api",
  "description": "JamWork v2 PHP REST API",
  "require": {
    "php": ">=8.2",
    "slim/slim": "^4.0",
    "slim/psr7": "^1.6",
    "firebase/php-jwt": "^6.0",
    "phpmailer/phpmailer": "^6.0",
    "vlucas/phpdotenv": "^5.0",
    "ramsey/uuid": "^4.0"
  },
  "autoload": {
    "psr-4": {
      "JamWork\\": "src/"
    }
  }
}
```

## Step 8: Create docs Directory

```
/Users/dorenberge/WorkInProgress/VIBE/JamWork_v2/docs/
└── cc-prompts/
    └── (this file will be placed here)
```

## Step 9: Verify

After all steps, run:

```bash
cd /Users/dorenberge/WorkInProgress/VIBE/JamWork_v2/client
npm run dev
```

The dev server should start. The app won't be functional (no API), but:
- [ ] Vite dev server starts without build errors
- [ ] No `next/` imports remain in any file
- [ ] Tailwind CSS processes `globals.css` without errors
- [ ] Router renders the login page at `http://localhost:3000/login`
- [ ] No TypeScript compilation errors (or only errors related to missing API responses)

Also verify:
```bash
grep -r "from 'next/" src/ --include="*.tsx" --include="*.ts"
grep -r "from \"next/" src/ --include="*.tsx" --include="*.ts"
```

Both should return zero results.

## What This Prompt Does NOT Do

- Does NOT implement the PHP API (that's Phase 3-4)
- Does NOT create the MySQL schema (that's Phase 3)
- Does NOT run `composer install` (no PHP work yet)
- Does NOT fully extract page components from v1's `app/` directory — that requires reviewing each `page.tsx` and `layout.tsx` to create standalone components. Flag which pages need extraction and create placeholder components if the actual extraction is complex.

## Decision Log

| Decision | Rationale |
|---|---|
| Vite over CRA/Webpack | Faster dev server, modern defaults, simpler config |
| React Router 7 | Current stable, framework-agnostic routing for SPAs |
| Same-origin API at `/api` | Eliminates CORS, simplifies cookies, simpler deployment |
| Google Fonts for Manrope | Simplest initial approach; can self-host later |
| Slim 4 scaffolded | Lightweight PHP framework; final decision in Phase 3 |
| Proxy in vite.config.ts | Local dev routes `/api` to PHP dev server |
