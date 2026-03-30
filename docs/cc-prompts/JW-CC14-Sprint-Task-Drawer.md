# JW-CC14 — Sprint View Task Drawer Access

## Context

On the project list view, all-tasks view, and my-tasks view, clicking a task row opens the `TaskDrawer` for full editing. On the sprint page (`client/src/pages/sprints.tsx`), task rows in both **sprint task lists** and the **backlog** are not clickable — users can see task details but cannot open the drawer to edit them. This is a noticeable interaction inconsistency.

The `TaskDrawer` component is already imported and used on this page in "create" mode (via "Add task" buttons). This change adds "edit" mode access by making task rows clickable.

**Scope:** `client/src/pages/sprints.tsx` — one file.

## Requirements

### 1. Add edit-task drawer state

Add state to track the task being edited. Place alongside the existing `showTaskDrawer` / `drawerSprintId` state:

```typescript
// Task edit drawer state
const [editingTask, setEditingTask] = useState<Task | null>(null);
```

### 2. Make sprint task rows clickable

In the expanded sprint section, each task is rendered inside a `<div>` with class `flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/50 transition-colors`.

Add an `onClick` handler and cursor to this div:

```tsx
<div
  key={task.id}
  className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/50 transition-colors cursor-pointer"
  onClick={() => setEditingTask(task)}
>
```

**Important:** The "Move to..." `<Select>` dropdown inside each row must NOT trigger the drawer. The existing `<Select>` already handles its own events — but to be safe, wrap the Select's parent or add `onClick={(e) => e.stopPropagation()}` to the Select's container `<div>` if one doesn't already exist. Check both the active sprint task rows and the completed sprint task rows.

The pattern to follow: wrap the `<Select>` for sprint-move in a click-stopping container:

```tsx
<div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
  <Select ...>
    ...
  </Select>
</div>
```

Apply this to:
- Active sprint task rows (the "Move to..." Select)
- Completed sprint task rows (the "Move to..." Select)

### 3. Make backlog task rows clickable

In the backlog section, each task is rendered inside a `<div>` with class `group flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/50 transition-colors`.

Add an `onClick` handler and cursor:

```tsx
<div
  key={task.id}
  className="group flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/50 transition-colors cursor-pointer"
  onClick={() => setEditingTask(task)}
>
```

**Important:** Two interactive elements in backlog rows must NOT trigger the drawer:
1. The `<Checkbox>` — already has `onClick={(e) => e.stopPropagation()}` ✅
2. The "Assign sprint..." `<Select>` — already wrapped in a `<div className="flex-shrink-0">` but that div does NOT have `onClick stopPropagation`. **Add it:**

```tsx
<div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
  <Select ...>
    ...
  </Select>
</div>
```

### 4. Add edit-mode TaskDrawer rendering

At the bottom of the component's JSX return (near the existing create-mode `TaskDrawer`), add:

```tsx
{/* Task Edit Drawer */}
{editingTask && (
  <TaskDrawer
    mode="edit"
    task={editingTask}
    onSave={() => {
      setEditingTask(null);
      fetchAllData();
      window.dispatchEvent(new Event('sprints-updated'));
    }}
    onClose={() => {
      setEditingTask(null);
      fetchAllData();
    }}
  />
)}
```

Note: `fetchAllData()` is called on both save and close (matching the pattern used by the create-mode drawer on this page). This ensures any edits to sprint assignment, status, or other fields are reflected in both the sprint lists and backlog. The `sprints-updated` event triggers sidebar badge updates.

### 5. No changes to bulk selection interaction

When checkboxes are visible in the backlog (i.e., `selectedTaskIds.size > 0`), clicking a row should still open the drawer — the checkbox has its own `stopPropagation`. This matches the task-list behavior where clicking a row opens the drawer unless you click the checkbox itself.

However, if you want to match the task-list pattern exactly (where clicking a row toggles the checkbox when selection mode is active), that would be a larger change to the backlog row handler. **For this prompt, keep it simple: row click always opens the drawer. Checkbox click toggles selection.** The `stopPropagation` on the checkbox prevents double-firing.

## Verification Checklist

### Sprint task rows
- [ ] Click a task in an expanded active sprint. **Expected:** TaskDrawer opens in edit mode showing the task's full details.
- [ ] Edit a field (e.g., status, priority) in the drawer and save. **Expected:** Drawer closes, sprint view refreshes, change is visible.
- [ ] Change a task's sprint assignment via the drawer. **Expected:** Task moves to the correct sprint or backlog after refresh.
- [ ] Click the "Move to..." dropdown on a sprint task row. **Expected:** Dropdown opens without also opening the drawer.
- [ ] Click a task in a completed sprint. **Expected:** Drawer opens in edit mode.

### Backlog task rows
- [ ] Click a task in the backlog. **Expected:** TaskDrawer opens in edit mode.
- [ ] Edit and save from the backlog. **Expected:** Backlog refreshes with updated data.
- [ ] Click the "Assign sprint..." dropdown on a backlog row. **Expected:** Dropdown opens without also opening the drawer.
- [ ] Click the checkbox on a backlog row. **Expected:** Checkbox toggles without opening the drawer.
- [ ] With tasks selected via checkboxes, click a different task's title area. **Expected:** Drawer opens (selection remains).

### No regressions
- [ ] "Add task" buttons still open TaskDrawer in create mode.
- [ ] Bulk actions in backlog (assign to sprint, set priority, assign to person) still work.
- [ ] Sprint create/edit dialogs still work.
- [ ] Moving tasks between sprints via the "Move to..." dropdown still works with toast confirmation.

## Files Modified

- `client/src/pages/sprints.tsx`

## Commit Message

```
feat: add task drawer access from sprint view

Task rows in sprint lists and backlog are now clickable to open the
TaskDrawer in edit mode. Previously, tasks on the sprint page could
only be moved between sprints but not edited inline.

Adds stopPropagation to sprint-move dropdowns to prevent drawer
from opening when using the move controls.
```
