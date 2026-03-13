# JW-CC01 — Frontend Scaffold Bugfixes

**Date:** 2026-03-13
**Scope:** Fix three bugs in the frontend scaffold before Phase 3 begins
**Codebase:** `/Users/dorenberge/WorkInProgress/VIBE/JamWork_v2/client/`
**Risk:** Low — structural wiring fixes, no visual or behavioral changes

---

## Context

The Vite + React SPA scaffold is nearly complete, but has three bugs that will cause runtime errors or broken navigation. These must be fixed before any further development.

---

## Bug 1: ThemeProvider not in component tree

**Problem:** `src/hooks/use-theme.tsx` exports a `ThemeProvider` context provider, but it is never rendered in the component tree. `src/pages/protected-layout.tsx` calls `useTheme()`, which will throw: *"useTheme must be used within a ThemeProvider"*.

**File:** `src/main.tsx`

**Current code:**
```tsx
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

**Required change:** Wrap `RouterProvider` in `ThemeProvider` so all routes have access to theme context.

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { router } from './router';
import { ThemeProvider } from './hooks/use-theme';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  </React.StrictMode>
);
```

**Verification:** Run `npm run dev`. Navigate to any protected route (e.g., `/my-tasks`). The app should render without a "useTheme must be used within a ThemeProvider" error in the console. Dark mode toggle in the header should work.

---

## Bug 2: Admin page uses `href` instead of `to` on Link

**Problem:** In `src/pages/admin.tsx`, the "Back to Dashboard" link uses `<Link href="/my-tasks">` instead of `<Link to="/my-tasks">`. React Router's `Link` component uses the `to` prop — `href` is ignored, resulting in a non-functional link.

**File:** `src/pages/admin.tsx`

**Find this exact code:**
```tsx
          <Link
            href="/my-tasks"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6"
          >
```

**Replace with:**
```tsx
          <Link
            to="/my-tasks"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6"
          >
```

**Verification:** Navigate to `/admin`. The "Back to Dashboard" link should navigate to `/my-tasks` when clicked.

---

## Bug 3: Missing `apiPatch` export in API client

**Problem:** `src/lib/api.ts` exports `apiGet`, `apiPost`, `apiPut`, and `apiDelete`, but does not export `apiPatch`. The PRD specifies a `PATCH /tasks/bulk` endpoint for per-task bulk updates. No component currently imports `apiPatch`, so this is not a build error yet — but it will be needed when that endpoint is wired up.

**File:** `src/lib/api.ts`

**Required change:** Add an `apiPatch` function after the existing `apiPut` function, following the same pattern.

Add this function after the `apiPut` export:

```typescript
export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: 'PATCH',
    body: body ? JSON.stringify(body) : undefined,
  });
}
```

**Verification:** Run `npx tsc --noEmit` from the `client/` directory. No new type errors should appear. Confirm the export exists by checking that `apiPatch` appears in the file alongside the other exports.

---

## Also: Remove redundant AuthGuard wrapper in admin.tsx

**Problem:** `src/pages/admin.tsx` wraps its return JSX in `<AuthGuard>...</AuthGuard>`, but the `/admin` route in `router.tsx` is already a child of the protected layout route which applies `AuthGuard` at the layout level. The inner `AuthGuard` is redundant — it works, but adds an unnecessary auth check and loading spinner.

**File:** `src/pages/admin.tsx`

**Find this code** (the opening of the main return block, after the "Access Denied" early return):
```tsx
  return (
    <AuthGuard>
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-4xl mx-auto">
```

**Replace with:**
```tsx
  return (
    <>
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-4xl mx-auto">
```

**And find the closing** `</AuthGuard>` tag at the very end of the component's return. The return currently ends:
```tsx
    </AuthGuard>
  );
```

**Replace with:**
```tsx
    </>
  );
```

The `</AuthGuard>` wraps everything including the dialog components (Transfer Admin, Reset Password, Edit User, Delete User dialogs). Replace the `<AuthGuard>` open tag with `<>` and `</AuthGuard>` close tag with `</>`, keeping everything else intact.

Also remove the unused `AuthGuard` import from the top of the file:
```tsx
import { AuthGuard } from '@/components/auth-guard';  // DELETE THIS LINE
```

**Verification:** Navigate to `/admin` while logged in. Page should render identically. No double loading spinner on initial load.

---

## Commit

After all changes, run:
1. `cd client && npx tsc --noEmit` — confirm no type errors
2. `npm run dev` — confirm app boots, login page renders, no console errors
3. Commit with message: `fix: frontend scaffold bugfixes (ThemeProvider, Link prop, apiPatch, AuthGuard cleanup)`
