# JW-CC13 — Stale Filter Reactivity Fix

## Context

When a user has filters active on the task list (e.g., Status = "In Progress") and changes a task's status or priority via inline edit, the task remains visible in the list even though it no longer matches the active filter. The same issue affects sort order — if sorted by priority and you change a task's priority, it stays in its original position.

**Root cause:** `handleInlineEdit` in `client/src/components/task-list.tsx` performs an optimistic local state update (`setTasks`) after a successful API call but does not re-fetch the task list from the server. The server applies filters and sort order; the local state update bypasses that.

**Scope:** `client/src/components/task-list.tsx` — one file, one function, one new helper.

## Requirements

### 1. Add a silent re-fetch helper

Create a `refetchTasks` function that mirrors the existing `fetchTasks` but does **not** set `setLoading(true)`. This prevents skeleton loaders from flashing on every inline edit while still getting the correctly filtered and sorted list from the server.

```
const refetchTasks = async () => {
  try {
    const params = new URLSearchParams();
    // ... same param-building logic as fetchTasks ...

    const data = await apiGet<{ tasks: Task[] }>(`/tasks?${params.toString()}`);
    setTasks(data.tasks);
  } catch (err) {
    console.error('Failed to fetch tasks:', err);
  }
};
```

**Important:** Do NOT duplicate the param-building logic. Refactor `fetchTasks` to accept an optional `{ silent?: boolean }` parameter instead:

```typescript
const fetchTasks = async (options?: { silent?: boolean }) => {
  try {
    if (!options?.silent) {
      setLoading(true);
    }

    // ... existing param-building and fetch logic (unchanged) ...

  } catch (err) {
    console.error('Failed to fetch tasks:', err);
  } finally {
    if (!options?.silent) {
      setLoading(false);
    }
  }
};
```

### 2. Update `handleInlineEdit` success path

In the `handleInlineEdit` function, after a successful API call:

**Current behavior (REPLACE THIS):**
```typescript
} else {
  // Update local state optimistically
  setTasks((prev) =>
    prev.map((task) =>
      task.id === taskId ? { ...task, [field]: value } : task
    )
  );
}
```

**New behavior:**
```typescript
} else {
  // Optimistic update for instant visual feedback
  setTasks((prev) =>
    prev.map((task) =>
      task.id === taskId ? { ...task, [field]: value } : task
    )
  );
  // Silent re-fetch to re-apply server-side filters and sort order
  await fetchTasks({ silent: true });
}
```

Keep the optimistic `setTasks` call — it gives the user instant visual feedback (the dropdown updates immediately). The silent `fetchTasks` then corrects the list by removing tasks that no longer match filters and re-sorting.

### 3. Update `handleRefresh` to use non-silent fetch

`handleRefresh` currently calls `fetchTasks()` directly. No change needed — calling `fetchTasks()` without arguments defaults to `silent: false`, preserving current behavior.

### 4. Verify all other `fetchTasks()` call sites are unaffected

There are several other places that call `fetchTasks()`:
- The `useEffect` on mount/filter change (line ~90) — should remain non-silent (shows loading skeleton on initial load and filter changes). No change needed.
- `handleInlineEdit` error path (line ~295) — should remain non-silent (full revert). No change needed.
- `handleListDragEnd` error path (line ~312) — should remain non-silent. No change needed.
- `handleInlineEdit` recurring task clone path (line ~269) — already calls `await fetchTasks()`. This should also be silent since it's mid-interaction. **Change this to `await fetchTasks({ silent: true })`.**

## Verification Checklist

Run the dev server and test each scenario:

### Filter reactivity
- [ ] Set Status filter to "In Progress". Change a task's status from "In Progress" to "Done" via inline dropdown. **Expected:** Task disappears from the list after a brief moment (optimistic update shows "Done", then silent re-fetch removes it).
- [ ] Set Priority filter to "High". Change a task's priority from "High" to "Low" via inline dropdown. **Expected:** Task disappears from the list.
- [ ] With no filters active, change a task's status. **Expected:** Task stays in the list with updated status (no filter to evict it).

### Sort reactivity
- [ ] Set Sort to "Priority" (desc). Change a task's priority from "Urgent" to "Low". **Expected:** Task repositions in the list after silent re-fetch.

### No regressions
- [ ] Initial page load still shows skeleton loaders.
- [ ] Changing filters via the filter bar still shows skeleton loaders.
- [ ] Inline edit still shows the green checkmark save indicator.
- [ ] Inline edit on error still reverts (test by stopping the API server mid-edit if possible).
- [ ] Drag-and-drop reorder still works.
- [ ] Recurring task marked as done still refreshes properly.

## Files Modified

- `client/src/components/task-list.tsx`

## Commit Message

```
fix: re-fetch task list after inline edit to respect active filters

After an inline status or priority change, the task list now silently
re-fetches from the server to re-apply filters and sort order. The
optimistic local state update is preserved for instant visual feedback.

Fixes stale filter display where edited tasks remained visible despite
no longer matching the active filter criteria.
```
